import React, { useCallback, useState, useEffect } from 'react';
import {
    MapContainer,
    GeoJSON,
    WMSTileLayer,
    useMapEvents
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

import MapContent from './MapContent';
import LayerMenu from './LayerMenu';
import PixelInfoPanel from './PixelInfoPanel';
import { useWFSLayers } from '../../hooks/useWFSLayers';
import { useRasterLayers } from '../../hooks/useRasterLayers';
import { config } from '../../config/env';
import '../../styles/mapView.css';

/**
 * Configuración de series con sus fechas TIME para el mosaico
 */
const RASTER_SERIES = [
    { id: 'usvserie1', name: 'Serie I', year: 1985, timeValue: '1985-01-01' },
    { id: 'usvserie2', name: 'Serie II', year: 1993, timeValue: '1993-01-01' },
    { id: 'serie3', name: 'Serie III', year: 2002, timeValue: '2002-01-01' },
    { id: 'serie4', name: 'Serie IV', year: 2007, timeValue: '2007-01-01' },
    { id: 'serie5', name: 'Serie V', year: 2011, timeValue: '2011-01-01' },
    { id: 'serie6', name: 'Serie VI', year: 2014, timeValue: '2014-01-01' },
    { id: 'serie7', name: 'Serie VII', year: 2018, timeValue: '2018-01-01' }
];

/**
 * Manejador de clics para consulta ráster
 */
const MapClickHandler = ({ onMapClick, activeRasterLayers }) => {
    useMapEvents({
        click: (e) => {
            console.log('🖱️ Click en mapa detectado:', {
                coordenadas: [e.latlng.lat, e.latlng.lng],
                capasActivas: activeRasterLayers.length
            });

            if (activeRasterLayers.length > 0) {
                console.log('✅ Ejecutando consulta de píxel...');
                onMapClick(e);
            } else {
                console.warn('⚠️ No hay capas ráster activas para consultar');
                alert('Por favor, activa al menos una serie antes de hacer clic en el mapa');
            }
        }
    });
    return null;
};

const MapView = () => {
    const mapConfig = config.map;
    const [mapInstance, setMapInstance] = useState(null);
    const [wmsError, setWmsError] = useState(null);

    // ===== VECTOR =====
    const {
        layers: vectorLayers,
        loading: vectorLoading,
        errors: vectorErrors,
        loadLayer,
        unloadLayer
    } = useWFSLayers();

    // ===== RÁSTER =====
    const {
        activeLayers,
        pixelInfo,
        loading: rasterLoading,
        toggleRasterLayer,
        queryPixelValue,
        clearPixelInfo
    } = useRasterLayers();

    // Debug: Log pixelInfo cuando cambia
    useEffect(() => {
        if (pixelInfo) {
            console.log('📊 PixelInfo actualizado:', pixelInfo);
        }
    }, [pixelInfo]);

    // Debug: Log loading state
    useEffect(() => {
        console.log('⏳ Loading state:', rasterLoading);
    }, [rasterLoading]);

    // Verificar URL de GeoServer al cargar
    useEffect(() => {
        console.log('🌍 Configuración WMS:', {
            url: config.geoserver.wmsUrl,
            workspace: config.geoserver.workspace,
            mosaico: 'usv_mosaico',
            series: RASTER_SERIES.map(s => `${s.name} (${s.year})`),
            mensaje: 'Usando MOSAICO con parámetro TIME'
        });

        const testUrl = `${config.geoserver.wmsUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;

        fetch(testUrl)
            .then(response => {
                if (response.ok) {
                    console.log('✅ GeoServer accesible');
                    setWmsError(null);
                } else {
                    console.error('❌ GeoServer responde con error:', response.status);
                    setWmsError(`Error ${response.status}: GeoServer no responde correctamente`);
                }
            })
            .catch(error => {
                console.error('❌ No se puede conectar a GeoServer:', error);
                setWmsError(`No se puede conectar: ${error.message}`);
            });
    }, []);

    /**
     * Toggle de capas con logging mejorado
     */
    const handleLayerToggle = useCallback(async (layerId, isActive, layerType) => {
        console.log(`🔄 Toggle layer: ${layerId}, activo: ${isActive}, tipo: ${layerType}`);

        if (layerType === 'vector') {
            isActive ? loadLayer(layerId) : unloadLayer(layerId);
        } else if (layerType === 'raster') {
            toggleRasterLayer(layerId, isActive);
        }
    }, [loadLayer, unloadLayer, toggleRasterLayer]);

    /**
     * Click para consulta de píxel con debug mejorado
     */
    const handleMapClick = useCallback((event) => {
        console.log('🎯 handleMapClick ejecutado:', {
            mapInstance: !!mapInstance,
            activeLayers,
            hasActiveLayers: Object.values(activeLayers).some(v => v)
        });

        if (mapInstance && Object.values(activeLayers).some(v => v)) {
            console.log('✅ Iniciando queryPixelValue...');
            queryPixelValue(event, mapInstance);
        } else {
            console.warn('⚠️ No se puede consultar:', {
                tieneMapInstance: !!mapInstance,
                tieneCapasActivas: Object.values(activeLayers).some(v => v)
            });
        }
    }, [mapInstance, activeLayers, queryPixelValue]);

    // Obtener lista de capas ráster activas
    const activeRasterLayersList = Object.entries(activeLayers)
        .filter(([_, v]) => v)
        .map(([k]) => k);

    // Log cuando una capa se activa
    useEffect(() => {
        RASTER_SERIES.forEach(serie => {
            if (activeLayers[serie.id]) {
                console.log('🎨 Serie ráster activada:', {
                    id: serie.id,
                    nombre: serie.name,
                    año: serie.year,
                    timeParam: serie.timeValue,
                    url: `${config.geoserver.wmsUrl}?LAYERS=${config.geoserver.workspace}:usv_mosaico&TIME=${serie.timeValue}`
                });
            }
        });

        console.log('📋 Estado de activeLayers:', activeLayers);
        console.log('📋 activeRasterLayersList:', activeRasterLayersList);
    }, [activeLayers]);

    return (
        <div className="map-view-container-full">

            {/* MENÚ */}
            <LayerMenu
                layers={{
                    ...vectorLayers,
                    ...Object.fromEntries(
                        RASTER_SERIES.map(s => [
                            s.id,
                            { visible: activeLayers[s.id], type: 'raster' }
                        ])
                    )
                }}
                loading={vectorLoading}
                errors={vectorErrors}
                onLayerToggle={handleLayerToggle}
            />

            {/* PANEL DE PÍXEL - SIEMPRE VISIBLE PARA DEBUG */}
            <PixelInfoPanel
                pixelInfo={pixelInfo}
                loading={rasterLoading}
                onClose={clearPixelInfo}
            />

            {/* DEBUG: Mostrar estado */}
            {config.app.debug && (
                <div className="debug-panel">
                    <div><strong>Debug Info:</strong></div>
                    <div>Capas activas: {activeRasterLayersList.length}</div>
                    <div>Loading: {rasterLoading ? 'Sí' : 'No'}</div>
                    <div>PixelInfo: {pixelInfo ? 'Sí' : 'No'}</div>
                    <div>Map: {mapInstance ? 'Sí' : 'No'}</div>
                </div>
            )}

            {/* ALERTA DE ERROR WMS */}
            {wmsError && (
                <div className="wms-error-alert">
                    ⚠️ {wmsError}
                </div>
            )}

            <MapContainer
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                minZoom={mapConfig.minZoom}
                maxZoom={mapConfig.maxZoom}
                maxBounds={mapConfig.maxBounds}
                className="leaflet-map-full"
                whenCreated={setMapInstance}
            >
                <MapContent />

                <MapClickHandler
                    onMapClick={handleMapClick}
                    activeRasterLayers={activeRasterLayersList}
                />

                {/* ===== CAPAS DEL MOSAICO CON PARÁMETRO TIME ===== */}
                {RASTER_SERIES.map((serie, index) => {
                    if (!activeLayers[serie.id]) return null;

                    return (
                        <WMSTileLayer
                            key={`${serie.id}-${serie.timeValue}`}
                            url={config.geoserver.wmsUrl}
                            layers={`${config.geoserver.workspace}:usv_mosaico`}
                            format="image/png"
                            transparent={true}
                            opacity={0.8}
                            params={{
                                TIME: serie.timeValue,
                                TILED: true,
                            }}
                            zIndex={500 + index}
                            eventHandlers={{
                                tileerror: (error) => {
                                    console.error(`❌ Error cargando ${serie.name} (${serie.year}):`, error);
                                    setWmsError(`Error al cargar ${serie.name} (${serie.year})`);
                                },
                                tileload: () => {
                                    console.log(`✅ ${serie.name} (${serie.year}) cargada correctamente`);
                                    if (wmsError && wmsError.includes(serie.year.toString())) {
                                        setWmsError(null);
                                    }
                                }
                            }}
                        />
                    );
                })}

                {/* CAPAS VECTORIALES */}
                {Object.entries(vectorLayers).map(([id, layer]) => {
                    if (!layer.visible || !layer.data) return null;
                    return (
                        <GeoJSON
                            key={`${id}-${layer.timestamp}`}
                            data={layer.data}
                        />
                    );
                })}
            </MapContainer>

            {/* ===== INDICADOR DE SERIES ACTIVAS ===== */}
            {activeRasterLayersList.length > 0 && (
                <div className="active-series-indicator">
                    <span className="indicator-title">
                        📊 Series activas - Haz clic en el mapa para consultar:
                    </span>
                    {RASTER_SERIES.filter(s => activeLayers[s.id]).map(s => (
                        <span key={s.id} className="series-badge">
                            {s.name} ({s.year})
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MapView;
