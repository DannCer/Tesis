/**
 * @fileoverview Servicio de raster dinámico que soporta múltiples proyectos QGIS
 * @module services/dynamicRasterService
 * 
 * Este servicio extiende la funcionalidad del RasterService original para soportar
 * múltiples proyectos QGIS. En lugar de usar siempre el mismo proyecto hardcoded,
 * construye las URLs dinámicamente según el proyecto asociado a cada grupo.
 */

import { config, logger } from '@config/env';
import type { GrupoResponse } from '@types/api';
import type { PixelInfo } from '@types/map';

export interface PixelQueryParams {
    bbox: number[];
    width: number;
    height: number;
    clickPoint: [number, number];
    srs?: string;
    time?: string | null;
    signal?: AbortSignal;
}

// PixelInfo importado desde @types/map — no se duplica aquí.

/**
 * Construye una URL de QGIS Server con el parámetro MAP incluido
 */
const buildQgisUrl = (baseUrl: string, projectPath: string): string => {
    return `${baseUrl}?MAP=${encodeURIComponent(projectPath)}`;
};

class DynamicRasterService {
    private capabilitiesCache = new Map<string, { xml: string; ts: number }>();
    private readonly capabilitiesTtlMs = 5 * 60 * 1000;
    private layerExtentCache = new Map<string, [number, number][] | null>();
    
    // Cache de mapeo grupo -> URL de proyecto
    private groupProjectMap = new Map<string, string>();

    /**
     * Actualiza el mapeo de grupos a proyectos QGIS
     * Debe llamarse cuando se cargan los grupos desde la API
     */
    updateGroupProjectMapping(grupos: GrupoResponse[]): void {
        this.groupProjectMap.clear();
        grupos.forEach(grupo => {
            if (grupo.url_proyecto) {
                this.groupProjectMap.set(grupo.nombre, grupo.url_proyecto);
                logger.debug(`[Raster] Grupo "${grupo.nombre}" -> Proyecto: ${grupo.url_proyecto}`);
            }
        });
        logger.log(`[Raster] Mapeo de proyectos actualizado: ${this.groupProjectMap.size} grupos`);
    }

    /**
     * Obtiene la URL del proyecto QGIS para un grupo específico
     * Si no se encuentra, usa el proyecto por defecto
     */
    private getProjectUrlForGroup(groupName: string): string {
        const projectPath = this.groupProjectMap.get(groupName);
        
        if (!projectPath) {
            logger.warn(`[Raster] No se encontró proyecto para el grupo "${groupName}", usando proyecto por defecto`);
            return config.qgisServer.wmsRasterUrl; // Fallback al proyecto por defecto
        }

        // Construir la URL completa con MAP=
        const baseUrl = config.qgisServer.url;
        return buildQgisUrl(baseUrl, projectPath);
    }

    /**
     * Obtiene el valor de píxel de una capa raster en un punto específico
     * @param layerName Nombre de la capa
     * @param groupName Nombre del grupo al que pertenece la capa
     * @param params Parámetros de la consulta
     */
    async getPixelValue(
        layerName: string,
        groupName: string,
        params: PixelQueryParams
    ): Promise<PixelInfo> {
        try {
            const {
                bbox,
                width,
                height,
                clickPoint,
                srs  = 'EPSG:4326',
                time = null,
                signal,
            } = params;

            // Obtener la URL del proyecto correcto para este grupo
            const baseUrl = this.getProjectUrlForGroup(groupName);

            const requestParams = new URLSearchParams({
                SERVICE:      'WMS',
                VERSION:      '1.1.1',
                REQUEST:      'GetFeatureInfo',
                LAYERS:       layerName,
                QUERY_LAYERS: layerName,
                STYLES:       '',
                BBOX:         bbox.join(','),
                WIDTH:        width.toString(),
                HEIGHT:       height.toString(),
                FORMAT:       'image/png',
                INFO_FORMAT:  'application/json',
                SRS:          srs,
                X:            Math.floor(clickPoint[0]).toString(),
                Y:            Math.floor(clickPoint[1]).toString(),
                FEATURE_COUNT: '1',
            });

            if (time) {
                requestParams.append('TIME', time);
                logger.debug(`[Raster] GetFeatureInfo con TIME=${time}`);
            }

            const url = `${baseUrl}&${requestParams.toString()}`;
            logger.debug(`[Raster] GetFeatureInfo Request [${groupName}]:`, url);

            const response = await fetch(url, { signal });
            if (!response.ok) throw new Error(`Error GetFeatureInfo: ${response.status}`);

            const data = await response.json();
            return this.parseRasterResponse(data, layerName, time);

        } catch (error: unknown) {
            logger.error('[Raster] Error en getPixelValue:', error);
            throw error;
        }
    }

