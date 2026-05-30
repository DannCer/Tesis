/**
 * AnalysisTool — Herramienta de análisis espacial
 *
 * v2 — Migrado a 27 capas fijas del Atlas CDMX (relación xlsx)
 * ✅ Capas fijas: INEGI-CPV2020, Colonias, DENUE 2025, Riesgos, REUSE
 * ✅ Consultas directas a ArcGIS REST FeatureServer/MapServer
 * ✅ Operaciones: Suma (demografía), Total (conteo), Categorizar (valores únicos)
 * ✅ Sección demográfica separada con íconos (igual que resumenTab original)
 * ✅ Tabla con Nombre | Total | Leyenda | Detalles (igual que resultContainer original)
 * ✅ Query adicional para Incendios Forestales (TAXONOMIA='INCENDIO FORESTAL')
 * ✅ Filas verdes para Colonias y bloque REUSE (igual que original)
 * ✅ Mantenidas: dibujo, mediciones, detalles, mapa, exportar, historial, atajos
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import ConfirmModal from '@components/common/Confirmmodal';
import {
    calculateLength,
    calculateArea,
    formatMeasurement,
    saveAnalysisToHistory,
} from '@utils/analysisToolUtils';
import '@styles/AnalysisTool.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type DrawMode    = 'point' | 'line' | 'polygon';
type DistUnit    = 'kilometers' | 'meters' | 'miles';
type OperationType = 'suma' | 'total' | 'categorizar';

interface AnalysisLayerDef {
    id:          string;
    name:        string;        // Texto en la columna "Nombre"
    url:         string;        // URL ArcGIS REST (FeatureServer/N o MapServer/N)
    attributes:  string[];      // Campos a consultar
    operation:   OperationType;
    group:       string;        // Grupo temático
    symbolUrl?:   string;        // URL de símbolo (capas puntuales)
    legendColor?: string;        // Color del cuadro de leyenda (capas poligonales/lineales)
    where?:       string;        // Filtro adicional (ej: TAXONOMIA='INCENDIO FORESTAL')
    wfsTypeName:  string;        // Nombre técnico de la capa
}

interface DemoData {
    pobtot:     number;
    p_60ymas:   number;
    tvivhab:    number;
    pcon_disc:  number;
    vph_nodren: number;
    hasReserved: boolean;
}

interface LayerResult {
    layerId:      string;
    layerName:    string;
    url:          string;
    operation:    OperationType;
    group:        string;
    symbolUrl?:   string;
    legendColor?: string;     // Color del cuadro de leyenda para capas sin símbolo PNG
    count:        number | null;      // Total de features (todas las operaciones)
    categorias:   string[] | null;    // Valores únicos (categorizar)
    demoData:     DemoData | null;    // Sumas demográficas (suma)
    features:     GeoJSON.Feature[] | null;
    loadingDetails: boolean;
    error?:       boolean;
}

interface AnalysisToolProps {
    mapInstance: L.Map | null;
    isOpen?:     boolean;
    onClose?:    () => void;
}

// ─── Constantes de capas (xlsx → código) ─────────────────────────────────────

const BASE_FS = 'https://serviciosatlas.sgirpc.cdmx.gob.mx/arcgis/rest/services/Analisis/Herramienta_analisis/FeatureServer';
const SYM     = 'https://www.atlas.cdmx.gob.mx/analisisn3/widgets/Analisis/images/Simbologia';

const ANALYSIS_LAYERS: AnalysisLayerDef[] = [
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
    { id: 'minas',          name: 'Minas',                          url: `${BASE_FS}/7`,  attributes: ['TAXONOMIA'],  operation: 'categorizar', group: 'Riesgos geológicos', symbolUrl: `${SYM}/Mina.png`,          wfsTypeName: 'SPC_MINAS_ITRF' },
    { id: 'sismos',         name: 'Sismos',                         url: `${BASE_FS}/8`,  attributes: ['MAGNITUD'],   operation: 'categorizar', group: 'Riesgos geológicos', symbolUrl: `${SYM}/Sismograma_2.png`, wfsTypeName: 'SSN_Sismos_CDMEX_2023' },
    // ← antes 'total'; cambiado a 'categorizar' para mostrar valores de intensidad
    { id: 'laderas',        name: 'Inestabilidad de Laderas',       url: `${BASE_FS}/9`,  attributes: ['intensidad'], operation: 'categorizar', group: 'Riesgos geológicos', legendColor: '#c8a97e', wfsTypeName: 'zona_susceptibles_Procesos_remocion_en_masa' },
    { id: 'geotecnica',     name: 'Zonificación Geotécnica',        url: `${BASE_FS}/10`, attributes: ['intensidad'], operation: 'categorizar', group: 'Riesgos geológicos', legendColor: '#b0c4de', wfsTypeName: 'SGIRPC_Zonificacion_Geotecnica_2017' },
    // ← antes 'total'; cambiado a 'categorizar' para mostrar valores de intensidad
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

// Grupos que van con fondo verde en la tabla (igual que en el original)
const GREEN_GROUPS = new Set(['Asentamientos', 'REUSE']);

const UNIT_LABELS: Record<DistUnit, string> = {
    kilometers: 'Kilómetros',
    meters: 'Metros',
    miles: 'Millas',
};

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

const MAX_FEATURES_LIMIT = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickName(props: Record<string, any>): string {
    for (const k of NAME_CANDIDATES) {
        if (props[k] != null && props[k] !== '') return String(props[k]);
    }
    const keys = Object.keys(props).filter(k => !SKIP_FIELDS.has(k));
    return keys.length ? String(props[keys[0]]) : 'Sin nombre';
}

function toMeters(dist: number, unit: DistUnit): number {
    switch (unit) {
        case 'kilometers': return dist * 1000;
        case 'meters':     return dist;
        case 'miles':      return dist * 1609.34;
    }
}

/**
 * Genera 64 vértices que aproximan un círculo en WGS84.
 * Devuelve un anillo cerrado en formato [lng, lat][] para ArcGIS REST.
 */
