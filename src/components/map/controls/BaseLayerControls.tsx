/**
 * @fileoverview Control de capas base del mapa (OSM, ESRI, Topo).
 *
 * Optimizaciones:
 *  - URLs y atribuciones importadas desde `constants.ts` (BASE_LAYER_URLS /
 *    BASE_LAYER_ATTRIBUTIONS) en lugar de hardcodeadas en JSX.
 *  - memo() — los TileLayers son estáticos y nunca deben re-renderizarse.
 *
 * @module components/map/controls/BaseLayerControls
 */

import { memo } from 'react';
import { LayersControl, TileLayer } from 'react-leaflet';
import { BASE_LAYER_URLS, BASE_LAYER_ATTRIBUTIONS, MAP_MAX_ZOOM } from '@config/constants';

const { BaseLayer } = LayersControl;

const BaseLayerControls = memo(() => (
    <LayersControl position="topright">

        <BaseLayer checked name="OpenStreetMap">
            <TileLayer
                attribution={BASE_LAYER_ATTRIBUTIONS.osm}
                url={BASE_LAYER_URLS.osm}
                maxZoom={MAP_MAX_ZOOM}
            />
        </BaseLayer>

        <BaseLayer name="ESRI Satélite">
            <TileLayer
                attribution={BASE_LAYER_ATTRIBUTIONS.esri}
                url={BASE_LAYER_URLS.esriSat}
                maxZoom={MAP_MAX_ZOOM}
            />
        </BaseLayer>

        <BaseLayer name="ESRI Calles">
            <TileLayer
                attribution={BASE_LAYER_ATTRIBUTIONS.esri}
                url={BASE_LAYER_URLS.esriStreet}
                maxZoom={MAP_MAX_ZOOM}
            />
        </BaseLayer>

        <BaseLayer name="Topográfico">
            <TileLayer
                attribution={BASE_LAYER_ATTRIBUTIONS.topo}
                url={BASE_LAYER_URLS.topo}
                maxZoom={17}  // OpenTopoMap limita a zoom 17
            />
        </BaseLayer>

    </LayersControl>
));

BaseLayerControls.displayName = 'BaseLayerControls';

export default BaseLayerControls;