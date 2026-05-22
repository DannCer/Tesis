/**
 * @fileoverview RightSideControls — Botones adicionales integrados como
 * control nativo de Leaflet en la esquina superior derecha.
 *
 * Botones:
 *  - Inicio (Home)              → vuela al centro y zoom por defecto
 *  - Mi ubicación               → geolocalización del usuario con marcador
 *  - Comparador (Swipe)         → abre/cierra el SwipePanel
 *  - Tabla de Atributos Dinámica → abre/cierra DynamicAttributeTable
 *
 * @module components/map/controls/RightSideControls
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal }               from 'react-dom';
import { useMap }                     from 'react-leaflet';
import L                              from 'leaflet';
import swipeIcon          from '@assets/images/swipe.png';
import tablaAtributosIcon from '@assets/images/tabla_atributos.png';
import { MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM } from '@config/constants';
import '@styles/RightSideControls.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RightSideControlsProps {
    swipeOpen: boolean;
    onToggleSwipe: () => void;
    /** Si la tabla dinámica está abierta */
    dynamicTableOpen: boolean;
    /** Callback para abrir/cerrar la tabla dinámica */
    onToggleDynamicTable: () => void;
    /** true si hay al menos una capa vectorial activa con datos */
    hasVectorLayers: boolean;
}

// ─── Icono SVG del marcador de ubicación ──────────────────────────────────────

const LOCATION_MARKER_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="28" height="40">
  <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 26 14 26S28 24.5 28 14C28 6.27 21.73 0 14 0z"
        fill="#1565C0" stroke="#fff" stroke-width="1.8"/>
  <circle cx="14" cy="14" r="5.5" fill="#fff"/>
  <circle cx="14" cy="14" r="3" fill="#1565C0"/>
