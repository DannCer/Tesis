import { useContext } from 'react';
import { MapContext } from './MapContext';
import type { MapContextValue } from './MapContext';

export const useMapContext = (): MapContextValue => {
    const ctx = useContext(MapContext);
    if (!ctx) throw new Error('useMapContext debe usarse dentro de <MapProvider>.');
    return ctx;
};
