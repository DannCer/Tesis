/**
 * @fileoverview Fábrica de estilos para capas vectoriales de Leaflet.
 *
 * Lee legendData.ts y genera las funciones de estilo correctas según el
 * tipo de cada capa (polygon, point, ranged-*, categorical-*, variant).
 * Incluye un sistema de caché para no recalcular estilos innecesariamente.
 *
 * Uso:
 *   import { getLayerOptions } from '../utils/layerStyleFactory';
 *   const options = getLayerOptions('vw_estados');
 *   // options.style   → función de estilo para polígonos
 *   // options.pointToLayer → función de estilo para puntos
 *
 * @module utils/layerStyleFactory
 */

import L from 'leaflet';
import { legendData, LegendItem, VariantLegend } from './legendData';

// ============================================================================
// ESTILOS BASE
// ============================================================================

const BASE_POLYGON: L.PathOptions = {
    weight: 2,
    opacity: 1,
    fillOpacity: 0.7,
    color: '#333333',
    fillColor: '#e0e0e0',
};

const BASE_POINT = {
    radius: 6,
    weight: 1.5,
    opacity: 1,
    fillOpacity: 0.85,
    color: '#ffffff',
};

const DEFAULT_STYLE: L.PathOptions = {
    ...BASE_POLYGON,
    fillColor: '#e0e0e0',
};

// ============================================================================
// CACHÉ DE ESTILOS
// ============================================================================

class StyleCache {
    private cache = new Map<string, LayerOptions>();
    private version = 0;

    get(key: string): LayerOptions | undefined {
        return this.cache.get(key);
    }

    set(key: string, value: LayerOptions): void {
        this.cache.set(key, value);
    }

    key(layerName: string, variant?: string | null): string {
        return `${layerName}:${variant ?? 'default'}:v${this.version}`;
    }

    invalidate(layerName?: string): void {
        if (layerName) {
            for (const k of this.cache.keys()) {
                if (k.startsWith(`${layerName}:`)) this.cache.delete(k);
            }
        } else {
            this.cache.clear();
        }
    }

    bumpVersion(): number {
        return ++this.version;
    }
}

const cache = new StyleCache();

// ============================================================================
// TIPOS PÚBLICOS
// ============================================================================

export interface LayerOptions {
    /** Función de estilo para polígonos/líneas */
    style?: L.StyleFunction;
    /** Función de estilo para puntos */
    pointToLayer?: (feature: GeoJSON.Feature, latlng: L.LatLng) => L.Layer;
    /** true si la capa es de puntos */
    isPoint: boolean;
}

// ============================================================================
// GENERADORES DE ESTILO INTERNOS
// ============================================================================

/**
 * Estilo de polígono/punto de color fijo.
 */
function createSolidPolygonStyle(color: string, borderColor?: string): L.StyleFunction {
    return () => ({
        ...BASE_POLYGON,
        fillColor: color === 'transparent' ? 'transparent' : color,
        fillOpacity: color === 'transparent' ? 0 : BASE_POLYGON.fillOpacity,
        color: borderColor ?? color,
    });
}

/** Opciones de borde para puntos, leídas desde legendData */
interface PointBorderOptions {
    borderColor: string;
    borderWeight: number;
}

/** Color de borde por defecto para puntos: oscuro, legible sobre cualquier relleno */
const DEFAULT_POINT_BORDER: PointBorderOptions = {
    borderColor: '#333333',
    borderWeight: 1.5,
};

/**
 * Estilo de punto de color fijo (circleMarker).
 * @param fillColor  Color de relleno del punto
 * @param border     Color y peso del borde (default: oscuro)
 */
function createSolidPointStyle(fillColor: string, border = DEFAULT_POINT_BORDER) {
    return (_feature: GeoJSON.Feature, latlng: L.LatLng) =>
        L.circleMarker(latlng, {
            ...BASE_POINT,
            fillColor,
            color:  border.borderColor,
            weight: border.borderWeight,
        });
}

/**
 * Estilo de punto — múltiples items, elige por prefijo de nombre de capa.
 * (sp = índice 0, sb = índice 1, resto = índice 0)
 */
function createMultiPointStyle(layerName: string, items: LegendItem[], border = DEFAULT_POINT_BORDER) {
    const idx = layerName.includes('sb') ? 1 : 0;
    const color = items[Math.min(idx, items.length - 1)]?.color ?? '#888';
    return createSolidPointStyle(color, border);
}

/**
 * Estilo por rangos numéricos — polígono o punto.
 * @param border  Color y peso del borde para puntos
 */
function createRangedStyle(
    propertyName: string,
    items: LegendItem[],
    mode: 'polygon' | 'point',
    border = DEFAULT_POINT_BORDER
): LayerOptions {
    const getColor = (feature: GeoJSON.Feature): string => {
        const val = feature?.properties?.[propertyName];
        if (val === null || val === undefined) return '#e0e0e0';
        const num = parseFloat(String(val).replace(/,/g, ''));
        for (const item of items) {
            if (item.value !== undefined && num <= item.value) return item.color;
        }
        return items[items.length - 1]?.color ?? '#e0e0e0';
    };

    if (mode === 'polygon') {
        return {
            isPoint: false,
            style: (feature) => ({
                ...BASE_POLYGON,
                fillColor: getColor(feature!),
                color: '#555',
            }),
        };
    } else {
        return {
            isPoint: true,
            pointToLayer: (feature, latlng) =>
                L.circleMarker(latlng, {
                    ...BASE_POINT,
                    fillColor:  getColor(feature),
                    color:      border.borderColor,
                    weight:     border.borderWeight,
                }),
        };
    }
}

/**
 * Estilo categórico — polígono o punto.
 * @param border  Color y peso del borde para puntos
 */
