import React, { useCallback } from 'react';
import { MapContainer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import MapContent from './MapContent';
import LayerMenu from './LayerMenu';
import { useWFSLayers } from '../../hooks/useWFSLayers';
import { config } from '../../config/env';
import '../../styles/mapView.css';

/**
 * Estilos para cada capa
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
 * Componente principal del mapa
 */
const MapView = () => {
    const mapConfig = config.map;
    const { layers, loading, errors, loadLayer, unloadLayer } = useWFSLayers();

    /**
     * Maneja el toggle de capas desde el menú
     */
    const handleLayerToggle = useCallback(async (layerId, isActive) => {
        if (isActive) {
            // Cargar la capa
            await loadLayer(layerId, {
                maxFeatures: 5000
            });
        } else {
            // Descargar la capa
            unloadLayer(layerId);
        }
    }, [loadLayer, unloadLayer]);

    /**
     * Maneja el popup de cada feature
     */
    const onEachFeature = useCallback((layerId) => {
        return (feature, layer) => {
            if (feature.properties) {
                const props = feature.properties;
                let popupContent = '<div class="feature-popup">';
                
                // Agregar propiedades relevantes según la capa
                if (layerId === 'vw_estados') {
                    // Campos: fid, id, Clave del estado, Estado
                    popupContent += `<h4>${props.Estado }</h4>`;
                    if (props['Clave del estado']) {
                        popupContent += `<p><strong>Clave:</strong> ${props['Clave del estado']}</p>`;
                    }
                    if (props.id) {
                        popupContent += `<p><strong>ID:</strong> ${props.id}</p>`;
                    }
                } else if (layerId === 'vw_municipios') {
                    // Ajusta estos campos según tu tabla de municipios
                    popupContent += `<h4>${props.Municipio || props.municipio || props.NOM_MUN || props.NOMBRE || 'Municipio'}</h4>`;
                    if (props.Estado || props.estado || props.NOM_ENT) {
                        popupContent += `<p><strong>Estado:</strong> ${props.Estado || props.estado || props.NOM_ENT}</p>`;
                    }
                    if (props['Clave del municipio'] || props.clave_municipio || props.CVE_MUN) {
                        popupContent += `<p><strong>Clave:</strong> ${props['Clave del municipio'] || props.clave_municipio || props.CVE_MUN}</p>`;
                    }
                } else if (layerId === 'vw_localidades') {
                    // Ajusta estos campos según tu tabla de localidades
                    popupContent += `<h4>${props.Localidad || props.localidad || props.NOM_LOC || props.NOMBRE || 'Localidad'}</h4>`;
                    if (props.Municipio || props.municipio || props.NOM_MUN) {
                        popupContent += `<p><strong>Municipio:</strong> ${props.Municipio || props.municipio || props.NOM_MUN}</p>`;
                    }
                    if (props['Clave de localidad'] || props.clave_localidad || props.CVE_LOC) {
                        popupContent += `<p><strong>Clave:</strong> ${props['Clave de localidad'] || props.clave_localidad || props.CVE_LOC}</p>`;
                    }
                }
                
                popupContent += '</div>';
                layer.bindPopup(popupContent);
            }

            // Efecto hover
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

    return (
        <div className="map-view-container-full">
            {/* Menú lateral de capas */}
            <LayerMenu
                layers={layers}
                loading={loading}
                errors={errors}
                onLayerToggle={handleLayerToggle}
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
            >
                <MapContent wmsLayers={[]} />

                {/* Renderizar capas WFS activas */}
                {Object.entries(layers).map(([layerId, layerData]) => {
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