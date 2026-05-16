/**
 * @fileoverview MapToolbar — Barra de herramientas flotante estilo ATLAS CDMX.
 *
 * - Análisis Espacial    → abre/cierra panel AnalysisTool
 * - Lista de Capas       → colapsa/expande el LayerMenu lateral
 * - Perfil de Elevación  → abre/cierra panel ElevationProfile
 * - Resto                → deshabilitados (próximamente)
 *
 * @module components/map/tools/MapToolbar
 */

import React, { useState, useCallback } from 'react';
import ElevationProfile   from '@components/map/tools/ElevationProfile';
import AnalysisTool      from '@components/map/tools/AnalysisTool';
import AddDataTool       from '@components/map/tools/AddDataTool';
import DrawTool          from '@components/map/tools/DrawTool';
import CoordinatesTool   from '@components/map/tools/CoordinatesTool';
import DraggablePanel    from '@components/common/DraggablePanel';
import type { ExternalLayer } from '@types/geo';
import type L from 'leaflet';

import analisisIcon from '@assets/images/analisis.png';
import listasIcon   from '@assets/images/lista_de_capas.png';
import leyendaIcon  from '@assets/images/leyenda.png';
import anadirIcon   from '@assets/images/anadir_datos.png';
import dibujarIcon  from '@assets/images/dibujar.png';
import perfilIcon   from '@assets/images/perfil_de_elevacion.png';
import coordsIcon   from '@assets/images/coordenadas.png';

import '@styles/MapToolbar.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Solo los paneles flotantes; lista-de-capas y leyenda se manejan aparte */
type PanelToolId = 'analisis' | 'elevacion' | 'adddata' | 'dibujar' | 'coordenadas';

interface ToolDef {
    id: string;
    label: string;
    color: string;
    icon: string;
    enabled: boolean;
}

interface MapToolbarProps {
    mapInstance: L.Map | null;
    /** Estado actual del panel de capas (viene de MapView) */
    layerMenuCollapsed: boolean;
    /** Callback para colapsar/expandir el panel de capas */
    onToggleLayerMenu: () => void;
    /** Si la leyenda está abierta */
    legendOpen: boolean;
    /** Callback para abrir/cerrar la leyenda */
    onToggleLegend: () => void;
    /** true si hay capas activas (habilita el botón de leyenda) */
    hasActiveLayers: boolean;
    /** Callback para agregar una capa externa (viene de MapView) */
    onAddLayer: (layer: ExternalLayer) => void;
}

// ─── Definición de las 7 herramientas ─────────────────────────────────────────

const TOOLS: ToolDef[] = [
    { id: 'analisis',   label: 'Análisis Espacial',  color: '#26C6DA', icon: analisisIcon, enabled: true  },
    { id: 'capas',      label: 'Lista de Capas',      color: '#66BB6A', icon: listasIcon,   enabled: true  },
    { id: 'leyenda',    label: 'Leyenda',             color: '#FFA726', icon: leyendaIcon,  enabled: true  },
    { id: 'datos',      label: 'Añadir Datos',        color: '#BCAAA4', icon: anadirIcon,   enabled: true  },
    { id: 'dibujar',    label: 'Dibujar',             color: '#90A4AE', icon: dibujarIcon,  enabled: true  },
    { id: 'elevacion',  label: 'Perfil de Elevación', color: '#80DEEA', icon: perfilIcon,   enabled: true  },
    { id: 'coordenadas',label: 'Coordenadas',         color: '#A5D6A7', icon: coordsIcon,   enabled: true  },
];

// ─── Componente ───────────────────────────────────────────────────────────────

