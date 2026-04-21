import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactDOM from 'react-dom';
import '@styles/LayerMenu.css';
import { LayerData } from '@hooks/map';
import { AVAILABLE_LAYERS, LayerConfig } from '@config/layers';
import { config } from '@config/env';
import AttributeTable from './AttributeTable';
import { fileToGeoJSON, VECTOR_ACCEPT } from '@utils/geo/fileToGeoJSON';
import { loadGeoTIFF } from '@utils/geo/georasterLoader';
import { useApiLayersLoader } from '@hooks/api';
import {
    SymbologyStyle, SymbologyMode, GeomType, DEFAULT_SYMBOLOGY,
    detectGeomType, extractFields, autoCategorize,
    classifyFeatures, getRampGradientCSS, RAMP_NAMES,
} from '@utils/geo/symbologyUtils';


// ─── Props ───────────────────────────────────────────────────────────────────

interface LayerMenuProps {
    layers: Record<string, LayerData | any>;
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
    onLayerToggle: (id: string, isActive: boolean, type: 'vector' | 'raster') => void;
    onOpacityChange: (id: string, opacity: number, type: 'vector' | 'raster') => void;
    externalLayers: ExternalLayer[];
    externalVisible: Record<string, boolean>;
    externalOpacity: Record<string, number>;
    onAddExternalLayer: (layer: ExternalLayer) => void;
    onRemoveExternalLayer: (id: string) => void;
    onToggleExternalLayer: (id: string, visible: boolean) => void;
    onExternalOpacityChange: (id: string, opacity: number) => void;
}

// ─── Tipos capas externas ─────────────────────────────────────────────────────

export type AddLayerType = 'vector' | 'raster' | 'ogc';

export interface ExternalLayer {
    id: string;
    name: string;
    type: 'vector' | 'raster' | 'wms' | 'wfs';
    url: string;
    layerName?: string;
    file?: File;
    geojsonData?: GeoJSON.FeatureCollection;
    georasterData?: unknown;
    georasterBounds?: [[number, number], [number, number]];
    symbology?: SymbologyStyle;
}

// ─── Descarga ─────────────────────────────────────────────────────────────────

interface DownloadFormat { label: string; ext: string; icon: string; outputFormat: string; description: string; color: string; }

const VECTOR_FORMATS: DownloadFormat[] = [
    { label: 'Shapefile', ext: 'shp.zip', icon: '\uD83D\uDDC2\uFE0F', outputFormat: 'SHAPE-ZIP',                            description: 'Compatible con ArcGIS, QGIS', color: '#e67e22' },
    { label: 'GeoJSON',   ext: 'geojson', icon: '{ }',               outputFormat: 'application/json',                     description: 'Ideal para web y código',      color: '#27ae60' },
    { label: 'KML',       ext: 'kml',     icon: '\uD83C\uDF0D',       outputFormat: 'application/vnd.google-earth.kml+xml', description: 'Google Earth / Maps',          color: '#2980b9' },
];
const RASTER_FORMATS = [{ label: 'GeoTIFF', ext: 'tif', icon: '\uD83D\uDDFA\uFE0F', description: 'GeoTIFF con georeferenciación (WCS)', color: '#c0392b' }];

// ─── URLs ─────────────────────────────────────────────────────────────────────

const getVectorDownloadUrl = (layer: LayerConfig, outputFormat: string): string => {
    const wfsName = (layer as any).wfsName ?? layer.id;
    const url = new URL(config.qgisServer.wfsUrl);
    url.searchParams.set('SERVICE',      'WFS');
    url.searchParams.set('VERSION',      '1.1.0');
    url.searchParams.set('REQUEST',      'GetFeature');
    url.searchParams.set('TYPENAME',     wfsName);
    url.searchParams.set('outputFormat', outputFormat);
    return url.toString();
};

const getRasterDownloadUrl = (layer: LayerConfig): string => {
    const url = new URL(config.qgisServer.wmsRasterUrl);
    url.searchParams.set('SERVICE', 'WMS');
    url.searchParams.set('VERSION', '1.3.0');
    url.searchParams.set('REQUEST', 'GetMap');
    url.searchParams.set('LAYERS',  layer.wmsLayer ?? layer.id);
    url.searchParams.set('CRS',     'EPSG:4326');
    url.searchParams.set('BBOX',    '14.532,-118.454,32.718,-86.710');
    url.searchParams.set('WIDTH',   '4096');
    url.searchParams.set('HEIGHT',  '3072');
    url.searchParams.set('FORMAT',  'image/tiff');
    if (layer.timeValue) url.searchParams.set('TIME', layer.timeValue);
    return url.toString();
};

/** Devuelve { baseUrl, capabilitiesUrl, layerName } para el modal de servicio */
const getServiceInfo = (layer: LayerConfig, type: 'wfs' | 'wms') => {
    const wfsName  = (layer as any).wfsName  ?? layer.id;
    const wmsLayer = (layer as any).wmsLayer ?? layer.id;

    if (type === 'wfs') {
        const base = new URL(config.qgisServer.wfsUrl);
        base.searchParams.set('SERVICE', 'WFS');
        base.searchParams.set('VERSION', '2.0.0');
        base.searchParams.set('REQUEST', 'GetCapabilities');
        const full = new URL(config.qgisServer.wfsUrl);
        full.searchParams.set('SERVICE',  'WFS');
        full.searchParams.set('VERSION',  '2.0.0');
        full.searchParams.set('REQUEST',  'GetFeature');
        full.searchParams.set('TYPENAME', wfsName);
        return {
            type: 'WFS' as const,
            connectionUrl:    config.qgisServer.wfsUrl,
            capabilitiesUrl:  base.toString(),
            getFeatureUrl:    full.toString(),
            layerName:        wfsName,
        };
    } else {
        const base = new URL(config.qgisServer.wmsUrl);
        base.searchParams.set('SERVICE', 'WMS');
        base.searchParams.set('VERSION', '1.3.0');
        base.searchParams.set('REQUEST', 'GetCapabilities');
        return {
            type: 'WMS' as const,
            connectionUrl:   config.qgisServer.wmsUrl,
            capabilitiesUrl: base.toString(),
            getFeatureUrl:   '',
            layerName:       wmsLayer,
        };
    }
};

