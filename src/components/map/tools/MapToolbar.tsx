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

import React, { useState, useCallback, useRef, lazy, Suspense, useEffect } from 'react';
import DraggablePanel from '@components/common/DraggablePanel';
import type { ExternalLayer } from '@types/geo';
import type L from 'leaflet';

// ─── Lazy imports ─────────────────────────────────────────────────────────────
const AnalysisTool     = lazy(() => import('@components/map/tools/AnalysisTool'));
const ElevationProfile = lazy(() => import('@components/map/tools/ElevationProfile'));
const AddDataTool      = lazy(() => import('@components/map/tools/AddDataTool'));
const DrawTool         = lazy(() => import('@components/map/tools/DrawTool'));
const CoordinatesTool  = lazy(() => import('@components/map/tools/CoordinatesTool'));
const GeocoderTool     = lazy(() => import('@components/map/tools/GeocoderTool'));

import '@styles/MapToolbar.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PanelToolId = 'analisis' | 'elevacion' | 'adddata' | 'dibujar' | 'coordenadas' | 'geocoder';

interface ToolDef {
    id: string;
    label: string;
    color: string;
    icon: React.ReactNode;
    enabled: boolean;
}

interface MapToolbarProps {
    mapInstance: L.Map | null;
    layerMenuCollapsed: boolean;
    onToggleLayerMenu: () => void;
    legendOpen: boolean;
    onToggleLegend: () => void;
    hasActiveLayers: boolean;
    onAddLayer: (layer: ExternalLayer) => void;
    externalCaptureMode?: boolean;
    onCaptureDone?: () => void;
    /** Indica si el bottom sheet móvil de capas está abierto */
    mobileLayerMenuOpen?: boolean;
    /** Abre/cierra el bottom sheet de capas en móvil */
    onToggleMobileLayerMenu?: () => void;
}

// ─── Íconos SVG propios ────────────────────────────────────────────────────────

const IconAnalisis = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Lupa + polígono de zona */}
        <circle cx="10" cy="10" r="5.5" />
        <path d="M14.5 14.5 20 20" strokeWidth="2.2" />
        <path d="M10 7v3l2 1.5" strokeWidth="1.6" />
    </svg>
);

const IconCapas = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Capas apiladas */}
        <path d="M2 12l10 5 10-5" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 7l10-5 10 5-10 5L2 7z" />
    </svg>
);

const IconLeyenda = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Lista con rectángulos de color */}
        <rect x="3" y="4"  width="4" height="4" rx="1" fill="currentColor" strokeWidth="0" />
        <rect x="3" y="10" width="4" height="4" rx="1" fill="currentColor" strokeWidth="0" />
        <rect x="3" y="16" width="4" height="4" rx="1" fill="currentColor" strokeWidth="0" />
        <line x1="10" y1="6"  x2="21" y2="6"  />
        <line x1="10" y1="12" x2="21" y2="12" />
        <line x1="10" y1="18" x2="21" y2="18" />
    </svg>
);

const IconAnadir = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Globo + plus */}
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9" strokeWidth="1.5"/>
        <path d="M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9" strokeWidth="1.5"/>
        <path d="M3 12h18" strokeWidth="1.5"/>
        {/* Insignia + */}
        <circle cx="18.5" cy="5.5" r="4" fill="#1C1C1E" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M18.5 3.5v4M16.5 5.5h4" strokeWidth="1.5"/>
    </svg>
);

const IconDibujar = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Lápiz con trazo */}
        <path d="M4 20l3-1L19.5 6.5a2.121 2.121 0 0 0-3-3L4 17v3z" />
        <path d="M14.5 5.5l3 3" />
        <path d="M4 20h3" strokeWidth="1.5" />
    </svg>
);

const IconElevacion = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Montañas / perfil */}
        <polyline points="2,18 7,8 12,14 16,6 22,18" />
        <line x1="2" y1="18" x2="22" y2="18" strokeWidth="1.5"/>
    </svg>
);

const IconCoordenadas = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        {/* Retícula + punto central */}
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2"  x2="12" y2="6"  />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2"  y1="12" x2="6"  y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
);

const IconGeocoder = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ width: '58%', height: '58%' }}>
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5 22 22" />
    </svg>
);

// ─── Definición de las herramientas ───────────────────────────────────────────

