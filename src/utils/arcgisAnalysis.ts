/**
 * @fileoverview arcgisAnalysis — Lógica compartida de análisis espacial sobre
 * ArcGIS REST FeatureServer / MapServer (Atlas de Riesgos CDMX).
 *
 * Consumida por:
 *   - AnalysisTool  (análisis con geometría dibujada)
 *   - GeocoderTool  (análisis de radio fijo desde una dirección buscada)
 *
 * @module utils/arcgisAnalysis
 */

import L from 'leaflet';
import * as turf from '@turf/turf';

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export type OperationType = 'suma' | 'total' | 'categorizar';

export interface AnalysisLayerDef {
    id:           string;
    name:         string;
    url:          string;
    attributes:   string[];
    operation:    OperationType;
    group:        string;
    symbolUrl?:   string;
    legendColor?: string;
    where?:       string;
    wfsTypeName:  string;
}

export interface DemoData {
    pobtot:      number;
    p_60ymas:    number;
    tvivhab:     number;
    pcon_disc:   number;
    vph_nodren:  number;
    hasReserved: boolean;
}

export interface LayerResult {
    layerId:         string;
    layerName:       string;
    url:             string;
    operation:       OperationType;
    group:           string;
    symbolUrl?:      string;
    legendColor?:    string;
    count:           number | null;
    categorias:      string[] | null;
    demoData:        DemoData | null;
    features:        GeoJSON.Feature[] | null;
    loadingDetails:  boolean;
    error?:          boolean;
}

// ─── Constantes de capas ──────────────────────────────────────────────────────

const BASE_FS = 'https://serviciosatlas.sgirpc.cdmx.gob.mx/arcgis/rest/services/Analisis/Herramienta_analisis/FeatureServer';
const SYM     = 'https://www.atlas.cdmx.gob.mx/analisisn3/widgets/Analisis/images/Simbologia';