const MapToolbar: React.FC<MapToolbarProps> = ({
    mapInstance,
    layerMenuCollapsed,
    onToggleLayerMenu,
    legendOpen,
    onToggleLegend,
    hasActiveLayers,
    onAddLayer,
}) => {
    // Estado del panel flotante activo (análisis / elevación)
    const [activePanel, setActivePanel] = useState<PanelToolId | null>(null);

    const togglePanel = useCallback((id: string) => {
        setActivePanel(prev => (prev === id ? null : id as PanelToolId));
    }, []);

    const closePanel = useCallback(() => setActivePanel(null), []);

    /** Determina si un botón debe verse "activo" (naranja) */
    const isActive = (id: string): boolean => {
        if (id === 'capas')    return !layerMenuCollapsed;
        if (id === 'leyenda')  return legendOpen && hasActiveLayers;
        if (id === 'analisis') return activePanel === 'analisis';
        if (id === 'elevacion')return activePanel === 'elevacion';
        if (id === 'datos')    return activePanel === 'adddata';
        if (id === 'dibujar')  return activePanel === 'dibujar';
        if (id === 'coordenadas') return activePanel === 'coordenadas';
        return false;
    };

    /** Resuelve si el botón está habilitado en tiempo de ejecución */
    const isEnabled = (tool: ToolDef): boolean => {
        if (!tool.enabled) return false;
        if (tool.id === 'leyenda') return hasActiveLayers;
        return true;
    };

    /** Acción al hacer clic según el id */
    const handleClick = useCallback((tool: ToolDef) => {
        if (!isEnabled(tool)) return;
        if (tool.id === 'capas')   { onToggleLayerMenu();       return; }
        if (tool.id === 'leyenda') { onToggleLegend();           return; }
        if (tool.id === 'datos')   { togglePanel('adddata');     return; }
        if (tool.id === 'dibujar') { togglePanel('dibujar');     return; }
        if (tool.id === 'coordenadas') { togglePanel('coordenadas'); return; }
        togglePanel(tool.id);
    }, [onToggleLayerMenu, onToggleLegend, togglePanel, hasActiveLayers]);

    return (
        <>
            {/* ── Píldora flotante ──────────────────────────────────── */}
            <div className="map-toolbar" role="toolbar" aria-label="Herramientas del mapa">
                {TOOLS.map(tool => {
                    const active    = isActive(tool.id);
                    const disabled  = !isEnabled(tool);

                    return (
                        <button
                            key={tool.id}
                            className={[
                                'map-tb-btn',
                                active   ? 'map-tb-btn--active'   : '',
                                disabled ? 'map-tb-btn--disabled' : '',
                            ].join(' ').trim()}
                            style={{ '--btn-color': tool.color } as React.CSSProperties}
                            onClick={() => handleClick(tool)}
                            title={disabled ? `${tool.label} (próximamente)` : tool.label}
                            aria-label={tool.label}
                            aria-pressed={active}
                            aria-disabled={disabled}
                            tabIndex={disabled ? -1 : 0}
                        >
                            <span className="map-tb-icon">
                                <img
                                    src={tool.icon}
                                    alt=""
                                    aria-hidden="true"
                                    className="map-tb-img"
                                />
                            </span>
                            <span className="map-tb-label">{tool.label}</span>
                            {active && <span className="map-tb-dot" aria-hidden="true" />}
                        </button>
                    );
                })}
            </div>

            {/* ── Paneles flotantes ────────────────────────────────── */}
            <DraggablePanel isOpen={activePanel === 'analisis'}    defaultWidth={420} zIndex={1200}>
                <AnalysisTool
                    mapInstance={mapInstance}
                    isOpen={activePanel === 'analisis'}
                    onClose={closePanel}
                />
            </DraggablePanel>
            <DraggablePanel isOpen={activePanel === 'elevacion'}   defaultWidth={360} zIndex={1200}>
                <ElevationProfile
                    mapInstance={mapInstance}
                    isOpen={activePanel === 'elevacion'}
                    onClose={closePanel}
                />
            </DraggablePanel>
            <DraggablePanel isOpen={activePanel === 'adddata'}     defaultWidth={400} zIndex={1400}>
                <AddDataTool
                    isOpen={activePanel === 'adddata'}
                    onClose={closePanel}
                    onAddLayer={onAddLayer}
                />
            </DraggablePanel>
            <DraggablePanel isOpen={activePanel === 'dibujar'}     defaultWidth={660} zIndex={1400}>
                <DrawTool
                    mapInstance={mapInstance}
                    isOpen={activePanel === 'dibujar'}
                    onClose={closePanel}
                />
            </DraggablePanel>
            <DraggablePanel isOpen={activePanel === 'coordenadas'} defaultWidth={480} zIndex={1400}>
                <CoordinatesTool
                    mapInstance={mapInstance}
                    isOpen={activePanel === 'coordenadas'}
                    onClose={closePanel}
                />
            </DraggablePanel>
        </>
    );
};

export default MapToolbar;