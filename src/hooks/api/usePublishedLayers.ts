/**
 * @fileoverview Re-exporta los datos de capas desde LayersContext.
 * Este hook existía como copia independiente que hacía su propio fetch;
 * ahora es un wrapper delgado que reutiliza el contexto ya cargado.
 * @module hooks/usePublishedLayers
 */

import { useLayersContext } from '@contexts/LayersContext';

/**
 * Hook para gestionar capas publicadas desde la API.
 * Consume LayersContext en lugar de hacer un fetch propio.
 */
export const usePublishedLayers = () => {
    const { vectorLayers, rasterLayers, grupos, loading, error, refresh } = useLayersContext();
    return { vectorLayers, rasterLayers, grupos, loading, error, refresh };
};

/**
 * Hook simplificado que combina todas las capas.
 */
export const useAllPublishedLayers = () => {
    const { vectorLayers, rasterLayers, loading, error, refresh } = useLayersContext();
    return {
        allLayers: [...vectorLayers, ...rasterLayers],
        vectorLayers,
        rasterLayers,
        loading,
        error,
        refresh,
    };
};
