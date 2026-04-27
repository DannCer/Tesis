/**
 * SwipePanel — Panel flotante para seleccionar las dos capas a comparar.
 *
 * CORRECCIÓN: antes leía AVAILABLE_LAYERS a nivel de módulo (constante estática),
 * lo que capturaba el array vacío antes de que la API respondiera.
 * Ahora consume LayersContext, que garantiza datos actualizados en cada render.
 */

import React, { useMemo, useState } from 'react';
import { useLayersContext } from '@contexts/LayersContext';
import { config, logger }   from '@config/env';
import type { SwipeLayerConfig } from '@components/map/controls/SwipeControl';
import type { LayerDef }    from '@types/geo';
import type { GrupoResponse } from '@types/api';

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Devuelve la URL del proyecto QGIS correcto para una capa según su grupo.
 * Replica la lógica de getProjectUrlForLayer() de LayerMenu para que el swipe
 * sea dinámico y no quede hardcodeado al proyecto por defecto.
 */
function getProjectUrlForLayer(layer: LayerDef, grupos: GrupoResponse[]): string {
    const grupo = grupos.find(g => g.nombre === layer.group);
    if (!grupo?.url_proyecto) {
        logger.warn(`SwipePanel: No se encontró proyecto para el grupo "${layer.group}", usando URL por defecto`);
        return layer.type === 'raster'
            ? config.qgisServer.wmsRasterUrl
            : config.qgisServer.wmsUrl;
    }
    return `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
}

function toSwipeLayer(layer: LayerDef, grupos: GrupoResponse[]): SwipeLayerConfig {
    const wmsName = layer.wmsLayer ?? ('wfsName' in layer ? layer.wfsName : undefined) ?? layer.id;
    const url = getProjectUrlForLayer(layer, grupos);
    return { id: layer.id, name: layer.name, url, layers: wmsName ?? layer.id };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface SwipePanelProps {
    active:       boolean;
    onActivate:   (left: SwipeLayerConfig, right: SwipeLayerConfig) => void;
    onDeactivate: () => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

const SwipePanel: React.FC<SwipePanelProps> = ({ active, onActivate, onDeactivate }) => {
    // ✅ Capas y grupos dinámicos desde contexto — se actualiza cuando la API responde
    const { vectorLayers, rasterLayers, grupos, loading } = useLayersContext();

    // Unión tipada de ambos arrays para el selector
    const allLayers = useMemo<LayerDef[]>(
        () => [...vectorLayers, ...rasterLayers],
        [vectorLayers, rasterLayers]
    );

    const [open,    setOpen]    = useState(false);
    const [leftId,  setLeftId]  = useState('');
    const [rightId, setRightId] = useState('');

    // Inicializa los selects cuando llegan las capas (solo la primera vez)
    React.useEffect(() => {
        if (allLayers.length >= 2 && !leftId && !rightId) {
            setLeftId(allLayers[0].id);
            setRightId(allLayers[1].id);
        }
    }, [allLayers, leftId, rightId]);

    const handleActivate = () => {
        const left  = allLayers.find(l => l.id === leftId);
        const right = allLayers.find(l => l.id === rightId);
        if (!left || !right) return;
        onActivate(toSwipeLayer(left, grupos), toSwipeLayer(right, grupos));
        setOpen(false);
    };

    const handleDeactivate = () => {
        onDeactivate();
        setOpen(false);
    };

    // Grupos únicos para los <optgroup>
    const groups = useMemo(
        () => Array.from(new Set(allLayers.map(l => l.group))),
        [allLayers]
    );

    const renderSelect = (value: string, onChange: (v: string) => void, exclude?: string) => (
        <select
            className="swipe-select"
            value={value}
            onChange={e => onChange(e.target.value)}
            disabled={loading || allLayers.length === 0}
        >
            {loading && <option value="">Cargando capas...</option>}

            {!loading && allLayers.length === 0 && (
                <option value="">No hay capas disponibles</option>
            )}

            {!loading && groups.map(group => {
                const layersInGroup = allLayers.filter(
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
            {/* Botón flotante */}
            <button
                className={`swipe-fab ${active ? 'swipe-fab-active' : ''}`}
                onClick={() => active ? handleDeactivate() : setOpen(o => !o)}
                title={active ? 'Cerrar comparador' : 'Comparar capas'}
            >                
                <span className="swipe-fab-label">
                    {active ? 'Cerrar comparador' : 'Comparar capas'}
                </span>
                {active && <span className="swipe-active-dot" />}
            </button>

            {/* Panel de configuración */}
            {open && !active && (
                <div className="swipe-config-panel">
                    <div className="swipe-config-header" >
                        
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
                            disabled={!leftId || !rightId || leftId === rightId || loading}
                        >                            
                            Activar comparador
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SwipePanel;