const TOOLS: ToolDef[] = [
    { id: 'analisis',    label: 'Análisis Espacial',  color: '#26C6DA', icon: <IconAnalisis />,    enabled: true },
    { id: 'capas',       label: 'Lista de Capas',      color: '#66BB6A', icon: <IconCapas />,       enabled: true },
    { id: 'leyenda',     label: 'Leyenda',             color: '#FFA726', icon: <IconLeyenda />,     enabled: true },
    { id: 'datos',       label: 'Añadir Datos',        color: '#BCAAA4', icon: <IconAnadir />,      enabled: true },
    { id: 'dibujar',     label: 'Dibujar',             color: '#90A4AE', icon: <IconDibujar />,     enabled: true },
    { id: 'elevacion',   label: 'Perfil de Elevación', color: '#80DEEA', icon: <IconElevacion />,   enabled: true },
    { id: 'coordenadas', label: 'Coordenadas',         color: '#A5D6A7', icon: <IconCoordenadas />, enabled: true },
    { id: 'geocoder',    label: 'Buscar lugar',        color: '#CE93D8', icon: <IconGeocoder />,    enabled: true },
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
    externalCaptureMode = false,
    onCaptureDone,
    mobileLayerMenuOpen,
    onToggleMobileLayerMenu,
}) => {
    const [activePanel, setActivePanel] = useState<PanelToolId | null>(null);

    const mountedPanels = useRef<Set<PanelToolId>>(new Set());

    const togglePanel = useCallback((id: string) => {
        const panelId = id as PanelToolId;
        mountedPanels.current.add(panelId);
        setActivePanel(prev => (prev === panelId ? null : panelId));
    }, []);

    const closePanel = useCallback(() => setActivePanel(null), []);

    useEffect(() => {
        if (externalCaptureMode) {
            mountedPanels.current.add('coordenadas');
            setActivePanel('coordenadas');
        }
    }, [externalCaptureMode]);

    const isActive = (id: string): boolean => {
        if (id === 'capas')      return window.innerWidth <= 768
            ? (mobileLayerMenuOpen ?? false)
            : !layerMenuCollapsed;
        if (id === 'leyenda')    return legendOpen && hasActiveLayers;
        if (id === 'analisis')   return activePanel === 'analisis';
        if (id === 'elevacion')  return activePanel === 'elevacion';
        if (id === 'datos')      return activePanel === 'adddata';
        if (id === 'dibujar')    return activePanel === 'dibujar';
        if (id === 'coordenadas')return activePanel === 'coordenadas';
        if (id === 'geocoder')   return activePanel === 'geocoder';
        return false;
    };

    const isEnabled = (tool: ToolDef): boolean => {
        if (!tool.enabled) return false;
        if (tool.id === 'leyenda') return hasActiveLayers;
        return true;
    };

    const handleClick = useCallback((tool: ToolDef) => {
        if (!isEnabled(tool)) return;
        if (tool.id === 'capas') {
            if (window.innerWidth <= 768 && onToggleMobileLayerMenu) {
                onToggleMobileLayerMenu();
            } else {
                onToggleLayerMenu();
            }
            return;
        }
        if (tool.id === 'leyenda')    { onToggleLegend();           return; }
        if (tool.id === 'datos')      { togglePanel('adddata');     return; }
        if (tool.id === 'dibujar')    { togglePanel('dibujar');     return; }
        if (tool.id === 'coordenadas'){ togglePanel('coordenadas'); return; }
        if (tool.id === 'geocoder')   { togglePanel('geocoder');    return; }
        togglePanel(tool.id);
    }, [onToggleLayerMenu, onToggleLegend, togglePanel, hasActiveLayers]);

    return (
        <>
            {/* ── Píldora flotante ──────────────────────────────────── */}
            <div className="map-toolbar" role="toolbar" aria-label="Herramientas del mapa">
                {TOOLS.map(tool => {
                    const active   = isActive(tool.id);
                    const disabled = !isEnabled(tool);

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
                                {tool.icon}
                            </span>
                            <span className="map-tb-label">{tool.label}</span>
                            {active && <span className="map-tb-dot" aria-hidden="true" />}
                        </button>
                    );
                })}
            </div>

            {/* ── Paneles flotantes ─────────────────────────────────────────── */}
            {mountedPanels.current.has('analisis') && (
                <DraggablePanel isOpen={activePanel === 'analisis'} defaultWidth={420} zIndex={1200}>
                    <Suspense fallback={null}>
                        <AnalysisTool
                            mapInstance={mapInstance}
                            isOpen={activePanel === 'analisis'}
                            onClose={closePanel}
                        />
                    </Suspense>
                </DraggablePanel>
            )}
            {mountedPanels.current.has('elevacion') && (
                <DraggablePanel isOpen={activePanel === 'elevacion'} defaultWidth={360} zIndex={1200}>
                    <Suspense fallback={null}>
                        <ElevationProfile
                            mapInstance={mapInstance}
                            isOpen={activePanel === 'elevacion'}
                            onClose={closePanel}
                        />
                    </Suspense>
                </DraggablePanel>
            )}
            {mountedPanels.current.has('adddata') && (
                <DraggablePanel isOpen={activePanel === 'adddata'} defaultWidth={400} zIndex={1400}>
                    <Suspense fallback={null}>
                        <AddDataTool
                            isOpen={activePanel === 'adddata'}
                            onClose={closePanel}
                            onAddLayer={onAddLayer}
                        />
                    </Suspense>
                </DraggablePanel>
            )}
            {mountedPanels.current.has('dibujar') && (
                <DraggablePanel isOpen={activePanel === 'dibujar'} defaultWidth={660} zIndex={1400}>
                    <Suspense fallback={null}>
                        <DrawTool
                            mapInstance={mapInstance}
                            isOpen={activePanel === 'dibujar'}
                            onClose={closePanel}
                        />
                    </Suspense>
                </DraggablePanel>
            )}
            {mountedPanels.current.has('coordenadas') && (
                <DraggablePanel isOpen={activePanel === 'coordenadas'} defaultWidth={480} zIndex={1400}>
                    <Suspense fallback={null}>
                        <CoordinatesTool
                            mapInstance={mapInstance}
                            isOpen={activePanel === 'coordenadas'}
                            onClose={closePanel}
                            externalCaptureMode={externalCaptureMode && activePanel === 'coordenadas'}
                            onCaptureDone={onCaptureDone}
                        />
                    </Suspense>
                </DraggablePanel>
            )}
            {mountedPanels.current.has('geocoder') && (
                <DraggablePanel isOpen={activePanel === 'geocoder'} defaultWidth={420} zIndex={1400}>
                    <Suspense fallback={null}>
                        <GeocoderTool
                            mapInstance={mapInstance}
                            isOpen={activePanel === 'geocoder'}
                            onClose={closePanel}
                        />
                    </Suspense>
                </DraggablePanel>
            )}
        </>
    );
};

export default MapToolbar;