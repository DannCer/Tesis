/**
 * @fileoverview Hook para manejar capas ráster con WMS
 * @module hooks/useRasterLayers
 */

import { useState, useCallback } from 'react';
import { rasterService } from '../services/rasterService';
import { logger } from '../config/env';

/**
 * Hook para gestionar capas ráster
 */
export const useRasterLayers = () => {
    const [activeLayers, setActiveLayers] = useState({});
    const [pixelInfo, setPixelInfo] = useState(null);
    const [loading, setLoading] = useState(false);

    /**
     * Activa o desactiva una capa ráster
     */
    const toggleRasterLayer = useCallback((layerName, isActive) => {
        setActiveLayers(prev => ({
            ...prev,
            [layerName]: isActive
        }));
    }, []);

    /**
     * Consulta el valor de un píxel en las capas activas
     * 
     * @param {Object} event - Evento de clic de Leaflet
     * @param {Object} map - Instancia del mapa de Leaflet
     */
    const queryPixelValue = useCallback(async (event, map) => {
        try {
            setLoading(true);
            setPixelInfo(null);

            // Obtener capas ráster activas
            const activeRasterLayers = Object.entries(activeLayers)
                .filter(([_, isActive]) => isActive)
                .map(([layerName]) => layerName);

            if (activeRasterLayers.length === 0) {
                logger.debug('No hay capas ráster activas');
                return;
            }

            // Obtener parámetros del mapa
            const bounds = map.getBounds();
            const size = map.getSize();
            const latlng = event.latlng;

            // Convertir coordenadas del clic a píxeles
            const point = map.latLngToContainerPoint(latlng);

            const params = {
                latlng: [latlng.lat, latlng.lng],
                bbox: [
                    bounds.getWest(),
                    bounds.getSouth(),
                    bounds.getEast(),
                    bounds.getNorth()
                ],
                width: size.x,
                height: size.y,
                clickPoint: [point.x, point.y],
                srs: 'EPSG:4326'
            };

            logger.debug('Consultando píxel:', params);

            // Consultar todas las capas activas
            const results = await rasterService.getMultiplePixelValues(
                activeRasterLayers,
                params
            );

            setPixelInfo({
                coordinates: [latlng.lat, latlng.lng],
                layers: results,
                timestamp: Date.now()
            });

            logger.debug('Resultados de píxel:', results);

        } catch (error) {
            logger.error('Error consultando píxel:', error);
            setPixelInfo({
                error: error.message,
                timestamp: Date.now()
            });
        } finally {
            setLoading(false);
        }
    }, [activeLayers]);

    /**
     * Limpia la información del píxel
     */
    const clearPixelInfo = useCallback(() => {
        setPixelInfo(null);
    }, []);

    return {
        activeLayers,
        pixelInfo,
        loading,
        toggleRasterLayer,
        queryPixelValue,
        clearPixelInfo
    };
};