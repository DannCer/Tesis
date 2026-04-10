/**
 * @fileoverview Tipos para gestión de proyectos QGIS Server
 * @module types/projects
 */

/**
 * Definición de un proyecto QGIS Server
 */
export interface QgisProject {
    /** ID único del proyecto */
    id: string;
    /** Nombre personalizable del proyecto */
    name: string;
    /** URL base del servidor QGIS */
    serverUrl: string;
    /** Ruta al archivo .qgz del proyecto */
    projectPath: string;
    /** URL completa construida (serverUrl + MAP=projectPath) */
    fullUrl: string;
    /** Color identificador del proyecto en la UI */
    color?: string;
    /** Si el proyecto está activo/visible */
    enabled: boolean;
    /** Fecha de última actualización */
    lastUpdated?: string;
}

/**
 * Capa detectada desde GetCapabilities
 */
export interface DetectedLayer {
    /** Nombre de la capa en QGIS */
    name: string;
    /** Título de la capa */
    title: string;
    /** Resumen/descripción */
    abstract?: string;
    /** Tipo de geometría (si es vectorial) */
    geometryType?: string;
    /** BoundingBox de la capa */
    bbox?: {
        minx: number;
        miny: number;
        maxx: number;
        maxy: number;
        crs: string;
    };
}

/**
 * Resultado de GetCapabilities de un proyecto
 */
export interface ProjectCapabilities {
    /** ID del proyecto */
    projectId: string;
    /** Capas WMS disponibles */
    wmsLayers: DetectedLayer[];
    /** Capas WFS disponibles */
    wfsLayers: DetectedLayer[];
    /** Timestamp de la consulta */
    timestamp: string;
}

/**
 * Configuración de capas por proyecto
 */
export interface ProjectLayerConfig {
    /** ID del proyecto */
    projectId: string;
    /** Nombre del proyecto */
    projectName: string;
    /** Capas vectoriales */
    vectorLayers: {
        id: string;
        name: string;
        description: string;
        wfsName: string;
        wmsLayer: string;
        enabled: boolean;
    }[];
    /** Capas ráster */
    rasterLayers: {
        id: string;
        name: string;
        description: string;
        wmsLayer: string;
        enabled: boolean;
    }[];
}
