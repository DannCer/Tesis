/**
 * @fileoverview Servicio para peticiones WFS a QGIS Server
 * @module services/wfsService
 *
 * Diferencias con GeoServer:
 * - No hay workspace: el typeName es solo el nombre de la capa
 * - La URL ya lleva el parámetro MAP= apuntando al proyecto .qgz
 * - Los nombres de capa pueden tener espacios y acentos (igual que en QGIS Desktop)
 */

import { config, logger } from '../config/env';

export interface WFSOptions {
    maxFeatures?: number;
    cql_filter?: string | null;
    propertyName?: string | null;
    srsName?: string;
}

class WFSService {
    private baseUrl: string;
    private timeout: number;
    private maxFeatures: number;
    private capabilitiesCache: { xml: string; ts: number } | null = null;
    private readonly capabilitiesTtlMs = 5 * 60 * 1000;
    private layerExtentCache = new Map<string, [number, number][] | null>();

    constructor() {
        // La URL ya incluye ?MAP=... — solo agregamos los parámetros WFS
        this.baseUrl = config.qgisServer.wfsUrl;
        this.timeout = config.qgisServer.timeout;
        this.maxFeatures = config.qgisServer.maxFeatures;
    }

    /**
     * Realiza una petición GetFeature a QGIS Server.
     * A diferencia de GeoServer, el typeName NO lleva workspace.
     */
    async getFeatures(layerName: string, options: WFSOptions = {}): Promise<any> {
        try {
            const {
                maxFeatures = this.maxFeatures,
                cql_filter = null,
                propertyName = null,
                srsName = 'EPSG:4326',
            } = options;

            // La URL base ya tiene MAP=..., le añadimos los parámetros WFS
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,       // sin workspace
                outputFormat: 'application/vnd.geo+json',
                //outputFormat: 'application/json',
                maxFeatures: maxFeatures.toString(),
                srsName,
            });

            if (cql_filter) params.append('CQL_FILTER', cql_filter);
            if (propertyName) params.append('PROPERTYNAME', propertyName);

            // Combinar URL base (que ya tiene ?) con los nuevos parámetros
            const url = `${this.baseUrl}&${params.toString()}`;
            logger.debug('Petición WFS QGIS:', url);

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
            //if (!contentType.includes('application/json') && !contentType.includes('text/plain')) {
            if (!contentType.includes('json') && !contentType.includes('text/plain')) {
                const text = await response.text();
                logger.error('Respuesta inesperada:', text.substring(0, 300));
                throw new Error('QGIS Server no devolvió JSON. Verifica que la capa esté publicada como WFS.');
            }

            const data = await response.json();
            logger.debug(`Features de "${layerName}":`, data.features?.length ?? 0);
            return data;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('La petición tardó demasiado tiempo');
            }
            logger.error('Error en getFeatures:', error);
            throw error;
        }
    }

    /** GetCapabilities del servicio WFS */
    async getCapabilities(): Promise<string> {
        try {
            const now = Date.now();
            if (this.capabilitiesCache && (now - this.capabilitiesCache.ts) < this.capabilitiesTtlMs) {
                return this.capabilitiesCache.xml;
            }
            const url = `${this.baseUrl}&SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error GetCapabilities: ${response.status}`);
            const xml = await response.text();
            this.capabilitiesCache = { xml, ts: now };
            return xml;
        } catch (error) {
            logger.error('Error en getCapabilities:', error);
            throw error;
        }
    }

    /** Feature por ID */
    async getFeatureById(layerName: string, featureId: string): Promise<any> {
        try {
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                FEATUREID: featureId,
                //outputFormat: 'application/json',
                outputFormat: 'application/vnd.geo+json',
            });
            const url = `${this.baseUrl}&${params.toString()}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Error al obtener feature ${featureId}`);
            const data = await response.json();
            return data.features[0] ?? null;
        } catch (error) {
            logger.error('Error en getFeatureById:', error);
            throw error;
        }
    }

    /** Features dentro de un BoundingBox */
    async getFeaturesByBBox(layerName: string, bbox: number[], srsName: string = 'EPSG:4326'): Promise<any> {
        try {
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                outputFormat: 'application/vnd.geo+json',
                //                outputFormat: 'application/json',
                srsName,
                BBOX: `${bbox.join(',')},${srsName}`,
            });
            const url = `${this.baseUrl}&${params.toString()}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Error bbox: ${response.status}`);
            return response.json();
        } catch (error) {
            logger.error('Error en getFeaturesByBBox:', error);
            throw error;
        }
    }

    /** Valores únicos de un campo */
    async getUniqueValues(layerName: string, fieldName: string): Promise<any[]> {
        try {
            const data = await this.getFeatures(layerName, { propertyName: fieldName, maxFeatures: 10000 });
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

    /** Cuenta features (hits) */
    async getFeatureCount(layerName: string, cql_filter: string | null = null): Promise<number> {
        try {
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                resultType: 'hits',
            });
            if (cql_filter) params.append('CQL_FILTER', cql_filter);
            const url = `${this.baseUrl}&${params.toString()}`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error al contar: ${response.status}`);
            const data = await response.json();
            return data.totalFeatures ?? data.numberMatched ?? 0;
        } catch (error) {
            logger.error('Error en getFeatureCount:', error);
            throw error;
        }
    }

    /** Filtros múltiples con CQL */
    async getFeaturesByFilters(layerName: string, filters: Record<string, any>): Promise<any> {
        const cqlParts = Object.entries(filters).map(([field, value]) => {
            if (typeof value === 'string') return `${field} = '${value}'`;
            if (Array.isArray(value)) return `${field} IN (${value.map(v => `'${v}'`).join(',')})`;
            return `${field} = ${value}`;
        });
        return this.getFeatures(layerName, { cql_filter: cqlParts.join(' AND ') });
    }

    /**
     * Extensión de capa desde WFS GetCapabilities.
     * QGIS Server expone el bbox en WGS84 directamente.
     */
    async getLayerExtent(layerName: string): Promise<[number, number][] | null> {
        try {
            if (this.layerExtentCache.has(layerName)) {
                return this.layerExtentCache.get(layerName) ?? null;
            }
            const capXml = await this.getCapabilities();
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
                        this.layerExtentCache.set(layerName, extent);
                        return extent;
                    }
                    // WFS 1.0: atributos minx, miny
                    const minx = parseFloat(bbox.getAttribute('minx') ?? '0');
                    const miny = parseFloat(bbox.getAttribute('miny') ?? '0');
                    const maxx = parseFloat(bbox.getAttribute('maxx') ?? '0');
                    const maxy = parseFloat(bbox.getAttribute('maxy') ?? '0');
                    const extent: [number, number][] = [[miny, minx], [maxy, maxx]];
                    this.layerExtentCache.set(layerName, extent);
                    return extent;
                }
            }
            this.layerExtentCache.set(layerName, null);
            return null;
        } catch (error) {
            logger.error('Error obteniendo extensión WFS:', error);
            return null;
        }
    }
}

export const wfsService = new WFSService();
export default WFSService;
