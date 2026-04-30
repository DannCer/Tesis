import React, { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { GeoJSON, ImageOverlay, WMSTileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import { config } from '@config/env';

// Lee --color-primary de variables.css en tiempo de ejecución
const COLOR_SELECTED: string =
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#cd171e';

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
    wmsBaseUrl?: string;
}

interface ViewportWmsOverlayProps {
    layerId: string;
    layerName: string;
    opacity: number;
    zIndex: number;
    timestamp: number;
    wmsBaseUrl?: string;
}

const ViewportWmsOverlay: React.FC<ViewportWmsOverlayProps> = ({
    layerId, layerName, opacity, zIndex, timestamp, wmsBaseUrl,
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
            SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap',
            LAYERS: layerName, STYLES: '', FORMAT: 'image/png',
            TRANSPARENT: 'true', SRS: 'EPSG:3857', BBOX: bbox3857,
            WIDTH: String(size.x), HEIGHT: String(size.y),
            BUFFER: '128', _lid: layerId, _ts: String(timestamp),
        });
        const baseUrl = wmsBaseUrl || config.qgisServer.wmsUrl;
        setOverlay({
            url: `${baseUrl}&${params.toString()}`,
            bounds: [[bounds.getSouth(), bounds.getWest()], [bounds.getNorth(), bounds.getEast()]],
        });
    }, [map, layerName, layerId, timestamp, wmsBaseUrl]);

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
 * Capa vectorial: WMSTileLayer visual + GeoJSON invisible (clicks) +
 * GeoJSON de resaltado rojo (--color-primary) al hacer click en un feature.
 */
const VectorLayer: React.FC<VectorLayerProps> = memo(({
    id, wmsLayer, data, visible, timestamp, opacity,
    selectedFeatureId, onEachFeature, zIndex = 400, wmsBaseUrl,
}) => {
    const hasPoints = useMemo(() => {
        if (!data?.features) return false;
        return data.features.some((f: GeoJSON.Feature) => {
            const t = f.geometry?.type ?? '';
            return t === 'Point' || t === 'MultiPoint';
        });
    }, [data]);

    // Busca el feature clickeado comparando con String() para evitar mismatch number/string
    const selectedFeatureData = useMemo((): GeoJSON.FeatureCollection | null => {
        if (selectedFeatureId === null || !data?.features) return null;
        const feature = data.features.find((f: any) => {
            const fid = f.id ?? f.properties?.id;
            return fid !== undefined && String(fid) === String(selectedFeatureId);
        });
        if (!feature) return null;
        return { type: 'FeatureCollection', features: [feature] };
    }, [selectedFeatureId, data]);

    // Estilo de resaltado para polígonos y líneas
    const highlightStyle: L.StyleFunction = useCallback((feature) => {
        const t      = feature?.geometry?.type ?? '';
        const isPoly = t === 'Polygon' || t === 'MultiPolygon';
        return {
            color:       COLOR_SELECTED,
            weight:      3,
            opacity:     1,
            fillColor:   COLOR_SELECTED,
            fillOpacity: isPoly ? 0.25 : 0,
        };
    }, []);

    // pointToLayer de resaltado para puntos
    const highlightPointToLayer = useCallback(
        (_f: GeoJSON.Feature, latlng: L.LatLng) =>
            L.circleMarker(latlng, {
                radius: 18, color: COLOR_SELECTED, weight: 3,
                opacity: 1, fillColor: COLOR_SELECTED, fillOpacity: 0.3,
            }),
        []
    );

    // Hit-layer invisible — solo para capturar clicks
    const hitStyle: L.StyleFunction = (feature) => {
        const t      = feature?.geometry?.type ?? '';
        const isPoly = t === 'Polygon' || t === 'MultiPolygon';
        return {
            fillColor: '#000', fillOpacity: isPoly ? 0.001 : 0,
            color: '#000', weight: isPoly ? 1 : 4, opacity: 0.001,
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
            {/* Capa visual WMS */}
            {hasPoints ? (
                <ViewportWmsOverlay
                    layerId={id} layerName={wmsLayer} opacity={opacity}
                    zIndex={zIndex} timestamp={timestamp} wmsBaseUrl={wmsBaseUrl}
                />
            ) : (
                <WMSTileLayer
                    key={`${id}-wms`}
                    url={wmsBaseUrl || config.qgisServer.wmsUrl}
                    layers={wmsLayer}
                    format="image/png"
                    transparent={true}
                    opacity={opacity}
                    zIndex={zIndex}
                    params={{ _ts: timestamp, TILED: true, BUFFER: 128 } as any}
                />
            )}

            {/* Hit-layer GeoJSON invisible — solo captura clicks */}
            {data && (
                <GeoJSON
                    key={`${id}-hit-${timestamp}`}
                    data={data}
                    style={!hasPoints ? hitStyle : undefined}
                    pointToLayer={pointToLayer}
                    onEachFeature={onEachFeature}
                />
            )}

            {/* Resaltado visible en rojo (--color-primary) al seleccionar un feature */}
            {selectedFeatureData && (
                <GeoJSON
                    key={`${id}-highlight-${String(selectedFeatureId)}`}
                    data={selectedFeatureData}
                    style={!hasPoints ? highlightStyle : undefined}
                    pointToLayer={hasPoints ? highlightPointToLayer : undefined}
                    interactive={false}
                    zIndex={zIndex + 10}
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
    prev.selectedFeatureId === next.selectedFeatureId &&
    prev.wmsBaseUrl        === next.wmsBaseUrl
);

VectorLayer.displayName = 'VectorLayer';
export default VectorLayer;