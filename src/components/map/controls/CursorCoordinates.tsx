/**
 * @fileoverview CursorCoordinates — Muestra las coordenadas del cursor
 * (lat, lng) en tiempo real mientras el puntero se mueve sobre el mapa.
 *
 * Implementado como control nativo de Leaflet (posición bottomleft) para
 * integrarse correctamente con el z-index y el ciclo de vida del mapa.
 *
 * @module components/map/controls/CursorCoordinates
 */

import React, { useEffect, useState, useRef } from 'react';
import { createPortal }                        from 'react-dom';
import { useMap }                              from 'react-leaflet';
import L                                       from 'leaflet';
import '@styles/CursorCoordinates.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Coords { lat: number; lng: number }

// ─── Formatos de coordenadas ──────────────────────────────────────────────────

type CoordFormat = 'dd' | 'dms';

function toDMS(deg: number, isLat: boolean): string {
    const abs  = Math.abs(deg);
    const d    = Math.floor(abs);
    const mRaw = (abs - d) * 60;
    const m    = Math.floor(mRaw);
    const s    = ((mRaw - m) * 60).toFixed(1);
    const dir  = isLat ? (deg >= 0 ? 'N' : 'S') : (deg >= 0 ? 'E' : 'O');
    return `${d}°${m}'${s}"${dir}`;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const CursorCoordinates: React.FC = () => {
    const map          = useMap();
    const [coords,     setCoords]     = useState<Coords | null>(null);
    const [onMap,      setOnMap]      = useState(false);
    const [format,     setFormat]     = useState<CoordFormat>('dd');
    const [portal,     setPortal]     = useState<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // ── Crear control de Leaflet en bottomleft ────────────────────────────
    useEffect(() => {
        const div = L.DomUtil.create('div', '') as HTMLDivElement;
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);

        const ctrl = new L.Control({ position: 'bottomleft' });
        ctrl.onAdd = () => div;
        ctrl.addTo(map);
        containerRef.current = div;
        setPortal(div);

        return () => { ctrl.remove(); };
    }, [map]);

    // ── Escuchar mousemove del mapa ───────────────────────────────────────
    // Usamos un timeout en lugar de mouseenter/mouseleave para determinar si
    // el cursor está sobre el mapa. Los eventos de enter/leave son poco fiables:
    // cuando se abre un popup de Leaflet el navegador dispara mouseleave sobre el
    // contenedor del mapa aunque el puntero no haya salido físicamente, lo que
    // congela las coordenadas. Con el enfoque de timeout, si llegamos a recibir
    // un mousemove sabemos que el cursor está dentro; si no llega ninguno en
    // LEAVE_TIMEOUT_MS asumimos que salió.
    useEffect(() => {
        const LEAVE_TIMEOUT_MS = 200;
        let leaveTimer: ReturnType<typeof setTimeout> | null = null;

        const onMove = (e: L.LeafletMouseEvent) => {
            if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
            setOnMap(true);
            setCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
        };

        const scheduleLeave = () => {
            if (leaveTimer) clearTimeout(leaveTimer);
            leaveTimer = setTimeout(() => setOnMap(false), LEAVE_TIMEOUT_MS);
        };

        map.on('mousemove', onMove);
        const container = map.getContainer();
        container.addEventListener('mouseleave', scheduleLeave);

        return () => {
            map.off('mousemove', onMove);
            container.removeEventListener('mouseleave', scheduleLeave);
            if (leaveTimer) clearTimeout(leaveTimer);
        };
    }, [map]);

    if (!portal) return null;

    const formatCoords = (c: Coords): { lat: string; lng: string } => {
        if (format === 'dms') {
            return { lat: toDMS(c.lat, true), lng: toDMS(c.lng, false) };
        }
        return {
            lat: `${c.lat >= 0 ? '' : ''}${c.lat.toFixed(6)}°`,
            lng: `${c.lng.toFixed(6)}°`,
        };
    };

    return createPortal(
        <div
            className={`cc-box ${onMap && coords ? 'cc-box--visible' : 'cc-box--hidden'}`}
            title="Haz clic para cambiar el formato de coordenadas"
        >
            {coords && (
                <>
                    <span className="cc-icon" aria-hidden="true">⌖</span>
                    <button
                        className="cc-coords"
                        onClick={() => setFormat(f => f === 'dd' ? 'dms' : 'dd')}
                        aria-label={`Coordenadas del cursor. Clic para cambiar a ${format === 'dd' ? 'grados, minutos, segundos' : 'grados decimales'}`}
                        title={format === 'dd' ? 'Cambiar a grados, minutos, segundos' : 'Cambiar a grados decimales'}
                    >
                        {(() => {
                            const { lat, lng } = formatCoords(coords);
                            return format === 'dd'
                                ? <><span className="cc-val">{lat}</span><span className="cc-sep">,</span><span className="cc-val">{lng}</span></>
                                : <><span className="cc-val cc-val--dms">{lat}</span><span className="cc-sep"> </span><span className="cc-val cc-val--dms">{lng}</span></>;
                        })()}
                    </button>
                    <span className="cc-format-hint">{format.toUpperCase()}</span>
                </>
            )}
        </div>,
        portal,
    );
};

export default CursorCoordinates;