/**
 * Utilidades para el AnalysisTool
 * 
 * Funciones helper extraídas del componente principal
 * para mejor organización y reutilización.
 */

import L from 'leaflet';

// ═══════════════════════════════════════════════════════════════════════════
// MEDICIONES GEOGRÁFICAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcula la longitud total de una línea definida por puntos
 * @param pts Array de coordenadas LatLng
 * @returns Longitud en metros
 */
export function calculateLength(pts: L.LatLng[]): number {
    if (pts.length < 2) return 0;
    
    let length = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        length += pts[i].distanceTo(pts[i + 1]);
    }
    return length;
}

/**
 * Calcula el área de un polígono usando la fórmula del área de Shoelace
 * Aproximación válida para áreas pequeñas en coordenadas geográficas
 * @param pts Array de coordenadas LatLng
 * @returns Área en metros cuadrados
 */
export function calculateArea(pts: L.LatLng[]): number {
    if (pts.length < 3) return 0;
    
    // Cerrar el polígono si no está cerrado
    const coords = [...pts, pts[0]].map(p => [p.lng, p.lat]);
    let area = 0;
    
    // Fórmula de Shoelace
    for (let i = 0; i < coords.length - 1; i++) {
        area += coords[i][0] * coords[i + 1][1] - coords[i + 1][0] * coords[i][1];
    }
    
    // Convertir a metros cuadrados (aproximación)
    // 1 grado lat/lng ≈ 111km
    return Math.abs(area / 2) * 111000 * 111000;
}

/**
 * Formatea una medición de distancia o área con las unidades apropiadas
 * @param value Valor numérico en metros (para distancia) o m² (para área)
 * @param type Tipo de medición
 * @returns String formateado con unidades
 */
export function formatMeasurement(value: number, type: 'length' | 'area'): string {
    if (type === 'length') {
        if (value < 1000) {
            return `${value.toFixed(1)} m`;
        }
        return `${(value / 1000).toFixed(2)} km`;
    }
    
    // Para área
    if (value < 10000) {
        return `${value.toFixed(1)} m²`;
    }
    if (value < 1000000) {
        return `${(value / 10000).toFixed(2)} ha`;
    }
    return `${(value / 1000000).toFixed(2)} km²`;
}

// ═══════════════════════════════════════════════════════════════════════════
// GENERACIÓN WKT (Well-Known Text)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Genera WKT para un punto
 */
export function pointWkt(lat: number, lng: number): string {
    return `POINT(${lng} ${lat})`;
}

/**
 * Genera WKT para una línea
 */
export function lineStringWkt(pts: L.LatLng[]): string {
    const coords = pts.map(p => `${p.lng} ${p.lat}`).join(', ');
    return `LINESTRING(${coords})`;
}

/**
 * Genera WKT para un polígono
 */
export function polygonWkt(pts: L.LatLng[]): string {
    const coords = [...pts, pts[0]].map(p => `${p.lng} ${p.lat}`).join(', ');
    return `POLYGON((${coords}))`;
}

/**
 * Construye una consulta CQL para análisis espacial
 * @param mode Modo de dibujo
 * @param pts Puntos dibujados
 * @param dist Distancia del buffer
 * @param unit Unidad de distancia
 * @returns String CQL para WFS
 */
export function buildCql(
    mode: 'point' | 'line' | 'polygon',
    pts: L.LatLng[],
    dist: number,
    unit: 'kilometers' | 'meters' | 'miles'
): string {
    if (mode === 'point') {
        return `DWithin(geometry, ${pointWkt(pts[0].lat, pts[0].lng)}, ${dist}, ${unit})`;
    }
    
    if (mode === 'line') {
        return `DWithin(geometry, ${lineStringWkt(pts)}, ${dist}, ${unit})`;
    }
    
    return `INTERSECTS(geometry, ${polygonWkt(pts)})`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTACIÓN DE DATOS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Exporta datos a archivo CSV
 * @param data Array de objetos a exportar
 * @param filename Nombre del archivo
 */
export function downloadAsCSV(data: any[], filename: string): void {
    if (data.length === 0) {
        console.warn('No hay datos para exportar');
        return;
    }
    
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const value = row[header] ?? '';
                // Escapar comillas y envolver en comillas si contiene comas
                const escaped = String(value).replace(/"/g, '""');
                return `"${escaped}"`;
            }).join(',')
        )
    ];
    
    const csv = csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Limpiar URL
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

