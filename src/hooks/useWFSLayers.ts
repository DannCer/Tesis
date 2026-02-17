/**
 * @fileoverview Hook personalizado para manejar capas WFS
 * @module hooks/useWFSLayers
 */

import { useState, useCallback } from 'react';
import { wfsService, WFSOptions } from '../services/wfsService';
import { logger } from '../config/env';

export interface LayerData {
    data: any;
    visible: boolean;
    timestamp: number;
    opacity: number;
}

/**
 * Hook para gestionar capas WFS
 * 
 * @returns Estado y funciones para manejar capas
 */
export const useWFSLayers = () => {
    const [layers, setLayers] = useState<Record<string, LayerData>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string | null>>({});

    /**
     * Carga una capa desde WFS
     * 
     * @param layerName - Nombre de la capa
     * @param options - Opciones para WFS
     */
    const loadLayer = useCallback(async (layerName: string, options: WFSOptions = {}) => {
        try {
            setLoading(prev => ({ ...prev, [layerName]: true }));
            setErrors(prev => ({ ...prev, [layerName]: null }));

            logger.debug('Cargando capa:', layerName);

            const data = await wfsService.getFeatures(layerName, options);

            setLayers(prev => ({
                ...prev,
                [layerName]: {
                    data: data,
                    visible: true,
                    timestamp: Date.now(),
                    opacity: 0.8
                }
            }));

            logger.debug(`Capa ${layerName} cargada:`, data.features.length, 'features');

        } catch (error: any) {
            logger.error(`Error cargando ${layerName}:`, error);
            setErrors(prev => ({ ...prev, [layerName]: error.message }));
        } finally {
            setLoading(prev => ({ ...prev, [layerName]: false }));
        }
    }, []);

    /**
     * Descarga una capa (libera memoria)
     * 
     * @param layerName - Nombre de la capa
     */
    const unloadLayer = useCallback((layerName: string) => {
        setLayers(prev => {
            const newLayers = { ...prev };
            delete newLayers[layerName];
            return newLayers;
        });
        setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors[layerName];
            return newErrors;
        });
        setLoading(prev => {
            const newLoading = { ...prev };
            delete newLoading[layerName];
            return newLoading;
        });
    }, []);

    /**
     * Alterna la visibilidad de una capa
     * 
     * @param layerName - Nombre de la capa
     */
    const toggleLayer = useCallback((layerName: string) => {
        setLayers(prev => {
            if (!prev[layerName]) return prev;
            
            return {
                ...prev,
                [layerName]: {
                    ...prev[layerName],
                    visible: !prev[layerName].visible
                }
            };
        });
    }, []);

    /**
     * Ajusta la opacidad de una capa
     * 
     * @param layerName - Nombre de la capa
     * @param opacity - Valor entre 0 y 1
     */
    const setLayerOpacity = useCallback((layerName: string, opacity: number) => {
        setLayers(prev => {
            if (!prev[layerName]) return prev;
            return {
                ...prev,
                [layerName]: {
                    ...prev[layerName],
                    opacity
                }
            };
        });
    }, []);

    /**
     * Recarga una capa
     * 
     * @param layerName - Nombre de la capa
     * @param options - Opciones para WFS
     */
    const reloadLayer = useCallback(async (layerName: string, options: WFSOptions = {}) => {
        await loadLayer(layerName, options);
    }, [loadLayer]);

    return {
        layers,
        loading,
        errors,
        loadLayer,
        unloadLayer,
        toggleLayer,
        setLayerOpacity,
        reloadLayer
    };
};
