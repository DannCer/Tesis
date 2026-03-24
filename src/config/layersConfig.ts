/**
 * @fileoverview Configuración centralizada de capas del mapa.
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FUENTE ÚNICA DE VERDAD — CAPAS VECTORIALES Y RÁSTER                ║
 * ║                                                                      ║
 * ║  Para agregar, editar o eliminar una capa:                           ║
 * ║    · Solo edita este archivo.                                        ║
 * ║    · La simbología la sirve GeoServer vía WMS GetLegendGraphic.      ║
 * ║    · No hay estilos definidos en código.                             ║
 * ║                                                                      ║
 * ║  Estructura del archivo:                                             ║
 * ║    1. VECTOR_LAYERS  — capas WFS (polígonos, puntos, líneas)         ║
 * ║    2. RASTER_LAYERS  — capas WMS/WCS (series temporales, mosaicos)   ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * @module config/layersConfig
 */

// ============================================================================
// TIPOS
// ============================================================================

/** Capa vectorial servida por WFS + simbología desde WMS GetLegendGraphic */
export interface VectorLayerDef {
    /** Identificador único — debe coincidir con el typeName del WFS (sin workspace) */
    id: string;
    /** Nombre legible en el menú de capas */
    name: string;
    /** Descripción corta bajo el nombre */
    description: string;
    /** Grupo en el menú de capas */
    group: string;
    /**
     * Nombre de la capa en GeoServer para WMS + GetLegendGraphic.
     * Por defecto igual al id. Cambia solo si el nombre WMS difiere del WFS.
     */
}

/** Capa ráster servida por WMS/WCS + simbología desde WMS GetLegendGraphic */
export interface RasterLayerDef {
    /** Identificador único dentro del geovisor */
    id: string;
    /** Nombre legible en el menú de capas */
    name: string;
    /** Descripción corta bajo el nombre */
    description: string;
    /** Nombre de la capa en GeoServer (WMS + WCS) */
    wmsLayer: string;
    /** Año de la serie (opcional, se muestra como badge) */
    year?: number;
    /**
     * Valor TIME para WMS/WCS (formato ISO 8601).
     * Requerido si el layer es una serie temporal (ej. mosaico por año).
     */
    timeValue?: string;
}

// ============================================================================
// CAPAS VECTORIALES
// ============================================================================
//
//  · id         → typeName del WFS sin workspace, ej. "vw_estados"
//  · wmsLayer   → solo si el nombre en WMS es distinto al id
//  · group      → agrupa capas en secciones dentro del menú
//  · fillOpacity / weight → controlan el renderizado Leaflet (no la leyenda)
//
// ============================================================================

