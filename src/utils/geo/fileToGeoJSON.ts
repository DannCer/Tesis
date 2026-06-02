/**
 * fileToGeoJSON.ts
 * Convierte archivos locales a GeoJSON FeatureCollection.
 *
 * Formatos soportados:
 *  - .geojson / .json  → parseo nativo
 *  - .kmz              → descomprime con JSZip → KML → GeoJSON (sin deps externas)
 *  - .kml              → KML → GeoJSON con DOMParser
 *  - .zip              → Shapefile ZIP (shp + dbf + prj + .prj) usando shpjs
 *
 * Dependencias a instalar:
 *   npm install jszip shpjs
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ParseResult =
    | { ok: true;  data: GeoJSON.FeatureCollection }
    | { ok: false; error: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readAsText(file: File | Blob): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result as string);
        r.onerror = () => rej(new Error('Error leyendo el archivo como texto'));
        r.readAsText(file, 'UTF-8');
    });
}

function readAsArrayBuffer(file: File | Blob): Promise<ArrayBuffer> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result as ArrayBuffer);
        r.onerror = () => rej(new Error('Error leyendo el archivo como binario'));
        r.readAsArrayBuffer(file);
    });
}

// ─── GeoJSON ─────────────────────────────────────────────────────────────────

async function parseGeoJSON(file: File): Promise<ParseResult> {
    if (import.meta.env.DEV) { console.debug('[fileToGeoJSON] parseando como GeoJSON...'); }
    try {
        const text = await readAsText(file);
        const json = JSON.parse(text) as GeoJSON.GeoJSON;
        if (json.type === 'FeatureCollection') {
            return { ok: true, data: json as GeoJSON.FeatureCollection };
        }
        if (json.type === 'Feature') {
            return { ok: true, data: { type: 'FeatureCollection', features: [json as GeoJSON.Feature] } };
        }
        if (json.type === 'GeometryCollection' || json.type?.includes('Geometry') || json.type?.includes('Point') || json.type?.includes('Line') || json.type?.includes('Polygon')) {
            return {
                ok: true,
                data: {
                    type: 'FeatureCollection',
                    features: [{ type: 'Feature', geometry: json as GeoJSON.Geometry, properties: {} }],
                },
            };
        }
        return { ok: false, error: 'El JSON no contiene una geometría GeoJSON reconocida' };
    } catch (e) {
        return { ok: false, error: `Error al parsear GeoJSON: ${(e as Error).message}` };
    }
}

// ─── KML → GeoJSON (sin dependencias) ────────────────────────────────────────

function kmlToGeoJSON(kmlText: string): GeoJSON.FeatureCollection {
    const parser  = new DOMParser();
    const xmlDoc  = parser.parseFromString(kmlText, 'text/xml');
    const features: GeoJSON.Feature[] = [];

    const placemarks = xmlDoc.querySelectorAll('Placemark');

    placemarks.forEach(pm => {
        const name        = pm.querySelector('name')?.textContent?.trim() ?? '';
        const description = pm.querySelector('description')?.textContent?.trim() ?? '';
        const properties: Record<string, string> = { name, description };

        // Extended data
        pm.querySelectorAll('Data, SimpleData').forEach(d => {
            const key = d.getAttribute('name') ?? d.tagName;
            const val = d.querySelector('value')?.textContent ?? d.textContent ?? '';
            properties[key] = val.trim();
        });

        const geometry = extractKMLGeometry(pm);
        if (geometry) {
            features.push({ type: 'Feature', geometry, properties });
        }
    });

    return { type: 'FeatureCollection', features };
}

function extractKMLGeometry(node: Element): GeoJSON.Geometry | null {
    const parseCoords = (text: string): number[][] =>
        text.trim().split(/\s+/).map(c => {
            const [lng, lat, alt] = c.split(',').map(Number);
            return alt !== undefined && !isNaN(alt) ? [lng, lat, alt] : [lng, lat];
        });

    const point = node.querySelector('Point > coordinates');
    if (point) {
        const [lng, lat] = (point.textContent ?? '').trim().split(',').map(Number);
        return { type: 'Point', coordinates: [lng, lat] };
    }

    const line = node.querySelector('LineString > coordinates');
    if (line) {
        return { type: 'LineString', coordinates: parseCoords(line.textContent ?? '') };
    }

    const poly = node.querySelector('Polygon');
    if (poly) {
        const rings: number[][][] = [];
        const outer = poly.querySelector('outerBoundaryIs coordinates');
        if (outer) rings.push(parseCoords(outer.textContent ?? ''));
        poly.querySelectorAll('innerBoundaryIs coordinates').forEach(inner => {
            rings.push(parseCoords(inner.textContent ?? ''));
        });
        return { type: 'Polygon', coordinates: rings };
    }

    const multi = node.querySelector('MultiGeometry');
    if (multi) {
        const geoms: GeoJSON.Geometry[] = [];
        Array.from(multi.children).forEach(child => {
            const g = extractKMLGeometry(child);
            if (g) geoms.push(g);
        });
        if (geoms.length) return { type: 'GeometryCollection', geometries: geoms };
    }

    return null;
}

// ─── KMZ → GeoJSON ───────────────────────────────────────────────────────────

async function parseKMZ(file: File): Promise<ParseResult> {
    if (import.meta.env.DEV) { console.debug('[fileToGeoJSON] parseando como KMZ...'); }
    try {
        // Importación dinámica — requiere: npm install jszip
        let JSZip: typeof import('jszip');
        try {
            JSZip = (await import('jszip')).default as unknown as typeof import('jszip');
        } catch {
            return {
                ok: false,
                error: 'Falta la dependencia JSZip. Ejecuta: npm install jszip',
            };
        }

        const buffer  = await readAsArrayBuffer(file);
        const zip     = await JSZip.loadAsync(buffer);
        const kmlFile = Object.keys(zip.files).find(name =>
            name.toLowerCase().endsWith('.kml') && !zip.files[name].dir
        );
        if (!kmlFile) return { ok: false, error: 'No se encontró ningún archivo .kml dentro del KMZ' };

        const kmlText = await zip.files[kmlFile].async('text');
        const fc      = kmlToGeoJSON(kmlText);
        if (!fc.features.length) {
            return { ok: false, error: 'El KMZ no contiene geometrías reconocibles (Placemarks)' };
        }
        return { ok: true, data: fc };
    } catch (e) {
        return { ok: false, error: `Error al procesar KMZ: ${(e as Error).message}` };
    }
}

// ─── KML → GeoJSON ───────────────────────────────────────────────────────────

async function parseKML(file: File): Promise<ParseResult> {
    if (import.meta.env.DEV) { console.debug('[fileToGeoJSON] parseando como KML...'); }
    try {
        const text = await readAsText(file);
        const fc   = kmlToGeoJSON(text);
        if (!fc.features.length) {
            return { ok: false, error: 'El KML no contiene geometrías reconocibles (Placemarks)' };
        }
        return { ok: true, data: fc };
    } catch (e) {
        return { ok: false, error: `Error al procesar KML: ${(e as Error).message}` };
    }
}

// ─── Shapefile → GeoJSON ─────────────────────────────────────────────────────

async function parseShapefile(file: File): Promise<ParseResult> {
    if (import.meta.env.DEV) { console.debug('[fileToGeoJSON] parseando como Shapefile ZIP...'); }
    try {
        // Importación dinámica — requiere: npm install shpjs
        let shp: { default: (buffer: ArrayBuffer) => Promise<unknown> };
        try {
            shp = await import('shpjs');
        } catch {
            return {
                ok: false,
                error: 'Falta la dependencia shpjs. Ejecuta: npm install shpjs',
            };
        }

        const buffer = await readAsArrayBuffer(file);

        // shpjs recibe el .zip con shp + dbf + prj para preservar atributos y proyección
        const result = await shp.default(buffer);

        // shpjs puede devolver un array de FeatureCollections (múltiples capas en el zip)
        const fc: GeoJSON.FeatureCollection = Array.isArray(result)
            ? { type: 'FeatureCollection', features: result.flatMap((r: GeoJSON.FeatureCollection) => r.features) }
            : result as GeoJSON.FeatureCollection;

        if (!fc.features?.length) {
            return { ok: false, error: 'El Shapefile no contiene features' };
        }
        if (import.meta.env.DEV) { console.debug(`[fileToGeoJSON] Shapefile OK: ${fc.features.length} features`); }
        return { ok: true, data: fc };
    } catch (e) {
        return { ok: false, error: `Error al procesar Shapefile: ${(e as Error).message}` };
    }
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Convierte un File a GeoJSON FeatureCollection.
 * Detecta el formato por extensión del archivo.
 */