export const ANALYSIS_LAYERS: AnalysisLayerDef[] = [
    // ── Demografía ────────────────────────────────────────────────────────────
    {
        id: 'demo_inegi', name: 'INEGI CPV2020',
        url: 'https://serviciosatlas.sgirpc.cdmx.gob.mx/arcgis/rest/services/AtlasCapasPublicas/Limites/MapServer/13',
        attributes: ['pobtot', 'p_60ymas', 'tvivhab', 'pcon_disc', 'vph_nodren'],
        operation: 'suma', group: 'Demografía', wfsTypeName: 'INEGI_CPV2020_n9',
    },
    // ── Asentamientos ─────────────────────────────────────────────────────────
    {
        id: 'colonias', name: 'Colonias (IECM 2019)',
        url: `${BASE_FS}/0`, attributes: ['nomasen'],
        operation: 'total', group: 'Asentamientos',
        legendColor: '#c7c6ff',
        wfsTypeName: 'INEGI_Asentamientos_2010',
    },
    // ── Servicios urbanos — DENUE 2025 ────────────────────────────────────────
    { id: 'educativos',  name: 'Centros educativos (DENUE 2025)',        url: `${BASE_FS}/1`,  attributes: ['nombre_act'], operation: 'categorizar', group: 'Servicios urbanos', symbolUrl: `${SYM}/Escuela.png`,     wfsTypeName: 'DENUE_INEGI_2025' },
    { id: 'salud',       name: 'Establecimientos de Salud (DENUE 2025)', url: `${BASE_FS}/2`,  attributes: ['nombre_act'], operation: 'categorizar', group: 'Servicios urbanos', symbolUrl: `${SYM}/Salud.png`,       wfsTypeName: 'DENUE_INEGI_2025' },
    { id: 'hoteles',     name: 'Hoteles (DENUE 2025)',                   url: `${BASE_FS}/3`,  attributes: ['nombre_act'], operation: 'categorizar', group: 'Servicios urbanos', symbolUrl: `${SYM}/Hotel.png`,       wfsTypeName: 'DENUE_INEGI_2025' },
    { id: 'bancos',      name: 'Bancos (DENUE 2025)',                    url: `${BASE_FS}/4`,  attributes: ['nombre_act'], operation: 'categorizar', group: 'Servicios urbanos', symbolUrl: `${SYM}/Banco.png`,       wfsTypeName: 'DENUE_INEGI_2025' },
    { id: 'gasolineras', name: 'Estaciones de servicio (DENUE 2025)',    url: `${BASE_FS}/5`,  attributes: ['nombre_act'], operation: 'categorizar', group: 'Servicios urbanos', symbolUrl: `${SYM}/Combustible.png`, wfsTypeName: 'DENUE_INEGI_2025' },
    // ── Riesgos geológicos ────────────────────────────────────────────────────
    { id: 'minas',          name: 'Minas',                           url: `${BASE_FS}/7`,  attributes: ['TAXONOMIA'],  operation: 'categorizar', group: 'Riesgos geológicos', symbolUrl: `${SYM}/Mina.png`,          wfsTypeName: 'SPC_MINAS_ITRF' },
    { id: 'sismos',         name: 'Sismos',                          url: `${BASE_FS}/8`,  attributes: ['MAGNITUD'],   operation: 'categorizar', group: 'Riesgos geológicos', symbolUrl: `${SYM}/Sismograma_2.png`, wfsTypeName: 'SSN_Sismos_CDMEX_2023' },
    { id: 'laderas',        name: 'Inestabilidad de Laderas',        url: `${BASE_FS}/9`,  attributes: ['intensidad'], operation: 'categorizar', group: 'Riesgos geológicos', legendColor: '#c8a97e', wfsTypeName: 'zona_susceptibles_Procesos_remocion_en_masa' },
    { id: 'geotecnica',     name: 'Zonificación Geotécnica',         url: `${BASE_FS}/10`, attributes: ['intensidad'], operation: 'categorizar', group: 'Riesgos geológicos', legendColor: '#b0c4de', wfsTypeName: 'SGIRPC_Zonificacion_Geotecnica_2017' },
    { id: 'fracturamiento', name: 'Vulnerabilidad al Fracturamiento', url: `${BASE_FS}/11`, attributes: ['intensidad'], operation: 'categorizar', group: 'Riesgos geológicos', legendColor: '#f5c97a', wfsTypeName: 'CENAPRED_Vulnerabilidad_Social_Fracturamiento_Nivel_AGEB' },
    // ── Infraestructura hídrica ───────────────────────────────────────────────
    { id: 'presas',     name: 'Presas',             url: `${BASE_FS}/12`, attributes: ['NOMBRE'],    operation: 'categorizar', group: 'Infraestructura hídrica', symbolUrl: `${SYM}/Presas.png`, wfsTypeName: 'PRESAS_CENAPRED_2017' },
    { id: 'corrientes', name: 'Corrientes de Agua', url: `${BASE_FS}/13`, attributes: ['CONDICION'], operation: 'categorizar', group: 'Infraestructura hídrica', legendColor: '#4da6ff', wfsTypeName: 'HIDROGRAFIAL_INEGI_2018' },
    // ── Peligros ──────────────────────────────────────────────────────────────
    { id: 'incendios_forestales', name: 'Incendios Forestales', url: `${BASE_FS}/15`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'Peligros', symbolUrl: `${SYM}/Incendios.png`, where: "TAXONOMIA='INCENDIO FORESTAL'", wfsTypeName: 'PELIGRO_AGEBS' },
    { id: 'peligro_general',      name: 'Peligro General',      url: `${BASE_FS}/14`, attributes: ['peligro2'], operation: 'categorizar', group: 'Peligros', legendColor: '#ff7f7f', wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    // ── REUSE ─────────────────────────────────────────────────────────────────
    { id: 'reuse_derrames',        name: 'REUSE - Derrames',                                                    url: `${BASE_FS}/16`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Derrames.png`,              wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_explosiones',     name: 'REUSE - Explosiones',                                                 url: `${BASE_FS}/17`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Explosiones.png`,            wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_incendios_urb',   name: 'REUSE - Incendios Urbanos',                                           url: `${BASE_FS}/18`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_IncendiosUrbanos.png`,       wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_plaga',           name: 'REUSE - Plaga',                                                       url: `${BASE_FS}/20`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Plaga.png`,                  wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_accidentes',      name: 'REUSE - Accidentes',                                                  url: `${BASE_FS}/21`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Accidentes.png`,             wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_sabotaje',        name: 'REUSE - Actos de Sabotaje o Terrorismo',                              url: `${BASE_FS}/22`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_ActosSabotaje.png`,          wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_interrupcion',    name: 'REUSE - Interrupción de servicios vitales y sistemas estratégicos',   url: `${BASE_FS}/23`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_InterrupcionServicios.png`, wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_inundacion',      name: 'REUSE - Inundación',                                                  url: `${BASE_FS}/24`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Inundacion.png`,             wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_concentraciones', name: 'REUSE - Concentraciones Masivas de Población',                        url: `${BASE_FS}/25`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Concentraciones.png`,        wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_granizo',         name: 'REUSE - Granizo',                                                     url: `${BASE_FS}/26`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Granizo.png`,                wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
    { id: 'reuse_socavones',       name: 'REUSE - Socavones',                                                   url: `${BASE_FS}/27`, attributes: ['ATENDIO'], operation: 'categorizar', group: 'REUSE', symbolUrl: `${SYM}/REUSE_Socavones.png`,              wfsTypeName: 'SGIRPC_REUSE_2018_2019_V1' },
];

/** Grupos que renderizan con fondo verde en la tabla de resultados. */
export const GREEN_GROUPS = new Set(['Asentamientos', 'REUSE']);

// ─── Helpers de features ──────────────────────────────────────────────────────

const SKIP_FIELDS = new Set([
    'bbox', 'geometry', 'the_geom', 'geom', 'shape',
    'objectid', 'objectid_1', 'OBJECTID', 'FID', 'fid',
]);

const NAME_CANDIDATES = [
    'NOMBRE', 'nombre', 'name', 'NAME',
    'Estado', 'estado', 'Municipio', 'municipio',
    'Localidad', 'localidad', 'descripcion', 'DESCRIPCION',
    'tipo', 'TIPO', 'cve_geo',
];

export function pickName(props: Record<string, unknown>): string {
    for (const k of NAME_CANDIDATES) {
        if (props[k] != null && props[k] !== '') return String(props[k]);
    }
    const keys = Object.keys(props).filter(k => !SKIP_FIELDS.has(k));
    return keys.length ? String(props[keys[0]]) : 'Sin nombre';
}

export { SKIP_FIELDS };

// ─── Geometría ────────────────────────────────────────────────────────────────

/**
 * Genera 32 vértices que aproximan un círculo en WGS84.
 * Devuelve un anillo cerrado en formato [lng, lat][] para ArcGIS REST.
 */
export function buildCircleRing(
    center: L.LatLng,
    radiusMeters: number,
    steps = 32,
): number[][] {
    const latRad = center.lat * (Math.PI / 180);
    const dLat   = radiusMeters / 111_320;
    const dLng   = radiusMeters / (111_320 * Math.cos(latRad));
    const ring: number[][] = [];
    for (let i = 0; i <= steps; i++) {
        const angle = (i / steps) * 2 * Math.PI;
        ring.push([
            Math.round((center.lng + dLng * Math.cos(angle)) * 1e6) / 1e6,
            Math.round((center.lat + dLat * Math.sin(angle)) * 1e6) / 1e6,
        ]);
    }
    return ring;
}

/**
 * Construye la geometría ArcGIS REST y su tipo para los tres modos de dibujo.
 * - Punto   → polígono circular exacto (esriGeometryPolygon)
 * - Línea   → envelope expandido por buffer (esriGeometryEnvelope)
 * - Polígono → el polígono dibujado (esriGeometryPolygon)
 */
export function getArcGISGeometry(
    mode: 'point' | 'line' | 'polygon',
    pts: L.LatLng[],
    distMeters: number,
): { geometry: string; geometryType: string } {

    if (mode === 'point' && pts.length >= 1) {
        const ring = buildCircleRing(pts[0], distMeters);
        return {
            geometry: JSON.stringify({
                rings: [ring],
                spatialReference: { wkid: 4326 }
            }),
            geometryType: 'esriGeometryPolygon',
        };
    }

    if (mode === 'polygon' && pts.length >= 3) {
        const ring = pts.map(p => [p.lng, p.lat]);
        ring.push(ring[0]);

        return {
            geometry: JSON.stringify({
                rings: [ring],
                spatialReference: { wkid: 4326 }
            }),
            geometryType: 'esriGeometryPolygon',
        };
    }

    if (mode === 'line' && pts.length >= 2) {

        const line = turf.lineString(
            pts.map(p => [p.lng, p.lat])
        );

        const buffer = turf.buffer(
            line,
            distMeters / 1000,
            { units: 'kilometers' }
        );

        const rings = buffer.geometry.coordinates[0];

        return {
            geometry: JSON.stringify({
                rings: [rings],
                spatialReference: { wkid: 4326 }
            }),
            geometryType: 'esriGeometryPolygon',
        };
    }

    return {
        geometry: '',
        geometryType: 'esriGeometryPolygon',
    };
}

// ─── Consulta ArcGIS REST ──────────────────────────────────────────────────────

/**
 * Consulta un ArcGIS FeatureServer/MapServer con la geometría del área.
 * Usa POST para evitar límites de longitud de URL.
 */
export async function queryArcGISLayer(
    layer:        AnalysisLayerDef,
    geometry:     string,
    geometryType: string,
    signal:       AbortSignal,
): Promise<{ count: number; categorias: string[]; demoData: DemoData | null }> {

    const where = layer.where ?? '1=1';

    const arcgisPost = async (params: Record<string, string>) => {
        const body = new URLSearchParams({
            geometry,
            geometryType,
            inSR:       '4326',
            spatialRel: 'esriSpatialRelIntersects',
            where,
            ...params,
        });
        const res = await fetch(`${layer.url}/query`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    body.toString(),
            signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    };

    // ── total ──────────────────────────────────────────────────────────────
    if (layer.operation === 'total') {
        const data = await arcgisPost({ f: 'json', returnCountOnly: 'true' });
        return { count: data.count ?? 0, categorias: [], demoData: null };
    }

    // ── categorizar ────────────────────────────────────────────────────────
    if (layer.operation === 'categorizar') {
        const data = await arcgisPost({
            f:                 'geojson',
            outFields:         layer.attributes[0],
            returnGeometry:    'false',
            resultRecordCount: '2000',
        });
        const features = (data.features ?? []) as Array<{ properties: Record<string, unknown> }>;
        const attr     = layer.attributes[0];
        const unique   = [
            ...new Set(
                features
                    .map(f => {
                        const v = f.properties?.[attr] ?? f.properties?.[attr.toLowerCase()] ?? f.properties?.[attr.toUpperCase()];
                        return v != null && v !== '' ? String(v) : null;
                    })
                    .filter((v): v is string => v !== null),
            ),
        ];
        return { count: features.length, categorias: unique, demoData: null };
    }

    // ── suma (demografía INEGI) ────────────────────────────────────────────
    if (layer.operation === 'suma') {
        const data = await arcgisPost({
            f:                 'geojson',
            outFields:         layer.attributes.join(','),
            returnGeometry:    'false',
            resultRecordCount: '5000',
        });
        const features = (data.features ?? []) as Array<{ properties: Record<string, unknown> }>;
        let hasReserved = false;
        const sums: Record<string, number> = {};
        layer.attributes.forEach(a => (sums[a] = 0));
        features.forEach(f => {
            layer.attributes.forEach(attr => {
                const val = f.properties?.[attr];
                if (val == null) { hasReserved = true; }
                else             { sums[attr] = (sums[attr] ?? 0) + Number(val); }
            });
        });
        return {
            count: features.length,
            categorias: [],
            demoData: {
                pobtot:     sums['pobtot']     ?? 0,
                p_60ymas:   sums['p_60ymas']   ?? 0,
                tvivhab:    sums['tvivhab']    ?? 0,
                pcon_disc:  sums['pcon_disc']  ?? 0,
                vph_nodren: sums['vph_nodren'] ?? 0,
                hasReserved,
            },
        };
    }

    return { count: 0, categorias: [], demoData: null };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

/**
 * Determina el texto y si la fila tiene datos, para la columna "Total".
 *
 * Regla:
 *  - operation = 'total'                         → conteo de features
 *  - operation = 'categorizar' con symbolUrl     → conteo de features (capas puntuales)
 *  - operation = 'categorizar' sin symbolUrl     → valores únicos del atributo
 *
 * ⚠️ El check de symbolUrl debe ir ANTES del check de categorias.
 */
export function getDisplayValue(lr: LayerResult): { text: string; hasData: boolean } {
    if (lr.count === null) return { text: '…', hasData: false };

    if (lr.operation === 'total') {
        if (lr.count === 0) return { text: 'No presenta', hasData: false };
        return { text: lr.count.toLocaleString(), hasData: true };
    }

    if (lr.operation === 'categorizar') {
        if (lr.symbolUrl) {
            if (lr.count === 0) return { text: 'No presenta', hasData: false };
            return { text: lr.count.toLocaleString(), hasData: true };
        } else {
            if (!lr.categorias || lr.categorias.length === 0)
                return { text: 'No presenta', hasData: false };
            return { text: lr.categorias.join(', '), hasData: true };
        }
    }

    return { text: '…', hasData: false };
}

/** Estado inicial de resultados con todas las capas en "cargando". */
export function buildInitialResults(): LayerResult[] {
    return ANALYSIS_LAYERS.map(layer => ({
        layerId:        layer.id,
        layerName:      layer.name,
        url:            layer.url,
        operation:      layer.operation,
        group:          layer.group,
        symbolUrl:      layer.symbolUrl,
        legendColor:    layer.legendColor,
        count:          null,
        categorias:     null,
        demoData:       null,
        features:       null,
        loadingDetails: false,
    }));
}