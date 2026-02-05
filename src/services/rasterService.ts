/**
 * @fileoverview Servicio para consultar valores de capas ráster (con soporte para mosaicos TIME)
 * @module services/rasterService
 */

import { config, logger } from '../config/env';

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

/**
 * Clase para manejar consultas de ráster via WMS GetFeatureInfo
 */
class RasterService {
    private baseUrl: string;
    private workspace: string;

    constructor() {
        this.baseUrl = config.geoserver.wmsUrl;
        this.workspace = config.geoserver.workspace;
    }

    /**
     * Obtiene el valor de un píxel en una capa ráster
     * 
     * @param layerName - Nombre de la capa ráster
     * @param params - Parámetros de la consulta
     * @returns Información del píxel
     */
    async getPixelValue(layerName: string, params: PixelQueryParams): Promise<PixelInfo> {
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
                WIDTH: width.toString(),
                HEIGHT: height.toString(),
                FORMAT: 'image/png',
                INFO_FORMAT: 'application/json',
                SRS: srs,
                X: Math.floor(clickPoint[0]).toString(),
                Y: Math.floor(clickPoint[1]).toString(),
                FEATURE_COUNT: '1'
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
     * @param data - Respuesta JSON de GeoServer
     * @param layerName - Nombre de la capa
     * @param time - Valor TIME usado (opcional)
     * @returns Datos parseados del píxel
     */
    private parseRasterResponse(data: any, layerName: string, time: string | null = null): PixelInfo {
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
     * @param queries - Array de objetos con {layerName, params}
     * @returns Array con valores de cada capa
     */
    async getMultiplePixelValues(queries: {layerName: string, params: PixelQueryParams}[]): Promise<PixelInfo[]> {
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
                        time: queries[index].params.time || null,
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
     * Obtiene la extensión (BoundingBox) de una capa desde GetCapabilities
     * 
     * @param layerName - Nombre de la capa
     * @returns LatLngBoundsExpression o null
     */
    async getLayerExtent(layerName: string): Promise<[number, number][] | null> {
        try {
            const params = new URLSearchParams({
                SERVICE: 'WMS',
                VERSION: '1.1.1',
                REQUEST: 'GetCapabilities'
            });

            const response = await fetch(`${this.baseUrl}?${params.toString()}`);
            const xmlText = await response.text();
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            // Buscar la capa por nombre (incluyendo el workspace)
            const fullName = `${this.workspace}:${layerName}`;
            const layers = Array.from(xmlDoc.querySelectorAll('Layer > Name'));
            const targetLayerNameNode = layers.find(node => node.textContent === fullName || node.textContent === layerName);
            
            if (targetLayerNameNode && targetLayerNameNode.parentElement) {
                const layerNode = targetLayerNameNode.parentElement;
                const bboxNode = layerNode.querySelector('LatLonBoundingBox') || layerNode.querySelector('BoundingBox[SRS="EPSG:4326"]');
                
                if (bboxNode) {
                    const minx = parseFloat(bboxNode.getAttribute('minx') || '0');
                    const miny = parseFloat(bboxNode.getAttribute('miny') || '0');
                    const maxx = parseFloat(bboxNode.getAttribute('maxx') || '0');
                    const maxy = parseFloat(bboxNode.getAttribute('maxy') || '0');
                    
                    return [[miny, minx], [maxy, maxx]];
                }
            }
            return null;
        } catch (error) {
            logger.error('Error obteniendo extensión de capa:', error);
            return null;
        }
    }
}

// Exportar instancia única
export const rasterService = new RasterService();

// Exportar clase
export default RasterService;