/**
 * Exporta features a archivo GeoJSON
 * @param features Array de features con geometría
 * @param filename Nombre del archivo
 */
export function downloadAsGeoJSON(features: any[], filename: string): void {
    const validFeatures = features.filter(f => f && f.geometry);
    
    if (validFeatures.length === 0) {
        console.warn('No hay features con geometría para exportar');
        return;
    }
    
    const geojson = {
        type: 'FeatureCollection',
        features: validFeatures
    };
    
    const jsonString = JSON.stringify(geojson, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

// ═══════════════════════════════════════════════════════════════════════════
// ALMACENAMIENTO LOCAL
// ═══════════════════════════════════════════════════════════════════════════

export interface AnalysisHistory {
    id: string;
    timestamp: number;
    mode: 'point' | 'line' | 'polygon';
    distance: number;
    unit: 'kilometers' | 'meters' | 'miles';
    results: any[];
    measurements?: {
        area?: number;
        length?: number;
        buffer?: number;
    };
}

const STORAGE_KEY = 'analysisHistory';
const MAX_HISTORY_ITEMS = 10;

/**
 * Guarda un análisis en el historial local
 * @param analysis Objeto del análisis a guardar
 */
export function saveAnalysisToHistory(analysis: AnalysisHistory): void {
    try {
        const history = getAnalysisHistory();
        history.unshift(analysis);
        
        // Mantener solo los últimos N items
        const trimmed = history.slice(0, MAX_HISTORY_ITEMS);
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch (err) {
        console.warn('No se pudo guardar en historial:', err);
    }
}

/**
 * Recupera el historial de análisis
 * @returns Array de análisis guardados
 */
export function getAnalysisHistory(): AnalysisHistory[] {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.warn('Error al leer historial:', err);
        return [];
    }
}

/**
 * Limpia el historial de análisis
 */
export function clearAnalysisHistory(): void {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
        console.warn('Error al limpiar historial:', err);
    }
}

/**
 * Elimina un análisis específico del historial
 * @param id ID del análisis a eliminar
 */
export function removeAnalysisFromHistory(id: string): void {
    try {
        const history = getAnalysisHistory();
        const filtered = history.filter(item => item.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (err) {
        console.warn('Error al eliminar del historial:', err);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILIDADES DE FEATURES
// ═══════════════════════════════════════════════════════════════════════════

const SKIP_FIELDS = new Set([
    'bbox', 'geometry', 'the_geom', 'geom', 'shape', 'objectid'
]);

const NAME_CANDIDATES = [
    'NOMBRE', 'nombre', 'name', 'NAME',
    'Estado', 'estado', 'Municipio', 'municipio',
    'Localidad', 'localidad', 'descripcion', 'DESCRIPCION',
    'tipo', 'TIPO', 'cve_geo', 'id', 'ID'
];

/**
 * Extrae el nombre más apropiado de las propiedades de un feature
 * @param props Propiedades del feature
 * @returns Nombre del feature
 */
export function pickFeatureName(props: Record<string, any>): string {
    // Buscar en candidatos conocidos
    for (const candidate of NAME_CANDIDATES) {
        if (props[candidate] != null && props[candidate] !== '') {
            return String(props[candidate]);
        }
    }
    
    // Si no se encuentra, usar la primera propiedad válida
    const keys = Object.keys(props).filter(k => !SKIP_FIELDS.has(k.toLowerCase()));
    if (keys.length > 0) {
        return String(props[keys[0]]);
    }
    
    return 'Sin nombre';
}

/**
 * Filtra campos innecesarios de las propiedades
 * @param props Propiedades del feature
 * @returns Propiedades filtradas
 */
export function filterFeatureProperties(props: Record<string, any>): Record<string, any> {
    const filtered: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(props)) {
        if (!SKIP_FIELDS.has(key.toLowerCase())) {
            filtered[key] = value;
        }
    }
    
    return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDACIONES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Valida que haya suficientes puntos para el modo seleccionado
 * @param mode Modo de dibujo
 * @param pointCount Número de puntos dibujados
 * @returns Error si no es válido, null si es válido
 */
export function validateGeometry(
    mode: 'point' | 'line' | 'polygon',
    pointCount: number
): string | null {
    if (pointCount === 0) {
        return 'Debes dibujar una geometría primero';
    }
    
    if (mode === 'line' && pointCount < 2) {
        return 'Una línea requiere al menos 2 puntos';
    }
    
    if (mode === 'polygon' && pointCount < 3) {
        return 'Un polígono requiere al menos 3 puntos';
    }
    
    return null;
}

/**
 * Valida que la distancia del buffer sea válida
 * @param mode Modo de dibujo
 * @param distance Distancia ingresada
 * @returns Error si no es válido, null si es válido
 */
export function validateBufferDistance(
    mode: 'point' | 'line' | 'polygon',
    distance: number
): string | null {
    if ((mode === 'point' || mode === 'line') && distance <= 0) {
        return 'La distancia debe ser mayor a 0';
    }
    
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMATEO DE FECHAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Formatea un timestamp a string legible
 * @param timestamp Timestamp en milisegundos
 * @returns String formateado
 */
export function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString('es-MX', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Formatea un timestamp a formato relativo (hace X tiempo)
 * @param timestamp Timestamp en milisegundos
 * @returns String formateado (ej: "hace 2 horas")
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `hace ${days} día${days > 1 ? 's' : ''}`;
    if (hours > 0) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;
    return 'hace unos segundos';
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════════════════════

export interface LayerResult {
    layerId: string;
    layerName: string;
    wfsName: string;
    group: string;
    count: number | null;
    features?: any[] | null;
}

/**
 * Calcula estadísticas agregadas de los resultados
 * @param results Array de resultados por capa
 * @returns Objeto con estadísticas
 */
export function calculateStats(results: LayerResult[]) {
    const totalFeatures = results.reduce((sum, r) => sum + (r.count ?? 0), 0);
    const layersWithData = results.filter(r => (r.count ?? 0) > 0).length;
    
    const topLayers = results
        .filter(r => (r.count ?? 0) > 0)
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, 5);
    
    const byGroup = results
        .filter(r => (r.count ?? 0) > 0)
        .reduce((acc, r) => {
            const group = r.group || 'Sin grupo';
            acc[group] = (acc[group] || 0) + (r.count ?? 0);
            return acc;
        }, {} as Record<string, number>);
    
    return {
        totalFeatures,
        layersWithData,
        totalLayers: results.length,
        topLayers,
        byGroup
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export default {
    // Mediciones
    calculateLength,
    calculateArea,
    formatMeasurement,
    
    // WKT
    pointWkt,
    lineStringWkt,
    polygonWkt,
    buildCql,
    
    // Exportación
    downloadAsCSV,
    downloadAsGeoJSON,
    
    // Almacenamiento
    saveAnalysisToHistory,
    getAnalysisHistory,
    clearAnalysisHistory,
    removeAnalysisFromHistory,
    
    // Features
    pickFeatureName,
    filterFeatureProperties,
    
    // Validaciones
    validateGeometry,
    validateBufferDistance,
    
    // Formateo
    formatTimestamp,
    formatRelativeTime,
    
    // Estadísticas
    calculateStats
};