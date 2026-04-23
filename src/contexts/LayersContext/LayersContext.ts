/**
 * @fileoverview Definición del contexto de capas.
 * Solo contiene createContext y el tipo del valor — sin lógica de estado.
 * @module contexts/LayersContext/LayersContext
 */

import { createContext } from 'react';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';
import type { GrupoResponse } from '@types/api';
import type { LayerConfig } from '@config/layers';

export interface LayersContextValue {
    /** Capas vectoriales disponibles desde la API */
    vectorLayers: VectorLayerDef[];
    /** Capas ráster disponibles desde la API */
    rasterLayers: RasterLayerDef[];
    /** Grupos (proyectos QGIS) disponibles */
    grupos: GrupoResponse[];
    /**
     * Lista plana de todas las capas en formato LayerConfig.
     * Sustituye al antiguo AVAILABLE_LAYERS global mutable.
     * Los componentes que la lean se re-renderizan automáticamente
     * cuando cambian las capas, a diferencia del let global.
     */
    availableLayers: LayerConfig[];
    /** Estado de carga inicial */
    loading: boolean;
    /** Error de carga, si existe */
    error: string | null;
    /** Recarga las capas desde la API */
    refresh: () => Promise<void>;
}

export const LayersContext = createContext<LayersContextValue | undefined>(undefined);
