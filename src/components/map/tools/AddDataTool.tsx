/**
 * @fileoverview AddDataTool — Panel flotante para agregar capas externas.
 *
 * Extraído de LayerMenu y convertido en herramienta del toolbar.
 * Soporta: Vectorial (GeoJSON/KML/KMZ/SHP), Ráster (GeoTIFF), Servicio OGC (WMS/WFS).
 *
 * @module components/map/tools/AddDataTool
 */

import React, { useState, useCallback, useRef, useMemo } from 'react';
import { config, logger } from '@config/env';
import { fileToGeoJSON, VECTOR_ACCEPT } from '@utils/geo/fileToGeoJSON';
import { loadGeoTIFF } from '@utils/geo/georasterLoader';
import {
    SymbologyStyle, SymbologyMode, GeomType, DEFAULT_SYMBOLOGY,
    detectGeomType, extractFields, autoCategorize,
    getRampGradientCSS, RAMP_NAMES,
    evaluateSQLWhere,
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
        if (mode === 'categorical' && fields.length > 0) {
            const field      = symbology.field ?? fields[0];
            const categories = autoCategorize(features, field);
            updateSym({ mode, field, categories, expression: undefined });
        } else if (mode === 'expression') {
            updateSym({ mode, expression: '', fillColor: '#2ecc71', otherColor: '#e74c3c' });
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

    const [expressionResult, setExpressionResult] = useState<string | null>(null);

    const handleExpressionTest = useCallback(() => {
        if (!symbology.expression?.trim()) return;
        try {
            let matched = 0;
            let invalid = 0;
            for (const feature of features) {
                const result = evaluateSQLWhere(symbology.expression, feature.properties ?? {});
                if (result === null) { invalid++; }
                else if (result)     { matched++; }
            }
            const total = features.length;
            if (invalid === total) {
                setExpressionResult('⚠ La expresión no produjo resultados válidos.');
                logger.error('Expresión SQL: sin resultados válidos');
            } else {
                setExpressionResult(`✓ ${matched} de ${total} elementos coinciden`);
                logger.log(`Expresión SQL: ${matched}/${total} coinciden`);
            }
        } catch (e) {
            setExpressionResult('⚠ Error al evaluar la expresión.');
            logger.error('Error en expresión SQL de simbología:', e);
        }
    }, [features, symbology.expression]);

    return (
        <div className="sym-editor">

            {/* ── Selector de modo ────────────────────────────────────── */}
            <div className="sym-modes sym-modes-3">
                {(['single', 'categorical', 'expression'] as SymbologyMode[]).map(m => (
                    <button
                        key={m}
                        className={`sym-mode-btn${symbology.mode === m ? ' selected' : ''}`}
                        onClick={() => handleModeChange(m)}
                    >
                        {m === 'single' ? 'Simple' : m === 'categorical' ? 'Categorizado' : 'Expresión'}
                    </button>
                ))}
            </div>

            {/* ── Modo Simple ─────────────────────────────────────────── */}
            {symbology.mode === 'single' && (
                <div className="sym-single">
                    <div className="sym-row">
                        <span className="sym-label">Relleno</span>
                        <div className="sym-color-row">
                            <input type="color" className="sym-color-input" value={symbology.fillColor}
                                onChange={e => updateSym({ fillColor: e.target.value })} title="Color de relleno" />
                            {(geomType === 'polygon' || geomType === 'mixed') && (
                                <>
                                    <span className="sym-label" style={{ marginLeft: 8 }}>Borde</span>
                                    <input type="color" className="sym-color-input" value={symbology.strokeColor ?? '#333333'}
                                        onChange={e => updateSym({ strokeColor: e.target.value })} title="Color de borde" />
                                </>
                            )}
                        </div>
                    </div>
                    {(geomType === 'polygon' || geomType === 'mixed') && (
                        <div className="sym-row">
                            <span className="sym-label">Opacidad</span>
                            <input type="range" className="sym-opacity" min="0" max="1" step="0.05"
                                value={symbology.fillOpacity} onChange={e => updateSym({ fillOpacity: +e.target.value })} />
                            <span className="sym-pct">{Math.round(symbology.fillOpacity * 100)}%</span>
                        </div>
                    )}
                    <div className="sym-row">
                        <span className="sym-label">Grosor</span>
                        <input type="range" className="sym-opacity" min="0.5" max="8" step="0.5"
                            value={symbology.strokeWeight} onChange={e => updateSym({ strokeWeight: +e.target.value })} />
                        <span className="sym-pct">{symbology.strokeWeight}px</span>
                    </div>
                    <div className="sym-row" style={{ alignItems: 'flex-start' }}>
                        <span className="sym-label" style={{ paddingTop: 4 }}>Rampa</span>
                        <div className="sym-ramp-grid">
                            {RAMP_NAMES.map(ramp => (
                                <button key={ramp} className={`sym-ramp-item${symbology.colorRamp === ramp ? ' selected' : ''}`}
                                    onClick={() => updateSym({ colorRamp: ramp })} title={ramp}>
                                    <span className="sym-ramp-bar" style={{ background: getRampGradientCSS(ramp) }} />
                                    <span className="sym-ramp-name">{ramp}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modo Categorizado ────────────────────────────────────── */}
            {symbology.mode === 'categorical' && (
                <div className="sym-categorical">
                    <div className="sym-row">
                        <span className="sym-label">Campo</span>
                        <select className="sym-select" value={symbology.field ?? ''}
                            onChange={e => { const f = e.target.value; updateSym({ field: f, categories: autoCategorize(features, f) }); }}>
                            {fields.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                        <button className="sym-generate-btn" style={{ width: 'auto', padding: '4px 10px', marginLeft: 4 }} onClick={handleReclassify}>
                            ↺ Reclasificar
                        </button>
                    </div>
                    {symbology.categories && symbology.categories.length > 0 && (
                        <div className="sym-categories sym-cat-list">
                            {symbology.categories.map(cat => (
                                <div key={String(cat.value)} className="sym-cat-row">
                                    <input type="color" className="sym-color-input sym-color-sm" value={cat.color}
                                        onChange={e => handleCategoryColorChange(String(cat.value), e.target.value)} />
                                    <span className="sym-cat-label">{String(cat.value)}</span>
                                    {cat.count !== undefined && <span className="sym-pct">({cat.count})</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Modo Expresión SQL ───────────────────────────────────── */}
            {symbology.mode === 'expression' && (
                <div className="sym-classified">
                    <div className="sym-row">
                        <span className="sym-label">Colores</span>
                        <div className="sym-color-row">
                            <input type="color" className="sym-color-input" value={symbology.fillColor ?? '#2ecc71'}
                                onChange={e => updateSym({ fillColor: e.target.value })} title="✓ Cuando se cumple" />
                            <span style={{ fontSize: '0.68rem', color: '#888' }}>✓ Sí</span>
                            <input type="color" className="sym-color-input" value={symbology.otherColor ?? '#e74c3c'}
                                onChange={e => updateSym({ otherColor: e.target.value })} title="✗ Cuando no se cumple"
                                style={{ marginLeft: 8 }} />
                            <span style={{ fontSize: '0.68rem', color: '#888' }}>✗ No</span>
                        </div>
                    </div>
                    <textarea className="sym-expr-textarea"
                        value={symbology.expression ?? ''}
                        onChange={e => { updateSym({ expression: e.target.value }); setExpressionResult(null); }}
                        placeholder={"-- Ejemplos SQL WHERE:\ntipo = 'residencial'\npoblacion > 5000\nclase IN ('A', 'B') AND valor >= 10\nnombre LIKE '%norte%'\narea BETWEEN 100 AND 500"}
                        rows={5} spellCheck={false}
                    />
                    <button className="sym-generate-btn" onClick={handleExpressionTest}>▶ Probar expresión</button>
                    {expressionResult && (
                        <span className={`sym-class-error${expressionResult.startsWith('✓') ? ' sym-class-ok' : ''}`}>
                            {expressionResult}
                        </span>
                    )}
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

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
                const result = await fileToGeoJSON(file);
                if (!result.ok) {
                    setError(result.error);
                    return;
                }
                const fc       = result.data;
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
        const fc = { type: 'FeatureCollection' as const, features: pendingFeatures };
        onAddLayer({
            id:          `ext_${Date.now()}`,
            name,
            type:        'vector',
            url:         '',
            file:        file ?? undefined,
            geojsonData: fc as unknown as import('@types/geo').GeoJSONFeatureCollection,
            symbology,
        });
        reset(); onClose();
    }, [pendingFeatures, name, file, symbology, onAddLayer, reset, onClose]);

    if (!isOpen) return null;

    return (
        <div className="adt-panel" role="dialog" aria-label="Agregar capa">

            {/* ── Header ─────────────────────────────────────────────── */}
            <div className="adt-header" data-drag-handle>
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
                                    role="button"
                                    tabIndex={0}
                                    aria-label={type === 'vector' ? 'Seleccionar archivo vectorial' : 'Seleccionar archivo GeoTIFF'}
                                    onClick={() => fileRef.current?.click()}
                                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
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