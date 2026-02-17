/**
 * @fileoverview Servicio para peticiones WFS a GeoServer
 * @module services/wfsService
 */

import { config, logger } from '../config/env';

export interface WFSOptions {
    maxFeatures?: number;
    cql_filter?: string | null;
    propertyName?: string | null;
    srsName?: string;
}

/**
 * Clase para manejar peticiones WFS a GeoServer
 */
class WFSService {
    private baseUrl: string;
    private workspace: string;
    private timeout: number;
    private maxFeatures: number;

    constructor() {
        this.baseUrl = config.geoserver.wfsUrl;
        this.workspace = config.geoserver.workspace;
        this.timeout = config.geoserver.timeout;
        this.maxFeatures = config.geoserver.maxFeatures;
    }

    /**
     * Realiza una petición GetFeature a GeoServer
     */
    async getFeatures(layerName: string, options: WFSOptions = {}): Promise<any> {
        try {
            const {
                maxFeatures = this.maxFeatures,
                cql_filter = null,
                propertyName = null,
                srsName = 'EPSG:4326'
            } = options;

            // Construir parámetros - IMPORTANTE: usar el formato JSON correcto para GeoServer
            const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',  // Versión 1.0.0 es más compatible
                request: 'GetFeature',
                typeName: `${this.workspace}:${layerName}`,
                outputFormat: 'application/json',  // Formato JSON explícito
                maxFeatures: maxFeatures.toString(),
                srsName: srsName
            });

            // Agregar filtro CQL si existe
            if (cql_filter) {
                params.append('cql_filter', cql_filter);
            }

            // Agregar propiedades específicas si existen
            if (propertyName) {
                params.append('propertyName', propertyName);
            }

            const url = `${this.baseUrl}?${params.toString()}`;
            
            logger.debug('Petición WFS:', url);

