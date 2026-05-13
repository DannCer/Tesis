/**
 * @fileoverview AddDataTool — Panel flotante para agregar capas externas.
 *
 * Extraído de LayerMenu y convertido en herramienta del toolbar.
 * Soporta: Vectorial (GeoJSON/KML/KMZ/SHP), Ráster (GeoTIFF), Servicio OGC (WMS/WFS).
 *
 * @module components/map/tools/AddDataTool
 */

import React, { useState, useCallback, useRef, useMemo, memo } from 'react';
import { config, logger } from '@config/env';
import { fileToGeoJSON, VECTOR_ACCEPT } from '@utils/geo/fileToGeoJSON';
import { loadGeoTIFF } from '@utils/geo/georasterLoader';
import {
    SymbologyStyle, SymbologyMode, GeomType, DEFAULT_SYMBOLOGY,
    detectGeomType, extractFields, autoCategorize,
    classifyFeatures, getRampGradientCSS, RAMP_NAMES,
} from '@utils/geo/symbologyUtils';
import type { ExternalLayer } from '@types/geo';
import { CAPABILITIES_TIMEOUT_MS } from '@config/constants';
import '@styles/AddDataTool.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AddLayerType = 'vector' | 'raster' | 'ogc';

interface AddDataToolProps {
    isOpen:     boolean;
    onClose:    () => void;
    onAddLayer: (layer: ExternalLayer) => void;
}

// ─── Helpers OGC ──────────────────────────────────────────────────────────────

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
                await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(CAPABILITIES_TIMEOUT_MS) })
            ).text();
        } catch { return ''; }
    };

    const wms = await tryFetch('service=WMS&request=GetCapabilities');
    if (wms.includes('WMS_Capabilities') || wms.includes('WMT_MS_Capabilities')) return 'wms';
    const wfs = await tryFetch('service=WFS&request=GetCapabilities');
    if (wfs.includes('WFS_Capabilities') || wfs.includes('FeatureTypeList')) return 'wfs';
    return null;
}

// ─── Opciones de tipo de capa ──────────────────────────────────────────────────

const LAYER_TYPE_OPTIONS = [
    { value: 'vector' as AddLayerType, label: 'Vectorial', icon: '📂', desc: 'GeoJSON, KML, KMZ, SHP' },
    { value: 'raster' as AddLayerType, label: 'Ráster',    icon: '🛰️', desc: 'GeoTIFF (.tif)' },
    { value: 'ogc'    as AddLayerType, label: 'Servicio',  icon: '🌐', desc: 'WMS / WFS' },
] as const;

// ─── SymbologyEditor ──────────────────────────────────────────────────────────

