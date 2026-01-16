/**
 * @fileoverview Servicio para consultar valores de capas ráster
 * @module services/rasterService
 */

import { config, logger } from '../config/env';

/**
 * Clase para manejar consultas de ráster via WMS GetFeatureInfo
 */
class RasterService {
    constructor() {
        this.baseUrl = config.geoserver.wmsUrl;
        this.workspace = config.geoserver.workspace;
    }

    /**
     * Obtiene el valor de un píxel en una capa ráster
     * 
     * @param {string} layerName - Nombre de la capa ráster
     * @param {Object} params - Parámetros de la consulta
     * @param {Array<number>} params.latlng - [lat, lng] donde se hizo clic
     * @param {Array<number>} params.bbox - [minX, minY, maxX, maxY] del mapa visible
     * @param {number} params.width - Ancho del mapa en píxeles
     * @param {number} params.height - Alto del mapa en píxeles
     * @param {Array<number>} params.clickPoint - [x, y] coordenadas del clic en píxeles
     * @param {string} params.srs - Sistema de referencia (default: EPSG:4326)
     * @returns {Promise<Object>} Información del píxel
     */
    async getPixelValue(layerName, params) {
        try {
            const {
                bbox,
                width,
                height,
                clickPoint,
                srs = 'EPSG:4326'
            } = params;

            // Construir parámetros GetFeatureInfo
            const requestParams = new URLSearchParams({
                SERVICE: 'WMS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeatureInfo',
                LAYERS: `${this.workspace}:${layerName}`,
                QUERY_LAYERS: `${this.workspace}:${layerName}`,
                STYLES: '',
                BBOX: bbox.join(','),
                WIDTH: width,
                HEIGHT: height,
                FORMAT: 'image/png',
                INFO_FORMAT: 'application/json',
                SRS: srs,
                X: Math.floor(clickPoint[0]),
                Y: Math.floor(clickPoint[1]),
                FEATURE_COUNT: 1
            });

            const url = `${this.baseUrl}?${requestParams.toString()}`;
            
            logger.debug('GetFeatureInfo request:', url);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Error GetFeatureInfo: ${response.status}`);
            }

            const data = await response.json();

            logger.debug('Pixel value response:', data);

            return this.parseRasterResponse(data, layerName);

        } catch (error) {
            logger.error('Error en getPixelValue:', error);
            throw error;
        }
    }

    /**
     * Parsea la respuesta de GetFeatureInfo
     * 
     * @param {Object} data - Respuesta JSON de GeoServer
     * @param {string} layerName - Nombre de la capa
     * @returns {Object} Datos parseados del píxel
     */
    parseRasterResponse(data, layerName) {
        if (!data.features || data.features.length === 0) {
            return {
                layerName,
                value: null,
                message: 'No hay datos en esta ubicación'
            };
        }

        const feature = data.features[0];
        const properties = feature.properties;

        // El valor del ráster suele venir en una propiedad llamada GRAY_INDEX, value, o el nombre de la banda
        const rasterValue = properties.GRAY_INDEX || 
                           properties.value || 
                           properties.band_1 || 
                           properties[Object.keys(properties)[0]];

        return {
            layerName,
            value: rasterValue,
            rawProperties: properties,
            coordinates: feature.geometry?.coordinates || null
        };
    }

    /**
     * Obtiene información de múltiples capas ráster en un punto
     * 
     * @param {Array<string>} layerNames - Nombres de las capas
     * @param {Object} params - Parámetros de la consulta
     * @returns {Promise<Array<Object>>} Array con valores de cada capa
     */
    async getMultiplePixelValues(layerNames, params) {
        try {
            const promises = layerNames.map(layerName => 
                this.getPixelValue(layerName, params)
            );

            const results = await Promise.allSettled(promises);

            return results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    logger.error(`Error en capa ${layerNames[index]}:`, result.reason);
                    return {
                        layerName: layerNames[index],
                        value: null,
                        error: result.reason.message
                    };
                }
            });

        } catch (error) {
            logger.error('Error en getMultiplePixelValues:', error);
            throw error;
        }
    }

    /**
     * Obtiene el rango de valores de una capa ráster
     * 
     * @param {string} layerName - Nombre de la capa
     * @returns {Promise<Object>} Rango de valores {min, max}
     */
    async getRasterStats(layerName) {
        try {
            // Esto requiere una consulta SQL directa a PostGIS
            // Por ahora, retornamos null - implementar si es necesario
            logger.warn('getRasterStats no implementado - requiere acceso directo a PostGIS');
            return null;
        } catch (error) {
            logger.error('Error en getRasterStats:', error);
            throw error;
        }
    }
}

// Exportar instancia única
export const rasterService = new RasterService();

// Exportar clase
export default RasterService;