    private parseRasterResponse(data: GeoJSON.FeatureCollection, layerName: string, time: string | null = null): PixelInfo {
        if (!data.features || data.features.length === 0) {
            return { layerName, time, value: null, message: 'No hay datos en esta ubicación' };
        }

        const feature    = data.features[0];
        const properties = feature.properties ?? {};

        let rasterValue = properties[layerName];

        if (rasterValue === undefined) {
            const key = Object.keys(properties).find(k => k.toLowerCase() === layerName.toLowerCase());
            if (key) rasterValue = properties[key];
        }

        if (rasterValue === undefined) {
            rasterValue = properties.GRAY_INDEX ??
                          properties.value      ??
                          properties.band_1     ??
                          properties.Band1;
        }

        if (rasterValue === undefined) {
            rasterValue = Object.values(properties).find(v => typeof v === 'number')
                          ?? Object.values(properties)[0];
        }

        const formattedValue =
            typeof rasterValue === 'number' && !Number.isInteger(rasterValue)
                ? parseFloat(rasterValue.toFixed(4))
                : rasterValue;

        return {
            layerName,
            time,
            value:         formattedValue as number | string | null,
            rawProperties: properties as Record<string, string | number | boolean | null>,
            coordinates:   (feature.geometry as GeoJSON.Point | null)?.coordinates?.slice(0, 2) as [number, number] | undefined,
        };
    }

    /**
     * Obtiene valores de píxel de múltiples capas simultáneamente
     */
    async getMultiplePixelValues(
        queries: { layerName: string; groupName: string; params: PixelQueryParams }[]
    ): Promise<PixelInfo[]> {
        const results = await Promise.allSettled(
            queries.map(q => this.getPixelValue(q.layerName, q.groupName, q.params))
        );
        return results.map((result, i) => {
            if (result.status === 'fulfilled') return result.value;
            logger.error(`[Raster] Error en consulta ${i}:`, result.reason);
            return {
                layerName: queries[i].layerName,
                time:      queries[i].params.time ?? null,
                value:     null,
                error:     result.reason.message,
            };
        });
    }

    /**
     * Obtiene la extensión de una capa raster desde WMS GetCapabilities
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

            const layers = Array.from(xmlDoc.querySelectorAll('Layer > Name'));
            const node   = layers.find(n => n.textContent === layerName);

            if (node?.parentElement) {
                const bbox = node.parentElement.querySelector('LatLonBoundingBox') ??
                             node.parentElement.querySelector('BoundingBox[SRS="EPSG:4326"]');
                if (bbox) {
                    const extent: [number, number][] = [
                        [parseFloat(bbox.getAttribute('miny') ?? '0'), parseFloat(bbox.getAttribute('minx') ?? '0')],
                        [parseFloat(bbox.getAttribute('maxy') ?? '0'), parseFloat(bbox.getAttribute('maxx') ?? '0')],
                    ];
                    this.layerExtentCache.set(cacheKey, extent);
                    return extent;
                }
            }
            
            this.layerExtentCache.set(cacheKey, null);
            return null;
        } catch (error) {
            logger.error('[Raster] Error obteniendo extensión:', error);
            return null;
        }
    }

    /**
     * Obtiene capacidades WMS de un proyecto específico
     */
    async getCapabilities(groupName: string): Promise<string> {
        try {
            const now = Date.now();
            const cached = this.capabilitiesCache.get(groupName);
            
            if (cached && (now - cached.ts) < this.capabilitiesTtlMs) {
                return cached.xml;
            }

            const baseUrl = this.getProjectUrlForGroup(groupName);
            const url = `${baseUrl}&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`;
            
            logger.debug(`[Raster] GetCapabilities [${groupName}]:`, url);
            
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error GetCapabilities: ${response.status}`);
            
            const xml = await response.text();
            this.capabilitiesCache.set(groupName, { xml, ts: now });
            return xml;
        } catch (error) {
            logger.error('[Raster] Error en getCapabilities:', error);
            throw error;
        }
    }

    /**
     * Construye una URL WMS para usar en Leaflet TileLayer
     */
    getWmsUrl(groupName: string): string {
        return this.getProjectUrlForGroup(groupName);
    }

    /**
     * Limpia los caches (útil cuando se actualizan los proyectos)
     */
    clearCaches(): void {
        this.capabilitiesCache.clear();
        this.layerExtentCache.clear();
        logger.log('[Raster] Caches limpiados');
    }
}

export const dynamicRasterService = new DynamicRasterService();
export default DynamicRasterService;
