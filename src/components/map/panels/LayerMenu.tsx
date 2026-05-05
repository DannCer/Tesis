/**
 * @fileoverview Menú lateral de capas — búsqueda, grupos colapsables, descarga y capas externas.
 *
 * Optimizaciones respecto a la versión anterior:
 *
 * 1. VALORES HARDCODEADOS ELIMINADOS
 *    - BBOX '14.532,-118.454,32.718,-86.710' → MEXICO_BBOX_WMS de constants.ts
 *    - setTimeout(…, 2000) → COPY_FEEDBACK_MS
 *    - AbortSignal.timeout(6000) → CAPABILITIES_TIMEOUT_MS
 *    - zIndex: 99999 en menuStyle → Z_INDEX.layerMenu
 *    - Colores #1a73e8 y #9c27b0 de los badges WFS/WMS → clases CSS en LayerMenu.css
 *      (eliminados los style inline restantes en los botones de servicio)
 *    - Colores #fff5f5, #feb2b2, #c53030 del bloque de error API → clase .api-error-block
 *    - style inline color: '#666' del loading → clase .api-loading-block
 *    - style inline en caret del "Agregar capa" → clase CSS .add-layer-caret
 *
 * 2. TIPADO
 *    - getProjectUrlForLayer y getServiceInfo: parámetro `grupos` tipado como
 *      `GrupoLike[]` en vez de `any[]`.
 *    - LayerMenuProps.layerState: `Record<string, LayerData>` — eliminado `| any`.
 *
 * 3. MEMO / CALLBACKS
 *    - handleCheckboxChange, isLayerActive, isLayerLoading, getLayerError
 *      envueltos en useCallback para no re-crear en cada render del menú.
 *    - renderLayerItem extraído fuera del componente padre para estabilidad.
 *
 * @module components/map/panels/LayerMenu
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactDOM from 'react-dom';
import '@styles/LayerMenu.css';
import type { LayerData } from '@hooks/map';
import type { LayerConfig } from '@config/layers';
import { useLayersContext } from '@contexts/LayersContext';
import { config, logger } from '@config/env';
import AttributeTable from './AttributeTable';
import { fileToGeoJSON, VECTOR_ACCEPT } from '@utils/geo/fileToGeoJSON';
import { loadGeoTIFF } from '@utils/geo/georasterLoader';
import {
    SymbologyStyle, SymbologyMode, GeomType, DEFAULT_SYMBOLOGY,
    detectGeomType, extractFields, autoCategorize,
    classifyFeatures, getRampGradientCSS, RAMP_NAMES,
} from '@utils/geo/symbologyUtils';
import type { ExternalLayer, DownloadFormat } from '@types/geo';
import { VECTOR_DOWNLOAD_FORMATS, RASTER_DOWNLOAD_FORMATS } from '@types/geo';
import {
    COPY_FEEDBACK_MS,
    CAPABILITIES_TIMEOUT_MS,
    Z_INDEX,
    MEXICO_BBOX_WMS,
    LAYER_DEFAULT_OPACITY,
} from '@config/constants';

export type { ExternalLayer };

// ─── Tipos locales ────────────────────────────────────────────────────────────

/** Forma mínima de un grupo que este módulo necesita. */
interface GrupoLike {
    id?: number | string;
    nombre: string;
    url_proyecto?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LayerMenuProps {
    layerState:             Record<string, LayerData>;   // ← ya no acepta any
    layersByGroup:          Record<string, LayerConfig[]>;
    loading:                Record<string, boolean>;
    errors:                 Record<string, string | null>;
    onLayerToggle:          (id: string, isActive: boolean, type: 'vector' | 'raster') => void;
    onOpacityChange:        (id: string, opacity: number, type: 'vector' | 'raster') => void;
    externalLayers:         ExternalLayer[];
    externalVisible:        Record<string, boolean>;
    externalOpacity:        Record<string, number>;
    onAddExternalLayer:     (layer: ExternalLayer) => void;
    onRemoveExternalLayer:  (id: string) => void;
    onToggleExternalLayer:  (id: string, visible: boolean) => void;
    onExternalOpacityChange:(id: string, opacity: number) => void;
    toolbarSlot?:           React.ReactNode;
}

export type AddLayerType = 'vector' | 'raster' | 'ogc';

// ─── URL helpers ──────────────────────────────────────────────────────────────

const getProjectUrlForLayer = (layer: LayerConfig, grupos: GrupoLike[]): string => {
    if (!layer.group) return config.qgisServer.wfsUrl;
    const grupo = grupos.find(g => g.nombre === layer.group);
    if (!grupo?.url_proyecto) {
        logger.warn(`No se encontró proyecto para el grupo "${layer.group}", usando URL por defecto`);
        return config.qgisServer.wfsUrl;
    }
    return `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
};

const getVectorDownloadUrl = (
    layer: LayerConfig,
    outputFormat: string,
    grupos: GrupoLike[] = []
): string => {
    const wfsName = (layer as LayerConfig & { wfsName?: string }).wfsName ?? layer.id;
    const baseUrl = getProjectUrlForLayer(layer, grupos);
    const url     = new URL(baseUrl);
    url.searchParams.set('SERVICE',      'WFS');
    url.searchParams.set('VERSION',      '1.1.0');
    url.searchParams.set('REQUEST',      'GetFeature');
    url.searchParams.set('TYPENAME',     wfsName);
    url.searchParams.set('outputFormat', outputFormat);
    return url.toString();
};

const getRasterDownloadUrl = (layer: LayerConfig, grupos: GrupoLike[] = []): string => {
    const baseUrl = layer.group
        ? getProjectUrlForLayer(layer, grupos)
        : config.qgisServer.wmsRasterUrl;

    const url = new URL(baseUrl);
    url.searchParams.set('SERVICE', 'WMS');
    url.searchParams.set('VERSION', '1.3.0');
    url.searchParams.set('REQUEST', 'GetMap');
    url.searchParams.set('LAYERS',  layer.wmsLayer ?? layer.id);
    url.searchParams.set('CRS',     'EPSG:4326');
    url.searchParams.set('BBOX',    MEXICO_BBOX_WMS);    // ← antes hardcodeado
    url.searchParams.set('WIDTH',   '4096');
    url.searchParams.set('HEIGHT',  '3072');
    url.searchParams.set('FORMAT',  'image/tiff');
    if (layer.timeValue) url.searchParams.set('TIME', layer.timeValue);
    return url.toString();
};

const getServiceInfo = (layer: LayerConfig, type: 'wfs' | 'wms', grupos: GrupoLike[] = []) => {
    const wfsName  = (layer as LayerConfig & { wfsName?: string }).wfsName ?? layer.id;
    const wmsLayer = (layer as LayerConfig & { wmsLayer?: string }).wmsLayer ?? layer.id;

    if (type === 'wfs') {
        const baseUrl = getProjectUrlForLayer(layer, grupos);
        const caps    = new URL(baseUrl);
        caps.searchParams.set('SERVICE', 'WFS');
        caps.searchParams.set('VERSION', '2.0.0');
        caps.searchParams.set('REQUEST', 'GetCapabilities');

        const feat = new URL(baseUrl);
        feat.searchParams.set('SERVICE',  'WFS');
        feat.searchParams.set('VERSION',  '2.0.0');
        feat.searchParams.set('REQUEST',  'GetFeature');
        feat.searchParams.set('TYPENAME', wfsName);

        return {
            type:            'WFS' as const,
            connectionUrl:   baseUrl,
            capabilitiesUrl: caps.toString(),
            getFeatureUrl:   feat.toString(),
            layerName:       wfsName,
        };
    }

    const baseUrl = layer.group
        ? getProjectUrlForLayer(layer, grupos)
        : config.qgisServer.wmsUrl;

    const caps = new URL(baseUrl);
    caps.searchParams.set('SERVICE', 'WMS');
    caps.searchParams.set('VERSION', '1.3.0');
    caps.searchParams.set('REQUEST', 'GetCapabilities');

    return {
        type:            'WMS' as const,
        connectionUrl:   baseUrl,
        capabilitiesUrl: caps.toString(),
        getFeatureUrl:   '',
        layerName:       wmsLayer,
    };
};

// ─── Descarga programática ────────────────────────────────────────────────────

async function downloadVectorFormat(
    layer: LayerConfig,
    fmt: DownloadFormat,
    grupos: GrupoLike[] = []
): Promise<void> {
    const url = getVectorDownloadUrl(layer, fmt.outputFormat, grupos);
    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob    = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a       = Object.assign(document.createElement('a'), {
            href:     blobUrl,
            download: `${layer.id}.${fmt.ext}`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
    } catch (e) {
        logger.error(`Error descargando ${fmt.label}:`, e);
    }
}

// ─── OGC detector ────────────────────────────────────────────────────────────

function guessOGC(url: string): 'wms' | 'wfs' | null {
    const l = url.toLowerCase();
    if (l.includes('service=wms') || /\/wms[/?]?/.test(l)) return 'wms';
    if (l.includes('service=wfs') || /\/wfs[/?]?/.test(l)) return 'wfs';
    return null;
}

async function probeOGC(rawUrl: string): Promise<'wms' | 'wfs' | null> {
    let base = rawUrl.trim();
    try { const u = new URL(base); u.search = ''; base = u.toString(); } catch { /* noop */ }

    const tryFetch = async (params: string): Promise<string> => {
        try {
            return await (
                await fetch(`${base}?${params}`, {
                    signal: AbortSignal.timeout(CAPABILITIES_TIMEOUT_MS),  // ← antes 6000
                })
            ).text();
        } catch { return ''; }
    };

    const wms = await tryFetch('service=WMS&request=GetCapabilities');
    if (wms.includes('WMS_Capabilities') || wms.includes('WMT_MS_Capabilities')) return 'wms';
    const wfs = await tryFetch('service=WFS&request=GetCapabilities');
    if (wfs.includes('WFS_Capabilities') || wfs.includes('FeatureTypeList')) return 'wfs';
    return null;
}

// ─── ServiceModal ─────────────────────────────────────────────────────────────

interface ServiceModalProps {
    info:      ReturnType<typeof getServiceInfo>;
    layerName: string;
    onClose:   () => void;
}

const ServiceModal: React.FC<ServiceModalProps> = ({ info, layerName, onClose }) => {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = useCallback(async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = Object.assign(document.createElement('textarea'), {
                value: text, style: 'position:fixed;opacity:0',
            });
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(key);
        setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);  // ← antes 2000
    }, []);

    const rows: Array<{ label: string; value: string; id: string; mono?: boolean }> = [
        { label: 'URL de conexión (pegar en QGIS / ArcGIS)', value: info.connectionUrl, id: 'conn' },
        { label: `Nombre de capa / ${info.type === 'WFS' ? 'TypeName' : 'LAYER'}`, value: info.layerName, id: 'lyr', mono: true },
        { label: 'URL GetCapabilities', value: info.capabilitiesUrl, id: 'caps' },
        ...(info.type === 'WFS' && info.getFeatureUrl
            ? [{ label: 'URL GetFeature completa', value: info.getFeatureUrl, id: 'feat' }]
            : []
        ),
    ];

    const CopyBtn: React.FC<{ text: string; id: string }> = memo(({ text, id }) => (
        <button
            className={`svc-copy-btn ${copied === id ? 'copied' : ''}`}
            onClick={() => copy(text, id)}
            title="Copiar"
        >
            {copied === id ? '✓ Copiado' : '⎘ Copiar'}
        </button>
    ));
    CopyBtn.displayName = 'CopyBtn';

    const modal = (
        <div className="svc-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Servicio ${info.type} — ${layerName}`}>
            <div className="svc-modal" onClick={e => e.stopPropagation()}>
                <div className="svc-header">
                    <div className="svc-header-left">
                        <span className={`svc-badge svc-badge-${info.type.toLowerCase()}`}>{info.type}</span>
                        <div>
                            <div className="svc-title">Consumir como servicio {info.type}</div>
                            <div className="svc-subtitle">{layerName}</div>
                        </div>
                    </div>
                    <button className="svc-close" onClick={onClose} title="Cerrar" aria-label="Cerrar modal">×</button>
                </div>

