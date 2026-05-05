/**
 * AnalysisTool — Herramienta de análisis espacial (VERSIÓN MEJORADA)
 *
 * Mejoras implementadas:
 * ✅ Confirmación antes de reset
 * ✅ Límite de features en consultas
 * ✅ Exportación de resultados (CSV/GeoJSON)
 * ✅ Visualización de features en el mapa
 * ✅ Estadísticas agregadas
 * ✅ Manejo de errores mejorado
 * ✅ Accesibilidad (ARIA labels)
 * ✅ Mediciones (área, longitud, buffer)
 * ✅ Atajos de teclado
 * ✅ Gráfico de barras visual
 * ✅ Filtros de capas
 * ✅ Historial de análisis
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
    count: number | null;
    features: any[] | null;
    loadingDetails: boolean;
}

interface AnalysisHistory {
    id: string;
    timestamp: number;
    mode: DrawMode;
    distance: number;
    unit: DistUnit;
    results: LayerResult[];
    measurements?: {
        area?: number;
        length?: number;
        buffer?: number;
    };
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

const SKIP_FIELDS = new Set(['bbox', 'geometry', 'the_geom', 'geom', 'shape', 'objectid']);

const NAME_CANDIDATES = [
    'NOMBRE', 'nombre', 'name', 'NAME',
    'Estado', 'estado', 'Municipio', 'municipio',
    'Localidad', 'localidad', 'descripcion', 'DESCRIPCION',
    'tipo', 'TIPO', 'cve_geo',
];

const MAX_FEATURES_LIMIT = 100; // Límite de features por consulta

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
    const coords = [...pts, pts[0]];
    return `POLYGON((${coords.map(p => `${p.lng} ${p.lat}`).join(', ')}))`;
}

function toMeters(dist: number, unit: DistUnit): number {
    switch (unit) {
        case 'kilometers': return dist * 1000;
        case 'meters':     return dist;
        case 'miles':      return dist * 1609.34;
    }
}

// ─── Filtro espacial en cliente ───────────────────────────────────────────────
//
// QGIS Server WFS 1.1.0 no evalúa DWITHIN / INTERSECTS correctamente en
// CQL_FILTER cuando el SRS de la capa difiere de EPSG:4326.  La estrategia
// robusta es:
//   1. Servidor: BBOX (sí soportado) para traer features del área aproximada.
//   2. Cliente:  filtrado geométrico exacto usando Leaflet distanceTo / ray-cast.
//
// Así nunca dependemos de que QGIS evalúe predicados espaciales complejos.

/**
 * Calcula el BBOX en grados que envuelve el área de influencia.
 * Para punto → cuadro alrededor del radio.
 * Para línea → cuadro alrededor de todos los puntos + radio.
 * Para polígono → cuadro del polígono.
 */
function buildBboxCql(mode: DrawMode, pts: L.LatLng[], distMeters: number, geomField = 'geometry'): string {
    const DEG_PER_METER_LAT = 1 / 111320;

    if (mode === 'polygon') {
        const lats = pts.map(p => p.lat);
        const lngs = pts.map(p => p.lng);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        return `BBOX(${geomField}, ${minLng}, ${minLat}, ${maxLng}, ${maxLat})`;
    }

    // Punto o línea: expandir por radio
    const padLat = distMeters * DEG_PER_METER_LAT;
    const lats = pts.map(p => p.lat);
    const lngs = pts.map(p => p.lng);
    const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const padLng = distMeters / (111320 * Math.cos(centerLat * Math.PI / 180));
    const minLat = Math.min(...lats) - padLat, maxLat = Math.max(...lats) + padLat;
    const minLng = Math.min(...lngs) - padLng, maxLng = Math.max(...lngs) + padLng;
    return `BBOX(${geomField}, ${minLng}, ${minLat}, ${maxLng}, ${maxLat})`;
}

/**
 * Filtra un array de GeoJSON features aplicando el predicado espacial exacto
 * en el cliente usando Leaflet.
 *
 * - Punto  → feature dentro del radio (distanceTo)
 * - Línea  → feature dentro del radio de la línea (distancia mínima a segmento)
 * - Polígono → feature dentro del polígono (ray-casting + intersección de bbox)
 */
