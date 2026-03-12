import React, { memo, useMemo, useRef, useEffect } from 'react';
import { GeoJSON, WMSTileLayer } from 'react-leaflet';
import L from 'leaflet';
import { config } from '../../config/env';

interface VectorLayerProps {
    id: string;
    wmsLayer: string;
    data: any;
    visible: boolean;
    timestamp: number;
    opacity: number;
    selectedFeatureId: string | number | null;
    onEachFeature: (feature: any, layer: L.Layer) => void;
    zIndex?: number;
}

/**
 * Capa vectorial: WMSTileLayer (visual) + GeoJSON invisible (interactividad).
 *
 * REGLA CRÍTICA: el key del GeoJSON NUNCA incluye selectedFeatureId.
 * Si lo incluyera, React desmonaría y remonaría el layer en cada clic,
 * destruyendo el popup antes de que pudiera mostrarse.
 * El highlight de selección se actualiza con setStyle() imperativo.
 */
const VectorLayer: React.FC<VectorLayerProps> = memo(({
    id,
    wmsLayer,
    data,
    visible,
    timestamp,
    opacity,
    selectedFeatureId,
    onEachFeature,
    zIndex = 400,
}) => {
    // Mapa featureId → Leaflet layer para actualizaciones imperativas de estilo
    const layerMapRef  = useRef<Map<string | number, L.Path>>(new Map());
    const prevSelRef   = useRef<string | number | null>(null);

    const hasPoints = useMemo(() => {
        if (!data?.features) return false;
        return data.features.some((f: GeoJSON.Feature) => {
            const t = f.geometry?.type ?? '';
            return t === 'Point' || t === 'MultiPoint';
        });
    }, [data]);

    // Limpiar el mapa de layers cuando cambian los datos
    useEffect(() => {
        layerMapRef.current.clear();
        prevSelRef.current = null;
    }, [timestamp]);

    // Actualizar highlight de selección de forma imperativa (sin re-montar el GeoJSON)
    useEffect(() => {
        const map = layerMapRef.current;

        // Restaurar estilo del anteriormente seleccionado
        if (prevSelRef.current !== null) {
            const prev = map.get(prevSelRef.current);
            if (prev) applyStyle(prev, false, opacity);
        }
        // Aplicar highlight al nuevo seleccionado
        if (selectedFeatureId !== null) {
            const curr = map.get(selectedFeatureId);
            if (curr) applyStyle(curr, true, opacity);
        }
        prevSelRef.current = selectedFeatureId;
    }, [selectedFeatureId, opacity]);

    // onEachFeature extendido: registra cada layer en el mapa para poder actualizar su estilo
    const wrappedOnEachFeature = useMemo(() =>
        (feature: any, layer: L.Layer) => {
            const fid = feature?.id ?? feature?.properties?.id;
            if (fid !== undefined && layer instanceof L.Path) {
                layerMapRef.current.set(fid, layer);
            }
            onEachFeature(feature, layer);
        }
    , [onEachFeature]);

    // Estilo inicial del hit-layer: casi invisible pero con opacity > 0
    // para que Leaflet NO desactive pointer-events en el SVG
    const hitStyle: L.StyleFunction = (feature) => {
        const t = feature?.geometry?.type ?? '';
        const isPoly = t === 'Polygon' || t === 'MultiPolygon';
        return {
            fillColor:   '#000',
            fillOpacity: isPoly ? 0.001 : 0,
            color:       '#000',
            weight:      isPoly ? 1 : 4,
            opacity:     0.001,
        };
    };

    // pointToLayer: CircleMarker invisible para puntos (evita el marcador azul)
    const pointToLayer = useMemo(() =>
        hasPoints
            ? (_f: GeoJSON.Feature, latlng: L.LatLng) =>
                L.circleMarker(latlng, {
                    radius: 14, fillColor: '#000', fillOpacity: 0.001,
                    color: '#000', weight: 0.001, opacity: 0.001,
                })
            : undefined
    , [hasPoints]);

    if (!visible) return null;

    return (
        <>
            {/* Visual: simbología de GeoServer */}
            <WMSTileLayer
                key={`${id}-wms`}
                url={config.geoserver.wmsUrl}
                layers={`${config.geoserver.workspace}:${wmsLayer}`}
                format="image/png"
                transparent={true}
                opacity={opacity}
                zIndex={zIndex}
                params={{ _ts: timestamp } as any}
            />

            {/* Hit-layer: key estable — NO cambia al hacer clic */}
            {data && (
                <GeoJSON
                    key={`${id}-hit-${timestamp}`}
                    data={data}
                    style={!hasPoints ? hitStyle : undefined}
                    pointToLayer={pointToLayer}
                    onEachFeature={wrappedOnEachFeature}
                />
            )}
        </>
    );
},
// selectedFeatureId se maneja imperativamente → no necesita re-montar el componente
(prev, next) =>
    prev.visible       === next.visible       &&
    prev.timestamp     === next.timestamp     &&
    prev.onEachFeature === next.onEachFeature &&
    prev.opacity       === next.opacity       &&
    prev.wmsLayer      === next.wmsLayer      &&
    prev.selectedFeatureId === next.selectedFeatureId
);

// Aplica o restaura el estilo hit de un layer de forma imperativa
function applyStyle(layer: L.Path, selected: boolean, opacity: number) {
    if (layer instanceof L.CircleMarker) {
        layer.setStyle({
            fillColor:   selected ? '#2c0614' : '#000',
            fillOpacity: selected ? 0.3 * opacity : 0.001,
            color:       selected ? '#2c0614' : '#000',
            weight:      selected ? 2 : 0.001,
            opacity:     selected ? opacity : 0.001,
        });
        layer.setRadius(selected ? 18 : 14);
    } else {
        layer.setStyle({
            fillColor:   selected ? '#2c0614' : '#000',
            fillOpacity: selected ? 0.3 * opacity : 0.001,
            color:       selected ? '#2c0614' : '#000',
            weight:      selected ? 3 : 1,
            opacity:     selected ? opacity : 0.001,
        });
    }
}

VectorLayer.displayName = 'VectorLayer';
export default VectorLayer;