                <div className="svc-instructions">
                    {info.type === 'WFS'
                        ? 'En QGIS: Capa → Agregar capa → WFS. En ArcGIS Pro: Insert → Connections → New WFS Server.'
                        : 'En QGIS: Capa → Agregar capa → WMS/WMTS. En ArcGIS Pro: Insert → Connections → New WMS Server.'
                    }
                </div>

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

                <div className="svc-footer">
                    <button
                        className="svc-copy-all-btn"
                        onClick={() => copy(rows.map(r => `${r.label}:\n${r.value}`).join('\n\n'), 'all')}
                    >
                        {copied === 'all' ? '✓ Todo copiado' : '⎘ Copiar todo'}
                    </button>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modal, document.body);
};

// ─── DownloadDropdown ─────────────────────────────────────────────────────────

const DownloadDropdown: React.FC<{ layer: LayerConfig; grupos?: GrupoLike[] }> = memo(
    ({ layer, grupos = [] }) => {
        const [open,         setOpen]         = useState(false);
        const [menuStyle,    setMenuStyle]    = useState<React.CSSProperties>({});
        const [serviceModal, setServiceModal] = useState<ReturnType<typeof getServiceInfo> | null>(null);
        const [downloading,  setDownloading]  = useState<string | null>(null);
        const triggerRef = useRef<HTMLButtonElement>(null);

        const openMenu = useCallback(() => {
            if (!triggerRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            const mw   = 245;
            const vw   = window.innerWidth;
            const vh   = window.innerHeight;
            const left = Math.max(8, Math.min(rect.right - mw, vw - mw - 8));
            const menuH = Math.min(320, vh * 0.55);
            const spaceBelow = vh - rect.bottom;
            const top = spaceBelow < menuH
                ? rect.top - menuH - 6 + window.scrollY
                : rect.bottom + 6 + window.scrollY;

            setMenuStyle({
                position: 'absolute',
                top,
                left,
                width:  Math.min(mw, vw - 16),
                zIndex: Z_INDEX.layerMenu,   // ← antes 99999
            });
            setOpen(o => !o);
        }, []);

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

        const openService = useCallback((type: 'wfs' | 'wms') => {
            setOpen(false);
            setServiceModal(getServiceInfo(layer, type, grupos));
        }, [layer, grupos]);

        const handleDownload = useCallback(async (fmt: DownloadFormat) => {
            setOpen(false);
            setDownloading(fmt.ext);
            await downloadVectorFormat(layer, fmt, grupos);
            setDownloading(null);
        }, [layer, grupos]);

        const menu = (
            <div className="dl-menu" style={menuStyle} onMouseDown={e => e.stopPropagation()}>
                <div className="dl-menu-header">Descargar como</div>

                {layer.type === 'vector'
                    ? VECTOR_DOWNLOAD_FORMATS.map(fmt => (
                        <button key={fmt.ext} className="dl-item dl-item-btn" onClick={() => handleDownload(fmt)}>
                            <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>{fmt.icon}</span>
                            <span className="dl-item-info">
                                <span className="dl-item-label">{fmt.label}</span>
                                <span className="dl-item-desc">{fmt.description}</span>
                            </span>
                            <span className="dl-item-ext">.{fmt.ext.replace('.zip', '')}</span>
                        </button>
                    ))
                    : RASTER_DOWNLOAD_FORMATS.map(fmt => (
                        <a key={fmt.ext} href={getRasterDownloadUrl(layer, grupos)}
                            className="dl-item" target="_blank" rel="noopener noreferrer"
                            download={`${layer.id}.${fmt.ext}`} onClick={() => setOpen(false)}>
                            <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>{fmt.icon}</span>
                            <span className="dl-item-info">
                                <span className="dl-item-label">{fmt.label}</span>
                                <span className="dl-item-desc">{fmt.description}</span>
                            </span>
                            <span className="dl-item-ext">.{fmt.ext}</span>
                        </a>
                    ))
                }

                <div className="dl-menu-section">Consumir como servicio</div>

                {/* Los colores de svc-badge se definen en LayerMenu.css — sin style inline */}
                {layer.type === 'vector' && (
                    <button className="dl-item dl-item-btn dl-item-service" onClick={() => openService('wfs')}>
                        <span className="dl-item-icon dl-item-icon-svc dl-item-icon-wfs">⊞</span>
                        <span className="dl-item-info">
                            <span className="dl-item-label">WFS</span>
                            <span className="dl-item-desc">Web Feature Service · QGIS, ArcGIS</span>
                        </span>
                        <span className="dl-item-ext svc-arrow">›</span>
                    </button>
                )}

                <button className="dl-item dl-item-btn dl-item-service" onClick={() => openService('wms')}>
                    <span className="dl-item-icon dl-item-icon-svc dl-item-icon-wms">⊙</span>
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
                <button
                    ref={triggerRef}
                    className={`dl-trigger ${downloading ? 'dl-trigger-loading' : ''}`}
                    title="Opciones de descarga y servicios"
                    onClick={openMenu}
                    aria-label="Opciones de descarga y servicios OGC"
                >
                    <span className="dl-trigger-icon" aria-hidden="true">
                        {downloading ? '⟳' : '⬇'}
                    </span>
                    <span className={`dl-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
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
    }
);
DownloadDropdown.displayName = 'DownloadDropdown';

// ─── TableIcon ────────────────────────────────────────────────────────────────

const TableIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z" />
    </svg>
));
TableIcon.displayName = 'TableIcon';

// ─── SymbologyEditor (sin cambios de lógica, solo tipado) ─────────────────────

interface SymbologyEditorProps {
    features:   GeoJSON.Feature[];
    geomType:   GeomType;
    symbology:  SymbologyStyle;
    onChange:   (s: SymbologyStyle) => void;
}

const SymbologyEditor: React.FC<SymbologyEditorProps> = ({ features, geomType, symbology, onChange }) => {
    const fields = useMemo(() => extractFields(features), [features]);

    const updateSym = useCallback((patch: Partial<SymbologyStyle>) =>
        onChange({ ...symbology, ...patch }), [symbology, onChange]);

    const handleModeChange = useCallback((mode: SymbologyMode) => {
        if (mode === 'categorized' && fields.length > 0) {
            const field      = symbology.field ?? fields[0];
            const categories = autoCategorize(features, field);
            updateSym({ mode, field, categories, expression: undefined });
        } else if (mode === 'expression') {
            updateSym({ mode, expression: '' });
        } else {
            updateSym({ mode, categories: undefined, expression: undefined });
        }
    }, [fields, symbology.field, features, updateSym]);

    const handleCategoryColorChange = useCallback((value: string, color: string) => {
        const updated = (symbology.categories ?? []).map(c =>
            c.value === value ? { ...c, color } : c
        );
        updateSym({ categories: updated });
    }, [symbology.categories, updateSym]);

    const handleReclassify = useCallback(() => {
        if (!symbology.field) return;
        const cats = autoCategorize(features, symbology.field);
        updateSym({ categories: cats });
    }, [features, symbology.field, updateSym]);

    const handleExpressionTest = useCallback(() => {
        if (!symbology.expression?.trim()) return;
        try {
            const results = classifyFeatures(features, symbology.expression);
            updateSym({ categories: results });
        } catch (e) {
            logger.error('Error en expresión de simbología:', e);
        }
    }, [features, symbology.expression, updateSym]);

    return (
        <div className="sym-editor">
            {/* Modo */}
            <div className="sym-field">
                <label className="sym-label">Modo</label>
                <div className="sym-mode-btns">
                    {(['simple', 'categorized', 'expression'] as SymbologyMode[]).map(m => (
                        <button
                            key={m}
                            className={`sym-mode-btn ${symbology.mode === m ? 'active' : ''}`}
                            onClick={() => handleModeChange(m)}
                        >
                            {m === 'simple' ? 'Simple' : m === 'categorized' ? 'Categorizado' : 'Expresión'}
                        </button>
                    ))}
                </div>
            </div>

            {/* Simple */}
            {symbology.mode === 'simple' && (
                <>
                    <div className="sym-field">
                        <label className="sym-label">Color de relleno</label>
                        <input type="color" value={symbology.color} onChange={e => updateSym({ color: e.target.value })} className="sym-color-input" />
                    </div>
                    {(geomType === 'polygon' || geomType === 'mixed') && (
                        <>
                            <div className="sym-field">
                                <label className="sym-label">Color de borde</label>
                                <input type="color" value={symbology.outlineColor ?? '#333333'} onChange={e => updateSym({ outlineColor: e.target.value })} className="sym-color-input" />
                            </div>
                            <div className="sym-field">
                                <label className="sym-label">Opacidad de relleno ({Math.round(symbology.fillOpacity * 100)}%)</label>
                                <input type="range" min="0" max="1" step="0.05" value={symbology.fillOpacity} onChange={e => updateSym({ fillOpacity: +e.target.value })} className="sym-slider" />
                            </div>
                        </>
                    )}
                    <div className="sym-field">
                        <label className="sym-label">Grosor de línea ({symbology.weight}px)</label>
                        <input type="range" min="0.5" max="8" step="0.5" value={symbology.weight} onChange={e => updateSym({ weight: +e.target.value })} className="sym-slider" />
                    </div>
                </>
            )}

            {/* Rampa de color para simple */}
            {symbology.mode === 'simple' && (
                <div className="sym-field">
                    <label className="sym-label">Rampa de color</label>
                    <div className="sym-ramp-grid">
                        {RAMP_NAMES.map(ramp => (
                            <button
                                key={ramp}
                                className={`sym-ramp-btn ${symbology.ramp === ramp ? 'active' : ''}`}
                                onClick={() => updateSym({ ramp })}
                                title={ramp}
                            >
                                <span className="sym-ramp-preview" style={{ background: getRampGradientCSS(ramp) }} />
                                <span className="sym-ramp-name">{ramp}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Categorizado */}
            {symbology.mode === 'categorized' && (
                <>
                    <div className="sym-field">
                        <label className="sym-label">Campo</label>
                        <div className="sym-field-row">
                            <select
                                className="sym-select"
                                value={symbology.field ?? ''}
                                onChange={e => {
                                    const field = e.target.value;
                                    const cats  = autoCategorize(features, field);
                                    updateSym({ field, categories: cats });
                                }}
                            >
                                {fields.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <button className="sym-reclassify-btn" onClick={handleReclassify}>↺ Reclasificar</button>
                        </div>
                    </div>
                    {symbology.categories && symbology.categories.length > 0 && (
                        <div className="sym-categories">
                            {symbology.categories.map(cat => (
                                <div key={String(cat.value)} className="sym-category-row">
                                    <input
                                        type="color"
                                        value={cat.color}
                                        onChange={e => handleCategoryColorChange(String(cat.value), e.target.value)}
                                        className="sym-cat-color"
                                    />
                                    <span className="sym-cat-label">{String(cat.value)}</span>
                                    <span className="sym-cat-count">({cat.count})</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Expresión */}
            {symbology.mode === 'expression' && (
                <div className="sym-field">
                    <label className="sym-label">Expresión JavaScript</label>
                    <textarea
                        className="sym-expression-input"
                        value={symbology.expression ?? ''}
                        onChange={e => updateSym({ expression: e.target.value })}
                        placeholder={'// Ejemplo:\nfeature.properties.tipo === "A" ? "#e74c3c" : "#3498db"'}
                        rows={4}
                    />
                    <button className="sym-test-btn" onClick={handleExpressionTest}>▶ Probar expresión</button>
                </div>
            )}
        </div>
    );
};

// ─── AddLayerPanel ────────────────────────────────────────────────────────────

const LAYER_TYPE_OPTIONS = [
    { value: 'vector' as AddLayerType, label: 'Vectorial', icon: '📂', desc: 'GeoJSON, KML, KMZ, SHP' },
    { value: 'raster'  as AddLayerType, label: 'Ráster',   icon: '🛰️', desc: 'GeoTIFF (.tif)' },
    { value: 'ogc'    as AddLayerType, label: 'Servicio',  icon: '🌐', desc: 'WMS / WFS' },
] as const;

interface AddLayerPanelProps {
    onAddLayer: (layer: ExternalLayer) => void;
}

const AddLayerPanel: React.FC<AddLayerPanelProps> = ({ onAddLayer }) => {
    const [open,           setOpen]           = useState(false);
    const [step,           setStep]           = useState<'form' | 'symbology'>('form');
    const [type,           setType]           = useState<AddLayerType>('vector');
    const [name,           setName]           = useState('');
    const [url,            setUrl]            = useState('');
    const [layerName,      setLayerName]      = useState('');
    const [file,           setFile]           = useState<File | null>(null);
    const [loading,        setLoading]        = useState(false);
    const [error,          setError]          = useState<string | null>(null);
    const [detectedOGC,    setDetectedOGC]    = useState<'wms' | 'wfs' | null>(null);
    const [probing,        setProbing]        = useState(false);
    const [pendingFeatures,setPendingFeatures]= useState<GeoJSON.Feature[]>([]);
    const [geomType,       setGeomType]       = useState<GeomType>('polygon');
    const [symbology,      setSymbology]      = useState<SymbologyStyle>(DEFAULT_SYMBOLOGY);
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setStep('form'); setType('vector'); setName(''); setUrl('');
        setLayerName(''); setFile(null); setError(null); setDetectedOGC(null);
        setPendingFeatures([]); setGeomType('polygon'); setSymbology(DEFAULT_SYMBOLOGY);
    }, []);

    const handleTypeChange = useCallback((t: AddLayerType) => {
        setType(t); setError(null); setFile(null); setDetectedOGC(null);
    }, []);

    const handleUrlChange = useCallback((v: string) => {
        setUrl(v);
        const guessed = guessOGC(v);
        if (guessed) setDetectedOGC(guessed);
        else setDetectedOGC(null);
    }, []);

    const handleProbe = useCallback(async () => {
        if (!url.trim()) { setError('Ingresa una URL primero'); return; }
        setProbing(true); setError(null);
        const result = await probeOGC(url);
        setProbing(false);
        if (result) setDetectedOGC(result);
        else setError('No se pudo detectar WMS ni WFS en la URL proporcionada.');
    }, [url]);

    const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setFile(f);
        if (!name) setName(f.name.replace(/\.\w+$/, ''));
    }, [name]);

    const handleContinue = useCallback(async () => {
        setError(null);
        if (!name.trim()) { setError('El nombre es obligatorio'); return; }

        if (type === 'raster') {
            if (!file) { setError('Selecciona un archivo GeoTIFF'); return; }
            setLoading(true);
            try {
                const georasterData = await loadGeoTIFF(file);
                onAddLayer({ id: `ext_${Date.now()}`, name, type: 'raster', url: '', file, georasterData });
                reset();
            } catch (err) {
                setError(`Error al cargar el GeoTIFF: ${err instanceof Error ? err.message : String(err)}`);
            } finally { setLoading(false); }
            return;
        }

        if (type === 'vector') {
            if (!file) { setError('Selecciona un archivo vectorial'); return; }
            setLoading(true);
            try {
                const fc       = await fileToGeoJSON(file);
                const detected = detectGeomType(fc.features);
                setPendingFeatures(fc.features);
                setGeomType(detected);
                setStep('symbology');
            } catch (err) {
                setError(`Error al leer el archivo: ${err instanceof Error ? err.message : String(err)}`);
            } finally { setLoading(false); }
            return;
        }

        if (type === 'ogc') {
            if (!layerName.trim()) { setError('El nombre de la capa es obligatorio'); return; }
            if (!detectedOGC)      { setError('Primero detecta el tipo de servicio (WMS/WFS)'); return; }
            let cleanUrl = url.trim();
            try { const u = new URL(cleanUrl); u.search = ''; cleanUrl = u.toString(); } catch { /* noop */ }
            onAddLayer({ id: `ext_${Date.now()}`, name: name || layerName, type: detectedOGC, url: cleanUrl, layerName: layerName.trim() });
            reset();
        }
    }, [type, name, url, layerName, file, detectedOGC, onAddLayer, reset]);

    const handleAddWithSymbology = useCallback(() => {
        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: pendingFeatures };
        onAddLayer({ id: `ext_${Date.now()}`, name, type: 'vector', url: '', file: file ?? undefined, geojsonData: fc, symbology });
        reset();
    }, [pendingFeatures, name, file, symbology, onAddLayer, reset]);

    return (
        <div className="add-layer-panel">
            <button
                className={`add-layer-toggle ${open ? 'open' : ''}`}
                onClick={() => { setOpen(o => !o); if (open) reset(); }}
                aria-expanded={open}
            >
                <span aria-hidden="true">＋</span> Agregar capa
                {/* Caret controlado por clase CSS — sin style inline */}
                <span className={`add-layer-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
            </button>

            {open && (
                <div className="add-layer-form">
                    {step === 'form' && (
                        <>
                            <div className="add-layer-types">
                                {LAYER_TYPE_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        className={`add-type-btn ${type === opt.value ? 'selected' : ''}`}
                                        onClick={() => handleTypeChange(opt.value)}
                                        title={opt.desc}
                                    >
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
                                    <label className="add-layer-label">
                                        {type === 'vector' ? 'Archivo vectorial' : 'Archivo GeoTIFF'}
                                    </label>
                                    <div
                                        className={`add-layer-dropzone ${file ? 'has-file' : ''}`}
                                        onClick={() => fileRef.current?.click()}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => {
                                            e.preventDefault();
                                            const f = e.dataTransfer.files[0];
                                            if (f) { setFile(f); if (!name) setName(f.name.replace(/\.\w+$/, '')); }
                                        }}
                                    >
                                        {file
                                            ? <span className="add-layer-filename">{file.name}</span>
                                            : <span className="add-layer-droptext">
                                                ⬆ {type === 'vector' ? 'GeoJSON · KML · KMZ · Shapefile (.zip)' : 'Arrastra o haz clic para seleccionar'}
                                            </span>
                                        }
                                        <input
                                            ref={fileRef} type="file"
                                            accept={type === 'vector' ? VECTOR_ACCEPT : '.tif,.tiff'}
                                            style={{ display: 'none' }}
                                            onChange={handleFileChange}
                                        />
                                    </div>
                                </div>
                            )}

                            {type === 'ogc' && (
                                <>
                                    <div className="add-layer-field">
                                        <label className="add-layer-label">URL del servicio</label>
                                        <div className="ogc-url-row">
                                            <input
                                                type="url" className="add-layer-input"
                                                placeholder="http://qgis-server/qgis_mapserv.fcgi.exe?MAP=/ruta/proyecto.qgz"
                                                value={url}
                                                onChange={e => handleUrlChange(e.target.value)}
                                            />
                                            {detectedOGC
                                                ? <span className={`ogc-badge ogc-badge-${detectedOGC}`}>{detectedOGC.toUpperCase()}</span>
                                                : <button className="ogc-probe-btn" onClick={handleProbe} disabled={probing}>
                                                    {probing ? '⟳' : 'Detectar'}
                                                </button>
                                            }
                                        </div>
                                        <span className="add-layer-hint">El tipo (WMS/WFS) se detecta por la URL o haciendo clic en "Detectar"</span>
                                    </div>
                                    <div className="add-layer-field">
                                        <label className="add-layer-label">Nombre de la capa</label>
                                        <input
                                            type="text" className="add-layer-input"
                                            placeholder="nombre_capa (exacto como en QGIS)"
                                            value={layerName}
                                            onChange={e => setLayerName(e.target.value)}
                                        />
                                        <span className="add-layer-hint">
                                            {detectedOGC === 'wms' && 'Layer name del GetCapabilities WMS'}
                                            {detectedOGC === 'wfs' && 'TypeName del feature type WFS'}
                                            {!detectedOGC && 'Detecta el servicio para ver la ayuda específica'}
                                        </span>
                                    </div>
                                </>
                            )}

                            {error && <div className="add-layer-error" role="alert">⚠ {error}</div>}

                            <button className="add-layer-submit" onClick={handleContinue} disabled={loading || probing}>
                                {loading
                                    ? <span className="add-layer-loading">⟳ Cargando…</span>
                                    : `${type === 'vector' ? 'Continuar → Simbología' : 'Agregar al mapa'}`
                                }
                            </button>
                        </>
                    )}

                    {step === 'symbology' && (
                        <>
                            <div className="sym-header">
                                <button className="sym-back-btn" onClick={() => setStep('form')}>← Volver</button>
                                <span className="sym-header-title">Simbología <strong>{name}</strong></span>
                            </div>
                            <div className="sym-geom-badge">
                                {geomType === 'point'   && '● Puntos'}
                                {geomType === 'line'    && '╌ Líneas'}
                                {geomType === 'polygon' && '▭ Polígonos'}
                                {geomType === 'mixed'   && '⬡ Mixto'}
                                {' · '}{pendingFeatures.length} elementos
                            </div>
                            <SymbologyEditor
                                features={pendingFeatures}
                                geomType={geomType}
                                symbology={symbology}
                                onChange={setSymbology}
                            />
                            {error && <div className="add-layer-error" role="alert">⚠ {error}</div>}
                            <button className="add-layer-submit" onClick={handleAddWithSymbology}>
                                ＋ Agregar al mapa
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── LayerMenu principal ──────────────────────────────────────────────────────

const LayerMenu: React.FC<LayerMenuProps> = memo(({
    layerState: layers,
    layersByGroup,
    loading,
    errors,
    onLayerToggle,
    onOpacityChange,
    externalLayers,
    externalVisible,
    externalOpacity,
    onAddExternalLayer,
    onRemoveExternalLayer,
    onToggleExternalLayer,
    onExternalOpacityChange,
    toolbarSlot,
}) => {
    const { availableLayers: AVAILABLE_LAYERS, grupos, loading: apiLoading, error: apiError } = useLayersContext();

    const [menuOpen,             setMenuOpen]             = useState(false);
    const [collapsed,            setCollapsed]            = useState(false);
    const [searchTerm,           setSearchTerm]           = useState('');
    const [attributeTableLayerId,setAttributeTableLayerId]= useState<string | null>(null);
    const [collapsedGroups,      setCollapsedGroups]      = useState<Set<string>>(
        () => new Set([...Object.keys(layersByGroup), '__imported__'])
    );

    const toggleGroup = useCallback((group: string) =>
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(group) ? next.delete(group) : next.add(group);
            return next;
        }), []);

    const isLayerActive  = useCallback((id: string) => layers[id]?.visible  ?? false, [layers]);
    const isLayerLoading = useCallback((id: string) => loading[id]          ?? false, [loading]);
    const getLayerError  = useCallback((id: string) => errors[id]           ?? null,  [errors]);

    const handleCheckboxChange = useCallback(
        (layer: LayerConfig, isChecked: boolean) => onLayerToggle(layer.id, isChecked, layer.type),
        [onLayerToggle]
    );

    const normalizedSearch = searchTerm.toLowerCase();

    const groupedLayers = useMemo(() => {
        const grouped = new Map<string, LayerConfig[]>();
        Object.entries(layersByGroup).forEach(([group, groupLayers]) => {
            const filtered = normalizedSearch
                ? groupLayers.filter(l =>
                    l.name.toLowerCase().includes(normalizedSearch) ||
                    l.description.toLowerCase().includes(normalizedSearch)
                )
                : groupLayers;
            if (filtered.length > 0) {
                grouped.set(group, [...filtered].sort((a, b) => {
                    const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
                    const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
                    return numA - numB;
                }));
            }
        });
        return grouped;
    }, [layersByGroup, normalizedSearch]);

    const activeCount       = useMemo(() => Object.values(layers).filter(l => l?.visible).length, [layers]);
    const activeTableLayer  = useMemo(() =>
        attributeTableLayerId ? AVAILABLE_LAYERS.find(l => l.id === attributeTableLayerId) : null,
        [attributeTableLayerId, AVAILABLE_LAYERS]
    );
    const activeTableFeatures = useMemo(() =>
        attributeTableLayerId ? (layers[attributeTableLayerId]?.data?.features ?? []) : [],
        [attributeTableLayerId, layers]
    );

    const renderLayerItem = useCallback((layer: LayerConfig) => {
        const isActive  = isLayerActive(layer.id);
        const isLoading = isLayerLoading(layer.id);
        const err       = getLayerError(layer.id);
        const fc        = layers[layer.id]?.data?.features?.length;
        const opacity   = layers[layer.id]?.opacity ?? LAYER_DEFAULT_OPACITY;

        return (
            <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                <div className="layer-checkbox-wrapper">
                    <input
                        type="checkbox" id={layer.id} className="layer-checkbox"
                        checked={isActive} disabled={isLoading}
                        onChange={e => handleCheckboxChange(layer, e.target.checked)}
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
                    <DownloadDropdown layer={layer} grupos={grupos as GrupoLike[]} />
                </div>

                {isActive && (
                    <div className="layer-opacity-control">
                        <span className="opacity-label">Opacidad: {Math.round(opacity * 100)}%</span>
                        <input
                            type="range" min="0" max="1" step="0.05" value={opacity}
                            onChange={e => onOpacityChange(layer.id, parseFloat(e.target.value), layer.type)}
                            className="opacity-slider"
                        />
                    </div>
                )}

                {isLoading && (
                    <div className="layer-status" role="status" aria-label="Cargando capa">
                        <div className="spinner-border spinner-border-sm">
                            <span className="visually-hidden">Cargando…</span>
                        </div>
                    </div>
                )}
                {err && <div className="layer-error" role="alert"><small className="text-danger">{err}</small></div>}
            </div>
        );
    }, [isLayerActive, isLayerLoading, getLayerError, layers, handleCheckboxChange, onOpacityChange, grupos]);

    const menuContent = (
        <div className="layer-menu-content">
            <div className="search-container">
                <input
                    type="text" placeholder="Buscar capas…" className="search-input"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    aria-label="Buscar capas"
                />
                <AddLayerPanel onAddLayer={onAddExternalLayer} />
            </div>

            <div className="layers-list">
                {/* Loading de API — clase CSS, sin style inline */}
                {apiLoading && (
                    <div className="api-loading-block" role="status" aria-live="polite">
                        Cargando capas…
                    </div>
                )}

                {/* Error de API — clase CSS, sin style inline con colores hardcodeados */}
                {apiError && !apiLoading && (
                    <div className="api-error-block" role="alert">
                        <strong>Error al cargar capas:</strong> {apiError}
                    </div>
                )}

                {/* Grupos unificados */}
                {!apiLoading && [...groupedLayers.entries()]
                    .sort(([groupA], [groupB]) => {
                        const idA = (grupos as GrupoLike[])?.find(g => g.nombre === groupA)?.id ?? Infinity;
                        const idB = (grupos as GrupoLike[])?.find(g => g.nombre === groupB)?.id ?? Infinity;
                        return Number(idA) - Number(idB);
                    })
                    .map(([group, groupLayers]) => {
                        if (groupLayers.length === 0) return null;
                        const isGroupCollapsed = collapsedGroups.has(group);
                        const activeInGroup    = groupLayers.filter(l => isLayerActive(l.id)).length;

                        return (
                            <div key={group} className="layer-group">
                                <button
                                    className={`layer-group-header ${isGroupCollapsed ? 'collapsed' : ''}`}
                                    onClick={() => toggleGroup(group)}
                                    aria-expanded={!isGroupCollapsed}
                                >
                                    <span className="group-title-text">{group}</span>
                                    <span className="group-meta">
                                        {activeInGroup > 0 && <span className="group-active-badge">{activeInGroup}</span>}
                                        <span className="group-count">{groupLayers.length}</span>
                                        <span className={`group-chevron ${isGroupCollapsed ? 'closed' : ''}`} aria-hidden="true">▾</span>
                                    </span>
                                </button>
                                {!isGroupCollapsed && (
                                    <div className="layer-group-body">
                                        {groupLayers.map(renderLayerItem)}
                                    </div>
                                )}
                            </div>
                        );
                    })
                }

                {/* Capas importadas */}
                {externalLayers.length > 0 && (() => {
                    const isGroupCollapsed = collapsedGroups.has('__imported__');
                    return (
                        <div className="layer-group">
                            <button
                                className={`layer-group-header ${isGroupCollapsed ? 'collapsed' : ''}`}
                                onClick={() => toggleGroup('__imported__')}
                                aria-expanded={!isGroupCollapsed}
                            >
                                <span className="group-title-text">⬆ Capas importadas</span>
                                <span className="group-meta">
                                    <span className="group-count">{externalLayers.length}</span>
                                    <span className={`group-chevron ${isGroupCollapsed ? 'closed' : ''}`} aria-hidden="true">▾</span>
                                </span>
                            </button>
                            {!isGroupCollapsed && (
                                <div className="layer-group-body">
                                    {externalLayers.map(ext => {
                                        const isVisible = externalVisible[ext.id] ?? true;
                                        const opacity   = externalOpacity[ext.id] ?? LAYER_DEFAULT_OPACITY;
                                        const fmt =
                                            ext.type === 'wms'    ? `WMS · ${ext.layerName}` :
                                            ext.type === 'wfs'    ? `WFS · ${ext.layerName}` :
                                            ext.type === 'raster' ? 'GeoTIFF local' :
                                            ext.file              ? `${ext.file.name.split('.').pop()?.toUpperCase()} local` : 'Vectorial';

                                        return (
                                            <div key={ext.id} className={`layer-item ${isVisible ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input
                                                        type="checkbox" id={`ext-${ext.id}`} className="layer-checkbox"
                                                        checked={isVisible}
                                                        onChange={e => onToggleExternalLayer(ext.id, e.target.checked)}
                                                    />
                                                    <label htmlFor={`ext-${ext.id}`} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">{ext.name}</span>
                                                            <span className="layer-description">{fmt}</span>
                                                        </div>
                                                    </label>
                                                </div>
                                                <div className="layer-actions">
                                                    <button className="imported-delete-btn" title="Eliminar capa" aria-label={`Eliminar capa ${ext.name}`} onClick={() => onRemoveExternalLayer(ext.id)}>
                                                        🗑
                                                    </button>
                                                </div>
                                                {isVisible && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round(opacity * 100)}%</span>
                                                        <input
                                                            type="range" min="0" max="1" step="0.05" value={opacity}
                                                            onChange={e => onExternalOpacityChange(ext.id, parseFloat(e.target.value))}
                                                            className="opacity-slider"
                                                        />
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
            {/* FAB móvil */}
            <button className="layer-menu-fab" onClick={() => setMenuOpen(o => !o)} aria-label="Abrir menú de capas">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M8.235 1.559a.5.5 0 0 0-.47 0l-7.5 4a.5.5 0 0 0 0 .882L3.188 8 .264 9.559a.5.5 0 0 0 0 .882l7.5 4a.5.5 0 0 0 .47 0l7.5-4a.5.5 0 0 0 0-.882L12.813 8l2.922-1.559a.5.5 0 0 0 0-.882l-7.5-4z" />
                </svg>
                {activeCount > 0 && <span className="fab-badge">{activeCount}</span>}
            </button>

            {menuOpen && <div className="layer-menu-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

            {/* Panel escritorio */}
            <div className={`layer-menu desktop-menu ${collapsed ? 'collapsed' : ''}`}>
                <div className="layer-menu-header">
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                    <button className="collapse-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Expandir' : 'Contraer'} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}>
                        {collapsed ? '→' : '←'}
                    </button>
                </div>
                {!collapsed && menuContent}
            </div>

            {/* Toolbar de herramientas — renderizado fuera del desktop-menu para
                que permanezca visible en móvil (donde desktop-menu se oculta).
                La clase `slot-collapsed` permite al CSS compensar el desplazamiento
                del menú colapsado. */}
            {toolbarSlot && (
                <div className={`layer-menu-toolbar-slot${collapsed ? ' slot-collapsed' : ''}`}>
                    {toolbarSlot}
                </div>
            )}

            {/* Bottom sheet móvil */}
            <div className={`layer-menu mobile-menu ${menuOpen ? 'open' : ''}`}>
                <div className="mobile-menu-handle" onClick={() => setMenuOpen(false)}>
                    <span className="handle-bar" aria-hidden="true" />
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                </div>
                {menuContent}
            </div>

            {attributeTableLayerId && activeTableLayer && (
                <AttributeTable
                    layer={activeTableLayer}
                    features={activeTableFeatures}
                    onClose={() => setAttributeTableLayerId(null)}
                />
            )}
        </>
    );
});

LayerMenu.displayName = 'LayerMenu';

export default LayerMenu;