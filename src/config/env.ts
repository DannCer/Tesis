/**
 * @fileoverview Configuración centralizada — QGIS Server + API
 * Todas las variables de entorno pasan por helpers tipados; nunca se accede
 * a `import.meta.env` directamente fuera de este módulo.
 * @module config/env
 */

// ============================================================================
// HELPERS TIPADOS — únicos puntos de acceso a import.meta.env
// ============================================================================

const getEnv = (key: string, defaultValue = ''): string =>
    (import.meta.env[`VITE_${key}`] as string | undefined) ?? defaultValue;

const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = import.meta.env[`VITE_${key}`] as string | undefined;
    if (!value) return defaultValue;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? defaultValue : parsed;
};

const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = import.meta.env[`VITE_${key}`] as string | undefined;
    if (!value) return defaultValue;
    return value === 'true' || value === '1';
};

// ============================================================================
// TIPOS
// ============================================================================

export interface Config {
    /** URL base de la API REST (FastAPI). */
    apiUrl: string;
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
// VALORES BASE (lectura única al arrancar)
// ============================================================================

const qgisServerUrl  = getEnv('QGIS_SERVER_URL', 'http://localhost/qgis/qgis_mapserv.fcgi.exe');
const vectorProject  = getEnv('QGIS_VECTOR_PROJECT', 'C:/mis_proyectos/01_Geologicos.qgz');
const rasterProject  = getEnv('QGIS_RASTER_PROJECT', 'C:/mis_proyectos/01_Geologicos.qgz');

/**
 * Construye la URL base de QGIS Server con el parámetro MAP incluido.
 * WMSTileLayer de react-leaflet añade el resto de parámetros automáticamente.
 */
const buildQgisUrl = (baseUrl: string, projectPath: string): string =>
    `${baseUrl}?MAP=${encodeURIComponent(projectPath)}`;

// ============================================================================
// CONFIGURACIÓN PRINCIPAL
// ============================================================================

export const config: Config = {
    /** URL de la API REST — proviene de VITE_API_URL en los archivos .env */
    apiUrl: getEnv('API_URL', 'http://localhost:8000'),

    qgisServer: {
        url:           qgisServerUrl,
        vectorProject: vectorProject,
        rasterProject: rasterProject,
        timeout:       getEnvNumber('WFS_TIMEOUT', 30_000),
        maxFeatures:   getEnvNumber('MAX_FEATURES', 0),
        get wmsUrl()       { return buildQgisUrl(this.url, this.vectorProject); },
        get wfsUrl()       { return buildQgisUrl(this.url, this.vectorProject); },
        get wmsRasterUrl() { return buildQgisUrl(this.url, this.rasterProject); },
    },

    /**
     * Alias geoserver → qgisServer para compatibilidad con componentes existentes.
     * `workspace` queda vacío porque QGIS Server no usa workspaces.
     */
    get geoserver() {
        return {
            url:         qgisServerUrl,
            workspace:   '',
            timeout:     this.qgisServer.timeout,
            maxFeatures: this.qgisServer.maxFeatures,
            wfsUrl:      this.qgisServer.wfsUrl,
            wmsUrl:      this.qgisServer.wmsUrl,
            wcsUrl:      this.qgisServer.wmsUrl,  // QGIS Server no tiene WCS
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
            [19.75, -98.75],  // Noreste CDMX
            [19.05, -99.55],  // Suroeste CDMX
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
// LOGGER — usa `unknown[]` en lugar de `any[]`
// ============================================================================

export const logger = {
    log:   (...args: unknown[]) => { if (config.app.debug) console.log(`[${config.app.name}]`, ...args); },
    warn:  (...args: unknown[]) => { if (config.app.debug) console.warn(`[${config.app.name}]`, ...args); },
    error: (...args: unknown[]) => { console.error(`[${config.app.name}]`, ...args); },
    debug: (...args: unknown[]) => {
        if (config.app.debug && config.isDevelopment) {
            console.debug(`[${config.app.name} DEBUG]`, ...args);
        }
    },
};

// ============================================================================
// VALIDACIÓN EN DESARROLLO
// ============================================================================

if (config.isDevelopment) {
    const required = ['QGIS_SERVER_URL', 'QGIS_VECTOR_PROJECT', 'API_URL'] as const;
    const missing  = required.filter(k => !import.meta.env[`VITE_${k}`]);
    if (missing.length > 0) {
        console.warn(
            `⚠️ Variables de entorno faltantes: ${missing.join(', ')}\nRevisa tu archivo .env.development`
        );
    }
    console.log('🗺️ Configuración QGIS Server:', {
        url:           config.qgisServer.url,
        vectorProject: config.qgisServer.vectorProject,
        wmsUrl:        config.qgisServer.wmsUrl,
        wfsUrl:        config.qgisServer.wfsUrl,
    });
    console.log('🔗 API URL:', config.apiUrl);
}

export default config;