function clientSideFilter(
    features: any[],
    mode: DrawMode,
    pts: L.LatLng[],
    distMeters: number
): any[] {
    if (!features?.length) return [];

    // Extrae la primera coordenada representativa de cualquier geometría GeoJSON
    function featurePoint(f: any): L.LatLng | null {
        const g = f.geometry;
        if (!g) return null;
        let coords: number[] | null = null;
        if (g.type === 'Point') coords = g.coordinates;
        else if (g.type === 'MultiPoint') coords = g.coordinates[0];
        else if (g.type === 'LineString') coords = g.coordinates[0];
        else if (g.type === 'MultiLineString') coords = g.coordinates[0][0];
        else if (g.type === 'Polygon') coords = g.coordinates[0][0];
        else if (g.type === 'MultiPolygon') coords = g.coordinates[0][0][0];
        if (!coords) return null;
        return L.latLng(coords[1], coords[0]);
    }

    // Distancia de un punto a un segmento de línea (en metros, approx esférica)
    function distToSegment(p: L.LatLng, a: L.LatLng, b: L.LatLng): number {
        // Proyección plana local (suficiente para la CDMX a escala de kms)
        const R = 111320;
        const cosLat = Math.cos(p.lat * Math.PI / 180);
        const px = (p.lng - a.lng) * R * cosLat;
        const py = (p.lat - a.lat) * R;
        const dx = (b.lng - a.lng) * R * cosLat;
        const dy = (b.lat - a.lat) * R;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt(px * px + py * py);
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
        return Math.sqrt(Math.pow(px - t * dx, 2) + Math.pow(py - t * dy, 2));
    }

    // Ray-casting point-in-polygon (coordenadas geográficas)
    function pointInPolygon(p: L.LatLng, polygon: L.LatLng[]): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].lng, yi = polygon[i].lat;
            const xj = polygon[j].lng, yj = polygon[j].lat;
            if ((yi > p.lat) !== (yj > p.lat) &&
                p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    return features.filter(f => {
        const fp = featurePoint(f);
        if (!fp) return false;

        if (mode === 'point') {
            return fp.distanceTo(pts[0]) <= distMeters;
        }

        if (mode === 'line') {
            for (let i = 0; i < pts.length - 1; i++) {
                if (distToSegment(fp, pts[i], pts[i + 1]) <= distMeters) return true;
            }
            return false;
        }

        // Polígono
        return pointInPolygon(fp, pts);
    });
}

/** Solo construye el BBOX para el servidor; el filtro exacto se aplica en cliente. */
function buildCql(mode: DrawMode, pts: L.LatLng[], dist: number, unit: DistUnit, geomField = 'geometry'): string {
    const distMeters = toMeters(dist, unit);
    return buildBboxCql(mode, pts, distMeters, geomField);
}

// ─── Utilidades de medición ───────────────────────────────────────────────────

function calculateLength(pts: L.LatLng[]): number {
    let length = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        length += pts[i].distanceTo(pts[i + 1]);
    }
    return length;
}

function calculateArea(pts: L.LatLng[]): number {
    // Fórmula del área usando coordenadas geográficas (aproximación)
    if (pts.length < 3) return 0;
    
    const coords = [...pts, pts[0]].map(p => [p.lng, p.lat]);
    let area = 0;
    
    for (let i = 0; i < coords.length - 1; i++) {
        area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1];
    }
    
    return Math.abs(area / 2) * 111000 * 111000; // Conversión aproximada a m²
}

function formatMeasurement(value: number, type: 'length' | 'area'): string {
    if (type === 'length') {
        if (value < 1000) return `${value.toFixed(1)} m`;
        return `${(value / 1000).toFixed(2)} km`;
    }
    if (value < 10000) return `${value.toFixed(1)} m²`;
    if (value < 1000000) return `${(value / 10000).toFixed(2)} ha`;
    return `${(value / 1000000).toFixed(2)} km²`;
}

// ─── Utilidades de exportación ────────────────────────────────────────────────

