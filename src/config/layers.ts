/**
 * @fileoverview Derivación de LayerConfig[] a partir de layersConfig.ts.
 *
 * Este archivo ya no define capas ni simbología.
 * Solo transforma VectorLayerDef / RasterLayerDef en LayerConfig[]
 * para que el resto del sistema funcione sin cambios.
 *
 * Para agregar o editar capas → edita config/layersConfig.ts
 */

import { VECTOR_LAYERS, RASTER_LAYERS } from './layersConfig';

// ============================================================================
// TIPOS
// ============================================================================

export interface LayerConfig {
    id: string;
    name: string;
    description: string;
    type: 'vector' | 'raster';
    group?: string;
    wmsLayer?: string;
    year?: number;
    timeValue?: string;
    showLegend?: boolean;
}

export const VECTOR_STYLE_DEFAULTS = {
    weight:      2,
    opacity:     1,
    fillOpacity: 0.15,
};

// ============================================================================
// CONSTRUCCIÓN DE AVAILABLE_LAYERS
// ============================================================================

const builtVectorLayers: LayerConfig[] = VECTOR_LAYERS.map(v => ({
    id:          v.id,
    name:        v.name,
    description: v.description,
    type:        'vector' as const,
    group:       v.group,
    wmsLayer:    v.wmsLayer ?? v.id,   // nombre WMS igual al id por defecto
    showLegend:  true,
}));

const builtRasterLayers: LayerConfig[] = RASTER_LAYERS.map(r => ({
    id:          r.id,
    name:        r.name,
    description: r.description,
    type:        'raster' as const,
    wmsLayer:    r.wmsLayer,
    year:        r.year,
    timeValue:   r.timeValue,
    showLegend:  true,
}));

export const AVAILABLE_LAYERS: LayerConfig[] = [
    ...builtVectorLayers,
    ...builtRasterLayers,
];

// ============================================================================
// CLASIFICACIONES RÁSTER (PixelInfo)
// ============================================================================

export const LAND_USE_CLASSES: Record<number, { nombre: string; color: string }> = {
    1:  { nombre: 'Otro tipo de vegetación', color: '#fcff47' },
    2:  { nombre: 'Pastizal',                color: '#804f22' },
    3:  { nombre: 'Bosques',                 color: '#15ad18' },
    4:  { nombre: 'Sin vegetación aparente', color: '#000000' },
    5:  { nombre: 'Zona urbana',             color: '#fd1f1f' },
    6:  { nombre: 'Selvas',                  color: '#d13bca' },
    7:  { nombre: 'Matorrales',              color: '#c2a577' },
    8:  { nombre: 'Vegetación secundaria',   color: '#74dd2f' },
    9:  { nombre: 'Cuerpo de agua',          color: '#474ed4' },
    10: { nombre: 'Áreas agrícolas',         color: '#f97326' },
};

// ============================================================================
// HELPERS
// ============================================================================

export const getLayerConfig = (id: string): LayerConfig | undefined =>
    AVAILABLE_LAYERS.find(l => l.id === id);

export const getVectorLayers = (): LayerConfig[] =>
    AVAILABLE_LAYERS.filter(l => l.type === 'vector');

export const getRasterLayers = (): LayerConfig[] =>
    AVAILABLE_LAYERS.filter(l => l.type === 'raster');

export const getVectorGroups = (): string[] => {
    const seen = new Set<string>();
    const groups: string[] = [];
    for (const layer of getVectorLayers()) {
        const g = layer.group ?? 'Capas Vectoriales';
        if (!seen.has(g)) { seen.add(g); groups.push(g); }
    }
    return groups;
};
