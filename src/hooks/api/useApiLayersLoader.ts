import { useEffect, useState } from 'react';
import { apiService } from '@services/api';
import { LayerConfig, updateAvailableLayers } from '@config/layers';
import { logger } from '@config/env';

export const useApiLayersLoader = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [layersByGroup, setLayersByGroup] = useState<Record<string, LayerConfig[]>>({});

    useEffect(() => {
        const loadLayers = async () => {
            try {
                const capas = await apiService.getCapas();
                
                const converted: LayerConfig[] = capas.map((item, idx) => ({
                    id: `api_layer_${item.id}`,
                    name: item.name,
                    description: item.description || '',
                    type: item.type === 'raster' ? 'raster' : 'vector',
                    group: item.group,
                    wfsName: item.wfsName,
                    wmsLayer: item.wmsLayer,
                    showLegend: true,
                }));

                updateAvailableLayers(converted);

                const grouped = converted.reduce((acc, layer) => {
                    if (!acc[layer.group]) acc[layer.group] = [];
                    acc[layer.group].push(layer);
                    return acc;
                }, {} as Record<string, LayerConfig[]>);

                setLayersByGroup(grouped);
                setLoading(false);
                logger.log('Capas cargadas desde API:', converted.length);
            } catch (err: any) {
                logger.error('Error cargando capas:', err);
                setError(err.message || 'Error desconocido');
                setLoading(false);
            }
        };

        loadLayers();
    }, []);

    return { loading, error, layersByGroup };
};
