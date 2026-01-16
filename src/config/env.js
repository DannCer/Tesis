/**
 * @fileoverview Configuración centralizada de la aplicación.
 * @module config/env
 */

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

const getEnv = (key, defaultValue = '') => {
    return import.meta.env[`VITE_${key}`] ?? defaultValue;
};

const getEnvNumber = (key, defaultValue) => {
    const value = import.meta.env[`VITE_${key}`];
    if (value === undefined || value === '') return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
};

const getEnvBoolean = (key, defaultValue) => {
    const value = import.meta.env[`VITE_${key}`];
    if (value === undefined || value === '') return defaultValue;
    return value === 'true' || value === '1';
};

// ============================================================================
// CONFIGURACIÓN PRINCIPAL
// ============================================================================

export const config = {
    // GeoServer
    geoserver: {
        url: getEnv('GEOSERVER_URL', 'http://localhost:8080'),
        workspace: getEnv('GEOSERVER_WORKSPACE', 'Tesis'),
        timeout: getEnvNumber('WFS_TIMEOUT', 30000),
        maxFeatures: getEnvNumber('MAX_FEATURES', 5000),

        get wfsUrl() {
            return `${this.url}/geoserver/${this.workspace}/wfs`;
        },
        
        get wmsUrl() {
            return `${this.url}/geoserver/${this.workspace}/wms`;
        },
    },

    // Configuración del mapa
    map: {
        // Centro en México
        center: [
            getEnvNumber('MAP_CENTER_LAT', 23.5),
            getEnvNumber('MAP_CENTER_LNG', -102.5),
        ],
        zoom: getEnvNumber('MAP_ZOOM', 5.5),
        minZoom: getEnvNumber('MAP_MIN_ZOOM', 5),
        maxZoom: getEnvNumber('MAP_MAX_ZOOM', 18),
        
        // Límites de México
        maxBounds: [
            [33, -86],      // Noreste
            [14, -120],     // Suroeste
        ],
        
        maxBoundsViscosity: 0.7,
        zoomDelta: 0.5,
        zoomSnap: 0.5,
    },

    // Configuración de la app
    app: {
        name: getEnv('APP_NAME', 'Geovisor - Monitoreo de Uso de Suelo'),
        version: getEnv('APP_VERSION', '1.0.0'),
        debug: getEnvBoolean('DEBUG_MODE', import.meta.env.DEV),
    },

    isDevelopment: import.meta.env.DEV,
    isProduction: import.meta.env.PROD,
    mode: import.meta.env.MODE,
};

// ============================================================================
// CAPAS BASE
// ============================================================================

export const BASE_LAYERS = {
    ESTADO: `${config.geoserver.workspace}:limite_estado`,
    MUNICIPIOS: `${config.geoserver.workspace}:municipios`,
};

// ============================================================================
// LOGGER
// ============================================================================

export const logger = {
    log: (...args) => {
        if (config.app.debug) {
            console.log(`[${config.app.name}]`, ...args);
        }
    },
    
    warn: (...args) => {
        if (config.app.debug) {
            console.warn(`[${config.app.name}]`, ...args);
        }
    },
    
    error: (...args) => {
        console.error(`[${config.app.name}]`, ...args);
    },
    
    debug: (...args) => {
        if (config.app.debug && config.isDevelopment) {
            console.debug(`[${config.app.name} DEBUG]`, ...args);
        }
    },
};

// Validación en desarrollo
if (config.isDevelopment) {
    const requiredVars = ['GEOSERVER_URL', 'GEOSERVER_WORKSPACE'];
    const missing = requiredVars.filter(key => !import.meta.env[`VITE_${key}`]);

    if (missing.length > 0) {
        console.warn(
            `⚠️ Variables de entorno faltantes: ${missing.join(', ')}\n` +
            `Usando valores por defecto. Crea un archivo .env basado en .env.example`
        );
    }

    // Log de configuración en desarrollo
    console.log('🔧 Configuración de GeoServer:', {
        url: config.geoserver.url,
        workspace: config.geoserver.workspace,
        wfsUrl: config.geoserver.wfsUrl,
        wmsUrl: config.geoserver.wmsUrl
    });
}

export default config;