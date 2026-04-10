/**
 * @fileoverview Contexto para la instancia del mapa Leaflet.
 * Permite que componentes fuera del árbol de react-leaflet accedan al mapa.
 * @module contexts/MapContext/MapContext
 */

import { createContext } from 'react';
import type L from 'leaflet';

export interface MapContextValue {
    /** Instancia del mapa Leaflet, null hasta que el mapa se monta */
    map: L.Map | null;
    /** Registra la instancia del mapa (llamado desde MapContent) */
    setMap: (map: L.Map | null) => void;
}

export const MapContext = createContext<MapContextValue | undefined>(undefined);