export async function fileToGeoJSON(file: File): Promise<ParseResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (import.meta.env.DEV) { console.debug(`[fileToGeoJSON] archivo: "${file.name}" | tamaño: ${(file.size/1024).toFixed(1)} KB | ext: .${ext}`); }

    switch (ext) {
        case 'geojson':
        case 'json':
            return parseGeoJSON(file);

        case 'kml':
            return parseKML(file);

        case 'kmz':
            return parseKMZ(file);

        case 'zip':
            return parseShapefile(file);

        default:
            return {
                ok: false,
                error: `Formato no soportado: .${ext}. Usa GeoJSON, KML, KMZ o Shapefile comprimido (.zip con .shp + .dbf + .prj)`,
            };
    }
}

/**
 * Extensiones aceptadas para el input de archivo vectorial.
 */
export const VECTOR_ACCEPT = '.geojson,.json,.kml,.kmz,.zip';

/**
 * Nombre amigable del formato detectado.
 */
export function getFormatLabel(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
        geojson: 'GeoJSON', json: 'GeoJSON',
        kml: 'KML', kmz: 'KMZ',
        zip: 'Shapefile (ZIP)',
    };
    return map[ext] ?? ext.toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSIÓN GEOJSON → KML (cliente)
// ═══════════════════════════════════════════════════════════════════════════
//
// QGIS Server con WFS 1.1.0 frecuentemente ignora outputFormat=application/vnd.google-earth.kml+xml
// y devuelve wfs:FeatureCollection (XML WFS), que Google Earth rechaza.
// La solución es pedir siempre GeoJSON (que sí funciona) y convertir en cliente.

