/**
 * AnalysisTool — Herramienta de análisis espacial
 *
 * Permite dibujar un punto (+ buffer), línea (+ buffer) o polígono
 * sobre el mapa y consulta, para cada capa vectorial disponible,
 * cuántos features caen dentro de esa geometría.
 *
 * Fuente de datos: QGIS Server WFS con CQL_FILTER espacial:
 *   - Punto  → DWithin(geometry, POINT(lng lat), dist, unit)
 *   - Línea  → DWithin(geometry, LINESTRING(...), dist, unit)
 *   - Polígono → INTERSECTS(geometry, POLYGON((...)))
 *
 * No depende de servicios externos — 100% sobre datos propios.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import { useLayersContext } from '@contexts/LayersContext';
import type { VectorLayerDef } from '@types/geo';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import { wfsService } from '@services/geoserver';
import '@styles/AnalysisTool.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type DrawMode = 'point' | 'line' | 'polygon';
type DistUnit = 'kilometers' | 'meters' | 'miles';

interface LayerResult {
    layerId: string;
    layerName: string;
    wfsName: string;
    group: string;
    count: number | null;     // null = loading, -1 = error
    features: any[] | null;   // null = not fetched yet
    loadingDetails: boolean;
}

interface AnalysisToolProps {
    mapInstance: L.Map | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const UNIT_LABELS: Record<DistUnit, string> = {
    kilometers: 'Kilómetros',
    meters: 'Metros',
    miles: 'Millas',
};

// Campos a omitir en la vista de detalle
const SKIP_FIELDS = new Set(['bbox', 'geometry', 'the_geom', 'geom', 'shape', 'objectid']);

// Campos candidatos para mostrar como nombre del feature
const NAME_CANDIDATES = [
    'NOMBRE', 'nombre', 'name', 'NAME',
    'Estado', 'estado', 'Municipio', 'municipio',
    'Localidad', 'localidad', 'descripcion', 'DESCRIPCION',
    'tipo', 'TIPO', 'cve_geo',
];

function pickName(props: Record<string, any>): string {
    for (const k of NAME_CANDIDATES) {
        if (props[k] != null && props[k] !== '') return String(props[k]);
    }
    const keys = Object.keys(props).filter(k => !SKIP_FIELDS.has(k.toLowerCase()));
    return keys.length ? String(props[keys[0]]) : 'Sin nombre';
}

// ─── WKT helpers ──────────────────────────────────────────────────────────────

function pointWkt(lat: number, lng: number) {
    return `POINT(${lng} ${lat})`;
}

function lineStringWkt(pts: L.LatLng[]) {
    return `LINESTRING(${pts.map(p => `${p.lng} ${p.lat}`).join(', ')})`;
}

function polygonWkt(pts: L.LatLng[]) {
    const coords = [...pts, pts[0]]; // cerrar
    return `POLYGON((${coords.map(p => `${p.lng} ${p.lat}`).join(', ')}))`;
}

function buildCql(mode: DrawMode, pts: L.LatLng[], dist: number, unit: DistUnit): string {
    if (mode === 'point') {
        return `DWithin(geometry, ${pointWkt(pts[0].lat, pts[0].lng)}, ${dist}, ${unit})`;
    }
    if (mode === 'line') {
        return `DWithin(geometry, ${lineStringWkt(pts)}, ${dist}, ${unit})`;
    }
    // polygon
    return `INTERSECTS(geometry, ${polygonWkt(pts)})`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const AnalysisTool: React.FC<AnalysisToolProps> = ({ mapInstance }) => {
    const { vectorLayers } = useLayersContext();

    // ── UI state ──────────────────────────────────────────────────────────────
    const [open, setOpen]         = useState(false);
    const [tab, setTab]           = useState<'dibujar' | 'resultados'>('dibujar');
    const [mode, setMode]         = useState<DrawMode>('point');
    const [drawing, setDrawing]   = useState(false);
    const [dist, setDist]         = useState<string>('1');
    const [unit, setUnit]         = useState<DistUnit>('kilometers');
    const [error, setError]       = useState<string | null>(null);
    const [loading, setLoading]   = useState(false);
    const [results, setResults]   = useState<LayerResult[]>([]);
    const [detailLayerId, setDetailLayerId] = useState<string | null>(null);

    // ── Leaflet refs ──────────────────────────────────────────────────────────
    const drawnPtsRef   = useRef<L.LatLng[]>([]);
    const polylineRef   = useRef<L.Polyline | null>(null);
    const polygonRef    = useRef<L.Polygon | null>(null);
    const circleRef     = useRef<L.Circle | null>(null);
    const markerRef     = useRef<L.CircleMarker | null>(null);
    const previewRef    = useRef<L.Polyline | null>(null);
    const markersRef    = useRef<L.CircleMarker[]>([]);

    // ── Limpiar capas del mapa ─────────────────────────────────────────────────
    const clearMapLayers = useCallback(() => {
        if (!mapInstance) return;
        polylineRef.current?.remove();  polylineRef.current = null;
        polygonRef.current?.remove();   polygonRef.current = null;
        circleRef.current?.remove();    circleRef.current = null;
        markerRef.current?.remove();    markerRef.current = null;
        previewRef.current?.remove();   previewRef.current = null;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        drawnPtsRef.current = [];
    }, [mapInstance]);

    // ── Reset completo ────────────────────────────────────────────────────────
    const handleReset = useCallback(() => {
        clearMapLayers();
        setDrawing(false);
        setResults([]);
        setTab('dibujar');
        setError(null);
        setDetailLayerId(null);
        if (mapInstance) mapInstance.getContainer().style.cursor = '';
    }, [clearMapLayers, mapInstance]);

    const handleClose = useCallback(() => {
        handleReset();
        setOpen(false);
    }, [handleReset]);

    // ── Actualizar visualización del buffer de punto ───────────────────────────
    const updateCircle = useCallback((latlng: L.LatLng) => {
        if (!mapInstance) return;
        const distNum = parseFloat(dist) || 0;
        const radiusM = unit === 'kilometers' ? distNum * 1000
            : unit === 'miles' ? distNum * 1609.344
            : distNum;
        if (circleRef.current) {
            circleRef.current.setLatLng(latlng).setRadius(radiusM);
        } else {
            circleRef.current = L.circle(latlng, {
                radius: radiusM,
                color: '#691B31',
                weight: 1.5,
                fillColor: '#691B31',
                fillOpacity: 0.12,
                dashArray: '5 4',
            }).addTo(mapInstance);
        }
    }, [mapInstance, dist, unit]);

    // ── Manejadores del mapa durante dibujo ───────────────────────────────────
    useEffect(() => {
        if (!mapInstance || !drawing) return;

        const onClick = (e: L.LeafletMouseEvent) => {
            const pts = drawnPtsRef.current;

            if (mode === 'point') {
                // Un solo punto — colocar y terminar
                clearMapLayers();
                drawnPtsRef.current = [e.latlng];
                markerRef.current = L.circleMarker(e.latlng, {
                    radius: 6, fillColor: '#691B31', color: '#fff',
                    weight: 2, fillOpacity: 1,
                }).addTo(mapInstance);
                updateCircle(e.latlng);
                finishDrawing();
                return;
            }

            // Línea o polígono
            drawnPtsRef.current = [...pts, e.latlng];
            const updated = drawnPtsRef.current;

            // Marcador del vértice
            const marker = L.circleMarker(e.latlng, {
                radius: 4, fillColor: '#691B31', color: '#fff',
                weight: 2, fillOpacity: 1,
            }).addTo(mapInstance);
            markersRef.current.push(marker);

            if (mode === 'line') {
                if (polylineRef.current) {
                    polylineRef.current.setLatLngs(updated);
                } else {
                    polylineRef.current = L.polyline(updated, {
                        color: '#691B31', weight: 2.5, dashArray: '6 4',
                    }).addTo(mapInstance);
                }
            } else {
                // polygon
                if (polygonRef.current) {
                    polygonRef.current.setLatLngs(updated);
                } else {
                    polygonRef.current = L.polygon(updated, {
                        color: '#691B31', weight: 2, fillColor: '#691B31', fillOpacity: 0.1,
                    }).addTo(mapInstance);
                }
            }
        };

        const onDblClick = (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            if (drawnPtsRef.current.length >= 2) finishDrawing();
        };

        const onMouseMove = (e: L.LeafletMouseEvent) => {
            const pts = drawnPtsRef.current;
            if (pts.length === 0) return;
            const last = pts[pts.length - 1];
            if (previewRef.current) {
                previewRef.current.setLatLngs([last, e.latlng]);
            } else {
                previewRef.current = L.polyline([last, e.latlng], {
                    color: '#691B31', weight: 1.5, opacity: 0.5, dashArray: '4 4',
                }).addTo(mapInstance);
            }
        };

        mapInstance.on('click', onClick);
        mapInstance.on('dblclick', onDblClick);
        if (mode !== 'point') mapInstance.on('mousemove', onMouseMove);

        return () => {
            mapInstance.off('click', onClick);
            mapInstance.off('dblclick', onDblClick);
            mapInstance.off('mousemove', onMouseMove);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, drawing, mode, dist, unit]);

    // ── Iniciar dibujo ────────────────────────────────────────────────────────
    const startDrawing = useCallback(() => {
        if (!mapInstance) return;
        clearMapLayers();
        setError(null);
        setResults([]);
        setDrawing(true);
        mapInstance.getContainer().style.cursor = 'crosshair';
    }, [mapInstance, clearMapLayers]);

    // ── Finalizar dibujo y lanzar análisis ────────────────────────────────────
    const finishDrawing = useCallback(async () => {
        if (!mapInstance) return;
        setDrawing(false);
        mapInstance.getContainer().style.cursor = '';
        previewRef.current?.remove(); previewRef.current = null;

        const pts = drawnPtsRef.current;
        if (pts.length === 0) {
            setError('Dibuja al menos un punto en el mapa.');
            return;
        }
        if ((mode === 'line' || mode === 'polygon') && pts.length < 2) {
            setError('Necesitas al menos 2 puntos para línea o polígono.');
            return;
        }

        const distNum = parseFloat(dist);
        if ((mode === 'point' || mode === 'line') && (!distNum || distNum <= 0)) {
            setError('Ingresa una distancia de buffer válida.');
            return;
        }

        await runAnalysis(pts, distNum, unit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, mode, dist, unit]);

    // ── Motor de análisis ─────────────────────────────────────────────────────
    const runAnalysis = useCallback(async (
        pts: L.LatLng[],
        distNum: number,
        currentUnit: DistUnit,
    ) => {
        setLoading(true);
        setError(null);

        // Construir CQL filter
        const cql = buildCql(mode, pts, distNum, currentUnit);

        // Solo capas vectoriales que tengan wfsName o id para consultar
        const layers = vectorLayers.filter((l): l is VectorLayerDef => l.type === 'vector');
        const initial: LayerResult[] = layers.map(l => ({
            layerId: l.id,
            layerName: l.name,
            wfsName: l.wfsName ?? l.id,
            group: l.group,
            count: null,
            features: null,
            loadingDetails: false,
        }));
        setResults(initial);
        setTab('resultados');
        setLoading(false);

        // Consultar cada capa en paralelo
        const updated = [...initial];
        await Promise.allSettled(
            initial.map(async (lr, idx) => {
                try {
                    const count = await dynamicWfsService.getFeatureCount(
                        lr.wfsName,
                        lr.group,
                        cql,
                    );
                    updated[idx] = { ...updated[idx], count };
                } catch {
                    // fallback: intento con wfsService estático
                    try {
                        const count = await wfsService.getFeatureCount(lr.wfsName, cql);
                        updated[idx] = { ...updated[idx], count };
                    } catch {
                        updated[idx] = { ...updated[idx], count: -1 };
                    }
                }
                // Actualizar UI de forma incremental
                setResults(prev => {
                    const next = [...prev];
                    next[idx] = { ...next[idx], count: updated[idx].count };
                    return next;
                });
            })
        );
    }, [mode, vectorLayers]);

    // ── Cargar detalles (features) de una capa ────────────────────────────────
    const loadDetails = useCallback(async (lr: LayerResult, idx: number) => {
        setDetailLayerId(lr.layerId);
        setResults(prev => {
            const next = [...prev];
            next[idx] = { ...next[idx], loadingDetails: true };
            return next;
        });

        const cql = buildCql(mode, drawnPtsRef.current, parseFloat(dist), unit);

        try {
            let data: any;
            try {
                data = await dynamicWfsService.getFeatures(lr.wfsName, lr.group, {
                    cql_filter: cql,
                    maxFeatures: 20,
                });
            } catch {
                data = await wfsService.getFeatures(lr.wfsName, {
                    cql_filter: cql,
                    maxFeatures: 20,
                });
            }
            setResults(prev => {
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    features: data?.features ?? [],
                    loadingDetails: false,
                };
                return next;
            });
        } catch {
            setResults(prev => {
                const next = [...prev];
                next[idx] = { ...next[idx], features: [], loadingDetails: false };
                return next;
            });
        }
    }, [mode, dist, unit]);

    // ── Texto de instrucción según modo ───────────────────────────────────────
    const instructionText = () => {
        if (mode === 'point')
            return <>Haz <strong>clic</strong> en el mapa para colocar el punto de análisis. Se aplicará el buffer de distancia configurado.</>;
        if (mode === 'line')
            return <>Haz <strong>clic</strong> para agregar vértices de la línea. <strong>Doble clic</strong> para finalizar. Se aplica buffer a la línea.</>;
        return <>Haz <strong>clic</strong> para dibujar el polígono. <strong>Doble clic</strong> para cerrarlo y ejecutar el análisis.</>;
    };

    const showBufferInput = mode === 'point' || mode === 'line';
    const hasResults = results.length > 0;
    const totalWithFeatures = results.filter(r => (r.count ?? 0) > 0).length;

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="at-wrapper">
            {/* Botón flotante */}
            <button
                className={`at-fab ${open ? 'at-fab--active' : ''}`}
                onClick={() => open ? handleClose() : setOpen(true)}
                title="Análisis espacial"
            >
                Análisis
            </button>

            {/* Panel */}
            {open && (
                <div className="at-panel">
                    {/* Header */}
                    <div className="at-header">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                        </svg>
                        <span className="at-header-title">Análisis</span>
                        <div className="at-header-actions">
                            {hasResults && (
                                <button className="at-icon-btn" onClick={handleReset} title="Nuevo análisis">↺</button>
                            )}
                            <button className="at-icon-btn at-close-btn" onClick={handleClose} title="Cerrar">✕</button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="at-tabs">
                        <button
                            className={`at-tab ${tab === 'dibujar' ? 'at-tab--active' : ''}`}
                            onClick={() => setTab('dibujar')}
                        >
                            Realizar análisis por
                        </button>
                        <button
                            className={`at-tab ${tab === 'resultados' ? 'at-tab--active' : ''}`}
                            onClick={() => setTab('resultados')}
                            disabled={!hasResults}
                        >
                            Resultado del análisis
                        </button>
                    </div>

                    {/* ─── Tab: Dibujar ─────────────────────────────────────── */}
                    {tab === 'dibujar' && (
                        <div className="at-body">
                            {/* Botones de modo */}
                            <p className="at-mode-label">Selecciona el tipo de geometría:</p>
                            <div className="at-mode-btns">
                                {/* Punto */}
                                <button
                                    className={`at-mode-btn ${mode === 'point' && !drawing ? 'at-mode-btn--active' : ''}`}
                                    onClick={() => { setMode('point'); setDrawing(false); }}
                                    title="Punto con buffer"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <circle cx="12" cy="12" r="6"/>
                                        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2"/>
                                    </svg>
                                    Punto
                                </button>

                                {/* Línea */}
                                <button
                                    className={`at-mode-btn ${mode === 'line' && !drawing ? 'at-mode-btn--active' : ''}`}
                                    onClick={() => { setMode('line'); setDrawing(false); }}
                                    title="Línea con buffer"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="4" y1="20" x2="20" y2="4"/>
                                        <circle cx="4" cy="20" r="2" fill="currentColor"/>
                                        <circle cx="20" cy="4" r="2" fill="currentColor"/>
                                    </svg>
                                    Línea
                                </button>

                                {/* Polígono */}
                                <button
                                    className={`at-mode-btn ${mode === 'polygon' && !drawing ? 'at-mode-btn--active' : ''}`}
                                    onClick={() => { setMode('polygon'); setDrawing(false); }}
                                    title="Polígono"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="12,3 21,9 18,20 6,20 3,9" fill="currentColor" fillOpacity="0.2" stroke="currentColor"/>
                                    </svg>
                                    Polígono
                                </button>

                                {/* Limpiar */}
                                <button
                                    className="at-mode-btn at-mode-btn--danger"
                                    onClick={handleReset}
                                    title="Limpiar dibujo"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                    Limpiar
                                </button>
                            </div>

                            {/* Buffer distance — solo para punto y línea */}
                            {showBufferInput && (
                                <div className="at-buffer-row">
                                    <span className="at-buffer-label">Distancia:</span>
                                    <input
                                        className="at-buffer-input"
                                        type="number"
                                        min="0.001"
                                        step="0.1"
                                        value={dist}
                                        onChange={e => setDist(e.target.value)}
                                        placeholder="ej. 1"
                                    />
                                    <select
                                        className="at-buffer-select"
                                        value={unit}
                                        onChange={e => setUnit(e.target.value as DistUnit)}
                                    >
                                        {(Object.keys(UNIT_LABELS) as DistUnit[]).map(u => (
                                            <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Instrucciones */}
                            {drawing && (
                                <p className="at-instructions">{instructionText()}</p>
                            )}

                            {/* Error */}
                            {error && <p className="at-error">{error}</p>}

                            {/* Botón acción */}
                            <button
                                className={`at-action-btn ${drawing ? 'at-action-btn--drawing' : ''}`}
                                onClick={drawing ? finishDrawing : startDrawing}
                                disabled={loading}
                            >
                                {loading
                                    ? '⏳ Analizando capas…'
                                    : drawing
                                        ? mode === 'point'
                                            ? '✔ Haz clic en el mapa'
                                            : `✔ Finalizar (${drawnPtsRef.current.length} pts)`
                                        : '✏ Dibujar en el mapa'}
                            </button>
                        </div>
                    )}

                    {/* ─── Tab: Resultados ──────────────────────────────────── */}
                    {tab === 'resultados' && hasResults && (
                        <div className="at-body">
                            {/* Resumen */}
                            <div className="at-results-summary">
                                Análisis completado. Se encontraron features en{' '}
                                <strong>{totalWithFeatures}</strong> de{' '}
                                <strong>{results.length}</strong> capas.
                            </div>

                            {/* Tabla de resultados */}
                            <table className="at-results-table">
                                <thead>
                                    <tr>
                                        <th>Capa</th>
                                        <th style={{ textAlign: 'center' }}>Total</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results
                                        .slice()
                                        .sort((a, b) => {
                                            // Primero los que tienen features, luego sin features, luego errores
                                            const ca = a.count ?? -2;
                                            const cb = b.count ?? -2;
                                            if (ca === null) return -1;
                                            if (cb === null) return 1;
                                            return cb - ca;
                                        })
                                        .map((lr, sortedIdx) => {
                                            const realIdx = results.findIndex(r => r.layerId === lr.layerId);
                                            const isLoading = lr.count === null;
                                            const isError   = lr.count === -1;
                                            const isZero    = lr.count === 0;
                                            const hasData   = (lr.count ?? 0) > 0;

                                            return (
                                                <React.Fragment key={lr.layerId}>
                                                    <tr className={isZero ? 'at-row--zero' : ''}>
                                                        <td className="at-layer-name">{lr.layerName}</td>
                                                        <td className="at-count">
                                                            {isLoading && <span className="at-spinner" />}
                                                            {isError   && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.72rem' }}>—</span>}
                                                            {isZero    && <span className="at-count--zero">No presenta</span>}
                                                            {hasData   && lr.count?.toLocaleString()}
                                                        </td>
                                                        <td>
                                                            {hasData && (
                                                                <button
                                                                    className="at-details-btn"
                                                                    onClick={() => {
                                                                        if (detailLayerId === lr.layerId) {
                                                                            setDetailLayerId(null);
                                                                        } else {
                                                                            loadDetails(lr, realIdx);
                                                                        }
                                                                    }}
                                                                    disabled={lr.loadingDetails}
                                                                >
                                                                    {lr.loadingDetails
                                                                        ? '…'
                                                                        : detailLayerId === lr.layerId
                                                                            ? 'Ocultar'
                                                                            : 'Detalles'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>

                                                    {/* Panel de detalles expandido */}
                                                    {detailLayerId === lr.layerId && lr.features && (
                                                        <tr>
                                                            <td colSpan={3} style={{ padding: '0 8px 10px' }}>
                                                                <div className="at-detail-panel">
                                                                    <p className="at-detail-panel-title">
                                                                        {lr.layerName} — {lr.features.length} features
                                                                        {(lr.count ?? 0) > lr.features.length
                                                                            ? ` (mostrando primeros ${lr.features.length} de ${lr.count})`
                                                                            : ''}
                                                                    </p>
                                                                    {lr.features.length === 0 && (
                                                                        <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                                                            Sin features para mostrar.
                                                                        </p>
                                                                    )}
                                                                    {lr.features.map((f, fi) => {
                                                                        const props = f.properties ?? {};
                                                                        const name = pickName(props);
                                                                        const entries = Object.entries(props)
                                                                            .filter(([k]) => !SKIP_FIELDS.has(k.toLowerCase()))
                                                                            .slice(0, 5);
                                                                        return (
                                                                            <div key={fi} className="at-feature-item">
                                                                                <div className="at-feature-item-name">{name}</div>
                                                                                {entries.map(([k, v]) => (
                                                                                    <div key={k} className="at-feature-attr">
                                                                                        {k}: <span>{String(v ?? '—')}</span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                    <button
                                                                        className="at-detail-close"
                                                                        onClick={() => setDetailLayerId(null)}
                                                                    >
                                                                        Cerrar detalles
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                </tbody>
                            </table>

                            {/* Nuevo análisis */}
                            <button className="at-new-btn" onClick={handleReset}>
                                + Nuevo análisis
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AnalysisTool;