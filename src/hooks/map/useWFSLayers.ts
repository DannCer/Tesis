/**
 * @fileoverview Hook optimizado para manejar capas WFS con paralelización
 * @module hooks/map/useWFSLayers
 */

import { useState, useCallback, useRef } from 'react';
import { wfsService, WFSOptions } from '@services/geoserver';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import { logger } from '@config/env';
import { ErrorType, createError } from '@types';

export interface LayerData {
    /** Colección de features GeoJSON devuelta por QGIS Server WFS. */
    data: GeoJSON.FeatureCollection;
    visible: boolean;
    timestamp: number;
    opacity: number;
    error?: string;
}


export const useWFSLayers = () => {
    const [layers, setLayers] = useState<Record<string, LayerData>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string | null>>({});

    const pendingRequestsRef = useRef<Map<string, AbortController>>(new Map());

    const loadLayerInternal = useCallback(async (
        layerName: string,
        groupName?: string,
        options: WFSOptions = {},
        storageKey?: string
    ): Promise<boolean> => {
        const key = storageKey ?? layerName;
        const controller = new AbortController();

        try {
            pendingRequestsRef.current.get(key)?.abort();
            pendingRequestsRef.current.set(key, controller);

            setLoading(prev => ({ ...prev, [key]: true }));
            setErrors(prev => ({ ...prev, [key]: null }));

            logger.debug('Cargando capa:', layerName, '→ clave:', key, '→ grupo:', groupName);

            const data = groupName
                ? await dynamicWfsService.getFeatures(layerName, groupName, options)
                : await wfsService.getFeatures(layerName, options);

            if (!data?.features) {
                throw new Error('Datos de capa inválidos o vacíos');
            }

            setLayers(prev => ({
                ...prev,
                [key]: {
                    data,
                    visible: true,
                    timestamp: Date.now(),
                    opacity: 0.8,
                },
            }));

            logger.debug(
                `Capa ${layerName} cargada (key: ${key}, grupo: ${groupName || 'default'}):`,
                data.features.length,
                'features'
            );
            return true;

        } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
                logger.debug(`Carga cancelada para ${layerName}`);
                return false;
            }

            const errorMessage = error instanceof Error ? error.message : 'Error desconocido al cargar la capa';
            logger.error(`Error cargando ${layerName}:`, error);
            setErrors(prev => ({ ...prev, [key]: errorMessage }));
            logger.error('Error estructurado:', createError(
                ErrorType.SERVER, errorMessage,
                error instanceof Error ? error : undefined,
                layerName
            ));
            return false;

        } finally {
            setLoading(prev => ({ ...prev, [key]: false }));
            pendingRequestsRef.current.delete(key);
        }
    }, []);

    const loadLayersParallel = useCallback(async (
        layerRequests: Array<{
            layerName: string;
            groupName?: string;
            options?: WFSOptions;
            storageKey?: string;
        }>
    ): Promise<boolean[]> => {
        const startTime = performance.now();
        logger.debug(`⏱️  Iniciando carga paralela de ${layerRequests.length} capas...`);

        const results = await Promise.all(
            layerRequests.map(req =>
                loadLayerInternal(
                    req.layerName,
                    req.groupName,
                    req.options,
                    req.storageKey
                )
            )
        );

        const duration = performance.now() - startTime;
        const successful = results.filter(r => r).length;

        logger.debug(
            `✅ Carga paralela completada: ${successful}/${layerRequests.length} exitosas en ${duration.toFixed(2)}ms`
        );

        return results;
    }, [loadLayerInternal]);

    const loadLayer = useCallback(async (
        layerName: string,
        groupName?: string,
        options: WFSOptions = {},
        storageKey?: string
    ): Promise<boolean> => {
        return loadLayerInternal(layerName, groupName, options, storageKey);
    }, [loadLayerInternal]);

    const unloadLayer = useCallback((layerName: string) => {
        pendingRequestsRef.current.get(layerName)?.abort();
        pendingRequestsRef.current.delete(layerName);

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

    const cancelAllPendingRequests = useCallback(() => {
        pendingRequestsRef.current.forEach(controller => controller.abort());
        pendingRequestsRef.current.clear();
        logger.debug('Todas las peticiones WFS canceladas');
    }, []);

    const getLoadingStats = useCallback(() => {
        const loadingCount = Object.values(loading).filter(Boolean).length;
        const errorCount = Object.values(errors).filter(e => e !== null).length;
        const successCount = Object.keys(layers).length;

        return { loadingCount, errorCount, successCount };
    }, [loading, errors, layers]);



    return {
        layers,
        loading,
        errors,
        loadLayer,
        loadLayersParallel,
        unloadLayer,
        toggleLayer,
        setLayerOpacity,
        cancelAllPendingRequests,
        getLoadingStats
    };
};