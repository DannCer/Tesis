import React from 'react';
import { WMSTileLayer, ZoomControl, ScaleControl } from 'react-leaflet';
import PropTypes from 'prop-types';
import BaseLayerControls from './BaseLayerControls';

/**
 * Contenido del mapa - capas base y controles
 */
const MapContent = ({ wmsLayers = [] }) => {
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

MapContent.propTypes = {
    wmsLayers: PropTypes.arrayOf(
        PropTypes.shape({
            name: PropTypes.string.isRequired,
            url: PropTypes.string.isRequired,
            layers: PropTypes.string.isRequired,
            format: PropTypes.string,
            transparent: PropTypes.bool,
            opacity: PropTypes.number,
            attribution: PropTypes.string,
        })
    ),
};

MapContent.displayName = 'MapContent';

export default MapContent;