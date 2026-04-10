/**
 * @fileoverview Provider del contexto de capas.
 * Contiene toda la lógica de carga de capas desde la API.
 * Los componentes consumen este contexto vía useLayersContext().
 * @module contexts/LayersContext/LayersProvider
 */

import React, { useState, useEffect, useCallback } from 'react';
import { LayersContext } from './LayersContext';
import type { LayersContextValue } from './LayersContext';
import { apiService } from '@services/api';
import { logger } from '@config/env';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';
import type { GrupoResponse } from '@types/api';

interface LayersProviderProps {
    children: React.ReactNode;
}

export const LayersProvider: React.FC<LayersProviderProps> = ({ children }) => {
    const [vectorLayers, setVectorLayers] = useState<VectorLayerDef[]>([]);
    const [rasterLayers, setRasterLayers] = useState<RasterLayerDef[]>([]);
    const [grupos, setGrupos]             = useState<GrupoResponse[]>([]);
    const [loading, setLoading]           = useState(true);
    const [error, setError]               = useState<string | null>(null);

    const loadLayers = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const [capas, gruposData] = await Promise.all([
                apiService.getCapas(),
                apiService.getGrupos(),
            ]);

            logger.log('Capas cargadas desde API:', capas.length);
            logger.log('Grupos cargados desde API:', gruposData.length);

            const vectoriales: VectorLayerDef[] = [];
            const raster: RasterLayerDef[]       = [];

            capas.forEach(item => {
                if (item.type === 'vector') {
                    vectoriales.push({
                        id:          `layer_${item.id}`,
                        name:        item.name,
                        description: item.description ?? '',
                        group:       item.group,
                        type:        'vector',
                        wfsName:     item.wfsName,
                        wmsLayer:    item.wmsLayer,
                    });
                } else if (item.type === 'raster') {
                    raster.push({
                        id:          `layer_${item.id}`,
                        name:        item.name,
                        description: item.description ?? '',
                        group:       item.group,
                        type:        'raster',
                        wmsLayer:    item.wmsLayer,
                    });
                }
            });

            setVectorLayers(vectoriales);
            setRasterLayers(raster);
            setGrupos(gruposData);

        } catch (err: any) {
            logger.error('Error cargando capas desde API:', err);
            setError(err.message ?? 'Error al cargar las capas');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadLayers();
    }, [loadLayers]);

    const value: LayersContextValue = {
        vectorLayers,
        rasterLayers,
        grupos,
        loading,
        error,
        refresh: loadLayers,
    };

    return (
        <LayersContext.Provider value={value}>
            {children}
        </LayersContext.Provider>
    );
};
