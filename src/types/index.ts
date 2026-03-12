/**
 * @fileoverview Tipos centralizados para la aplicación Geovisor.
 * @module types
 */

// ============================================================================
// TIPOS DE GEOMETRÍA GEOESPACIAL
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
// TIPOS PARA CAPAS
// ============================================================================

export interface LayerFeature {
    data: GeoJSONFeatureCollection;
    visible: boolean;
    timestamp: number;
    opacity: number;
}

export interface LayerState {
    [layerId: string]: LayerFeature | undefined;
}

export interface LoadingState {
    [layerId: string]: boolean;
}

export interface ErrorState {
    [layerId: string]: string | null;
}

// ============================================================================
// TIPOS PARA CONSULTAS RÁSTER
// ============================================================================

export interface PixelQueryParams {
    bbox: number[];
    width: number;
    height: number;
    clickPoint: [number, number];
    srs?: string;
    time?: string | null;
}

export interface EnrichedPixelInfo {
    layerName: string;
    time: string | null;
    value: any;
    message?: string;
    rawProperties?: Record<string, any>;
    coordinates?: any;
    error?: string;
    serieId?: string;
    serieName?: string;
    year?: number;
}

export interface MapPixelData {
    coordinates: [number, number];
    layers: EnrichedPixelInfo[];
    timestamp: number;
    error?: string;
}

// ============================================================================
// TIPOS PARA CAPAS EXTERNAS
// ============================================================================

export type AddLayerType = 'vector' | 'raster' | 'wms' | 'wfs';

export interface ExternalLayer {
    id: string;
    name: string;
    type: AddLayerType;
    url: string;
    layerName?: string;
    attribution?: string;
    file?: File;
    geojsonData?: GeoJSONFeatureCollection;
    georasterData?: unknown;
    georasterBounds?: [[number, number], [number, number]];
}

export interface ExternalLayerState {
    layers: ExternalLayer[];
    visible: Record<string, boolean>;
    opacity: Record<string, number>;
}

// ============================================================================
// TIPOS PARA OPCIONES WFS
// ============================================================================

export interface WFSOptions {
    maxFeatures?: number;
    cql_filter?: string | null;
    propertyName?: string | null;
    srsName?: string;
    outputFormat?: string;
}

// ============================================================================
// TIPOS PARA ERRORES
// ============================================================================

export enum ErrorType {
    NETWORK = 'NETWORK',
    TIMEOUT = 'TIMEOUT',
    SERVER = 'SERVER',
    VALIDATION = 'VALIDATION',
    PARSING = 'PARSING',
    UNKNOWN = 'UNKNOWN'
}

export interface AppError {
    type: ErrorType;
    message: string;
    originalError?: Error;
    timestamp: number;
    layerId?: string;
}

export const createError = (
    type: ErrorType,
    message: string,
    originalError?: Error,
    layerId?: string
): AppError => ({
    type,
    message,
    originalError,
    timestamp: Date.now(),
    layerId
});

// ============================================================================
// TIPOS PARA CONFIGURACIÓN
// ============================================================================

export interface MapConfig {
    center: [number, number];
    zoom: number;
    minZoom: number;
    maxZoom: number;
    maxBounds: [[number, number], [number, number]];
    maxBoundsViscosity: number;
    zoomDelta: number;
    zoomSnap: number;
}

export interface GeoServerConfig {
    url: string;
    workspace: string;
    timeout: number;
    maxFeatures: number;
    wfsUrl: string;
    wmsUrl: string;
    wcsUrl: string;
}

export interface AppConfig {
    geoserver: GeoServerConfig;
    map: MapConfig;
    app: {
        name: string;
        version: string;
        debug: boolean;
    };
    isDevelopment: boolean;
    isProduction: boolean;
    mode: string;
}

// ============================================================================
// TIPOS PARA EVENTOS DEL MAPA
// ============================================================================

export interface MapClickEvent {
    latlng: L.LatLng;
    containerPoint: L.Point;
    layerPoint: L.Point;
    originalEvent: MouseEvent;
}

export interface FeatureClickEvent {
    featureId: string | number;
    properties: Record<string, any>;
    layer: L.Layer;
}

// ============================================================================
// TIPOS PARA LEYENDA
// ============================================================================

export interface LegendItem {
    label: string;
    color: string;
    borderColor?: string;
    value?: number;
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

export interface LayerLegendConfig {
    title: string;
    description?: string;
    group?: string;
    color?: string;
    weight?: number;
    fillOpacity?: number;
    type: LegendType;
    propertyName?: string;
    items?: LegendItem[];
    variants?: Record<string, any>;
    note?: string;
}

// ============================================================================
// TIPOS PARA DESCARGA DE CAPAS
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
        ext: 'shp.zip',
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