// ─── Descarga programática (fetch → blob) ────────────────────────────────────

async function downloadVectorFormat(layer: LayerConfig, fmt: DownloadFormat): Promise<void> {
    const url = getVectorDownloadUrl(layer, fmt.outputFormat);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
            href:     blobUrl,
            download: `${layer.id}.${fmt.ext}`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (e) {
        console.error(`Error descargando ${fmt.label}:`, e);
    }
}

// ─── Modal Servicio OGC ───────────────────────────────────────────────────────

interface ServiceModalProps {
    info: ReturnType<typeof getServiceInfo>;
    layerName: string;
    onClose: () => void;
}

const ServiceModal: React.FC<ServiceModalProps> = ({ info, layerName, onClose }) => {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        } catch {
            /* fallback: execCommand */
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            setCopied(key);
            setTimeout(() => setCopied(null), 2000);
        }
    };

    const CopyBtn: React.FC<{ text: string; id: string }> = ({ text, id }) => (
        <button
            className={`svc-copy-btn ${copied === id ? 'copied' : ''}`}
            onClick={() => copy(text, id)}
            title="Copiar"
        >
            {copied === id
                ? <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg> Copiado</>
                : <><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5H3.5A1.5 1.5 0 0 0 2 3h12a1.5 1.5 0 0 0-1.5-1.5H11A1.5 1.5 0 0 0 9.5 0h-3z"/></svg> Copiar</>
            }
        </button>
    );

    const rows: Array<{ label: string; value: string; id: string; mono?: boolean }> = [
        {
            label: 'URL de conexión (pegar en QGIS / ArcGIS)',
            value: info.connectionUrl,
            id:    'conn',
        },
        {
            label: `Nombre de capa / ${info.type === 'WFS' ? 'TypeName' : 'LAYER'}`,
            value: info.layerName,
            id:    'lyr',
            mono:  true,
        },
        {
            label: 'URL GetCapabilities',
            value: info.capabilitiesUrl,
            id:    'caps',
        },
        ...(info.type === 'WFS' && info.getFeatureUrl ? [{
            label: 'URL GetFeature completa',
            value: info.getFeatureUrl,
            id:    'feat',
        }] : []),
    ];

    const modal = (
        <div className="svc-overlay" onClick={onClose}>
            <div className="svc-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="svc-header">
                    <div className="svc-header-left">
                        <span className={`svc-badge svc-badge-${info.type.toLowerCase()}`}>{info.type}</span>
                        <div>
                            <div className="svc-title">Consumir como servicio {info.type}</div>
                            <div className="svc-subtitle">{layerName}</div>
                        </div>
                    </div>
                    <button className="svc-close" onClick={onClose} title="Cerrar">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
                        </svg>
                    </button>
                </div>

                {/* Instrucciones */}
                <div className="svc-instructions">
                    {info.type === 'WFS'
                        ? 'En QGIS: Capa → Agregar capa → WFS. En ArcGIS Pro: Insert → Connections → New WFS Server.'
                        : 'En QGIS: Capa → Agregar capa → WMS/WMTS. En ArcGIS Pro: Insert → Connections → New WMS Server.'
                    }
                </div>

                {/* Filas de URL */}
                <div className="svc-rows">
                    {rows.map(row => (
                        <div key={row.id} className="svc-row">
                            <span className="svc-row-label">{row.label}</span>
                            <div className="svc-row-value">
                                <input
                                    readOnly
                                    className={`svc-url-input${row.mono ? ' svc-url-mono' : ''}`}
                                    value={row.value}
                                    onFocus={e => e.target.select()}
                                />
                                <CopyBtn text={row.value} id={row.id} />
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="svc-footer">
                    <button
                        className="svc-copy-all-btn"
                        onClick={() => copy(rows.map(r => `${r.label}:\n${r.value}`).join('\n\n'), 'all')}
                    >
                        {copied === 'all'
                            ? <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/></svg> Todo copiado</>
                            : <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5H3.5A1.5 1.5 0 0 0 2 3h12a1.5 1.5 0 0 0-1.5-1.5H11A1.5 1.5 0 0 0 9.5 0h-3z"/></svg> Copiar todo</>
                        }
                    </button>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modal, document.body);
};

// ─── DownloadDropdown ─────────────────────────────────────────────────────────

const DownloadDropdown: React.FC<{ layer: LayerConfig }> = ({ layer }) => {
    const [open, setOpen]               = useState(false);
    const [menuStyle, setMenuStyle]     = useState<React.CSSProperties>({});
    const [serviceModal, setServiceModal] = useState<ReturnType<typeof getServiceInfo> | null>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const openMenu = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const mw = 245;
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            // Clampar horizontalmente para no salir del viewport
            const left = Math.max(8, Math.min(rect.right - mw, vw - mw - 8));
            // Si no hay espacio abajo, abrir hacia arriba
            const spaceBelow = vh - rect.bottom;
            const menuH = Math.min(320, vh * 0.55);
            const top = spaceBelow < menuH
                ? rect.top - menuH - 6 + window.scrollY
                : rect.bottom + 6 + window.scrollY;
            setMenuStyle({
                position: 'absolute',
                top,
                left,
                width: Math.min(mw, vw - 16),
                zIndex: 99999,
            });
        }
        setOpen(o => !o);
    };

    useEffect(() => {
        if (!open) return;
        const close  = (e: MouseEvent) => { if (!triggerRef.current?.contains(e.target as Node)) setOpen(false); };
        const scroll = () => setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('scroll', scroll, true);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('scroll', scroll, true);
        };
    }, [open]);

    const openService = (type: 'wfs' | 'wms') => {
        setOpen(false);
        setServiceModal(getServiceInfo(layer, type));
    };

    const [downloading, setDownloading] = useState<string | null>(null);

    const handleDownload = async (fmt: DownloadFormat) => {
        setOpen(false);
        setDownloading(fmt.ext);
        await downloadVectorFormat(layer, fmt);
        setDownloading(null);
    };

    const menu = (
        <div className="dl-menu" style={menuStyle} onMouseDown={e => e.stopPropagation()}>
            {/* ── Sección descargas ── */}
            <div className="dl-menu-header">Descargar como</div>
            {layer.type === 'vector'
                ? VECTOR_FORMATS.map(fmt => (
                    <button key={fmt.ext} className="dl-item dl-item-btn" onClick={() => handleDownload(fmt)}>
                        <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>{fmt.icon}</span>
                        <span className="dl-item-info">
                            <span className="dl-item-label">{fmt.label}</span>
                            <span className="dl-item-desc">{fmt.description}</span>
                        </span>
                        <span className="dl-item-ext">.{fmt.ext.replace('.zip', '')}</span>
                    </button>
                ))
                : RASTER_FORMATS.map(fmt => (
                    <a key={fmt.ext} href={getRasterDownloadUrl(layer)} className="dl-item"
                        target="_blank" rel="noopener noreferrer"
                        download={`${layer.id}.${fmt.ext}`}
                        onClick={() => setOpen(false)}>
                        <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>{fmt.icon}</span>
                        <span className="dl-item-info">
                            <span className="dl-item-label">{fmt.label}</span>
                            <span className="dl-item-desc">{fmt.description}</span>
                        </span>
                        <span className="dl-item-ext">.{fmt.ext}</span>
                    </a>
                ))
            }

            {/* ── Sección servicios ── */}
            <div className="dl-menu-section">Consumir como servicio</div>
            {layer.type === 'vector' && (
                <button className="dl-item dl-item-btn dl-item-service" onClick={() => openService('wfs')}>
                    <span className="dl-item-icon dl-item-icon-svc" style={{ background: '#1a73e818', color: '#1a73e8' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h13A1.5 1.5 0 0 1 16 3.5v2A1.5 1.5 0 0 1 14.5 7h-13A1.5 1.5 0 0 1 0 5.5v-2zm1.5-.5a.5.5 0 0 0-.5.5v2a.5.5 0 0 0 .5.5h13a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 0-.5-.5h-13zM0 10.5A1.5 1.5 0 0 1 1.5 9h13a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 0 12.5v-2z"/></svg>
                    </span>
                    <span className="dl-item-info">
                        <span className="dl-item-label">WFS</span>
                        <span className="dl-item-desc">Web Feature Service · QGIS, ArcGIS</span>
                    </span>
                    <span className="dl-item-ext svc-arrow">›</span>
                </button>
            )}
            <button className="dl-item dl-item-btn dl-item-service" onClick={() => openService('wms')}>
                <span className="dl-item-icon dl-item-icon-svc" style={{ background: '#9c27b018', color: '#9c27b0' }}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 0C3.582 0 0 3.582 0 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm.25 11.5v1.25a.25.25 0 0 1-.5 0V11.5a.25.25 0 0 1 .5 0zm0-8.5v5.25a.25.25 0 0 1-.5 0V3a.25.25 0 0 1 .5 0z"/></svg>
                </span>
                <span className="dl-item-info">
                    <span className="dl-item-label">WMS</span>
                    <span className="dl-item-desc">Web Map Service · visor web, SIG</span>
                </span>
                <span className="dl-item-ext svc-arrow">›</span>
            </button>
        </div>
    );

    return (
        <div className="dl-dropdown">
            <button ref={triggerRef} className={`dl-trigger ${downloading ? 'dl-trigger-loading' : ''}`} title="Opciones de descarga y servicios" onClick={openMenu}>
                {downloading
                    ? <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" className="spin"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                }
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" fill="currentColor" viewBox="0 0 16 16" className={`dl-caret ${open ? 'open' : ''}`}><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
            </button>
            {open && ReactDOM.createPortal(menu, document.body)}
            {serviceModal && (
                <ServiceModal
                    info={serviceModal}
                    layerName={layer.name}
                    onClose={() => setServiceModal(null)}
                />
            )}
        </div>
    );
};

const TableIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
    </svg>
);

// ─── OGC detector ─────────────────────────────────────────────────────────────

function guessOGC(url: string): 'wms' | 'wfs' | null {
    const l = url.toLowerCase();
    if (l.includes('service=wms') || /\/wms[/?]?/.test(l)) return 'wms';
    if (l.includes('service=wfs') || /\/wfs[/?]?/.test(l)) return 'wfs';
    return null;
}

async function probeOGC(rawUrl: string): Promise<'wms' | 'wfs' | null> {
    let base = rawUrl.trim();
    try { const u = new URL(base); u.search = ''; base = u.toString(); } catch { /**/ }
    const tryFetch = async (params: string) => {
        try { return await (await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(6000) })).text(); }
        catch { return ''; }
    };
    const wms = await tryFetch('service=WMS&request=GetCapabilities');
    if (wms.includes('WMS_Capabilities') || wms.includes('WMT_MS_Capabilities')) return 'wms';
    const wfs = await tryFetch('service=WFS&request=GetCapabilities');
    if (wfs.includes('WFS_Capabilities') || wfs.includes('FeatureTypeList')) return 'wfs';
    return null;
}

