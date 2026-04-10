import React, { memo, useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { GeoJSON, ImageOverlay, WMSTileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { config } from '@config/env';

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

interface ViewportWmsOverlayProps {
    layerId: string;
    layerName: string;
    opacity: number;
    zIndex: number;
    timestamp: number;
}

const ViewportWmsOverlay: React.FC<ViewportWmsOverlayProps> = ({
    layerId,
    layerName,
    opacity,
    zIndex,
    timestamp,
}) => {
    const map = useMap();
    const [overlay, setOverlay] = useState<{ url: string; bounds: L.LatLngBoundsExpression } | null>(null);

    const updateOverlay = useCallback(() => {
        const size = map.getSize();
        if (!size.x || !size.y) return;

        const bounds = map.getBounds();
        const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
        const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
        const bbox3857 = `${sw.x},${sw.y},${ne.x},${ne.y}`;

        const params = new URLSearchParams({
            SERVICE: 'WMS',
            VERSION: '1.1.1',
            REQUEST: 'GetMap',
            LAYERS: layerName,
            STYLES: '',
            FORMAT: 'image/png',
            TRANSPARENT: 'true',
            SRS: 'EPSG:3857',
            BBOX: bbox3857,
            WIDTH: String(size.x),
            HEIGHT: String(size.y),
            BUFFER: '128',
            _lid: layerId,
            _ts: String(timestamp),
        });

        setOverlay({
            url: `${config.qgisServer.wmsUrl}&${params.toString()}`,
            bounds: [
                [bounds.getSouth(), bounds.getWest()],
                [bounds.getNorth(), bounds.getEast()],
            ],
        });
    }, [map, layerName, layerId, timestamp]);

    useEffect(() => {
        updateOverlay();
        map.on('moveend', updateOverlay);
        map.on('zoomend', updateOverlay);
        map.on('resize', updateOverlay);
        return () => {
            map.off('moveend', updateOverlay);
            map.off('zoomend', updateOverlay);
            map.off('resize', updateOverlay);
        };
    }, [map, updateOverlay]);

    if (!overlay) return null;

    return (
        <ImageOverlay
            key={`${layerId}-viewport-${timestamp}`}
            url={overlay.url}
            bounds={overlay.bounds}
            opacity={opacity}
            zIndex={zIndex}
        />
    );
};

/**
 * Capa vectorial: WMSTileLayer (visual desde QGIS Server) + GeoJSON invisible (interactividad).
 *
 * Cambios vs. GeoServer:
 * - url → config.qgisServer.wmsUrl  (ya incluye ?MAP=...)
 * - layers → solo el nombre de la capa, sin workspace
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
    const layerMapRef = useRef<Map<string | number, L.Path>>(new Map());
    const prevSelRef  = useRef<string | number | null>(null);

    const hasPoints = useMemo(() => {
        if (!data?.features) return false;
        return data.features.some((f: GeoJSON.Feature) => {
            const t = f.geometry?.type ?? '';
            return t === 'Point' || t === 'MultiPoint';
        });
    }, [data]);

    useEffect(() => {
        layerMapRef.current.clear();
        prevSelRef.current = null;
    }, [timestamp]);

    useEffect(() => {
        const map = layerMapRef.current;
        if (prevSelRef.current !== null) {
            const prev = map.get(prevSelRef.current);
            if (prev) applyStyle(prev, false, opacity);
        }
        if (selectedFeatureId !== null) {
            const curr = map.get(selectedFeatureId);
            if (curr) applyStyle(curr, true, opacity);
        }
        prevSelRef.current = selectedFeatureId;
    }, [selectedFeatureId, opacity]);

    const wrappedOnEachFeature = useMemo(() =>
        (feature: any, layer: L.Layer) => {
            const fid = feature?.id ?? feature?.properties?.id;
            if (fid !== undefined && layer instanceof L.Path) {
                layerMapRef.current.set(fid, layer);
            }
            onEachFeature(feature, layer);
        },
    [onEachFeature]);

    const hitStyle: L.StyleFunction = (feature) => {
        const t      = feature?.geometry?.type ?? '';
        const isPoly = t === 'Polygon' || t === 'MultiPolygon';
        return {
            fillColor:   '#000',
            fillOpacity: isPoly ? 0.001 : 0,
            color:       '#000',
            weight:      isPoly ? 1 : 4,
            opacity:     0.001,
        };
    };

    const pointToLayer = useMemo(() =>
        hasPoints
            ? (_f: GeoJSON.Feature, latlng: L.LatLng) =>
                L.circleMarker(latlng, {
                    radius: 14, fillColor: '#000', fillOpacity: 0.001,
                    color: '#000', weight: 0.001, opacity: 0.001,
                })
            : undefined,
    [hasPoints]);

    if (!visible) return null;

    return (
        <>
            {/* Visual — puntos en imagen única (evita recorte por bordes de tile), resto en tiles */}
            {hasPoints ? (
                <ViewportWmsOverlay
                    layerId={id}
                    layerName={wmsLayer}
                    opacity={opacity}
                    zIndex={zIndex}
                    timestamp={timestamp}
                />
            ) : (
                <WMSTileLayer
                    key={`${id}-wms`}
                    url={config.qgisServer.wmsUrl}   // URL con ?MAP=vectorProject
                    layers={wmsLayer}                 // nombre exacto de la capa QGIS (sin workspace)
                    format="image/png"
                    transparent={true}
                    opacity={opacity}
                    zIndex={zIndex}
                    params={{ _ts: timestamp, TILED: true, BUFFER: 128 } as any}
                />
            )}

            {/* Hit-layer GeoJSON invisible para interactividad */}
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
(prev, next) =>
    prev.visible           === next.visible           &&
    prev.timestamp         === next.timestamp         &&
    prev.onEachFeature     === next.onEachFeature     &&
    prev.opacity           === next.opacity           &&
    prev.wmsLayer          === next.wmsLayer          &&
    prev.selectedFeatureId === next.selectedFeatureId
);

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
