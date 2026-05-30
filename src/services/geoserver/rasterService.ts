/**
 * @fileoverview Servicio para consultas de píxel en capas ráster — QGIS Server
 * @module services/rasterService
 *
 * Diferencias con GeoServer:
 * - No hay workspace: el nombre de capa va sin prefijo
 * - La URL base incluye MAP= apuntando al proyecto .qgz ráster
 * - GetFeatureInfo devuelve JSON igual que GeoServer
 */

import { config, logger } from '@config/env';
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

class RasterService {
    private baseUrl: string;
    private capabilitiesCache: { xml: string; ts: number } | null = null;
    private readonly capabilitiesTtlMs = 5 * 60 * 1000;
    private layerExtentCache = new Map<string, [number, number][] | null>();

    constructor() {
        // URL con MAP= del proyecto ráster
        this.baseUrl = config.qgisServer.wmsRasterUrl;
    }

    async getPixelValue(layerName: string, params: PixelQueryParams): Promise<PixelInfo> {
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

            const requestParams = new URLSearchParams({
                SERVICE:      'WMS',
                VERSION:      '1.1.1',
                REQUEST:      'GetFeatureInfo',
                LAYERS:       layerName,        // sin workspace
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
                logger.debug(`GetFeatureInfo con TIME=${time}`);
            }

            const url = `${this.baseUrl}&${requestParams.toString()}`;
            logger.debug('GetFeatureInfo QGIS:', url);

            const response = await fetch(url, { signal });
            if (!response.ok) throw new Error(`Error GetFeatureInfo: ${response.status}`);

            const data = await response.json();
            return this.parseRasterResponse(data, layerName, time);

        } catch (error) {
            logger.error('Error en getPixelValue:', error);
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

    async getMultiplePixelValues(
        queries: { layerName: string; params: PixelQueryParams }[]
    ): Promise<PixelInfo[]> {
        const results = await Promise.allSettled(
            queries.map(q => this.getPixelValue(q.layerName, q.params))
        );
        return results.map((result, i) => {
            if (result.status === 'fulfilled') return result.value;
            logger.error(`Error en consulta ${i}:`, result.reason);
            return {
                layerName: queries[i].layerName,
                time:      queries[i].params.time ?? null,
                value:     null,
                error:     result.reason.message,
            };
        });
    }

    /** Extensión de capa desde WMS GetCapabilities */
    async getLayerExtent(layerName: string): Promise<[number, number][] | null> {
        try {
            if (this.layerExtentCache.has(layerName)) {
                return this.layerExtentCache.get(layerName) ?? null;
            }
            const now = Date.now();
            let xmlText: string;
            if (this.capabilitiesCache && (now - this.capabilitiesCache.ts) < this.capabilitiesTtlMs) {
                xmlText = this.capabilitiesCache.xml;
            } else {
                const url = `${this.baseUrl}&SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities`;
                const response = await fetch(url);
                xmlText = await response.text();
                this.capabilitiesCache = { xml: xmlText, ts: now };
            }
            const xmlDoc   = new DOMParser().parseFromString(xmlText, 'text/xml');

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
                    this.layerExtentCache.set(layerName, extent);
                    return extent;
                }
            }
            this.layerExtentCache.set(layerName, null);
            return null;
        } catch (error) {
            logger.error('Error obteniendo extensión ráster:', error);
            return null;
        }
    }
}

export const rasterService = new RasterService();
export default RasterService;
