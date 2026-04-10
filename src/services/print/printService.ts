/**
 * @fileoverview Servicio de impresión — WMS GetMap + mapa base + leyenda en HTML.
 *
 * Estrategia:
 *  1. Se genera una página HTML con el mapa base (tiles OSM/ESRI vía URL de tiles)
 *     como imagen de fondo, y encima la imagen WMS GetMap (capas vectoriales/ráster)
 *     con transparencia.
 *  2. La leyenda se incluye como un panel HTML lateral generado desde los datos de
 *     las capas activas (igual que el componente Legend.tsx).
 *  3. El usuario abre la página en una ventana nueva y usa Ctrl+P → PDF.
 *
 * No requiere ningún template en QGIS Server.
 */

import { config } from '../../config/env';
import type { LayerConfig } from '../../config/layers';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type PrintOrient = 'portrait' | 'landscape';
export type PrintDPI    = 96 | 150 | 300;

export interface PaperSize {
    id:      string;
    label:   string;
    /** [ancho, alto] en mm en portrait */
    mm:      [number, number];
    custom?: true;
}

export const PAPER_SIZES: PaperSize[] = [
    { id: 'a4',     label: 'A4',    mm: [210,  297] },
    { id: 'a3',     label: 'A3',    mm: [297,  420] },
    { id: 'a2',     label: 'A2',    mm: [420,  594] },
    { id: 'a1',     label: 'A1',    mm: [594,  841] },
    { id: 'a0',     label: 'A0',    mm: [841, 1189] },
    { id: 'letter', label: 'Carta', mm: [216,  279] },
    { id: 'legal',  label: 'Legal', mm: [216,  356] },
    { id: 'custom', label: 'Custom',mm: [297,  420], custom: true },
];

export const DPI_OPTIONS: { value: PrintDPI; label: string; hint: string }[] = [
    { value: 96,  label: '96',  hint: 'Rápido' },
    { value: 150, label: '150', hint: 'Estándar' },
    { value: 300, label: '300', hint: 'Alta calidad' },
];

/** Escalas cartográficas estándar */
export const STANDARD_SCALES = [
    { label: '1 : 1,000',       value: 1_000 },
    { label: '1 : 2,500',       value: 2_500 },
    { label: '1 : 5,000',       value: 5_000 },
    { label: '1 : 10,000',      value: 10_000 },
    { label: '1 : 25,000',      value: 25_000 },
    { label: '1 : 50,000',      value: 50_000 },
    { label: '1 : 100,000',     value: 100_000 },
    { label: '1 : 250,000',     value: 250_000 },
    { label: '1 : 500,000',     value: 500_000 },
    { label: '1 : 1,000,000',   value: 1_000_000 },
    { label: '1 : 2,500,000',   value: 2_500_000 },
    { label: '1 : 5,000,000',   value: 5_000_000 },
    { label: 'Automática',      value: 0 },
];

export interface PrintLayer {
    wmsName: string;
    opacity: number; // 0–1
    legendUrl?: string;
    name?: string;
}

export interface LegendItem {
    layerName: string;
    imageUrl:  string;
}

