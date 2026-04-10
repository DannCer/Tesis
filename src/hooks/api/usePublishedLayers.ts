/**
 * @fileoverview Hook para cargar capas publicadas desde la API
 * @module hooks/usePublishedLayers
 */

import { useState, useEffect, useCallback } from 'react';
import { apiService, ItemResponse, GrupoResponse } from '@services/api';
import { logger } from '@config/env';
import { VectorLayerDef, RasterLayerDef } from '../config/layersConfig';

interface PublishedLayersData {
    vectorLayers: VectorLayerDef[];
    rasterLayers: RasterLayerDef[];
    grupos: GrupoResponse[];
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/**
 * Hook para gestionar capas publicadas desde la API
 */
export const usePublishedLayers = (): PublishedLayersData => {
    const [vectorLayers, setVectorLayers] = useState<VectorLayerDef[]>([]);
    const [rasterLayers, setRasterLayers] = useState<RasterLayerDef[]>([]);
    const [grupos, setGrupos] = useState<GrupoResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    /**
     * Cargar capas desde la API
     */
    const loadLayers = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            // Cargar capas y grupos en paralelo
            const [capas, gruposData] = await Promise.all([
                apiService.getCapas(),
                apiService.getGrupos(),
            ]);

            logger.log('Capas cargadas desde API:', capas.length);
            logger.log('Grupos cargados desde API:', gruposData.length);

            // Separar capas vectoriales y ráster
            const vectoriales: VectorLayerDef[] = [];
            const raster: RasterLayerDef[] = [];

            capas.forEach(item => {
                if (item.type === 'vector') {
                    vectoriales.push(apiService.convertItemToVectorLayer(item));
                } else if (item.type === 'raster') {
                    raster.push(apiService.convertItemToRasterLayer(item));
                }
            });

            setVectorLayers(vectoriales);
            setRasterLayers(raster);
            setGrupos(gruposData);

        } catch (err: any) {
            logger.error('Error cargando capas desde API:', err);
            setError(err.message || 'Error al cargar las capas');
        } finally {
            setLoading(false);
        }
    }, []);

    // Cargar al montar el componente
    useEffect(() => {
        loadLayers();
    }, [loadLayers]);

    return {
        vectorLayers,
        rasterLayers,
        grupos,
        loading,
        error,
        refresh: loadLayers,
    };
};

/**
 * Hook simplificado que combina todas las capas
 */
export const useAllPublishedLayers = () => {
    const { vectorLayers, rasterLayers, loading, error, refresh } = usePublishedLayers();

    return {
        allLayers: [...vectorLayers, ...rasterLayers],
        vectorLayers,
        rasterLayers,
        loading,
        error,
        refresh,
    };
};
