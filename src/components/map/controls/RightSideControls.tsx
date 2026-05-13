/**
 * @fileoverview RightSideControls — Botones adicionales integrados como
 * control nativo de Leaflet en la esquina superior derecha.
 *
 * Botones:
 *  - Comparador (Swipe)         → abre/cierra el SwipePanel
 *  - Tabla de Atributos Dinámica → abre/cierra DynamicAttributeTable
 *
 * @module components/map/controls/RightSideControls
 */

import React, { useEffect, useState } from 'react';
import { createPortal }               from 'react-dom';
import { useMap }                     from 'react-leaflet';
import L                              from 'leaflet';
import swipeIcon          from '@assets/images/swipe.png';
import tablaAtributosIcon from '@assets/images/tabla_atributos.png';
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

        return () => { control.remove(); };
    }, [map]);

    if (!portalTarget) return null;

    return createPortal(
        <>
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
