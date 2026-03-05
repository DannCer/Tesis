/**
 * @fileoverview Configuración de capas del mapa.
 *
 * Las capas VECTORIALES se derivan automáticamente de legendData.
 * Para agregar una capa vectorial, solo edita utils/legendData.ts.
 *
 * Las capas RÁSTER se definen aquí directamente (tienen timeValue, wmsLayer, etc.)
 */

import { legendData } from '../utils/legendData';

// ============================================================================
// TIPOS
// ============================================================================

export interface LayerConfig {
    id: string;
    name: string;
    description: string;
    color: string;
    type: 'vector' | 'raster';
    group?: string;
    wmsLayer?: string;
    year?: number;
    timeValue?: string;
    showLegend?: boolean;
    fillOpacity?: number;
    weight?: number;
    bounds?: [number, number][];
}

export const VECTOR_STYLE_DEFAULTS = {
    weight: 2,
    opacity: 1,
    fillOpacity: 0.15,
};

// ============================================================================
// CAPAS VECTORIALES — derivadas de legendData automáticamente
// ============================================================================

/**
 * Genera LayerConfig[] a partir de todas las entradas de legendData.
 * Nunca hay que tocar esta función — solo editar legendData.ts.
 */
const buildVectorLayers = (): LayerConfig[] =>
    Object.entries(legendData).map(([id, legend]) => ({
        id,
        name:        legend.title,
        description: legend.description ?? legend.title,
        color:       legend.color ?? '#8d1c3d',
        type:        'vector' as const,
        group:       legend.group,
        showLegend:  true,
        weight:      legend.weight  ?? VECTOR_STYLE_DEFAULTS.weight,
        fillOpacity: legend.fillOpacity ?? VECTOR_STYLE_DEFAULTS.fillOpacity,
    }));

// ============================================================================
// CAPAS RÁSTER — derivadas del DBF usv_mosaico (7 series temporales)
// Campo 'time' del DBF → timeValue en formato YYYY-MM-DD
// ============================================================================

const RASTER_LAYERS: LayerConfig[] = [
    {
        id: 'usvserie1',
        name: 'USV Serie I',
        description: 'Uso de Suelo y Vegetación 1985',
        color: '#2E8B57',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 1985,
        timeValue: '1985-01-01',
        showLegend: true,
    },
    {
        id: 'usvserie2',
        name: 'USV Serie II',
        description: 'Uso de Suelo y Vegetación 1993',
        color: '#4682B4',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 1993,
        timeValue: '1993-01-01',
        showLegend: true,
    },
    {
        id: 'usvserie3',
        name: 'USV Serie III',
        description: 'Uso de Suelo y Vegetación 2002',
        color: '#D4A017',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 2002,
        timeValue: '2002-01-01',
        showLegend: true,
    },
    {
        id: 'usvserie4',
        name: 'USV Serie IV',
        description: 'Uso de Suelo y Vegetación 2007',
        color: '#C1440E',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 2007,
        timeValue: '2007-01-01',
        showLegend: true,
    },
    {
        id: 'usvserie5',
        name: 'USV Serie V',
        description: 'Uso de Suelo y Vegetación 2011',
        color: '#7B2D8B',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 2011,
        timeValue: '2011-01-01',
        showLegend: true,
    },
    {
        id: 'usvserie6',
        name: 'USV Serie VI',
        description: 'Uso de Suelo y Vegetación 2014',
        color: '#1A6B8A',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 2014,
        timeValue: '2014-01-01',
        showLegend: true,
    },
    {
        id: 'usvserie7',
        name: 'USV Serie VII',
        description: 'Uso de Suelo y Vegetación 2018',
        color: '#FF69B4',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 2018,
        timeValue: '2018-01-01',
        showLegend: true,
    },
];

// ============================================================================
// LISTA COMPLETA — vectoriales primero, ráster al final
// ============================================================================

export const AVAILABLE_LAYERS: LayerConfig[] = [
    ...buildVectorLayers(),
    ...RASTER_LAYERS,
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

/** Devuelve solo capas vectoriales */
export const getVectorLayers = (): LayerConfig[] =>
    AVAILABLE_LAYERS.filter(l => l.type === 'vector');

/** Devuelve solo capas ráster */
export const getRasterLayers = (): LayerConfig[] =>
    AVAILABLE_LAYERS.filter(l => l.type === 'raster');

/** Devuelve los grupos únicos de capas vectoriales en orden de aparición */
export const getVectorGroups = (): string[] => {
    const seen = new Set<string>();
    const groups: string[] = [];
    for (const layer of getVectorLayers()) {
        const g = layer.group ?? 'Capas Vectoriales';
        if (!seen.has(g)) { seen.add(g); groups.push(g); }
    }
    return groups;
};
