import React, { memo } from 'react';
import { GeoJSON } from 'react-leaflet';
import L from 'leaflet';
import { getLayerOptions } from '../../utils/layerStyleFactory';

interface VectorLayerProps {
    id: string;
    data: any;
    visible: boolean;
    timestamp: number;
    opacity: number;
    selectedFeatureId: string | number | null;
    onEachFeature: (feature: any, layer: L.Layer) => void;
    /** Variante activa (solo para capas type='variant') */
    activeVariant?: string | null;
}

/**
 * Componente optimizado para renderizar capas vectoriales (GeoJSON).
 * Obtiene sus estilos desde layerStyleFactory → legendData,
 * con soporte para selección, opacidad dinámica y variantes.
 */
const VectorLayer: React.FC<VectorLayerProps> = memo(({
    id,
    data,
    visible,
    timestamp,
    opacity,
    selectedFeatureId,
    onEachFeature,
    activeVariant = null,
}) => {
    if (!visible || !data) return null;

    const { style, pointToLayer, isPoint } = getLayerOptions(id, activeVariant);

    // ── Polígonos / líneas ────────────────────────────────────────────────────
    const resolvedStyle: L.StyleFunction = (feature) => {
        const base = typeof style === 'function'
            ? style(feature)
            : { fillColor: '#e0e0e0', color: '#333', weight: 2, fillOpacity: 0.7, opacity: 1 };

        const isSelected =
            (feature?.id || feature?.properties?.id) === selectedFeatureId;

        // El slider de opacidad escala proporcionalmente fillOpacity Y opacity
        // para que toda la capa (relleno + borde) se vea más o menos transparente.
        const baseFill = base.fillOpacity ?? 0.7;

        return {
            ...base,
            opacity,
            fillOpacity: isSelected ? Math.min(opacity, 0.95) : baseFill * opacity,
            weight: isSelected ? (base.weight ?? 2) + 2 : (base.weight ?? 2),
            color: isSelected ? '#2c0614' : (base.color ?? '#333'),
        };
    };

    // ── Puntos ────────────────────────────────────────────────────────────────
    const resolvedPointToLayer = isPoint
        ? (feature: GeoJSON.Feature, latlng: L.LatLng) => {
            const isSelected =
                (feature?.id || feature?.properties?.id) === selectedFeatureId;

            // Obtener el marcador base del factory
            const marker = pointToLayer
                ? pointToLayer(feature, latlng)
                : L.circleMarker(latlng, {});

            if (marker instanceof L.CircleMarker) {
                const baseOptions = marker.options;
                marker.setStyle({
                    ...baseOptions,
                    opacity,
                    fillOpacity: opacity * (isSelected ? 1 : 0.85),
                    radius: isSelected ? (baseOptions.radius ?? 6) + 3 : (baseOptions.radius ?? 6),
                    color: isSelected ? '#2c0614' : (baseOptions.color ?? '#fff'),
                    weight: isSelected ? 3 : (baseOptions.weight ?? 1.5),
                });
            }

            return marker;
        }
        : undefined;

    return (
        <GeoJSON
            key={`${id}-${timestamp}-${activeVariant ?? 'default'}`}
            data={data}
            style={!isPoint ? resolvedStyle : undefined}
            pointToLayer={isPoint ? resolvedPointToLayer : undefined}
            onEachFeature={onEachFeature}
        />
    );
}, (prev, next) =>
    prev.visible === next.visible &&
    prev.timestamp === next.timestamp &&
    prev.selectedFeatureId === next.selectedFeatureId &&
    prev.onEachFeature === next.onEachFeature &&
    prev.opacity === next.opacity &&
    prev.activeVariant === next.activeVariant
);

VectorLayer.displayName = 'VectorLayer';
export default VectorLayer;