export interface PrintJob {
    paper:       PaperSize;
    orientation: PrintOrient;
    customMm?:   [number, number];
    dpi:         PrintDPI;
    extent:      [number, number, number, number]; // [minX, minY, maxX, maxY] WGS-84
    crs:         string;
    layers:      PrintLayer[];
    useProject:  'vector' | 'raster';
    baseMapUrl:  string;   // URL de tiles: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
    baseMapName: string;   // "OpenStreetMap", "ESRI Satélite", etc.
    scaleMode:   'auto' | 'fixed';
    fixedScale?: number;
    title?:      string;
    subtitle?:   string;
    author?:     string;
    notes?:      string;
    // GetPrint opcional
    template?:   string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getPageMm(paper: PaperSize, orient: PrintOrient, customMm?: [number, number]): [number, number] {
    const [w, h] = (paper.custom && customMm) ? customMm : paper.mm;
    return orient === 'landscape'
        ? [Math.max(w, h), Math.min(w, h)]
        : [Math.min(w, h), Math.max(w, h)];
}

export function getPagePx(pageMm: [number, number], dpi: PrintDPI): [number, number] {
    return [Math.round(pageMm[0] / 25.4 * dpi), Math.round(pageMm[1] / 25.4 * dpi)];
}

export function estimateScale(extent: [number, number, number, number], pageMmW: number): number {
    const [minx, miny, maxx, maxy] = extent;
    const latC   = (miny + maxy) / 2;
    const mPerDeg = 111_320 * Math.cos((latC * Math.PI) / 180);
    return Math.round((maxx - minx) * mPerDeg / (pageMmW / 1_000));
}

/** Escala estándar más cercana al valor calculado */
export function snapToStandardScale(raw: number): number {
    const candidates = STANDARD_SCALES.filter(s => s.value > 0).map(s => s.value);
    return candidates.reduce((best, s) => Math.abs(s - raw) < Math.abs(best - raw) ? s : best);
}

export function fmtScale(n: number): string {
    return `1 : ${n.toLocaleString('es-MX')}`;
}

// ─── URL WMS GetMap ───────────────────────────────────────────────────────────

/**
 * Construye la URL GetMap de QGIS para todas las capas activas.
 * Usa CRS EPSG:4326 con el orden de ejes correcto para WMS 1.3.0 (lat,lon).
 */
export function buildGetMapUrl(job: PrintJob): string | null {
    if (!job.layers.length) return null;
    const pageMm   = getPageMm(job.paper, job.orientation, job.customMm);
    const [pw, ph] = getPagePx(pageMm, job.dpi);
    const MAX_PX   = 8192;
    const sc       = Math.max(1, Math.max(pw, ph) / MAX_PX);
    const [minx, miny, maxx, maxy] = job.extent;

    const baseUrl = job.useProject === 'raster'
        ? config.qgisServer.wmsRasterUrl
        : config.qgisServer.wmsUrl;

    const p = new URLSearchParams();
    p.set('SERVICE',        'WMS');
    p.set('VERSION',        '1.3.0');
    p.set('REQUEST',        'GetMap');
    p.set('LAYERS',         [...job.layers].reverse().map(l => l.wmsName).join(','));
    p.set('OPACITIES',      [...job.layers].reverse().map(l => Math.round(l.opacity * 255)).join(','));
    p.set('STYLES',         job.layers.map(() => '').join(','));
    p.set('CRS',            'EPSG:4326');
    // WMS 1.3 con EPSG:4326: BBOX = miny,minx,maxy,maxx
    p.set('BBOX',           `${miny},${minx},${maxy},${maxx}`);
    p.set('WIDTH',          String(Math.round(pw / sc)));
    p.set('HEIGHT',         String(Math.round(ph / sc)));
    p.set('FORMAT',         'image/png');
    p.set('TRANSPARENT',    'true');
    p.set('DPI',            String(job.dpi));
    p.set('MAP_RESOLUTION', String(job.dpi));

    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${p.toString()}`;
}

/**
 * URL de leyenda WMS para una capa (GetLegendGraphic).
 */
export function buildLegendUrl(layerName: string, useProject: 'vector' | 'raster'): string {
    const baseUrl = useProject === 'raster'
        ? config.qgisServer.wmsRasterUrl
        : config.qgisServer.wmsUrl;
    const p = new URLSearchParams({
        SERVICE: 'WMS', REQUEST: 'GetLegendGraphic',
        VERSION: '1.3.0', FORMAT: 'image/png',
        LAYER: layerName, TRANSPARENT: 'true',
        LEGEND_OPTIONS: 'fontAntiAliasing:true;fontSize:11;dpi:120',
    });
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${p.toString()}`;
}

// ─── Conversión de tiles de mapa base ────────────────────────────────────────

// ─── Matemáticas de proyección Web Mercator ───────────────────────────────────

/**
 * Proyección Web Mercator: lon/lat → unidades de "píxeles de tile" globales.
 * Todas las operaciones de posicionamiento se hacen en este espacio,
 * luego se convierten a porcentajes del extent para que funcionen
 * independientemente de la resolución del contenedor CSS.
 */
function mercX(lon: number, zoom: number): number {
    return ((lon + 180) / 360) * Math.pow(2, zoom) * 256;
}

function mercY(lat: number, zoom: number): number {
    const r = lat * Math.PI / 180;
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * Math.pow(2, zoom) * 256;
}

/**
 * Tile XYZ que contiene una coordenada lat/lon en un zoom dado.
 */
function latLonToTile(lat: number, lon: number, zoom: number) {
    return {
        x: Math.floor(mercX(lon, zoom) / 256),
        y: Math.floor(mercY(lat, zoom) / 256),
    };
}

/**
 * Zoom óptimo para que el extent quede cubierto con un número razonable de tiles.
 * Objetivo: entre 4 y 16 tiles en la dimensión más larga.
 */
function calcZoom(extent: [number, number, number, number]): number {
    const [minx, miny, maxx, maxy] = extent;
    for (let z = 17; z >= 1; z--) {
        const tNW = latLonToTile(maxy, minx, z);
        const tSE = latLonToTile(miny, maxx, z);
        const cols = tSE.x - tNW.x + 1;
        const rows = tSE.y - tNW.y + 1;
        if (cols <= 12 && rows <= 12) return z;
    }
    return 3;
}

/**
 * Tile del mapa base con posición en PORCENTAJES del contenedor.
 *
 * Al usar %, el tile se posiciona correctamente sin importar si el contenedor
 * mide 600 px (pantalla) o 1800 px (impresión a 300 dpi).
 */
export interface TileInfo {
    url:      string;
    leftPct:  number;
    topPct:   number;
    wPct:     number;
    hPct:     number;
}

export function getBaseTiles(
    tileUrlTemplate: string,
    extent: [number, number, number, number],
): TileInfo[] {
    if (!tileUrlTemplate) return [];

    const zoom = calcZoom(extent);
    const [minx, miny, maxx, maxy] = extent;

    // Bounds del extent en espacio Mercator
    const ox  = mercX(minx, zoom);   // left edge
    const oy  = mercY(maxy, zoom);   // top edge  (maxy = north → smaller mercY)
    const ew  = mercX(maxx, zoom) - ox;
    const eh  = mercY(miny, zoom) - oy;

    if (ew <= 0 || eh <= 0) return [];

    const tNW = latLonToTile(maxy, minx, zoom);
    const tSE = latLonToTile(miny, maxx, zoom);

    const subdomains = ['a', 'b', 'c'];
    const tiles: TileInfo[] = [];

    for (let tx = tNW.x; tx <= tSE.x; tx++) {
        for (let ty = tNW.y; ty <= tSE.y; ty++) {
            // Tile edges in Mercator space
            const tileLeft = tx * 256;
            const tileTop  = ty * 256;

            // Convert to % of the extent
            const leftPct = (tileLeft - ox) / ew * 100;
            const topPct  = (tileTop  - oy) / eh * 100;
            const wPct    = 256 / ew * 100;
            const hPct    = 256 / eh * 100;

            const s = subdomains[(tx + ty) % 3];
            const url = tileUrlTemplate
                .replace('{s}', s)
                .replace('{z}', String(zoom))
                .replace('{x}', String(tx))
                .replace('{y}', String(ty));

            tiles.push({ url, leftPct, topPct, wPct, hPct });
        }
    }
    return tiles;
}

// ─── HTML de impresión ────────────────────────────────────────────────────────

export function buildPrintHtml(job: PrintJob): string {
    const pageMm    = getPageMm(job.paper, job.orientation, job.customMm);
    const [pw, ph]  = pageMm;

    // Escala
    const autoScale = estimateScale(job.extent, pw);
    const rawScale  = job.scaleMode === 'fixed' && job.fixedScale ? job.fixedScale : autoScale;
    const finalScale = snapToStandardScale(rawScale);

    const now = new Date().toLocaleDateString('es-MX', { year:'numeric', month:'long', day:'numeric' });
    const [minx, miny, maxx, maxy] = job.extent;

    // WMS overlay URL
    const wmsUrl  = buildGetMapUrl(job) ?? '';
    // Tiles del mapa base (posicionamiento en % — no depende del tamaño del contenedor)
    const tiles   = job.baseMapUrl
        ? getBaseTiles(job.baseMapUrl, job.extent)
        : [];

    // Leyenda (imágenes WMS GetLegendGraphic)
    const legendItems = job.layers.map(l => ({
        name: l.name ?? l.wmsName,
        url:  buildLegendUrl(l.wmsName, job.useProject),
    }));

    // Barra de escala gráfica: elegir división razonable
    const barKm = (finalScale * 40) / 1_000_000; // 40mm en km
    const barLabel = barKm >= 1 ? `${Math.round(barKm)} km` : `${Math.round(barKm * 1000)} m`;

    // Tiles HTML — posición en % para funcionar a cualquier resolución
    const tilesHtml = tiles.map(t =>
        `<img src="${t.url}" style="position:absolute;left:${t.leftPct.toFixed(4)}%;top:${t.topPct.toFixed(4)}%;width:${t.wPct.toFixed(4)}%;height:${t.hPct.toFixed(4)}%;display:block;" crossorigin="anonymous" />`
    ).join('\n');

    // Leyenda HTML
    const legendHtml = legendItems.map(item => `
        <div class="leg-item">
            <div class="leg-name">${item.name}</div>
            <img src="${item.url}" class="leg-img" crossorigin="anonymous"
                 onerror="this.parentElement.style.display='none'" />
        </div>`).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${job.title || 'Mapa'}</title>
<style>
*  { margin:0; padding:0; box-sizing:border-box; }
@page {
    size: ${pw}mm ${ph}mm;
    margin: 0;
}
html, body {
    width: ${pw}mm; height: ${ph}mm;
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #fff;
}

/* ── Barra de herramientas (solo en pantalla) ── */
.toolbar {
    position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
    background: #8d1c3d; color: #fff;
    padding: 8px 18px;
    display: flex; align-items: center; justify-content: space-between;
    font-size: 13px; gap: 12px;
}
.toolbar-info { opacity: .85; font-size: 12px; }
.btn-print {
    padding: 7px 20px; background: #fff; color: #8d1c3d;
    border: none; border-radius: 6px; font-weight: 700; font-size: 13px;
    cursor: pointer; flex-shrink: 0;
}
.btn-print:hover { background: #ffe0ea; }

/* ── Hoja ── */
.page {
    width: ${pw}mm; height: ${ph}mm;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-columns: 1fr ${pw > 200 ? '52mm' : '44mm'};
    grid-template-areas:
        "header header"
        "map    legend"
        "footer footer";
    gap: 0;
    overflow: hidden;
}

/* ── Cabecera ── */
.header {
    grid-area: header;
    display: flex; align-items: flex-start; justify-content: space-between;
    padding: 5mm 6mm 4mm;
    border-bottom: 2.5pt solid #8d1c3d;
}
.h-left { flex: 1; }
.h-title {
    font-size: ${pw > 280 ? 16 : pw > 200 ? 13 : 11}pt;
    font-weight: 800; color: #8d1c3d; line-height: 1.2;
}
.h-subtitle { font-size: ${pw > 200 ? 10 : 8}pt; color: #777; margin-top: 1mm; }
.h-right { text-align: right; font-size: 8pt; color: #888; min-width: 35mm; }
.h-right strong { display: block; color: #333; font-size: 9pt; }

/* ── Contenedor del mapa ── */
.map-wrap {
    grid-area: map;
    position: relative;
    overflow: hidden;
    background: #d4e8f0;
    border-right: 1pt solid #e0e0e0;
}
/* Tiles de mapa base */
.tile-layer {
    position: absolute; inset: 0;
    overflow: hidden;
}
/* Overlay WMS (capas QGIS) */
.wms-overlay {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: fill;
}

/* ── Leyenda ── */
.legend-panel {
    grid-area: legend;
    padding: 3mm 3.5mm;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #fafafa;
    border-left: 1pt solid #e8e0ec;
}
.leg-title {
    font-size: 8pt; font-weight: 800; color: #8d1c3d;
    text-transform: uppercase; letter-spacing: .5pt;
    margin-bottom: 2mm;
    padding-bottom: 1.5mm;
    border-bottom: 1pt solid #e8d0db;
}
.leg-basemap {
    font-size: 7pt; color: #888; margin-bottom: 2mm;
    padding: 1mm 2mm; background: #f0e8ec; border-radius: 2pt;
}
.leg-item { margin-bottom: 2mm; }
.leg-name { font-size: 7.5pt; font-weight: 600; color: #444; margin-bottom: 1mm; }
.leg-img  { max-width: 100%; display: block; }
.leg-empty { font-size: 7pt; color: #bbb; font-style: italic; }

/* ── Pie de página ── */
.footer {
    grid-area: footer;
    display: flex; align-items: flex-start;
    padding: 2.5mm 6mm;
    border-top: 1pt solid #e0e0e0;
    gap: 6mm;
    background: #fff;
}
.f-block { display: flex; flex-direction: column; gap: .8mm; }
.f-label { font-size: 6pt; text-transform: uppercase; letter-spacing: .4pt; color: #aaa; }
.f-value { font-size: 8pt; color: #333; }
.f-value strong { font-weight: 700; }

/* Barra de escala */
.scale-bar-wrap { flex: 0 0 auto; }
.scale-bar {
    display: flex; height: 2.5mm; border: .8pt solid #555;
    width: 40mm; overflow: hidden;
}
.sb-black { flex: 1; background: #333; }
.sb-white { flex: 1; background: #fff; border-left: .8pt solid #555; border-right: .8pt solid #555; }
.scale-bar-labels {
    display: flex; justify-content: space-between;
    font-size: 6pt; color: #555; margin-top: .5mm; width: 40mm;
}

/* Rosa */
.north-wrap { text-align: center; flex: 0 0 auto; }
.north-wrap svg { display: block; margin: 0 auto; }
.north-n { font-size: 9pt; font-weight: 800; color: #8d1c3d; margin-top: .5mm; }

/* Coords */
.f-coords { font-size: 6.5pt; font-family: monospace; color: #666; }

@media screen {
    body { background: #b0b0b0; overflow-y: auto; width: auto; height: auto; }
    .page {
        margin: 46px auto 20px;
        box-shadow: 0 6px 30px rgba(0,0,0,.3);
    }
}
@media print {
    .toolbar { display: none !important; }
    body, html { background: #fff; overflow: hidden; }
    .page { margin: 0; }
}
</style>
</head>
<body>

<!-- Barra de herramientas (se oculta al imprimir) -->
<div class="toolbar">
    <div>
        🗺️ <strong>${job.title || 'Mapa'}</strong>
        <span class="toolbar-info"> — ${job.paper.label} ${job.orientation === 'landscape' ? 'Apaisado' : 'Retrato'} · ${job.dpi} dpi · ${fmtScale(finalScale)}</span>
    </div>
    <button class="btn-print" onclick="window.print()">🖨️ Imprimir / Guardar PDF</button>
</div>

<div class="page">

    <!-- Cabecera -->
    <header class="header">
        <div class="h-left">
            <div class="h-title">${job.title || 'Mapa sin título'}</div>
            ${job.subtitle ? `<div class="h-subtitle">${job.subtitle}</div>` : ''}
        </div>
        <div class="h-right">
            ${job.author ? `<strong>${job.author}</strong>` : ''}
            <span>${now}</span>
        </div>
    </header>

    <!-- Mapa -->
    <div class="map-wrap">
        <!-- Mapa base (tiles) -->
        <div class="tile-layer" id="tileLayer">
            ${tilesHtml}
        </div>
        <!-- Capas QGIS (WMS GetMap transparente) -->
        ${wmsUrl ? `<img class="wms-overlay" id="wmsImg"
            src="${wmsUrl}"
            alt="Capas QGIS"
            onerror="this.style.display='none';document.getElementById('wmsErr').style.display='block'"/>
        <div id="wmsErr" style="display:none;position:absolute;bottom:8px;left:8px;background:rgba(200,0,0,.8);color:#fff;padding:4px 8px;font-size:9pt;border-radius:3px;">
            ⚠ No se pudo cargar la imagen WMS
        </div>` : ''}
    </div>

    <!-- Leyenda -->
    <aside class="legend-panel">
        <div class="leg-title">Simbología</div>
        <div class="leg-basemap">🗺 ${job.baseMapName || 'Mapa base'}</div>
        ${legendHtml || '<div class="leg-empty">Sin capas activas</div>'}
    </aside>

    <!-- Pie de página -->
    <footer class="footer">
        <!-- Escala numérica -->
        <div class="f-block">
            <div class="f-label">Escala</div>
            <div class="f-value"><strong>${fmtScale(finalScale)}</strong></div>
        </div>

        <!-- Barra de escala gráfica -->
        <div class="f-block scale-bar-wrap">
            <div class="f-label">Escala gráfica</div>
            <div class="scale-bar">
                <div class="sb-black"></div>
                <div class="sb-white"></div>
                <div class="sb-black"></div>
                <div class="sb-white"></div>
            </div>
            <div class="scale-bar-labels"><span>0</span><span>${barLabel}</span></div>
        </div>

        <!-- Coordenadas -->
        <div class="f-block" style="flex:1">
            <div class="f-label">Extensión</div>
            <div class="f-coords">${miny.toFixed(4)}°N, ${minx.toFixed(4)}°O</div>
            <div class="f-coords">${maxy.toFixed(4)}°N, ${maxx.toFixed(4)}°O</div>
            <div style="font-size:5.5pt;color:#bbb;margin-top:.5mm">WGS 84 · EPSG:4326</div>
        </div>

        <!-- Rosa de los vientos -->
        <div class="f-block north-wrap">
            <svg width="20" height="28" viewBox="0 0 20 28" xmlns="http://www.w3.org/2000/svg">
                <polygon points="10,2 14,14 10,11 6,14" fill="#8d1c3d"/>
                <polygon points="10,26 14,14 10,17 6,14" fill="#ccc"/>
                <circle cx="10" cy="14" r="2" fill="#333"/>
            </svg>
            <div class="north-n">N</div>
        </div>

        ${job.notes ? `
        <div class="f-block" style="flex:2">
            <div class="f-label">Fuente / Notas</div>
            <div style="font-size:6.5pt;color:#888;font-style:italic">${job.notes}</div>
        </div>` : ''}
    </footer>
</div>

</body>
</html>`;
}

// ─── Abrir ventana de impresión ───────────────────────────────────────────────

export function openPrintWindow(job: PrintJob): boolean {
    const html = buildPrintHtml(job);
    const win  = window.open('', '_blank', 'width=960,height=740,menubar=yes,toolbar=yes');
    if (!win) {
        alert('El navegador bloqueó la ventana emergente. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.');
        return false;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    return true;
}

// ─── GetPrint (requiere template QGIS) ───────────────────────────────────────

export function buildGetPrintUrl(job: PrintJob): string | null {
    if (!job.template) return null;
    const [minx, miny, maxx, maxy] = job.extent;
    const pageMm = getPageMm(job.paper, job.orientation, job.customMm);
    const autoSc = estimateScale(job.extent, pageMm[0]);
    const scale  = job.scaleMode === 'fixed' && job.fixedScale ? job.fixedScale : snapToStandardScale(autoSc);
    const baseUrl = job.useProject === 'raster'
        ? config.qgisServer.wmsRasterUrl
        : config.qgisServer.wmsUrl;
    const p = new URLSearchParams();
    p.set('SERVICE',  'WMS'); p.set('VERSION', '1.3.0'); p.set('REQUEST', 'GetPrint');
    p.set('TEMPLATE', job.template); p.set('CRS', job.crs); p.set('DPI', String(job.dpi));
    p.set('FORMAT',   'application/pdf');
    p.set('map0:extent',    `${minx},${miny},${maxx},${maxy}`);
    p.set('map0:scale',     String(scale));
    if (job.layers.length) {
        p.set('map0:layers',    job.layers.map(l => l.wmsName).join(','));
        p.set('map0:opacities', job.layers.map(l => Math.round(l.opacity * 255)).join(','));
    }
    if (job.title)    p.set('ITEM_TITULO',    job.title);
    if (job.subtitle) p.set('ITEM_SUBTITULO', job.subtitle);
    if (job.author)   p.set('ITEM_AUTOR',     job.author);
    if (job.notes)    p.set('ITEM_NOTAS',     job.notes);
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${p.toString()}`;
}

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
