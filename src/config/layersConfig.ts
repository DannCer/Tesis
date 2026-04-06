/**
 * @fileoverview Configuración centralizada de capas — QGIS Server
 *
 * ============================================================================
 * GUÍA RÁPIDA: CÓMO AGREGAR NUEVAS CAPAS
 * ============================================================================
 *
 * 1. CAPAS VECTORIALES (WFS):
 *    - Agregar un objeto al array VECTOR_LAYERS
 *    - wfsName: Debe coincidir EXACTAMENTE con el <Name> del WFS GetCapabilities
 *               Usar guiones bajos, sin acentos (ej: 'Zonificacion_geotecnica_2017')
 *    - wmsLayer: Nombre exacto del WMS (puede tener espacios/acentos)
 *    - group: Categoría en el menú (usar emojis para mejor UX)
 *
 * 2. CAPAS RÁSTER (WMS):
 *    - Agregar un objeto al array RASTER_LAYERS
 *    - wmsLayer: Nombre exacto de la capa en QGIS Server
 *    - year: Año de la serie temporal (para badge en UI)
 *    - timeValue: Valor TIME para consultas WMS (formato YYYY-MM-DD)
 *    - group: Misma categoría que vectoriales para menú unificado
 *
 * 3. VERIFICAR NOMENCLATURA:
 *    - WFS GetCapabilities: http://localhost/qgis/...?SERVICE=WFS&REQUEST=GetCapabilities&MAP=...
 *    - WMS GetCapabilities: http://localhost/qgis/...?SERVICE=WMS&REQUEST=GetCapabilities&MAP=...
 *    - Copiar los nombres EXACTOS como aparecen en los XML
 *
 * 4. EJEMPLO COMPLETO:
 *    {
 *        id:          'mi_capa_vectorial',
 *        name:        'Mi Capa Vectorial',
 *        description: 'Descripción visible en el menú',
 *        group:       'Geológicos',  // o 'Geológicos', '🏔️ Susceptibilidad', etc.
 *        wfsName:     'mi_capa_vectorial',  // Exacto del WFS
 *        wmsLayer:    'Mi Capa Vectorial',  // Exacto del WMS
 *    }
 * ============================================================================
 */

/**
 * Definición de capa vectorial WFS
 */
export interface VectorLayerDef {
    /** ID único interno (sin espacios, snake_case recomendado) */
    id: string;
    /** Nombre visible en el menú de capas */
    name: string;
    /** Descripción corta visible debajo del nombre */
    description: string;
    /** Grupo/categoría en el menú (usar emojis para mejor UX) */
    group: string;
    /**
     * TypeName EXACTO del WFS GetCapabilities
     * - Usar guiones bajos (_) en lugar de espacios
     * - Sin acentos ni caracteres especiales
     * - Ejemplo: 'Zonificacion_geotecnica_2017'
     */
    wfsName?: string;
    /**
     * Nombre EXACTO del WMS GetCapabilities
     * - Puede tener espacios y acentos como en QGIS Desktop
     * - Ejemplo: 'Zonificación geotécnica 2017'
     */
    wmsLayer?: string;
    /** Color del stroke (borde) para polígonos/líneas */
    color?: string;
    /** Grosor del borde en píxeles (default: 2) */
    weight?: number;
    /** Opacidad del relleno para polígonos (0-1, default: 0.15) */
    fillOpacity?: number;
}

/**
 * Definición de capa ráster WMS
 */
export interface RasterLayerDef {
    /** ID único interno (sin espacios, snake_case recomendado) */
    id: string;
    /** Nombre visible en el menú de capas */
    name: string;
    /** Descripción corta visible debajo del nombre */
    description: string;
    /**
     * Grupo/categoría en el menú
     * Debe coincidir con algún grupo de VECTOR_LAYERS para menú unificado
     */
    group: string;
    /**
     * Nombre EXACTO de la capa WMS en QGIS Server
     * Para series temporales, usar el nombre de la capa base
     */
    wmsLayer: string;
    /** Año de la serie temporal (para badge en UI) */
    year?: number;
    /**
     * Valor TIME para consultas WMS con dimensión temporal
     * Formato: YYYY-MM-DD (ej: '2022-01-01')
     */
    timeValue?: string;
    /**
     * Configuración opcional de rampa de colores para la leyenda en frontend.
     * Si está presente, la leyenda mostrará una barra continua en lugar de
     * recuadros/clases discretas.
     */
    legendRamp?: {
        colors: string[];
        minLabel?: string;
        maxLabel?: string;
    };
}

// ============================================================================
// CAPAS VECTORIALES
// wfsName  = <Name> del WFS GetCapabilities  (guiones bajos, sin acentos)
// wmsLayer = <Name> del WMS GetCapabilities  (puede tener espacios/acentos)
// ============================================================================