function buildCircleRing(center: L.LatLng, radiusMeters: number, steps = 32): number[][] {
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
 * Devuelve la geometría ArcGIS REST y su tipo para la consulta espacial.
 *
 * - Punto  → círculo poligonal de 64 segmentos  (esriGeometryPolygon)
 * - Línea  → envelope expandido por el buffer   (esriGeometryEnvelope) *
 * - Polígono → el polígono dibujado exacto      (esriGeometryPolygon)
 *
 * * Para líneas se usa envelope como aproximación; un buffer real
 *   requeriría turf.js que no está importado directamente aquí.
 */
function getArcGISGeometry(
    mode:        DrawMode,
    pts:         L.LatLng[],
    distMeters:  number,
): { geometry: string; geometryType: string } {

    // ── Punto: círculo exacto ──────────────────────────────────────────────
    if (mode === 'point' && pts.length >= 1) {
        const ring = buildCircleRing(pts[0], distMeters);
        return {
            geometry:     JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }),
            geometryType: 'esriGeometryPolygon',
        };
    }

    // ── Polígono: el polígono dibujado ─────────────────────────────────────
    if (mode === 'polygon' && pts.length >= 3) {
        const ring = pts.map(p => [p.lng, p.lat]);
        ring.push(ring[0]); // cerrar anillo
        return {
            geometry:     JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } }),
            geometryType: 'esriGeometryPolygon',
        };
    }

    // ── Línea: envelope expandido por el buffer (aproximación) ────────────
    const lats   = pts.map(p => p.lat);
    const lngs   = pts.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
    const dLat   = distMeters / 111_320;
    const dLng   = distMeters / (111_320 * Math.cos(midLat));
    return {
        geometry:     `${minLng - dLng},${minLat - dLat},${maxLng + dLng},${maxLat + dLat}`,
        geometryType: 'esriGeometryEnvelope',
    };
}

/**
 * Consulta un ArcGIS FeatureServer/MapServer con la geometría real del área.
 * Para puntos recibe un polígono circular exacto; para polígonos, el polígono
 * dibujado; para líneas, el envelope expandido.
 */
