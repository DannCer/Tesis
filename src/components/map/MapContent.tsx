import React from 'react';
import { ZoomControl, ScaleControl } from 'react-leaflet';
import BaseLayerControls from './BaseLayerControls';

export interface WMSLayerConfig {
    name: string;
    url: string;
    layers: string;
    format?: string;
    transparent?: boolean;
    opacity?: number;
    attribution?: string;
}

interface MapContentProps {
    wmsLayers?: WMSLayerConfig[];
}

/**
 * Contenido del mapa - capas base y controles
 */
const MapContent: React.FC<MapContentProps> = () => {
    return (
        <>
            {/* Control de zoom con posición personalizada */}
            <ZoomControl
                position="topright"
                zoomInTitle="Acercar"
                zoomOutTitle="Alejar"
            />

            {/* Escala gráfica en el mapa */}
            <ScaleControl
                maxWidth={150}
                position="bottomright"
                imperial={false}
            />

            {/* Controles para cambiar capas base (OpenStreetMap, ESRI, etc.) */}
            <BaseLayerControls />
        </>
    );
};

MapContent.displayName = 'MapContent';

export default MapContent;
