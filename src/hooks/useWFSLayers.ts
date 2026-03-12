/**
 * @fileoverview Hook personalizado para manejar capas WFS
 * @module hooks/useWFSLayers
 */

import { useState, useCallback, useMemo } from 'react';
import { wfsService, WFSOptions } from '../services/wfsService';
import { logger } from '../config/env';
import { ErrorType, createError } from '../types';

export interface LayerData {
    data: any;
    visible: boolean;
    timestamp: number;
    opacity: number;
    error?: string;
}

/**
 * Estado completo de una capa WFS
 */
export interface WFSLayerState {
    data: any | null;
    visible: boolean;
    timestamp: number;
    opacity: number;
    loading: boolean;
    error: string | null;
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
     * Carga una capa desde WFS con manejo mejorado de errores
     *
     * @param layerName - Nombre de la capa
     * @param options - Opciones para WFS
     * @returns Promesa que resuelve cuando la capa está cargada
     */
    const loadLayer = useCallback(async (layerName: string, options: WFSOptions = {}): Promise<boolean> => {
        try {
            setLoading(prev => ({ ...prev, [layerName]: true }));
            setErrors(prev => ({ ...prev, [layerName]: null }));

            logger.debug('Cargando capa:', layerName);

            const data = await wfsService.getFeatures(layerName, options);

            // Validar que los datosreturned son válidos
            if (!data || !data.features) {
                throw new Error('Datos de capa inválidos o vacíos');
            }

            setLayers(prev => ({
                ...prev,
                [layerName]: {
                    data: data,
                    visible: true,
                    timestamp: Date.now(),
                    opacity: 0.8,
                    error: undefined
                }
            }));

            logger.debug(`Capa ${layerName} cargada:`, data.features.length, 'features');
            return true;

        } catch (error: any) {
            const errorMessage = error.message || 'Error desconocido al cargar la capa';
            logger.error(`Error cargando ${layerName}:`, error);
            setErrors(prev => ({ ...prev, [layerName]: errorMessage }));

            // Registrar error estructurado
            const appError = createError(
                ErrorType.SERVER,
                errorMessage,
                error instanceof Error ? error : undefined,
                layerName
            );
            logger.error('Error estructurado:', appError);

            return false;
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
    const reloadLayer = useCallback(async (layerName: string, options: WFSOptions = {}): Promise<boolean> => {
        return await loadLayer(layerName, options);
    }, [loadLayer]);

    /**
     * Obtiene el número total de features cargados
     */
    const getTotalFeatures = useCallback((): number => {
        return Object.values(layers).reduce((total, layer) => {
            return total + (layer?.data?.features?.length || 0);
        }, 0);
    }, [layers]);

    /**
     * Obtiene las capas que tienen errores
     */
    const getLayersWithErrors = useCallback((): string[] => {
        return Object.entries(errors)
            .filter(([_, error]) => error !== null)
            .map(([layerId]) => layerId);
    }, [errors]);

    /**
     * Verifica si hay alguna capa cargando
     */
    const isAnyLoading = useCallback((): boolean => {
        return Object.values(loading).some(isLoading => isLoading);
    }, [loading]);

    /**
     * Limpia todos los errores
     */
    const clearErrors = useCallback(() => {
        setErrors({});
    }, []);

    /**
     * Descarga todas las capas
     */
    const unloadAllLayers = useCallback(() => {
        setLayers({});
        setErrors({});
        setLoading({});
    }, []);

    return {
        layers,
        loading,
        errors,
        loadLayer,
        unloadLayer,
        toggleLayer,
        setLayerOpacity,
        reloadLayer,
        getTotalFeatures,
        getLayersWithErrors,
        isAnyLoading,
        clearErrors,
        unloadAllLayers
    };
};