async function queryArcGISLayer(
    layer:        AnalysisLayerDef,
    geometry:     string,
    geometryType: string,
    signal:       AbortSignal,
): Promise<{ count: number; categorias: string[]; demoData: DemoData | null }> {
    const where = layer.where ?? '1=1';

    /** Hace POST al endpoint /query de ArcGIS REST con form-urlencoded.
     *  Usar POST evita el límite de longitud de URL para geometrías grandes. */
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

    // ── Total: solo el conteo exacto ──────────────────────────────────────
    if (layer.operation === 'total') {
        const data = await arcgisPost({ f: 'json', returnCountOnly: 'true' });
        return { count: data.count ?? 0, categorias: [], demoData: null };
    }

    // ── Categorizar: extraer valores únicos del atributo ──────────────────
    if (layer.operation === 'categorizar') {
        const data = await arcgisPost({
            f:                 'geojson',
            outFields:         layer.attributes[0],
            returnGeometry:    'false',
            resultRecordCount: '2000',
        });
        const features = (data.features ?? []) as Array<{ properties: Record<string, any> }>;
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
        // count = número real de features devueltos (correcto aunque unique esté vacío)
        return { count: features.length, categorias: unique, demoData: null };
    }

    // ── Suma: acumular campos numéricos (demografía INEGI) ────────────────
    if (layer.operation === 'suma') {
        const data = await arcgisPost({
            f:                 'geojson',
            outFields:         layer.attributes.join(','),
            returnGeometry:    'false',
            resultRecordCount: '5000',
        });
        const features = (data.features ?? []) as Array<{ properties: Record<string, any> }>;
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

/** Determina el texto y si la fila tiene datos, para la columna "Total".
 *
 * Regla (igual que el sistema original):
 *  - operation = 'total'                         → conteo de features
 *  - operation = 'categorizar' con symbolUrl     → conteo de features (capas puntuales)
 *  - operation = 'categorizar' sin symbolUrl     → valores únicos del atributo (capas poligonales/lineales)
 *
 * ⚠️ IMPORTANTE: el check de symbolUrl debe ir ANTES del check de categorias.
 *    Para capas puntuales (Sismos, DENUE, REUSE…) `hasData` depende de `count`,
 *    NO de `categorias`. Si el campo del atributo devuelve nulos, categorias
 *    estaría vacío aunque haya features reales → "No presenta" incorrecto.
 */
function getDisplayValue(lr: LayerResult): { text: string; hasData: boolean } {
    if (lr.count === null) return { text: '…', hasData: false };

    // ── operation = 'total' ───────────────────────────────────────────────
    if (lr.operation === 'total') {
        if (lr.count === 0) return { text: 'No presenta', hasData: false };
        return { text: lr.count.toLocaleString(), hasData: true };
    }

    // ── operation = 'categorizar' ─────────────────────────────────────────
    if (lr.symbolUrl) {
        // Capa PUNTUAL: usa conteo de features, independiente de categorias
        if (lr.count === 0) return { text: 'No presenta', hasData: false };
        return { text: lr.count.toLocaleString(), hasData: true };
    } else {
        // Capa POLIGONAL / LINEAL: usa los valores únicos del atributo
        if (!lr.categorias || lr.categorias.length === 0)
            return { text: 'No presenta', hasData: false };
        return { text: lr.categorias.join(', '), hasData: true };
    }
}

/**
 * Descarga un array de objetos como CSV con BOM UTF-8.
 * El BOM (\uFEFF) hace que Excel detecte automáticamente el encoding
 * UTF-8 y muestre correctamente tildes, eñes y demás caracteres especiales.
 */
function downloadCSVWithBOM(data: Record<string, any>[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);

    const escape = (val: any): string => {
        const str = String(val ?? '');
        // Si contiene coma, comilla o salto de línea, encerrar entre comillas
        return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
    };

    const rows = [
        headers.map(escape).join(','),
        ...data.map(row => headers.map(h => escape(row[h])).join(',')),
    ];

    const BOM  = '\uFEFF';                               // UTF-8 BOM para Excel
    const blob = new Blob([BOM + rows.join('\r\n')], {   // \r\n = salto Windows
        type: 'text/csv;charset=utf-8;',
    });
    const url  = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function downloadAsGeoJSON(results: LayerResult[], filename: string) {
    const features = results
        .filter(r => r.features && r.features.length > 0)
        .flatMap(r => r.features ?? [])
        .filter(f => f.geometry);
    const blob = new Blob(
        [JSON.stringify({ type: 'FeatureCollection', features }, null, 2)],
        { type: 'application/geo+json;charset=utf-8;' },
    );
    const url  = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── Componente ───────────────────────────────────────────────────────────────

const AnalysisTool: React.FC<AnalysisToolProps> = ({ mapInstance, isOpen, onClose }) => {
    const [open, setOpen]         = useState(false);
    const controlled              = isOpen !== undefined;
    const isVisible               = controlled ? isOpen! : open;

    const [tab, setTab]           = useState<'dibujar' | 'resultados' | 'estadisticas'>('dibujar');
    const [mode, setMode]         = useState<DrawMode>('point');
    const [drawing, setDrawing]   = useState(false);
    const [dist, setDist]         = useState<string>('1');
    const [unit, setUnit]         = useState<DistUnit>('kilometers');
    const [error, setError]       = useState<string | null>(null);
    const [loading, setLoading]   = useState(false);
    const [results, setResults]   = useState<LayerResult[]>([]);
    const [detailLayerId, setDetailLayerId] = useState<string | null>(null);
    const [measurements, setMeasurements]  = useState<{ area?: number; length?: number; buffer?: number }>({});
    const [featuresLayerGroup, setFeaturesLayerGroup] = useState<L.LayerGroup | null>(null);
    const [confirmResetOpen, setConfirmResetOpen]     = useState(false);

    const drawnPtsRef  = useRef<L.LatLng[]>([]);
    const polylineRef  = useRef<L.Polyline | null>(null);
    const polygonRef   = useRef<L.Polygon | null>(null);
    const circleRef    = useRef<L.Circle | null>(null);
    const markerRef    = useRef<L.CircleMarker | null>(null);
    const previewRef   = useRef<L.Polyline | null>(null);
    const markersRef   = useRef<L.CircleMarker[]>([]);
    const abortControllerRef = useRef<AbortController | null>(null);
    const drawClickRef = useRef<((e: L.LeafletMouseEvent) => void) | null>(null);
    const drawMoveRef  = useRef<((e: L.LeafletMouseEvent) => void) | null>(null);

    // ── Limpieza del mapa ─────────────────────────────────────────────────────
    const clearMapLayers = useCallback(() => {
        if (!mapInstance) return;
        polylineRef.current?.remove(); polylineRef.current = null;
        polygonRef.current?.remove();  polygonRef.current  = null;
        circleRef.current?.remove();   circleRef.current   = null;
        markerRef.current?.remove();   markerRef.current   = null;
        previewRef.current?.remove();  previewRef.current  = null;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        drawnPtsRef.current = [];
        featuresLayerGroup?.clearLayers();
    }, [mapInstance, featuresLayerGroup]);

    useEffect(() => { return () => { abortControllerRef.current?.abort(); }; }, []);

    // ── Reset ─────────────────────────────────────────────────────────────────
    const doReset = useCallback(() => {
        abortControllerRef.current?.abort();
        abortControllerRef.current = null;
        clearMapLayers();
        setDrawing(false);
        setResults([]);
        setTab('dibujar');
        setError(null);
        setDetailLayerId(null);
        setMeasurements({});
        setLoading(false);
    }, [clearMapLayers]);

    const handleReset = useCallback(() => {
        if (drawnPtsRef.current.length > 0) { setConfirmResetOpen(true); return; }
        doReset();
    }, [doReset]);

    // ── Atajos de teclado ─────────────────────────────────────────────────────
    useEffect(() => {
        if (!isVisible) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && drawing) { clearMapLayers(); setDrawing(false); }
            if (e.key === 'Enter' && drawing && (mode === 'line' || mode === 'polygon')) {
                if (drawnPtsRef.current.length >= (mode === 'line' ? 2 : 3)) handleFinishDrawing();
            }
            if (e.ctrlKey && e.key === 'z' && drawing && drawnPtsRef.current.length > 0) {
                e.preventDefault();
                drawnPtsRef.current.pop();
                const lastMarker = markersRef.current.pop();
                lastMarker?.remove();
                if (mode === 'line' && polylineRef.current)
                    polylineRef.current.setLatLngs(drawnPtsRef.current);
                else if (mode === 'polygon' && drawnPtsRef.current.length >= 2)
                    polygonRef.current?.setLatLngs(drawnPtsRef.current);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, drawing, mode]);

    // ── Mediciones ────────────────────────────────────────────────────────────
    const updateMeasurements = useCallback(() => {
        const pts = drawnPtsRef.current;
        if (pts.length === 0) { setMeasurements({}); return; }
        const next: typeof measurements = {};
        if (mode === 'point' || mode === 'line') {
            const dv = parseFloat(dist) || 0;
            next.buffer = unit === 'kilometers' ? dv * 1000
                        : unit === 'miles' ? dv * 1609.34 : dv;
        }
        if (mode === 'line' && pts.length >= 2) next.length = calculateLength(pts);
        if (mode === 'polygon' && pts.length >= 3) next.area = calculateArea(pts);
        setMeasurements(next);
    }, [mode, dist, unit]);

    // ── Dibujo ────────────────────────────────────────────────────────────────
    const handleStartDrawing = useCallback(() => {
        if (!mapInstance) return;
        clearMapLayers();
        setDrawing(true);
        setError(null);
        drawnPtsRef.current = [];

        const onClick = (e: L.LeafletMouseEvent) => {
            const pt = e.latlng;
            drawnPtsRef.current.push(pt);
            const marker = L.circleMarker(pt, {
                radius: 5, color: '#2563eb', fillColor: '#fff', fillOpacity: 1, weight: 2,
            }).addTo(mapInstance);
            markersRef.current.push(marker);

            if (mode === 'point') {
                markerRef.current = marker;
                const dv = parseFloat(dist) || 0;
                if (dv > 0) {
                    const rm = unit === 'kilometers' ? dv * 1000
                             : unit === 'miles' ? dv * 1609.34 : dv;
                    circleRef.current = L.circle(pt, {
                        radius: rm, color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.1, weight: 2,
                    }).addTo(mapInstance);
                }
                setDrawing(false);
                if (drawClickRef.current) { mapInstance.off('click', drawClickRef.current);     drawClickRef.current = null; }
                if (drawMoveRef.current)  { mapInstance.off('mousemove', drawMoveRef.current);  drawMoveRef.current  = null; }
                updateMeasurements();
            } else if (mode === 'line') {
                if (drawnPtsRef.current.length === 1)
                    polylineRef.current = L.polyline([pt], { color: '#2563eb', weight: 3 }).addTo(mapInstance);
                else
                    polylineRef.current?.setLatLngs(drawnPtsRef.current);
                updateMeasurements();
            } else if (mode === 'polygon') {
                if (drawnPtsRef.current.length >= 2) {
                    if (!polygonRef.current)
                        polygonRef.current = L.polygon(drawnPtsRef.current, {
                            color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.1, weight: 2,
                        }).addTo(mapInstance);
                    else
                        polygonRef.current.setLatLngs(drawnPtsRef.current);
                    updateMeasurements();
                }
            }
        };

        const onMove = (e: L.LeafletMouseEvent) => {
            if (drawnPtsRef.current.length === 0) return;
            const last = drawnPtsRef.current[drawnPtsRef.current.length - 1];
            if (!previewRef.current)
                previewRef.current = L.polyline([last, e.latlng], {
                    color: '#94a3b8', weight: 2, dashArray: '5,5',
                }).addTo(mapInstance);
            else
                previewRef.current.setLatLngs([last, e.latlng]);
        };

        mapInstance.on('click', onClick);
        if (mode !== 'point') mapInstance.on('mousemove', onMove);
        drawClickRef.current = onClick;
        drawMoveRef.current  = mode !== 'point' ? onMove : null;
    }, [mapInstance, mode, dist, unit, clearMapLayers, updateMeasurements]);

    const handleFinishDrawing = useCallback(() => {
        if (!mapInstance) return;
        if (drawClickRef.current) { mapInstance.off('click',     drawClickRef.current); drawClickRef.current = null; }
        if (drawMoveRef.current)  { mapInstance.off('mousemove', drawMoveRef.current);  drawMoveRef.current  = null; }
        previewRef.current?.remove();
        previewRef.current = null;
        setDrawing(false);
        updateMeasurements();
    }, [mapInstance, updateMeasurements]);

    // ── Ejecutar análisis ─────────────────────────────────────────────────────
    const runAnalysis = useCallback(async () => {
        if (drawnPtsRef.current.length === 0) {
            setError('⚠️ Debes dibujar una geometría primero'); return;
        }
        if (mode === 'line' && drawnPtsRef.current.length < 2) {
            setError('⚠️ Una línea requiere al menos 2 puntos'); return;
        }
        if (mode === 'polygon' && drawnPtsRef.current.length < 3) {
            setError('⚠️ Un polígono requiere al menos 3 puntos'); return;
        }
        const distVal = parseFloat(dist) || 0;
        if ((mode === 'point' || mode === 'line') && distVal <= 0) {
            setError('⚠️ La distancia debe ser mayor a 0'); return;
        }

        abortControllerRef.current?.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        setError(null);
        setLoading(true);
        setTab('resultados');

        const pts        = drawnPtsRef.current;
        const distMeters = toMeters(distVal, unit);
        const { geometry, geometryType } = getArcGISGeometry(mode, pts, distMeters);

        // Inicializar resultados con todas las capas en estado "cargando"
        const initialResults: LayerResult[] = ANALYSIS_LAYERS.map(layer => ({
            layerId:      layer.id,
            layerName:    layer.name,
            url:          layer.url,
            operation:    layer.operation,
            group:        layer.group,
            symbolUrl:    layer.symbolUrl,
            legendColor:  layer.legendColor,
            count:        null,
            categorias:   null,
            demoData:     null,
            features:     null,
            loadingDetails: false,
        }));
        setResults(initialResults);

        // Consultar todas las capas en paralelo
        await Promise.all(
            ANALYSIS_LAYERS.map(async (layer, idx) => {
                if (controller.signal.aborted) return;
                try {
                    const { count, categorias, demoData } = await queryArcGISLayer(
                        layer, geometry, geometryType, controller.signal,
                    );
                    if (controller.signal.aborted) return;
                    setResults(prev => {
                        const updated = [...prev];
                        updated[idx]  = { ...updated[idx], count, categorias, demoData };
                        return updated;
                    });
                } catch (err) {
                    if (controller.signal.aborted) return;
                    console.error(`[AnalysisTool] Error en ${layer.name}:`, err);
                    setResults(prev => {
                        const updated = [...prev];
                        updated[idx]  = { ...updated[idx], count: 0, categorias: [], demoData: null, error: true };
                        return updated;
                    });
                }
            }),
        );

        if (controller.signal.aborted) return;
        setLoading(false);
        saveAnalysisToHistory({
            id: Date.now().toString(),
            timestamp: Date.now(),
            mode, distance: distVal, unit,
            results: initialResults,
            measurements,
        });
    }, [mode, dist, unit, measurements]);

    // ── Cargar detalles de una capa ───────────────────────────────────────────
    const loadDetails = useCallback(async (lr: LayerResult, idx: number) => {
        if (lr.features) { setDetailLayerId(lr.layerId); return; }

        setResults(prev => {
            const u = [...prev];
            u[idx] = { ...u[idx], loadingDetails: true };
            return u;
        });
        setDetailLayerId(lr.layerId);

        try {
            const pts        = drawnPtsRef.current;
            const distVal    = parseFloat(dist) || 0;
            const distMeters = toMeters(distVal, unit);
            const { geometry, geometryType } = getArcGISGeometry(mode, pts, distMeters);
            const layerDef   = ANALYSIS_LAYERS.find(l => l.id === lr.layerId);
            const where      = layerDef?.where ?? '1=1';

            const params = new URLSearchParams({
                f:                 'geojson',
                geometry,
                geometryType,
                inSR:              '4326',
                spatialRel:        'esriSpatialRelIntersects',
                where,
                outFields:         '*',
                returnGeometry:    'true',
                resultRecordCount: String(MAX_FEATURES_LIMIT),
            });

            const res = await fetch(`${lr.url}/query`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body:    params.toString(),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data     = await res.json();
            const features = (data.features ?? []) as GeoJSON.Feature[];

            setResults(prev => {
                const u = [...prev];
                u[idx] = { ...u[idx], features, loadingDetails: false };
                return u;
            });
        } catch (err) {
            console.error(`[AnalysisTool] Error detalles ${lr.layerName}:`, err);
            setResults(prev => {
                const u = [...prev];
                u[idx] = { ...u[idx], loadingDetails: false };
                return u;
            });
        }
    }, [mode, dist, unit]);

    // ── Visualizar features en el mapa ────────────────────────────────────────
    const showFeaturesOnMap = useCallback((lr: LayerResult) => {
        if (!mapInstance || !lr.features) return;
        featuresLayerGroup?.clearLayers();
        const group = L.layerGroup().addTo(mapInstance);
        let bounds: L.LatLngBounds | null = null;

        // Color base de la capa (para polígonos/líneas)
        const fillColor = lr.legendColor ?? '#2563eb';

        // Ícono PNG para capas puntuales con symbolUrl
        const pointIcon = lr.symbolUrl
            ? L.icon({
                iconUrl:    lr.symbolUrl,
                iconSize:   [24, 24],
                iconAnchor: [12, 12],
                popupAnchor: [0, -14],
            })
            : null;

        lr.features.forEach(feature => {
            if (!feature.geometry) return;
            const geomType = (feature.geometry as GeoJSON.Geometry).type;
            const isPoint  = geomType === 'Point' || geomType === 'MultiPoint';

            const layer = L.geoJSON(feature as any, {
                // Estilo para polígonos y líneas — usa legendColor de la capa
                style: {
                    color:       fillColor,
                    weight:      2,
                    fillColor,
                    fillOpacity: 0.35,
                    opacity:     0.9,
                },
                // Marcador para puntos — PNG si hay symbolUrl, círculo con legendColor si no
                pointToLayer: (_pt, latlng) =>
                    pointIcon
                        ? L.marker(latlng, { icon: pointIcon })
                        : L.circleMarker(latlng, {
                            radius:      7,
                            color:       fillColor,
                            fillColor,
                            fillOpacity: 0.85,
                            weight:      2,
                        }),
            });

            const name = pickName(feature.properties ?? {});
            layer.bindPopup(
                `<strong>${name}</strong><br/><span style="color:#666;font-size:0.8em">${lr.layerName}</span>`,
            );
            layer.addTo(group);

            try {
                const lb = isPoint
                    ? (layer as L.GeoJSON).getBounds()
                    : layer.getBounds();
                if (lb && lb.isValid()) bounds = bounds ? bounds.extend(lb) : lb;
            } catch { /* algunos features puntuales no tienen getBounds */ }
        });

        setFeaturesLayerGroup(group);
        if (bounds && (bounds as L.LatLngBounds).isValid())
            mapInstance.fitBounds(bounds as L.LatLngBounds, { padding: [50, 50] });
    }, [mapInstance, featuresLayerGroup]);

    // ── Exportar ──────────────────────────────────────────────────────────────
    const handleExportCSV = useCallback(() => {
        const demoR = results.find(r => r.operation === 'suma');

        // ── Filas demográficas (siempre al inicio si hay datos) ──────────
        const demoRows = demoR?.demoData ? [
            { Nombre: '── Fuente: INEGI-CPV2020 ──',          Grupo: 'Demografía', Total: '',    Categorías: '' },
            { Nombre: 'Población Total',                       Grupo: 'Demografía', Total: demoR.demoData.pobtot,     Categorías: '' },
            { Nombre: 'Población mayor a 60 años',             Grupo: 'Demografía', Total: demoR.demoData.p_60ymas,   Categorías: '' },
            { Nombre: 'Población con discapacidad',            Grupo: 'Demografía', Total: demoR.demoData.pcon_disc,  Categorías: '' },
            { Nombre: 'Total de viviendas habitadas',          Grupo: 'Demografía', Total: demoR.demoData.tvivhab,    Categorías: '' },
            { Nombre: 'Viviendas habitadas sin drenaje',       Grupo: 'Demografía', Total: demoR.demoData.vph_nodren, Categorías: demoR.demoData.hasReserved ? '(*) Datos reservados descartados' : '' },
        ] : [];

        // ── Filas de capas con datos ────────────────────────────────────
        const layerRows = results
            .filter(r => r.operation !== 'suma' && (r.count ?? 0) > 0)
            .map(r => ({
                Nombre:     r.layerName,
                Grupo:      r.group,
                Total:      r.count ?? 0,
                Categorías: r.categorias?.join(' | ') ?? '',
            }));

        const data = [...demoRows, ...layerRows];
        if (data.length === 0) { alert('No hay resultados para exportar'); return; }
        downloadCSVWithBOM(data, `analisis-espacial-${new Date().toISOString().split('T')[0]}.csv`);
    }, [results]);

    // ── Derivados para el render ──────────────────────────────────────────────
    const demoResult   = results.find(r => r.operation === 'suma') ?? null;
    const tableResults = results.filter(r => r.operation !== 'suma');
    const hasResults   = results.length > 0;
    const loadedCount  = results.filter(r => r.count !== null).length;

    const layersWithData = tableResults.filter(r => {
        if (r.operation === 'categorizar') return (r.categorias?.length ?? 0) > 0;
        return (r.count ?? 0) > 0;
    }).length;

    const totalFeatures = tableResults.reduce((sum, r) => sum + (r.count ?? 0), 0);

    const topLayers = tableResults
        .filter(r => (r.count ?? 0) > 0)
        .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
        .slice(0, 5);

    const maxCount = Math.max(...tableResults.map(r => r.count ?? 0), 1);

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <>
        <div className="at-wrapper">
            {!controlled && (
                <button
                    className={`at-fab ${open ? 'at-fab--active' : ''}`}
                    onClick={() => setOpen(!open)}
                    aria-label="Herramienta de análisis espacial"
                    aria-expanded={open}
                >
                    <span style={{ fontSize: '1.1rem' }}>🔍</span>
                    Análisis Espacial
                </button>
            )}

            {isVisible && (
                <div className="at-panel" role="dialog" aria-label="Panel de análisis espacial">

                    {/* ── Header ───────────────────────────────────────────── */}
                    <div className="at-header" data-drag-handle>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                        </svg>
                        <div className="at-header-title">Análisis Espacial</div>
                        <div className="at-header-actions">
                            {hasResults && (
                                <button className="at-icon-btn" onClick={handleReset} title="Nuevo análisis" aria-label="Resetear">↻</button>
                            )}
                            <button
                                className="at-icon-btn at-close-btn"
                                onClick={() => controlled ? onClose?.() : setOpen(false)}
                                aria-label="Cerrar panel"
                            >✕</button>
                        </div>
                    </div>

                    {/* ── Tabs ─────────────────────────────────────────────── */}
                    <div className="at-tabs" role="tablist">
                        <button className={`at-tab ${tab === 'dibujar'     ? 'at-tab--active' : ''}`} onClick={() => setTab('dibujar')}     role="tab" aria-selected={tab === 'dibujar'}>Dibujar</button>
                        <button className={`at-tab ${tab === 'resultados'  ? 'at-tab--active' : ''}`} onClick={() => setTab('resultados')}  role="tab" aria-selected={tab === 'resultados'}  disabled={!hasResults}>Resultados</button>
                        <button className={`at-tab ${tab === 'estadisticas'? 'at-tab--active' : ''}`} onClick={() => setTab('estadisticas')} role="tab" aria-selected={tab === 'estadisticas'} disabled={!hasResults}>Estadísticas</button>
                    </div>

                    {error && <div className="at-error" role="alert">{error}</div>}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* Tab: Dibujar                                          */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {tab === 'dibujar' && (
                        <div className="at-body">
                            <div>
                                <p className="at-mode-label">Tipo de geometría</p>
                                <div className="at-mode-btns">
                                    {(['point', 'line', 'polygon'] as DrawMode[]).map(m => (
                                        <button key={m}
                                            className={`at-mode-btn ${mode === m ? 'at-mode-btn--active' : ''}`}
                                            onClick={() => !drawing && setMode(m)}
                                            disabled={drawing}
                                            aria-label={`Dibujar ${m}`}
                                        >
                                            {m === 'point'   && <><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4"/></svg>Punto</>}
                                            {m === 'line'    && <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3l18 18"/></svg>Línea</>}
                                            {m === 'polygon' && <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l10 6-10 6L2 8z"/></svg>Polígono</>}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {(mode === 'point' || mode === 'line') && (
                                <div className="at-buffer-row">
                                    <label className="at-buffer-label" htmlFor="at-dist">
                                        {mode === 'point' ? 'Radio' : 'Buffer'}:
                                    </label>
                                    <input id="at-dist" type="number" className="at-buffer-input"
                                        value={dist} onChange={e => setDist(e.target.value)}
                                        min="0" step="0.1" disabled={drawing} />
                                    <select className="at-buffer-select" value={unit}
                                        onChange={e => setUnit(e.target.value as DistUnit)} disabled={drawing}>
                                        {Object.entries(UNIT_LABELS).map(([k, v]) => (
                                            <option key={k} value={k}>{v}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {Object.keys(measurements).length > 0 && (
                                <div className="at-measurements">
                                    <p className="at-mode-label">📏 Mediciones</p>
                                    {measurements.length !== undefined && (
                                        <div className="at-measurement-item">Longitud: <strong>{formatMeasurement(measurements.length!, 'length')}</strong></div>
                                    )}
                                    {measurements.area !== undefined && (
                                        <div className="at-measurement-item">Área: <strong>{formatMeasurement(measurements.area, 'area')}</strong></div>
                                    )}
                                    {measurements.buffer !== undefined && (
                                        <div className="at-measurement-item">Buffer: <strong>{formatMeasurement(measurements.buffer, 'length')}</strong></div>
                                    )}
                                </div>
                            )}

                            {!drawing && drawnPtsRef.current.length === 0 && (
                                <p className="at-instructions">
                                    {mode === 'point'   && <>Haz <strong>clic</strong> en el mapa para colocar un punto y crear un área de consulta circular.</>}
                                    {mode === 'line'    && <>Haz <strong>clic</strong> para agregar puntos. <strong>Enter</strong> para finalizar.</>}
                                    {mode === 'polygon' && <>Haz <strong>clic</strong> para agregar vértices. <strong>Enter</strong> para finalizar. <strong>Ctrl+Z</strong> para deshacer.</>}
                                </p>
                            )}

                            {drawing && (mode === 'line' || mode === 'polygon') && (
                                <p className="at-hint">⌨️ <strong>ESC</strong> cancelar · <strong>Enter</strong> finalizar · <strong>Ctrl+Z</strong> deshacer</p>
                            )}

                            <div>
                                {!drawing && drawnPtsRef.current.length === 0 ? (
                                    <button className="at-action-btn" onClick={handleStartDrawing} disabled={!mapInstance}>
                                        ✏ Dibujar en el mapa
                                    </button>
                                ) : drawing && (mode === 'line' || mode === 'polygon') ? (
                                    <button className="at-action-btn at-action-btn--drawing" onClick={handleFinishDrawing}
                                        disabled={(mode === 'line' && drawnPtsRef.current.length < 2) || (mode === 'polygon' && drawnPtsRef.current.length < 3)}>
                                        ✔ Finalizar ({drawnPtsRef.current.length} pts)
                                    </button>
                                ) : (
                                    <button className="at-action-btn" onClick={runAnalysis} disabled={loading}>
                                        {loading ? '⏳ Analizando…' : '🔍 Ejecutar Análisis'}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* Tab: Resultados                                       */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {tab === 'resultados' && hasResults && (
                        <div className="at-body">

                            {/* ── Estado de carga ─────────────────────────── */}
                            {loading && (
                                <div className="at-loading-state">
                                    <div className="at-loading-spinner" />
                                    <p className="at-loading-title">Consultando capas…</p>
                                    <p className="at-loading-progress">{loadedCount} de {results.length} capas analizadas</p>
                                    <div className="at-progress-bar">
                                        <div className="at-progress-fill"
                                            style={{ width: `${(loadedCount / results.length) * 100}%` }} />
                                    </div>
                                </div>
                            )}

                            {/* ── Sección demográfica (INEGI-CPV2020) ─────── */}
                            {demoResult && (
                                <div className="at-demo-section">
                                    <div className="at-demo-header">
                                        <strong>Fuente: INEGI-CPV2020</strong>
                                        {demoResult.count === null && <span className="at-spinner" />}
                                    </div>

                                    {demoResult.demoData?.hasReserved && (
                                        <p className="at-demo-reserved">
                                            (*) Se encontraron datos reservados o confidenciales que se han descartado
                                        </p>
                                    )}

                                    {demoResult.demoData ? (
                                        <table className="at-demo-table">
                                            <tbody>
                                                <tr>
                                                    <td><span className="at-demo-icon">👤</span> Población Total</td>
                                                    <td className="at-demo-val">{demoResult.demoData.pobtot.toLocaleString()}</td>
                                                </tr>
                                                <tr>
                                                    <td><span className="at-demo-icon">👴</span> Población mayor a 60 años</td>
                                                    <td className="at-demo-val">{demoResult.demoData.p_60ymas.toLocaleString()}</td>
                                                </tr>
                                                <tr>
                                                    <td><span className="at-demo-icon">♿</span> Población con discapacidad</td>
                                                    <td className="at-demo-val">{demoResult.demoData.pcon_disc.toLocaleString()}</td>
                                                </tr>
                                                <tr>
                                                    <td><span className="at-demo-icon">🏠</span> Total de viviendas habitadas</td>
                                                    <td className="at-demo-val">{demoResult.demoData.tvivhab.toLocaleString()}</td>
                                                </tr>
                                                <tr>
                                                    <td><span className="at-demo-icon">⚠️</span> Viviendas habitadas sin drenaje</td>
                                                    <td className="at-demo-val">
                                                        {demoResult.demoData.vph_nodren.toLocaleString()}
                                                        {demoResult.demoData.hasReserved ? ' *' : ''}
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    ) : demoResult.count !== null ? (
                                        <p className="at-demo-empty">Sin datos demográficos en el área seleccionada</p>
                                    ) : null}
                                </div>
                            )}

                            {/* ── Sin datos ────────────────────────────────── */}
                            {!loading && layersWithData === 0 && (
                                <div className="at-empty-state">
                                    <div className="at-empty-icon">🔍</div>
                                    <p className="at-empty-title">Sin resultados</p>
                                    <p className="at-empty-desc">Ninguna capa presenta datos dentro del área dibujada.</p>
                                    <button className="at-new-btn" onClick={handleReset}>+ Nuevo análisis</button>
                                </div>
                            )}

                            {/* ── Tabla de resultados ──────────────────────── */}
                            {tableResults.length > 0 && (
                                <>
                                    {!loading && layersWithData > 0 && (
                                        <div className="at-results-summary">
                                            <strong>{layersWithData}</strong> {layersWithData === 1 ? 'capa presenta' : 'capas presentan'} datos
                                            {' '}de <strong>{tableResults.length}</strong> consultadas.
                                        </div>
                                    )}

                                    {!loading && (
                                        <div className="at-export-buttons">
                                            <button className="at-export-btn" onClick={handleExportCSV}>📊 Exportar CSV</button>
                                        </div>
                                    )}

                                    <table className="at-results-table">
                                        <thead>
                                            <tr>
                                                <th>Nombre</th>
                                                <th style={{ minWidth: 90 }}>Total</th>
                                                <th style={{ width: 30 }}>Leyenda</th>
                                                <th style={{ width: 80 }}></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tableResults.map((lr, idx) => {
                                                const { text, hasData } = getDisplayValue(lr);
                                                const isGreen  = GREEN_GROUPS.has(lr.group);
                                                const realIdx  = results.findIndex(r => r.layerId === lr.layerId);

                                                return (
                                                    <React.Fragment key={lr.layerId}>
                                                        <tr className={isGreen ? 'at-row--green' : ''}>
                                                            <td className="at-layer-name">{lr.layerName}</td>
                                                            <td className={hasData ? 'at-count' : 'at-count--zero'}>
                                                                {lr.count === null
                                                                    ? <span className="at-spinner" />
                                                                    : text
                                                                }
                                                            </td>
                                                            <td className="at-legend-cell">
                                                                {hasData && lr.symbolUrl && (
                                                                    <img src={lr.symbolUrl} className="at-legend-img" alt="" />
                                                                )}
                                                                {hasData && !lr.symbolUrl && (
                                                                    <div
                                                                        className="at-legend-poly"
                                                                        style={{ backgroundColor: lr.legendColor ?? '#c7c6ff' }}
                                                                    />
                                                                )}
                                                            </td>
                                                            <td>
                                                                {hasData && (
                                                                    <div style={{ display: 'flex', gap: 4 }}>
                                                                        <button
                                                                            className="at-details-btn"
                                                                            onClick={() => {
                                                                                if (detailLayerId === lr.layerId) setDetailLayerId(null);
                                                                                else loadDetails(lr, realIdx);
                                                                            }}
                                                                            disabled={lr.loadingDetails}
                                                                            aria-expanded={detailLayerId === lr.layerId}
                                                                        >
                                                                            {lr.loadingDetails ? '…' : detailLayerId === lr.layerId ? 'Ocultar' : 'Detalles'}
                                                                        </button>
                                                                        {lr.features && lr.features.length > 0 && (
                                                                            <button className="at-details-btn"
                                                                                onClick={() => showFeaturesOnMap(lr)}
                                                                                title="Ver en mapa">
                                                                                🗺️
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>

                                                        {/* Panel de detalles expandido */}
                                                        {detailLayerId === lr.layerId && lr.features && (
                                                            <tr>
                                                                <td colSpan={4} style={{ padding: '0 8px 10px' }}>
                                                                    <div className="at-detail-panel">
                                                                        <p className="at-detail-panel-title">
                                                                            {lr.layerName} — {lr.features.length} features
                                                                            {(lr.count ?? 0) > lr.features.length
                                                                                ? ` (primeros ${lr.features.length} de ${lr.count})`
                                                                                : ''}
                                                                        </p>
                                                                        {lr.features.length === 0 && (
                                                                            <p style={{ fontSize: '0.76rem', color: 'var(--color-text-muted)', margin: 0 }}>
                                                                                Sin features para mostrar.
                                                                            </p>
                                                                        )}
                                                                        {lr.features.map((f, fi) => {
                                                                            const props   = f.properties ?? {};
                                                                            const name    = pickName(props);
                                                                            const entries = Object.entries(props)
                                                                                .filter(([k]) => !SKIP_FIELDS.has(k))
                                                                                .slice(0, 6);
                                                                            return (
                                                                                <div key={fi} className="at-feature-item">
                                                                                    <div className="at-feature-item-name">{name}</div>
                                                                                    {entries.map(([k, v]) => (
                                                                                        <div key={k} className="at-feature-attr">
                                                                                            {k}: <span>{String(v ?? '—')}</span>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            );
                                                                        })}
                                                                        <button className="at-detail-close" onClick={() => setDetailLayerId(null)}>
                                                                            Cerrar detalles
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {!loading && <button className="at-new-btn" onClick={handleReset}>+ Nuevo análisis</button>}
                                </>
                            )}
                        </div>
                    )}

                    {/* ══════════════════════════════════════════════════════ */}
                    {/* Tab: Estadísticas                                     */}
                    {/* ══════════════════════════════════════════════════════ */}
                    {tab === 'estadisticas' && hasResults && (
                        <div className="at-body">
                            <div className="at-stats-summary">
                                <h3 className="at-stats-title">📊 Resumen General</h3>
                                <div className="at-stats-grid">
                                    <div className="at-stat-card">
                                        <div className="at-stat-value">{totalFeatures.toLocaleString()}</div>
                                        <div className="at-stat-label">Features Totales</div>
                                    </div>
                                    <div className="at-stat-card">
                                        <div className="at-stat-value">{layersWithData}</div>
                                        <div className="at-stat-label">Capas con Datos</div>
                                    </div>
                                    <div className="at-stat-card">
                                        <div className="at-stat-value">{tableResults.length}</div>
                                        <div className="at-stat-label">Capas Totales</div>
                                    </div>
                                </div>

                                {/* Demografía en estadísticas */}
                                {demoResult?.demoData && (
                                    <div style={{ marginTop: 12, fontSize: '0.76rem', color: 'var(--color-text-muted)' }}>
                                        Población total en área: <strong style={{ color: 'var(--color-primary-dark)' }}>
                                            {demoResult.demoData.pobtot.toLocaleString()}
                                        </strong>
                                    </div>
                                )}
                            </div>

                            {topLayers.length > 0 && (
                                <>
                                    <h3 className="at-stats-title">🏆 Top 5 Capas</h3>
                                    <div className="at-chart">
                                        {topLayers.map((lr, i) => (
                                            <div key={lr.layerId} className="at-chart-row">
                                                <span className="at-chart-rank">#{i + 1}</span>
                                                <span className="at-chart-label">{lr.layerName}</span>
                                                <div className="at-chart-bar-container">
                                                    <div className="at-chart-bar"
                                                        style={{ width: `${((lr.count ?? 0) / maxCount) * 100}%` }} />
                                                </div>
                                                <span className="at-chart-value">{(lr.count ?? 0).toLocaleString()}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {(() => {
                                const byGroup = tableResults
                                    .filter(r => (r.count ?? 0) > 0)
                                    .reduce((acc, r) => {
                                        acc[r.group] = (acc[r.group] || 0) + (r.count ?? 0);
                                        return acc;
                                    }, {} as Record<string, number>);
                                const entries = Object.entries(byGroup).sort((a, b) => b[1] - a[1]);
                                return entries.length > 0 ? (
                                    <>
                                        <h3 className="at-stats-title">📁 Distribución por Grupo</h3>
                                        <div className="at-group-stats">
                                            {entries.map(([g, c]) => (
                                                <div key={g} className="at-group-stat-item">
                                                    <span className="at-group-stat-name">{g}</span>
                                                    <span className="at-group-stat-value">{c.toLocaleString()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : null;
                            })()}
                        </div>
                    )}
                </div>
            )}
        </div>

        <ConfirmModal
            isOpen={confirmResetOpen}
            title="Descartar geometría"
            message="¿Descartar la geometría actual y comenzar un nuevo análisis?"
            confirmText="Descartar"
            cancelText="Cancelar"
            confirmVariant="warning"
            icon="🗑️"
            onConfirm={() => { setConfirmResetOpen(false); doReset(); }}
            onCancel={() => setConfirmResetOpen(false)}
        />
        </>
    );
};

export default AnalysisTool;