/**
 * @fileoverview Configuración centralizada de capas — QGIS Server
 *
 * wfsName  → TypeName EXACTO del WFS GetCapabilities (con guiones bajos)
 * wmsLayer → nombre EXACTO del WMS GetCapabilities (puede tener espacios)
 * group    → agrupa capas en el menú (vectoriales Y ráster comparten grupos)
 */

export interface VectorLayerDef {
    id:          string;
    name:        string;
    description: string;
    group:       string;
    wfsName?:    string;
    wmsLayer?:   string;
    color?:      string;
    weight?:     number;
    fillOpacity?: number;
}

export interface RasterLayerDef {
    id:          string;
    name:        string;
    description: string;
    group:       string;   // ← ahora ráster también tiene grupo
    wmsLayer:    string;
    year?:       number;
    timeValue?:  string;
}

// ============================================================================
// CAPAS VECTORIALES
// wfsName  = <Name> del WFS GetCapabilities  (guiones bajos, sin acentos)
// wmsLayer = <Name> del WMS GetCapabilities  (puede tener espacios/acentos)
// ============================================================================

export const VECTOR_LAYERS: VectorLayerDef[] = [

    // ── Geológicos ────────────────────────────────────────────────────────────
    {
        id:       'Volcanes_activos',
        name:     'Volcanes Activos',
        description: 'Volcanes activos en la región',
        group:    '🌋 Geológicos',
        wfsName:  'Volcanes_activos',
        wmsLayer: 'Volcanes_activos',
    },
    {
        id:       'Aparatos_volcanicos',
        name:     'Aparatos Volcánicos',
        description: 'Aparatos volcánicos identificados',
        group:    '🌋 Geológicos',
        wfsName:  'Aparatos_volcanicos',
        wmsLayer: 'Aparatos_volcanicos',
    },
    {
        id:       'Fracturas',
        name:     'Fracturas',
        description: 'Fracturas geológicas',
        group:    '🌋 Geológicos',
        wfsName:  'Fracturas',
        wmsLayer: 'Fracturas',
    },
    {
        id:       'Fallas',
        name:     'Fallas',
        description: 'Fallas geológicas',
        group:    '🌋 Geológicos',
        wfsName:  'Fallas',
        wmsLayer: 'Fallas',
    },
    {
        id:       'Inestabilidad_de_laderas',
        name:     'Inestabilidad de laderas',
        description: 'Zonas con riesgo de inestabilidad',
        group:    '🌋 Geológicos',
        wfsName:  'Inestabilidad_de_laderas',
        wmsLayer: 'Inestabilidad de laderas',
    },
    {
        id:       'Zonas_potenciales_de_agrietamiento',
        name:     'Zonas potenciales de agrietamiento',
        description: 'Zonas con alto potencial de agrietamiento',
        group:    '🌋 Geológicos',
        wfsName:  'Zonas_potenciales_de_agrietamiento',
        wmsLayer: 'Zonas potenciales de agrietamiento',
    },
    {
        id:       'Zonas_de_fracturamiento_hidraulico',
        name:     'Zonas de fracturamiento hidráulico',
        description: 'Zonas con potencial de fracturamiento hidráulico',
        group:    '🌋 Geológicos',
        wfsName:  'Zonas_de_fracturamiento_hidraulico',
        wmsLayer: 'Zonas de fracturamiento hidráulico',
    },
    {
        id:       'Litologia',
        name:     'Litología',
        description: 'Litología del suelo',
        group:    '🌋 Geológicos',
        wfsName:  'Litologia',
        wmsLayer: 'Litología',
    },
    {
        id:       'Suelos',
        name:     'Suelos',
        description: 'Tipos de suelo',
        group:    '🌋 Geológicos',
        wfsName:  'Suelos',
        wmsLayer: 'Suelos',
    },
    {
        id:       'Sistemas_de_topoformas',
        name:     'Sistemas de topoformas',
        description: 'Sistemas de topoformas',
        group:    '🌋 Geológicos',
        wfsName:  'Sistemas_de_topoformas',
        wmsLayer: 'Sistemas de topoformas',
    },
    {
        id:       'Zonificacion_geotecnica_2017',
        name:     'Zonificación Geotécnica 2017',
        description: 'Zonificación geotécnica del área de estudio',
        group:    '🌋 Geológicos',
        wfsName:  'Zonificacion_geotecnica_2017',
        wmsLayer: 'Zonificación geotécnica 2017',
    },

    // ── Subsidencia ───────────────────────────────────────────────────────────
    {
        id:       'Subsidencia_CDMX_2022',
        name:     'Subsidencia CDMX 2022',
        description: 'Hundimiento del suelo en la CDMX 2022',
        group:    '🌋 Geológicos',
        wfsName:  'Subsidencia_CDMX_2022',
        wmsLayer: 'Subsidencia CDMX 2022',
    },

    // ── Socavones ─────────────────────────────────────────────────────────────
    {
        id:       'Socavones_2017',
        name:     'Socavones 2017',
        description: 'Socavones identificados en 2017',
        group:    '⚠️ Riesgos',
        wfsName:  'Socavones_2017',
        wmsLayer: 'Socavones 2017',
    },
    {
        id:       'Socavones_2018',
        name:     'Socavones 2018',
        description: 'Socavones identificados en 2018',
        group:    '⚠️ Riesgos',
        wfsName:  'Socavones_2018',
        wmsLayer: 'Socavones 2018',
    },
    {
        id:       'Socavones_2019',
        name:     'Socavones 2019',
        description: 'Socavones identificados en 2019',
        group:    '⚠️ Riesgos',
        wfsName:  'Socavones_2019',
        wmsLayer: 'Socavones 2019',
    },
    {
        id:       'SGIRPC_Socavones_2020',
        name:     'Socavones 2020',
        description: 'Socavones identificados en 2020',
        group:    '⚠️ Riesgos',
        wfsName:  'SGIRPC_Socavones_2020',
        wmsLayer: 'SGIRPC_Socavones_2020',
    },

    // ── Sismos ────────────────────────────────────────────────────────────────
    {
        id:       'Sismos_CDMX',
        name:     'Sismos CDMX',
        description: 'Registros de sismos en la Ciudad de México',
        group:    '⚠️ Riesgos',
        wfsName:  'Sismos_CDMX',
        wmsLayer: 'Sismos CDMX',
    },

    // ── Susceptibilidad de Laderas ────────────────────────────────────────────
    {
        id:       'Susceptibilidad_de_Laderas_AOB',
        name:     'Susceptibilidad Laderas AOB',
        description: 'Álvaro Obregón',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_AOB',
        wmsLayer: 'Susceptibilidad de Laderas AOB',
    },
    {
        id:       'Susceptibilidad_de_Laderas_COY',
        name:     'Susceptibilidad Laderas COY',
        description: 'Coyoacán',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_COY',
        wmsLayer: 'Susceptibilidad de Laderas COY',
    },
    {
        id:       'Susceptibilidad_de_Laderas_CUJ',
        name:     'Susceptibilidad Laderas CUJ',
        description: 'Cuajimalpa',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_CUJ',
        wmsLayer: 'Susceptibilidad de Laderas CUJ',
    },
    {
        id:       'Susceptibilidad_de_Laderas_GAM',
        name:     'Susceptibilidad Laderas GAM',
        description: 'Gustavo A. Madero',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_GAM',
        wmsLayer: 'Susceptibilidad de Laderas GAM',
    },
    {
        id:       'Susceptibilidad_de_Laderas_IZP',
        name:     'Susceptibilidad Laderas IZP',
        description: 'Iztapalapa',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_IZP',
        wmsLayer: 'Susceptibilidad de Laderas IZP',
    },
    {
        id:       'Susceptibilidad_de_Laderas_MAC',
        name:     'Susceptibilidad Laderas MAC',
        description: 'Magdalena Contreras',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_MAC',
        wmsLayer: 'Susceptibilidad de Laderas MAC',
    },
    {
        id:       'Susceptibilidad_de_Laderas_MIH',
        name:     'Susceptibilidad Laderas MIH',
        description: 'Miguel Hidalgo',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_MIH',
        wmsLayer: 'Susceptibilidad de Laderas MIH',
    },
    {
        id:       'Susceptibilidad_de_Laderas_MLP',
        name:     'Susceptibilidad Laderas MLP',
        description: 'Milpa Alta',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_MLP',
        wmsLayer: 'Susceptibilidad de Laderas MLP',
    },
    {
        id:       'Susceptibilidad_de_Laderas_TLH',
        name:     'Susceptibilidad Laderas TLH',
        description: 'Tlalpan',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_TLH',
        wmsLayer: 'Susceptibilidad de Laderas TLH',
    },
    {
        id:       'Susceptibilidad_de_Laderas_TLP',
        name:     'Susceptibilidad Laderas TLP',
        description: 'Tlalpan poniente',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_TLP',
        wmsLayer: 'Susceptibilidad de Laderas TLP',
    },
    {
        id:       'Susceptibilidad_de_Laderas_VCA',
        name:     'Susceptibilidad Laderas VCA',
        description: 'Villa Coapa',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_VCA',
        wmsLayer: 'Susceptibilidad de Laderas VCA',
    },
    {
        id:       'Susceptibilidad_de_Laderas_XOC',
        name:     'Susceptibilidad Laderas XOC',
        description: 'Xochimilco',
        group:    '🏔️ Susceptibilidad de Laderas',
        wfsName:  'Susceptibilidad_de_Laderas_XOC',
        wmsLayer: 'Susceptibilidad de Laderas XOC',
    },
];

// ============================================================================
// CAPAS RÁSTER — ahora con group para integrarse al mismo menú
// ============================================================================

export const RASTER_LAYERS: RasterLayerDef[] = [
    {
        id:          'subsidencia_2022_r',
        name:        'Subsidencia 2022 (ráster)',
        description: 'Hundimiento regional 2022',
        group:       '🌋 Geológicos',
        wmsLayer:    'Subsidencia_CDMX_2022',
        year:        2022,
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