            // Realizar petición con timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: {
                    'Accept': 'application/json'
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Error WFS Response:', errorText);
                throw new Error(`Error WFS: ${response.status} ${response.statusText}`);
            }

            // Verificar que el contenido sea JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                logger.error('Respuesta no es JSON:', text.substring(0, 200));
                throw new Error('El servidor no devolvió un JSON válido. Revisa la configuración de la capa.');
            }

            const data = await response.json();

            logger.debug(`Features obtenidos de ${layerName}:`, data.features?.length || 0);

            return data;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                logger.error('Timeout en petición WFS:', layerName);
                throw new Error('La petición tardó demasiado tiempo');
            }
            logger.error('Error en getFeatures:', error);
            throw error;
        }
    }

    /**
     * Obtiene las capacidades del servicio WFS (GetCapabilities)
     */
    async getCapabilities(): Promise<string> {
        try {
            const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',
                request: 'GetCapabilities'
            });

            const url = `${this.baseUrl}?${params.toString()}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Error GetCapabilities: ${response.status}`);
            }

            const text = await response.text();
            return text; // Retorna XML

        } catch (error) {
            logger.error('Error en getCapabilities:', error);
            throw error;
        }
    }

    /**
     * Obtiene información de una feature específica por ID
     */
    async getFeatureById(layerName: string, featureId: string): Promise<any> {
        try {
            const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',
                request: 'GetFeature',
                typeName: `${this.workspace}:${layerName}`,
                featureID: featureId,
                outputFormat: 'application/json'
            });

            const url = `${this.baseUrl}?${params.toString()}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Error al obtener feature ${featureId}`);
            }

            const data = await response.json();
            return data.features[0] || null;

        } catch (error) {
            logger.error('Error en getFeatureById:', error);
            throw error;
        }
    }

    /**
     * Obtiene features dentro de un bounding box
     */
    async getFeaturesByBBox(layerName: string, bbox: number[], srsName: string = 'EPSG:4326'): Promise<any> {
        try {
            const bboxString = bbox.join(',');
            
            const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',
                request: 'GetFeature',
                typeName: `${this.workspace}:${layerName}`,
                outputFormat: 'application/json',
                srsName: srsName,
                bbox: `${bboxString},${srsName}`
            });

            const url = `${this.baseUrl}?${params.toString()}`;
            const response = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Error en petición bbox: ${response.status}`);
            }

            const data = await response.json();
            return data;

        } catch (error) {
            logger.error('Error en getFeaturesByBBox:', error);
            throw error;
        }
    }

    /**
     * Obtiene valores únicos de un campo específico
     */
    async getUniqueValues(layerName: string, fieldName: string): Promise<any[]> {
        try {
            const data = await this.getFeatures(layerName, {
                propertyName: fieldName,
                maxFeatures: 10000
            });

            // Extraer valores únicos
            const uniqueValues = new Set<any>();
            data.features.forEach((feature: any) => {
                const value = feature.properties[fieldName];
                if (value !== null && value !== undefined) {
                    uniqueValues.add(value);
                }
            });

            return Array.from(uniqueValues).sort();

        } catch (error) {
            logger.error('Error en getUniqueValues:', error);
            throw error;
        }
    }

    /**
     * Cuenta el número total de features en una capa
     */
    async getFeatureCount(layerName: string, cql_filter: string | null = null): Promise<number> {
        try {
            const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',
                request: 'GetFeature',
                typeName: `${this.workspace}:${layerName}`,
                resultType: 'hits'
            });

            if (cql_filter) {
                params.append('cql_filter', cql_filter);
            }

            const url = `${this.baseUrl}?${params.toString()}`;
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`Error al contar features: ${response.status}`);
            }

            const data = await response.json();
            return data.totalFeatures || data.numberMatched || 0;

        } catch (error) {
            logger.error('Error en getFeatureCount:', error);
            throw error;
        }
    }

    /**
     * Realiza una consulta con múltiples filtros
     */
    async getFeaturesByFilters(layerName: string, filters: Record<string, any>): Promise<any> {
        try {
            // Construir filtro CQL desde objeto
            const cqlParts: string[] = [];
            
            Object.entries(filters).forEach(([field, value]) => {
                if (typeof value === 'string') {
                    cqlParts.push(`${field} = '${value}'`);
                } else if (Array.isArray(value)) {
                    const values = value.map(v => `'${v}'`).join(',');
                    cqlParts.push(`${field} IN (${values})`);
                } else {
                    cqlParts.push(`${field} = ${value}`);
                }
            });

            const cql_filter = cqlParts.join(' AND ');

            return await this.getFeatures(layerName, { cql_filter });

        } catch (error) {
            logger.error('Error en getFeaturesByFilters:', error);
            throw error;
        }
    }

    /**
     * Obtiene la extensión (BoundingBox) de una capa WFS desde GetCapabilities
     * 
     * @param layerName - Nombre de la capa
     * @returns LatLngBoundsExpression o null
     */
    async getLayerExtent(layerName: string): Promise<[number, number][] | null> {
        try {
            const params = new URLSearchParams({
                service: 'WFS',
                version: '1.0.0',
                request: 'GetCapabilities'
            });

            const response = await fetch(`${this.baseUrl}?${params.toString()}`);
            const xmlText = await response.text();
            
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");
            
            // En WFS 1.0.0, las capas están en FeatureType
            const featureTypes = Array.from(xmlDoc.querySelectorAll('FeatureType'));
            const fullName = `${this.workspace}:${layerName}`;
            
            const targetFeatureType = featureTypes.find(ft => {
                const nameNode = ft.querySelector('Name');
                return nameNode?.textContent === fullName || nameNode?.textContent === layerName;
            });
            
            if (targetFeatureType) {
                const bboxNode = targetFeatureType.querySelector('LatLongBoundingBox');
                if (bboxNode) {
                    const minx = parseFloat(bboxNode.getAttribute('minx') || '0');
                    const miny = parseFloat(bboxNode.getAttribute('miny') || '0');
                    const maxx = parseFloat(bboxNode.getAttribute('maxx') || '0');
                    const maxy = parseFloat(bboxNode.getAttribute('maxy') || '0');
                    
                    // Leaflet usa [lat, lng] -> [y, x]
                    return [[miny, minx], [maxy, maxx]];
                }
            }
            return null;
        } catch (error) {
            logger.error('Error obteniendo extensión de capa WFS:', error);
            return null;
        }
    }
}

// Exportar instancia única (singleton)
export const wfsService = new WFSService();

// Exportar también la clase
export default WFSService;
