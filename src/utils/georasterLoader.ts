/**
 * georasterLoader.ts
 * Carga un archivo GeoTIFF local usando georaster + georaster-layer-for-leaflet.
 *
 * Dependencias a instalar:
 *   npm install georaster georaster-layer-for-leaflet
 *
 * georaster parsea el binario TIFF y expone los metadatos necesarios para
 * georaster-layer-for-leaflet, que crea un Layer de Leaflet que renderiza
 * el ráster con canvas tile-by-tile, respetando la proyección y el extent.
 */

export interface GeoRasterResult {
    ok: true;
    georaster: unknown; // instancia de georaster (tipado dinámico)
    bounds: [[number, number], [number, number]]; // [[sur, oeste], [norte, este]]
}

export interface GeoRasterError {
    ok: false;
    error: string;
}

export type GeoRasterParseResult = GeoRasterResult | GeoRasterError;

/** Lee el archivo como ArrayBuffer */
function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload  = () => res(r.result as ArrayBuffer);
        r.onerror = () => rej(new Error('Error leyendo el archivo GeoTIFF'));
        r.readAsArrayBuffer(file);
    });
}

/**
 * Parsea un archivo GeoTIFF local con georaster.
 * Devuelve la instancia de georaster lista para pasarle a GeoRasterLayer.
 */
export async function loadGeoTIFF(file: File): Promise<GeoRasterParseResult> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['tif', 'tiff'].includes(ext)) {
        return { ok: false, error: `El archivo debe ser GeoTIFF (.tif / .tiff), se recibió .${ext}` };
    }

    console.debug(`[georasterLoader] cargando: "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

    // Importación dinámica — requiere: npm install georaster
    let parseGeoraster: (input: ArrayBuffer) => Promise<unknown>;
    try {
        // @ts-expect-error - georaster does not have @types/georaster
        const mod = await import('georaster');
        parseGeoraster = (mod.default ?? mod) as any;
    } catch {
        return {
            ok: false,
            error: 'Falta la dependencia georaster. Ejecuta: npm install georaster georaster-layer-for-leaflet',
        };
    }

    try {
        const buffer   = await readAsArrayBuffer(file);
        const georaster = await parseGeoraster(buffer);

        // georaster expone: xmin, xmax, ymin, ymax en WGS84 (si la proyección está soportada)
        const g = georaster as {
            xmin: number; xmax: number;
            ymin: number; ymax: number;
            noDataValue: number | null;
            numberOfRasters: number;
            pixelWidth: number; pixelHeight: number;
        };

        console.debug(`[georasterLoader] OK | bandas: ${g.numberOfRasters} | extent: [${g.xmin.toFixed(4)}, ${g.ymin.toFixed(4)}, ${g.xmax.toFixed(4)}, ${g.ymax.toFixed(4)}]`);

        const bounds: [[number, number], [number, number]] = [
            [g.ymin, g.xmin],
            [g.ymax, g.xmax],
        ];

        return { ok: true, georaster, bounds };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[georasterLoader] Error:', msg);
        return {
            ok: false,
            error: `Error al parsear el GeoTIFF: ${msg}. Asegúrate de que el archivo tiene proyección WGS84 (EPSG:4326) o una proyección compatible.`,
        };
    }
}
