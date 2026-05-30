/**
 * @fileoverview Tipos geoespaciales: GeoJSON, definiciones de capas WFS/WMS.
 * Consolida tipos de config/layersConfig.ts y de types/index.ts (geometría).
 * @module types/geo
 */

// ============================================================================
// GEOJSON
// ============================================================================

export interface GeoJSONFeature {
    type: 'Feature';
    id: string | number;
    geometry: GeoJSON.Geometry | null;
    properties: Record<string, any>;
    bbox?: [number, number, number, number];
}

export interface GeoJSONFeatureCollection {
    type: 'FeatureCollection';
    features: GeoJSONFeature[];
    bbox?: [number, number, number, number];
    totalFeatures?: number;
    numberMatched?: number;
}

// ============================================================================
// DEFINICIONES DE CAPAS
// ============================================================================

/** Definición de una capa vectorial WFS/WMS */
export interface VectorLayerDef {
    id: string;
    name: string;
    description: string;
    group: string;
    subgroup?: string;
    subgroup_id?: number;
    type: 'vector';
    wfsName?: string;
    wmsLayer?: string;
    color?: string;
    weight?: number;
    fillOpacity?: number;
    showLegend?: boolean;
}

/** Definición de una capa ráster WMS */
export interface RasterLayerDef {
    id: string;
    name: string;
    description: string;
    group: string;
    subgroup?: string;
    subgroup_id?: number;
    type: 'raster';
    wmsLayer?: string;
    year?: number;
    timeValue?: string;
    showLegend?: boolean;
    legendRamp?: {
        colors: string[];
        minLabel?: string;
        maxLabel?: string;
    };
}

/** Unión de tipos de capa — compatible con LayerConfig de config/layers.ts */
export type LayerDef = VectorLayerDef | RasterLayerDef;

// ============================================================================
// CAPAS EXTERNAS (importadas por el usuario)
// ============================================================================

export type ExternalLayerType = 'vector' | 'raster' | 'wms' | 'wfs';

export interface ExternalLayer {
    id: string;
    name: string;
    type: ExternalLayerType;
    url: string;
    layerName?: string;
    attribution?: string;
    file?: File;
    geojsonData?: GeoJSONFeatureCollection;
    georasterData?: unknown;
    georasterBounds?: [[number, number], [number, number]];
    symbology?: import('@utils/geo/symbologyUtils').SymbologyStyle;
}

export interface ExternalLayerState {
    layers: ExternalLayer[];
    visible: Record<string, boolean>;
    opacity: Record<string, number>;
}

// ============================================================================
// DESCARGA DE CAPAS
// ============================================================================

export interface DownloadFormat {
    label: string;
    ext: string;
    icon: string;
    outputFormat: string;
    description: string;
    color: string;
}

export const VECTOR_DOWNLOAD_FORMATS: DownloadFormat[] = [
    {
        label: 'Shapefile',
        ext: 'zip',
        icon: '🗂️',
        outputFormat: 'SHAPE-ZIP',
        description: 'Compatible con ArcGIS, QGIS',
        color: '#e67e22',
    },
    {
        label: 'GeoJSON',
        ext: 'geojson',
        icon: '{ }',
        outputFormat: 'application/json',
        description: 'Ideal para web y código',
        color: '#27ae60',
    },
    {
        label: 'KML',
        ext: 'kml',
        icon: '🌍',
        outputFormat: 'application/vnd.google-earth.kml+xml',
        description: 'Google Earth / Maps',
        color: '#2980b9',
    },
];

export const RASTER_DOWNLOAD_FORMATS: DownloadFormat[] = [
    {
        label: 'GeoTIFF',
        ext: 'tif',
        icon: '🗺️',
        outputFormat: 'GeoTIFF',
        description: 'GeoTIFF con georeferenciación (WCS)',
        color: '#c0392b',
    },
];