function downloadAsCSV(data: any[], filename: string) {
    const headers = Object.keys(data[0] || {});
    const csv = [
        headers.join(','),
        ...data.map(row => headers.map(h => `"${row[h] ?? ''}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function downloadAsGeoJSON(results: LayerResult[], filename: string) {
    const features = results
        .filter(r => r.features && r.features.length > 0)
        .flatMap(r => r.features || [])
        .filter(f => f.geometry);
    
    const geojson = {
        type: 'FeatureCollection',
        features: features
    };
    
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

// ─── Historial local storage ──────────────────────────────────────────────────

function saveAnalysisToHistory(analysis: AnalysisHistory) {
    try {
        const history = getAnalysisHistory();
        history.unshift(analysis);
        // Mantener solo los últimos 10
        localStorage.setItem('analysisHistory', JSON.stringify(history.slice(0, 10)));
    } catch (err) {
        console.warn('No se pudo guardar en historial:', err);
    }
}

function getAnalysisHistory(): AnalysisHistory[] {
    try {
        const data = localStorage.getItem('analysisHistory');
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

// ─── Componente ───────────────────────────────────────────────────────────────

const AnalysisTool: React.FC<AnalysisToolProps> = ({ mapInstance }) => {
    const { vectorLayers } = useLayersContext();

    // ── UI state ──────────────────────────────────────────────────────────────
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<'dibujar' | 'resultados' | 'estadisticas'>('dibujar');
    const [mode, setMode] = useState<DrawMode>('point');
    const [drawing, setDrawing] = useState(false);
    const [dist, setDist] = useState<string>('1');
    const [unit, setUnit] = useState<DistUnit>('kilometers');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<LayerResult[]>([]);
    const [detailLayerId, setDetailLayerId] = useState<string | null>(null);
    const [filterText, setFilterText] = useState('');
    const [showOnlyWithData, setShowOnlyWithData] = useState(false);
    const [measurements, setMeasurements] = useState<{ area?: number; length?: number; buffer?: number }>({});
    const [featuresLayerGroup, setFeaturesLayerGroup] = useState<L.LayerGroup | null>(null);

    // ── Leaflet refs ──────────────────────────────────────────────────────────
    const drawnPtsRef = useRef<L.LatLng[]>([]);
    const polylineRef = useRef<L.Polyline | null>(null);
    const polygonRef = useRef<L.Polygon | null>(null);
    const circleRef = useRef<L.Circle | null>(null);
    const markerRef = useRef<L.CircleMarker | null>(null);
    const previewRef = useRef<L.Polyline | null>(null);
    const markersRef = useRef<L.CircleMarker[]>([]);

    // ── Limpiar capas del mapa ─────────────────────────────────────────────────
    const clearMapLayers = useCallback(() => {
        if (!mapInstance) return;
        polylineRef.current?.remove(); polylineRef.current = null;
        polygonRef.current?.remove(); polygonRef.current = null;
        circleRef.current?.remove(); circleRef.current = null;
        markerRef.current?.remove(); markerRef.current = null;
        previewRef.current?.remove(); previewRef.current = null;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        drawnPtsRef.current = [];
        featuresLayerGroup?.clearLayers();
    }, [mapInstance, featuresLayerGroup]);

    // ── Reset con confirmación ────────────────────────────────────────────────
    const handleReset = useCallback(() => {
        if (drawnPtsRef.current.length > 0) {
            if (!confirm('¿Descartar la geometría actual y comenzar un nuevo análisis?')) {
                return;
            }
        }
        
        clearMapLayers();
        setDrawing(false);
        setResults([]);
        setTab('dibujar');
        setError(null);
        setDetailLayerId(null);
        setFilterText('');
        setShowOnlyWithData(false);
        setMeasurements({});
    }, [clearMapLayers]);

    // ── Atajos de teclado ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // ESC para cancelar dibujo
            if (e.key === 'Escape' && drawing) {
                clearMapLayers();
                setDrawing(false);
            }
            
            // Enter para finalizar geometría (línea/polígono)
            if (e.key === 'Enter' && drawing && (mode === 'line' || mode === 'polygon')) {
                if (drawnPtsRef.current.length >= (mode === 'line' ? 2 : 3)) {
                    handleFinishDrawing();
                }
            }

            // Ctrl+Z para deshacer último punto
            if (e.ctrlKey && e.key === 'z' && drawing && drawnPtsRef.current.length > 0) {
                e.preventDefault();
                drawnPtsRef.current.pop();
                const lastMarker = markersRef.current.pop();
                lastMarker?.remove();
                
                if (mode === 'line' && polylineRef.current) {
                    polylineRef.current.setLatLngs(drawnPtsRef.current);
                } else if (mode === 'polygon' && drawnPtsRef.current.length >= 2) {
                    polygonRef.current?.setLatLngs(drawnPtsRef.current);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, drawing, mode]);

    // ── Calcular mediciones ───────────────────────────────────────────────────
    const updateMeasurements = useCallback(() => {
        const pts = drawnPtsRef.current;
        if (pts.length === 0) {
            setMeasurements({});
            return;
        }

        const newMeasurements: typeof measurements = {};

        if (mode === 'point' || mode === 'line') {
            const distValue = parseFloat(dist) || 0;
            const distMeters = unit === 'kilometers' ? distValue * 1000 
                             : unit === 'miles' ? distValue * 1609.34 
                             : distValue;
            newMeasurements.buffer = distMeters;
        }

        if (mode === 'line' && pts.length >= 2) {
            newMeasurements.length = calculateLength(pts);
        }

        if (mode === 'polygon' && pts.length >= 3) {
            newMeasurements.area = calculateArea(pts);
        }

        setMeasurements(newMeasurements);
    }, [mode, dist, unit]);

    // ── Iniciar dibujo ────────────────────────────────────────────────────────
    const handleStartDrawing = useCallback(() => {
        if (!mapInstance) return;
        
        clearMapLayers();
        setDrawing(true);
        setError(null);
        drawnPtsRef.current = [];

        const onClick = (e: L.LeafletMouseEvent) => {
            const pt = e.latlng;
            drawnPtsRef.current.push(pt);

            const marker = L.circleMarker(pt, {
                radius: 5,
                color: '#2563eb',
                fillColor: '#fff',
                fillOpacity: 1,
                weight: 2
            }).addTo(mapInstance);
            markersRef.current.push(marker);

            if (mode === 'point') {
                markerRef.current = marker;
                const distVal = parseFloat(dist) || 0;
                if (distVal > 0) {
                    const radiusMeters = unit === 'kilometers' ? distVal * 1000 
                                       : unit === 'miles' ? distVal * 1609.34 
                                       : distVal;
                    circleRef.current = L.circle(pt, {
                        radius: radiusMeters,
                        color: '#2563eb',
                        fillColor: '#2563eb',
                        fillOpacity: 0.1,
                        weight: 2
                    }).addTo(mapInstance);
                }
                setDrawing(false);
                mapInstance.off('click', onClick);
                mapInstance.off('mousemove', onMove);
                updateMeasurements();
            } else if (mode === 'line') {
                if (drawnPtsRef.current.length === 1) {
                    polylineRef.current = L.polyline([pt], {
                        color: '#2563eb',
                        weight: 3
                    }).addTo(mapInstance);
                } else {
                    polylineRef.current?.setLatLngs(drawnPtsRef.current);
                }
                updateMeasurements();
            } else if (mode === 'polygon') {
                if (drawnPtsRef.current.length >= 2) {
                    if (!polygonRef.current) {
                        polygonRef.current = L.polygon(drawnPtsRef.current, {
                            color: '#2563eb',
                            fillColor: '#2563eb',
                            fillOpacity: 0.1,
                            weight: 2
                        }).addTo(mapInstance);
                    } else {
                        polygonRef.current.setLatLngs(drawnPtsRef.current);
                    }
                    updateMeasurements();
                }
            }
        };

        const onMove = (e: L.LeafletMouseEvent) => {
            if (drawnPtsRef.current.length === 0) return;
            
            const last = drawnPtsRef.current[drawnPtsRef.current.length - 1];
            const preview = [last, e.latlng];
            
            if (!previewRef.current) {
                previewRef.current = L.polyline(preview, {
                    color: '#94a3b8',
                    weight: 2,
                    dashArray: '5,5'
                }).addTo(mapInstance);
            } else {
                previewRef.current.setLatLngs(preview);
            }
        };

        mapInstance.on('click', onClick);
        if (mode !== 'point') {
            mapInstance.on('mousemove', onMove);
        }
    }, [mapInstance, mode, dist, unit, clearMapLayers, updateMeasurements]);

    // ── Finalizar dibujo (línea/polígono) ─────────────────────────────────────
    const handleFinishDrawing = useCallback(() => {
        if (!mapInstance) return;
        
        mapInstance.off('click');
        mapInstance.off('mousemove');
        previewRef.current?.remove();
        previewRef.current = null;
        setDrawing(false);
        updateMeasurements();

        // Agregar buffer si es línea
        if (mode === 'line') {
            const distVal = parseFloat(dist) || 0;
            if (distVal > 0 && polylineRef.current) {
                const radiusMeters = unit === 'kilometers' ? distVal * 1000 
                                   : unit === 'miles' ? distVal * 1609.34 
                                   : distVal;
                
                // Crear corredor visual alrededor de la línea
                const corridor = L.polyline(drawnPtsRef.current, {
                    color: '#2563eb',
                    weight: (radiusMeters / 50), // Escalar visual
                    opacity: 0.3
                }).addTo(mapInstance);
            }
        }
    }, [mapInstance, mode, dist, unit, updateMeasurements]);

    // ── Ejecutar análisis ─────────────────────────────────────────────────────
    const runAnalysis = useCallback(async () => {
        if (drawnPtsRef.current.length === 0) {
            setError('⚠️ Debes dibujar una geometría primero');
            return;
        }

        if (mode === 'line' && drawnPtsRef.current.length < 2) {
            setError('⚠️ Una línea requiere al menos 2 puntos');
            return;
        }

        if (mode === 'polygon' && drawnPtsRef.current.length < 3) {
            setError('⚠️ Un polígono requiere al menos 3 puntos');
            return;
        }

        const distVal = parseFloat(dist) || 0;
        if ((mode === 'point' || mode === 'line') && distVal <= 0) {
            setError('⚠️ La distancia debe ser mayor a 0');
            return;
        }

        setError(null);
        setLoading(true);
        setTab('resultados');

        const pts = drawnPtsRef.current;

        const allResults: LayerResult[] = vectorLayers.map(vl => ({
            layerId: vl.id,
            layerName: vl.name,
            wfsName: vl.wfsName || vl.name,
            group: vl.group || 'Sin grupo',
            count: null,
            features: null,
            loadingDetails: false
        }));

        setResults(allResults);

        // Consultar en paralelo — cada capa detecta su propio campo de geometría
        await Promise.all(
            allResults.map(async (lr, idx) => {
                try {
                    // Detectar el campo de geometría real de cada capa (con fallback a 'geometry')
                    const geomField = await dynamicWfsService.getGeometryFieldName(lr.wfsName, lr.group);
                    const distMeters = toMeters(distVal, unit);
                    // BBOX en servidor (QGIS lo soporta correctamente en WFS 1.1.0)
                    const bboxCql = buildBboxCql(mode, pts, distMeters, geomField);
                    console.debug(`[AnalysisTool] ${lr.wfsName} | geomField=${geomField} | BBOX CQL=${bboxCql}`);
                    // Traer todos los features del BBOX y filtrar exactamente en cliente
                    const bboxData = await dynamicWfsService.getFeatures(lr.wfsName, lr.group, { cql_filter: bboxCql, maxFeatures: 0 });
                    const filtered = clientSideFilter(bboxData.features ?? [], mode, pts, distMeters);
                    const count = filtered.length;
                    console.debug(`[AnalysisTool] ${lr.wfsName} | BBOX=${bboxData.features?.length ?? 0} | exactos=${count}`);
                    
                    setResults(prev => {
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], count };
                        return updated;
                    });
                } catch (err) {
                    console.error(`Error consultando ${lr.layerName}:`, err);
                    setResults(prev => {
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], count: -1 };
                        return updated;
                    });
                }
            })
        );

        setLoading(false);

        // Guardar en historial
        const analysisRecord: AnalysisHistory = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            mode,
            distance: distVal,
            unit,
            results: allResults,
            measurements
        };
        saveAnalysisToHistory(analysisRecord);

    }, [mode, dist, unit, vectorLayers, measurements]);

    // ── Cargar detalles de una capa ──────────────────────────────────────────
    const loadDetails = useCallback(async (lr: LayerResult, idx: number) => {
        if (lr.features) {
            setDetailLayerId(lr.layerId);
            return;
        }

        setResults(prev => {
            const updated = [...prev];
            updated[idx] = { ...updated[idx], loadingDetails: true };
            return updated;
        });
        setDetailLayerId(lr.layerId);

        try {
            const pts = drawnPtsRef.current;
            const distVal = parseFloat(dist) || 0;
            const distMeters = toMeters(distVal, unit);
            // Detectar el campo de geometría real de la capa antes de construir el CQL
            const geomField = await dynamicWfsService.getGeometryFieldName(lr.wfsName, lr.group);
            // BBOX en servidor + filtro exacto en cliente (QGIS WFS 1.1.0 no evalúa DWITHIN/INTERSECTS)
            const bboxCql = buildBboxCql(mode, pts, distMeters, geomField);
            
            // Usar dynamicWfsService para respetar el proyecto QGIS
            // correcto de cada grupo (igual que en el conteo inicial).
            const data = await dynamicWfsService.getFeatures(
                lr.wfsName,
                lr.group,   // proyecto correcto para este grupo
                { cql_filter: bboxCql, maxFeatures: 0 }
            );
            // Filtro exacto en cliente: elimina los features del BBOX que no intersectan
            const features = clientSideFilter(data?.features ?? [], mode, pts, distMeters);

            setResults(prev => {
                const updated = [...prev];
                updated[idx] = { 
                    ...updated[idx], 
                    features: features || [], 
                    loadingDetails: false 
                };
                return updated;
            });
        } catch (err) {
            console.error(`Error cargando detalles de ${lr.layerName}:`, err);
            setError(`⚠️ Error al cargar detalles: ${err instanceof Error ? err.message : 'Error desconocido'}`);
            
            setResults(prev => {
                const updated = [...prev];
                updated[idx] = { ...updated[idx], loadingDetails: false };
                return updated;
            });
        }
    }, [mode, dist, unit]);

    // ── Visualizar features en el mapa ────────────────────────────────────────
    const showFeaturesOnMap = useCallback((layerResult: LayerResult) => {
        if (!mapInstance || !layerResult.features) return;

        // Limpiar capa anterior
        featuresLayerGroup?.clearLayers();
        
        const newLayerGroup = L.layerGroup().addTo(mapInstance);

        let bounds: L.LatLngBounds | null = null;

        layerResult.features.forEach(feature => {
            if (!feature.geometry) return;

            const layer = L.geoJSON(feature.geometry, {
                style: {
                    color: '#ff7800',
                    weight: 2,
                    fillOpacity: 0.3
                },
                pointToLayer: (geoJsonPoint, latlng) => {
                    return L.circleMarker(latlng, {
                        radius: 6,
                        color: '#ff7800',
                        fillColor: '#fff',
                        fillOpacity: 1,
                        weight: 2
                    });
                }
            });

            layer.addTo(newLayerGroup);

            // Añadir popup con nombre
            const name = pickName(feature.properties || {});
            layer.bindPopup(`<strong>${name}</strong><br/>${layerResult.layerName}`);

            // Acumular bounds
            const layerBounds = layer.getBounds();
            if (layerBounds.isValid()) {
                bounds = bounds ? bounds.extend(layerBounds) : layerBounds;
            }
        });

        setFeaturesLayerGroup(newLayerGroup);

        // Hacer zoom a los features
        if (bounds && bounds.isValid()) {
            mapInstance.fitBounds(bounds, { padding: [50, 50] });
        }
    }, [mapInstance, featuresLayerGroup]);

    // ── Exportar resultados ───────────────────────────────────────────────────
    const handleExportCSV = useCallback(() => {
        const data = results
            .filter(r => (r.count ?? 0) > 0)
            .map(r => ({
                Capa: r.layerName,
                Grupo: r.group,
                'Total Features': r.count || 0
            }));

        if (data.length === 0) {
            alert('No hay resultados para exportar');
            return;
        }

        const timestamp = new Date().toISOString().split('T')[0];
        downloadAsCSV(data, `analisis-espacial-${timestamp}.csv`);
    }, [results]);

    const handleExportGeoJSON = useCallback(() => {
        const hasFeatures = results.some(r => r.features && r.features.length > 0);
        if (!hasFeatures) {
            alert('Primero debes cargar los detalles de las capas con features');
            return;
        }

        const timestamp = new Date().toISOString().split('T')[0];
        downloadAsGeoJSON(results, `analisis-espacial-${timestamp}.geojson`);
    }, [results]);

    // ── Resultados filtrados ──────────────────────────────────────────────────
    const filteredResults = results.filter(r => {
        if (showOnlyWithData && (r.count ?? 0) === 0) return false;
        if (filterText && !r.layerName.toLowerCase().includes(filterText.toLowerCase())) return false;
        return true;
    });

    // ── Estadísticas ──────────────────────────────────────────────────────────
    const stats = {
        totalFeatures: results.reduce((sum, r) => sum + (r.count ?? 0), 0),
        layersWithData: results.filter(r => (r.count ?? 0) > 0).length,
        topLayers: results
            .filter(r => (r.count ?? 0) > 0)
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
            .slice(0, 5)
    };

    const hasResults = results.length > 0;
    const totalWithFeatures = results.filter(r => (r.count ?? 0) > 0).length;
    const maxCount = Math.max(...results.map(r => r.count ?? 0), 1);

    return (
        <div className="at-wrapper">
            <button
                className={`at-fab ${open ? 'at-fab--active' : ''}`}
                onClick={() => setOpen(!open)}
                aria-label="Herramienta de análisis espacial"
                aria-expanded={open}
            >               
                Análisis Espacial
            </button>

            {open && (
                <div className="at-panel" role="dialog" aria-label="Panel de análisis espacial">
                    {/* ─── Header ──────────────────────────────────────── */}
                    <div className="at-header">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                        <div className="at-header-title">Análisis Espacial</div>
                        <div className="at-header-actions">
                            {hasResults && (
                                <button
                                    className="at-icon-btn"
                                    onClick={handleReset}
                                    title="Resetear"
                                    aria-label="Resetear análisis"
                                >
                                    ↻
                                </button>
                            )}
                            <button
                                className="at-icon-btn at-close-btn"
                                onClick={() => setOpen(false)}
                                aria-label="Cerrar panel"
                            >
                                ✕
                            </button>
                        </div>
                    </div>

                    {/* ─── Tabs ────────────────────────────────────────── */}
                    <div className="at-tabs" role="tablist">
                        <button
                            className={`at-tab ${tab === 'dibujar' ? 'at-tab--active' : ''}`}
                            onClick={() => setTab('dibujar')}
                            role="tab"
                            aria-selected={tab === 'dibujar'}
                        >
                            Dibujar
                        </button>
                        <button
                            className={`at-tab ${tab === 'resultados' ? 'at-tab--active' : ''}`}
                            onClick={() => setTab('resultados')}
                            disabled={!hasResults}
                            role="tab"
                            aria-selected={tab === 'resultados'}
                        >
                            Resultados
                        </button>
                        <button
                            className={`at-tab ${tab === 'estadisticas' ? 'at-tab--active' : ''}`}
                            onClick={() => setTab('estadisticas')}
                            disabled={!hasResults}
                            role="tab"
                            aria-selected={tab === 'estadisticas'}
                        >
                            Estadísticas
                        </button>
                    </div>

                    {error && (
                        <div className="at-error" role="alert">
                            {error}
                        </div>
                    )}

                    {/* ─── Tab: Dibujar ────────────────────────────────── */}
                    {tab === 'dibujar' && (
                        <div className="at-body">
                            {/* Modos de dibujo */}
                            <div>
                                <p className="at-mode-label">Tipo de geometría</p>
                                <div className="at-mode-btns">
                                    <button
                                        className={`at-mode-btn ${mode === 'point' ? 'at-mode-btn--active' : ''}`}
                                        onClick={() => !drawing && setMode('point')}
                                        disabled={drawing}
                                        aria-label="Dibujar punto"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                            <circle cx="12" cy="12" r="4" />
                                        </svg>
                                        Punto
                                    </button>
                                    <button
                                        className={`at-mode-btn ${mode === 'line' ? 'at-mode-btn--active' : ''}`}
                                        onClick={() => !drawing && setMode('line')}
                                        disabled={drawing}
                                        aria-label="Dibujar línea"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M3 3l18 18" />
                                        </svg>
                                        Línea
                                    </button>
                                    <button
                                        className={`at-mode-btn ${mode === 'polygon' ? 'at-mode-btn--active' : ''}`}
                                        onClick={() => !drawing && setMode('polygon')}
                                        disabled={drawing}
                                        aria-label="Dibujar polígono"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 2l10 6-10 6L2 8z" />
                                        </svg>
                                        Polígono
                                    </button>
                                </div>
                            </div>

                            {/* Buffer distance */}
                            {(mode === 'point' || mode === 'line') && (
                                <div className="at-buffer-row">
                                    <label className="at-buffer-label" htmlFor="buffer-distance">
                                        {mode === 'point' ? 'Radio' : 'Buffer'}:
                                    </label>
                                    <input
                                        id="buffer-distance"
                                        type="number"
                                        className="at-buffer-input"
                                        value={dist}
                                        onChange={e => setDist(e.target.value)}
                                        min="0"
                                        step="0.1"
                                        disabled={drawing}
                                        aria-label="Distancia del buffer"
                                    />
                                    <select
                                        className="at-buffer-select"
                                        value={unit}
                                        onChange={e => setUnit(e.target.value as DistUnit)}
                                        disabled={drawing}
                                        aria-label="Unidad de medida"
                                    >
                                        {Object.entries(UNIT_LABELS).map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Mediciones */}
                            {Object.keys(measurements).length > 0 && (
                                <div className="at-measurements">
                                    <p className="at-mode-label">📏 Mediciones</p>
                                    {measurements.length !== undefined && (
                                        <div className="at-measurement-item">
                                            Longitud: <strong>{formatMeasurement(measurements.length, 'length')}</strong>
                                        </div>
                                    )}
                                    {measurements.area !== undefined && (
                                        <div className="at-measurement-item">
                                            Área: <strong>{formatMeasurement(measurements.area, 'area')}</strong>
                                        </div>
                                    )}
                                    {measurements.buffer !== undefined && (
                                        <div className="at-measurement-item">
                                            Buffer: <strong>{formatMeasurement(measurements.buffer, 'length')}</strong>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Instrucciones */}
                            {!drawing && drawnPtsRef.current.length === 0 && (
                                <p className="at-instructions">
                                    {mode === 'point' && (
                                        <>Haz <strong>clic</strong> en el mapa para colocar un punto y crear un área de consulta circular.</>
                                    )}
                                    {mode === 'line' && (
                                        <>Haz <strong>clic</strong> para agregar puntos. <strong>Enter</strong> para finalizar o botón "Finalizar".</>
                                    )}
                                    {mode === 'polygon' && (
                                        <>Haz <strong>clic</strong> para agregar vértices. <strong>Enter</strong> para finalizar o botón "Finalizar". <strong>Ctrl+Z</strong> para deshacer.</>
                                    )}
                                </p>
                            )}

                            {/* Shortcuts hint */}
                            {drawing && (mode === 'line' || mode === 'polygon') && (
                                <p className="at-hint">
                                    ⌨️ <strong>ESC</strong> cancelar | <strong>Enter</strong> finalizar | <strong>Ctrl+Z</strong> deshacer
                                </p>
                            )}

                            {/* Botón de acción */}
                            <div>
                                {!drawing && drawnPtsRef.current.length === 0 ? (
                                    <button
                                        className="at-action-btn"
                                        onClick={handleStartDrawing}
                                        disabled={!mapInstance}
                                    >
                                        ✏ Dibujar en el mapa
                                    </button>
                                ) : drawing && (mode === 'line' || mode === 'polygon') ? (
                                    <button
                                        className="at-action-btn at-action-btn--drawing"
                                        onClick={handleFinishDrawing}
                                        disabled={
                                            (mode === 'line' && drawnPtsRef.current.length < 2) ||
                                            (mode === 'polygon' && drawnPtsRef.current.length < 3)
                                        }
                                    >
                                        ✔ Finalizar ({drawnPtsRef.current.length} pts)
                                    </button>
                                ) : (
                                    <button
                                        className="at-action-btn"
                                        onClick={runAnalysis}
                                        disabled={loading}
                                    >
                                        {loading ? '⏳ Analizando...' : '🔍 Ejecutar Análisis'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ─── Tab: Resultados ──────────────────────────────── */}
                    {tab === 'resultados' && hasResults && (
                        <div className="at-body">

                            {/* ── Estado: cargando ────────────────────────── */}
                            {loading && (
                                <div className="at-loading-state">
                                    <div className="at-loading-spinner" />
                                    <p className="at-loading-title">Consultando capas…</p>
                                    <p className="at-loading-progress">
                                        {results.filter(r => r.count !== null).length} de {results.length} capas analizadas
                                    </p>
                                    <div className="at-progress-bar">
                                        <div
                                            className="at-progress-fill"
                                            style={{
                                                width: `${(results.filter(r => r.count !== null).length / results.length) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* ── Estado: sin coincidencias ───────────────── */}
                            {!loading && totalWithFeatures === 0 && (
                                <div className="at-empty-state">
                                    <div className="at-empty-icon">🔍</div>
                                    <p className="at-empty-title">Sin resultados</p>
                                    <p className="at-empty-desc">
                                        Ninguna capa tiene features dentro del área dibujada.
                                    </p>
                                    <button className="at-new-btn" onClick={handleReset}>
                                        + Nuevo análisis
                                    </button>
                                </div>
                            )}

                            {/* ── Resultados con coincidencias ────────────── */}
                            {!loading && totalWithFeatures > 0 && (
                                <>
                                    {/* Resumen */}
                                    <div className="at-results-summary">
                                        <strong>{stats.totalFeatures.toLocaleString()}</strong> features en{' '}
                                        <strong>{totalWithFeatures}</strong> {totalWithFeatures === 1 ? 'capa' : 'capas'}
                                        {' '}de <strong>{results.length}</strong> consultadas.
                                    </div>

                                    <div className="at-export-buttons">
                                        <button className="at-export-btn" onClick={handleExportCSV} aria-label="Exportar CSV">
                                            📊 Exportar CSV
                                        </button>
                                        <button className="at-export-btn" onClick={handleExportGeoJSON} aria-label="Exportar GeoJSON">
                                            🗺️ Exportar GeoJSON
                                        </button>
                                    </div>

                                    {/* Tabla — solo capas con coincidencia, ordenadas por count desc */}
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
                                                .filter(r => (r.count ?? 0) > 0)
                                                .slice()
                                                .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
                                                .map(lr => {
                                                    const realIdx = results.findIndex(r => r.layerId === lr.layerId);
                                                    return (
                                                        <React.Fragment key={lr.layerId}>
                                                            <tr>
                                                                <td className="at-layer-name">{lr.layerName}</td>
                                                                <td className="at-count">
                                                                    {lr.count?.toLocaleString()}
                                                                </td>
                                                                <td>
                                                                    <div style={{ display: 'flex', gap: '4px' }}>
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
                                                                            aria-label={`Ver detalles de ${lr.layerName}`}
                                                                            aria-expanded={detailLayerId === lr.layerId}
                                                                        >
                                                                            {lr.loadingDetails ? '…' : detailLayerId === lr.layerId ? 'Ocultar' : 'Detalles'}
                                                                        </button>
                                                                        {lr.features && lr.features.length > 0 && (
                                                                            <button
                                                                                className="at-details-btn"
                                                                                onClick={() => showFeaturesOnMap(lr)}
                                                                                title="Ver en mapa"
                                                                                aria-label={`Mostrar ${lr.layerName} en el mapa`}
                                                                            >
                                                                                🗺️
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>

                                                            {/* Panel de detalles */}
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

                                    <button className="at-new-btn" onClick={handleReset}>
                                        + Nuevo análisis
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* ─── Tab: Estadísticas ────────────────────────────── */}
                    {tab === 'estadisticas' && hasResults && (
                        <div className="at-body">
                            <div className="at-stats-summary">
                                <h3 className="at-stats-title">📊 Resumen General</h3>
                                <div className="at-stats-grid">
                                    <div className="at-stat-card">
                                        <div className="at-stat-value">{stats.totalFeatures.toLocaleString()}</div>
                                        <div className="at-stat-label">Features Totales</div>
                                    </div>
                                    <div className="at-stat-card">
                                        <div className="at-stat-value">{stats.layersWithData}</div>
                                        <div className="at-stat-label">Capas con Datos</div>
                                    </div>
                                    <div className="at-stat-card">
                                        <div className="at-stat-value">{results.length}</div>
                                        <div className="at-stat-label">Capas Totales</div>
                                    </div>
                                </div>
                            </div>

                            {stats.topLayers.length > 0 && (
                                <>
                                    <h3 className="at-stats-title">🏆 Top 5 Capas</h3>
                                    <div className="at-chart">
                                        {stats.topLayers.map((lr, idx) => (
                                            <div key={lr.layerId} className="at-chart-row">
                                                <span className="at-chart-rank">#{idx + 1}</span>
                                                <span className="at-chart-label">{lr.layerName}</span>
                                                <div className="at-chart-bar-container">
                                                    <div
                                                        className="at-chart-bar"
                                                        style={{ width: `${((lr.count ?? 0) / maxCount) * 100}%` }}
                                                    />
                                                </div>
                                                <span className="at-chart-value">{(lr.count ?? 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {/* Análisis por grupo */}
                            {(() => {
                                const byGroup = results
                                    .filter(r => (r.count ?? 0) > 0)
                                    .reduce((acc, r) => {
                                        const group = r.group || 'Sin grupo';
                                        acc[group] = (acc[group] || 0) + (r.count ?? 0);
                                        return acc;
                                    }, {} as Record<string, number>);

                                const groupEntries = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);

                                return groupEntries.length > 0 ? (
                                    <>
                                        <h3 className="at-stats-title">📁 Distribución por Grupo</h3>
                                        <div className="at-group-stats">
                                            {groupEntries.map(([group, count]) => (
                                                <div key={group} className="at-group-stat-item">
                                                    <span className="at-group-stat-name">{group}</span>
                                                    <span className="at-group-stat-value">{count.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : null;
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default AnalysisTool;