import React, { useState } from 'react';
import type L from 'leaflet';
import { MapContext } from './MapContext';

export const MapProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [map, setMap] = useState<L.Map | null>(null);
    return (
        <MapContext.Provider value={{ map, setMap }}>
            {children}
        </MapContext.Provider>
    );
};
