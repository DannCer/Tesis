/**
 * @fileoverview Constantes globales de la aplicación.
 * Valores fijos que NO dependen del entorno (.env).
 * Todo número mágico que aparece en más de un lugar debe vivir aquí.
 * @module config/constants
 */

// ============================================================================
// MAPA
// ============================================================================

export const MAP_DEFAULT_CENTER: [number, number] = [19.4326, -99.1332]; // CDMX
export const MAP_DEFAULT_ZOOM   = 11;
export const MAP_MIN_ZOOM       = 8;
export const MAP_MAX_ZOOM       = 19;

// ─── Bounds de descarga WMS (cobertura México completo) ───────────────────────
// Usados en getRasterDownloadUrl para el parámetro BBOX de GetMap.
// Formato: minLat, minLng, maxLat, maxLng (EPSG:4326)
export const MEXICO_BBOX_WMS = '14.532,-118.454,32.718,-86.710' as const;

// ─── Límites del visor (CDMX) ─────────────────────────────────────────────────
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
    [19.75, -98.75],  // Noreste CDMX
    [19.05, -99.55],  // Suroeste CDMX
];

// ============================================================================
// WFS / CAPAS
// ============================================================================

// Valor leído en tiempo de ejecución desde VITE_MAX_FEATURES (via config.qgisServer.maxFeatures).
// No definir un número fijo aquí; usar config directamente en cada servicio.
export const WFS_DEFAULT_SRS          = 'EPSG:4326' as const;
export const WFS_DEFAULT_OUTPUT_FMT   = 'application/json' as const;
export const WFS_DEFAULT_TIMEOUT_MS   = 30_000;

export const LAYER_DEFAULT_OPACITY    = 0.8;
export const LAYER_DEFAULT_WEIGHT     = 2;
export const LAYER_DEFAULT_FILL_OP    = 0.15;

// ============================================================================
// TIMEOUTS DE UI (ms)
// ============================================================================

/** Tiempo que se muestra el feedback "Copiado" en botones de copia. */
export const COPY_FEEDBACK_MS     = 2_000;

/** Timeout para fetch de capabilities WMS/WFS en el menú de capas. */
export const CAPABILITIES_TIMEOUT_MS = 6_000;

/** Timeout de animación del controlador de tiempo (reproducción automática). */
export const TIME_CONTROLLER_INTERVAL_MS = 1_200;

/** Timeout de abort para subir archivos grandes (GruposManager). */
export const UPLOAD_TIMEOUT_MS    = 120_000;

/** Timeout de abort para operaciones CRUD de capas (CapasManager). */
export const CRUD_TIMEOUT_MS      = 15_000;

/** Retardo del fallback de clipping en SwipeControl (espera re-render Leaflet). */
export const SWIPE_CLIP_RETRY_MS  = 200;

/** Debounce del preview en PrintDesigner. */
export const PRINT_PREVIEW_DEBOUNCE_MS = 340;

// ============================================================================
// UI / TABLA DE ATRIBUTOS
// ============================================================================

export const TABLE_ROWS_PER_PAGE  = 300;
export const SEARCH_DEBOUNCE_MS   = 180;

// ============================================================================
// PERFIL DE ELEVACIÓN
// ============================================================================

/** Número máximo de puntos a muestrear en el perfil de elevación. */
export const ELEVATION_MAX_POINTS = 200;

/**
 * URL del servicio de tiles de elevación Terrain Tiles (AWS / Mapzen).
 * Codificación Terrarium: elevation = (R×256 + G + B/256) − 32768
 */
export const ELEVATION_TILES_URL =
    'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png' as const;

// ============================================================================
// CAPAS BASE DE MAPA (tile servers públicos)
// ============================================================================

export const BASE_LAYER_URLS = {
    osm:       'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    esriSat:   'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    esriStreet:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    topo:      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
} as const;

export const BASE_LAYER_ATTRIBUTIONS = {
    osm:       '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>',
    esri:      '&copy; <a href="https://www.esri.com/">ESRI</a>',
    topo:      '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a>',
} as const;

// ============================================================================
// Z-INDEX (Leaflet panes y overlays de la app)
// ============================================================================

/**
 * Z-indexes de los panes internos de Leaflet y overlays de la aplicación.
 * Referencia Leaflet: tilePane=200, shadowPane=500, overlayPane=400, popupPane=700
 */
export const Z_INDEX = {
    swipeLeft:    450,
    swipeRight:   451,
    vectorBase:   400,   // z-index de la primera capa vectorial (+ índice)
    rasterBase:   500,   // z-index de la primera serie ráster (+ índice)
    externalWms:  600,
    printFab:     9999,
    printModal:   10000,
    legend:       1000,
    layerMenu:    99999,
} as const;

// ============================================================================
// BREAKPOINTS (mismos que responsive-utilities.css)
// ============================================================================

export const BREAKPOINTS = {
    xs:  0,
    sm:  576,
    md:  768,
    lg:  992,
    xl:  1200,
    hd:  1920,
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