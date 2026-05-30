/**
 * @fileoverview Provider del contexto de capas.
 *
 * Provee dos contextos separados para minimizar re-renders:
 * - LayersDataContext  — solo cambia cuando cambia la lista de capas
 * - LayersMetaContext  — cambia con cada petición HTTP (loading/error)
 *
 * Los consumidores que solo leen capas (AnalysisTool, Legend, PrintDesigner)
 * se suscriben a LayersDataContext y NO se re-renderizan cuando loading cambia.
 *
 * @module contexts/LayersContext/LayersProvider
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { LayersDataContext, LayersMetaContext } from './LayersContext';
import type { LayersDataContextValue, LayersMetaContextValue } from './LayersContext';
import { apiService } from '@services/api';
import { logger } from '@config/env';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';
import type { GrupoResponse } from '@types/api';
import type { LayerConfig } from '@config/layers';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import { dynamicRasterService } from '@services/geoserver/dynamicRasterService';

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
                const id = `layer_${item.id}`;
                if (item.type === 'vector') {
                    vectoriales.push({
                        id,
                        name:        item.name,
                        description: item.description ?? '',
                        group:       item.group,
                        subgroup:    item.subgroup ?? undefined,
                        subgroup_id: item.subgroup_id ?? undefined,
                        type:        'vector',
                        wfsName:     item.wfsName,
                        wmsLayer:    item.wmsLayer,
                    });
                } else if (item.type === 'raster') {
                    raster.push({
                        id,
                        name:        item.name,
                        description: item.description ?? '',
                        group:       item.group,
                        subgroup:    item.subgroup ?? undefined,
                        subgroup_id: item.subgroup_id ?? undefined,
                        type:        'raster',
                        wmsLayer:    item.wmsLayer,
                    });
                }
            });

            setVectorLayers(vectoriales);
            setRasterLayers(raster);
            setGrupos(gruposData);

            dynamicWfsService.updateGroupProjectMapping(gruposData);
            dynamicRasterService.updateGroupProjectMapping(gruposData);

        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Error al cargar las capas';
            logger.error('Error cargando capas desde API:', err);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadLayers();
    }, [loadLayers]);

    /**
     * Lista plana de LayerConfig derivada de vectorLayers + rasterLayers.
     * Solo se recalcula cuando cambian las capas, no cuando cambia loading.
     */
    const availableLayers = useMemo((): LayerConfig[] => [
        ...vectorLayers.map((l): LayerConfig => ({
            id:          l.id,
            name:        l.name,
            description: l.description,
            type:        'vector',
            group:       l.group,
            subgroup:    l.subgroup,
            subgroup_id: l.subgroup_id,
            wfsName:     l.wfsName,
            wmsLayer:    l.wmsLayer,
            showLegend:  true,
        })),
        ...rasterLayers.map((l): LayerConfig => ({
            id:          l.id,
            name:        l.name,
            description: l.description,
            type:        'raster',
            group:       l.group,
            subgroup:    l.subgroup,
            subgroup_id: l.subgroup_id,
            wmsLayer:    l.wmsLayer,
            year:        l.year,
            timeValue:   l.timeValue,
            showLegend:  true,
        })),
    ], [vectorLayers, rasterLayers]);

    /**
     * Valor estable — solo cambia cuando la lista de capas cambia.
     * Los consumidores suscritos a este contexto NO se re-renderizan
     * cuando loading pasa de true → false.
     */
    const dataValue = useMemo((): LayersDataContextValue => ({
        vectorLayers,
        rasterLayers,
        grupos,
        availableLayers,
    }), [vectorLayers, rasterLayers, grupos, availableLayers]);

    /**
     * Valor de meta — cambia con cada petición HTTP.
     * Solo LayerMenu y useApiLayersLoader se suscriben a este contexto.
     */
    const metaValue = useMemo((): LayersMetaContextValue => ({
        loading,
        error,
        refresh: loadLayers,
    }), [loading, error, loadLayers]);

    return (
        <LayersDataContext.Provider value={dataValue}>
            <LayersMetaContext.Provider value={metaValue}>
                {children}
            </LayersMetaContext.Provider>
        </LayersDataContext.Provider>
    );
};