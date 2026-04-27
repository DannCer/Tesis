import { useState, useCallback, useRef } from 'react';
import { dynamicRasterService } from '@services/geoserver';
import type { PixelInfo } from '@services/geoserver/dynamicRasterService';
import { logger } from '@config/env';
import L from 'leaflet';
import type { LayerConfig } from '@config/layers';
import type { EnrichedPixelInfo, MapPixelData } from '@types/map';

export type { EnrichedPixelInfo, MapPixelData };

export const useRasterLayers = (availableLayers: LayerConfig[] = []) => {
    const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>({});
    const [opacityLayers, setOpacityLayers] = useState<Record<string, number>>({});
    const [pixelInfo, setPixelInfo] = useState<MapPixelData | null>(null);
    const [loading, setLoading] = useState(false);
    const pixelQueryControllerRef = useRef<AbortController | null>(null);
    const pixelQuerySeqRef = useRef(0);

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
        const querySeq = ++pixelQuerySeqRef.current;
        if (pixelQueryControllerRef.current) {
            pixelQueryControllerRef.current.abort();
        }
        const controller = new AbortController();
        pixelQueryControllerRef.current = controller;

        try {
            const activeSeries = availableLayers.filter(l =>
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
                groupName: serie.group, // Incluir el grupo para determinar el proyecto correcto
                params: {
                    ...baseParams,
                    time: serie.timeValue,
                    signal: controller.signal,
                }
            }));

            const results = await dynamicRasterService.getMultiplePixelValues(queries);
            if (querySeq !== pixelQuerySeqRef.current) return;

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
            if (error?.name === 'AbortError') return;
            if (querySeq !== pixelQuerySeqRef.current) return;
            logger.error('Error consultando píxel:', error);
            setPixelInfo({ 
                coordinates: [event.latlng.lat, event.latlng.lng], 
                layers: [], 
                error: error.message, 
                timestamp: Date.now() 
            });
        } finally {
            if (querySeq === pixelQuerySeqRef.current) {
                setLoading(false);
            }
        }
    }, [activeLayers, availableLayers]);

    const clearPixelInfo = useCallback(() => {
        if (pixelQueryControllerRef.current) {
            pixelQueryControllerRef.current.abort();
            pixelQueryControllerRef.current = null;
        }
        setPixelInfo(null);
    }, []);

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
