/**
 * @fileoverview Servicio para consultar valores de capas ráster (con soporte para mosaicos TIME)
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
     * @param {string} params.time - Parámetro TIME para mosaicos (opcional)
     * @returns {Promise<Object>} Información del píxel
     */
    async getPixelValue(layerName, params) {
        try {
            const {
                bbox,
                width,
                height,
                clickPoint,
                srs = 'EPSG:4326',
                time = null
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

            // Añadir parámetro TIME si existe (para mosaicos)
            if (time) {
                requestParams.append('TIME', time);
                logger.debug(`Consultando píxel con TIME=${time}`);
            }

            const url = `${this.baseUrl}?${requestParams.toString()}`;
            
            logger.debug('GetFeatureInfo request:', url);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Error GetFeatureInfo: ${response.status}`);
            }

            const data = await response.json();

            logger.debug('Pixel value response:', data);

            return this.parseRasterResponse(data, layerName, time);

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
     * @param {string} time - Valor TIME usado (opcional)
     * @returns {Object} Datos parseados del píxel
     */
    parseRasterResponse(data, layerName, time = null) {
        if (!data.features || data.features.length === 0) {
            return {
                layerName,
                time,
                value: null,
                message: 'No hay datos en esta ubicación'
            };
        }

        const feature = data.features[0];
        const properties = feature.properties;

        // ESTRATEGIA DE EXTRACCIÓN PARA MOSAICOS:
        
        // 1. Intenta encontrar una propiedad que coincida exactamente con el nombre de la capa
        // (Comportamiento por defecto de ImageMosaic)
        let rasterValue = properties[layerName];

        // 2. Si no existe, intenta buscar ignorando mayúsculas/minúsculas
        if (rasterValue === undefined) {
            const keyMatch = Object.keys(properties).find(
                key => key.toLowerCase() === layerName.toLowerCase()
            );
            if (keyMatch) rasterValue = properties[keyMatch];
        }

        // 3. Fallbacks estándar para capas simples (GeoTIFF único)
        if (rasterValue === undefined) {
            rasterValue = properties.GRAY_INDEX ?? 
                          properties.value ?? 
                          properties.band_1 ??
                          properties.Band1; // A veces GeoServer usa Band1
        }

        // 4. Último recurso: buscar el primer valor numérico disponible
        // (Evita tomar strings como nombres de archivo o IDs del mosaico)
        if (rasterValue === undefined) {
            const numericValue = Object.values(properties).find(val => typeof val === 'number');
            if (numericValue !== undefined) {
                rasterValue = numericValue;
            } else {
                // Si todo falla, tomamos el primero como tenías antes
                rasterValue = properties[Object.keys(properties)[0]];
            }
        }

        // Formateo del valor (opcional: limitar decimales si es float)
        const formattedValue = (typeof rasterValue === 'number' && !Number.isInteger(rasterValue))
            ? parseFloat(rasterValue.toFixed(4)) // Ajusta la precisión según necesites
            : rasterValue;

        return {
            layerName,
            time,
            value: formattedValue,
            rawProperties: properties, // Mantenemos esto para depuración
            coordinates: feature.geometry?.coordinates || null
        };
    }

    /**
     * Obtiene información de múltiples capas ráster en un punto
     * 
     * @param {Array<Object>} queries - Array de objetos con {layerName, params}
     * @returns {Promise<Array<Object>>} Array con valores de cada capa
     */
    async getMultiplePixelValues(queries) {
        try {
            const promises = queries.map(query => 
                this.getPixelValue(query.layerName, query.params)
            );

            const results = await Promise.allSettled(promises);

            return results.map((result, index) => {
                if (result.status === 'fulfilled') {
                    return result.value;
                } else {
                    logger.error(`Error en consulta ${index}:`, result.reason);
                    return {
                        layerName: queries[index].layerName,
                        time: queries[index].params.time,
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