function createCategoricalStyle(
    propertyName: string,
    items: LegendItem[],
    mode: 'polygon' | 'point',
    border = DEFAULT_POINT_BORDER
): LayerOptions {
    const colorMap = new Map(items.map(i => [i.label, i.color]));

    const getColor = (feature: GeoJSON.Feature): string => {
        const val = feature?.properties?.[propertyName];
        return colorMap.get(val) ?? '#e0e0e0';
    };

    if (mode === 'polygon') {
        return {
            isPoint: false,
            style: (feature) => ({
                ...BASE_POLYGON,
                fillColor: getColor(feature!),
                color: '#555',
            }),
        };
    } else {
        return {
            isPoint: true,
            pointToLayer: (feature, latlng) =>
                L.circleMarker(latlng, {
                    ...BASE_POINT,
                    fillColor:  getColor(feature),
                    color:      border.borderColor,
                    weight:     border.borderWeight,
                }),
        };
    }
}

// ============================================================================
// RESOLVER DE VARIANTE
// ============================================================================

function resolveVariant(
    variantData: VariantLegend,
    layerName: string,
    border = DEFAULT_POINT_BORDER
): LayerOptions {
    const { type, propertyName, items } = variantData;

    if (type === 'ranged-polygon')
        return createRangedStyle(propertyName!, items, 'polygon');
    if (type === 'ranged-point')
        return createRangedStyle(propertyName!, items, 'point', border);
    if (type === 'categorical-polygon')
        return createCategoricalStyle(propertyName!, items, 'polygon');
    if (type === 'categorical-point')
        return createCategoricalStyle(propertyName!, items, 'point', border);
    if (type === 'polygon')
        return {
            isPoint: false,
            style: createSolidPolygonStyle(items[0]?.color ?? '#ccc', items[0]?.borderColor),
        };
    if (type === 'point')
        return {
            isPoint: true,
            pointToLayer: items.length > 1
                ? createMultiPointStyle(layerName, items, border)
                : createSolidPointStyle(items[0]?.color ?? '#888', border),
        };

    return { isPoint: false, style: () => DEFAULT_STYLE };
}

// ============================================================================
// FUNCIÓN PÚBLICA PRINCIPAL
// ============================================================================

/**
 * Devuelve las opciones de estilo para una capa vectorial.
 *
 * @param layerName  - ID de la capa (igual que en AVAILABLE_LAYERS y legendData)
 * @param variant    - Clave de variante activa (solo para capas type='variant')
 * @param forceUpdate - Invalida caché y recalcula
 * @returns LayerOptions con style o pointToLayer listo para <GeoJSON>
 */
export function getLayerOptions(
    layerName: string,
    variant: string | null = null,
    forceUpdate = false
): LayerOptions {
    const cacheKey = cache.key(layerName, variant);

    if (!forceUpdate) {
        const cached = cache.get(cacheKey);
        if (cached) return cached;
    }

    const legend = legendData[layerName];

    // Sin leyenda → estilo por defecto gris
    if (!legend) {
        const fallback: LayerOptions = { isPoint: false, style: () => DEFAULT_STYLE };
        cache.set(cacheKey, fallback);
        return fallback;
    }

    let result: LayerOptions;

    // Borde para puntos: lee color y weight definidos en legendData,
    // con fallback al DEFAULT_POINT_BORDER oscuro
    const border: PointBorderOptions = {
        borderColor:  legend.color  ?? DEFAULT_POINT_BORDER.borderColor,
        borderWeight: legend.weight ?? DEFAULT_POINT_BORDER.borderWeight,
    };

    // Capa con variantes — resolver la variante activa
    if (legend.type === 'variant' && legend.variants) {
        const variantKey = variant ?? Object.keys(legend.variants)[0];
        const variantData = legend.variants[variantKey];
        result = variantData
            ? resolveVariant(variantData, layerName, border)
            : { isPoint: false, style: () => DEFAULT_STYLE };
    }
    // Ranged
    else if (legend.type === 'ranged-polygon')
        result = createRangedStyle(legend.propertyName!, legend.items!, 'polygon');
    else if (legend.type === 'ranged-point')
        result = createRangedStyle(legend.propertyName!, legend.items!, 'point', border);
    // Categorical
    else if (legend.type === 'categorical-polygon')
        result = createCategoricalStyle(legend.propertyName!, legend.items!, 'polygon');
    else if (legend.type === 'categorical-point')
        result = createCategoricalStyle(legend.propertyName!, legend.items!, 'point', border);
    // Solid polygon
    else if (legend.type === 'polygon')
        result = {
            isPoint: false,
            style: createSolidPolygonStyle(
                legend.items![0]?.color ?? '#ccc',
                legend.items![0]?.borderColor
            ),
        };
    // Solid point
    else if (legend.type === 'point')
        result = {
            isPoint: true,
            pointToLayer: legend.items!.length > 1
                ? createMultiPointStyle(layerName, legend.items!, border)
                : createSolidPointStyle(legend.items![0]?.color ?? '#888', border),
        };
    else
        result = { isPoint: false, style: () => DEFAULT_STYLE };

    cache.set(cacheKey, result);
    return result;
}

// ============================================================================
// UTILIDADES DE CACHÉ
// ============================================================================

/** Incrementa versión de caché, forzando recálculo en el siguiente getLayerOptions */
export const forceStyleUpdate = (): number => cache.bumpVersion();

/** Limpia entradas de caché de una capa o de todas */
export const clearStyleCache = (layerName?: string): void => cache.invalidate(layerName);

/** Información de diagnóstico de la caché */
export const getCacheInfo = () => ({
    size: cache['cache'].size,
    version: cache['version'],
});