export const VECTOR_LAYERS: VectorLayerDef[] = [

    // ── División político-administrativa ─────────────────────────────────────
    {
        id:          'Aparatos_volcanicos',
        name:        'Aparatos Volcánicos',
        description: 'Aparatos Volcánicos',
        group:       '01 Geológicos',
    },
    {
        id:          'Fracturas',
        name:        'Fracturas',
        description: 'Fracturas geológicas',
        group:       '01 Geológicos',
    },    
    {
        id:          'Zonas_potenciales_de_agrietamiento',
        name:        'Zonas potenciales de agrietamiento',
        description: 'Zonas con alto potencial de agrietamiento',
        group:       '01 Geológicos',
    },
    {
        id:          'Sistemas_De_Topoformas',
        name:        'Sistemas de topoformas',
        description: 'Sistemas de topoformas',
        group:       '01 Geológicos',
    },
    {
        id:          'Litología',
        name:        'Litología',
        description: 'Litología',
        group:       '01 Geológicos',
    },
    {
        id:          'Fallas',
        name:        'Fallas',
        description: 'Fallas geológicas',
        group:       '01 Geológicos',
    },
    {
        id:          'Inestabilidad_de_laderas',
        name:        'Inestabilidad de laderas',
        description: 'Zonas con alto riesgo de inestabilidad',
        group:       '01 Geológicos',
    },
    {
        id:          'SGIRPC_Socavones_2020',
        name:        'Socavones 2020',
        description: 'Socavones identificados en 2020',
        group:       '01 Geológicos',
    },
    {
        id:          'Sismos_CDMX',
        name:        'Sismos CDMX',
        description: 'Registros de sismos en la Ciudad de México',
        group:       '01 Geológicos',
    },
    {
        id:          'Socavones_17_19',
        name:        'Socavones CDMX',
        description: 'Socavones identificados en la Ciudad de México',
        group:       '01 Geológicos',
    },
    {
        id:          'Suelos',
        name:        'Suelos',
        description: 'Tipos de suelo',
        group:       '01 Geológicos',
    },
    {
        id:          'Volcanes_activos',
        name:        'Volcanes Activos',
        description: 'Volcanes activos en la región',
        group:       '01 Geológicos',
    },
    {
        id:          'Zonas_de_fracturamiento_hidraulico',
        name:        'Zonas de fracturamiento hidráulico',
        description: 'Zonas con alto potencial de fracturamiento hidráulico',
        group:       '01 Geológicos',
    },
    {
        id:          'Zonificacion_geotecnica_2017',
        name:        'Zonificación Geotécnica 2017',
        description: 'Zonificación geotécnica del área de estudio',
        group:       '01 Geológicos',
    }

    // ── Plantillas — descomenta para agregar capas ───────────────────────────
    // {
    //     id:          'vw_cuencas',
    //     name:        'Cuencas Hidrográficas',
    //     description: 'Cuencas hidrológicas principales',
    //     group:       'Recursos hídricos',
    //     color:       '#4682B4',
    //     weight:      1.5,
    //     fillOpacity: 0.2,
    // },
    // {
    //     id:          'vw_acuiferos',
    //     name:        'Acuíferos',
    //     description: 'Disponibilidad de acuíferos',
    //     group:       'Recursos hídricos',
    //     color:       '#4682B4',
    //     weight:      1.5,
    //     fillOpacity: 0.5,
    // },
];

// ============================================================================
// CAPAS RÁSTER
// ============================================================================
//
//  · wmsLayer  → nombre exacto de la capa en GeoServer
//  · timeValue → parámetro TIME para series temporales (WMS/WCS)
//  · year      → se muestra como badge en el menú
//
// ============================================================================

export const RASTER_LAYERS: RasterLayerDef[] = [
    {
        id:         'usvserie1',
        name:       'USV Serie I',
        description:'Uso de Suelo y Vegetación 1985',
        wmsLayer:   'usv_mosaico',
        year:       1985,
        timeValue:  '1985-01-01',
    },
    {
        id:         'usvserie2',
        name:       'USV Serie II',
        description:'Uso de Suelo y Vegetación 1993',
        wmsLayer:   'usv_mosaico',
        year:       1993,
        timeValue:  '1993-01-01',
    },
    {
        id:         'usvserie3',
        name:       'USV Serie III',
        description:'Uso de Suelo y Vegetación 2002',
        wmsLayer:   'usv_mosaico',
        year:       2002,
        timeValue:  '2002-01-01',
    },
    {
        id:         'usvserie4',
        name:       'USV Serie IV',
        description:'Uso de Suelo y Vegetación 2007',
        wmsLayer:   'usv_mosaico',
        year:       2007,
        timeValue:  '2007-01-01',
    },
    {
        id:         'usvserie5',
        name:       'USV Serie V',
        description:'Uso de Suelo y Vegetación 2011',
        wmsLayer:   'usv_mosaico',
        year:       2011,
        timeValue:  '2011-01-01',
    },
    {
        id:         'usvserie6',
        name:       'USV Serie VI',
        description:'Uso de Suelo y Vegetación 2014',
        wmsLayer:   'usv_mosaico',
        year:       2014,
        timeValue:  '2014-01-01',
    },
    {
        id:         'usvserie7',
        name:       'USV Serie VII',
        description:'Uso de Suelo y Vegetación 2018',
        wmsLayer:   'usv_mosaico',
        year:       2018,
        timeValue:  '2018-01-01',
    },

    // ── Plantillas — descomenta para agregar capas ────────────────────────────
    // {
    //     id:         'ndvi_2020',
    //     name:       'NDVI 2020',
    //     description:'Índice de Vegetación 2020',
    //     wmsLayer:   'ndvi_2020',
    //     year:       2020,
    //     color:      '#2E8B57',
    // },
];
