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
    id:       string;
    name:     string;
    url:      string;       // URL base de QGIS Server (ya incluye ?MAP=...)
    layers:   string;       // nombre de la capa WMS
    params?:  Record<string, any>;
}

interface SwipeControlProps {
    leftLayer:  SwipeLayerConfig;
    rightLayer: SwipeLayerConfig;
    onClose:    () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

const SwipeControl: React.FC<SwipeControlProps> = ({ leftLayer, rightLayer, onClose }) => {
    const map              = useMap();
    const dividerRef       = useRef<HTMLDivElement>(null);
    const positionRef      = useRef<number>(50);           // % from left
    const [pos, setPos]    = useState<number>(50);         // para re-render del divisor
    const leftTileRef      = useRef<L.TileLayer.WMS | null>(null);
    const rightTileRef     = useRef<L.TileLayer.WMS | null>(null);
    const draggingRef      = useRef(false);

    // ── Aplicar clip CSS a ambas capas ────────────────────────────────────────
    const applyClip = useCallback(() => {
        const lc = (leftTileRef.current as any)?._container as HTMLElement | undefined;
        const rc = (rightTileRef.current as any)?._container as HTMLElement | undefined;
        if (!lc || !rc) return;
        const size = map.getSize();
        const clipX = Math.round(size.x * positionRef.current / 100);
        lc.style.clip = `rect(0px, ${clipX}px, ${size.y}px, 0px)`;
        rc.style.clip = `rect(0px, ${size.x}px, ${size.y}px, ${clipX}px)`;
    }, [map]);

    // ── Crear capas WMS imperativamente ───────────────────────────────────────
    useEffect(() => {
        // Capa izquierda
        const left = L.tileLayer.wms(leftLayer.url, {
            layers:      leftLayer.layers,
            format:      'image/png',
            transparent: true,
            opacity:     1,
            zIndex:      450,
            ...(leftLayer.params ?? {}),
        });

        // Capa derecha
        const right = L.tileLayer.wms(rightLayer.url, {
            layers:      rightLayer.layers,
            format:      'image/png',
            transparent: true,
            opacity:     1,
            zIndex:      451,
            ...(rightLayer.params ?? {}),
        });

        left.addTo(map);
        right.addTo(map);
        leftTileRef.current  = left;
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

        return () => {
            map.off('move zoom resize', applyClipWithRetry);
            left.remove();
            right.remove();
            leftTileRef.current  = null;
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
        const rect         = mapContainer.getBoundingClientRect();
        const clientX      = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const raw          = ((clientX - rect.left) / rect.width) * 100;
        const clamped      = Math.max(5, Math.min(95, raw));
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
        draggingRef.current        = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        map.dragging.disable();   // evitar que el mapa se arrastre mientras movemos la barra
    }, [map]);

    useEffect(() => {
        document.addEventListener('mousemove',  onMouseMove as any);
        document.addEventListener('touchmove',  onMouseMove as any, { passive: true });
        document.addEventListener('mouseup',    onMouseUp);
        document.addEventListener('touchend',   onMouseUp);
        return () => {
            document.removeEventListener('mousemove',  onMouseMove as any);
            document.removeEventListener('touchmove',  onMouseMove as any);
            document.removeEventListener('mouseup',    onMouseUp);
            document.removeEventListener('touchend',   onMouseUp);
        };
    }, [onMouseMove, onMouseUp]);

    // ── Render ────────────────────────────────────────────────────────────────
    const mapContainer = map.getContainer();

    return (
        <>
            {createPortal(
                <div
                    className="swipe-divider"
                    style={{ left: `${pos}%` }}
                    ref={dividerRef}
                    onMouseDown={onDividerMouseDown}
                    onTouchStart={onDividerMouseDown}
                    aria-label="Arrastra para comparar capas"
                >
                    <div className="swipe-label swipe-label-left">
                        <span>{leftLayer.name}</span>
                    </div>
                    <div className="swipe-handle">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M11.354 1.646a.5.5 0 0 1 0 .708L9.207 4.5l2.147 2.146a.5.5 0 0 1-.708.708l-2.5-2.5a.5.5 0 0 1 0-.708l2.5-2.5a.5.5 0 0 1 .708 0zm-6.708 0a.5.5 0 0 0 0 .708L6.793 4.5 4.646 6.646a.5.5 0 0 0 .708.708l2.5-2.5a.5.5 0 0 0 0-.708l-2.5-2.5a.5.5 0 0 0-.708 0z"/>
                            <path d="M3 8a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 0 1h-9A.5.5 0 0 1 3 8z"/>
                        </svg>
                    </div>
                    <div className="swipe-label swipe-label-right">
                        <span>{rightLayer.name}</span>
                    </div>
                    <button
                        className="swipe-close-btn"
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