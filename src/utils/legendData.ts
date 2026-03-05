/**
 * @fileoverview Base de datos central de leyendas y estilos vectoriales.
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  FUENTE ÚNICA DE VERDAD PARA CAPAS VECTORIALES              ║
 * ║                                                              ║
 * ║  Para agregar una capa vectorial al sistema:                 ║
 * ║    1. Agrega una entrada aquí en legendData                  ║
 * ║    2. ¡Listo! El menú y la leyenda la incluyen automáticamente ║
 * ║                                                              ║
 * ║  No toques AVAILABLE_LAYERS en layers.ts para vectores.      ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Tipos de leyenda disponibles:
 *   polygon             → Polígono color sólido
 *   point               → Punto color sólido
 *   ranged-polygon      → Polígono por rangos numéricos
 *   ranged-point        → Punto por rangos numéricos
 *   categorical-polygon → Polígono por valor de propiedad
 *   categorical-point   → Punto por valor de propiedad
 *   variant             → Múltiples representaciones (dropdown)
 *
 * @module utils/legendData
 */

// ============================================================================
// PALETA DE COLORES CENTRALIZADA
// ============================================================================

export const COLORS = {
    PRIMARY:        '#8d1c3d',
    PRIMARY_DARK:   '#6b0f2a',
    SECONDARY:      '#BC955B',
    RED:            '#cd171e',
    ORANGE:         '#e69800',
    YELLOW:         '#f5e642',
    GREEN:          '#2E8B57',
    LIGHT_GREEN:    '#74c47a',
    WATER:          '#4682B4',
    DARK_WATER:     '#1a3f6f',
    WHITE:          '#ffffff',
    LIGHT_GRAY:     '#e0e0e0',
    GRAY:           '#888888',
    BLACK:          '#333333',
    TRANSPARENT:    'transparent',
} as const;

// ============================================================================
// TIPOS
// ============================================================================

export interface LegendItem {
    label: string;
    color: string;
    borderColor?: string;
    /** Para ranged: valor máximo del intervalo (Infinity para el último) */
    value?: number;
    /** Tamaño del símbolo punto en px */
    size?: number;
}

export type LegendType =
    | 'polygon'
    | 'point'
    | 'ranged-polygon'
    | 'ranged-point'
    | 'categorical-polygon'
    | 'categorical-point'
    | 'variant';

export interface VariantLegend {
    type: Exclude<LegendType, 'variant'>;
    propertyName?: string;
    items: LegendItem[];
    note?: string;
}

/**
 * Configuración completa de una capa vectorial.
 * Combina simbología (leyenda) con metadatos del menú.
 */
export interface LayerLegend {
    // ── Metadatos del menú ──────────────────────────────────────
    /** Nombre visible en el menú de capas */
    title: string;
    /** Descripción corta bajo el nombre */
    description?: string;
    /** Grupo en el menú (si no se define, va a "Capas Vectoriales") */
    group?: string;
    /** Color representativo (usado en indicador y selección) */
    color?: string;
    /** Peso del borde por defecto */
    weight?: number;
    /** Opacidad de relleno por defecto */
    fillOpacity?: number;

    // ── Simbología ──────────────────────────────────────────────
    type: LegendType;
    propertyName?: string;
    items?: LegendItem[];
    variants?: Record<string, VariantLegend>;
    note?: string;
}

export type LegendDataMap = Record<string, LayerLegend>;

// ============================================================================
// DATOS DE LEYENDA — FUENTE ÚNICA DE VERDAD
// ============================================================================

