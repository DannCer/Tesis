/**
 * symbologyUtils.ts
 * Tipos y funciones para la simbología de capas vectoriales importadas.
 */

import type L from 'leaflet';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SymbologyMode = 'single' | 'categorical' | 'classified' | 'expression';

export interface CategoryEntry {
    value: string;
    color: string;
    count?: number;
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

// ─── Evaluador SQL WHERE ──────────────────────────────────────────────────────

type SQLToken =
    | { type: 'ident';  val: string  }
    | { type: 'string'; val: string  }
    | { type: 'number'; val: number  }
    | { type: 'op';     val: string  }
    | { type: 'kw';     val: string  }
    | { type: 'lparen' | 'rparen' | 'comma' };

const SQL_KEYWORDS = new Set([
    'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE',
    'IS', 'NULL', 'TRUE', 'FALSE',
]);

function tokenizeSQL(expr: string): SQLToken[] {
    const tokens: SQLToken[] = [];
    let i = 0;
    while (i < expr.length) {
        // Espacios
        if (/\s/.test(expr[i])) { i++; continue; }

        // Literal de cadena
        if (expr[i] === "'" || expr[i] === '"') {
            const q = expr[i++];
            let s = '';
            while (i < expr.length && expr[i] !== q) {
                if (expr[i] === '\\') i++;
                s += expr[i++];
            }
            i++;
            tokens.push({ type: 'string', val: s });
            continue;
        }

        // Número
        if (/\d/.test(expr[i]) || (expr[i] === '-' && /\d/.test(expr[i + 1] ?? ''))) {
            let s = '';
            if (expr[i] === '-') s += expr[i++];
            while (i < expr.length && /[\d.]/.test(expr[i])) s += expr[i++];
            tokens.push({ type: 'number', val: parseFloat(s) });
            continue;
        }

        // Operadores de dos caracteres
        const two = expr.slice(i, i + 2);
        if (['<>', '!=', '>=', '<='].includes(two)) {
            tokens.push({ type: 'op', val: two === '<>' ? '!=' : two });
            i += 2; continue;
        }

        // Operadores de un carácter
        if ('=<>'.includes(expr[i])) {
            tokens.push({ type: 'op', val: expr[i] });
            i++; continue;
        }

        // Paréntesis y coma
        if (expr[i] === '(') { tokens.push({ type: 'lparen' }); i++; continue; }
        if (expr[i] === ')') { tokens.push({ type: 'rparen' }); i++; continue; }
        if (expr[i] === ',') { tokens.push({ type: 'comma'  }); i++; continue; }

        // Identificador o palabra clave
        if (/[a-zA-Z_]/.test(expr[i])) {
            let s = '';
            while (i < expr.length && /[\w]/.test(expr[i])) s += expr[i++];
            const upper = s.toUpperCase();
            tokens.push(SQL_KEYWORDS.has(upper)
                ? { type: 'kw',    val: upper }
                : { type: 'ident', val: s });
            continue;
        }

        i++; // carácter desconocido — saltar
    }
    return tokens;
}

class SQLParser {
    private pos = 0;
    constructor(private readonly tokens: SQLToken[], private readonly props: Record<string, unknown>) {}

    private peek()   { return this.tokens[this.pos]; }
    private consume() { return this.tokens[this.pos++]; }

    private match(type: string, val?: string): boolean {
        const t = this.peek();
        if (!t || t.type !== type) return false;
        if (val !== undefined && (t as { val?: string }).val !== val) return false;
        return true;
    }

    private expect(type: string, val?: string): SQLToken {
        if (!this.match(type, val)) throw new Error(`Se esperaba ${type} ${val ?? ''}`);
        return this.consume();
    }

    /** OR */
    parseOr(): boolean {
        let left = this.parseAnd();
        while (this.match('kw', 'OR')) {
            this.consume();
            const right = this.parseAnd();
            left = left || right;
        }
        return left;
    }

    /** AND */
    private parseAnd(): boolean {
        let left = this.parseNot();
        while (this.match('kw', 'AND')) {
            this.consume();
            const right = this.parseNot();
            left = left && right;
        }
        return left;
    }

    /** NOT */
    private parseNot(): boolean {
        if (this.match('kw', 'NOT')) { this.consume(); return !this.parsePrimary(); }
        return this.parsePrimary();
    }

