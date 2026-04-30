/**
 * @fileoverview Configuración centralizada — QGIS Server
 * @module config/env
 */

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

const getEnv = (key: string, defaultValue: string = ''): string =>
    (import.meta.env[`VITE_${key}`] as string) ?? defaultValue;

const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = import.meta.env[`VITE_${key}`];
    if (value === undefined || value === '') return defaultValue;
    const parsed = parseFloat(value as string);
    return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = import.meta.env[`VITE_${key}`];
    if (value === undefined || value === '') return defaultValue;
    return value === 'true' || value === '1';
};

// ============================================================================
// TIPOS
// ============================================================================

export interface Config {
    qgisServer: {
        /** URL base del ejecutable qgis_mapserv.fcgi.exe */
        url: string;
        /** Ruta al proyecto .qgz de capas vectoriales */
        vectorProject: string;
        /** Ruta al proyecto .qgz de capas ráster */
        rasterProject: string;
        timeout: number;
        maxFeatures: number;
        /** URL WMS lista para usar (incluye MAP=vectorProject) */
        wmsUrl: string;
        /** URL WFS lista para usar (incluye MAP=vectorProject) */
        wfsUrl: string;
        /** URL WMS para capas ráster (incluye MAP=rasterProject) */
        wmsRasterUrl: string;
    };
    /** Alias de compatibilidad — apunta a qgisServer */
    geoserver: {
        url: string;
        workspace: string;
        timeout: number;
        maxFeatures: number;
        wfsUrl: string;
        wmsUrl: string;
        wcsUrl: string;
    };
    map: {
        center: [number, number];
        zoom: number;
        minZoom: number;
        maxZoom: number;
        maxBounds: [[number, number], [number, number]];
        maxBoundsViscosity: number;
        zoomDelta: number;
        zoomSnap: number;
    };
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
// CONFIGURACIÓN PRINCIPAL
// ============================================================================

const qgisServerUrl     = getEnv('QGIS_SERVER_URL', 'http://localhost/qgis/qgis_mapserv.fcgi.exe');
const vectorProject     = getEnv('QGIS_VECTOR_PROJECT', 'C:/mis_proyectos/01_Geologicos.qgz');
const rasterProject     = getEnv('QGIS_RASTER_PROJECT', 'C:/mis_proyectos/01_Geologicos.qgz');

/**
 * Construye la URL base de QGIS Server con el parámetro MAP incluido.
 * WMSTileLayer de react-leaflet añade el resto de parámetros automáticamente.
 */
const buildQgisUrl = (baseUrl: string, projectPath: string): string =>
    `${baseUrl}?MAP=${encodeURIComponent(projectPath)}`;

export const config: Config = {
    qgisServer: {
        url:           qgisServerUrl,
        vectorProject: vectorProject,
        rasterProject: rasterProject,
        timeout:       getEnvNumber('WFS_TIMEOUT', 30000),
        maxFeatures:   getEnvNumber('MAX_FEATURES', 0),
        get wmsUrl()       { return buildQgisUrl(this.url, this.vectorProject); },
        get wfsUrl()       { return buildQgisUrl(this.url, this.vectorProject); },
        get wmsRasterUrl() { return buildQgisUrl(this.url, this.rasterProject); },
    },

    /**
     * Alias geoserver → qgisServer para compatibilidad con componentes existentes.
     * workspace queda como string vacío porque QGIS Server no usa workspaces.
     */
    get geoserver() {
        return {
            url:         qgisServerUrl,
            workspace:   '',          // QGIS Server no usa workspace
            timeout:     this.qgisServer.timeout,
            maxFeatures: this.qgisServer.maxFeatures,
            wfsUrl:      this.qgisServer.wfsUrl,
            wmsUrl:      this.qgisServer.wmsUrl,
            wcsUrl:      this.qgisServer.wmsUrl, // QGIS Server no tiene WCS; apunta a WMS
        };
    },

    map: {
        center: [
            getEnvNumber('MAP_CENTER_LAT', 19.4326),
            getEnvNumber('MAP_CENTER_LNG', -99.1332),
        ],
        zoom:    getEnvNumber('MAP_ZOOM', 11),
        minZoom: getEnvNumber('MAP_MIN_ZOOM', 8),
        maxZoom: getEnvNumber('MAP_MAX_ZOOM', 19),
        maxBounds: [
            [19.75, -98.75],   // Noreste CDMX
            [19.05, -99.55],   // Suroeste CDMX
        ],
        maxBoundsViscosity: 0.7,
        zoomDelta: 0.5,
        zoomSnap:  0.5,
    },

    app: {
        name:    getEnv('APP_NAME', 'Geovisor CDMX'),
        version: getEnv('APP_VERSION', '1.0.0'),
        debug:   getEnvBoolean('DEBUG_MODE', import.meta.env.DEV),
    },

    isDevelopment: import.meta.env.DEV,
    isProduction:  import.meta.env.PROD,
    mode:          import.meta.env.MODE,
};

// ============================================================================
// LOGGER
// ============================================================================

export const logger = {
    log:   (...args: any[]) => { if (config.app.debug) console.log(`[${config.app.name}]`, ...args); },
    warn:  (...args: any[]) => { if (config.app.debug) console.warn(`[${config.app.name}]`, ...args); },
    error: (...args: any[]) => { console.error(`[${config.app.name}]`, ...args); },
    debug: (...args: any[]) => { if (config.app.debug && config.isDevelopment) console.debug(`[${config.app.name} DEBUG]`, ...args); },
};

// Validación en desarrollo
if (config.isDevelopment) {
    const required = ['QGIS_SERVER_URL', 'QGIS_VECTOR_PROJECT'];
    const missing  = required.filter(k => !import.meta.env[`VITE_${k}`]);
    if (missing.length > 0) {
        console.warn(`⚠️ Variables de entorno faltantes: ${missing.join(', ')}\nRevisa tu archivo .env`);
    }
    console.log('🗺️ Configuración QGIS Server:', {
        url:           config.qgisServer.url,
        vectorProject: config.qgisServer.vectorProject,
        wmsUrl:        config.qgisServer.wmsUrl,
        wfsUrl:        config.qgisServer.wfsUrl,
    });
}

export default config;