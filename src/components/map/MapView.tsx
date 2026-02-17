import React, { useCallback, useState, useMemo } from 'react';
import {
    MapContainer,
    WMSTileLayer,
    useMapEvents,
    CircleMarker
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import MapContent from './MapContent';
import LayerMenu from './LayerMenu';
import PixelInfoPanel from './PixelInfoPanel';
import Legend from './Legend';
import VectorLayer from './VectorLayer';
import { useWFSLayers } from '../../hooks/useWFSLayers';
import { useRasterLayers } from '../../hooks/useRasterLayers';
import { wfsService } from '../../services/wfsService';
import { rasterService } from '../../services/rasterService';
import { config } from '../../config/env';
import { AVAILABLE_LAYERS, getLayerConfig } from '../../config/layers';
import '../../styles/mapView.css';

/**
 * Filtramos las series ráster desde la configuración global
 */
const RASTER_SERIES = AVAILABLE_LAYERS.filter(l => l.type === 'raster');

interface MapClickHandlerProps {
    onMapClick: (e: L.LeafletMouseEvent, map: L.Map) => void;
}

/**
 * Manejador de clics en el mapa (fondo) para consultas Ráster
 */
const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onMapClick }) => {
    const map = useMapEvents({
        click: (e) => {
            onMapClick(e, map);
        }
    });
    return null;
};

