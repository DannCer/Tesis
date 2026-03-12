/**
 * symbologyUtils.ts
 * Tipos y funciones para la simbología de capas vectoriales importadas.
 */

import type L from 'leaflet';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SymbologyMode = 'single' | 'categorical';

export interface CategoryEntry {
    value: string;
    color: string;
}

export interface SymbologyStyle {
    mode: SymbologyMode;
    // Estilo base (siempre presente)
    fillColor:    string;
    strokeColor:  string;
    fillOpacity:  number;
    strokeWeight: number;
    // Solo para modo categorical
    field?:       string;
    categories?:  CategoryEntry[];
    otherColor?:  string; // color para valores no mapeados
}

export type GeomType = 'point' | 'line' | 'polygon' | 'mixed';

// ─── Paleta automática para categorías ───────────────────────────────────────

export const CATEGORICAL_PALETTE = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
    '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8d6e63',
    '#607d8b', '#ff5722', '#795548', '#009688', '#673ab7',
];

export const DEFAULT_SYMBOLOGY: SymbologyStyle = {
    mode:         'single',
    fillColor:    '#e67e22',
    strokeColor:  '#c0392b',
    fillOpacity:  0.6,
    strokeWeight: 2,
};

// ─── Detección de tipo de geometría ──────────────────────────────────────────

export function detectGeomType(features: GeoJSON.Feature[]): GeomType {
    const types = new Set<string>();
    features.forEach(f => {
        const t = f.geometry?.type ?? '';
        if (t.includes('Point'))   types.add('point');
        if (t.includes('Line'))    types.add('line');
        if (t.includes('Polygon')) types.add('polygon');
    });
    if (types.size > 1) return 'mixed';
    return (types.values().next().value ?? 'mixed') as GeomType;
}

// ─── Extracción de campos y valores únicos ────────────────────────────────────

export function extractFields(features: GeoJSON.Feature[]): string[] {
    const keys = new Set<string>();
    features.slice(0, 50).forEach(f => {
        if (f.properties) Object.keys(f.properties).forEach(k => keys.add(k));
    });
    return Array.from(keys);
}

export function extractUniqueValues(features: GeoJSON.Feature[], field: string): string[] {
    const vals = new Set<string>();
    features.forEach(f => {
        const v = f.properties?.[field];
        if (v !== null && v !== undefined) vals.add(String(v));
    });
    return Array.from(vals).slice(0, 15); // máx 15 categorías
}

// ─── Auto-generar categorías a partir de un campo ────────────────────────────

export function autoCategorize(features: GeoJSON.Feature[], field: string): CategoryEntry[] {
    const vals = extractUniqueValues(features, field);
    return vals.map((v, i) => ({
        value: v,
        color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
    }));
}

// ─── Función de estilo Leaflet ────────────────────────────────────────────────

export function featureStyle(
    feature: GeoJSON.Feature | undefined,
    symbology: SymbologyStyle
): L.PathOptions {
    const base: L.PathOptions = {
        color:       symbology.strokeColor,
        weight:      symbology.strokeWeight,
        fillOpacity: symbology.fillOpacity,
        fillColor:   symbology.fillColor,
    };

    if (symbology.mode === 'single' || !symbology.field || !symbology.categories?.length) {
        return base;
    }

    // Modo categorical
    const val     = String(feature?.properties?.[symbology.field] ?? '');
    const cat     = symbology.categories.find(c => c.value === val);
    const fill    = cat?.color ?? symbology.otherColor ?? '#aaa';
    return { ...base, fillColor: fill, color: fill };
}
