/**
 * @fileoverview Definición de los contextos de capas.
 *
 * Se divide en dos contextos para evitar re-renders globales:
 *
 * - LayersDataContext  — datos estables (capas, grupos, availableLayers)
 *   Solo cambia cuando la lista de capas cambia en la API.
 *   La mayoría de componentes solo necesitan este contexto.
 *
 * - LayersMetaContext  — estado de operación (loading, error, refresh)
 *   Cambia con cada petición HTTP. Solo LayerMenu y useApiLayersLoader
 *   necesitan suscribirse a él.
 *
 * useLayersContext() sigue exponiendo el valor combinado para
 * compatibilidad con todos los consumidores existentes.
 *
 * @module contexts/LayersContext/LayersContext
 */

import { createContext } from 'react';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';
import type { GrupoResponse } from '@types/api';
import type { LayerConfig } from '@config/layers';

// ─── Datos estables ───────────────────────────────────────────────────────────

export interface LayersDataContextValue {
    /** Capas vectoriales disponibles desde la API */
    vectorLayers: VectorLayerDef[];
    /** Capas ráster disponibles desde la API */
    rasterLayers: RasterLayerDef[];
    /** Grupos (proyectos QGIS) disponibles */
    grupos: GrupoResponse[];
    /**
     * Lista plana de todas las capas en formato LayerConfig.
     * Sustituye al antiguo AVAILABLE_LAYERS global mutable.
     */
    availableLayers: LayerConfig[];
}

// ─── Estado de operación ──────────────────────────────────────────────────────

export interface LayersMetaContextValue {
    /** true mientras se están cargando capas desde la API */
    loading: boolean;
    /** Mensaje de error, si la última carga falló */
    error: string | null;
    /** Recarga las capas desde la API */
    refresh: () => Promise<void>;
}

// ─── Valor combinado (retro-compatibilidad) ───────────────────────────────────

export type LayersContextValue = LayersDataContextValue & LayersMetaContextValue;

// ─── Objetos de contexto ──────────────────────────────────────────────────────

export const LayersDataContext = createContext<LayersDataContextValue | undefined>(undefined);
export const LayersMetaContext = createContext<LayersMetaContextValue | undefined>(undefined);

/** @deprecated Usar useLayersData() o useLayersMeta() según lo que se necesite. */
export const LayersContext = createContext<LayersContextValue | undefined>(undefined);