const KML_GEOM_COLORS: Record<string, string> = {
    Point:           'ff0000ff', // rojo — puntos
    MultiPoint:      'ff0000ff',
    LineString:      'ffff0000', // azul — líneas
    MultiLineString: 'ffff0000',
    Polygon:         '8000ff00', // verde semi-transparente — polígonos
    MultiPolygon:    '8000ff00',
};

/**
 * Convierte coordenadas GeoJSON [lng, lat, alt?] al formato KML "lng,lat,alt".
 */
function coordsToKml(coords: number[]): string {
    return `${coords[0]},${coords[1]},${coords[2] ?? 0}`;
}

/**
 * Serializa una geometría GeoJSON al elemento KML correspondiente.
 */
function geometryToKml(geom: GeoJSON.Geometry | null): string {
    if (!geom) return '';
    switch (geom.type) {
        case 'Point':
            return `<Point><coordinates>${coordsToKml(geom.coordinates)}</coordinates></Point>`;
        case 'MultiPoint':
            return geom.coordinates.map(c =>
                `<Point><coordinates>${coordsToKml(c)}</coordinates></Point>`
            ).join('\n');
        case 'LineString':
            return `<LineString><coordinates>${geom.coordinates.map(coordsToKml).join(' ')}</coordinates></LineString>`;
        case 'MultiLineString':
            return geom.coordinates.map(line =>
                `<LineString><coordinates>${line.map(coordsToKml).join(' ')}</coordinates></LineString>`
            ).join('\n');
        case 'Polygon': {
            const [outer, ...holes] = geom.coordinates;
            const outerRing = `<outerBoundaryIs><LinearRing><coordinates>${outer.map(coordsToKml).join(' ')}</coordinates></LinearRing></outerBoundaryIs>`;
            const innerRings = holes.map(h =>
                `<innerBoundaryIs><LinearRing><coordinates>${h.map(coordsToKml).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`
            ).join('\n');
            return `<Polygon>${outerRing}${innerRings}</Polygon>`;
        }
        case 'MultiPolygon':
            return geom.coordinates.map(poly => {
                const [outer, ...holes] = poly;
                const outerRing = `<outerBoundaryIs><LinearRing><coordinates>${outer.map(coordsToKml).join(' ')}</coordinates></LinearRing></outerBoundaryIs>`;
                const innerRings = holes.map(h =>
                    `<innerBoundaryIs><LinearRing><coordinates>${h.map(coordsToKml).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`
                ).join('\n');
                return `<Polygon>${outerRing}${innerRings}</Polygon>`;
            }).join('\n');
        case 'GeometryCollection':
            return geom.geometries.map(geometryToKml).join('\n');
        default:
            return '';
    }
}