const MapView: React.FC = () => {
    const mapConfig = config.map || {
        center: [19.4326, -99.1332],
        zoom: 10
    };
    
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    const [wmsError, setWmsError] = useState<string | null>(null);
    const [selectedFeature, setSelectedFeature] = useState<any>(null);

    // ===== VECTOR (WFS) =====
    const {
        layers: vectorLayers,
        loading: vectorLoading,
        errors: vectorErrors,
        loadLayer,
        toggleLayer,
        setLayerOpacity
    } = useWFSLayers();

    // ===== RÁSTER (WMS) =====
    const {
        activeLayers,
        opacityLayers,
        pixelInfo,
        loading: rasterLoading,
        toggleRasterLayer,
        setRasterLayerOpacity,
        queryPixelValue,
        clearPixelInfo
    } = useRasterLayers();

    // --- ZOOM A CAPA ---
    const zoomToLayer = useCallback(async (layerId: string, type: 'vector' | 'raster', data?: any) => {
        if (!mapInstance) return;

        const layerCfg = getLayerConfig(layerId);
        if (!layerCfg) return;

        if (type === 'vector') {
            // 1. Intentar obtener extensión dinámica desde GetCapabilities (WFS)
            const dynamicBounds = await wfsService.getLayerExtent(layerCfg.id.replace('vw_', ''));
            
            if (dynamicBounds) {
                mapInstance.fitBounds(dynamicBounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            } 
            // 2. Fallback a los datos ya cargados si existen
            else if (data) {
                try {
                    const geoJsonLayer = L.geoJSON(data);
                    const bounds = geoJsonLayer.getBounds();
                    if (bounds.isValid()) {
                        mapInstance.fitBounds(bounds, { padding: [20, 20] });
                    }
                } catch (err) {
                    console.error("Error al calcular bounds para zoom:", err);
                }
            }
            // 3. Fallback a configuración manual
            else if (layerCfg.bounds) {
                mapInstance.fitBounds(layerCfg.bounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            }
        } else if (type === 'raster') {
            // Intentar sacar extensión dinámica del servidor (WMS)
            const dynamicBounds = await rasterService.getLayerExtent(layerCfg.wmsLayer || 'usv_mosaico');
            
            if (dynamicBounds) {
                mapInstance.fitBounds(dynamicBounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            } else if (layerCfg.bounds) {
                // Fallback a configuración manual si falla GetCapabilities
                mapInstance.fitBounds(layerCfg.bounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            }
        }
    }, [mapInstance]);

    // --- MANEJADOR DE CLICS EN VECTORES ---
    const onEachVectorFeature = useCallback((feature: any, layer: L.Layer) => {
        layer.on({
            click: (e: L.LeafletMouseEvent) => {
                // 1. Detenemos la propagación
                L.DomEvent.stopPropagation(e);
                
                // 2. Marcar como seleccionado
                setSelectedFeature(feature.id || feature.properties.id || Math.random());
                
                // 3. Extraemos propiedades
                const props = feature.properties;
                const nombre = props.NOMBRE || props.NOM_MUN || props.NOM_ENT || props.NAME || 'Elemento sin nombre';
                
                // 4. Creamos contenido HTML
                const detalles = Object.entries(props)
                    .filter(([key]) => key !== 'bbox' && key !== 'geometry')
                    .map(([key, val]) => `<b>${key}:</b> ${val}`)
                    .join('<br/>');

                // 5. Mostramos Popup
                layer.bindPopup(`
                    <div style="font-family: Roboto, sans-serif; min-width: 200px;">
                        <h4 style="margin: 0 0 8px 0; color: #cd171e;">${nombre}</h4>
                        <div style="max-height: 200px; overflow-y: auto; font-size: 0.9rem;">
                            ${detalles}
                        </div>
                    </div>
                `).openPopup();
            },
            popupclose: () => {
                setSelectedFeature(null);
            }
        });
    }, []);

    // --- MANEJO DE CAPAS ---
    const handleLayerToggle = useCallback(async (layerId: string, isActive: boolean, layerType: 'vector' | 'raster') => {
        if (layerType === 'vector') {
            if (vectorLayers[layerId]) {
                toggleLayer(layerId);
                // Si la estamos activando y ya tiene datos, hacemos zoom
                if (isActive) {
                    zoomToLayer(layerId, 'vector', vectorLayers[layerId].data);
                }
            } else if (isActive) {
                // Cargar nueva capa
                await loadLayer(layerId);
                // El zoom se manejará en un useEffect separado cuando lleguen los datos
            }
        } else if (layerType === 'raster') {
            toggleRasterLayer(layerId, isActive);
            if (isActive) {
                zoomToLayer(layerId, 'raster');
            }
        }
    }, [vectorLayers, loadLayer, toggleLayer, toggleRasterLayer, zoomToLayer]);

    // Efecto para hacer zoom a capas vectoriales cuando se terminan de cargar por primera vez
    React.useEffect(() => {
        if (!mapInstance) return;
        
        const checkAndZoom = async () => {
            for (const [id, layer] of Object.entries(vectorLayers)) {
                const isRecent = (Date.now() - layer.timestamp) < 1000;
                if (layer.visible && layer.data && isRecent) {
                    await zoomToLayer(id, 'vector', layer.data);
                }
            }
        };
        
        checkAndZoom();
    }, [vectorLayers, mapInstance, zoomToLayer]);


    // --- MEMORIZACIÓN DE DATOS PARA COMPONENTES HIJOS ---
    const activeRasterLayersList = useMemo(() => 
        Object.entries(activeLayers)
            .filter(([_, v]) => v)
            .map(([k]) => k),
        [activeLayers]
    );

    const layerMenuData = useMemo(() => ({
        ...vectorLayers,
        ...Object.fromEntries(
            RASTER_SERIES.map(s => [
                s.id,
                { 
                    name: s.name,
                    visible: activeLayers[s.id], 
                    opacity: opacityLayers[s.id] ?? 0.8,
                    type: 'raster',                                
                    description: `Año ${s.year}`
                }
            ])
        )
    }), [vectorLayers, activeLayers, opacityLayers]);

    const combinedLoading = useMemo(() => ({
        ...vectorLoading, 
        raster: rasterLoading
    }), [vectorLoading, rasterLoading]);

    const handleMapClick = useCallback((e: L.LeafletMouseEvent, map: L.Map) => {
        setSelectedFeature(null);
        queryPixelValue(e, map);
    }, [queryPixelValue]);

    const handleOpacityChange = useCallback((layerId: string, opacity: number, type: 'vector' | 'raster') => {
        if (type === 'vector') {
            setLayerOpacity(layerId, opacity);
        } else {
            setRasterLayerOpacity(layerId, opacity);
        }
    }, [setLayerOpacity, setRasterLayerOpacity]);

    return (
        <div className="map-view-container-full">

            <LayerMenu
                layers={layerMenuData}
                loading={combinedLoading}
                errors={vectorErrors}
                onLayerToggle={handleLayerToggle}
                onOpacityChange={handleOpacityChange}
            />

            <PixelInfoPanel
                pixelInfo={pixelInfo}
                loading={rasterLoading}
                onClose={clearPixelInfo}
            />

            {wmsError && (
                <div className="wms-error-alert">
                    ⚠️ {wmsError}
                </div>
            )}

            <MapContainer
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                style={{ width: '100%', height: '100%' }}
                className="leaflet-map-full"
                ref={setMapInstance}
                preferCanvas={true}
            >
                <MapContent />

                <MapClickHandler 
                    onMapClick={handleMapClick}
                />

                {RASTER_SERIES.map((serie, index) => {
                    if (!activeLayers[serie.id]) return null;

                    return (
                        <WMSTileLayer
                            key={`${serie.id}-${serie.timeValue}`}
                            url={config.geoserver.wmsUrl}
                            layers={`${config.geoserver.workspace}:${serie.wmsLayer || 'usv_mosaico'}`}
                            format="image/png"
                            transparent={true}
                            opacity={opacityLayers[serie.id] ?? 0.8}
                            params={{
                                TIME: serie.timeValue,
                                TILED: true,
                            } as any}
                            zIndex={500 + index}
                            eventHandlers={{
                                tileerror: () => setWmsError(`Error cargando ${serie.name}`),
                                tileload: () => setWmsError(null)
                            }}
                        />
                    );
                })}

                {Object.entries(vectorLayers).map(([id, layer]) => (
                    <VectorLayer
                        key={id}
                        id={id}
                        data={layer.data}
                        visible={layer.visible}
                        timestamp={layer.timestamp}
                        opacity={layer.opacity}
                        selectedFeatureId={selectedFeature}
                        onEachFeature={onEachVectorFeature}
                    />
                ))}

                {/* Resaltar el píxel seleccionado */}
                {pixelInfo && pixelInfo.coordinates && (
                    <CircleMarker
                        center={pixelInfo.coordinates}
                        radius={10}
                        pathOptions={{
                            color: '#ffffff',
                            fillColor: '#cd171e',
                            fillOpacity: 0.8,
                            weight: 3,
                            className: 'pixel-highlight-pulse'
                        }}
                    />
                )}

                <Legend activeLayers={activeLayers} vectorLayers={vectorLayers as any} />

            </MapContainer>

            {activeRasterLayersList.length > 0 && (
                <div className="active-series-indicator">
                    <span className="indicator-title">
                        Series activas:
                    </span>
                    {RASTER_SERIES.filter(s => activeLayers[s.id]).map(s => (
                        <span key={s.id} className="series-badge">
                            {s.name} ({s.year})
                        </span>
                    ))}
                    <div style={{fontSize: '0.8rem', marginTop: '5px', opacity: 0.9}}>
                        Haz clic en el mapa para consultar clasificación
                    </div>
                </div>
            )}
        </div>
    );
};

export default MapView;
