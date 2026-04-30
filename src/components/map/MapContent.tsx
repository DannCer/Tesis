/**
 * @fileoverview Contenido base del mapa — capas de fondo y controles Leaflet.
 *
 * Optimizaciones:
 *  - Eliminada la interfaz `WMSLayerConfig` y el prop `wmsLayers` que nunca
 *    se usaron (tree-shaking manual). MapContent solo recibe lo que necesita.
 *  - memo() porque los controles de Leaflet no dependen de estado externo
 *    y nunca deben re-renderizarse cuando MapView actualiza su estado.
 *
 * @module components/map/MapContent
 */

import React, { memo } from 'react';
import { ZoomControl, ScaleControl } from 'react-leaflet';
import BaseLayerControls from '@components/map/controls/BaseLayerControls';

const MapContent: React.FC = () => (
    <>
        <ZoomControl
            position="topright"
            zoomInTitle="Acercar"
            zoomOutTitle="Alejar"
        />
        <ScaleControl
            maxWidth={150}
            position="bottomright"
            imperial={false}
        />
        <BaseLayerControls />
    </>
);

MapContent.displayName = 'MapContent';

export default memo(MapContent);