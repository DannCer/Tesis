/**
 * @fileoverview Servicio WFS dinámico que soporta múltiples proyectos QGIS
 * @module services/dynamicWfsService
 * 
 * Este servicio extiende la funcionalidad del WFSService original para soportar
 * múltiples proyectos QGIS. En lugar de usar siempre el mismo proyecto hardcoded,
 * construye las URLs dinámicamente según el proyecto asociado a cada grupo.
 */

import { config, logger } from '@config/env';
import type { GrupoResponse } from '@types/api';
import type { WFSOptions } from '@types/map';

/**
 * Construye una URL de QGIS Server con el parámetro MAP incluido
 */
const buildQgisUrl = (baseUrl: string, projectPath: string): string => {
    return `${baseUrl}?MAP=${encodeURIComponent(projectPath)}`;
};

class DynamicWFSService {
    private timeout: number;
    private maxFeatures: number;
    private capabilitiesCache = new Map<string, { xml: string; ts: number }>();
    private readonly capabilitiesTtlMs = 5 * 60 * 1000;
    private layerExtentCache = new Map<string, [number, number][] | null>();
    
    // Cache de mapeo grupo -> URL de proyecto
    private groupProjectMap = new Map<string, string>();

    constructor() {
        this.timeout = config.qgisServer.timeout;
        this.maxFeatures = config.qgisServer.maxFeatures;
    }

    /**
     * Actualiza el mapeo de grupos a proyectos QGIS
     * Debe llamarse cuando se cargan los grupos desde la API
     */
    updateGroupProjectMapping(grupos: GrupoResponse[]): void {
        this.groupProjectMap.clear();
        grupos.forEach(grupo => {
            if (grupo.url_proyecto) {
                this.groupProjectMap.set(grupo.nombre, grupo.url_proyecto);
                logger.debug(`Grupo "${grupo.nombre}" -> Proyecto: ${grupo.url_proyecto}`);
            }
        });
        logger.log(`Mapeo de proyectos actualizado: ${this.groupProjectMap.size} grupos`);
    }

    /**
     * Obtiene la URL del proyecto QGIS para un grupo específico
     * Si no se encuentra, usa el proyecto por defecto
     */
    private getProjectUrlForGroup(groupName: string): string {
        const projectPath = this.groupProjectMap.get(groupName);
        
        if (!projectPath) {
            logger.warn(`No se encontró proyecto para el grupo "${groupName}", usando proyecto por defecto`);
            return config.qgisServer.wfsUrl; // Fallback al proyecto por defecto
        }

        // Construir la URL completa con MAP=
        const baseUrl = config.qgisServer.url;
        return buildQgisUrl(baseUrl, projectPath);
    }

    /**
     * Realiza una petición GetFeature a QGIS Server usando el proyecto correcto
     * @param layerName Nombre de la capa
     * @param groupName Nombre del grupo al que pertenece la capa
     * @param options Opciones adicionales de WFS
     */
    async getFeatures(
        layerName: string,
        groupName: string,
        options: WFSOptions = {}
    ): Promise<any> {
        try {
            const {
                maxFeatures = this.maxFeatures,
                cql_filter = null,
                propertyName = null,
                srsName = 'EPSG:4326',
            } = options;

            // Obtener la URL del proyecto correcto para este grupo
            const baseUrl = this.getProjectUrlForGroup(groupName);

            // Construir parámetros WFS
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                outputFormat: 'application/vnd.geo+json',
                srsName,
            });
            // Solo mandar maxFeatures si el .env lo define (> 0).
            // Si es 0, QGIS Server usa su propio límite configurado.
            if (maxFeatures > 0) params.set('maxFeatures', maxFeatures.toString());

            if (cql_filter) params.append('CQL_FILTER', cql_filter);
            if (propertyName) params.append('PROPERTYNAME', propertyName);

            // Combinar URL base (que ya tiene ?) con los nuevos parámetros
            const url = `${baseUrl}&${params.toString()}`;
            logger.debug(`WFS Request [${groupName}]:`, url);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('Error WFS Response:', errorText);
                throw new Error(`Error WFS: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') ?? '';
            if (!contentType.includes('json') && !contentType.includes('text/plain')) {
                const text = await response.text();
                logger.error('Respuesta inesperada:', text.substring(0, 300));
                throw new Error('QGIS Server no devolvió JSON. Verifica que la capa esté publicada como WFS.');
            }

            const data = await response.json();
            logger.debug(`Features de "${layerName}" [${groupName}]:`, data.features?.length ?? 0);
            return data;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('La petición tardó demasiado tiempo');
            }
            logger.error('Error en getFeatures:', error);
            throw error;
        }
    }

    /**
     * Obtiene capacidades WFS de un proyecto específico
     */
    async getCapabilities(groupName: string): Promise<string> {
        try {
            const now = Date.now();
            const cached = this.capabilitiesCache.get(groupName);
            
            if (cached && (now - cached.ts) < this.capabilitiesTtlMs) {
                return cached.xml;
            }

            const baseUrl = this.getProjectUrlForGroup(groupName);
            const url = `${baseUrl}&SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities`;
            
            logger.debug(`GetCapabilities [${groupName}]:`, url);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error GetCapabilities: ${response.status}`);
            
