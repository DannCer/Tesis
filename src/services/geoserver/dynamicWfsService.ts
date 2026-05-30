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
     * Obtiene la URL del proyecto QGIS para un grupo específico.
     * Retorna null si el grupo no tiene proyecto configurado,
     * para evitar usar un fallback incorrecto que cause errores 400.
     */
    private getProjectUrlForGroup(groupName: string): string | null {
        const projectPath = this.groupProjectMap.get(groupName);

        if (!projectPath) {
            // Sin url_proyecto en la BD -> no hacer peticion al servidor.
            // El fallback al proyecto por defecto causaria 400 porque la capa no existe en el.
            logger.debug(`Grupo "${groupName}" sin proyecto configurado. Omitiendo.`);
            return null;
        }

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

            const baseUrl = this.getProjectUrlForGroup(groupName);
            if (!baseUrl) return { features: [] };

            // Construir query string manualmente con encodeURIComponent
            // para evitar que URLSearchParams codifique espacios como + (rompe QGIS)
            const parts: string[] = [
                'SERVICE=WFS',
                'VERSION=1.1.0',
                'REQUEST=GetFeature',
                `TYPENAME=${encodeURIComponent(layerName)}`,
                `outputFormat=${encodeURIComponent('application/vnd.geo+json')}`,
                `srsName=${encodeURIComponent(srsName)}`,
            ];

            if (maxFeatures > 0) parts.push(`maxFeatures=${maxFeatures}`);
            if (cql_filter) parts.push(`CQL_FILTER=${encodeURIComponent(cql_filter)}`);
            if (propertyName) parts.push(`PROPERTYNAME=${encodeURIComponent(propertyName)}`);

            const url = `${baseUrl}&${parts.join('&')}`;
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

        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
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
            if (!baseUrl) return '';

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
            if (!baseUrl) return null;

            const parts: string[] = [
                'SERVICE=WFS',
                'VERSION=1.1.0',
                'REQUEST=GetFeature',
                `TYPENAME=${encodeURIComponent(layerName)}`,
                `FEATUREID=${encodeURIComponent(featureId)}`,
                `outputFormat=${encodeURIComponent('application/vnd.geo+json')}`,
            ];

            const url = `${baseUrl}&${parts.join('&')}`;
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
            if (!baseUrl) return { features: [] };

            const parts: string[] = [
                'SERVICE=WFS',
                'VERSION=1.1.0',
                'REQUEST=GetFeature',
                `TYPENAME=${encodeURIComponent(layerName)}`,
                `outputFormat=${encodeURIComponent('application/vnd.geo+json')}`,
                `srsName=${encodeURIComponent(srsName)}`,
                `BBOX=${encodeURIComponent(`${bbox.join(',')},${srsName}`)}`,
            ];

            const url = `${baseUrl}&${parts.join('&')}`;
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

            const unique = new Set<string | number | boolean>();
            data.features.forEach((f: GeoJSON.Feature) => {
                const v = f.properties?.[fieldName];
                if (v !== null && v !== undefined) unique.add(v as string | number | boolean);
            });

            return Array.from(unique).sort();
        } catch (error) {
            logger.error('Error en getUniqueValues:', error);
            throw error;
        }
    }

    /**
     * Detecta el nombre del campo de geometría de una capa via DescribeFeatureType.
     * Cachea el resultado por capa. Retorna 'geometry' como fallback seguro.
     */
    private geomFieldCache = new Map<string, string>();

    async getGeometryFieldName(layerName: string, groupName: string): Promise<string> {
        const cacheKey = `${groupName}:${layerName}`;
        if (this.geomFieldCache.has(cacheKey)) {
            return this.geomFieldCache.get(cacheKey)!;
        }

        try {
            const baseUrl = this.getProjectUrlForGroup(groupName);
            if (!baseUrl) return 'geometry';

            const url = `${baseUrl}&SERVICE=WFS&VERSION=1.1.0&REQUEST=DescribeFeatureType&TYPENAME=${encodeURIComponent(layerName)}&outputFormat=${encodeURIComponent('application/json')}`;
            const resp = await fetch(url);
            if (!resp.ok) return 'geometry';

            const contentType = resp.headers.get('content-type') ?? '';

            // QGIS puede responder JSON o XML dependiendo de la versión
            if (contentType.includes('json')) {
                const json = await resp.json();
                const props = json?.featureTypes?.[0]?.properties ?? [];
                const geomField = props.find((p: { name?: string; type?: string }) =>
                    p.type?.toLowerCase().includes('geometry') ||
                    p.type?.toLowerCase().includes('gml') ||
                    ['geometry', 'the_geom', 'geom', 'shape', 'wkb_geometry'].includes(p.name?.toLowerCase() ?? '')
                );
                const name = geomField?.name ?? 'geometry';
                this.geomFieldCache.set(cacheKey, name);
                return name;
            } else {
                // Parsear XML de DescribeFeatureType
                const xml = await resp.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(xml, 'text/xml');
                const elements = Array.from(doc.querySelectorAll('element'));
                const geomCandidates = ['geometry', 'the_geom', 'geom', 'shape', 'wkb_geometry'];
                const geomEl = elements.find(el => {
                    const type = (el.getAttribute('type') ?? '').toLowerCase();
                    const name = (el.getAttribute('name') ?? '').toLowerCase();
                    return type.includes('geometryproperty') || type.includes('gml:') ||
                        geomCandidates.includes(name);
                });
                const name = geomEl?.getAttribute('name') ?? 'geometry';
                this.geomFieldCache.set(cacheKey, name);
                return name;
            }
        } catch {
            return 'geometry';
        }
    }

    /**
     * Cuenta features usando CQL filter espacial sin límite.
     *
     * QGIS Server no incluye `totalFeatures` en su respuesta GeoJSON, por lo que
     * contamos directamente los features devueltos.
     *
     * IMPORTANTE: Cuando hay un CQL_FILTER espacial (INTERSECTS / DWithin), NO se
     * usa PROPERTYNAME porque QGIS Server necesita acceder a la geometría para
     * evaluar el predicado espacial; omitirla provoca que el filtro se ignore y
     * se devuelvan 0 features aunque haya intersección real.
     *
     * Sin filtro espacial se optimiza con PROPERTYNAME solo el campo ID.
     */
    async getFeatureCount(
        layerName: string,
        groupName: string,
        cql_filter: string | null = null
    ): Promise<number> {
        try {
            const baseUrl = this.getProjectUrlForGroup(groupName);
            if (!baseUrl) return 0;

            // Detectar si el filtro es espacial (INTERSECTS / DWithin)
            const isSpatialFilter = cql_filter
                ? /INTERSECTS|DWITHIN|BBOX|CONTAINS|WITHIN|TOUCHES|CROSSES/i.test(cql_filter)
                : false;

            // Paso 1: optimización con PROPERTYNAME solo cuando NO hay filtro espacial
            let propertyName: string | null = null;
            if (!isSpatialFilter) {
                try {
                    const sampleParts = [
                        'SERVICE=WFS', 'VERSION=1.1.0', 'REQUEST=GetFeature',
                        `TYPENAME=${encodeURIComponent(layerName)}`,
                        `outputFormat=${encodeURIComponent('application/vnd.geo+json')}`,
                        'maxFeatures=1',
                    ];
                    const sampleUrl = `${baseUrl}&${sampleParts.join('&')}`;
                    const sampleResp = await fetch(sampleUrl);
                    if (sampleResp.ok) {
                        const sampleData = await sampleResp.json();
                        const props = sampleData.features?.[0]?.properties ?? {};
                        const idCandidates = ['id', 'fid', 'gid', 'objectid', 'ogc_fid', 'pk'];
                        const keys = Object.keys(props);
                        propertyName =
                            idCandidates.find(k => keys.includes(k)) ??
                            idCandidates.find(k => keys.map(x => x.toLowerCase()).includes(k)) ??
                            keys[0] ?? null;
                    }
                } catch {
                    // Sin PROPERTYNAME funciona igual, solo es más pesado
                }
            }

            // Paso 2: conteo completo sin maxFeatures
            // srsName=EPSG:4326 es crítico: le dice a QGIS en qué SRS están
            // las coordenadas del WKT dentro del CQL_FILTER (lon/lat en grados).
            // Sin esto, QGIS puede interpretar las coords en el SRS nativo de la
            // capa (p.ej. EPSG:32614 en metros) y el predicado espacial falla.
            const parts: string[] = [
                'SERVICE=WFS', 'VERSION=1.1.0', 'REQUEST=GetFeature',
                `TYPENAME=${encodeURIComponent(layerName)}`,
                `outputFormat=${encodeURIComponent('application/vnd.geo+json')}`,
                'srsName=EPSG%3A4326',
            ];

            // Solo optimizar con PROPERTYNAME cuando no hay filtro espacial
            if (propertyName && !isSpatialFilter) {
                parts.push(`PROPERTYNAME=${encodeURIComponent(propertyName)}`);
            }

            if (cql_filter) {
                parts.push(`CQL_FILTER=${encodeURIComponent(cql_filter)}`);
            }

            const url = `${baseUrl}&${parts.join('&')}`;
            logger.debug(`getFeatureCount URL:`, url);

            const response = await fetch(url);
            if (!response.ok) {
                if (response.status === 400) {
                    logger.warn(`getFeatureCount [${layerName}]: 400. CQL incompatible o capa fuera del proyecto.`);
                    return 0;
                }
                throw new Error(`Error al contar: ${response.status}`);
            }

            const data = await response.json();
            return data.features?.length ?? 0;
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
            if (!capXml) return null;

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
                        this.layerExtentCache.set(cacheKey, extent);
                        return extent;
                    }

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