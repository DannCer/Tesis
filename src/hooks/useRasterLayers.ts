import { useState, useCallback } from 'react';
import { rasterService, PixelInfo } from '../services/rasterService';
import { logger } from '../config/env';
import L from 'leaflet';
import { AVAILABLE_LAYERS } from '../config/layers';

export interface EnrichedPixelInfo extends PixelInfo {
    serieId: string;
    serieName: string;
    year: number;
}

export interface MapPixelData {
    coordinates: [number, number];
    layers: EnrichedPixelInfo[];
    timestamp: number;
    error?: string;
}

export const useRasterLayers = () => {
    const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({});
    const [opacityLayers, setOpacityLayers] = useState<Record<string, number>>({});
    const [pixelInfo, setPixelInfo] = useState<MapPixelData | null>(null);
    const [loading, setLoading] = useState(false);

    const toggleRasterLayer = useCallback((layerName: string, isActive: boolean) => {
        setActiveLayers(prev => ({ ...prev, [layerName]: isActive }));
        if (isActive && opacityLayers[layerName] === undefined) {
            setOpacityLayers(prev => ({ ...prev, [layerName]: 0.8 }));
        }
    }, [opacityLayers]);

    const setRasterLayerOpacity = useCallback((layerName: string, opacity: number) => {
        setOpacityLayers(prev => ({ ...prev, [layerName]: opacity }));
    }, []);

    const queryPixelValue = useCallback(async (event: L.LeafletMouseEvent, map: L.Map) => {
        try {
            const activeSeries = AVAILABLE_LAYERS.filter(l => 
                l.type === 'raster' && activeLayers[l.id]
            );

            if (activeSeries.length === 0) return;

            setLoading(true);
            setPixelInfo(null);

            const size = map.getSize();
            const bounds = map.getBounds();
            const sw = L.CRS.EPSG3857.project(bounds.getSouthWest());
            const ne = L.CRS.EPSG3857.project(bounds.getNorthEast());
            const bbox3857 = [sw.x, sw.y, ne.x, ne.y];
            const point = map.latLngToContainerPoint(event.latlng);

            const baseParams = {
                bbox: bbox3857,
                width: size.x,
                height: size.y,
                clickPoint: [point.x, point.y] as [number, number],
                srs: 'EPSG:3857'
            };

            const queries = activeSeries.map(serie => ({
                layerName: serie.wmsLayer || 'usv_mosaico',
                params: {
                    ...baseParams,
                    time: serie.timeValue
                }
            }));

            const results = await rasterService.getMultiplePixelValues(queries);

            const enrichedResults: EnrichedPixelInfo[] = results.map((result, index) => {
                const serie = activeSeries[index];
                return {
                    ...result,
                    serieId: serie.id,
                    serieName: serie.name,
                    year: serie.year || 0
                };
            });

            setPixelInfo({
                coordinates: [event.latlng.lat, event.latlng.lng],
                layers: enrichedResults,
                timestamp: Date.now()
            });

        } catch (error: any) {
            logger.error('Error consultando píxel:', error);
            setPixelInfo({ 
                coordinates: [event.latlng.lat, event.latlng.lng], 
                layers: [], 
                error: error.message, 
                timestamp: Date.now() 
            });
        } finally {
            setLoading(false);
        }
    }, [activeLayers]);

    const clearPixelInfo = useCallback(() => setPixelInfo(null), []);

    return {
        activeLayers,
        opacityLayers,
        pixelInfo,
        loading,
        toggleRasterLayer,
        setRasterLayerOpacity,
        queryPixelValue,
        clearPixelInfo
    };
};
