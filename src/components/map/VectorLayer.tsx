import React, { memo } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { VECTOR_STYLE_DEFAULTS, getLayerConfig } from '../../config/layers';

interface VectorLayerProps {
    id: string;
    data: any;
    visible: boolean;
    timestamp: number;
    opacity: number;
    selectedFeatureId: string | number | null;
    onEachFeature: (feature: any, layer: L.Layer) => void;
}

/**
 * Componente optimizado para renderizar capas vectoriales (GeoJSON).
 * Utiliza React.memo para evitar re-renders innecesarios.
 */
const VectorLayer: React.FC<VectorLayerProps> = memo(({
    id,
    data,
    visible,
    timestamp,
    opacity,
    selectedFeatureId,
    onEachFeature
}) => {
    if (!visible || !data) return null;

    const layerCfg = getLayerConfig(id);
    const baseColor = layerCfg?.color || (id.includes('municipio') ? '#BC955B' : '#cd171e');
    const weight = layerCfg?.weight ?? VECTOR_STYLE_DEFAULTS.weight;
    const fillOpacity = layerCfg?.fillOpacity ?? VECTOR_STYLE_DEFAULTS.fillOpacity;

    // Ajustamos la opacidad de relleno proporcional a la opacidad maestra
    const adjustedFillOpacity = (isSelected: boolean) => {
        const base = isSelected ? 0.6 : fillOpacity;
        return base * opacity;
    };

    return (
        <GeoJSON
            key={`${id}-${timestamp}`}
            data={data}
            style={(feature) => {
                const isSelected = (feature?.id || feature?.properties?.id) === selectedFeatureId;
                const color = isSelected ? '#691B31' : baseColor;
                
                return {
                    color: color,
                    weight: isSelected ? weight + 2 : weight,
                    opacity: opacity,
                    fillOpacity: adjustedFillOpacity(isSelected),
                    fillColor: color
                };
            }}
            pointToLayer={(feature, latlng) => {
                const isSelected = (feature?.id || feature?.properties?.id) === selectedFeatureId;
                const color = isSelected ? '#691B31' : baseColor;
                
                return L.circleMarker(latlng, {
                    radius: isSelected ? 8 : 6,
                    fillColor: color,
                    color: "#fff",
                    weight: 2,
                    opacity: opacity,
                    fillOpacity: opacity * 0.8
                });
            }}
            onEachFeature={onEachFeature}
        />
    );
}, (prevProps, nextProps) => {
    // Solo re-renderizar si cambia la visibilidad, los datos, la selección o la opacidad
    return (
        prevProps.visible === nextProps.visible &&
        prevProps.timestamp === nextProps.timestamp &&
        prevProps.selectedFeatureId === nextProps.selectedFeatureId &&
        prevProps.onEachFeature === nextProps.onEachFeature &&
        prevProps.opacity === nextProps.opacity
    );
});

VectorLayer.displayName = 'VectorLayer';

export default VectorLayer;
