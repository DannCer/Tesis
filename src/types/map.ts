/**
 * @fileoverview Tipos de estado e interacción del mapa.
 * Estado de capas, consultas ráster, eventos Leaflet.
 * @module types/map
 */

import type { GeoJSONFeatureCollection } from './geo';

// ============================================================================
// ESTADO DE CAPAS
// ============================================================================

export interface LayerFeature {
    data: GeoJSONFeatureCollection;
    visible: boolean;
    timestamp: number;
    opacity: number;
    error?: string;
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
// CONSULTAS RÁSTER
// ============================================================================

export interface PixelQueryParams {
    bbox: number[];
    width: number;
    height: number;
    clickPoint: [number, number];
    srs?: string;
    time?: string | null;
}

export interface PixelInfo {
    layerName: string;
    time: string | null;
    value: any;
    message?: string;
    rawProperties?: Record<string, any>;
    coordinates?: any;
    error?: string;
}

export interface EnrichedPixelInfo extends PixelInfo {
    serieId: string;
    serieName: string;
    year: number;
}

export interface MapPixelData {
    coordinates: [number, number];
    layers: EnrichedPixelInfo[];
    timestamp: number;
    error?: string;
}

// ============================================================================
// OPCIONES WFS
// ============================================================================

export interface WFSOptions {
    maxFeatures?: number;
    cql_filter?: string | null;
    propertyName?: string | null;
    srsName?: string;
    outputFormat?: string;
}

// ============================================================================
// ERRORES DE APLICACIÓN
// ============================================================================

export enum ErrorType {
    NETWORK    = 'NETWORK',
    TIMEOUT    = 'TIMEOUT',
    SERVER     = 'SERVER',
    VALIDATION = 'VALIDATION',
    PARSING    = 'PARSING',
    UNKNOWN    = 'UNKNOWN',
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
    layerId?: string,
): AppError => ({
    type,
    message,
    originalError,
    timestamp: Date.now(),
    layerId,
});

// ============================================================================
// LEYENDA
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
