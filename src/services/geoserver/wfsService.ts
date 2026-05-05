/**
 * @fileoverview Servicio WFS optimizado con caché integrada
 * @module services/wfsService
 * 
 * Mejoras principales:
 * - Caché en memoria para peticiones WFS
 * - TTL configurable por tipo de capa
 * - Métodos para gestionar caché
 * - Logging de hits/misses de caché
 * - ✨ NUEVO: Soporte para simplificación de geometría (GEOMETRY_SIMPLIFY)
 */

import { config, logger } from '@config/env';
import type { WFSOptions } from '@types/map';
export type { WFSOptions };

interface CacheEntry {
    data: any;
    timestamp: number;
}

class WFSService {
    private baseUrl: string;
    private timeout: number;
    private maxFeatures: number;

    private capabilitiesCache: CacheEntry | null = null;
    private featureCache = new Map<string, CacheEntry>();
    private layerExtentCache = new Map<string, [number, number][] | null>();

    private readonly capabilitiesTtlMs = 15 * 60 * 1000;
    private readonly featureCacheTtlMs = 10 * 60 * 1000;
    private readonly extentCacheTtlMs = 30 * 60 * 1000;

    private cacheStats = {
        hits: 0,
        misses: 0,
        requests: 0
    };

    constructor() {
        this.baseUrl = config.qgisServer.wfsUrl;
        this.timeout = config.qgisServer.timeout;
        this.maxFeatures = config.qgisServer.maxFeatures;
    }

    private generateCacheKey(layerName: string, options: WFSOptions): string {
        return `${layerName}:${JSON.stringify({
            maxFeatures: options.maxFeatures ?? this.maxFeatures,
            cql_filter: options.cql_filter,
            propertyName: options.propertyName,
            srsName: options.srsName ?? 'EPSG:4326',
            simplifyTolerance: options.simplifyTolerance // Incluimos en la clave de caché
        })}`;
    }

    private isCacheValid(entry: CacheEntry, ttl: number): boolean {
        return (Date.now() - entry.timestamp) < ttl;
    }

    async getFeatures(layerName: string, options: WFSOptions = {}): Promise<any> {
        try {
            this.cacheStats.requests++;

            const {
                maxFeatures = this.maxFeatures,
                cql_filter = null,
                propertyName = null,
                srsName = 'EPSG:4326',
                bypassCache = false,
                simplifyTolerance
            } = options;

            const cacheKey = this.generateCacheKey(layerName, options);
            if (!bypassCache) {
                const cached = this.featureCache.get(cacheKey);
                if (cached && this.isCacheValid(cached, this.featureCacheTtlMs)) {
                    this.cacheStats.hits++;
                    logger.debug(
                        `📦 HIT caché para ${layerName} (hits: ${this.cacheStats.hits}, ratio: ${((this.cacheStats.hits / this.cacheStats.requests) * 100).toFixed(1)}%)`
                    );
                    return cached.data;
                } else {
                    this.cacheStats.misses++;
                }
            }

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
            
            // ✨ NUEVO: Añadir simplificación de geometría si se solicita
            if (simplifyTolerance !== undefined && simplifyTolerance > 0) {
                params.append('GEOMETRY_SIMPLIFY', simplifyTolerance.toString());
                logger.debug(`✂️ Aplicando simplificación de geometría con tolerancia: ${simplifyTolerance}`);
            }

            const url = `${this.baseUrl}&${params.toString()}`;
            logger.debug('🌐 Petición WFS QGIS:', url);

            const startTime = performance.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.timeout);

            const response = await fetch(url, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            });
            clearTimeout(timeoutId);

            const duration = performance.now() - startTime;
            logger.debug(`⏱️  WFS response time: ${duration.toFixed(2)}ms`);

            if (!response.ok) {
                const errorText = await response.text();
                logger.error('❌ Error WFS Response:', errorText);
                throw new Error(`Error WFS: ${response.status} ${response.statusText}`);
            }

