/**
 * @fileoverview Leyenda dinámica del mapa.
 *
 * La simbología de todas las capas viene de GeoServer vía WMS GetLegendGraphic.
 * Soporta todos los tipos: polygon, point, ranged-*, categorical-*, variant.
 * Incluye un panel WMS para capas ráster y un botón para minimizar.
 */

import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import L from 'leaflet';
import { config } from '../../config/env';
import { AVAILABLE_LAYERS, LayerConfig } from '../../config/layers';
import { LayerData } from '../../hooks/useWFSLayers';
import type { ExternalLayer } from './LayerMenu';
import { SymbologyStyle, DEFAULT_SYMBOLOGY, getRampGradientCSS } from '../../utils/symbologyUtils';

// ============================================================================
// TIPOS
// ============================================================================

interface LegendProps {
    activeLayers: Record<string, boolean | LayerData | any>;
    vectorLayers?: Record<string, LayerData & { color?: string; name?: string }>;
    /** Capas externas importadas por el usuario */
    externalLayers?: ExternalLayer[];
    externalVisible?: Record<string, boolean>;
}

// ============================================================================
// HELPERS
// ============================================================================


// ============================================================================
// SECCIÓN DE CAPA VECTORIAL — simbología desde WMS GetLegendGraphic
// ============================================================================

const VectorSection: React.FC<{
    layer: LayerConfig;
    getWMSLegendUrl: (layerName: string, time?: string) => string;
}> = ({ layer, getWMSLegendUrl }) => {
    const wmsName = layer.wmsLayer ?? layer.id;

    return (
        <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f0f0f0' }}>
            <img
                src={getWMSLegendUrl(wmsName)}
                alt={`Leyenda ${layer.name}`}
                style={{ maxWidth: '100%', display: 'block' }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
        </div>
    );
};

// ============================================================================
// SECCIÓN CAPA EXTERNA (simbología elegida por el usuario)
// ============================================================================

const ExternalLayerSection: React.FC<{ layer: ExternalLayer }> = ({ layer }) => {
    const sym: SymbologyStyle = layer.symbology ?? DEFAULT_SYMBOLOGY;
    const typeLabel =
        layer.type === 'wms'    ? 'WMS'    :
        layer.type === 'wfs'    ? 'WFS'    :
        layer.type === 'raster' ? 'GeoTIFF' :
        layer.file ? (layer.file.name.split('.').pop()?.toUpperCase() ?? 'Vectorial') : 'Vectorial';

    return (
        <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <strong style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {layer.name}
                </strong>
                <span style={{ fontSize: '9px', color: '#aaa', background: '#f5f5f5', borderRadius: '3px', padding: '1px 5px' }}>
                    {typeLabel}
                </span>
            </div>

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
                    {/* Barra de rampa continua */}
                    {sym.colorRamp && (
                        <div style={{ height: 8, borderRadius: 3, marginBottom: 6, background: getRampGradientCSS(sym.colorRamp) }} />
                    )}
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {sym.classes.map((cls, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', fontSize: '11px', color: '#333' }}>
                                <span style={{ display: 'inline-block', width: 12, height: 12, backgroundColor: cls.color, border: `1.5px solid ${sym.strokeColor}`, borderRadius: '2px', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 145, color: '#555' }}>{cls.label}</span>
                            </li>
                        ))}
                    </ul>
                    {sym.classMethod && (
                        <div style={{ fontSize: '9px', color: '#bbb', marginTop: 4, fontStyle: 'italic' }}>
                            {sym.classMethod === 'equal' ? 'Intervalos iguales' : 'Cuantiles'} · {sym.classes.length} clases
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

const Legend: React.FC<LegendProps> = memo(({
    activeLayers,
    vectorLayers = {},
    externalLayers = [],
    externalVisible = {},
}) => {
    const legendRef = useRef<HTMLDivElement>(null);
    const [minimized, setMinimized] = useState(false);

    // Deshabilitar propagación de eventos de Leaflet
    useEffect(() => {
        if (legendRef.current) {
            L.DomEvent.disableClickPropagation(legendRef.current);
            L.DomEvent.disableScrollPropagation(legendRef.current);
        }
    });

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

    // ── Capas ráster activas (para WMS legend) ──────────────────────────────
    const activeRasterWmsLayers = useMemo(() =>
        Array.from(new Set(
            AVAILABLE_LAYERS
                .filter(l => l.type === 'raster' && (
                    activeLayers[l.id] === true ||
                    (activeLayers[l.id] as any)?.visible === true
                ))
                .map(l => l.wmsLayer ?? 'usv_mosaico')
        ))
    , [activeLayers]);

    const visibleExternalLayers = externalLayers.filter(l => externalVisible[l.id] !== false);
    const hasContent = activeVectorIds.length > 0 || activeRasterWmsLayers.length > 0 || visibleExternalLayers.length > 0;
    if (!hasContent) return null;

    const getWMSLegendUrl = (layerName: string) => {
        // QGIS Server: la URL base ya incluye ?MAP=..., añadimos los parámetros con &
        const params = new URLSearchParams({
            SERVICE: 'WMS',
            REQUEST: 'GetLegendGraphic',
            VERSION: '1.3.0',
            FORMAT:  'image/png',
            LAYER:   layerName,   // sin workspace — QGIS Server no usa workspace
            TRANSPARENT: 'true',
        });
        return `${config.qgisServer.wmsUrl}&${params.toString()}`;
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
                            <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                        </svg>
                    </button>
                </div>

                {/* Cuerpo */}
                <div className={`legend-body ${minimized ? 'legend-body--hidden' : ''}`}>

                    {/* ── Capas vectoriales (simbología desde GeoServer WMS) ── */}
                    {activeVectorLayers.map(layer => (
                        <VectorSection
                            key={layer.id}
                            layer={layer}
                            getWMSLegendUrl={getWMSLegendUrl}
                        />
                    ))}

                    {/* ── Capas ráster (WMS) ── */}
                    {activeRasterWmsLayers.map(wmsName => (
                        <div key={wmsName} style={{ marginBottom: '14px' }}>
                            <strong style={{ fontSize: '11px', display: 'block', marginBottom: '8px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                {wmsName === 'usv_mosaico' ? 'Uso de Suelo y Vegetación' : wmsName.replace(/_/g, ' ')}
                            </strong>
                            <img
                                src={getWMSLegendUrl(wmsName)}
                                alt={`Leyenda ${wmsName}`}
                                style={{ maxWidth: '100%', display: 'block' }}
                            />
                        </div>
                    ))}

                    {/* ── Capas externas importadas ── */}
                    {visibleExternalLayers.length > 0 && (
                        <>
                            <div style={{ fontSize: '10px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '8px', paddingTop: (activeVectorIds.length > 0 || activeRasterWmsLayers.length > 0) ? '4px' : 0 }}>
                                Capas importadas
                            </div>
                            {visibleExternalLayers.map(layer => (
                                <ExternalLayerSection key={layer.id} layer={layer} />
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
