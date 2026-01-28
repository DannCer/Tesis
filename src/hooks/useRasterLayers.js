/**
 * @fileoverview Hook para manejar capas ráster WMS con soporte para mosaicos TIME
 */

import { useState, useCallback } from 'react';
import { rasterService } from '../services/rasterService';
import { logger } from '../config/env';

/**
 * Mapeo de series activas a sus valores TIME
 * Usado para consultas GetFeatureInfo del mosaico
 */
const SERIES_TIME_MAP = {
    'usvserie1': '1985-01-01',
    'usvserie2': '1993-01-01',
    'serie3': '2002-01-01',
    'serie4': '2007-01-01',
    'serie5': '2011-01-01',
    'serie6': '2014-01-01',
    'serie7': '2018-01-01'
};

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
     * Ahora soporta mosaicos con parámetro TIME
     */
    const queryPixelValue = useCallback(async (event, map) => {
        try {
            setLoading(true);
            setPixelInfo(null);

            // Obtener series activas
            const activeSeriesIds = Object.entries(activeLayers)
                .filter(([_, isActive]) => isActive)
                .map(([serieId]) => serieId);

            if (activeSeriesIds.length === 0) {
                logger.warn('No hay capas ráster activas para consultar');
                return;
            }

            const bounds = map.getBounds();
            const size = map.getSize();
            const latlng = event.latlng;
            const point = map.latLngToContainerPoint(latlng);

            // Parámetros base para GetFeatureInfo
            const baseParams = {
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

            logger.debug('Consultando píxeles en:', {
                coordenadas: [latlng.lat, latlng.lng],
                seriesActivas: activeSeriesIds
            });

            // Crear queries para cada serie activa
            // Todas usan el mismo mosaico pero con diferentes TIME
            const queries = activeSeriesIds.map(serieId => ({
                layerName: 'usv_mosaico',  // Mismo mosaico para todas
                params: {
                    ...baseParams,
                    time: SERIES_TIME_MAP[serieId]  // TIME específico de cada serie
                }
            }));

            // Ejecutar consultas en paralelo
            const results = await rasterService.getMultiplePixelValues(queries);

            // Añadir información de la serie a cada resultado
            const enrichedResults = results.map((result, index) => ({
                ...result,
                serieId: activeSeriesIds[index],
                serieName: getSerieName(activeSeriesIds[index]),
                year: getSerieYear(activeSeriesIds[index])
            }));

            setPixelInfo({
                coordinates: [latlng.lat, latlng.lng],
                layers: enrichedResults,
                timestamp: Date.now()
            });

            logger.debug('Resultados de consulta:', enrichedResults);

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

/**
 * Helpers para obtener información de las series
 */
function getSerieName(serieId) {
    const names = {
        'usvserie1': 'Serie I',
        'usvserie2': 'Serie II',
        'serie3': 'Serie III',
        'serie4': 'Serie IV',
        'serie5': 'Serie V',
        'serie6': 'Serie VI',
        'serie7': 'Serie VII'
    };
    return names[serieId] || serieId;
}

function getSerieYear(serieId) {
    const years = {
        'usvserie1': 1985,
        'usvserie2': 1993,
        'serie3': 2002,
        'serie4': 2007,
        'serie5': 2011,
        'serie6': 2014,
        'serie7': 2018
    };
    return years[serieId] || '?';
}
