/**
 * @fileoverview Estilos Leaflet para capas vectoriales WFS.
 *
 * La simbología visual (leyenda) viene de GeoServer vía WMS GetLegendGraphic.
 * Este módulo solo genera estilos simples para el renderizado Leaflet usando
 * los valores de color, fillOpacity y weight definidos en layersConfig.ts.
 *
 * @module utils/layerStyleFactory
 */

import L from 'leaflet';
import { VECTOR_LAYERS } from '../config/layersConfig';

// ============================================================================
// TIPOS
// ============================================================================

export interface LayerOptions {
    /** true si la capa usa pointToLayer (puntos), false si usa style (polígonos/líneas) */
    isPoint: boolean;
    style?: (feature?: GeoJSON.Feature) => L.PathOptions;
    pointToLayer?: (feature: GeoJSON.Feature, latlng: L.LatLng) => L.Layer;
}

// ============================================================================
// ESTILO POR DEFECTO
// ============================================================================

const DEFAULT: L.PathOptions = {
    color:       '#8d1c3d',
    weight:      2,
    opacity:     1,
    fillOpacity: 0.15,
    fillColor:   '#8d1c3d',
};

// ============================================================================
// CACHÉ SIMPLE
// ============================================================================

const cache = new Map<string, LayerOptions>();

// ============================================================================
// API PÚBLICA
// ============================================================================

/**
 * Devuelve opciones de estilo Leaflet para una capa vectorial.
 * Lee color, fillOpacity y weight desde layersConfig.
 */
export function getLayerOptions(layerName: string): LayerOptions {
    if (cache.has(layerName)) return cache.get(layerName)!;

    const def = VECTOR_LAYERS.find(v => v.id === layerName);

    const pathOpts: L.PathOptions = {
        color:       def?.color       ?? DEFAULT.color,
        weight:      def?.weight      ?? DEFAULT.weight,
        opacity:     1,
        fillOpacity: def?.fillOpacity ?? DEFAULT.fillOpacity,
        fillColor:   def?.color       ?? DEFAULT.fillColor,
    };

    // Usamos 'style' siempre (los puntos también se renderizan como CircleMarker)
    const result: LayerOptions = {
        isPoint: false,
        style: () => pathOpts,
    };

    cache.set(layerName, result);
    return result;
}

/** Invalida la caché de estilos (útil si se cambia la config en caliente) */
export function clearStyleCache() {
    cache.clear();
}
