/**
 * useAnalysisTool - Custom Hook para lógica de análisis espacial
 * 
 * Extrae la lógica del componente AnalysisTool para mejor separación
 * de responsabilidades y reutilización.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import { 
    buildCql, 
    validateGeometry, 
    validateBufferDistance,
    calculateLength,
    calculateArea,
    saveAnalysisToHistory
} from './analysisToolUtils';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export type DrawMode = 'point' | 'line' | 'polygon';
export type DistUnit = 'kilometers' | 'meters' | 'miles';

export interface LayerResult {
    layerId: string;
    layerName: string;
    wfsName: string;
    group: string;
    count: number | null;
    features: any[] | null;
    loadingDetails: boolean;
}

export interface Measurements {
    area?: number;
    length?: number;
    buffer?: number;
}

export interface AnalysisState {
    // UI state
    drawing: boolean;
    loading: boolean;
    error: string | null;
    
    // Configuración
    mode: DrawMode;
    distance: string;
    unit: DistUnit;
    
    // Resultados
    results: LayerResult[];
    measurements: Measurements;
    
    // Geometría
    points: L.LatLng[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════════════════

export function useAnalysisTool(
    mapInstance: L.Map | null,
    vectorLayers: any[],
    wfsService: any,
    dynamicWfsService: any
) {
    // ── Estado ──────────────────────────────────────────────────────────────
    const [drawing, setDrawing] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<DrawMode>('point');
    const [distance, setDistance] = useState<string>('1');
    const [unit, setUnit] = useState<DistUnit>('kilometers');
    const [results, setResults] = useState<LayerResult[]>([]);
    const [measurements, setMeasurements] = useState<Measurements>({});

    // ── Refs para elementos de Leaflet ─────────────────────────────────────
    const drawnPtsRef = useRef<L.LatLng[]>([]);
    const polylineRef = useRef<L.Polyline | null>(null);
    const polygonRef = useRef<L.Polygon | null>(null);
    const circleRef = useRef<L.Circle | null>(null);
    const markerRef = useRef<L.CircleMarker | null>(null);
    const previewRef = useRef<L.Polyline | null>(null);
    const markersRef = useRef<L.CircleMarker[]>([]);

    // ── Limpiar capas del mapa ─────────────────────────────────────────────
    const clearMapLayers = useCallback(() => {
        if (!mapInstance) return;
        
        polylineRef.current?.remove();
        polylineRef.current = null;
        
        polygonRef.current?.remove();
        polygonRef.current = null;
        
        circleRef.current?.remove();
        circleRef.current = null;
        
        markerRef.current?.remove();
        markerRef.current = null;
        
        previewRef.current?.remove();
        previewRef.current = null;
        
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        
        drawnPtsRef.current = [];
    }, [mapInstance]);

    // ── Reset completo ──────────────────────────────────────────────────────
    const reset = useCallback(() => {
        clearMapLayers();
        setDrawing(false);
        setResults([]);
        setError(null);
        setMeasurements({});
    }, [clearMapLayers]);

    // ── Actualizar mediciones ───────────────────────────────────────────────
    const updateMeasurements = useCallback(() => {
        const pts = drawnPtsRef.current;
        if (pts.length === 0) {
            setMeasurements({});
            return;
        }

        const newMeasurements: Measurements = {};

        // Buffer para punto o línea
        if (mode === 'point' || mode === 'line') {
            const distValue = parseFloat(distance) || 0;
            const distMeters = unit === 'kilometers' ? distValue * 1000 
                             : unit === 'miles' ? distValue * 1609.34 
                             : distValue;
            newMeasurements.buffer = distMeters;
        }

        // Longitud para línea
        if (mode === 'line' && pts.length >= 2) {
            newMeasurements.length = calculateLength(pts);
        }

        // Área para polígono
        if (mode === 'polygon' && pts.length >= 3) {
            newMeasurements.area = calculateArea(pts);
        }

        setMeasurements(newMeasurements);
    }, [mode, distance, unit]);

    // ── Iniciar dibujo ──────────────────────────────────────────────────────
    const startDrawing = useCallback(() => {
        if (!mapInstance) return;
        
        clearMapLayers();
        setDrawing(true);
        setError(null);
        drawnPtsRef.current = [];

        const onClick = (e: L.LeafletMouseEvent) => {
            const pt = e.latlng;
            drawnPtsRef.current.push(pt);

            // Agregar marcador visual
            const marker = L.circleMarker(pt, {
                radius: 5,
                color: '#2563eb',
                fillColor: '#fff',
                fillOpacity: 1,
                weight: 2
            }).addTo(mapInstance);
            markersRef.current.push(marker);

            // Modo punto: finalizar inmediatamente
            if (mode === 'point') {
                markerRef.current = marker;
                const distVal = parseFloat(distance) || 0;
                
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
            }
            // Modo línea
            else if (mode === 'line') {
                if (drawnPtsRef.current.length === 1) {
                    polylineRef.current = L.polyline([pt], {
                        color: '#2563eb',
                        weight: 3
                    }).addTo(mapInstance);
                } else {
                    polylineRef.current?.setLatLngs(drawnPtsRef.current);
                }
                updateMeasurements();
            }
            // Modo polígono
            else if (mode === 'polygon') {
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
    }, [mapInstance, mode, distance, unit, clearMapLayers, updateMeasurements]);

    // ── Finalizar dibujo ────────────────────────────────────────────────────
    const finishDrawing = useCallback(() => {
        if (!mapInstance) return;
        
        mapInstance.off('click');
        mapInstance.off('mousemove');
        previewRef.current?.remove();
        previewRef.current = null;
        setDrawing(false);
        updateMeasurements();
    }, [mapInstance, updateMeasurements]);

    // ── Deshacer último punto ───────────────────────────────────────────────
    const undoLastPoint = useCallback(() => {
        if (drawnPtsRef.current.length === 0) return;
        
        drawnPtsRef.current.pop();
        const lastMarker = markersRef.current.pop();
        lastMarker?.remove();
        
        if (mode === 'line' && polylineRef.current) {
            polylineRef.current.setLatLngs(drawnPtsRef.current);
        } else if (mode === 'polygon' && drawnPtsRef.current.length >= 2) {
            polygonRef.current?.setLatLngs(drawnPtsRef.current);
        }
        
        updateMeasurements();
    }, [mode, updateMeasurements]);

    // ── Ejecutar análisis ───────────────────────────────────────────────────
    const runAnalysis = useCallback(async () => {
        const pts = drawnPtsRef.current;
        
        // Validaciones
        const geomError = validateGeometry(mode, pts.length);
        if (geomError) {
            setError(`⚠️ ${geomError}`);
            return;
        }

        const distVal = parseFloat(distance) || 0;
        const distError = validateBufferDistance(mode, distVal);
        if (distError) {
            setError(`⚠️ ${distError}`);
            return;
        }

        setError(null);
        setLoading(true);

        // Construir CQL
        const cql = buildCql(mode, pts, distVal, unit);

        // Inicializar resultados
        const allResults: LayerResult[] = vectorLayers.map(vl => ({
            layerId: vl.id,
            layerName: vl.name,
            wfsName: vl.wfsLayerName || vl.name,
            group: vl.grupo || 'Sin grupo',
            count: null,
            features: null,
            loadingDetails: false
        }));

        setResults(allResults);

        // Consultar todas las capas en paralelo
        await Promise.all(
            allResults.map(async (lr, idx) => {
                try {
                    const count = await dynamicWfsService.queryCount(lr.wfsName, cql);
                    
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
        saveAnalysisToHistory({
            id: Date.now().toString(),
            timestamp: Date.now(),
            mode,
            distance: distVal,
            unit,
            results: allResults,
            measurements
        });

    }, [mode, distance, unit, vectorLayers, dynamicWfsService, measurements]);

    // ── Cargar detalles de una capa ────────────────────────────────────────
    const loadLayerDetails = useCallback(async (layerResult: LayerResult, index: number) => {
        if (layerResult.features) return;

        setResults(prev => {
            const updated = [...prev];
            updated[index] = { ...updated[index], loadingDetails: true };
            return updated;
        });

        try {
            const pts = drawnPtsRef.current;
            const distVal = parseFloat(distance) || 0;
            const cql = buildCql(mode, pts, distVal, unit);
            
            const features = await wfsService.queryFeatures(
                layerResult.wfsName, 
                cql,
                100 // Límite de features
            );

            setResults(prev => {
                const updated = [...prev];
                updated[index] = { 
                    ...updated[index], 
                    features: features || [], 
                    loadingDetails: false 
                };
                return updated;
            });
        } catch (err) {
            console.error(`Error cargando detalles de ${layerResult.layerName}:`, err);
            setError(`⚠️ Error al cargar detalles: ${err instanceof Error ? err.message : 'Error desconocido'}`);
            
            setResults(prev => {
                const updated = [...prev];
                updated[index] = { ...updated[index], loadingDetails: false };
                return updated;
            });
        }
    }, [mode, distance, unit, wfsService]);

    // ── Cleanup en unmount ──────────────────────────────────────────────────
    useEffect(() => {
        return () => {
            clearMapLayers();
        };
    }, [clearMapLayers]);

    // ── Return API ──────────────────────────────────────────────────────────
    return {
        // Estado
        state: {
            drawing,
            loading,
            error,
            mode,
            distance,
            unit,
            results,
            measurements,
            points: drawnPtsRef.current
        },
        
        // Setters
        setMode,
        setDistance,
        setUnit,
        setError,
        
        // Acciones de dibujo
        startDrawing,
        finishDrawing,
        undoLastPoint,
        clearMapLayers,
        reset,
        
        // Acciones de análisis
        runAnalysis,
        loadLayerDetails,
        
        // Refs (para acceso directo si es necesario)
        refs: {
            drawnPts: drawnPtsRef,
            polyline: polylineRef,
            polygon: polygonRef,
            circle: circleRef,
            marker: markerRef,
            preview: previewRef,
            markers: markersRef
        }
    };
}

export default useAnalysisTool;