// ─── SymbologyEditor ──────────────────────────────────────────────────────────

interface SymbologyEditorProps {
    features: GeoJSON.Feature[];
    geomType: GeomType;
    symbology: SymbologyStyle;
    onChange: (s: SymbologyStyle) => void;
}

const SymbologyEditor: React.FC<SymbologyEditorProps> = ({ features, geomType, symbology, onChange }) => {
    const fields = extractFields(features);
    const isLine = geomType === 'line';
    const [classError, setClassError] = useState<string | null>(null);

    const set = (patch: Partial<SymbologyStyle>) => onChange({ ...symbology, ...patch });

    const handleFieldChange = (field: string) => {
        const categories = autoCategorize(features, field);
        set({ field, categories, mode: 'categorical' });
    };

    const handleModeChange = (mode: SymbologyMode) => {
        setClassError(null);
        if (mode === 'single') {
            set({ mode, field: undefined, categories: undefined });
        } else if (mode === 'categorical') {
            if (fields.length && !symbology.field) handleFieldChange(fields[0]);
            else set({ mode });
        } else {
            set({
                mode,
                expression:  symbology.expression  ?? (fields[0] ?? ''),
                numClasses:  symbology.numClasses   ?? 5,
                colorRamp:   symbology.colorRamp    ?? RAMP_NAMES[0],
                classMethod: symbology.classMethod  ?? 'equal',
            });
        }
    };

    const handleGenerateClasses = () => {
        setClassError(null);
        const expr = (symbology.expression ?? '').trim();
        if (!expr) { setClassError('Escribe una expresión o selecciona un campo'); return; }
        const result = classifyFeatures(
            features, expr,
            symbology.numClasses  ?? 5,
            symbology.classMethod ?? 'equal',
            symbology.colorRamp   ?? RAMP_NAMES[0],
        );
        if (!result) {
            setClassError('No se pudo evaluar la expresión. Verifica los nombres de campo y que los valores sean numéricos.');
            return;
        }
        set({ classes: result });
    };

    const insertField = (field: string) => {
        const cur = symbology.expression ?? '';
        set({ expression: cur ? `${cur} ${field}` : field });
    };

    return (
        <div className="sym-editor">
            {/* Pestañas de modo */}
            <div className="sym-modes sym-modes-3">
                <button className={`sym-mode-btn ${symbology.mode === 'single'      ? 'selected' : ''}`} onClick={() => handleModeChange('single')}>Color único</button>
                <button className={`sym-mode-btn ${symbology.mode === 'categorical' ? 'selected' : ''}`} onClick={() => handleModeChange('categorical')}>Por campo</button>
                <button className={`sym-mode-btn ${symbology.mode === 'classified'  ? 'selected' : ''}`} onClick={() => handleModeChange('classified')}>Clasificado</button>
            </div>

            {/* Color único */}
            {symbology.mode === 'single' && (
                <div className="sym-single">
                    {!isLine && (
                        <div className="sym-row">
                            <label className="sym-label">Relleno</label>
                            <div className="sym-color-row">
                                <input type="color" value={symbology.fillColor} onChange={e => set({ fillColor: e.target.value })} className="sym-color-input" />
                                <input type="range" min={0} max={1} step={0.05} value={symbology.fillOpacity} onChange={e => set({ fillOpacity: parseFloat(e.target.value) })} className="opacity-slider sym-opacity" />
                                <span className="sym-pct">{Math.round(symbology.fillOpacity * 100)}%</span>
                            </div>
                        </div>
                    )}
                    <div className="sym-row">
                        <label className="sym-label">{isLine ? 'Color' : 'Borde'}</label>
                        <div className="sym-color-row">
                            <input type="color" value={symbology.strokeColor} onChange={e => set({ strokeColor: e.target.value })} className="sym-color-input" />
                            <input type="number" min={0.5} max={8} step={0.5} value={symbology.strokeWeight} onChange={e => set({ strokeWeight: parseFloat(e.target.value) })} className="sym-weight-input" />
                            <span className="sym-label" style={{ fontSize: '0.68rem' }}>px</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Por campo */}
            {symbology.mode === 'categorical' && (
                <div className="sym-categorical">
                    <div className="sym-row">
                        <label className="sym-label">Campo</label>
                        <select className="sym-select" value={symbology.field ?? ''} onChange={e => handleFieldChange(e.target.value)}>
                            <option value="" disabled>Selecciona un campo</option>
                            {fields.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    {symbology.field && symbology.categories && (
                        <div className="sym-categories">
                            <span className="sym-label">Valores ({symbology.categories.length})</span>
                            <div className="sym-cat-list">
                                {symbology.categories.map(cat => (
                                    <div key={cat.value} className="sym-cat-row">
                                        <input type="color" value={cat.color}
                                            onChange={e => set({ categories: symbology.categories!.map(c => c.value === cat.value ? { ...c, color: e.target.value } : c) })}
                                            className="sym-color-input sym-color-sm" />
                                        <span className="sym-cat-label" title={cat.value}>{cat.value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="sym-row" style={{ marginTop: 6 }}>
                                <label className="sym-label">Opacidad</label>
                                <div className="sym-color-row">
                                    <input type="range" min={0} max={1} step={0.05} value={symbology.fillOpacity} onChange={e => set({ fillOpacity: parseFloat(e.target.value) })} className="opacity-slider sym-opacity" />
                                    <span className="sym-pct">{Math.round(symbology.fillOpacity * 100)}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Clasificado */}
            {symbology.mode === 'classified' && (
                <div className="sym-classified">
                    {/* Expresión SQL */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label className="sym-label">Expresión SQL</label>
                        <textarea
                            className="sym-expr-textarea"
                            placeholder={`Ej: ${fields[0] ?? 'campo'}, ${fields[0] ?? 'a'} / ${fields[1] ?? 'b'}`}
                            value={symbology.expression ?? ''}
                            onChange={e => { set({ expression: e.target.value }); setClassError(null); }}
                            rows={2}
                            spellCheck={false}
                        />
                    </div>

                    {/* Chips de campos */}
                    {fields.length > 0 && (
                        <div className="sym-field-chips">
                            <span className="sym-chips-label">Campos disponibles:</span>
                            <div className="sym-chips-row">
                                {fields.map(f => (
                                    <button key={f} className="sym-field-chip" onClick={() => insertField(f)} title={`Insertar "${f}"`}>
                                        {f}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Método y número de clases */}
                    <div className="sym-row-split">
                        <div className="sym-split-item">
                            <label className="sym-label">Método</label>
                            <select className="sym-select" value={symbology.classMethod ?? 'equal'} onChange={e => set({ classMethod: e.target.value as 'equal' | 'quantile' })}>
                                <option value="equal">Intervalos iguales</option>
                                <option value="quantile">Cuantiles</option>
                            </select>
                        </div>
                        <div className="sym-split-item">
                            <label className="sym-label">Clases</label>
                            <input
                                type="number" min={2} max={15} step={1}
                                className="sym-weight-input sym-classes-input"
                                value={symbology.numClasses ?? 5}
                                onChange={e => set({ numClasses: Math.max(2, Math.min(15, parseInt(e.target.value) || 5)) })}
                            />
                        </div>
                    </div>

                    {/* Rampa de color */}
                    <label className="sym-label">Rampa de color</label>
                    <div className="sym-ramp-grid">
                        {RAMP_NAMES.map(ramp => (
                            <button
                                key={ramp}
                                className={`sym-ramp-item ${(symbology.colorRamp ?? RAMP_NAMES[0]) === ramp ? 'selected' : ''}`}
                                onClick={() => set({ colorRamp: ramp })}
                                title={ramp}
                            >
                                <span className="sym-ramp-bar" style={{ background: getRampGradientCSS(ramp) }} />
                                <span className="sym-ramp-name">{ramp}</span>
                            </button>
                        ))}
                    </div>

                    {/* Botón generar */}
                    <button className="sym-generate-btn" onClick={handleGenerateClasses}>
                        ⚙ Generar clases
                    </button>

                    {classError && <div className="sym-class-error">{classError}</div>}

                    {/* Lista de clases generadas */}
                    {symbology.classes && symbology.classes.length > 0 && (
                        <div className="sym-class-list">
                            <span className="sym-label" style={{ display: 'block', marginBottom: 4 }}>
                                Clases ({symbology.classes.length})
                            </span>
                            {symbology.classes.map((cls, i) => (
                                <div key={i} className="sym-class-row">
                                    <input
                                        type="color"
                                        value={cls.color}
                                        className="sym-color-input sym-color-sm"
                                        onChange={e => set({
                                            classes: symbology.classes!.map((c, j) =>
                                                j === i ? { ...c, color: e.target.value } : c
                                            ),
                                        })}
                                    />
                                    <span className="sym-class-range">{cls.label}</span>
                                </div>
                            ))}
                            <div className="sym-row" style={{ marginTop: 6 }}>
                                <label className="sym-label">Opacidad</label>
                                <div className="sym-color-row">
                                    <input type="range" min={0} max={1} step={0.05} value={symbology.fillOpacity} onChange={e => set({ fillOpacity: parseFloat(e.target.value) })} className="opacity-slider sym-opacity" />
                                    <span className="sym-pct">{Math.round(symbology.fillOpacity * 100)}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── AddLayerPanel ────────────────────────────────────────────────────────────

type PanelStep = 'form' | 'symbology';

const LAYER_TYPE_OPTIONS = [
    { value: 'vector' as AddLayerType, label: 'Vectorial',    icon: '\uD83D\uDCC1', desc: 'GeoJSON, KML, KMZ o Shapefile (.zip)' },
    { value: 'raster' as AddLayerType, label: 'GeoTIFF',      icon: '\uD83D\uDDFA\uFE0F', desc: 'GeoTIFF local' },
    { value: 'ogc'    as AddLayerType, label: 'Servicio OGC', icon: '\uD83C\uDF10', desc: 'WMS o WFS (auto-detectado)' },
];

const AddLayerPanel: React.FC<{ onAddLayer: (layer: ExternalLayer) => void }> = ({ onAddLayer }) => {
    const [open, setOpen]     = useState(false);
    const [step, setStep]     = useState<PanelStep>('form');
    const [type, setType]     = useState<AddLayerType>('vector');
    const [name, setName]     = useState('');
    const [url, setUrl]       = useState('');
    const [layerName, setLayerName] = useState('');
    const [file, setFile]     = useState<File | null>(null);
    const [error, setError]   = useState('');
    const [loading, setLoading]   = useState(false);
    const [probing, setProbing]   = useState(false);
    const [detectedOGC, setDetectedOGC] = useState<'wms' | 'wfs' | null>(null);
    const [pendingFeatures, setPendingFeatures] = useState<GeoJSON.Feature[]>([]);
    const [geomType, setGeomType] = useState<GeomType>('polygon');
    const [symbology, setSymbology] = useState<SymbologyStyle>({ ...DEFAULT_SYMBOLOGY });
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setStep('form'); setName(''); setUrl(''); setLayerName('');
        setFile(null); setError(''); setLoading(false); setProbing(false);
        setDetectedOGC(null); setPendingFeatures([]); setSymbology({ ...DEFAULT_SYMBOLOGY });
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleTypeChange = (t: AddLayerType) => { setType(t); reset(); };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setFile(f);
        if (f && !name) setName(f.name.replace(/\.\w+$/, ''));
        setError('');
    };

    const handleUrlChange = (val: string) => {
        setUrl(val);
        const guessed = guessOGC(val);
        setDetectedOGC(guessed);
        setError('');
    };

    const handleProbe = async () => {
        if (!url.trim()) { setError('Ingresa la URL del servicio'); return; }
        setProbing(true); setError(''); setDetectedOGC(null);
        const result = await probeOGC(url);
        setProbing(false);
        if (result) { setDetectedOGC(result); }
        else { setError('No se pudo detectar el tipo de servicio. Verifica la URL o que el servidor permita CORS.'); }
    };

    const handleContinue = useCallback(async () => {
        setError('');
        const displayName = name.trim() || (file?.name ?? url.split('/').pop() ?? 'Capa externa');

        if (type === 'vector') {
            if (!file) { setError('Selecciona un archivo'); return; }
            setLoading(true);
            try {
                const result = await fileToGeoJSON(file);
                if (!result.ok) { setError(result.error); return; }
                const gt = detectGeomType(result.data.features);
                setPendingFeatures(result.data.features);
                setGeomType(gt);
                setSymbology({ ...DEFAULT_SYMBOLOGY });
                setName(displayName);
                setStep('symbology');
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Error al leer el archivo');
            } finally { setLoading(false); }
            return;
        }

        if (type === 'raster') {
            if (!file) { setError('Selecciona un archivo GeoTIFF'); return; }
            setLoading(true);
            try {
                const result = await loadGeoTIFF(file);
                if (!result.ok) { setError(result.error); return; }
                onAddLayer({ id:`ext_${Date.now()}`, name: displayName, type:'raster', url:'', file, georasterData:result.georaster, georasterBounds:result.bounds });
                reset();
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Error al cargar el GeoTIFF');
            } finally { setLoading(false); }
            return;
        }

        // OGC
        if (!url.trim()) { setError('La URL del servicio es obligatoria'); return; }
        if (!layerName.trim()) { setError('El nombre de la capa es obligatorio'); return; }
        if (!detectedOGC) { setError('Primero detecta el tipo de servicio (WMS/WFS)'); return; }
        let cleanUrl = url.trim();
        try { const u = new URL(cleanUrl); u.search = ''; cleanUrl = u.toString(); } catch { /**/ }
        onAddLayer({ id:`ext_${Date.now()}`, name: displayName || layerName, type: detectedOGC, url: cleanUrl, layerName: layerName.trim() });
        reset();
    }, [type, name, url, layerName, file, detectedOGC, onAddLayer]);

    const handleAddWithSymbology = useCallback(() => {
        const fc: GeoJSON.FeatureCollection = { type:'FeatureCollection', features: pendingFeatures };
        onAddLayer({ id:`ext_${Date.now()}`, name, type:'vector', url:'', file: file ?? undefined, geojsonData: fc, symbology });
        reset();
    }, [pendingFeatures, name, file, symbology, onAddLayer]);

    const SpinIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" className="spin">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
    );

    return (
        <div className="add-layer-panel">
            <button className={`add-layer-toggle ${open ? 'open' : ''}`} onClick={() => { setOpen(o => !o); if (open) reset(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                Agregar capa
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16" style={{ marginLeft:'auto', transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
            </button>

            {open && (
                <div className="add-layer-form">

                    {step === 'form' && (
                        <>
                            <div className="add-layer-types">
                                {LAYER_TYPE_OPTIONS.map(opt => (
                                    <button key={opt.value} className={`add-type-btn ${type === opt.value ? 'selected' : ''}`} onClick={() => handleTypeChange(opt.value)} title={opt.desc}>
                                        <span className="add-type-icon">{opt.icon}</span>
                                        <span className="add-type-label">{opt.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="add-layer-field">
                                <label className="add-layer-label">Nombre</label>
                                <input type="text" className="add-layer-input" placeholder="Nombre para mostrar" value={name} onChange={e => setName(e.target.value)} />
                            </div>

                            {(type === 'vector' || type === 'raster') && (
                                <div className="add-layer-field">
                                    <label className="add-layer-label">{type === 'vector' ? 'Archivo vectorial' : 'Archivo GeoTIFF'}</label>
                                    <div className={`add-layer-dropzone ${file ? 'has-file' : ''}`}
                                        onClick={() => fileRef.current?.click()}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.\w+$/, '')); } }}>
                                        {file
                                            ? <span className="add-layer-filename"> {file.name}</span>
                                            : <span className="add-layer-droptext">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>
                                                {type === 'vector' ? 'GeoJSON \u00B7 KML \u00B7 KMZ \u00B7 Shapefile (.zip)' : 'Arrastra o haz clic para seleccionar'}
                                              </span>}
                                        <input ref={fileRef} type="file" accept={type === 'vector' ? VECTOR_ACCEPT : '.tif,.tiff'} style={{ display:'none' }} onChange={handleFileChange} />
                                    </div>
                                </div>
                            )}

                            {type === 'ogc' && (
                                <>
                                    <div className="add-layer-field">
                                        <label className="add-layer-label">URL del servicio</label>
                                        <div className="ogc-url-row">
                                            <input type="url" className="add-layer-input" placeholder="http://localhost/qgis/qgis_mapserv.fcgi.exe?MAP=C:/mis_proyectos/mi_proyecto.qgz" value={url}
                                                onChange={e => handleUrlChange(e.target.value)} />
                                            {detectedOGC
                                                ? <span className={`ogc-badge ogc-badge-${detectedOGC}`}>{detectedOGC.toUpperCase()}</span>
                                                : <button className="ogc-probe-btn" onClick={handleProbe} disabled={probing}>
                                                    {probing ? <SpinIcon /> : 'Detectar'}
                                                  </button>}
                                        </div>
                                        <span className="add-layer-hint">El tipo (WMS/WFS) se detecta por la URL o haciendo clic en "Detectar"</span>
                                    </div>
                                    <div className="add-layer-field">
                                        <label className="add-layer-label">Nombre de la capa</label>
                                        <input type="text" className="add-layer-input" placeholder="nombre_capa (exacto como aparece en QGIS)" value={layerName} onChange={e => setLayerName(e.target.value)} />
                                        <span className="add-layer-hint">
                                            {detectedOGC === 'wms' && 'Layer name del GetCapabilities WMS'}
                                            {detectedOGC === 'wfs' && 'TypeName del feature type WFS'}
                                            {!detectedOGC && 'Detecta el servicio para ver la ayuda espec\xEDfica'}
                                        </span>
                                    </div>
                                </>
                            )}

                            {error && (
                                <div className="add-layer-error">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
                                    {error}
                                </div>
                            )}

                            <button className="add-layer-submit" onClick={handleContinue} disabled={loading || probing}>
                                {loading
                                    ? <span className="add-layer-loading"><SpinIcon /> Cargando...</span>
                                    : <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                                    {type === 'vector' ? 'Continuar \u2192 Simbología' : 'Agregar al mapa'}</>}
                            </button>
                        </>
                    )}

                    {step === 'symbology' && (
                        <>
                            <div className="sym-header">
                                <button className="sym-back-btn" onClick={() => setStep('form')}> Volver</button>
                                <span className="sym-header-title">Simbología <strong>{name}</strong></span>
                            </div>
                            <div className="sym-geom-badge">
                                {geomType === 'point'   && '\u25CF Puntos'}
                                {geomType === 'line'    && '\u254C L\xEDneas'}
                                {geomType === 'polygon' && '\u25AD Pol\xEDgonos'}
                                {geomType === 'mixed'   && '\u2B61 Mixto'}
                                {' \u00B7 '}{pendingFeatures.length} elementos
                            </div>
                            <SymbologyEditor features={pendingFeatures} geomType={geomType} symbology={symbology} onChange={setSymbology} />
                            {error && (
                                <div className="add-layer-error">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
                                    {error}
                                </div>
                            )}
                            <button className="add-layer-submit" onClick={handleAddWithSymbology}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                                Agregar al mapa
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── LayerMenu principal ──────────────────────────────────────────────────────

const LayerMenu: React.FC<LayerMenuProps> = memo(({ layers, loading, errors, onLayerToggle, onOpacityChange, externalLayers, externalVisible, externalOpacity, onAddExternalLayer, onRemoveExternalLayer, onToggleExternalLayer, onExternalOpacityChange }) => {
    const { loading: apiLoading, error: apiError, layersByGroup } = useApiLayersLoader();
    
    const [menuOpen, setMenuOpen]         = useState(false);
    const [collapsed, setCollapsed]       = useState(false);
    const [searchTerm, setSearchTerm]     = useState('');
    const [attributeTableLayerId, setAttributeTableLayerId] = useState<string | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (group: string) =>
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            if (next.has(group)) {
                next.delete(group);
            } else {
                next.add(group);
            }
            return next;
        });

    const handleCheckboxChange = (layer: LayerConfig, isChecked: boolean) => onLayerToggle(layer.id, isChecked, layer.type);
    const isLayerActive  = (id: string) => layers[id]?.visible || false;
    const isLayerLoading = (id: string) => loading[id] || false;
    const getLayerError  = (id: string) => errors[id] || null;

    const normalizedSearch = searchTerm.toLowerCase();
    const filteredLayers = useMemo(() => (
        AVAILABLE_LAYERS.filter(l =>
            l.name.toLowerCase().includes(normalizedSearch) ||
            l.description.toLowerCase().includes(normalizedSearch)
        )
    ), [normalizedSearch]);

    // Usar layersByGroup de la API si está cargado
    const groupedLayers = useMemo(() => {
        if (Object.keys(layersByGroup).length > 0) {
            const grouped = new Map<string, LayerConfig[]>();
            Object.entries(layersByGroup).forEach(([group, groupLayers]) => {
                const filtered = groupLayers.filter(l =>
                    l.name.toLowerCase().includes(normalizedSearch) ||
                    l.description.toLowerCase().includes(normalizedSearch)
                );
                if (filtered.length > 0) {
                    grouped.set(group, filtered);
                }
            });
            return grouped;
        }
        
        const grouped = new Map<string, LayerConfig[]>();
        filteredLayers.forEach((layer) => {
            const list = grouped.get(layer.group);
            if (list) {
                list.push(layer);
            } else {
                grouped.set(layer.group, [layer]);
            }
        });
        return grouped;
    }, [filteredLayers, layersByGroup, normalizedSearch]);

    const activeCount      = Object.values(layers).filter(l => l?.visible).length;
    const activeTableLayer = attributeTableLayerId ? AVAILABLE_LAYERS.find(l => l.id === attributeTableLayerId) : null;
    const activeTableFeatures = attributeTableLayerId ? (layers[attributeTableLayerId]?.data?.features ?? []) : [];

    const renderLayerItem = (layer: LayerConfig) => {
        const isActive  = layer.type === 'vector' ? isLayerActive(layer.id) : (layers[layer.id]?.visible || false);
        const isLoading = isLayerLoading(layer.id);
        const err       = getLayerError(layer.id);
        const fc        = layers[layer.id]?.data?.features?.length;

        return (
            <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                <div className="layer-checkbox-wrapper">
                    <input
                        type="checkbox"
                        id={layer.id}
                        className="layer-checkbox"
                        checked={isActive}
                        onChange={e => handleCheckboxChange(layer, e.target.checked)}
                        disabled={isLoading}
                    />
                    <label htmlFor={layer.id} className="layer-label">
                        <div className="layer-info">
                            <span className="layer-name">
                                {layer.name}
                                {layer.year && <span className="year-badge">{layer.year}</span>}
                                {layer.type === 'raster' && <span className="layer-type-badge">WMS</span>}
                            </span>
                            <span className="layer-description">
                                {layer.description}
                                {fc != null && <span className="feature-count"> · {fc} elementos</span>}
                            </span>
                        </div>
                    </label>
                </div>

                <div className="layer-actions">
                    {isActive && layer.type === 'vector' && (
                        <button className="table-btn" title="Ver tabla de atributos" onClick={() => setAttributeTableLayerId(layer.id)}>
                            <TableIcon />
                        </button>
                    )}
                    <DownloadDropdown layer={layer} />
                </div>

                {isActive && (
                    <div className="layer-opacity-control">
                        <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                        <input
                            type="range" min="0" max="1" step="0.05"
                            value={layers[layer.id]?.opacity || 0.8}
                            onChange={e => {
                                const v = parseFloat(e.target.value);
                                onOpacityChange(layer.id, v, layer.type);
                            }}
                            className="opacity-slider"
                        />
                    </div>
                )}

                {isLoading && (
                    <div className="layer-status">
                        <div className="spinner-border spinner-border-sm" role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                    </div>
                )}
                {err && <div className="layer-error" role="alert"><small className="text-danger"> {err}</small></div>}
            </div>
        );
    };

    const menuContent = (
        <div className="layer-menu-content">
            <div className="search-container">
                <input
                    type="text"
                    placeholder="Buscar capas..."
                    className="search-input"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <AddLayerPanel onAddLayer={onAddExternalLayer} />
            </div>

            <div className="layers-list">

                {/* Estado de carga de API */}
                {apiLoading && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                        <div style={{ marginBottom: '0.5rem' }}>Cargando capas desde API...</div>
                        <div style={{ fontSize: '0.875rem', color: '#999' }}>
                            Conectando con http://localhost:8000/api/v1/gestion/
                        </div>
                    </div>
                )}

                {/* Estado de error de API */}
                {apiError && !apiLoading && (
                    <div style={{ 
                        padding: '1rem', 
                        margin: '1rem', 
                        background: '#fff5f5', 
                        border: '1px solid #feb2b2',
                        borderRadius: '6px',
                        color: '#c53030',
                        fontSize: '0.875rem'
                    }}>
                        <strong>Error al cargar capas:</strong> {apiError}
                        <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
                            Verifica que el backend esté corriendo en http://localhost:8000
                        </div>
                    </div>
                )}

                {/* ── Grupos unificados (vector + ráster) ── */}
                {!apiLoading && [...groupedLayers.entries()].map(([group, groupLayers]) => {
                    if (groupLayers.length === 0) return null;
                    const isGroupCollapsed = collapsedGroups.has(group);
                    const activeInGroup    = groupLayers.filter(l => isLayerActive(l.id)).length;

                    return (
                        <div key={group} className="layer-group">
                            {/* Cabecera colapsable */}
                            <button
                                className={`layer-group-header ${isGroupCollapsed ? 'collapsed' : ''}`}
                                onClick={() => toggleGroup(group)}
                                aria-expanded={!isGroupCollapsed}
                            >
                                <span className="group-title-text">{group}</span>
                                <span className="group-meta">
                                    {activeInGroup > 0 && (
                                        <span className="group-active-badge">{activeInGroup}</span>
                                    )}
                                    <span className="group-count">{groupLayers.length}</span>
                                    <svg
                                        className={`group-chevron ${isGroupCollapsed ? 'closed' : ''}`}
                                        xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                                        fill="currentColor" viewBox="0 0 16 16"
                                    >
                                        <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
                                    </svg>
                                </span>
                            </button>

                            {/* Capas del grupo */}
                            {!isGroupCollapsed && (
                                <div className="layer-group-body">
                                    {groupLayers.map(renderLayerItem)}
                                </div>
                            )}
                        </div>
                    );
                })}

                {/* ── Capas importadas ── */}
                {externalLayers.length > 0 && (() => {
                    const isGroupCollapsed = collapsedGroups.has('__imported__');
                    return (
                        <div className="layer-group">
                            <button
                                className={`layer-group-header ${isGroupCollapsed ? 'collapsed' : ''}`}
                                onClick={() => toggleGroup('__imported__')}
                                aria-expanded={!isGroupCollapsed}
                            >
                                <span className="group-title-text">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16" style={{ marginRight: 5 }}>
                                        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                        <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
                                    </svg>
                                    Capas importadas
                                </span>
                                <span className="group-meta">
                                    <span className="group-count">{externalLayers.length}</span>
                                    <svg
                                        className={`group-chevron ${isGroupCollapsed ? 'closed' : ''}`}
                                        xmlns="http://www.w3.org/2000/svg" width="12" height="12"
                                        fill="currentColor" viewBox="0 0 16 16"
                                    >
                                        <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
                                    </svg>
                                </span>
                            </button>

                            {!isGroupCollapsed && (
                                <div className="layer-group-body">
                                    {externalLayers.map(ext => {
                                        const isVisible = externalVisible[ext.id] ?? true;
                                        const opacity   = externalOpacity[ext.id]  ?? 0.8;
                                        const fmt =
                                            ext.type === 'wms'    ? `WMS · ${ext.layerName}` :
                                            ext.type === 'wfs'    ? `WFS · ${ext.layerName}` :
                                            ext.type === 'raster' ? 'GeoTIFF local' :
                                            ext.file ? (ext.file.name.split('.').pop()?.toUpperCase() + ' local') : 'Vectorial';
                                        return (
                                            <div key={ext.id} className={`layer-item ${isVisible ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input type="checkbox" id={`ext-${ext.id}`} className="layer-checkbox" checked={isVisible} onChange={e => onToggleExternalLayer(ext.id, e.target.checked)} />
                                                    <label htmlFor={`ext-${ext.id}`} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">{ext.name}</span>
                                                            <span className="layer-description">{fmt}</span>
                                                        </div>
                                                    </label>
                                                </div>
                                                <div className="layer-actions">
                                                    <button className="imported-delete-btn" title="Eliminar capa" onClick={() => onRemoveExternalLayer(ext.id)}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                                                    </button>
                                                </div>
                                                {isVisible && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round(opacity * 100)}%</span>
                                                        <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => onExternalOpacityChange(ext.id, parseFloat(e.target.value))} className="opacity-slider" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}

            </div>
        </div>
    );

    return (
        <>
            {/* ── Botón flotante móvil ── */}
            <button
                className="layer-menu-fab"
                onClick={() => setMenuOpen(o => !o)}
                aria-label="Abrir menú de capas"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M8.235 1.559a.5.5 0 0 0-.47 0l-7.5 4a.5.5 0 0 0 0 .882L3.188 8 .264 9.559a.5.5 0 0 0 0 .882l7.5 4a.5.5 0 0 0 .47 0l7.5-4a.5.5 0 0 0 0-.882L12.813 8l2.922-1.559a.5.5 0 0 0 0-.882l-7.5-4z"/>
                </svg>
                {activeCount > 0 && <span className="fab-badge">{activeCount}</span>}
            </button>

            {/* ── Overlay móvil ── */}
            {menuOpen && <div className="layer-menu-overlay" onClick={() => setMenuOpen(false)} />}

            {/* ── Panel escritorio ── */}
            <div className={`layer-menu desktop-menu ${collapsed ? 'collapsed' : ''}`}>
                <div className="layer-menu-header">
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                    <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'}>
                        {collapsed ? '→' : '←'}
                    </button>
                </div>
                {!collapsed && menuContent}
            </div>

            {/* ── Panel móvil (bottom sheet) ── */}
            <div className={`layer-menu mobile-menu ${menuOpen ? 'open' : ''}`}>
                <div className="mobile-menu-handle" onClick={() => setMenuOpen(false)}>
                    <span className="handle-bar" />
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                </div>
                {menuContent}
            </div>

            {attributeTableLayerId && activeTableLayer && (
                <AttributeTable
                    layerName={activeTableLayer.name}
                    features={activeTableFeatures}
                    onClose={() => setAttributeTableLayerId(null)}
                />
            )}
        </>
    );
});

LayerMenu.displayName = 'LayerMenu';
export default LayerMenu;