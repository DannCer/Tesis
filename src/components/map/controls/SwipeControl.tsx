/**
 * SwipeControl — Comparador de capas con barra deslizable
 *
 * Implementación pura Leaflet (imperativa) para poder acceder
 * a _container de cada TileLayer y aplicar CSS clip dinámico.
 * Se monta dentro de <MapContainer> vía useMap().
 */

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@styles/SwipeControl.css';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface SwipeLayerConfig {
    id: string;
    name: string;
    url: string;       // URL base de QGIS Server (ya incluye ?MAP=...)
    layers: string;       // nombre de la capa WMS
    params?: Record<string, any>;
}

interface SwipeControlProps {
    leftLayer: SwipeLayerConfig;
    rightLayer: SwipeLayerConfig;
    onClose: () => void;
}

// ── Utilidad: escapar HTML para prevenir XSS en popups ───────────────────────

const escapeHtml = (value: unknown): string => {
    const str = String(value ?? '—');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

// ── GetFeatureInfo ────────────────────────────────────────────────────────────

/**
 * Consulta WMS GetFeatureInfo al servidor QGIS y devuelve el primer feature,
 * o null si no hay resultado o hubo un error.
 */
async function queryFeatureInfo(
    map: L.Map,
    layerConfig: SwipeLayerConfig,
    latlng: L.LatLng,
): Promise<Record<string, unknown> | null> {
    const size   = map.getSize();
    const bounds = map.getBounds();
    const point  = map.latLngToContainerPoint(latlng);

    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
    const bbox = `${sw.x},${sw.y},${ne.x},${ne.y}`;

    const params = new URLSearchParams({
        SERVICE:      'WMS',
        VERSION:      '1.1.1',
        REQUEST:      'GetFeatureInfo',
        LAYERS:       layerConfig.layers,
        QUERY_LAYERS: layerConfig.layers,
        INFO_FORMAT:  'application/json',
        FEATURE_COUNT: '1',
        X:            String(Math.round(point.x)),
        Y:            String(Math.round(point.y)),
        WIDTH:        String(size.x),
        HEIGHT:       String(size.y),
        BBOX:         bbox,
        SRS:          'EPSG:3857',
        BUFFER:       '8',
    });

    try {
        const res  = await fetch(`${layerConfig.url}&${params.toString()}`);
        if (!res.ok) return null;
        const json = await res.json();
        const features: any[] = json?.features ?? [];
        return features.length > 0 ? (features[0].properties ?? {}) : null;
    } catch {
        return null;
    }
}

/**
 * Construye el HTML del popup con el mismo estilo que los popups de VectorLayer.
 */
function buildPopupHtml(layerName: string, props: Record<string, unknown>): string {
    const SKIP = new Set(['bbox', 'geometry', 'the_geom', 'geom']);
    const nombre =
        (props['NOMBRE'] ?? props['nombre'] ??
         props['Estado'] ?? props['estado'] ??
         props['Municipio'] ?? props['municipio'] ??
         props['NAME'] ?? props['name'] ?? layerName) as string;

    const rows = Object.entries(props)
        .filter(([k]) => !SKIP.has(k.toLowerCase()))
        .map(([k, v]) =>
            `<tr>
                <td style="padding:5px 12px 5px 0;font-weight:600;color:#555;white-space:nowrap;vertical-align:top;font-size:13px">${escapeHtml(k)}</td>
                <td style="padding:5px 0;color:#222;font-size:13px;word-break:break-word">${escapeHtml(v)}</td>
            </tr>`
        ).join('');

    return `
        <div style="font-family:'Roboto','Segoe UI',sans-serif;min-width:280px;max-width:420px">
            <div style="background:#8d1c3d;color:#fff;padding:10px 14px;margin:-13px -20px 10px;border-radius:4px 4px 0 0;font-size:14px;font-weight:600">
                ${escapeHtml(nombre)}
            </div>
            <div style="max-height:240px;overflow-y:auto">
                <table style="border-collapse:collapse;width:100%">
                    <tbody>${rows || '<tr><td style="color:#999;font-size:13px">Sin atributos</td></tr>'}</tbody>
                </table>
            </div>
        </div>`;
}

// ── Componente ────────────────────────────────────────────────────────────────

const SwipeControl: React.FC<SwipeControlProps> = ({ leftLayer, rightLayer, onClose }) => {
    const map = useMap();
    const dividerRef = useRef<HTMLDivElement>(null);
    const positionRef = useRef<number>(50);           // % from left
    const [pos, setPos] = useState<number>(50);         // para re-render del divisor
    const leftTileRef = useRef<L.TileLayer.WMS | null>(null);
    const rightTileRef = useRef<L.TileLayer.WMS | null>(null);
    const draggingRef = useRef(false);
    const popupRef = useRef<L.Popup | null>(null);

    // ── Aplicar clip CSS a ambas capas ────────────────────────────────────────
    const applyClip = useCallback(() => {
        const lc = (leftTileRef.current as any)?._container as HTMLElement | undefined;
        const rc = (rightTileRef.current as any)?._container as HTMLElement | undefined;
        if (!lc || !rc) return;
        const size = map.getSize();
        const clipX = Math.round(size.x * positionRef.current / 100);
        lc.style.clip = `rect(0px, ${clipX}px, ${size.y}px, 0px)`;
        rc.style.clip = `rect(0px, ${size.x}px, ${size.y}px, ${clipX}px)`;

        // Las capas WMS son rasters — no necesitan recibir clicks.
        // Al desactivar pointer-events los clicks pasan a las capas
        // vectoriales y features interactivos que están debajo.
        lc.style.pointerEvents = 'none';
        rc.style.pointerEvents = 'none';
    }, [map]);

    // ── Crear capas WMS imperativamente ───────────────────────────────────────
    useEffect(() => {
        // Capa izquierda
        const left = L.tileLayer.wms(leftLayer.url, {
            layers: leftLayer.layers,
            format: 'image/png',
            transparent: true,
            opacity: 1,
            zIndex: 450,
            tiled: true,          // ✅ Mejora de renderizado
            buffer: 128,            // ✅ Evita que se corten los WMS en los bordes
            ...(leftLayer.params ?? {}),
        });

        // Capa derecha
        const right = L.tileLayer.wms(rightLayer.url, {
            layers: rightLayer.layers,
            format: 'image/png',
            transparent: true,
            opacity: 1,
            zIndex: 451,
            tiled: true,          // ✅ Mejora de renderizado
            buffer: 128,            // ✅ Evita que se corten los WMS en los bordes
            ...(rightLayer.params ?? {}),
        });

        left.addTo(map);
        right.addTo(map);
        leftTileRef.current = left;
        rightTileRef.current = right;

        // Aplicar clip con reintento hasta que los contenedores estén listos
        const applyClipWithRetry = () => {
            const lc = (leftTileRef.current as any)?._container;
            const rc = (rightTileRef.current as any)?._container;
            if (lc && rc) {
                applyClip();
            } else {
                requestAnimationFrame(applyClipWithRetry);
            }
        };

        left.once('load', applyClipWithRetry);
        right.once('load', applyClipWithRetry);
        setTimeout(applyClipWithRetry, 200); // fallback

        // Actualizar clip en movimiento/zoom/resize
        map.on('move zoom resize', applyClipWithRetry);

        // ── GetFeatureInfo al hacer click en el mapa ───────────────────────────
        const onMapClick = async (e: L.LeafletMouseEvent) => {
            if (draggingRef.current) return;

            const size  = map.getSize();
            const clickX = map.latLngToContainerPoint(e.latlng).x;
            const isLeft = clickX < (size.x * positionRef.current / 100);
            const layer  = isLeft ? leftLayer : rightLayer;

            // Mostrar popup de "cargando" mientras se consulta
            if (popupRef.current) popupRef.current.remove();
            popupRef.current = L.popup({ maxWidth: 440, minWidth: 260, className: 'vector-popup' })
                .setLatLng(e.latlng)
                .setContent('<div style="padding:8px;font-size:13px;color:#555">Consultando atributos…</div>')
                .openOn(map);

            const props = await queryFeatureInfo(map, layer, e.latlng);

            if (!popupRef.current) return; // fue cerrado antes de recibir respuesta

            if (!props) {
                popupRef.current.setContent(
                    '<div style="padding:8px;font-size:13px;color:#999">Sin features en este punto.</div>'
                );
                return;
            }

            popupRef.current.setContent(buildPopupHtml(layer.name, props));
        };

        map.on('click', onMapClick);

        return () => {
            map.off('move zoom resize', applyClipWithRetry);
            map.off('click', onMapClick);
            popupRef.current?.remove();
            popupRef.current = null;
            left.remove();
            right.remove();
            leftTileRef.current = null;
            rightTileRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [leftLayer.id, rightLayer.id]);

    // Re-aplicar clip cuando cambia pos
    useEffect(() => { applyClip(); }, [pos, applyClip]);

    // ─── Drag del divisor ──────────────────────────────────────────────────────
    const onMouseMove = useCallback((e: MouseEvent | TouchEvent) => {
        if (!draggingRef.current) return;
        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const raw = ((clientX - rect.left) / rect.width) * 100;
        const clamped = Math.max(5, Math.min(95, raw));
        positionRef.current = clamped;
        setPos(clamped);
    }, [map]);

    const onMouseUp = useCallback(() => {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        map.dragging.enable();
    }, [map]);

    const onDividerMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        map.dragging.disable();   // evitar que el mapa se arrastre mientras movemos la barra
    }, [map]);

    useEffect(() => {
        document.addEventListener('mousemove', onMouseMove as any);
        document.addEventListener('touchmove', onMouseMove as any, { passive: true });
        document.addEventListener('mouseup', onMouseUp);
        document.addEventListener('touchend', onMouseUp);
        return () => {
            document.removeEventListener('mousemove', onMouseMove as any);
            document.removeEventListener('touchmove', onMouseMove as any);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchend', onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    // ── Render ────────────────────────────────────────────────────────────────
    const mapContainer = map.getContainer();

    return (
        <>
            {createPortal(
                <div
                    className="swipe-divider"
                    style={{ left: `${pos}%`, pointerEvents: 'none' }}
                    ref={dividerRef}
                    aria-label="Arrastra para comparar capas"
                >
                    <div className="swipe-label swipe-label-left" style={{ pointerEvents: 'none' }}>
                        <span>{leftLayer.name}</span>
                    </div>
                    <div className="swipe-handle" style={{ pointerEvents: 'auto' }}
                        onMouseDown={onDividerMouseDown}
                        onTouchStart={onDividerMouseDown}
                    >
                        <div className="swipe-handle-circle"><span>⇄</span></div>
                    </div>
                    <div className="swipe-label swipe-label-right" style={{ pointerEvents: 'none' }}>
                        <span>{rightLayer.name}</span>
                    </div>
                    <button
                        className="swipe-close-btn"
                        style={{ pointerEvents: 'auto' }}
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        title="Cerrar comparador"
                    >
                        ✕
                    </button>
                </div>,
                mapContainer
            )}
        </>
    );
};

export default SwipeControl;