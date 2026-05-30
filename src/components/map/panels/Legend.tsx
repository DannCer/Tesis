/**
 * @fileoverview Leyenda dinámica del mapa.
 *
 * La simbología de todas las capas viene de GeoServer vía WMS GetLegendGraphic.
 * Soporta todos los tipos: polygon, point, ranged-*, categorical-*, variant.
 * Incluye un panel WMS para capas ráster y un botón para minimizar.
 * MEJORADO: Ahora soporta simbología dinámica por proyecto/grupo
 */

import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import L from 'leaflet';
import { config, logger } from '@config/env';
import { LayerConfig } from '@config/layers';
import { useLayersData } from '@contexts/LayersContext';
import { LayerData } from '@hooks/map';
import type { ExternalLayer } from '@types/geo';
import type { GrupoResponse } from '@types/api';
import { SymbologyStyle, DEFAULT_SYMBOLOGY, getRampGradientCSS } from '@utils/geo/symbologyUtils';

// ============================================================================
// TIPOS
// ============================================================================

interface LegendProps {
    activeLayers: Record<string, boolean | LayerData | any>;
    vectorLayers?: Record<string, LayerData & { color?: string; name?: string }>;
    /** Capas externas importadas por el usuario */
    externalLayers?: ExternalLayer[];
    externalVisible?: Record<string, boolean>;
    /** Grupos (proyectos) para resolver URLs dinámicas de leyenda */
    grupos?: GrupoResponse[];
    /** Control externo del panel (MapToolbar) — si false, oculta el panel */
    isOpen?: boolean;
    /** Callback para cerrar desde MapToolbar */
    onClose?: () => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Obtiene la URL del proyecto correspondiente al grupo de una capa
 * Usa los grupos cargados desde la API para resolver dinámicamente
 * @param layer Configuración de la capa
 * @param grupos Lista de grupos/proyectos disponibles
 * @returns URL base del proyecto para GetLegendGraphic
 */
const getProjectUrlForLayer = (layer: LayerConfig, grupos: GrupoResponse[] = []): string => {
    // Si no hay grupo o grupos vacío, usar URL por defecto
    if (!layer.group || grupos.length === 0) {
        return config.qgisServer.wmsUrl;
    }
    
    // Buscar el grupo que coincida con el de la capa
    const grupo = grupos.find(g => g.nombre === layer.group);
    if (!grupo || !grupo.url_proyecto) {
        logger.warn(`No se encontró proyecto para el grupo "${layer.group}", usando URL por defecto`);
        return config.qgisServer.wmsUrl;
    }
    
    // Construir URL base con el proyecto correcto
    return `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
};

// ============================================================================
// HELPERS DE UI
// ============================================================================

const ChevronIcon: React.FC<{ collapsed: boolean }> = ({ collapsed }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="10" height="10"
        fill="currentColor"
        viewBox="0 0 16 16"
        style={{
            transform: collapsed ? 'rotate(-90deg)' : 'none',
            transition: 'transform 0.2s ease',
            display: 'block',
            flexShrink: 0,
        }}
    >
        <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
    </svg>
);

const SectionHeader: React.FC<{
    name: string;
    badge?: string;
    collapsed: boolean;
    onToggle: () => void;
}> = ({ name, badge, collapsed, onToggle }) => (
    <div
        onClick={onToggle}
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            userSelect: 'none',
            marginBottom: collapsed ? 0 : '6px',
            gap: '6px',
        }}
    >
        <strong style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px', flex: 1, lineHeight: 1.3 }}>
            {name}
        </strong>
        {badge && (
            <span style={{ fontSize: '9px', color: '#aaa', background: '#f5f5f5', borderRadius: '3px', padding: '1px 5px', flexShrink: 0 }}>
                {badge}
            </span>
        )}
        <ChevronIcon collapsed={collapsed} />
    </div>
);

// ============================================================================
// SECCIÓN DE CAPA VECTORIAL — simbología desde WMS GetLegendGraphic
// ============================================================================

const VectorSection: React.FC<{
    layer: LayerConfig;
    collapsed: boolean;
    onToggle: () => void;
    getWMSLegendUrl: (layerName: string, layer: LayerConfig) => string;
}> = ({ layer, collapsed, onToggle, getWMSLegendUrl }) => {
    const wmsName = layer.wmsLayer ?? layer.id;

    return (
        <div className="legend-section">
            <SectionHeader name={layer.name} collapsed={collapsed} onToggle={onToggle} />
            {!collapsed && (
                <img
                    src={getWMSLegendUrl(wmsName, layer)}
                    alt={`Leyenda ${layer.name}`}
                    className="legend-image"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
            )}
        </div>
    );
};

// ============================================================================
// SECCIÓN CAPA EXTERNA (simbología elegida por el usuario)
// ============================================================================

const ExternalLayerSection: React.FC<{ layer: ExternalLayer; collapsed: boolean; onToggle: () => void }> = ({ layer, collapsed, onToggle }) => {
    const sym: SymbologyStyle = layer.symbology ?? DEFAULT_SYMBOLOGY;
    const typeLabel =
        layer.type === 'wms' ? 'WMS' :
            layer.type === 'wfs' ? 'WFS' :
                layer.type === 'raster' ? 'GeoTIFF' :
                    layer.file ? (layer.file.name.split('.').pop()?.toUpperCase() ?? 'Vectorial') : 'Vectorial';

    return (
        <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f0f0f0' }}>
            <SectionHeader name={layer.name} badge={typeLabel} collapsed={collapsed} onToggle={onToggle} />
            {!collapsed && (<>
                {(layer.type === 'wms' || layer.type === 'wfs' || layer.type === 'raster') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#666' }}>
                        <span style={{ display: 'inline-block', width: 14, height: 14, background: layer.type === 'raster' ? 'linear-gradient(135deg,#e74c3c,#f39c12,#2ecc71)' : '#6b7280', borderRadius: '2px', flexShrink: 0 }} />
                        <span>{layer.type === 'raster' ? 'Banda(s) GeoTIFF' : (layer.layerName ?? 'Capa')}</span>
                    </div>
                )}

                {layer.type === 'vector' && sym.mode === 'single' && (
                    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                        <li style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#333' }}>
                            <span style={{ display: 'inline-block', width: 14, height: 14, backgroundColor: sym.fillColor, border: `${sym.strokeWeight}px solid ${sym.strokeColor}`, borderRadius: '3px', flexShrink: 0 }} />
                            <span style={{ color: '#555' }}>{layer.name}</span>
                        </li>
                    </ul>
                )}

                {layer.type === 'vector' && sym.mode === 'categorical' && sym.categories && (
                    <>
                        {sym.field && <div style={{ fontSize: '10px', color: '#999', marginBottom: '4px', fontStyle: 'italic' }}>Campo: {sym.field}</div>}
                        <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                            {sym.categories.map((cat, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px', color: '#333' }}>
                                    <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: cat.color, border: `1.5px solid ${sym.strokeColor}`, borderRadius: '3px', flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{cat.value}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                {layer.type === 'vector' && sym.mode === 'classified' && sym.classes && sym.classes.length > 0 && (
                    <>
                        {sym.expression && (
                            <div style={{ fontSize: '10px', color: '#999', marginBottom: '5px', fontStyle: 'italic', wordBreak: 'break-all' }}>
                                Expresión: <strong style={{ color: '#777' }}>{sym.expression}</strong>
                            </div>
                        )}
                        <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                            {sym.classes.map((cls, i) => (
                                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '11px', color: '#333' }}>
                                    <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: cls.color, border: `1.5px solid ${sym.strokeColor}`, borderRadius: '3px', flexShrink: 0 }} />
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{cls.range}</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </>)}
        </div>
    );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

const Legend: React.FC<LegendProps> = memo((props) => {
    const { availableLayers: AVAILABLE_LAYERS } = useLayersData();
    const {
        activeLayers, vectorLayers, externalLayers = [], externalVisible = {},
        grupos = [], isOpen, onClose,
    } = props;
    // Control externo: MapToolbar controla visibilidad
    const controlled = isOpen !== undefined;
    const legendRef = useRef<HTMLDivElement>(null);
    const bodyRef = useRef<HTMLDivElement>(null);
    const [minimized, setMinimized] = useState(false);
    const [collapsedLayers, setCollapsedLayers] = useState<Record<string, boolean>>({});

    const toggleLayerCollapse = (id: string) => setCollapsedLayers(s => ({ ...s, [id]: !s[id] }));

    // Prevenir scroll-chaining al mapa — no queremos que scroll en la leyenda
    // afecte el zoom del mapa. Usamos stopPropagation() para eso.
    // PERO: scroll-chaining es una característica del navegador que ocurre naturalmente
    // cuando el elemento con overflow-y:auto ha llegado al final del scroll.
    // No depende de que el evento llegue a ningún padre, solo de que no se llame
    // preventDefault() en ese elemento. Al no llamar preventDefault() el
    // navegador aplica el scroll nativo aunque luego cortemos la propagación.
    useEffect(() => {
        const el = legendRef.current;
        if (!el) return;
        const stop = (e: WheelEvent) => e.stopPropagation();
        el.addEventListener('wheel', stop);
        return () => el.removeEventListener('wheel', stop);
    }, []);

    // ── Capas vectoriales activas con leyenda definida ──────────────────────
    const activeVectorIds = useMemo(() =>
        AVAILABLE_LAYERS
            .filter(l => l.type === 'vector' && (
                activeLayers[l.id] === true ||
                (activeLayers[l.id] as LayerData)?.visible === true ||
                vectorLayers[l.id]?.visible === true
            ))
            .map(l => l.id)
        , [activeLayers, vectorLayers]);

    // Resolver objetos LayerConfig completos para las capas vectoriales activas
    const activeVectorLayers: LayerConfig[] = useMemo(() =>
        activeVectorIds
            .map(id => AVAILABLE_LAYERS.find(l => l.id === id))
            .filter((l): l is LayerConfig => !!l)
        , [activeVectorIds]);

    // ── Capas ráster activas (leyenda por capa) ─────────────────────────────
    const activeRasterLayers = useMemo(() =>
        AVAILABLE_LAYERS.filter(l => l.type === 'raster' && (
            activeLayers[l.id] === true ||
            (activeLayers[l.id] as any)?.visible === true
        ))
        , [activeLayers]);

    const visibleExternalLayers = externalLayers.filter(l => externalVisible[l.id] !== false);
    const hasContent = activeVectorIds.length > 0 || activeRasterLayers.length > 0 || visibleExternalLayers.length > 0;
    // Sin capas activas → nunca mostrar
    if (!hasContent) return null;
    // Si controlado externamente y el toolbar lo cerró → ocultar
    if (controlled && !isOpen) return null;

    /**
     * MEJORADO: Construye URL de GetLegendGraphic usando proyecto correcto
     * @param layerName Nombre de la capa en WMS
     * @param layer Configuración de la capa (para obtener su grupo/proyecto)
     * @returns URL completa para GetLegendGraphic
     */
    const getWMSLegendUrl = (layerName: string, layer: LayerConfig) => {
        // Resolver la URL base del proyecto para esta capa
        const baseUrl = getProjectUrlForLayer(layer, grupos);
        
        // Crear objeto URL para construir parámetros
        const url = new URL(baseUrl);
        
        // Asegurar que tiene el parámetro MAP con el proyecto correcto
        if (!url.searchParams.has('MAP') && layer.group) {
            const grupo = grupos.find(g => g.nombre === layer.group);
            if (grupo?.url_proyecto) {
                url.searchParams.set('MAP', grupo.url_proyecto);
            }
        }
        
        // Agregar parámetros WMS estándar para GetLegendGraphic
        url.searchParams.set('SERVICE', 'WMS');
        url.searchParams.set('REQUEST', 'GetLegendGraphic');
        url.searchParams.set('VERSION', '1.3.0');
        url.searchParams.set('FORMAT', 'image/png');
        url.searchParams.set('LAYER', layerName);
        url.searchParams.set('TRANSPARENT', 'true');
        
        logger.debug(`GetLegendGraphic URL para ${layerName}: ${url.toString()}`);
        return url.toString();
    };

    return (
        <div
            className="leaflet-bottom leaflet-right"
            style={{ pointerEvents: 'auto', marginBottom: '25px', marginRight: '10px', zIndex: 1000 }}
        >
            <div ref={legendRef} className="leaflet-control legend-control">

                {/* Header */}
                <div className="legend-header">
                    <span className="legend-title">Simbología</span>
                    {/* Botón minimizar: solo visible cuando NO lo controla MapToolbar */}
                    {!controlled && (
                        <button
                            className="legend-toggle-btn"
                            onClick={() => setMinimized(m => !m)}
                            title={minimized ? 'Expandir' : 'Minimizar'}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="12" height="12"
                                fill="currentColor"
                                viewBox="0 0 16 16"
                                style={{ transform: minimized ? 'rotate(180deg)' : 'none', transition: 'transform 0.25s', display: 'block' }}
                            >
                                <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Cuerpo — cuando controlled, siempre expandido */}
                <div ref={bodyRef} className={`legend-body ${(!controlled && minimized) ? 'legend-body--hidden' : ''}`}>

                    {/* ── Capas vectoriales (simbología desde GeoServer WMS) ── */}
                    {activeVectorLayers.map(layer => (
                        <VectorSection
                            key={layer.id}
                            layer={layer}
                            collapsed={!!collapsedLayers[layer.id]}
                            onToggle={() => toggleLayerCollapse(layer.id)}
                            getWMSLegendUrl={getWMSLegendUrl}
                        />
                    ))}

                    {/* ── Capas ráster (WMS) ── */}
                    {activeRasterLayers.map(layer => {
                        const wmsName = layer.wmsLayer ?? 'usv_mosaico';
                        const ramp = layer.legendRamp;
                        const collapsed = !!collapsedLayers[layer.id];
                        return (
                            <div key={layer.id} style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f0f0f0' }}>
                                <SectionHeader
                                    name={layer.name}
                                    badge="Ráster"
                                    collapsed={collapsed}
                                    onToggle={() => toggleLayerCollapse(layer.id)}
                                />
                                {!collapsed && (
                                    ramp?.colors?.length ? (
                                        <div>
                                            <div
                                                style={{
                                                    height: 14,
                                                    borderRadius: 4,
                                                    border: '1px solid #ddd',
                                                    background: `linear-gradient(to right, ${ramp.colors.join(', ')})`,
                                                }}
                                            />
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#777', marginTop: 4 }}>
                                                <span>{ramp.minLabel ?? 'Mínimo'}</span>
                                                <span>{ramp.maxLabel ?? 'Máximo'}</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <img
                                            src={getWMSLegendUrl(wmsName, layer)}
                                            alt={`Leyenda ${wmsName}`}
                                            style={{ maxWidth: '100%', display: 'block' }}
                                        />
                                    )
                                )}
                            </div>
                        );
                    })}

                    {/* ── Capas externas importadas ── */}
                    {visibleExternalLayers.length > 0 && (
                        <>
                            <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px', paddingTop: (activeVectorIds.length > 0 || activeRasterLayers.length > 0) ? '4px' : 0 }}>
                                Capas importadas
                            </div>
                            {visibleExternalLayers.map(layer => (
                                <ExternalLayerSection
                                    key={layer.id}
                                    layer={layer}
                                    collapsed={!!collapsedLayers[`ext_${layer.id}`]}
                                    onToggle={() => toggleLayerCollapse(`ext_${layer.id}`)}
                                />
                            ))}
                        </>
                    )}
                </div>
            </div>

            {/* Keyframe para spinner inline */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
});

Legend.displayName = 'Legend';
export default Legend;