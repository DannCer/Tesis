/**
 * SwipePanel — Panel flotante para seleccionar las capas a comparar
 * Se monta fuera del MapContainer, sobre el mapa como overlay.
 */

import React, { useState } from 'react';
import { AVAILABLE_LAYERS, LayerConfig } from '../../config/layers';
import { config } from '../../config/env';
import type { SwipeLayerConfig } from './SwipeControl';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convierte un LayerConfig en SwipeLayerConfig para el comparador.
 * Todos los layers (vector y ráster) se sirven como WMS desde QGIS Server.
 */
function toSwipeLayer(layer: LayerConfig): SwipeLayerConfig {
    const wmsName = layer.wmsLayer ?? layer.wfsName ?? layer.id;
    // Vectorial → WMS del proyecto vectorial; ráster → proyecto ráster
    const url = layer.type === 'raster'
        ? config.qgisServer.wmsRasterUrl
        : config.qgisServer.wmsUrl;
    return { id: layer.id, name: layer.name, url, layers: wmsName };
}

// Todas las capas disponibles para comparar
const ALL_SWIPE_LAYERS = AVAILABLE_LAYERS.filter(l => l.wmsLayer || l.wfsName || l.id);

// ── Props ─────────────────────────────────────────────────────────────────────

interface SwipePanelProps {
    active:    boolean;
    onActivate:   (left: SwipeLayerConfig, right: SwipeLayerConfig) => void;
    onDeactivate: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

const SwipePanel: React.FC<SwipePanelProps> = ({ active, onActivate, onDeactivate }) => {
    const [open,      setOpen]      = useState(false);
    const [leftId,    setLeftId]    = useState(ALL_SWIPE_LAYERS[0]?.id  ?? '');
    const [rightId,   setRightId]   = useState(ALL_SWIPE_LAYERS[1]?.id  ?? '');

    const handleActivate = () => {
        const left  = ALL_SWIPE_LAYERS.find(l => l.id === leftId);
        const right = ALL_SWIPE_LAYERS.find(l => l.id === rightId);
        if (!left || !right) return;
        onActivate(toSwipeLayer(left), toSwipeLayer(right));
        setOpen(false);
    };

    const handleDeactivate = () => {
        onDeactivate();
        setOpen(false);
    };

    // Agrupar capas por grupo para el <select>
    const groups = Array.from(new Set(ALL_SWIPE_LAYERS.map(l => l.group)));

    const renderSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
        <select
            className="swipe-select"
            value={value}
            onChange={e => onChange(e.target.value)}
        >
            {groups.map(group => {
                const layersInGroup = ALL_SWIPE_LAYERS.filter(
                    l => l.group === group && l.id !== exclude
                );
                if (!layersInGroup.length) return null;
                return (
                    <optgroup key={group} label={group}>
                        {layersInGroup.map(l => (
                            <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                    </optgroup>
                );
            })}
        </select>
    );

    return (
        <div className="swipe-panel-wrapper">
            {/* Botón flotante para abrir/cerrar el panel */}
            <button
                className={`swipe-fab ${active ? 'swipe-fab-active' : ''}`}
                onClick={() => active ? handleDeactivate() : setOpen(o => !o)}
                title={active ? 'Cerrar comparador' : 'Comparar capas'}
            >
                {/* Ícono de swipe */}
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M3 14s-1 0-1-1 1-4 6-4 6 3 6 4-1 1-1 1H3zm5-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/>
                    <path fillRule="evenodd" d="M13.5 5a.5.5 0 0 1 .5.5v2.5H16a.5.5 0 0 1 0 1h-2v2.5a.5.5 0 0 1-1 0V9H11a.5.5 0 0 1 0-1h2V5.5a.5.5 0 0 1 .5-.5z"/>
                </svg>
                <span className="swipe-fab-label">
                    {active ? 'Cerrar comparador' : 'Comparar capas'}
                </span>
                {active && <span className="swipe-active-dot" />}
            </button>

            {/* Panel de selección */}
            {open && !active && (
                <div className="swipe-config-panel">
                    <div className="swipe-config-header">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M11.354 1.646a.5.5 0 0 1 0 .708L9.207 4.5l2.147 2.146a.5.5 0 0 1-.708.708l-2.5-2.5a.5.5 0 0 1 0-.708l2.5-2.5a.5.5 0 0 1 .708 0zm-6.708 0a.5.5 0 0 0 0 .708L6.793 4.5 4.646 6.646a.5.5 0 0 0 .708.708l2.5-2.5a.5.5 0 0 0 0-.708l-2.5-2.5a.5.5 0 0 0-.708 0z"/>
                        </svg>
                        Comparar capas
                        <button className="swipe-config-close" onClick={() => setOpen(false)}>✕</button>
                    </div>

                    <div className="swipe-config-body">
                        <div className="swipe-side-row">
                            <div className="swipe-side-badge left">◀ Izquierda</div>
                            {renderSelect(leftId, setLeftId, rightId)}
                        </div>

                        <div className="swipe-divider-icon">⇄</div>

                        <div className="swipe-side-row">
                            <div className="swipe-side-badge right">Derecha ▶</div>
                            {renderSelect(rightId, setRightId, leftId)}
                        </div>

                        <p className="swipe-hint">
                            Arrastra la barra vertical para comparar ambas capas sobre el mapa.
                        </p>

                        <button
                            className="swipe-activate-btn"
                            onClick={handleActivate}
                            disabled={leftId === rightId || !leftId || !rightId}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/>
                                <path d="M6.271 5.055a.5.5 0 0 1 .52.038l3.5 2.5a.5.5 0 0 1 0 .814l-3.5 2.5A.5.5 0 0 1 6 10.5v-5a.5.5 0 0 1 .271-.445z"/>
                            </svg>
                            Activar comparador
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SwipePanel;
