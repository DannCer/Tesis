/**
 * @fileoverview Derivación de LayerConfig[] — QGIS Server.
 * Ráster y vectorial comparten el mismo sistema de grupos.
 */

import { VECTOR_LAYERS, RASTER_LAYERS } from './layersConfig';

export interface LayerConfig {
    id:          string;
    name:        string;
    description: string;
    type:        'vector' | 'raster';
    group:       string;
    wfsName?:    string;
    wmsLayer?:   string;
    year?:       number;
    timeValue?:  string;
    showLegend?: boolean;
    color?:      string;
    bounds?:     any;
    legendRamp?: {
        colors: string[];
        minLabel?: string;
        maxLabel?: string;
    };
}

export const VECTOR_STYLE_DEFAULTS = { weight: 2, opacity: 1, fillOpacity: 0.15 };

const builtVectorLayers: LayerConfig[] = VECTOR_LAYERS.map(v => ({
    id:          v.id,
    name:        v.name,
    description: v.description,
    type:        'vector' as const,
    group:       v.group,
    wfsName:     v.wfsName  ?? v.id,
    wmsLayer:    v.wmsLayer ?? v.wfsName ?? v.id,
    showLegend:  true,
}));

const builtRasterLayers: LayerConfig[] = RASTER_LAYERS.map(r => ({
    id:          r.id,
    name:        r.name,
    description: r.description,
    type:        'raster' as const,
    group:       r.group,
    wmsLayer:    r.wmsLayer,
    year:        r.year,
    timeValue:   r.timeValue,
    legendRamp:  r.legendRamp,
    showLegend:  true,
}));

export const AVAILABLE_LAYERS: LayerConfig[] = [
    ...builtVectorLayers,
    ...builtRasterLayers,
];

export const getLayerConfig = (id: string) => AVAILABLE_LAYERS.find(l => l.id === id);

export const LAND_USE_CLASSES: Record<number, { nombre: string; color: string }> = {
    1:  { nombre: 'Otro tipo de vegetación',    color: '#fcff47' },
    2:  { nombre: 'Pastizal',                   color: '#804f22' },
    3:  { nombre: 'Bosques',                    color: '#15ad18' },
    4:  { nombre: 'Sin vegetación aparente',    color: '#000000' },
    5:  { nombre: 'Zona urbana',                color: '#fd1f1f' },
    6:  { nombre: 'Selvas',                     color: '#d13bca' },
    7:  { nombre: 'Matorrales',                 color: '#c2a577' },
    8:  { nombre: 'Vegetación secundaria',      color: '#74dd2f' },
    9:  { nombre: 'Cuerpo de agua',             color: '#474ed4' },
    10: { nombre: 'Áreas agrícolas',            color: '#f97326' },
};
