export interface LayerConfig {
    id: string;
    name: string;
    description: string;
    color: string;
    type: 'vector' | 'raster';
    wmsLayer?: string; // Nombre en GeoServer
    year?: number;
    timeValue?: string; // Fecha exacta para el parámetro TIME
    showLegend?: boolean;
    fillOpacity?: number;
    weight?: number;
    bounds?: [number, number][]; // [[latMin, lngMin], [latMax, lngMax]]
}

export const VECTOR_STYLE_DEFAULTS = {
    weight: 2,
    opacity: 1,
    fillOpacity: 0.2
};

export const AVAILABLE_LAYERS: LayerConfig[] = [
    // --- CAPAS VECTORIALES ---
    {
        id: 'vw_estados',
        name: 'Estados',
        description: 'Límites estatales',
        color: '#cd171e',
        type: 'vector',
        showLegend: true,
        weight: 2,
        fillOpacity: 0.1
    },
    {
        id: 'vw_municipios',
        name: 'Municipios',
        description: 'Límites municipales',
        color: '#BC955B',
        type: 'vector',
        showLegend: true,
        weight: 1.5,
        fillOpacity: 0.1
    },
    {
        id: 'vw_localidades',
        name: 'Localidades',
        description: 'Localidades urbanas y rurales',
        color: '#691B31',
        type: 'vector',
        showLegend: true,
        weight: 1,
        fillOpacity: 0.4
    },
    // --- CAPAS RÁSTER (Series temporales) ---
    // Todas usan el mismo wmsLayer 'usv_mosaico' pero con diferente tiempo
    {
        id: 'usvserie1',
        name: 'USV Serie I',
        description: 'Uso de Suelo y Vegetación 1985',        
        color: '#2E8B57',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 1985,
        timeValue: '1985-01-01',
        showLegend: true
    },
    {
        id: 'usvserie2',
        name: 'USV Serie II',
        description: 'Uso de Suelo y Vegetación 1993',        
        color: '#4682B4',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 1993,
        timeValue: '1993-01-01',
        showLegend: true
    },
    {
        id: 'serie7',
        name: 'USV Serie VII',
        description: 'Uso de Suelo y Vegetación 2018',        
        color: '#FF69B4',
        type: 'raster',
        wmsLayer: 'usv_mosaico',
        year: 2018,
        timeValue: '2018-01-01',
        showLegend: true
    }
    // Para agregar más series, solo clona un objeto aquí.
];

/**
 * Clasificaciones globales para Uso de Suelo (Pixel Info)
 */
export const LAND_USE_CLASSES: Record<number, { nombre: string; color: string }> = {
    1: { nombre: 'Otro tipo de vegetación', color: '#fcff47' },
    2: { nombre: 'Pastizal', color: '#804f22' },
    3: { nombre: 'Bosques', color: '#15ad18' },
    4: { nombre: 'Sin vegetación aparente', color: '#000000' },
    5: { nombre: 'Zona urbana', color: '#fd1f1f' },
    6: { nombre: 'Selvas', color: '#d13bca' },
    7: { nombre: 'Matorrales', color: '#c2a577' },
    8: { nombre: 'Vegetación secundaria', color: '#74dd2f' },
    9: { nombre: 'Cuerpo de agua', color: '#474ed4' },
    10: { nombre: 'Áreas agrícolas', color: '#f97326' },
};

/**
 * Obtiene la configuración de una capa por su ID
 */
export const getLayerConfig = (id: string): LayerConfig | undefined => {
    return AVAILABLE_LAYERS.find(l => l.id === id);
};
