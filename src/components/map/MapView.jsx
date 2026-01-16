import React, { useCallback, useState } from 'react';
import { MapContainer, GeoJSON, WMSTileLayer, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MapContent from './MapContent';
import LayerMenu from './LayerMenu';
import PixelInfoPanel from './PixelInfoPanel';
import { useWFSLayers } from '../../hooks/useWFSLayers';
import { useRasterLayers } from '../../hooks/useRasterLayers';
import { config } from '../../config/env';
import '../../styles/mapView.css';

/**
 * Estilos para capas vectoriales
 */
const LAYER_STYLES = {
    'vw_estados': {
        color: '#cd171e',
        weight: 3,
        fillColor: '#cd171e',
        fillOpacity: 0.1
    },
    'vw_municipios': {
        color: '#BC955B',
        weight: 2,
        fillColor: '#BC955B',
        fillOpacity: 0.15
    },
    'vw_localidades': {
        color: '#691B31',
        weight: 1,
        fillColor: '#691B31',
        fillOpacity: 0.2
    }
};

/**
 * Configuración de capas ráster
 */
const RASTER_LAYERS_CONFIG = [
    'usvserie1', 'usvserie2', 'usvserie3', 'usvserie4',
    'usvserie5', 'usvserie6', 'usvserie7'  // Cambia serieX por usvserieX
];

/**
 * Componente para manejar clics en el mapa
 */
const MapClickHandler = ({ onMapClick, activeRasterLayers }) => {
    useMapEvents({
        click: (e) => {
            if (activeRasterLayers.length > 0) {
                onMapClick(e);
            }
        }
    });
    return null;
};

/**
 * Componente principal del mapa
 */
const MapView = () => {
    const mapConfig = config.map;
    const [mapInstance, setMapInstance] = useState(null);

    // Hook para capas vectoriales (WFS)
    const {
        layers: vectorLayers,
        loading: vectorLoading,
        errors: vectorErrors,
        loadLayer,
        unloadLayer
    } = useWFSLayers();

    // Hook para capas ráster (WMS)
    const {
        activeLayers: activeRasterLayers,
        pixelInfo,
        loading: rasterLoading,
        toggleRasterLayer,
        queryPixelValue,
        clearPixelInfo
    } = useRasterLayers();

    /**
     * Maneja el toggle de capas desde el menú
     */
    const handleLayerToggle = useCallback(async (layerId, isActive, layerType) => {
        if (layerType === 'vector') {
            if (isActive) {
                await loadLayer(layerId, { maxFeatures: 5000 });
            } else {
                unloadLayer(layerId);
            }
        } else if (layerType === 'raster') {
            toggleRasterLayer(layerId, isActive);
        }
    }, [loadLayer, unloadLayer, toggleRasterLayer]);

    /**
     * Maneja clics en el mapa para consultar valores de ráster
     */
    const handleMapClick = useCallback((event) => {
        if (mapInstance && Object.values(activeRasterLayers).some(v => v)) {
            queryPixelValue(event, mapInstance);
        }
    }, [mapInstance, activeRasterLayers, queryPixelValue]);

    /**
     * Maneja el popup de cada feature vectorial
     */
    const onEachFeature = useCallback((layerId) => {
        return (feature, layer) => {
            if (feature.properties) {
                const props = feature.properties;
                let popupContent = '<div class="feature-popup">';

                if (layerId === 'vw_estados') {
                    popupContent += `<h4>${props.Estado || props.estado || 'Estado'}</h4>`;
                    if (props['Clave del estado']) {
                        popupContent += `<p><strong>Clave:</strong> ${props['Clave del estado']}</p>`;
                    }
                    if (props.id) {
                        popupContent += `<p><strong>ID:</strong> ${props.id}</p>`;
                    }
                } else if (layerId === 'vw_municipios') {
                    popupContent += `<h4>${props.Municipio || props.municipio || props.NOM_MUN || 'Municipio'}</h4>`;
                    if (props.Estado || props.estado || props.NOM_ENT) {
                        popupContent += `<p><strong>Estado:</strong> ${props.Estado || props.estado || props.NOM_ENT}</p>`;
                    }
                } else if (layerId === 'vw_localidades') {
                    popupContent += `<h4>${props.Localidad || props.localidad || props.NOM_LOC || 'Localidad'}</h4>`;
                    if (props.Municipio || props.municipio || props.NOM_MUN) {
                        popupContent += `<p><strong>Municipio:</strong> ${props.Municipio || props.municipio || props.NOM_MUN}</p>`;
                    }
                }

                popupContent += '</div>';
                layer.bindPopup(popupContent);
            }

            layer.on('mouseover', () => {
                layer.setStyle({
                    weight: 5,
                    fillOpacity: 0.4
                });
            });

            layer.on('mouseout', () => {
                layer.setStyle(LAYER_STYLES[layerId]);
            });
        };
    }, []);

    // Combinar estados de capas para el menú
    const combinedLayers = {
        ...vectorLayers,
        ...Object.fromEntries(
            Object.entries(activeRasterLayers)
                .filter(([_, isActive]) => isActive)
                .map(([layerId]) => [layerId, { visible: true, type: 'raster' }])
        )
    };

    const combinedLoading = {
        ...vectorLoading,
        ...(rasterLoading ? { raster: true } : {})
    };

    // Obtener lista de capas ráster activas
    const activeRasterLayersList = Object.entries(activeRasterLayers)
        .filter(([_, isActive]) => isActive)
        .map(([layerId]) => layerId);

    return (
        <div className="map-view-container-full">
            {/* Menú lateral de capas */}
            <LayerMenu
                layers={combinedLayers}
                loading={combinedLoading}
                errors={vectorErrors}
                onLayerToggle={handleLayerToggle}
            />

            {/* Panel de información de píxeles */}
            <PixelInfoPanel
                pixelInfo={pixelInfo}
                loading={rasterLoading}
                onClose={clearPixelInfo}
            />

            {/* Contenedor del mapa */}
            <MapContainer
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                minZoom={mapConfig.minZoom}
                maxZoom={mapConfig.maxZoom}
                maxBounds={mapConfig.maxBounds}
                maxBoundsViscosity={mapConfig.maxBoundsViscosity}
                zoomControl={false}
                scrollWheelZoom={true}
                className="leaflet-map-full"
                preferCanvas={true}
                style={{ height: '100%', width: '100%' }}
                whenCreated={setMapInstance}
            >
                <MapContent wmsLayers={[]} />

                {/* Manejador de clics para capas ráster */}
                <MapClickHandler
                    onMapClick={handleMapClick}
                    activeRasterLayers={activeRasterLayersList}
                />

                {/* Capas ráster WMS */}
                {RASTER_LAYERS_CONFIG.map(layerId => {
                    if (!activeRasterLayers[layerId]) return null;

                    return (
                        // Configuración óptima
                        <WMSTileLayer
                            key={layerId}
                            url={config.geoserver.wmsUrl}
                            layers={`${config.geoserver.workspace}:${layerId}`}
                            format="image/png"
                            transparent={true}
                            opacity={0.55}
                            zIndex={500}
                            attribution={`${config.geoserver.workspace} - ${layerId}`}
                        />
                    );
                })}

                {/* Capas vectoriales WFS (GeoJSON) */}
                {Object.entries(vectorLayers).map(([layerId, layerData]) => {
                    if (!layerData.visible || !layerData.data) return null;

                    return (
                        <GeoJSON
                            key={`${layerId}-${layerData.timestamp}`}
                            data={layerData.data}
                            style={LAYER_STYLES[layerId]}
                            onEachFeature={onEachFeature(layerId)}
                        />
                    );
                })}
            </MapContainer>
        </div>
    );
};

export default MapView;