    /** Expresión primaria */
    private parsePrimary(): boolean {
        // Agrupación
        if (this.match('lparen')) {
            this.consume();
            const val = this.parseOr();
            this.expect('rparen');
            return val;
        }
        if (this.match('kw', 'TRUE'))  { this.consume(); return true;  }
        if (this.match('kw', 'FALSE')) { this.consume(); return false; }

        const left = this.parseScalar();

        // IS NULL / IS NOT NULL
        if (this.match('kw', 'IS')) {
            this.consume();
            const neg = this.match('kw', 'NOT') ? (this.consume(), true) : false;
            this.expect('kw', 'NULL');
            const isNull = left === null || left === undefined || left === '';
            return neg ? !isNull : isNull;
        }

        // IN (...)
        if (this.match('kw', 'IN')) {
            this.consume();
            this.expect('lparen');
            const values: unknown[] = [];
            while (!this.match('rparen')) {
                values.push(this.parseScalar());
                if (this.match('comma')) this.consume();
            }
            this.expect('rparen');
            return values.some(v => String(v).toLowerCase() === String(left ?? '').toLowerCase());
        }

        // BETWEEN lo AND hi
        if (this.match('kw', 'BETWEEN')) {
            this.consume();
            const lo = this.parseScalar();
            this.expect('kw', 'AND');
            const hi = this.parseScalar();
            return Number(left) >= Number(lo) && Number(left) <= Number(hi);
        }

        // LIKE
        if (this.match('kw', 'LIKE')) {
            this.consume();
            const pattern = this.parseScalar();
            return this.evalLike(String(left ?? ''), String(pattern ?? ''));
        }

        // Comparadores
        if (this.match('op')) {
            const op = (this.consume() as { val: string }).val;
            const right = this.parseScalar();
            return this.compare(left, op, right);
        }

        return Boolean(left);
    }

    /** Valor escalar: campo, literal de cadena, número o NULL */
    private parseScalar(): unknown {
        const t = this.peek();
        if (!t) return null;
        if (t.type === 'number') { this.consume(); return (t as { val: number }).val; }
        if (t.type === 'string') { this.consume(); return (t as { val: string }).val; }
        if (t.type === 'kw' && (t as { val: string }).val === 'NULL')  { this.consume(); return null; }
        if (t.type === 'kw' && (t as { val: string }).val === 'TRUE')  { this.consume(); return true; }
        if (t.type === 'kw' && (t as { val: string }).val === 'FALSE') { this.consume(); return false; }
        if (t.type === 'ident') {
            this.consume();
            const v = this.props[(t as { val: string }).val];
            return v !== undefined ? v : null;
        }
        return null;
    }

    private compare(left: unknown, op: string, right: unknown): boolean {
        const ln = Number(left);
        const rn = Number(right);
        if (!isNaN(ln) && !isNaN(rn)) {
            if (op === '=')  return ln === rn;
            if (op === '!=') return ln !== rn;
            if (op === '>')  return ln >   rn;
            if (op === '<')  return ln <   rn;
            if (op === '>=') return ln >=  rn;
            if (op === '<=') return ln <=  rn;
        }
        const ls = String(left  ?? '').toLowerCase();
        const rs = String(right ?? '').toLowerCase();
        if (op === '=')  return ls === rs;
        if (op === '!=') return ls !== rs;
        if (op === '>')  return ls >   rs;
        if (op === '<')  return ls <   rs;
        if (op === '>=') return ls >=  rs;
        if (op === '<=') return ls <=  rs;
        return false;
    }

    private evalLike(value: string, pattern: string): boolean {
        const regex = '^' +
            pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                   .replace(/%/g, '.*')
                   .replace(/_/g, '.') +
            '$';
        return new RegExp(regex, 'i').test(value);
    }
}

/**
 * Evalúa una cláusula WHERE de SQL sobre las propiedades de un feature.
 *
 * Soporta: =, <>, !=, >, <, >=, <=, AND, OR, NOT, IN, BETWEEN, LIKE,
 * IS NULL, IS NOT NULL, literales de cadena y numéricos, paréntesis.
 *
 * @example
 *   evaluateSQLWhere("tipo = 'residencial' AND area > 100", feature.properties)
 *   evaluateSQLWhere("nombre LIKE '%norte%'", feature.properties)
 *   evaluateSQLWhere("clase IN ('A','B') AND valor BETWEEN 1 AND 10", props)
 *
 * @returns true | false según si el feature cumple la condición,
 *          o null si la expresión está vacía o es inválida.
 */
export function evaluateSQLWhere(
    expression: string,
    properties: Record<string, unknown>
): boolean | null {
    try {
        const tokens = tokenizeSQL(expression.trim());
        if (tokens.length === 0) return null;
        const parser = new SQLParser(tokens, properties);
        return parser.parseOr();
    } catch {
        return null;
    }
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
    const values: number[] = [];
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;

    for (const feature of features) {
        const value = evaluateExpression(expression, feature.properties ?? {});
        if (value === null) continue;
        values.push(value);
        if (value < min) min = value;
        if (value > max) max = value;
    }

    if (values.length === 0 || !isFinite(min) || !isFinite(max)) return null;

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
    return vals.map((v, i) => ({
        value: v,
        color: colors[i],
        count: features.filter(f => String(f.properties?.[field] ?? '') === v).length,
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

    if (symbology.mode === 'expression' && symbology.expression?.trim()) {
        const trueColor  = symbology.fillColor  || '#2ecc71';
        const falseColor = symbology.otherColor  || '#e74c3c';
        const matches = evaluateSQLWhere(
            symbology.expression,
            (feature?.properties ?? {}) as Record<string, unknown>
        );
        if (matches !== null) {
            const fill = matches ? trueColor : falseColor;
            return { ...base, fillColor: fill, color: fill };
        }
    }

    return base;
}