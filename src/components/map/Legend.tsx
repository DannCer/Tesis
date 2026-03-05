/**
 * @fileoverview Leyenda dinámica del mapa.
 *
 * Lee legendData para construir la simbología de las capas activas.
 * Soporta todos los tipos: polygon, point, ranged-*, categorical-*, variant.
 * Incluye un panel WMS para capas ráster y un botón para minimizar.
 */

import React, { useEffect, useRef, useState, useMemo, memo } from 'react';
import L from 'leaflet';
import { config } from '../../config/env';
import { AVAILABLE_LAYERS } from '../../config/layers';
import { legendData, LayerLegend, LegendItem, VariantLegend } from '../../utils/legendData';
import { LayerData } from '../../hooks/useWFSLayers';

// ============================================================================
// TIPOS
// ============================================================================

interface LegendProps {
    activeLayers: Record<string, boolean | LayerData | any>;
    vectorLayers?: Record<string, LayerData & { color?: string; name?: string }>;
    loadingLayers?: Set<string>;
    /** Variantes activas por capa { [layerId]: variantKey } */
    activeVariants?: Record<string, string>;
    onVariantChange?: (layerId: string, variant: string) => void;
}

// ============================================================================
// HELPERS
// ============================================================================

/** Determina si una leyenda es de tipo punto (base o variante) */
const isPointType = (type: string): boolean =>
    type === 'point' || type === 'categorical-point' || type === 'ranged-point';

/** Swatch visual para un item de leyenda */
const LegendSwatch: React.FC<{ item: LegendItem; asPoint: boolean }> = ({ item, asPoint }) => {
    const style: React.CSSProperties = {
        display: 'inline-block',
        width:  item.size ? `${item.size}px` : asPoint ? '12px' : '14px',
        height: item.size ? `${item.size}px` : asPoint ? '12px' : '14px',
        backgroundColor: item.color === 'transparent' ? 'transparent' : item.color,
        border: item.borderColor
            ? `2px solid ${item.borderColor}`
            : item.color === 'transparent'
                ? '2px solid #ccc'
                : '1px solid rgba(0,0,0,0.2)',
        borderRadius: asPoint ? '50%' : '3px',
        flexShrink: 0,
        verticalAlign: 'middle',
    };
    return <span style={style} aria-hidden="true" />;
};

/** Renderiza la lista de items de una leyenda */
const LegendItems: React.FC<{ items: LegendItem[]; asPoint: boolean }> = ({ items, asPoint }) => (
    <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
        {items.map((item, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', fontSize: '11px', color: '#333' }}>
                <LegendSwatch item={item} asPoint={asPoint} />
                <span>{item.label}</span>
            </li>
        ))}
    </ul>
);

// ============================================================================
// SECCIÓN DE CAPA VECTORIAL
// ============================================================================

const VectorSection: React.FC<{
    layerId: string;
    legend: LayerLegend;
    isLoading: boolean;
    activeVariant?: string;
    onVariantChange?: (layerId: string, v: string) => void;
}> = ({ layerId, legend, isLoading, activeVariant, onVariantChange }) => {

    // Resolver leyenda actual (con variante si aplica)
    let currentLegend: { items?: LegendItem[]; type: string; note?: string } = legend as any;
    let variantKeys: string[] = [];
    let selectedVariant = activeVariant ?? '';

    if (legend.type === 'variant' && legend.variants) {
        variantKeys = Object.keys(legend.variants);
        selectedVariant = activeVariant ?? variantKeys[0] ?? '';
        currentLegend = legend.variants[selectedVariant] as VariantLegend;
    }

    if (!currentLegend) return null;

    const asPoint = isPointType(currentLegend.type);

    return (
        <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #f0f0f0' }}>
            {/* Título + spinner */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <strong style={{ fontSize: '11px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    {legend.title || layerId}
                </strong>
                {isLoading && (
                    <span style={{ width: 10, height: 10, border: '2px solid #ccc', borderTopColor: '#8d1c3d', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
                )}
            </div>

            {/* Selector de variante */}
            {variantKeys.length > 0 && (
                <select
                    value={selectedVariant}
                    onChange={e => onVariantChange?.(layerId, e.target.value)}
                    style={{ width: '100%', fontSize: '11px', padding: '3px 6px', marginBottom: '6px', borderRadius: '4px', border: '1px solid #ddd', color: '#333' }}
                >
                    {variantKeys.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
            )}

            {/* Items */}
            {currentLegend.items && (
                <LegendItems items={currentLegend.items} asPoint={asPoint} />
            )}

            {/* Nota */}
            {currentLegend.note && (
                <p style={{ fontSize: '10px', color: '#aaa', margin: '4px 0 0', fontStyle: 'italic' }}>
                    {currentLegend.note}
                </p>
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
    loadingLayers = new Set(),
    activeVariants = {},
    onVariantChange,
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
            .filter(id => !!legendData[id])
    , [activeLayers, vectorLayers]);

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

    const hasContent = activeVectorIds.length > 0 || activeRasterWmsLayers.length > 0;
    if (!hasContent) return null;

    const getWMSLegendUrl = (layerName: string) => {
        const params = new URLSearchParams({
            REQUEST: 'GetLegendGraphic',
            VERSION: '1.0.0',
            FORMAT: 'image/png',
            LAYER: `${config.geoserver.workspace}:${layerName}`,
            LEGEND_OPTIONS: 'forceLabels:on;fontName:Arial;fontSize:11;fontColor:0x333333;layout:vertical;rowGap:5',
            TRANSPARENT: 'true',
        });
        return `${config.geoserver.wmsUrl}?${params.toString()}`;
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

                    {/* ── Capas vectoriales ── */}
                    {activeVectorIds.map(id => (
                        <VectorSection
                            key={id}
                            layerId={id}
                            legend={legendData[id]}
                            isLoading={loadingLayers.has(id)}
                            activeVariant={activeVariants[id]}
                            onVariantChange={onVariantChange}
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
                </div>
            </div>

            {/* Keyframe para spinner inline */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
});

Legend.displayName = 'Legend';
export default Legend;
