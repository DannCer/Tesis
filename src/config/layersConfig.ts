/**
 * @fileoverview Configuración centralizada de capas — QGIS Server
 *
 * Para QGIS Server:
 * - id          → identificador interno del geovisor
 * - wfsName     → nombre EXACTO de la capa en el proyecto QGIS (para WFS)
 *                 Si se omite, se usa el id. Puede tener espacios y acentos.
 * - wmsLayer    → nombre para WMS / GetLegendGraphic. Igual a wfsName si se omite.
 *
 * @module config/layersConfig
 */

export interface VectorLayerDef {
    id: string;
    name: string;
    description: string;
    group: string;
    /** Nombre exacto en QGIS para WFS GetFeature (puede tener espacios/acentos) */
    wfsName?: string;
    /** Nombre exacto en QGIS para WMS / GetLegendGraphic */
    wmsLayer?: string;
}

export interface RasterLayerDef {
    id: string;
    name: string;
    description: string;
    wmsLayer: string;
    year?: number;
    timeValue?: string;
}

// ============================================================================
// CAPAS VECTORIALES — proyecto 01_Geologicos.qgz
// ============================================================================
// wfsName = nombre exacto como aparece en QGIS Desktop y WMS GetCapabilities

export const VECTOR_LAYERS: VectorLayerDef[] = [

    // ── Geológicos ────────────────────────────────────────────────────────────
    {
        id: 'Volcanes_activos',
        name: 'Volcanes Activos',
        description: 'Volcanes activos en la región',
        group: '01 Geológicos',
        wfsName: 'Volcanes_activos',
        wmsLayer: 'Volcanes_activos',
    },
    {
        id: 'Aparatos_volcanicos',
        name: 'Aparatos Volcánicos',
        description: 'Aparatos volcánicos identificados',
        group: '01 Geológicos',
        wfsName: 'Aparatos_volcanicos',
        wmsLayer: 'Aparatos_volcanicos',
    },
    {
        id: 'Fracturas',
        name: 'Fracturas',
        description: 'Fracturas geológicas',
        group: '01 Geológicos',
        wfsName: 'Fracturas',
        wmsLayer: 'Fracturas',
    },
    {
        id: 'Fallas',
        name: 'Fallas',
        description: 'Fallas geológicas',
        group: '01 Geológicos',
        wfsName: 'Fallas',
        wmsLayer: 'Fallas',
    },
    {
        id: 'Zonas_potenciales_de_agrietamiento',
        name: 'Zonas potenciales de agrietamiento',
        description: 'Zonas con alto potencial de agrietamiento',
        group: '01 Geológicos',
        wfsName: 'Zonas_potenciales_de_agrietamiento',
        wmsLayer: 'Zonas_potenciales_de_agrietamiento',
    },
    {
        id: 'Zonas_de_fracturamiento_hidraulico',
        name: 'Zonas de fracturamiento hidráulico',
        description: 'Zonas con potencial de fracturamiento hidráulico',
        group: '01 Geológicos',
        wfsName: 'Zonas_de_fracturamiento_hidraulico',
        wmsLayer: 'Zonas_de_fracturamiento_hidraulico',
    },
    {
        id: 'Litologia',
        name: 'Litología',
        description: 'Litología del suelo',
        group: '01 Geológicos',
        wfsName: 'Litologia',
        wmsLayer: 'Litologia',
    },
    {
        id: 'Suelos',
        name: 'Suelos',
        description: 'Tipos de suelo',
        group: '01 Geológicos',
        wfsName: 'Suelos',
        wmsLayer: 'Suelos',
    },
    {
        id: 'Sistemas_de_topoformas',
        name: 'Sistemas de topoformas',
        description: 'Sistemas de topoformas',
        group: '01 Geológicos',
        wfsName: 'Sistemas_de_topoformas',
        wmsLayer: 'Sistemas_de_topoformas',
    },
    {
        id: 'Zonificacion_geotecnica_2017',
        name: 'Zonificación Geotécnica 2017',
        description: 'Zonificación geotécnica del área de estudio',
        group: '01 Geológicos',
        wfsName: 'Zonificacion_geotecnica_2017',
        wmsLayer: 'Zonificacion_geotecnica_2017',
    },

    // ── Riesgos / Socavones ──────────────────────────────────────────────────
    {
        id: 'Socavones_2017',
        name: 'Socavones 2017',
        description: 'Socavones identificados en 2017',
        group: '01 Geológicos',
        wfsName: 'Socavones 2017',
        wmsLayer: 'Socavones 2017',
    },
    {
        id: 'Socavones_2018',
        name: 'Socavones 2018',
        description: 'Socavones identificados en 2018',
        group: '01 Geológicos',
        wfsName: 'Socavones 2018',
        wmsLayer: 'Socavones 2018',
    },
    {
        id: 'Socavones_2019',
        name: 'Socavones 2019',
        description: 'Socavones identificados en 2019',
        group: '01 Geológicos',
        wfsName: 'Socavones 2019',
        wmsLayer: 'Socavones 2019',
    },
    {
        id: 'SGIRPC_Socavones_2020',
        name: 'Socavones 2020',
        description: 'Socavones identificados en 2020',
        group: '01 Geológicos',
        wfsName: 'SGIRPC_Socavones_2020',
        wmsLayer: 'SGIRPC_Socavones_2020',
    },

    // ── Sismos ────────────────────────────────────────────────────────────────
    {
        id: 'Sismos_CDMX',
        name: 'Sismos CDMX',
        description: 'Registros de sismos en la Ciudad de México',
        group: '01 Geológicos',
        wfsName: 'Sismos CDMX',
        wmsLayer: 'Sismos CDMX',
    },

    // ── Susceptibilidad de Laderas (por alcaldía) ────────────────────────────
    {
        id: 'Susceptibilidad_Laderas_AOB',
        name: 'Susceptibilidad de Laderas AOB',
        description: 'Susceptibilidad de laderas — Álvaro Obregón',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas AOB',
        wmsLayer: 'Susceptibilidad de Laderas AOB',
    },
    {
        id: 'Susceptibilidad_Laderas_COY',
        name: 'Susceptibilidad de Laderas COY',
        description: 'Susceptibilidad de laderas — Coyoacán',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas COY',
        wmsLayer: 'Susceptibilidad de Laderas COY',
    },
    {
        id: 'Susceptibilidad_Laderas_CUJ',
        name: 'Susceptibilidad de Laderas CUJ',
        description: 'Susceptibilidad de laderas — Cuajimalpa',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas CUJ',
        wmsLayer: 'Susceptibilidad de Laderas CUJ',
    },
    {
        id: 'Susceptibilidad_Laderas_GAM',
        name: 'Susceptibilidad de Laderas GAM',
        description: 'Susceptibilidad de laderas — Gustavo A. Madero',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas GAM',
        wmsLayer: 'Susceptibilidad de Laderas GAM',
    },
    {
        id: 'Susceptibilidad_Laderas_IZP',
        name: 'Susceptibilidad de Laderas IZP',
        description: 'Susceptibilidad de laderas — Iztapalapa',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas IZP',
        wmsLayer: 'Susceptibilidad de Laderas IZP',
    },
    {
        id: 'Susceptibilidad_Laderas_MAC',
        name: 'Susceptibilidad de Laderas MAC',
        description: 'Susceptibilidad de laderas — Magdalena Contreras',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas MAC',
        wmsLayer: 'Susceptibilidad de Laderas MAC',
    },
    {
        id: 'Susceptibilidad_Laderas_MIH',
        name: 'Susceptibilidad de Laderas MIH',
        description: 'Susceptibilidad de laderas — Miguel Hidalgo',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas MIH',
        wmsLayer: 'Susceptibilidad de Laderas MIH',
    },
    {
        id: 'Susceptibilidad_Laderas_MLP',
        name: 'Susceptibilidad de Laderas MLP',
        description: 'Susceptibilidad de laderas — Milpa Alta',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas MLP',
        wmsLayer: 'Susceptibilidad de Laderas MLP',
    },
    {
        id: 'Susceptibilidad_Laderas_TLH',
        name: 'Susceptibilidad de Laderas TLH',
        description: 'Susceptibilidad de laderas — Tlalpan',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas TLH',
        wmsLayer: 'Susceptibilidad de Laderas TLH',
    },
    {
        id: 'Susceptibilidad_Laderas_TLP',
        name: 'Susceptibilidad de Laderas TLP',
        description: 'Susceptibilidad de laderas — Tlalpan poniente',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas TLP',
        wmsLayer: 'Susceptibilidad de Laderas TLP',
    },
    {
        id: 'Susceptibilidad_Laderas_VCA',
        name: 'Susceptibilidad de Laderas VCA',
        description: 'Susceptibilidad de laderas — Villa Coapa',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas VCA',
        wmsLayer: 'Susceptibilidad de Laderas VCA',
    },
    {
        id: 'Susceptibilidad_Laderas_XOC',
        name: 'Susceptibilidad de Laderas XOC',
        description: 'Susceptibilidad de laderas — Xochimilco',
        group: '01 Geológicos',
        wfsName: 'Susceptibilidad de Laderas XOC',
        wmsLayer: 'Susceptibilidad de Laderas XOC',
    },
];

// ============================================================================
// CAPAS RÁSTER
// ============================================================================
// wmsLayer = nombre de la capa en el proyecto QGIS ráster

export const RASTER_LAYERS: RasterLayerDef[] = [
    { id: 'subsidencia_2022', name: 'Subsidencia CDMX', description: 'Hundimiento regional 2022', wmsLayer: 'Subsidencia_CDMX_2022', year: 2022 },
];