export const legendData: LegendDataMap = {

    // =========================================================================
    // DIVISIÓN POLÍTICO-ADMINISTRATIVA
    // =========================================================================

    'vw_estados': {
        title: 'Estados',
        description: 'Límites estatales',
        group: 'División político-administrativa',
        color: COLORS.PRIMARY,
        weight: 2,
        fillOpacity: 0.05,
        type: 'polygon',
        items: [
            { color: COLORS.TRANSPARENT, borderColor: COLORS.PRIMARY, label: 'Límite estatal' },
        ],
        note: 'Fuente: INEGI 2024',
    },

    'vw_municipios': {
        title: 'Municipios',
        description: 'Límites municipales',
        group: 'División político-administrativa',
        color: COLORS.SECONDARY,
        weight: 1.5,
        fillOpacity: 0.05,
        type: 'polygon',
        items: [
            { color: COLORS.TRANSPARENT, borderColor: COLORS.SECONDARY, label: 'Límite municipal' },
        ],
        note: 'Fuente: INEGI 2024',
    },

    'vw_localidades': {
        title: 'Localidades',
        description: 'Localidades urbanas y rurales',
        group: 'División político-administrativa',
        color: '#691B31',
        weight: 1,
        fillOpacity: 0.4,
        type: 'point',
        items: [
            { color: COLORS.PRIMARY,   label: 'Urbana' },
            { color: COLORS.SECONDARY, label: 'Rural' },
        ],
        note: 'Fuente: INEGI 2020',
    },

    'vw_censomunicipio': {
        title: 'Población por Municipio',
        description: 'Habitantes por municipio (INEGI 2020)',
        group: 'División político-administrativa',
        color: '#F28F27',
        weight: 1.5,
        fillOpacity: 0.7,
        type: 'ranged-polygon',
        propertyName: 'Población total',
        items: [
            { value: 13000,    color: '#FFDAB5', label: 'Menos de 13,000' },
            { value: 20000,    color: '#FDB871', label: '13,000 – 20,000' },
            { value: 38000,    color: '#F28F27', label: '20,001 – 38,000' },
            { value: Infinity, color: '#D45B07', label: 'Más de 38,001' },
        ],
        note: 'Fuente: INEGI 2020',
    },

    'vw_censolocalidad': {
        title: 'Población por Localidad',
        description: 'Habitantes por localidad (INEGI 2020)',
        group: 'División político-administrativa',
        color: '#F28F27',
        weight: 1.5,
        fillOpacity: 0.7,
        type: 'ranged-point',
        propertyName: 'Población total',
        items: [
            { value: 249,      color: '#FFDAB5', label: 'Menos de 249' },
            { value: 999,      color: '#FDB871', label: '250 - 999' },
            { value: 4999,     color: '#F28F27', label: '1,000 - 4,999' },
            { value: 29999,    color: '#D45B07', label: '5,000 - 29,999' },
            { value: Infinity, color: '#d40707', label: 'Más de 30,000' },
        ],
        note: 'Fuente: INEGI 2020',
    },

    // =========================================================================
    // PLANTILLAS COMENTADAS — descomenta para agregar al menú automáticamente
    // =========================================================================

    /*
    'vw_cuencas': {
        title: 'Cuencas Hidrográficas',
        description: 'Cuencas hidrológicas principales',
        group: 'Recursos hídricos',
        color: COLORS.WATER,
        type: 'polygon',
        items: [{ color: COLORS.WATER, borderColor: COLORS.DARK_WATER, label: 'Cuenca' }],
        note: 'Fuente: CONAGUA 2023',
    },

    'vw_acuiferos': {
        title: 'Acuíferos',
        description: 'Disponibilidad de acuíferos',
        group: 'Recursos hídricos',
        color: COLORS.WATER,
        type: 'categorical-polygon',
        propertyName: 'Situación',
        items: [
            { label: 'Con disponibilidad', color: COLORS.LIGHT_GREEN },
            { label: 'Sin disponibilidad', color: COLORS.RED },
        ],
        note: 'Fuente: CONAGUA 2023',
    },

    'vw_presas': {
        title: 'Presas',
        description: 'Infraestructura de presas',
        group: 'Recursos hídricos',
        color: COLORS.WATER,
        type: 'point',
        items: [{ color: COLORS.WATER, label: 'Presa' }],
        note: 'Fuente: CONAGUA 2023',
    },
    */
};
