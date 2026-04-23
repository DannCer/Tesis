/**
 * PrintDesigner — Diseñador de impresión.
 * v2: Corrige deformación en vista previa + añade vista previa WMS en vivo.
 *
 * Fix deformación: El viewBox del SVG ahora coincide con las dimensiones reales
 * del papel (en mm), eliminando el estiramiento asimétrico que causaba la distorsión.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import L from 'leaflet';
import {
    PAPER_SIZES, DPI_OPTIONS, STANDARD_SCALES,
    buildGetMapUrl, openPrintWindow,
    estimateScale, snapToStandardScale,
    getPageMm, fmtScale,
    type PrintJob, type PrintOrient, type PrintDPI,
} from '../../../services/print/printService';
import { useLayersContext } from '@contexts/LayersContext';
import type { LayerData } from '@hooks/map';
import '@styles/PrintDesigner.css';

// ─── Mapas base disponibles ───────────────────────────────────────────────────

const BASE_MAPS = [
    { id: 'osm',         name: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                                                              thumb: '🗺️' },
    { id: 'esri-sat',    name: 'ESRI Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',                    thumb: '🛰️' },
    { id: 'esri-street', name: 'ESRI Calles',   url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',                 thumb: '🏙️' },
    { id: 'topo',        name: 'Topográfico',   url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',                                                                thumb: '⛰️' },
    { id: 'none',        name: 'Sin mapa base', url: '',                                                                                                                thumb: '⬜' },
];

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface AllLayerEntry { visible?: boolean; opacity?: number; name?: string; }
interface PrintDesignerProps {
    mapInstance: L.Map | null;
    allLayers:   Record<string, AllLayerEntry & Partial<LayerData>>;
    onClose:     () => void;
}

// ─── Vista previa de hoja (esquema SVG) ──────────────────────────────────────
//
// CORRECCIÓN DE DEFORMACIÓN:
// El problema original era usar viewBox="0 0 100 100" (cuadrado) con
// preserveAspectRatio="none". Cuando el contenedor tiene el ratio del papel
// (no cuadrado), el SVG se estiraba asimétricamente: 1 unidad en X no
// correspondía al mismo tamaño físico que 1 unidad en Y.
//
// Solución: usar viewBox="0 0 {pw} {ph}" donde pw/ph son las dimensiones
// reales del papel en mm. Así 1 unidad SVG = 1 mm en ambos ejes,
// y al renderizar en un contenedor con el mismo ratio no hay ninguna distorsión.

const SheetPreview: React.FC<{
    pageMm:     [number, number];
    extent?:    [number, number, number, number];
    layerCount: number;
    baseThumb:  string;
}> = ({ pageMm, extent, layerCount, baseThumb }) => {

    const MAX_W = 240, MAX_H = 200;
    const [pw, ph] = pageMm;
    const ratio = pw / ph;
    let w = MAX_W, h = w / ratio;
    if (h > MAX_H) { h = MAX_H; w = h * ratio; }

    // Helpers: convierten coordenadas en porcentaje (0–100) → mm del papel
    const xp = (p: number) => pw * p / 100;
    const yp = (p: number) => ph * p / 100;
    // Tamaños escalados por la dimensión menor para mantener proporciones visuales
    const fs = (s: number) => Math.min(pw, ph) * s / 100;
    const sw = (s: number) => Math.min(pw, ph) * s / 100;

    const c = (n: number) => n.toFixed(3);

    return (
        <div className="pd-sheet" style={{ width: Math.round(w), height: Math.round(h) }}>
            {/*
              * viewBox usa las dimensiones reales del papel en mm.
              * El contenedor ya tiene exactamente el mismo ratio → sin distorsión.
              */}
            <svg
                viewBox={`0 0 ${pw} ${ph}`}
                width="100%"
                height="100%"
                preserveAspectRatio="none"
            >
                <rect x="0" y="0" width={pw} height={ph} fill="#d4e8f5"/>

                {[25, 50, 75].map(v => (
                    <g key={v}>
                        <line x1={xp(v)} y1="0"   x2={xp(v)} y2={ph}   stroke="#b5d0e8" strokeWidth={sw(0.4)}/>
                        <line x1="0"    y1={yp(v)} x2={pw}    y2={yp(v)} stroke="#b5d0e8" strokeWidth={sw(0.4)}/>
                    </g>
                ))}

                {/* Panel leyenda */}
                <rect x={xp(78)} y="0" width={xp(22)} height={ph} fill="#fafafa" opacity="0.9"/>
                <line x1={xp(78)} y1="0" x2={xp(78)} y2={ph} stroke="#c8b0d4" strokeWidth={sw(0.6)}/>
                <text x={xp(89)} y={yp(10)} textAnchor="middle" fontSize={fs(3)} fill="#8d1c3d" fontWeight="bold">SIM</text>

                {/* Marco del mapa */}
                <rect x={xp(4)} y={yp(12)} width={xp(74)} height={yp(80)} fill="none" stroke="#4a90d9" strokeWidth={sw(1.2)}/>

                {/* Badge de capas */}
                {layerCount > 0 && (
                    <>
                        <rect x={xp(4)} y={yp(12)} width={xp(20)} height={yp(6)} rx={sw(0.8)} fill="rgba(141,28,61,.85)"/>
                        <text x={xp(14)} y={yp(16.5)} textAnchor="middle" fontSize={fs(3)} fill="white">{layerCount} cap.</text>
                    </>
                )}

                {/* Rosa de los vientos — proporcional al papel, sin distorsión */}
                <polygon
                    points={`${xp(89)},${yp(55)} ${xp(91)},${yp(62)} ${xp(89)},${yp(60)} ${xp(87)},${yp(62)}`}
                    fill="#8d1c3d"
                />
                <polygon
                    points={`${xp(89)},${yp(69)} ${xp(91)},${yp(62)} ${xp(89)},${yp(64)} ${xp(87)},${yp(62)}`}
                    fill="#ccc"
                />
                <text x={xp(89)} y={yp(54)} textAnchor="middle" fontSize={fs(3)} fill="#8d1c3d" fontWeight="bold">N</text>

                {/* Cruceta */}
                <line x1={xp(38)} y1={yp(52)} x2={xp(44)} y2={yp(52)} stroke="#e74c3c" strokeWidth={sw(0.9)}/>
                <line x1={xp(41)} y1={yp(49)} x2={xp(41)} y2={yp(55)} stroke="#e74c3c" strokeWidth={sw(0.9)}/>
            </svg>

            {extent && (
                <>
                    <span className="pd-sheet-coord pd-sheet-tl">{c(extent[1])},{c(extent[0])}</span>
                    <span className="pd-sheet-coord pd-sheet-br">{c(extent[3])},{c(extent[2])}</span>
                </>
            )}
            <span className="pd-sheet-base">{baseThumb}</span>
        </div>
    );
};

