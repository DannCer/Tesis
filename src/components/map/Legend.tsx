import React, { useEffect, useRef, useState, memo } from 'react';
import { config } from '../../config/env';
import { AVAILABLE_LAYERS, getLayerConfig, VECTOR_STYLE_DEFAULTS } from '../../config/layers';
import L from 'leaflet';
import { LayerData } from '../../hooks/useWFSLayers';

interface LegendProps {
    activeLayers: Record<string, boolean>;
    vectorLayers: Record<string, LayerData & { color?: string; name?: string }>;
}

const Legend: React.FC<LegendProps> = memo(({ activeLayers, vectorLayers }) => {
    const legendRef = useRef<HTMLDivElement>(null);
    const [minimized, setMinimized] = useState(false);

    const activeRasterWmsLayers = Array.from(new Set(
        AVAILABLE_LAYERS
            .filter(l => l.type === 'raster' && activeLayers[l.id])
            .map(l => l.wmsLayer || 'usv_mosaico')
    ));

    const hasActiveVector = Object.values(vectorLayers).some(v => v.visible);
    const hasActiveRaster = activeRasterWmsLayers.length > 0;

    useEffect(() => {
        if (legendRef.current) {
            L.DomEvent.disableClickPropagation(legendRef.current);
            L.DomEvent.disableScrollPropagation(legendRef.current);
        }
    });

    if (!hasActiveRaster && !hasActiveVector) return null;

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
            <div
                ref={legendRef}
                className="leaflet-control legend-control"
            >
                {/* Header con título y botón minimizar */}
                <div className="legend-header">
                    <span className="legend-title">Simbología</span>
                    <button
                        className="legend-toggle-btn"
                        onClick={() => setMinimized(m => !m)}
                        title={minimized ? 'Expandir simbología' : 'Minimizar simbología'}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            fill="currentColor"
                            viewBox="0 0 16 16"
                            style={{
                                transform: minimized ? 'rotate(180deg)' : 'rotate(0deg)',
                                transition: 'transform 0.25s ease',
                                display: 'block',
                            }}
                        >
                            <path fillRule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
                        </svg>
                    </button>
                </div>

                {/* Contenido colapsable */}
                <div className={`legend-body ${minimized ? 'legend-body--hidden' : ''}`}>
                    {/* Leyendas ráster */}
                    {activeRasterWmsLayers.map(wmsName => (
                        <div key={wmsName} style={{ marginBottom: '15px' }}>
                            <strong style={{ fontSize: '11px', display: 'block', marginBottom: '8px', color: '#444', textTransform: 'uppercase' }}>
                                {wmsName === 'usv_mosaico' ? 'Uso de Suelo y Vegetación' : wmsName?.replace('_', ' ')}
                            </strong>
                            <img
                                src={getWMSLegendUrl(wmsName!)}
                                alt={`Leyenda ${wmsName}`}
                                style={{ maxWidth: '100%', display: 'block', marginBottom: '5px' }}
                            />
                        </div>
                    ))}

                    {/* Leyendas vectoriales */}
                    {hasActiveVector && (
                        <div style={{ marginTop: '10px', borderTop: hasActiveRaster ? '1px solid #eee' : 'none', paddingTop: hasActiveRaster ? '10px' : '0' }}>
                            <strong style={{ fontSize: '11px', display: 'block', marginBottom: '8px', color: '#444', textTransform: 'uppercase' }}>
                                Capas Vectoriales
                            </strong>
                            {Object.entries(vectorLayers).map(([id, layer]) => {
                                if (!layer.visible || !layer.data) return null;
                                const layerCfg = getLayerConfig(id);
                                const color = layerCfg?.color || (id.includes('municipio') ? '#BC955B' : '#cd171e');
                                const weight = layerCfg?.weight ?? VECTOR_STYLE_DEFAULTS.weight;
                                const fillOpacity = layerCfg?.fillOpacity ?? VECTOR_STYLE_DEFAULTS.fillOpacity;
                                const firstFeature = layer.data.features?.[0];
                                const geomType = firstFeature?.geometry?.type;

                                return (
                                    <div key={id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', fontSize: '11px' }}>
                                        {geomType === 'Point' || geomType === 'MultiPoint' ? (
                                            <span style={{ display: 'inline-block', width: '12px', height: '12px', backgroundColor: color, borderRadius: '50%', border: '2px solid white', boxShadow: '0 0 2px rgba(0,0,0,0.5)', marginRight: '10px' }} />
                                        ) : geomType === 'LineString' || geomType === 'MultiLineString' ? (
                                            <span style={{ display: 'inline-block', width: '18px', height: `${weight}px`, backgroundColor: color, marginRight: '10px' }} />
                                        ) : (
                                            <span style={{ display: 'inline-block', width: '14px', height: '14px', backgroundColor: color, border: `1px solid ${color}`, borderWidth: `${weight / 2}px`, marginRight: '10px', opacity: 1, boxShadow: `inset 0 0 0 1000px rgba(255,255,255,${1 - fillOpacity})` }} />
                                        )}
                                        <span style={{ flex: 1 }}>{layer.name || id.replace('vw_', '')}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

Legend.displayName = 'Legend';
export default Legend;