export const VECTOR_LAYERS: VectorLayerDef[] = [

    // ── Geológicos ────────────────────────────────────────────────────────────
    {
        id: 'Volcanes_activos',
        name: 'Volcanes Activos',
        description: 'Volcanes activos en la región',
        group: 'Geológicos',
        wfsName: 'Volcanes_activos',
        wmsLayer: 'Volcanes_activos',
    },
    {
        id: 'Aparatos_volcanicos',
        name: 'Aparatos Volcánicos',
        description: 'Aparatos volcánicos identificados',
        group: 'Geológicos',
        wfsName: 'Aparatos_volcanicos',
        wmsLayer: 'Aparatos_volcanicos',
    },
    {
        id: 'Fracturas',
        name: 'Fracturas',
        description: 'Fracturas geológicas',
        group: 'Geológicos',
        wfsName: 'Fracturas',
        wmsLayer: 'Fracturas',
    },
    {
        id: 'Fallas',
        name: 'Fallas',
        description: 'Fallas geológicas',
        group: 'Geológicos',
        wfsName: 'Fallas',
        wmsLayer: 'Fallas',
    },
    {
        id: 'Inestabilidad_de_laderas',
        name: 'Inestabilidad de laderas',
        description: 'Zonas con riesgo de inestabilidad',
        group: 'Geológicos',
        wfsName: 'Inestabilidad_de_laderas',
        wmsLayer: 'Inestabilidad de laderas',
    },
    {
        id: 'Zonas_potenciales_de_agrietamiento',
        name: 'Zonas potenciales de agrietamiento',
        description: 'Zonas con alto potencial de agrietamiento',
        group: 'Geológicos',
        wfsName: 'Zonas_potenciales_de_agrietamiento',
        wmsLayer: 'Zonas_potenciales_de_agrietamiento',
    },
    {
        id: 'Zonas_de_fracturamiento_hidraulico',
        name: 'Zonas de fracturamiento hidráulico',
        description: 'Zonas con potencial de fracturamiento hidráulico',
        group: 'Geológicos',
        wfsName: 'Zonas_de_fracturamiento_hidraulico',
        wmsLayer: 'Zonas_de_fracturamiento_hidraulico',
    },
    {
        id: 'Litologia',
        name: 'Litología',
        description: 'Litología del suelo',
        group: 'Geológicos',
        wfsName: 'Litologia',
        wmsLayer: 'Litologia',
    },
    {
        id: 'Suelos',
        name: 'Suelos',
        description: 'Tipos de suelo',
        group: 'Geológicos',
        wfsName: 'Suelos',
        wmsLayer: 'Suelos',
    },
    {
        id: 'Sistemas_de_topoformas',
        name: 'Sistemas de topoformas',
        description: 'Sistemas de topoformas',
        group: 'Geológicos',
        wfsName: 'Sistemas_de_topoformas',
        wmsLayer: 'Sistemas_de_topoformas',
    },
    {
        id: 'Zonificacion_geotecnica_2017',
        name: 'Zonificación Geotécnica 2017',
        description: 'Zonificación geotécnica del área de estudio',
        group: 'Geológicos',
        wfsName: 'Zonificacion_geotecnica_2017',
        wmsLayer: 'Zonificacion_geotecnica_2017',
    },
    {
        id: 'Socavones_2017',
        name: 'Socavones 2017',
        description: 'Socavones identificados en 2017',
        group: 'Geológicos',
        wfsName: 'Socavones_2017',
        wmsLayer: 'Socavones_2017',
    },
    {
        id: 'Socavones_2018',
        name: 'Socavones 2018',
        description: 'Socavones identificados en 2018',
        group: 'Geológicos',
        wfsName: 'Socavones_2018',
        wmsLayer: 'Socavones_2018',
    },
    {
        id: 'Socavones_2019',
        name: 'Socavones 2019',
        description: 'Socavones identificados en 2019',
        group: 'Geológicos',
        wfsName: 'Socavones_2019',
        wmsLayer: 'Socavones_2019',
    },
    {
        id: 'SGIRPC_Socavones_2020',
        name: 'Socavones 2020',
        description: 'Socavones identificados en 2020',
        group: 'Geológicos',
        wfsName: 'SGIRPC_Socavones_2020',
        wmsLayer: 'SGIRPC_Socavones_2020',
    },

    // ── Sismos ────────────────────────────────────────────────────────────────
    {
        id: 'Sismos_CDMX',
        name: 'Sismos CDMX',
        description: 'Registros de sismos en la Ciudad de México',
        group: 'Geológicos',
        wfsName: 'Sismos_CDMX',
        wmsLayer: 'Sismos_CDMX',
    },

    // ── Susceptibilidad de Laderas ────────────────────────────────────────────
    {
        id: 'Susceptibilidad_de_Laderas_AOB',
        name: 'Susceptibilidad Laderas AOB',
        description: 'Álvaro Obregón',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_AOB',
        wmsLayer: 'Susceptibilidad_de_Laderas_AOB',
    },
    {
        id: 'Susceptibilidad_de_Laderas_COY',
        name: 'Susceptibilidad Laderas COY',
        description: 'Coyoacán',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_COY',
        wmsLayer: 'Susceptibilidad_de_Laderas_COY',
    },
    {
        id: 'Susceptibilidad_de_Laderas_CUJ',
        name: 'Susceptibilidad Laderas CUJ',
        description: 'Cuajimalpa',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_CUJ',
        wmsLayer: 'Susceptibilidad_de_Laderas_CUJ',
    },
    {
        id: 'Susceptibilidad_de_Laderas_GAM',
        name: 'Susceptibilidad Laderas GAM',
        description: 'Gustavo A. Madero',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_GAM',
        wmsLayer: 'Susceptibilidad_de_Laderas_GAM',
    },
    {
        id: 'Susceptibilidad_de_Laderas_IZP',
        name: 'Susceptibilidad Laderas IZP',
        description: 'Iztapalapa',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_IZP',
        wmsLayer: 'Susceptibilidad_de_Laderas_IZP',
    },
    {
        id: 'Susceptibilidad_de_Laderas_MAC',
        name: 'Susceptibilidad Laderas MAC',
        description: 'Magdalena Contreras',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_MAC',
        wmsLayer: 'Susceptibilidad_de_Laderas_MAC',
    },
    {
        id: 'Susceptibilidad_de_Laderas_MIH',
        name: 'Susceptibilidad Laderas MIH',
        description: 'Miguel Hidalgo',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_MIH',
        wmsLayer: 'Susceptibilidad_de_Laderas_MIH',
    },
    {
        id: 'Susceptibilidad_de_Laderas_MLP',
        name: 'Susceptibilidad Laderas MLP',
        description: 'Milpa Alta',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_MLP',
        wmsLayer: 'Susceptibilidad_de_Laderas_MLP',
    },
    {
        id: 'Susceptibilidad_de_Laderas_TLH',
        name: 'Susceptibilidad Laderas TLH',
        description: 'Tlalpan',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_TLH',
        wmsLayer: 'Susceptibilidad_de_Laderas_TLH',
    },
    {
        id: 'Susceptibilidad_de_Laderas_TLP',
        name: 'Susceptibilidad Laderas TLP',
        description: 'Tlalpan poniente',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_TLP',
        wmsLayer: 'Susceptibilidad_de_Laderas_TLP',
    },
    {
        id: 'Susceptibilidad_de_Laderas_VCA',
        name: 'Susceptibilidad Laderas VCA',
        description: 'Villa Coapa',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_VCA',
        wmsLayer: 'Susceptibilidad_de_Laderas_VCA',
    },
    {
        id: 'Susceptibilidad_de_Laderas_XOC',
        name: 'Susceptibilidad Laderas XOC',
        description: 'Xochimilco',
        group: 'Geológicos',
        wfsName: 'Susceptibilidad_de_Laderas_XOC',
        wmsLayer: 'Susceptibilidad_de_Laderas_XOC',
    },

    // ============================================================================
    // 02 Hidrometeorológicos
    // ============================================================================


    {
        id: 'Presas',
        name: 'Presas',
        description: 'Presas',
        group: 'Hidrometeorológicos',
        wfsName: 'Presas',
        wmsLayer: 'Presas',
    },
];

// ============================================================================
// CAPAS RÁSTER — ahora con group para integrarse al mismo menú
// ============================================================================

export const RASTER_LAYERS: RasterLayerDef[] = [
    {
        id: 'subsidencia_2022_r',
        name: 'Subsidencia 2022 (ráster)',
        description: 'Hundimiento regional 2022',
        group: 'Geológicos',
        wmsLayer: 'Subsidencia_CDMX_2022',
        year: 2022,
        legendRamp: {
            colors: ['#2c7bb6', '#abd9e9', '#ffffbf', '#fdae61', '#d7191c'],
            minLabel: 'Bajo',
            maxLabel: 'Alto',
        },
    },
    // Agrega aquí tus series USV u otros ráster con su grupo correspondiente
    // {
    //     id:         'usv_1985',
    //     name:       'USV Serie I',
    //     description:'Uso de Suelo 1985',
    //     group:      '🌿 Uso de Suelo y Vegetación',
    //     wmsLayer:   'usv_mosaico',
    //     year:       1985,
    //     timeValue:  '1985-01-01',
    // },
];