// ─── Vista previa WMS en vivo ─────────────────────────────────────────────────

const LiveMapPreview: React.FC<{
    url:      string;
    pageMm:   [number, number];
    loading:  boolean;
    error:    boolean;
    noLayers: boolean;
    onLoad:   () => void;
    onError:  () => void;
}> = ({ url, pageMm, loading, error, noLayers, onLoad, onError }) => {

    const MAX_W = 240, MAX_H = 200;
    const [pw, ph] = pageMm;
    const ratio = pw / ph;
    let w = MAX_W, h = w / ratio;
    if (h > MAX_H) { h = MAX_H; w = h * ratio; }

    return (
        <div className="pd-live-wrap" style={{ width: Math.round(w), height: Math.round(h) }}>
            {url && (
                <img
                    key={url}
                    src={url}
                    alt="Vista previa capas WMS"
                    className="pd-live-img"
                    style={{ display: loading ? 'none' : 'block' }}
                    onLoad={onLoad}
                    onError={onError}
                />
            )}
            {loading && (
                <div className="pd-live-overlay">
                    <span className="pd-spin"/> Actualizando…
                </div>
            )}
            {!loading && error && (
                <div className="pd-live-overlay pd-live-overlay--err">
                    ⚠ Sin respuesta del servidor WMS
                    <small>Verifica la conexión al servidor</small>
                </div>
            )}
            {!loading && !error && noLayers && (
                <div className="pd-live-overlay pd-live-overlay--empty">
                    <span>👁 Activa capas y configura una extensión para ver la vista previa en vivo</span>
                </div>
            )}
        </div>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const PrintDesigner: React.FC<PrintDesignerProps> = ({ mapInstance, allLayers, onClose }) => {
    const { availableLayers: AVAILABLE_LAYERS } = useLayersContext();

    const [paperId,    setPaperId]    = useState('a4');
    const [orient,     setOrient]     = useState<PrintOrient>('landscape');
    const [customW,    setCustomW]    = useState(297);
    const [customH,    setCustomH]    = useState(420);
    const [dpi,        setDpi]        = useState<PrintDPI>(150);
    const [baseMapId,  setBaseMapId]  = useState('osm');
    const [useProj,    setUseProj]    = useState<'vector' | 'raster'>('vector');
    const [scaleMode,  setScaleMode]  = useState<'auto' | 'fixed'>('auto');
    const [fixedScale, setFixedScale] = useState(50_000);
    const [title,      setTitle]      = useState('');
    const [subtitle,   setSubtitle]   = useState('');
    const [author,     setAuthor]     = useState('');
    const [notes,      setNotes]      = useState('');
    const [extMode,    setExtMode]    = useState<'current' | 'manual'>('current');
    const [bboxTxt,    setBboxTxt]    = useState('');
    const [showAdv,    setShowAdv]    = useState(false);
    const [template,   setTemplate]   = useState('');
    const [status,     setStatus]     = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
    const [statusMsg,  setStatusMsg]  = useState('');
    const [mapUrl,     setMapUrl]     = useState('');
    const [urlCopied,  setUrlCopied]  = useState(false);

    // Vista previa en vivo
    const [previewMode, setPreviewMode] = useState<'scheme' | 'live'>('scheme');
    const [liveUrl,     setLiveUrl]     = useState('');
    const [liveLoading, setLiveLoading] = useState(false);
    const [liveError,   setLiveError]   = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Capas activas
    const activeLyrList = useMemo(() =>
        AVAILABLE_LAYERS
            .filter(l => allLayers[l.id]?.visible === true)
            .map(l => ({
                id:      l.id,
                wmsName: l.wmsLayer ?? l.wfsName ?? l.id,
                name:    l.name,
                opacity: allLayers[l.id]?.opacity ?? 0.8,
            }))
    , [allLayers]);

    const [layerOn, setLayerOn] = useState<Record<string, boolean>>({});
    useEffect(() => {
        setLayerOn(prev => {
            const next: Record<string, boolean> = {};
            activeLyrList.forEach(l => { next[l.id] = prev[l.id] ?? true; });
            return next;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeLyrList.length]);

    // Extent
    const currentExtent = useMemo((): [number, number, number, number] | null => {
        if (!mapInstance) return null;
        const b = mapInstance.getBounds();
        return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    }, [mapInstance]);

    const parsedBbox = useMemo((): [number, number, number, number] | null => {
        const p = bboxTxt.split(',').map(s => parseFloat(s.trim()));
        if (p.length === 4 && p.every(isFinite)) return p as any;
        return null;
    }, [bboxTxt]);

    const extent = extMode === 'current' ? currentExtent : parsedBbox;

    // Papel
    const paper  = PAPER_SIZES.find(p => p.id === paperId) ?? PAPER_SIZES[0];
    const pageMm = getPageMm(paper, orient, paper.custom ? [customW, customH] : undefined);

    // Escala
    const autoScale    = extent ? estimateScale(extent, pageMm[0]) : null;
    const displayScale = scaleMode === 'fixed' ? fixedScale
        : autoScale ? snapToStandardScale(autoScale) : null;

    // Mapa base
    const baseMap = BASE_MAPS.find(b => b.id === baseMapId) ?? BASE_MAPS[0];

    // Capas habilitadas
    const enabledLayers = activeLyrList.filter(l => layerOn[l.id] !== false);

    // Job de impresión
    const buildJob = useCallback((): PrintJob | null => {
        if (!extent) return null;
        return {
            paper, orientation: orient,
            customMm:    paper.custom ? [customW, customH] : undefined,
            dpi, extent, crs: 'EPSG:4326',
            layers:      enabledLayers.map(l => ({ wmsName: l.wmsName, opacity: l.opacity, name: l.name })),
            useProject:  useProj,
            baseMapUrl:  baseMap.url,
            baseMapName: baseMap.name,
            scaleMode,
            fixedScale:  scaleMode === 'fixed' ? fixedScale : undefined,
            title:    title    || undefined,
            subtitle: subtitle || undefined,
            author:   author   || undefined,
            notes:    notes    || undefined,
            template: template || undefined,
        };
    }, [extent, enabledLayers, paper, orient, customW, customH, dpi, useProj, baseMap, scaleMode, fixedScale, title, subtitle, author, notes, template]);

    // Vista previa WMS en vivo — debounce 700 ms para no saturar el servidor
    useEffect(() => {
        if (previewMode !== 'live') return;
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (!extent || enabledLayers.length === 0) {
            setLiveUrl('');
            setLiveLoading(false);
            return;
        }

        // Job de preview: mismo papel/orient pero DPI=96 para rapidez
        const previewJob: PrintJob = {
            paper, orientation: orient,
            customMm:    paper.custom ? [customW, customH] : undefined,
            dpi:         96,
            extent, crs: 'EPSG:4326',
            layers:      enabledLayers.map(l => ({ wmsName: l.wmsName, opacity: l.opacity, name: l.name })),
            useProject:  useProj,
            baseMapUrl:  '',
            baseMapName: '',
            scaleMode:   'auto',
        };

        debounceRef.current = setTimeout(() => {
            const url = buildGetMapUrl(previewJob);
            if (url) {
                setLiveUrl(url);
                setLiveLoading(true);
                setLiveError(false);
            }
        }, 700);

        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [previewMode, JSON.stringify(extent), enabledLayers.map(l => l.id + l.opacity).join(','), paper.id, orient, customW, customH, useProj]);

    const handleOpen = useCallback(() => {
        const job = buildJob();
        if (!job) { setStatus('err'); setStatusMsg('Sin extensión de mapa disponible.'); return; }
        const ok = openPrintWindow(job);
        if (ok) { setStatus('ok'); setStatusMsg('Vista de impresión abierta. Usa Ctrl+P → Guardar como PDF.'); }
    }, [buildJob]);

    const handleShowUrl = () => {
        const job = buildJob();
        if (!job) return;
        setMapUrl(buildGetMapUrl(job) ?? '');
    };

    const handleCopyUrl = () => {
        navigator.clipboard.writeText(mapUrl).catch(() => {});
        setUrlCopied(true);
        setTimeout(() => setUrlCopied(false), 2000);
    };

    // ─── JSX ─────────────────────────────────────────────────────────────────

    return ReactDOM.createPortal(
        <div className="pd-overlay" onClick={onClose}>
            <div className="pd-modal" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="pd-header">
                    <div className="pd-header-left">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>
                            <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/>
                        </svg>
                        <div>
                            <div className="pd-title">Diseñador de impresión</div>
                            <div className="pd-subtitle">Mapa base + capas WMS + leyenda · Sin template QGIS</div>
                        </div>
                    </div>
                    <button className="pd-close" onClick={onClose}>✕</button>
                </div>

                {/* Body */}
                <div className="pd-body">

                    {/* ══ Columna izquierda: opciones ══ */}
                    <div className="pd-col">

                        <div className="pd-section">
                            <div className="pd-section-title">📄 Tamaño de hoja</div>
                            <div className="pd-paper-grid">
                                {PAPER_SIZES.map(p => (
                                    <button key={p.id}
                                        className={`pd-paper-btn ${paperId === p.id ? 'active' : ''}`}
                                        onClick={() => setPaperId(p.id)}>
                                        <span className="pd-paper-name">{p.label}</span>
                                        {!p.custom && <span className="pd-paper-mm">{p.mm[0]}×{p.mm[1]}</span>}
                                    </button>
                                ))}
                            </div>
                            {paper.custom && (
                                <div className="pd-custom-mm">
                                    <div className="pd-field"><label className="pd-label">Ancho mm</label>
                                        <input type="number" className="pd-input-sm" min={50} max={2000} value={customW} onChange={e => setCustomW(+e.target.value)}/></div>
                                    <span className="pd-x">×</span>
                                    <div className="pd-field"><label className="pd-label">Alto mm</label>
                                        <input type="number" className="pd-input-sm" min={50} max={2000} value={customH} onChange={e => setCustomH(+e.target.value)}/></div>
                                </div>
                            )}
                            <div className="pd-orient-row">
                                {(['portrait', 'landscape'] as PrintOrient[]).map(v => (
                                    <button key={v} className={`pd-orient-btn ${orient === v ? 'active' : ''}`} onClick={() => setOrient(v)}>
                                        <svg viewBox={v === 'portrait' ? '0 0 18 24' : '0 0 24 18'}
                                            width={v === 'portrait' ? 14 : 18} height={v === 'portrait' ? 18 : 14}>
                                            <rect x="1" y="1" width={v === 'portrait' ? 16 : 22} height={v === 'portrait' ? 22 : 16} rx="1.5" fill="none" stroke="currentColor" strokeWidth="2"/>
                                        </svg>
                                        {v === 'portrait' ? 'vertical' : 'horizontal'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pd-section">
                            <div className="pd-section-title">🖨️ Resolución</div>
                            <div className="pd-dpi-grid">
                                {DPI_OPTIONS.map(o => (
                                    <button key={o.value}
                                        className={`pd-dpi-btn ${dpi === o.value ? 'active' : ''}`}
                                        onClick={() => setDpi(o.value)}>
                                        <span className="pd-dpi-n">{o.label}</span>
                                        <span className="pd-dpi-h">{o.hint}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pd-section">
                            <div className="pd-section-title">📏 Escala cartográfica</div>
                            <div className="pd-tab-row">
                                <button className={`pd-tab ${scaleMode === 'auto' ? 'active' : ''}`} onClick={() => setScaleMode('auto')}>Automática</button>
                                <button className={`pd-tab ${scaleMode === 'fixed' ? 'active' : ''}`} onClick={() => setScaleMode('fixed')}>Fija</button>
                            </div>
                            {scaleMode === 'auto' && autoScale && (
                                <div className="pd-scale-tag">
                                    Calculada: <strong>{fmtScale(autoScale)}</strong>
                                    <span className="pd-hint" style={{ marginLeft: 6 }}>→ ajustada a <strong>{displayScale ? fmtScale(displayScale) : '—'}</strong></span>
                                </div>
                            )}
                            {scaleMode === 'fixed' && (
                                <div className="pd-field">
                                    <label className="pd-label">Escala estándar</label>
                                    <select className="pd-select" value={fixedScale} onChange={e => setFixedScale(+e.target.value)}>
                                        {STANDARD_SCALES.filter(s => s.value > 0).map(s => (
                                            <option key={s.value} value={s.value}>{s.label}</option>
                                        ))}
                                    </select>
                                    <span className="pd-hint">Escala 1 : N estándar para cartografía.</span>
                                </div>
                            )}
                        </div>

                        <div className="pd-section">
                            <div className="pd-section-title">🗺️ Mapa base</div>
                            <div className="pd-basemap-grid">
                                {BASE_MAPS.map(b => (
                                    <button key={b.id}
                                        className={`pd-basemap-btn ${baseMapId === b.id ? 'active' : ''}`}
                                        onClick={() => setBaseMapId(b.id)}
                                        title={b.name}>
                                        <span className="pd-basemap-icon">{b.thumb}</span>
                                        <span className="pd-basemap-name">{b.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pd-section">
                            <div className="pd-section-title">📍 Extensión</div>
                            <div className="pd-tab-row">
                                <button className={`pd-tab ${extMode === 'current' ? 'active' : ''}`} onClick={() => setExtMode('current')}>Vista actual</button>
                                <button className={`pd-tab ${extMode === 'manual' ? 'active' : ''}`} onClick={() => setExtMode('manual')}>Manual</button>
                            </div>
                            {extMode === 'current' && currentExtent && (
                                <div className="pd-bbox-pill">{currentExtent.map(n => n.toFixed(4)).join(', ')}<span className="pd-hint"> minX minY maxX maxY</span></div>
                            )}
                            {extMode === 'manual' && (
                                <div className="pd-field">
                                    <input className={`pd-input ${bboxTxt && !parsedBbox ? 'pd-input-err' : ''}`}
                                        placeholder="-99.2, 19.2, -98.9, 19.6"
                                        value={bboxTxt} onChange={e => setBboxTxt(e.target.value)}/>
                                    {bboxTxt && !parsedBbox && <span className="pd-hint pd-err">4 números separados por coma.</span>}
                                </div>
                            )}
                        </div>

                        <div className="pd-section">
                            <div className="pd-section-title">✏️ Texto</div>
                            {(['Título', 'Subtítulo', 'Autor'] as const).map((lbl, i) => {
                                const vals    = [title, subtitle, author];
                                const setters = [setTitle, setSubtitle, setAuthor];
                                const phs     = ['Título del mapa', 'Descripción breve', 'Nombre del autor'];
                                return (
                                    <div key={lbl} className="pd-field">
                                        <label className="pd-label">{lbl}</label>
                                        <input className="pd-input" value={vals[i]}
                                            onChange={e => setters[i](e.target.value)} placeholder={phs[i]}/>
                                    </div>
                                );
                            })}
                            <div className="pd-field">
                                <label className="pd-label">Notas / Fuente</label>
                                <textarea className="pd-textarea" rows={2} value={notes}
                                    onChange={e => setNotes(e.target.value)} placeholder="Fuente: INEGI 2024…"/>
                            </div>
                        </div>

                        <div className="pd-section">
                            <div className="pd-section-title">⚙️ Avanzado</div>
                            <div className="pd-field">
                                <label className="pd-label">Proyecto QGIS</label>
                                <select className="pd-select" value={useProj} onChange={e => setUseProj(e.target.value as any)}>
                                    <option value="vector">Vectorial</option>
                                    <option value="raster">Ráster</option>
                                </select>
                            </div>
                            <div className="pd-adv-toggle" onClick={() => setShowAdv(v => !v)}>
                                {showAdv ? '▾' : '▸'} Template QGIS GetPrint (opcional)
                            </div>
                            {showAdv && (
                                <div className="pd-field" style={{ marginTop: 6 }}>
                                    <input className="pd-input" value={template}
                                        onChange={e => setTemplate(e.target.value)}
                                        placeholder="Nombre del diseño en QGIS"/>
                                    <span className="pd-hint">Si está vacío se usa GetMap (sin template).</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* ══ Columna derecha: vista previa en tiempo real ══ */}
                    <div className="pd-col pd-col-right">

                        {/* Vista previa con toggle */}
                        <div className="pd-section">
                            <div className="pd-section-title">
                                👁️ Vista previa
                                <div className="pd-preview-toggle">
                                    <button
                                        className={`pd-preview-tab ${previewMode === 'scheme' ? 'active' : ''}`}
                                        onClick={() => setPreviewMode('scheme')}>
                                        Esquema
                                    </button>
                                    <button
                                        className={`pd-preview-tab ${previewMode === 'live' ? 'active' : ''}`}
                                        onClick={() => setPreviewMode('live')}>
                                        WMS en vivo
                                    </button>
                                </div>
                            </div>

                            <div className="pd-preview-center">
                                {previewMode === 'scheme' ? (
                                    <SheetPreview
                                        pageMm={pageMm}
                                        extent={extent ?? undefined}
                                        layerCount={enabledLayers.length}
                                        baseThumb={baseMap.thumb}
                                    />
                                ) : (
                                    <LiveMapPreview
                                        url={liveUrl}
                                        pageMm={pageMm}
                                        loading={liveLoading}
                                        error={liveError}
                                        noLayers={!extent || enabledLayers.length === 0}
                                        onLoad={() => setLiveLoading(false)}
                                        onError={() => { setLiveLoading(false); setLiveError(true); }}
                                    />
                                )}

                                <div className="pd-preview-tags">
                                    <span>{paper.label}{paper.custom ? ` ${customW}×${customH}mm` : ` (${pageMm[0]}×${pageMm[1]}mm)`}</span>
                                    <span>{orient === 'portrait' ? 'vertical' : 'horizontal'}</span>
                                    <span>{dpi} dpi</span>
                                    {displayScale && <span>{fmtScale(displayScale)}</span>}
                                </div>

                                {previewMode === 'live' && (
                                    <p className="pd-live-note">
                                        Muestra capas WMS. El mapa base aparece en el PDF final.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Capas y leyenda */}
                        <div className="pd-section pd-layers-section">
                            <div className="pd-section-title">
                                🗂️ Capas y leyenda
                                <span className="pd-layer-count">{enabledLayers.length}/{activeLyrList.length}</span>
                            </div>
                            {activeLyrList.length === 0
                                ? <div className="pd-empty">Sin capas activas.<br/>Actívalas desde el menú lateral.</div>
                                : (
                                    <div className="pd-layer-list">
                                        {activeLyrList.map(l => (
                                            <label key={l.id} className="pd-layer-row">
                                                <input type="checkbox" className="pd-check"
                                                    checked={layerOn[l.id] !== false}
                                                    onChange={() => setLayerOn(p => ({ ...p, [l.id]: !p[l.id] }))}/>
                                                <span className="pd-layer-name">{l.name}</span>
                                                <code className="pd-layer-wms">{l.wmsName}</code>
                                            </label>
                                        ))}
                                    </div>
                                )
                            }
                            <div className="pd-hint" style={{ marginTop: 6 }}>
                                La leyenda se genera automáticamente desde QGIS (GetLegendGraphic) y aparece en el panel lateral del mapa impreso.
                            </div>
                        </div>

                        {/* URL GetMap */}
                        <div className="pd-section">
                            <div className="pd-section-title">🔗 URL GetMap</div>
                            <button className="pd-url-gen-btn" onClick={handleShowUrl} disabled={!extent || !enabledLayers.length}>
                                Generar URL de petición
                            </button>
                            {mapUrl && (
                                <div className="pd-url-box">
                                    <input readOnly className="pd-url-input" value={mapUrl} onFocus={e => e.target.select()}/>
                                    <div className="pd-url-btns">
                                        <button className={`pd-url-btn ${urlCopied ? 'pd-url-btn--ok' : ''}`} onClick={handleCopyUrl}>
                                            {urlCopied ? '✓ Copiado' : 'Copiar'}
                                        </button>
                                        <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="pd-url-btn">Abrir ↗</a>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="pd-footer">
                    <div className="pd-status-area">
                        {status === 'busy' && <span className="pd-status pd-status--busy"><span className="pd-spin"/> {statusMsg}</span>}
                        {status === 'err'  && <span className="pd-status pd-status--err">⚠ {statusMsg}</span>}
                        {status === 'ok'   && <span className="pd-status pd-status--ok">✓ {statusMsg}</span>}
                    </div>
                    <div className="pd-footer-btns">
                        <button className="pd-btn-cancel" onClick={onClose}>Cancelar</button>
                        <button className="pd-btn-print" onClick={handleOpen}
                            disabled={!extent || status === 'busy'}>
                            {status === 'busy'
                                ? <><span className="pd-spin"/> Generando…</>
                                : <>🖨️ Abrir vista de impresión</>
                            }
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default PrintDesigner;