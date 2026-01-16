/**
 * @fileoverview Hook personalizado para manejar capas WFS
 * @module hooks/useWFSLayers
 */

import { useState, useCallback } from 'react';
import { wfsService } from '../services/wfsService';
import { logger } from '../config/env';

/**
 * Hook para gestionar capas WFS
 * 
 * @returns {Object} Estado y funciones para manejar capas
 */
export const useWFSLayers = () => {
    const [layers, setLayers] = useState({});
    const [loading, setLoading] = useState({});
    const [errors, setErrors] = useState({});

    /**
     * Carga una capa desde WFS
     * 
     * @param {string} layerName - Nombre de la capa
     * @param {Object} options - Opciones para WFS
     */
    const loadLayer = useCallback(async (layerName, options = {}) => {
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
                    timestamp: Date.now()
                }
            }));

            logger.debug(`Capa ${layerName} cargada:`, data.features.length, 'features');

        } catch (error) {
            logger.error(`Error cargando ${layerName}:`, error);
            setErrors(prev => ({ ...prev, [layerName]: error.message }));
        } finally {
            setLoading(prev => ({ ...prev, [layerName]: false }));
        }
    }, []);

    /**
     * Descarga una capa (libera memoria)
     * 
     * @param {string} layerName - Nombre de la capa
     */
    const unloadLayer = useCallback((layerName) => {
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
     * @param {string} layerName - Nombre de la capa
     */
    const toggleLayer = useCallback((layerName) => {
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
     * Recarga una capa
     * 
     * @param {string} layerName - Nombre de la capa
     * @param {Object} options - Opciones para WFS
     */
    const reloadLayer = useCallback(async (layerName, options = {}) => {
        await loadLayer(layerName, options);
    }, [loadLayer]);

    return {
        layers,
        loading,
        errors,
        loadLayer,
        unloadLayer,
        toggleLayer,
        reloadLayer
    };
};