/**
 * @fileoverview Captura del canvas de Leaflet como imagen base64
 *
 * Estrategia:
 *  1. Serializa todos los panes SVG del mapa (markers, polylines, polygons)
 *  2. Dibuja tiles de mapa base + overlay WMS + SVG vectorial sobre un canvas
 *  3. Devuelve un dataURL PNG listo para embeber en el HTML de impresión
 *
 * No requiere librerías externas.
 */

import L from 'leaflet';
import { logger } from '@config/env';

export interface CaptureOptions {
    /** Ancho del canvas de salida en px */
    width: number;
    /** Alto del canvas de salida en px */
    height: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload  = () => resolve(img);
        img.onerror = () => reject(new Error(`No se pudo cargar imagen: ${src.substring(0, 80)}`));
        img.src = src;
    });
}

/** Serializa un elemento SVG a dataURL */
function svgToDataUrl(svgEl: SVGSVGElement): string {
    const clone = svgEl.cloneNode(true) as SVGSVGElement;
    // Forzar dimensiones en el clone para que el canvas lo escale bien
    const rect = svgEl.getBoundingClientRect();
    clone.setAttribute('width',  String(rect.width));
    clone.setAttribute('height', String(rect.height));
    const xml   = new XMLSerializer().serializeToString(clone);
    const blob  = new Blob([xml], { type: 'image/svg+xml' });
    return URL.createObjectURL(blob);
}

// ── Captura principal ─────────────────────────────────────────────────────────

/**
 * Captura el mapa Leaflet como imagen PNG base64.
 *
 * @param map       Instancia L.Map activa
 * @param options   Dimensiones de salida deseadas
 * @returns         dataURL PNG (o null si falla)
 */
export async function captureLeafletMap(
    map: L.Map,
    options: CaptureOptions
): Promise<string | null> {
    const container = map.getContainer();
    const mapRect   = container.getBoundingClientRect();
    const mapW      = mapRect.width;
    const mapH      = mapRect.height;

    // Escala UNIFORME para mantener proporciones del mapa.
    // Antes se calculaban scaleX y scaleY independientes → distorsión cuando
    // el ratio del mapa y el del papel no coinciden (ej: mapa 16:9, papel A4).
    const scale  = Math.min(options.width / mapW, options.height / mapH);

    // Centra la captura en el canvas de salida
    const offsetX = (options.width  - mapW * scale) / 2;
    const offsetY = (options.height - mapH * scale) / 2;

    const canvas  = document.createElement('canvas');
    canvas.width  = options.width;
    canvas.height = options.height;
    const ctx     = canvas.getContext('2d')!;

    // Fondo blanco para el espacio sobrante (letterbox/pillarbox)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, options.width, options.height);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // ── 1. Tiles de mapa base ─────────────────────────────────────────────────
    const tilePane = container.querySelector('.leaflet-tile-pane') as HTMLElement | null;
    if (tilePane) {
        const tileImgs = tilePane.querySelectorAll('img.leaflet-tile');
        const tilePromises: Promise<void>[] = [];

        tileImgs.forEach(img => {
            const el    = img as HTMLImageElement;
            const style = window.getComputedStyle(el);
            const r     = el.getBoundingClientRect();

            const left  = r.left - mapRect.left;
            const top   = r.top  - mapRect.top;
            const w     = r.width;
            const h     = r.height;

            if (parseFloat(style.opacity) < 0.01) return;

            tilePromises.push(
                loadImage(el.src)
                    .then(loaded => { ctx.drawImage(loaded, left, top, w, h); })
                    .catch(() => { /* tile no disponible — skip */ })
            );
        });
        await Promise.allSettled(tilePromises);
    }

    // ── 2. Capas WMS/ráster (overlay pane) ────────────────────────────────────
    const overlayPanes = container.querySelectorAll('.leaflet-overlay-pane img, .leaflet-map-pane img');
    for (const el of Array.from(overlayPanes)) {
        const img   = el as HTMLImageElement;
        const style = window.getComputedStyle(img);
        if (parseFloat(style.opacity) < 0.01) continue;
        const r = img.getBoundingClientRect();
        try {
            const loaded = await loadImage(img.src);
            ctx.globalAlpha = parseFloat(style.opacity) || 1;
            ctx.drawImage(loaded, r.left - mapRect.left, r.top - mapRect.top, r.width, r.height);
            ctx.globalAlpha = 1;
        } catch { /* skip */ }
    }

    // ── 3. Capas SVG vectoriales (markers, polylines, polygons) ───────────────
    const svgPanes = container.querySelectorAll('.leaflet-overlay-pane svg, .leaflet-marker-pane svg');
    for (const svgEl of Array.from(svgPanes)) {
        const svg  = svgEl as SVGSVGElement;
        const r    = svg.getBoundingClientRect();
        const url  = svgToDataUrl(svg);
        try {
            const img = await loadImage(url);
            ctx.drawImage(img, r.left - mapRect.left, r.top - mapRect.top, r.width, r.height);
        } catch { /* skip */ } finally {
            URL.revokeObjectURL(url);
        }
    }

    // ── 4. Markers HTML (DivIcon, PNG markers) ────────────────────────────────
    // Los markers de Leaflet están en .leaflet-marker-pane como <img> o <div>
    const markerPane = container.querySelector('.leaflet-marker-pane') as HTMLElement | null;
    if (markerPane) {
        const markerImgs = markerPane.querySelectorAll('img');
        for (const el of Array.from(markerImgs)) {
            const img   = el as HTMLImageElement;
            const style = window.getComputedStyle(img);
            const r     = img.getBoundingClientRect();
            if (parseFloat(style.opacity) < 0.01) continue;
            try {
                const loaded = await loadImage(img.src);
                ctx.globalAlpha = parseFloat(style.opacity) || 1;
                ctx.drawImage(loaded, r.left - mapRect.left, r.top - mapRect.top, r.width, r.height);
                ctx.globalAlpha = 1;
            } catch { /* skip */ }
        }

        // DivIcons (SVG inlines dentro de markers)
        const divIcons = markerPane.querySelectorAll('.leaflet-marker-icon svg');
        for (const svgEl of Array.from(divIcons)) {
            const svg  = svgEl as SVGSVGElement;
            const r    = svg.closest('.leaflet-marker-icon')!.getBoundingClientRect();
            const url  = svgToDataUrl(svg);
            try {
                const img = await loadImage(url);
                ctx.drawImage(img, r.left - mapRect.left, r.top - mapRect.top, r.width, r.height);
            } catch { /* skip */ } finally {
                URL.revokeObjectURL(url);
            }
        }
    }

    logger.debug('Captura del mapa completada:', `${canvas.width}×${canvas.height}px`);

    ctx.restore();   // ← deshace translate + scale uniforme

    try {
        return canvas.toDataURL('image/png');
    } catch (e) {
        logger.error('Error al exportar canvas (posiblemente CORS en tiles):', e);
        return null;
    }
}