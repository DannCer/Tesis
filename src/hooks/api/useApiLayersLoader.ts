/**
 * @fileoverview Convierte las capas del LayersContext al formato LayerConfig
 * agrupado por grupo. Ya NO hace fetch propio — reutiliza los datos que
 * LayersProvider ya obtuvo, eliminando la petición duplicada a la API.
 * @module hooks/api/useApiLayersLoader
 */

import { useMemo } from 'react';
import { useLayersContext } from '@contexts/LayersContext';
import { LayerConfig } from '@config/layers';

export const useApiLayersLoader = () => {
    const { vectorLayers, rasterLayers, loading, error } = useLayersContext();

    const layersByGroup = useMemo(() => {
        const allLayers: LayerConfig[] = [
            ...vectorLayers.map((l): LayerConfig => ({
                id:          l.id,
                name:        l.name,
                description: l.description,
                type:        'vector',
                group:       l.group,
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
                wmsLayer:    l.wmsLayer,
                year:        l.year,
                timeValue:   l.timeValue,
                showLegend:  true,
            })),
        ];

        return allLayers.reduce((acc, layer) => {
            if (!acc[layer.group]) acc[layer.group] = [];
            acc[layer.group].push(layer);
            return acc;
        }, {} as Record<string, LayerConfig[]>);
    }, [vectorLayers, rasterLayers]);

    return { loading, error, layersByGroup };
};
