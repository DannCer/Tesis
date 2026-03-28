/**
 * symbologyUtils.ts
 * Tipos y funciones para la simbología de capas vectoriales importadas.
 */

import type L from 'leaflet';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SymbologyMode = 'single' | 'categorical' | 'classified';

export interface CategoryEntry {
    value: string;
    color: string;
}

export interface ClassifiedEntry {
    min:   number;
    max:   number;
    color: string;
    label: string;
}

export interface SymbologyStyle {
    mode:         SymbologyMode;
    // Estilo base (siempre presente)
    fillColor:    string;
    strokeColor:  string;
    fillOpacity:  number;
    strokeWeight: number;
    // Modo categorical
    field?:       string;
    categories?:  CategoryEntry[];
    otherColor?:  string;
    // Modo classified
    expression?:  string;
    numClasses?:  number;
    classes?:     ClassifiedEntry[];
    colorRamp?:   string;
    classMethod?: 'equal' | 'quantile';
}

export type GeomType = 'point' | 'line' | 'polygon' | 'mixed';

// ─── Estilo por defecto ───────────────────────────────────────────────────────

export const DEFAULT_SYMBOLOGY: SymbologyStyle = {
    mode:         'single',
    fillColor:    '#e67e22',
    strokeColor:  '#c0392b',
    fillOpacity:  0.6,
    strokeWeight: 2,
};

// ─── Rampas de color ─────────────────────────────────────────────────────────

// Stops internos como [R, G, B] para interpolación precisa
const RAMP_STOPS: Record<string, [number, number, number][]> = {
    'Azules':    [[222, 235, 247], [8,   81,  156]],
    'Verdes':    [[229, 245, 224], [0,   109, 44 ]],
    'Rojos':     [[254, 229, 217], [165, 15,  21 ]],
    'Naranjas':  [[254, 237, 222], [179, 54,  14 ]],
    'Púrpuras':  [[242, 240, 247], [84,  39,  143]],
    'Grises':    [[247, 247, 247], [37,  37,  37 ]],
    'Calor':     [[255, 255, 204], [253, 141, 60], [128, 0, 38 ]],
    'RdYlGn':    [[215, 48,  39 ], [255, 255, 191], [26, 152, 80]],
    'RdBu':      [[202, 0,   32 ], [247, 247, 247], [5,  113, 176]],
    'Espectral': [[213, 62,  79 ], [255, 255, 191], [50, 136, 189]],
};

export const RAMP_NAMES = Object.keys(RAMP_STOPS);

