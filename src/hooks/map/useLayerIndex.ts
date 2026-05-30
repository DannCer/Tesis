/**
 * @fileoverview useLayerIndex — índices O(1) de capas y grupos para el mapa.
 *
 * Extraído de MapView.tsx. Construye y mantiene actualizados dos Maps en Refs:
 * - `layerIndexRef`  — layerId → LayerConfig  (búsqueda rápida de configuración)
 * - `grupoIndexRef`  — nombre  → GrupoResponse (búsqueda rápida de URL de proyecto)
 *
 * Almacenar los índices en Refs (no en state) evita re-renders cada vez que
 * availableLayers o grupos cambian — los consumidores solo leen de la ref
 * sin suscribirse a actualizaciones de React.
 *
 * También expone `availableLayers` (contextLayers + projectLayers aplanados)
 * y `combinedLayersByGroup` (layersByGroup + proyecto seleccionado).
 *
 * @module hooks/map/useLayerIndex
 */

import { useMemo, useRef, useEffect } from 'react';
import type { LayerConfig } from '@config/layers';
import type { GrupoResponse } from '@types/api';

interface UseLayerIndexParams {
    contextLayers:       LayerConfig[];
    projectLayers:       LayerConfig[] | undefined;
    grupos:              GrupoResponse[];
    layersByGroup:       Record<string, LayerConfig[]>;
    selectedProjectName: string | null | undefined;
}

export interface UseLayerIndexReturn {
    availableLayers:      LayerConfig[];
    combinedLayersByGroup:Record<string, LayerConfig[]>;
    layerIndexRef:        React.MutableRefObject<Map<string, LayerConfig>>;
    grupoIndexRef:        React.MutableRefObject<Map<string, { nombre: string; url_proyecto?: string | null }>>;
}

export function useLayerIndex({
    contextLayers,
    projectLayers,
    grupos,
    layersByGroup,
    selectedProjectName,
}: UseLayerIndexParams): UseLayerIndexReturn {

    // Lista plana de capas disponibles (contexto + proyecto seleccionado)
    const availableLayers = useMemo((): LayerConfig[] => {
        const projectFlat = projectLayers ?? [];
        return [...contextLayers, ...projectFlat];
    }, [contextLayers, projectLayers]);

    // Índices en Refs — no causan re-renders al actualizarse
    const layerIndexRef = useRef<Map<string, LayerConfig>>(new Map());
    const grupoIndexRef = useRef<Map<string, { nombre: string; url_proyecto?: string | null }>>(new Map());

    useEffect(() => {
        const layerIdx = new Map<string, LayerConfig>();
        availableLayers.forEach(l => layerIdx.set(l.id, l));
        layerIndexRef.current = layerIdx;

        const grupoIdx = new Map<string, { nombre: string; url_proyecto?: string | null }>();
        (grupos ?? []).forEach(g => grupoIdx.set(g.nombre, g));
        grupoIndexRef.current = grupoIdx;
    }, [availableLayers, grupos]);

    // Capas agrupadas combinadas: API + proyecto seleccionado
    const combinedLayersByGroup = useMemo(() => {
        const combined = { ...layersByGroup };
        if (projectLayers && projectLayers.length > 0 && selectedProjectName) {
            combined[selectedProjectName] = projectLayers;
        }
        return combined;
    }, [layersByGroup, projectLayers, selectedProjectName]);

    return {
        availableLayers,
        combinedLayersByGroup,
        layerIndexRef,
        grupoIndexRef,
    };
}