</svg>`);

const LOCATION_ICON = L.icon({
    iconUrl:     `data:image/svg+xml,${LOCATION_MARKER_SVG}`,
    iconSize:    [28, 40],
    iconAnchor:  [14, 40],
    popupAnchor: [0, -42],
});

// ─── Tipo de estado de geolocalización ───────────────────────────────────────

type GeoState = 'idle' | 'loading' | 'found' | 'error';

// ─── Componente ───────────────────────────────────────────────────────────────

const RightSideControls: React.FC<RightSideControlsProps> = ({
    swipeOpen,
    onToggleSwipe,
    dynamicTableOpen,
    onToggleDynamicTable,
    hasVectorLayers,
}) => {
    const map = useMap();
    const [portalTarget, setPortalTarget] = useState<HTMLDivElement | null>(null);
    const [geoState,     setGeoState]     = useState<GeoState>('idle');
    const locationMarkerRef  = useRef<L.Marker | null>(null);
    const accuracyCircleRef  = useRef<L.Circle | null>(null);

    // ── Crear el contenedor de control de Leaflet ──────────────────────────
    useEffect(() => {
        const container = L.DomUtil.create(
            'div',
            'leaflet-bar rsc-container',
        ) as HTMLDivElement;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.disableScrollPropagation(container);

        const control = new L.Control({ position: 'topright' });
        control.onAdd = () => container;
        control.addTo(map);

        setPortalTarget(container);

        return () => {
            control.remove();
            locationMarkerRef.current?.remove();
            accuracyCircleRef.current?.remove();
        };
    }, [map]);

    // ── Botón Home: volar al centro y zoom iniciales ───────────────────────
    const handleHome = useCallback(() => {
        map.flyTo(MAP_DEFAULT_CENTER, MAP_DEFAULT_ZOOM, {
            animate:  true,
            duration: 1.2,
        });
    }, [map]);

    // ── Botón de ubicación ─────────────────────────────────────────────────
    const handleLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setGeoState('error');
            return;
        }

        // Segundo clic con marcador activo → eliminar marcador y círculo, volver a idle
        if (geoState === 'found' && locationMarkerRef.current) {
            locationMarkerRef.current.remove();
            locationMarkerRef.current = null;
            accuracyCircleRef.current?.remove();
            accuracyCircleRef.current = null;
            setGeoState('idle');
            return;
        }

        setGeoState('loading');

        // Limpiar marcador y círculo de precisión anteriores
        locationMarkerRef.current?.remove();
        locationMarkerRef.current = null;
        accuracyCircleRef.current?.remove();
        accuracyCircleRef.current = null;

        // ── Estrategia de precisión máxima ──────────────────────────────
        // watchPosition recibe múltiples lecturas a medida que el dispositivo
        // refina la señal (WiFi → red → GPS). Aceptamos la primera lectura que
        // supere el umbral de precisión (≤ 50 m) o, tras el timeout, la mejor
        // que hayamos obtenido.

        const ACCURACY_TARGET_M = 50;    // metros — umbral de "buena" precisión
        const MAX_WAIT_MS       = 15_000; // esperar hasta 15 s para alcanzarlo

        let bestPosition: GeolocationPosition | null = null;
        let watchId = -1;
        let timeoutId: ReturnType<typeof setTimeout>;

        const commit = (pos: GeolocationPosition) => {
            navigator.geolocation.clearWatch(watchId);
            clearTimeout(timeoutId);

            const { latitude: lat, longitude: lng, accuracy } = pos.coords;

            // Limpiar marcador y círculo anteriores
            locationMarkerRef.current?.remove();
            accuracyCircleRef.current?.remove();

            const accuracyText =
                accuracy < 20  ? `±${Math.round(accuracy)} m (GPS)` :
                accuracy < 100 ? `±${Math.round(accuracy)} m` :
                accuracy < 500 ? `±${Math.round(accuracy)} m (baja precisión)` :
                                 `±${(accuracy / 1000).toFixed(1)} km (muy baja)`;

            const isPoorAccuracy = accuracy > 500;

            const marker = L.marker([lat, lng], { icon: LOCATION_ICON });
            marker.bindPopup(`
                <div class="rsc-location-popup">
                    <strong>Mi ubicación</strong>
                    <span>${lat.toFixed(6)}, ${lng.toFixed(6)}</span>
                    <span class="rsc-location-popup__acc">Precisión: ${accuracyText}</span>
                    ${isPoorAccuracy
                        ? `<button class="rsc-location-popup__retry"
                               onclick="this.closest('.leaflet-popup-pane').dispatchEvent(new CustomEvent('geo-retry', {bubbles:true}))">
                               🔄 Reintentar
                           </button>`
                        : ''}
                </div>
            `, { maxWidth: 240, offset: [0, -4] });

            marker.addTo(map);
            marker.openPopup();
            locationMarkerRef.current = marker;

            // Guardar referencia al círculo para poder eliminarlo al reintentar
            const circle = L.circle([lat, lng], {
                radius:      accuracy,
                color:       '#1565C0',
                fillColor:   '#1E88E5',
                fillOpacity: 0.1,
                weight:      1.5,
                interactive: false,
            });
            circle.addTo(map);
            accuracyCircleRef.current = circle;

            map.flyTo([lat, lng], 16, { animate: true, duration: 1.4 });

            // Precisión pobre → volver a idle para que el botón permita reintentar
            setGeoState(isPoorAccuracy ? 'idle' : 'found');
        };

        // Timeout: después de MAX_WAIT_MS, usar la mejor lectura disponible
        timeoutId = setTimeout(() => {
            navigator.geolocation.clearWatch(watchId);
            if (bestPosition) {
                commit(bestPosition);
            } else {
                setGeoState('error');
                setTimeout(() => setGeoState('idle'), 3000);
            }
        }, MAX_WAIT_MS);

        watchId = navigator.geolocation.watchPosition(
            (pos) => {
                // Guardar siempre la lectura si es la primera o mejor que la anterior
                if (!bestPosition || pos.coords.accuracy < bestPosition.coords.accuracy) {
                    bestPosition = pos;
                }

                // Confirmar inmediatamente si ya alcanzamos la precisión objetivo
                if (pos.coords.accuracy <= ACCURACY_TARGET_M) {
                    commit(pos);
                }
            },
            (err) => {
                navigator.geolocation.clearWatch(watchId);
                clearTimeout(timeoutId);
                console.warn('Geolocalización falló:', err.message);
                setGeoState('error');
                setTimeout(() => setGeoState('idle'), 3000);
            },
            {
                enableHighAccuracy: true,
                timeout:            MAX_WAIT_MS + 2_000,
                maximumAge:         0,   // Sin caché — siempre lectura fresca
            }
        );
    }, [map, geoState]);

    if (!portalTarget) return null;

    // ── Iconos SVG inline ─────────────────────────────────────────────────

    const HomeIcon = () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             className="rsc-svg" aria-hidden="true">
            <path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
            <polyline points="9 21 9 13 15 13 15 21" />
        </svg>
    );

    const LocationIdleIcon = () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             className="rsc-svg" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2"  x2="12" y2="6"  />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2"  y1="12" x2="6"  y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
    );

    const LocationFoundIcon = () => (
        <svg viewBox="0 0 24 24" fill="currentColor"
             className="rsc-svg rsc-svg--location-found" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path fillRule="evenodd" clipRule="evenodd"
                  d="M12 2a1 1 0 0 1 1 1v2.07A7.001 7.001 0 0 1 19.93 11H22a1 1 0 0 1 0 2h-2.07A7.001 7.001 0 0 1 13 19.93V22a1 1 0 0 1-2 0v-2.07A7.001 7.001 0 0 1 4.07 13H2a1 1 0 0 1 0-2h2.07A7.001 7.001 0 0 1 11 4.07V2a1 1 0 0 1 1-1z"
                  opacity=".45" />
        </svg>
    );

    const LocationLoadingIcon = () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round"
             className="rsc-svg rsc-svg--spinning" aria-hidden="true">
            <circle cx="12" cy="12" r="9" strokeDasharray="28 56" />
        </svg>
    );

    const LocationErrorIcon = () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
             className="rsc-svg rsc-svg--error" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <line x1="12" y1="2"  x2="12" y2="6"  />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2"  y1="12" x2="6"  y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
            <line x1="4"  y1="4"  x2="6"  y2="6"  stroke="#e53935" strokeWidth="2.5" />
            <line x1="18" y1="18" x2="20" y2="20" stroke="#e53935" strokeWidth="2.5" />
        </svg>
    );

    const locationTitle: Record<GeoState, string> = {
        idle:    'Mi ubicación',
        loading: 'Obteniendo ubicación…',
        found:   'Quitar mi ubicación',
        error:   'No se pudo obtener la ubicación',
    };

    return createPortal(
        <>
            {/* ── Home ────────────────────────────────────────────────── */}
            <button
                type="button"
                className="rsc-btn rsc-btn--svg"
                onClick={handleHome}
                title="Vista inicial"
                aria-label="Volver a la vista inicial"
            >
                <HomeIcon />
            </button>

            {/* ── Mi ubicación ─────────────────────────────────────────── */}
            <button
                type="button"
                className={[
                    'rsc-btn rsc-btn--svg',
                    geoState === 'found'   ? 'rsc-btn--location-active' : '',
                    geoState === 'error'   ? 'rsc-btn--location-error'  : '',
                    geoState === 'loading' ? 'rsc-btn--loading'         : '',
                ].filter(Boolean).join(' ')}
                onClick={handleLocation}
                title={locationTitle[geoState]}
                aria-label={locationTitle[geoState]}
                aria-busy={geoState === 'loading'}
                disabled={geoState === 'loading'}
            >
                {geoState === 'loading' && <LocationLoadingIcon />}
                {geoState === 'found'   && <LocationFoundIcon   />}
                {geoState === 'error'   && <LocationErrorIcon   />}
                {geoState === 'idle'    && <LocationIdleIcon    />}
            </button>

            {/* ── Comparador de capas (Swipe) ─────────────────────────── */}
            <button
                type="button"
                className={`rsc-btn${swipeOpen ? ' rsc-btn--active' : ''}`}
                onClick={onToggleSwipe}
                title="Comparador de capas"
                aria-label="Comparador de capas"
                aria-pressed={swipeOpen}
            >
                <img
                    src={swipeIcon}
                    alt=""
                    aria-hidden="true"
                    className="rsc-img"
                />
            </button>

            {/* ── Tabla de atributos dinámica ──────────────────────────── */}
            <button
                type="button"
                className={[
                    'rsc-btn',
                    dynamicTableOpen ? 'rsc-btn--active'   : '',
                    !hasVectorLayers  ? 'rsc-btn--disabled' : '',
                ].filter(Boolean).join(' ')}
                onClick={hasVectorLayers ? onToggleDynamicTable : undefined}
                title={
                    !hasVectorLayers
                        ? 'Activa una capa vectorial para ver la tabla de atributos'
                        : dynamicTableOpen
                            ? 'Cerrar tabla de atributos'
                            : 'Tabla de atributos dinámica'
                }
                aria-label="Tabla de atributos"
                aria-pressed={dynamicTableOpen}
                aria-disabled={!hasVectorLayers}
                tabIndex={!hasVectorLayers ? -1 : 0}
            >
                <img
                    src={tablaAtributosIcon}
                    alt=""
                    aria-hidden="true"
                    className="rsc-img"
                />
            </button>
        </>,
        portalTarget,
    );
};

export default RightSideControls;