function lerpRGB(
    a: [number, number, number],
    b: [number, number, number],
    t: number
): [number, number, number] {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

/** Devuelve un color hex en la rampa dado t ∈ [0, 1] */
export function getColorInRamp(rampName: string, t: number): string {
    const stops = RAMP_STOPS[rampName] ?? RAMP_STOPS['Azules'];
    const scaled = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.min(Math.floor(scaled), stops.length - 2);
    return rgbToHex(lerpRGB(stops[i], stops[i + 1], scaled - i));
}

/** CSS linear-gradient para previsualizar la rampa */
export function getRampGradientCSS(rampName: string): string {
    const stops = RAMP_STOPS[rampName] ?? RAMP_STOPS['Azules'];
    return `linear-gradient(to right, ${stops.map(([r, g, b]) => `rgb(${r},${g},${b})`).join(', ')})`;
}

// ─── Generador de colores categóricos (ángulo dorado) ────────────────────────

function hslToHex(h: number, s: number, l: number): string {
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Genera N colores hex perceptualmente distintos usando el ángulo dorado (137.5°).
 * Funciona para cualquier cantidad de categorías sin límite.
 */
function generateDistinctColors(count: number): string[] {
    const GOLDEN_ANGLE = 137.508;
    return Array.from({ length: count }, (_, i) => {
        const hue   = Math.round((i * GOLDEN_ANGLE) % 360);
        const sat   = (65 + (i % 3) * 10) / 100;   // 0.65, 0.75, 0.85
        const light = (45 + (i % 5) * 7)  / 100;   // 0.45 … 0.73
        return hslToHex(hue, sat, light);
    });
}

// ─── Evaluador de expresiones (seguro) ───────────────────────────────────────

/**
 * Evalúa una expresión SQL simple sobre las propiedades de un feature.
 * Soporta nombres de campo y operadores aritméticos básicos (+, -, *, /).
 * Rechaza cualquier expresión que contenga caracteres no matemáticos.
 */
export function evaluateExpression(
    expression: string,
    properties: Record<string, any>
): number | null {
    try {
        let expr = expression.trim();
        if (!expr) return null;

        // Reemplazar nombres de campo por sus valores numéricos (los más largos primero)
        const fields = Object.keys(properties).sort((a, b) => b.length - a.length);
        for (const field of fields) {
            const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const val = Number(properties[field]);
            expr = expr.replace(new RegExp(`\\b${escaped}\\b`, 'g'), isNaN(val) ? '0' : String(val));
        }

        // Whitelist: solo dígitos, operadores aritméticos, paréntesis, puntos, notación e
        if (!/^[\d\s+\-*/().,eE]+$/.test(expr)) return null;

        // Normalizar coma decimal a punto
        expr = expr.replace(/,/g, '.');

        // eslint-disable-next-line no-new-func
        const result = new Function(`"use strict"; return (${expr})`)() as unknown;
        return typeof result === 'number' && isFinite(result) ? result : null;
    } catch {
        return null;
    }
}

// ─── Clasificación ───────────────────────────────────────────────────────────

function formatNumber(n: number): string {
    if (!isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 }) + 'M';
    if (abs >= 1_000)     return n.toLocaleString('es-MX', { maximumFractionDigits: 0 });
    if (Number.isInteger(n)) return n.toString();
    return n.toLocaleString('es-MX', { maximumFractionDigits: 2 });
}

/**
 * Clasifica los features en N clases por una expresión SQL simple.
 * Devuelve null si la expresión no produce valores numéricos.
 */
export function classifyFeatures(
    features: GeoJSON.Feature[],
    expression: string,
    numClasses: number,
    method: 'equal' | 'quantile',
    rampName: string
): ClassifiedEntry[] | null {
    const values = features
        .map(f => evaluateExpression(expression, f.properties ?? {}))
        .filter((v): v is number => v !== null);

    if (values.length === 0) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);

    // Caso especial: todos los valores son iguales
    if (min === max) {
        return [{ min, max, color: getColorInRamp(rampName, 0.5), label: formatNumber(min) }];
    }

    const n = Math.max(2, Math.min(numClasses, values.length));
    let breaks: number[];

    if (method === 'equal') {
        const step = (max - min) / n;
        breaks = Array.from({ length: n + 1 }, (_, i) => min + i * step);
    } else {
        // Cuantiles: divide los valores ordenados en grupos de igual frecuencia
        const sorted = [...values].sort((a, b) => a - b);
        breaks = Array.from({ length: n + 1 }, (_, i) => {
            const idx = Math.round((i / n) * (sorted.length - 1));
            return sorted[idx];
        });
    }

    breaks[0] = min;
    breaks[n] = max;

    return Array.from({ length: n }, (_, i) => {
        const t = n === 1 ? 0.5 : i / (n - 1);
        return {
            min:   breaks[i],
            max:   breaks[i + 1],
            color: getColorInRamp(rampName, t),
            label: `${formatNumber(breaks[i])} – ${formatNumber(breaks[i + 1])}`,
        };
    });
}

// ─── Detección de tipo de geometría ──────────────────────────────────────────

export function detectGeomType(features: GeoJSON.Feature[]): GeomType {
    const types = new Set<string>();
    for (const f of features) {
        const t = f.geometry?.type ?? '';
        if (t.includes('Point'))   types.add('point');
        if (t.includes('Line'))    types.add('line');
        if (t.includes('Polygon')) types.add('polygon');
        if (types.size > 1) return 'mixed';
    }
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
    for (const f of features) {
        const v = f.properties?.[field];
        if (v !== null && v !== undefined) vals.add(String(v));
    }
    return Array.from(vals);
}

// ─── Auto-generar categorías ──────────────────────────────────────────────────

export function autoCategorize(features: GeoJSON.Feature[], field: string): CategoryEntry[] {
    const vals   = extractUniqueValues(features, field);
    const colors = generateDistinctColors(vals.length);
    return vals.map((v, i) => ({ value: v, color: colors[i] }));
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

    if (symbology.mode === 'categorical' && symbology.field && symbology.categories?.length) {
        const val  = String(feature?.properties?.[symbology.field] ?? '');
        const cat  = symbology.categories.find(c => c.value === val);
        const fill = cat?.color ?? symbology.otherColor ?? '#aaa';
        return { ...base, fillColor: fill, color: fill };
    }

    if (symbology.mode === 'classified' && symbology.expression && symbology.classes?.length) {
        const val = evaluateExpression(symbology.expression, feature?.properties ?? {});
        if (val !== null) {
            const last = symbology.classes[symbology.classes.length - 1];
            const cls  = symbology.classes.find((c, idx) => {
                const isLast = idx === symbology.classes!.length - 1;
                return val >= c.min && (isLast ? val <= c.max : val < c.max);
            }) ?? last;
            const fill = cls?.color ?? '#aaa';
            return { ...base, fillColor: fill, color: fill };
        }
    }

    return base;
}