            const contentType = response.headers.get('content-type') ?? '';
            if (!contentType.includes('json') && !contentType.includes('text/plain')) {
                const text = await response.text();
                logger.error('❌ Respuesta inesperada:', text.substring(0, 300));
                throw new Error('QGIS Server no devolvió JSON. Verifica que la capa esté publicada como WFS.');
            }

            const data = await response.json();

            this.featureCache.set(cacheKey, {
                data,
                timestamp: Date.now()
            });

            logger.debug(`✅ Features de "${layerName}": ${data.features?.length ?? 0} registros`);
            return data;

        } catch (error: any) {
            if (error.name === 'AbortError') {
                throw new Error('La petición tardó demasiado tiempo');
            }
            logger.error('❌ Error en getFeatures:', error);
            throw error;
        }
    }

    async queryFeatures(
    layerName: string, 
    cqlFilter: string,
    maxFeatures: number = 100
): Promise<any[]> {
    try {
        // Validaciones de entrada
        if (!layerName || typeof layerName !== 'string') {
            throw new Error('layerName debe ser un string no vacío');
        }
        
        if (!cqlFilter || typeof cqlFilter !== 'string') {
            throw new Error('cqlFilter debe ser un string no vacío');
        }
        
        if (maxFeatures < 1 || maxFeatures > 10000) {
            logger.warn(`maxFeatures fuera de rango (${maxFeatures}), usando 100`);
            maxFeatures = 100;
        }
 
        // Configurar opciones para getFeatures
        const options: WFSOptions = {
            cql_filter: cqlFilter,
            maxFeatures: maxFeatures,
            bypassCache: false, // Usar caché para mejor rendimiento
            srsName: 'EPSG:4326' // Sistema de coordenadas estándar
        };
        
        logger.debug(
            `📍 queryFeatures: ${layerName}, max: ${maxFeatures}, CQL: ${cqlFilter.substring(0, 50)}...`
        );
 
        // Llamar al método principal
        const result = await this.getFeatures(layerName, options);
        
        // getFeatures retorna un GeoJSON FeatureCollection
        // Estructura esperada: { type: "FeatureCollection", features: [...] }
        if (result && result.features && Array.isArray(result.features)) {
            logger.debug(
                `✅ queryFeatures exitoso: ${result.features.length} features retornados`
            );
            return result.features;
        }
        
        // Si no hay features o estructura inesperada
        if (result && !result.features) {
            logger.warn(
                `⚠️ Respuesta WFS sin campo 'features' para ${layerName}`,
                result
            );
        }
        
        return [];
        
    } catch (error) {
        // Logging detallado del error
        logger.error(
            `❌ Error en queryFeatures para capa '${layerName}':`,
            {
                error: error instanceof Error ? error.message : String(error),
                cqlFilter: cqlFilter.substring(0, 100),
                maxFeatures
            }
        );
        
        // Re-lanzar para que el componente maneje el error
        throw new Error(
            `Error consultando features de ${layerName}: ${error instanceof Error ? error.message : 'Error desconocido'}`
        );
    }
}

    async getCapabilities(): Promise<string> {
        try {
            if (this.capabilitiesCache && this.isCacheValid(this.capabilitiesCache, this.capabilitiesTtlMs)) {
                logger.debug('📦 Usando GetCapabilities en caché');
                return this.capabilitiesCache.data;   
            }

            logger.debug('🌐 Obteniendo GetCapabilities...');
            const url = `${this.baseUrl}&SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities`;
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Error GetCapabilities: ${response.status}`);

            const xml = await response.text();
            this.capabilitiesCache = { data: xml, timestamp: Date.now() } as any;
            return xml;

        } catch (error) {
            logger.error('❌ Error en getCapabilities:', error);
            throw error;
        }
    }

    async getFeatureById(layerName: string, featureId: string): Promise<any> {
        try {
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                FEATUREID: featureId,
                outputFormat: 'application/vnd.geo+json',
            });
            const url = `${this.baseUrl}&${params.toString()}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Error al obtener feature ${featureId}`);
            const data = await response.json();
            return data.features[0] ?? null;
        } catch (error) {
            logger.error('❌ Error en getFeatureById:', error);
            throw error;
        }
    }

    async getFeaturesByBBox(layerName: string, bbox: number[], srsName: string = 'EPSG:4326'): Promise<any> {
        try {
            const params = new URLSearchParams({
                SERVICE: 'WFS',
                VERSION: '1.1.0',
                REQUEST: 'GetFeature',
                TYPENAME: layerName,
                outputFormat: 'application/vnd.geo+json',
                srsName,
                BBOX: `${bbox.join(',')},${srsName}`,
            });
            const url = `${this.baseUrl}&${params.toString()}`;
            const response = await fetch(url, { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error(`Error bbox: ${response.status}`);
            return response.json();
        } catch (error) {
            logger.error('❌ Error en getFeaturesByBBox:', error);
            throw error;
        }
    }

    async getUniqueValues(layerName: string, fieldName: string): Promise<any[]> {
        try {
            const data = await this.getFeatures(layerName, { propertyName: fieldName, maxFeatures: this.maxFeatures });
            const unique = new Set<any>();
            data.features.forEach((f: any) => {
                const v = f.properties[fieldName];
                if (v !== null && v !== undefined) unique.add(v);
            });
            return Array.from(unique).sort();
        } catch (error) {
            logger.error('❌ Error en getUniqueValues:', error);
            throw error;
        }
    }

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
            logger.error('❌ Error en getFeatureCount:', error);
            throw error;
        }
    }

    async getFeaturesByFilters(layerName: string, filters: Record<string, any>): Promise<any> {
        const cqlParts = Object.entries(filters).map(([field, value]) => {
            if (typeof value === 'string') return `${field} = '${value}'`;
            if (Array.isArray(value)) return `${field} IN (${value.map(v => `'${v}'`).join(',')})`;
            return `${field} = ${value}`;
        });
        return this.getFeatures(layerName, { cql_filter: cqlParts.join(' AND ') });
    }

    async getLayerExtent(layerName: string): Promise<[number, number][] | null> {
        try {
            if (this.layerExtentCache.has(layerName)) {
                const cached = this.layerExtentCache.get(layerName);
                return cached ?? null;
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
            logger.error('❌ Error obteniendo extensión WFS:', error);
            return null;
        }
    }

    clearFeatureCache(layerName?: string): void {
        if (layerName) {
            const keysToDelete = Array.from(this.featureCache.keys())
                .filter(key => key.startsWith(`${layerName}:`));
            keysToDelete.forEach(key => this.featureCache.delete(key));
            logger.debug(`🧹 Limpiada caché de features para ${layerName}`);
        } else {
            this.featureCache.clear();
            logger.debug('🧹 Limpiada toda la caché de features');
        }
    }

    clearCapabilitiesCache(): void {
        this.capabilitiesCache = null;
        logger.debug('🧹 Limpiada caché de capabilities');
    }

    clearAllCaches(): void {
        this.featureCache.clear();
        this.layerExtentCache.clear();
        this.capabilitiesCache = null;
        logger.debug('🧹 Limpiadas todas las cachés');
    }

    getCacheStats() {
        return {
            ...this.cacheStats,
            hitRatio: this.cacheStats.requests > 0
                ? ((this.cacheStats.hits / this.cacheStats.requests) * 100).toFixed(1) + '%'
                : 'N/A',
            featuresInCache: this.featureCache.size,
            extentsInCache: this.layerExtentCache.size
        };
    }

    resetCacheStats(): void {
        this.cacheStats = { hits: 0, misses: 0, requests: 0 };
        logger.debug('🔄 Estadísticas de caché reseteadas');
    }
}

export const wfsService = new WFSService();
export default WFSService;