interface SymbologyEditorProps {
    features:  GeoJSON.Feature[];
    geomType:  GeomType;
    symbology: SymbologyStyle;
    onChange:  (s: SymbologyStyle) => void;
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
            <div className="sym-field">
                <label className="sym-label">Modo</label>
                <div className="sym-mode-btns">
                    {(['simple', 'categorized', 'expression'] as SymbologyMode[]).map(m => (
                        <button key={m} className={`sym-mode-btn ${symbology.mode === m ? 'active' : ''}`} onClick={() => handleModeChange(m)}>
                            {m === 'simple' ? 'Simple' : m === 'categorized' ? 'Categorizado' : 'Expresión'}
                        </button>
                    ))}
                </div>
            </div>

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
                    <div className="sym-field">
                        <label className="sym-label">Rampa de color</label>
                        <div className="sym-ramp-grid">
                            {RAMP_NAMES.map(ramp => (
                                <button key={ramp} className={`sym-ramp-btn ${symbology.ramp === ramp ? 'active' : ''}`} onClick={() => updateSym({ ramp })} title={ramp}>
                                    <span className="sym-ramp-preview" style={{ background: getRampGradientCSS(ramp) }} />
                                    <span className="sym-ramp-name">{ramp}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {symbology.mode === 'categorized' && (
                <>
                    <div className="sym-field">
                        <label className="sym-label">Campo</label>
                        <div className="sym-field-row">
                            <select className="sym-select" value={symbology.field ?? ''} onChange={e => {
                                const field = e.target.value;
                                const cats  = autoCategorize(features, field);
                                updateSym({ field, categories: cats });
                            }}>
                                {fields.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                            <button className="sym-reclassify-btn" onClick={handleReclassify}>↺ Reclasificar</button>
                        </div>
                    </div>
                    {symbology.categories && symbology.categories.length > 0 && (
                        <div className="sym-categories">
                            {symbology.categories.map(cat => (
                                <div key={String(cat.value)} className="sym-category-row">
                                    <input type="color" value={cat.color} onChange={e => handleCategoryColorChange(String(cat.value), e.target.value)} className="sym-cat-color" />
                                    <span className="sym-cat-label">{String(cat.value)}</span>
                                    <span className="sym-cat-count">({cat.count})</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {symbology.mode === 'expression' && (
                <div className="sym-field">
                    <label className="sym-label">Expresión JavaScript</label>
                    <textarea className="sym-expression-input" value={symbology.expression ?? ''} onChange={e => updateSym({ expression: e.target.value })} placeholder={'// Ejemplo:\nfeature.properties.tipo === "A" ? "#e74c3c" : "#3498db"'} rows={4} />
                    <button className="sym-test-btn" onClick={handleExpressionTest}>▶ Probar expresión</button>
                </div>
            )}
        </div>
    );
};

// ─── AddDataTool ──────────────────────────────────────────────────────────────

const AddDataTool: React.FC<AddDataToolProps> = ({ isOpen, onClose, onAddLayer }) => {
    const [step,            setStep]            = useState<'form' | 'symbology'>('form');
    const [type,            setType]            = useState<AddLayerType>('vector');
    const [name,            setName]            = useState('');
    const [url,             setUrl]             = useState('');
    const [layerName,       setLayerName]       = useState('');
    const [file,            setFile]            = useState<File | null>(null);
    const [loading,         setLoading]         = useState(false);
    const [error,           setError]           = useState<string | null>(null);
    const [detectedOGC,     setDetectedOGC]     = useState<'wms' | 'wfs' | null>(null);
    const [probing,         setProbing]         = useState(false);
    const [pendingFeatures, setPendingFeatures] = useState<GeoJSON.Feature[]>([]);
    const [geomType,        setGeomType]        = useState<GeomType>('polygon');
    const [symbology,       setSymbology]       = useState<SymbologyStyle>(DEFAULT_SYMBOLOGY);
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = useCallback(() => {
        setStep('form'); setType('vector'); setName(''); setUrl('');
        setLayerName(''); setFile(null); setError(null); setDetectedOGC(null);
        setPendingFeatures([]); setGeomType('polygon'); setSymbology(DEFAULT_SYMBOLOGY);
    }, []);

    const handleClose = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

    const handleTypeChange = useCallback((t: AddLayerType) => {
        setType(t); setError(null); setFile(null); setDetectedOGC(null);
    }, []);

    const handleUrlChange = useCallback((v: string) => {
        setUrl(v);
        const guessed = guessOGC(v);
        setDetectedOGC(guessed);
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
                reset(); onClose();
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
            reset(); onClose();
        }
    }, [type, name, url, layerName, file, detectedOGC, onAddLayer, reset, onClose]);

    const handleAddWithSymbology = useCallback(() => {
        const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: pendingFeatures };
        onAddLayer({ id: `ext_${Date.now()}`, name, type: 'vector', url: '', file: file ?? undefined, geojsonData: fc, symbology });
        reset(); onClose();
    }, [pendingFeatures, name, file, symbology, onAddLayer, reset, onClose]);

    if (!isOpen) return null;

    return (
        <div className="adt-panel" role="dialog" aria-label="Agregar capa">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="adt-header">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                </svg>
                <span className="adt-header-title">Añadir datos</span>
                <button className="adt-close-btn" onClick={handleClose} aria-label="Cerrar">✕</button>
            </div>

            {/* ── Contenido ──────────────────────────────────────────── */}
            <div className="adt-body">

                {step === 'form' && (
                    <>
                        {/* Tipo de capa */}
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

                        {/* Nombre */}
                        <div className="add-layer-field">
                            <label className="add-layer-label">Nombre</label>
                            <input
                                type="text"
                                className="add-layer-input"
                                placeholder="Nombre para mostrar"
                                value={name}
                                onChange={e => setName(e.target.value)}
                            />
                        </div>

                        {/* Archivo vectorial / raster */}
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
                                            ⬆ {type === 'vector'
                                                ? 'GeoJSON · KML · KMZ · Shapefile (.zip)'
                                                : 'Arrastra o haz clic para seleccionar'}
                                        </span>
                                    }
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept={type === 'vector' ? VECTOR_ACCEPT : '.tif,.tiff'}
                                        style={{ display: 'none' }}
                                        onChange={handleFileChange}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Servicio OGC */}
                        {type === 'ogc' && (
                            <>
                                <div className="add-layer-field">
                                    <label className="add-layer-label">URL del servicio</label>
                                    <div className="ogc-url-row">
                                        <input
                                            type="url"
                                            className="add-layer-input"
                                            placeholder="http://qgis-server/...?MAP=/ruta/proyecto.qgz"
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
                                        type="text"
                                        className="add-layer-input"
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
                                : type === 'vector' ? 'Continuar → Simbología' : 'Agregar al mapa'
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
        </div>
    );
};

export default AddDataTool;