            const xml = await response.text();
            this.capabilitiesCache.set(groupName, { xml, ts: now });
            return xml;
        } catch (error) {
            logger.error('Error en getCapabilities:', error);
            throw error;
        }
    }

    /**
     * Obtiene un feature por ID
     */
    async getFeatureById(
        layerName: string,
        groupName: string,
        featureId: string
    ): Promise<any> {
        try {
            const baseUrl = this.getProjectUrlForGroup(groupName);
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                FEATUREID: featureId,
                outputFormat: 'application/vnd.geo+json',
            });
            
            const url = `${baseUrl}&${params.toString()}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            
            if (!response.ok) throw new Error(`Error al obtener feature ${featureId}`);
            
            const data = await response.json();
            return data.features[0] ?? null;
        } catch (error) {
            logger.error('Error en getFeatureById:', error);
            throw error;
        }
    }

    /**
     * Obtiene features dentro de un BoundingBox
     */
    async getFeaturesByBBox(
        layerName: string,
        groupName: string,
        bbox: number[],
        srsName: string = 'EPSG:4326'
    ): Promise<any> {
        try {
            const baseUrl = this.getProjectUrlForGroup(groupName);
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                outputFormat: 'application/vnd.geo+json',
                srsName,
                BBOX: `${bbox.join(',')},${srsName}`,
            });
            
            const url = `${baseUrl}&${params.toString()}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            
            if (!response.ok) throw new Error(`Error bbox: ${response.status}`);
            return response.json();
        } catch (error) {
            logger.error('Error en getFeaturesByBBox:', error);
            throw error;
        }
    }

    /**
     * Obtiene valores únicos de un campo
     */
    async getUniqueValues(
        layerName: string,
        groupName: string,
        fieldName: string
    ): Promise<any[]> {
        try {
            const data = await this.getFeatures(layerName, groupName, {
                propertyName: fieldName,
                maxFeatures: this.maxFeatures,
            });
            
            const unique = new Set<any>();
            data.features.forEach((f: any) => {
                const v = f.properties[fieldName];
                if (v !== null && v !== undefined) unique.add(v);
            });
            
            return Array.from(unique).sort();
        } catch (error) {
            logger.error('Error en getUniqueValues:', error);
            throw error;
        }
    }

    /**
     * Cuenta features
     */
    async getFeatureCount(
        layerName: string,
        groupName: string,
        cql_filter: string | null = null
    ): Promise<number> {
        try {
            const baseUrl = this.getProjectUrlForGroup(groupName);
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                resultType: 'hits',
            });
            
            if (cql_filter) params.append('CQL_FILTER', cql_filter);
            
            const url = `${baseUrl}&${params.toString()}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error(`Error al contar: ${response.status}`);
            
            const data = await response.json();
            return data.totalFeatures ?? data.numberMatched ?? 0;
        } catch (error) {
            logger.error('Error en getFeatureCount:', error);
            throw error;
        }
    }

    /**
     * Filtros múltiples con CQL
     */
    async getFeaturesByFilters(
        layerName: string,
        groupName: string,
        filters: Record<string, any>
    ): Promise<any> {
        const cqlParts = Object.entries(filters).map(([field, value]) => {
            if (typeof value === 'string') return `${field} = '${value}'`;
            if (Array.isArray(value)) return `${field} IN (${value.map(v => `'${v}'`).join(',')})`;
            return `${field} = ${value}`;
        });
        
        return this.getFeatures(layerName, groupName, {
            cql_filter: cqlParts.join(' AND '),
        });
    }

    /**
     * Obtiene la extensión de una capa desde WFS GetCapabilities
     */
    async getLayerExtent(
        layerName: string,
        groupName: string
    ): Promise<[number, number][] | null> {
        try {
            const cacheKey = `${groupName}:${layerName}`;
            
            if (this.layerExtentCache.has(cacheKey)) {
                return this.layerExtentCache.get(cacheKey) ?? null;
            }

            const capXml = await this.getCapabilities(groupName);
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(capXml, 'text/xml');

            const featureTypes = Array.from(xmlDoc.querySelectorAll('FeatureType'));
            const target = featureTypes.find(ft => {
                const name = ft.querySelector('Name')?.textContent ?? '';
                return name === layerName || name.endsWith(`:${layerName}`);
            });

            if (target) {
                const bbox = target.querySelector('WGS84BoundingBox') ??
                    target.querySelector('LatLongBoundingBox');
                    
                if (bbox) {
                    // WFS 1.1: LowerCorner / UpperCorner en "lon lat"
                    const lower = bbox.querySelector('LowerCorner')?.textContent?.trim().split(' ');
                    const upper = bbox.querySelector('UpperCorner')?.textContent?.trim().split(' ');
                    
                    if (lower && upper) {
                        const extent: [number, number][] = [
                            [parseFloat(lower[1]), parseFloat(lower[0])],
                            [parseFloat(upper[1]), parseFloat(upper[0])],
                        ];
                        this.layerExtentCache.set(cacheKey, extent);
                        return extent;
                    }
                    
                    // WFS 1.0: atributos minx, miny
                    const minx = parseFloat(bbox.getAttribute('minx') ?? '0');
                    const miny = parseFloat(bbox.getAttribute('miny') ?? '0');
                    const maxx = parseFloat(bbox.getAttribute('maxx') ?? '0');
                    const maxy = parseFloat(bbox.getAttribute('maxy') ?? '0');
                    const extent: [number, number][] = [[miny, minx], [maxy, maxx]];
                    this.layerExtentCache.set(cacheKey, extent);
                    return extent;
                }
            }
            
            this.layerExtentCache.set(cacheKey, null);
            return null;
        } catch (error) {
            logger.error('Error obteniendo extensión WFS:', error);
            return null;
        }
    }

    /**
     * Limpia los caches (útil cuando se actualizan los proyectos)
     */
    clearCaches(): void {
        this.capabilitiesCache.clear();
        this.layerExtentCache.clear();
        logger.log('Caches de WFS limpiados');
    }
}

export const dynamicWfsService = new DynamicWFSService();
export default DynamicWFSService;
