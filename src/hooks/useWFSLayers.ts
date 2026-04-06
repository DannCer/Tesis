/**
 * @fileoverview Hook personalizado para manejar capas WFS
 * @module hooks/useWFSLayers
 */

import { useState, useCallback } from 'react';
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

export const useWFSLayers = () => {
    const [layers, setLayers] = useState<Record<string, LayerData>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string | null>>({});

    const loadLayer = useCallback(async (
        layerName: string,
        options: WFSOptions = {},
        customMapPath?: string // Parámetro para proyectos dinámicos
    ): Promise<boolean> => {
        // 1. Iniciar estados de carga ANTES de la petición
        setLoading(prev => ({ ...prev, [layerName]: true }));
        setErrors(prev => ({ ...prev, [layerName]: null }));

        try {
            logger.debug('Cargando capa:', layerName);

            // 2. Una sola llamada al servicio usando el customMapPath
            const data = await wfsService.getFeatures(layerName, options, customMapPath);

            if (!data?.features) {
                throw new Error('Datos de capa inválidos o vacíos');
            }

            setLayers(prev => ({
                ...prev,
                [layerName]: {
                    data,
                    visible: true,
                    timestamp: Date.now(),
                    opacity: 0.8,
                },
            }));

            logger.debug(`Capa ${layerName} cargada: ${data.features.length} features`);
            return true;

        } catch (error: any) {
            const errorMessage = error.message || 'Error desconocido al cargar la capa';
            logger.error(`Error cargando ${layerName}:`, error);
            
            setErrors(prev => ({ ...prev, [layerName]: errorMessage }));
            
            // Error estructurado para el sistema de monitoreo
            logger.error('Error estructurado:', createError(
                ErrorType.SERVER, 
                errorMessage,
                error instanceof Error ? error : undefined,
                layerName
            ));
            return false;
        } finally {
            // 3. Finalizar carga independientemente del resultado
            setLoading(prev => ({ ...prev, [layerName]: false }));
        }
    }, []);

    const unloadLayer = useCallback((layerName: string) => {
        setLayers(prev => { const s = { ...prev }; delete s[layerName]; return s; });
        setErrors(prev => { const s = { ...prev }; delete s[layerName]; return s; });
        setLoading(prev => { const s = { ...prev }; delete s[layerName]; return s; });
    }, []);

    const toggleLayer = useCallback((layerName: string) => {
        setLayers(prev => {
            if (!prev[layerName]) return prev;
            return { ...prev, [layerName]: { ...prev[layerName], visible: !prev[layerName].visible } };
        });
    }, []);

    const setLayerOpacity = useCallback((layerName: string, opacity: number) => {
        setLayers(prev => {
            if (!prev[layerName]) return prev;
            return { ...prev, [layerName]: { ...prev[layerName], opacity } };
        });
    }, []);

    return { layers, loading, errors, loadLayer, unloadLayer, toggleLayer, setLayerOpacity };
};
