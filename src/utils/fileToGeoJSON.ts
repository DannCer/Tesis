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
    console.debug('[fileToGeoJSON] parseando como GeoJSON...');
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
    console.debug('[fileToGeoJSON] parseando como KMZ...');
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
    console.debug('[fileToGeoJSON] parseando como KML...');
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
    console.debug('[fileToGeoJSON] parseando como Shapefile ZIP...');
    try {
        // Importación dinámica — requiere: npm install shpjs
        let shp: any;
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
        console.debug(`[fileToGeoJSON] Shapefile OK: ${fc.features.length} features`);
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
    console.debug(`[fileToGeoJSON] archivo: "${file.name}" | tamaño: ${(file.size/1024).toFixed(1)} KB | ext: .${ext}`);

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
