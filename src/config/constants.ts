/**
 * @fileoverview Constantes globales de la aplicación.
 * Valores fijos que no dependen del entorno.
 * @module config/constants
 */

// ============================================================================
// MAPA
// ============================================================================

export const MAP_DEFAULT_CENTER: [number, number] = [20.12, -99.19];
export const MAP_DEFAULT_ZOOM   = 9;
export const MAP_MIN_ZOOM       = 6;
export const MAP_MAX_ZOOM       = 19;

// ============================================================================
// WFS / CAPAS
// ============================================================================

// Valor leído en tiempo de ejecución desde MAX_FEATURES en el .env (via config.qgisServer.maxFeatures).
// No definir un número fijo aquí; usar config directamente en cada servicio.
export const WFS_DEFAULT_SRS          = 'EPSG:4326';
export const WFS_DEFAULT_OUTPUT_FMT   = 'application/json';
export const WFS_DEFAULT_TIMEOUT_MS   = 30_000;

export const LAYER_DEFAULT_OPACITY    = 0.8;
export const LAYER_DEFAULT_WEIGHT     = 2;
export const LAYER_DEFAULT_FILL_OP    = 0.15;

// ============================================================================
// UI / TABLA DE ATRIBUTOS
// ============================================================================

export const TABLE_ROWS_PER_PAGE      = 300;
export const SEARCH_DEBOUNCE_MS       = 180;

// ============================================================================
// BREAKPOINTS (mismos que responsive-utilities.css)
// ============================================================================

export const BREAKPOINTS = {
    xs: 0,
    sm: 576,
    md: 768,
    lg: 992,
    xl: 1200,
    hd: 1920,
    '2k': 2560,
    '4k': 3840,
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

// ============================================================================
// LAND USE CLASSES (USV)
// ============================================================================

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