/**
 * Escapa caracteres especiales XML en valores de atributos.
 */
function escapeXml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&apos;');
}

/**
 * Convierte un GeoJSON FeatureCollection a texto KML.
 * Genera un Placemark por feature con:
 *   - <name>: primer campo de propiedades tipo string, o "Feature N"
 *   - <description>: tabla HTML con todos los atributos
 *   - <Style>: color según tipo de geometría
 *   - Geometría KML correspondiente
 *
 * @param fc   - FeatureCollection GeoJSON de entrada
 * @param name - Nombre de la carpeta KML (típicamente el nombre de la capa)
 */
export function geoJSONToKML(fc: GeoJSON.FeatureCollection, name = 'Capa'): string {
    const geomType = fc.features[0]?.geometry?.type ?? 'Point';
    const color    = KML_GEOM_COLORS[geomType] ?? 'ff0000ff';

    const placemarks = fc.features.map((f, i) => {
        const props = f.properties ?? {};
        // Nombre: primer campo string no vacío, o fallback "Feature N"
        const nameVal =
            Object.values(props).find(v => typeof v === 'string' && v.trim().length > 0)
            ?? `Feature ${i + 1}`;

        // Descripción como tabla HTML
        const rows = Object.entries(props)
            .map(([k, v]) => `<tr><td><b>${escapeXml(k)}</b></td><td>${escapeXml(v)}</td></tr>`)
            .join('');
        const description = rows
            ? `<![CDATA[<table border="1" cellpadding="4">${rows}</table>]]>`
            : '';

        return `    <Placemark>
      <name>${escapeXml(nameVal)}</name>
      <description>${description}</description>
      <Style>
        <LineStyle><color>${color}</color><width>2</width></LineStyle>
        <PolyStyle><color>${color}</color></PolyStyle>
        <IconStyle><color>${color}</color></IconStyle>
      </Style>
      ${geometryToKml(f.geometry)}
    </Placemark>`;
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(name)}</name>
    <Folder>
      <name>${escapeXml(name)}</name>
${placemarks.join('\n')}
    </Folder>
  </Document>
</kml>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PARSEO DE RESPUESTA WFS XML → GEOJSON (fallback cliente)
// ═══════════════════════════════════════════════════════════════════════════
//
// QGIS Server a veces ignora outputFormat y devuelve wfs:FeatureCollection
// XML aunque se pida SHAPE-ZIP o application/json.
// Este parser convierte esa respuesta a GeoJSON en cliente como fallback.

/**
 * Detecta si un string es una respuesta WFS XML de QGIS Server.
 */
export function isWfsXml(text: string): boolean {
    const trimmed = text.trimStart();
    return trimmed.startsWith('<wfs:FeatureCollection') ||
           trimmed.startsWith('<FeatureCollection') ||
           (trimmed.startsWith('<') && trimmed.includes('wfs:FeatureCollection'));
}

/**
 * Extrae coordenadas geográficas de un feature WFS.
 * Estrategia:
 *   1. Busca campos lat/lon/latitude/longitude/x/y en las propiedades
 *   2. Intenta parsear gml:coordinates como lon,lat (si parecen geográficas)
 *   3. Devuelve null si no puede determinar la posición
 */
function extractLatLon(
    props: Record<string, string>,
    gmlCoords: string | null
): [number, number] | null {

    // 1. Campos de propiedades nombrados explícitamente
    const latKeys = ['lat', 'latitude', 'latitud', 'y_coord', 'y'];
    const lonKeys = ['lon', 'long', 'long_', 'lng', 'longitude', 'longitud', 'x_coord', 'x'];

    const latKey = latKeys.find(k => k in props);
    const lonKey = lonKeys.find(k => k in props);

    if (latKey && lonKey) {
        const lat = parseFloat(props[latKey]);
        const lon = parseFloat(props[lonKey]);
        if (!isNaN(lat) && !isNaN(lon) &&
            lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            return [lon, lat];
        }
    }

    // 2. gml:coordinates en formato "lon,lat" o "x y"
    if (gmlCoords) {
        const parts = gmlCoords.trim().split(/[\s,]+/);
        if (parts.length >= 2) {
            const a = parseFloat(parts[0]);
            const b = parseFloat(parts[1]);
            // Verificar si parecen coordenadas geográficas (no proyectadas)
            if (!isNaN(a) && !isNaN(b)) {
                if (Math.abs(a) <= 180 && Math.abs(b) <= 90)  return [a, b];
                if (Math.abs(b) <= 180 && Math.abs(a) <= 90)  return [b, a];
            }
        }
    }

    return null;
}

/**
 * Convierte una respuesta WFS XML de QGIS Server a GeoJSON FeatureCollection.
 * Soporta Point, LineString y Polygon desde gml:coordinates.
 * Si las coordenadas están en CRS proyectado, usa lat/lon de las propiedades.
 */
export function wfsXmlToGeoJSON(xmlText: string): GeoJSON.FeatureCollection {
    const parser  = new DOMParser();
    const xmlDoc  = parser.parseFromString(xmlText, 'application/xml');

    const NS_GML = 'http://www.opengis.net/gml';
    const features: GeoJSON.Feature[] = [];

    // En QGIS Server, featureMember está bajo gml: no wfs:
    const members = xmlDoc.getElementsByTagNameNS('http://www.opengis.net/gml', 'featureMember');

    for (let i = 0; i < members.length; i++) {
        const member = members[i];

        // Recopilar propiedades (todos los elementos hoja no-GML)
        const props: Record<string, string> = {};
        const allEls = member.getElementsByTagName('*');
        for (let j = 0; j < allEls.length; j++) {
            const el = allEls[j];
            const ns = el.namespaceURI ?? '';
            // Solo excluir namespaces de estructura (gml/wfs), incluir propiedades qgs
            if (ns === 'http://www.opengis.net/gml' || ns === 'http://www.opengis.net/wfs') continue;
            const localName = el.localName;
            const text = el.textContent?.trim() ?? '';
            if (text && !el.children.length) {
                props[localName] = text;
            }
        }

        // Intentar extraer geometría GML
        let geometry: GeoJSON.Geometry | null = null;

        const pointEl    = member.getElementsByTagNameNS(NS_GML, 'Point')[0];
        const lineEl     = member.getElementsByTagNameNS(NS_GML, 'LineString')[0];
        const polygonEl  = member.getElementsByTagNameNS(NS_GML, 'Polygon')[0];

        const getCoordsText = (el: Element | undefined): string | null => {
            if (!el) return null;
            const c = el.getElementsByTagNameNS(NS_GML, 'coordinates')[0]
                   ?? el.getElementsByTagNameNS(NS_GML, 'pos')[0]
                   ?? el.getElementsByTagNameNS(NS_GML, 'posList')[0];
            return c?.textContent?.trim() ?? null;
        };

        const parseCoordPairs = (text: string): [number, number][] => {
            const tuples = text.trim().split(/\s+/);
            return tuples
                .map(t => t.split(',').map(Number))
                .filter(p => p.length >= 2 && !p.some(isNaN))
                .map(p => [p[0], p[1]] as [number, number]);
        };

        const gmlCoordsText = getCoordsText(pointEl ?? lineEl ?? polygonEl);
        const latLon = extractLatLon(props, gmlCoordsText);

        if (pointEl && latLon) {
            geometry = { type: 'Point', coordinates: latLon };
        } else if (lineEl) {
            const raw = getCoordsText(lineEl);
            if (raw) geometry = { type: 'LineString', coordinates: parseCoordPairs(raw) };
        } else if (polygonEl) {
            const outerEl = polygonEl.getElementsByTagNameNS(NS_GML, 'outerBoundaryIs')[0]
                          ?? polygonEl.getElementsByTagNameNS(NS_GML, 'exterior')[0];
            const raw = getCoordsText(outerEl);
            if (raw) geometry = { type: 'Polygon', coordinates: [parseCoordPairs(raw)] };
        } else if (latLon) {
            // Solo propiedades lat/lon, sin geometría GML útil
            geometry = { type: 'Point', coordinates: latLon };
        }

        if (geometry) {
            features.push({ type: 'Feature', geometry, properties: props });
        }
    }

    return { type: 'FeatureCollection', features };
}
