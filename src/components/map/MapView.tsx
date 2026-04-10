import React, { useCallback, useState, useMemo, useRef } from 'react';
import {
    MapContainer,
    WMSTileLayer,
    useMapEvents,
    CircleMarker
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GeoJSON } from 'react-leaflet';

import MapContent from '@components/map/MapContent';
import LayerMenu from '@components/map/panels/LayerMenu';
import type { ExternalLayer } from '@components/map/panels/LayerMenu';
import SwipeControl from '@components/map/controls/SwipeControl';
import SwipePanel from '@components/map/tools/SwipePanel';
import type { SwipeLayerConfig } from '@components/map/controls/SwipeControl';
import { featureStyle, DEFAULT_SYMBOLOGY } from '@utils/geo/symbologyUtils';
import GeoRasterLayerComponent from '@components/map/layers/GeoRasterLayerComponent';
import PixelInfoPanel from '@components/map/panels/PixelInfoPanel';
import Legend from '@components/map/panels/Legend';
import PrintDesigner from '@components/map/tools/PrintDesigner';
import VectorLayer from '@components/map/layers/VectorLayer';
import { useWFSLayers } from '@hooks/map';
import { useRasterLayers } from '@hooks/map';
import { wfsService } from '../../services/geoserver/wfsService';
import { rasterService } from '../../services/geoserver/rasterService';
import { config } from '@config/env';
import { AVAILABLE_LAYERS, getLayerConfig } from '@config/layers';
import '@styles/mapView.css';
import { useApiLayersLoader } from '@hooks/api';

/**
 * Filtramos las series ráster desde la configuración global
 */


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

     const { layersByGroup } = useApiLayersLoader();

    const RASTER_SERIES = useMemo(
        () => Object.values(layersByGroup).flat().filter(l => l.type === 'raster'),
        [layersByGroup]
    );
    
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    const [printOpen,   setPrintOpen]   = useState(false);
    const [wmsError, setWmsError] = useState<string | null>(null);
    const [selectedFeature, setSelectedFeature] = useState<any>(null);
    const [externalLayers, setExternalLayers] = useState<ExternalLayer[]>([]);
    const [externalVisible, setExternalVisible] = useState<Record<string, boolean>>({});
    const [externalOpacity, setExternalOpacity] = useState<Record<string, number>>({});

    // ===== SWIPE =====
    const [swipeActive, setSwipeActive]       = useState(false);
    const [swipeLeft,   setSwipeLeft]         = useState<SwipeLayerConfig | null>(null);
    const [swipeRight,  setSwipeRight]        = useState<SwipeLayerConfig | null>(null);
    const autoZoomedVectorLayersRef = useRef<Set<string>>(new Set());

    const handleSwipeActivate = useCallback((left: SwipeLayerConfig, right: SwipeLayerConfig) => {
        setSwipeLeft(left);
        setSwipeRight(right);
        setSwipeActive(true);
    }, []);

    const handleSwipeDeactivate = useCallback(() => {
        setSwipeActive(false);
        setSwipeLeft(null);
        setSwipeRight(null);
    }, []);

    const handleAddExternalLayer = useCallback((layer: ExternalLayer) => {
        setExternalLayers(prev => [...prev, layer]);
        setExternalVisible(prev => ({ ...prev, [layer.id]: true }));
        setExternalOpacity(prev => ({ ...prev, [layer.id]: 0.8 }));
        // Zoom automático a la capa si tiene datos GeoJSON
        if (layer.geojsonData && mapInstance) {
            try {
                const gl = L.geoJSON(layer.geojsonData);
                const bounds = gl.getBounds();
                if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [30, 30] });
            } catch { /* sin bounds válidos */ }
        }
    }, [mapInstance]);

    const handleRemoveExternalLayer = useCallback((id: string) => {
        setExternalLayers(prev => prev.filter(l => l.id !== id));
        setExternalVisible(prev => { const n = { ...prev }; delete n[id]; return n; });
        setExternalOpacity(prev => { const n = { ...prev }; delete n[id]; return n; });
    }, []);

    const handleToggleExternalLayer = useCallback((id: string, visible: boolean) => {
        setExternalVisible(prev => ({ ...prev, [id]: visible }));
    }, []);

    const handleExternalOpacityChange = useCallback((id: string, opacity: number) => {
        setExternalOpacity(prev => ({ ...prev, [id]: opacity }));
    }, []);

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
            const wfsName = layerCfg.wfsName ?? layerCfg.id;
            const dynamicBounds = await wfsService.getLayerExtent(wfsName);
            
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
        const props = feature.properties ?? {};

        // Construir filas de la tabla de atributos
        const SKIP = new Set(['bbox', 'geometry', 'the_geom', 'geom']);
        const nombre =
            props.NOMBRE   ?? props.nombre   ??
            props.Estado   ?? props.estado   ??
            props.Municipio ?? props.municipio ??
            props.Localidad ?? props.localidad ??
            props.NAME     ?? props.name     ?? 'Elemento';

        const rows = Object.entries(props)
            .filter(([k]) => !SKIP.has(k.toLowerCase()))
            .map(([k, v]) => `<tr>
                <td style="padding:5px 12px 5px 0;font-weight:600;color:#555;white-space:nowrap;vertical-align:top;font-size:13px">${k}</td>
                <td style="padding:5px 0;color:#222;font-size:13px;word-break:break-word">${v ?? '—'}</td>
            </tr>`).join('');

        const content = `
            <div style="font-family:'Roboto','Segoe UI',sans-serif;min-width:300px;max-width:440px">
                <div style="background:#8d1c3d;color:#fff;padding:10px 14px;margin:-13px -20px 10px;border-radius:4px 4px 0 0;font-size:15px;font-weight:600">${nombre}</div>
                <div style="max-height:260px;overflow-y:auto">
                    <table style="border-collapse:collapse;width:100%">
                        <tbody>${rows || '<tr><td style="color:#999;font-size:13px">Sin atributos</td></tr>'}</tbody>
                    </table>
                </div>
            </div>`;

        layer.bindPopup(content, { maxWidth: 460, minWidth: 300, className: 'vector-popup', offset: [0, -4] });

        layer.on({
            click: (e: L.LeafletMouseEvent) => {
                L.DomEvent.stopPropagation(e);
                const fid = feature.id ?? props.id ?? Math.random();
                setSelectedFeature(fid);
                layer.openPopup(e.latlng);
            },
            popupclose: () => setSelectedFeature(null),
        });
    }, []);


    // --- MANEJO DE CAPAS ---
    const handleLayerToggle = useCallback(async (layerId: string, isActive: boolean, layerType: 'vector' | 'raster') => {
        if (layerType === 'vector') {
            if (vectorLayers[layerId]) {
                // La capa ya existe en el estado — solo alternar visibilidad
                toggleLayer(layerId);
                if (isActive) {
                    autoZoomedVectorLayersRef.current.add(layerId);
                    zoomToLayer(layerId, 'vector', vectorLayers[layerId].data);
                } else {
                    autoZoomedVectorLayersRef.current.delete(layerId);
                }
            } else if (isActive) {
                // Cargar nueva capa: usar wfsName para la consulta WFS pero almacenar bajo layerId
                const layerCfg = AVAILABLE_LAYERS.find(l => l.id === layerId);
                const nameToLoad = layerCfg?.wfsName ?? layerId;
                await loadLayer(nameToLoad, {}, layerId);
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
                if (layer.visible && layer.data && !autoZoomedVectorLayersRef.current.has(id)) {
                    autoZoomedVectorLayersRef.current.add(id);
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
                externalLayers={externalLayers}
                externalVisible={externalVisible}
                externalOpacity={externalOpacity}
                onAddExternalLayer={handleAddExternalLayer}
                onRemoveExternalLayer={handleRemoveExternalLayer}
                onToggleExternalLayer={handleToggleExternalLayer}
                onExternalOpacityChange={handleExternalOpacityChange}
            />

            <PixelInfoPanel
                pixelInfo={pixelInfo}
                loading={rasterLoading}
                onClose={clearPixelInfo}
            />

            {/* ── Panel de comparación (swipe) fuera del mapa ── */}
            <SwipePanel
                active={swipeActive}
                onActivate={handleSwipeActivate}
                onDeactivate={handleSwipeDeactivate}
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

                {/* ── Swipe / Comparador de capas ── */}
                {swipeActive && swipeLeft && swipeRight && (
                    <SwipeControl
                        leftLayer={swipeLeft}
                        rightLayer={swipeRight}
                        onClose={handleSwipeDeactivate}
                    />
                )}

                {RASTER_SERIES.map((serie, index) => {
                    if (!activeLayers[serie.id]) return null;

                    return (
                        <WMSTileLayer
                            key={`${serie.id}-${serie.timeValue}`}
                            url={config.qgisServer.wmsRasterUrl}
                            layers={serie.wmsLayer || 'usv_mosaico'}
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

                {Object.entries(vectorLayers).map(([id, layer], index) => {
                    const cfg = AVAILABLE_LAYERS.find(l => l.id === id);
                    return (
                        <VectorLayer
                            key={id}
                            id={id}
                            wmsLayer={cfg?.wmsLayer ?? cfg?.wfsName ?? id}
                            data={layer.data}
                            visible={layer.visible}
                            timestamp={layer.timestamp}
                            opacity={layer.opacity}
                            selectedFeatureId={selectedFeature}
                            onEachFeature={onEachVectorFeature}
                            zIndex={400 + index}
                        />
                    );
                })}

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

                {/* ── Capas externas (GeoJSON/KML/SHP/WMS/WFS cargadas por usuario) ── */}
                {externalLayers.map(ext => {
                    if (!externalVisible[ext.id]) return null;

                    // Vector local (GeoJSON parseado)
                    if ((ext.type === 'vector') && ext.geojsonData) {
                        const sym = ext.symbology ?? DEFAULT_SYMBOLOGY;
                        const opacity = externalOpacity[ext.id] ?? 0.8;
                        return (
                            <GeoJSON
                                key={ext.id}
                                data={ext.geojsonData}
                                style={(feature) => ({
                                    ...featureStyle(feature, sym),
                                    fillOpacity: sym.fillOpacity * opacity,
                                    opacity,
                                })}
                                onEachFeature={onEachVectorFeature}
                            />
                        );
                    }

                    // GeoTIFF local
                    if (ext.type === 'raster' && ext.georasterData) {
                        return (
                            <GeoRasterLayerComponent
                                key={ext.id}
                                layerId={ext.id}
                                georaster={ext.georasterData}
                                opacity={externalOpacity[ext.id] ?? 0.8}
                                resolution={256}
                            />
                        );
                    }

                    // WMS externo
                    if (ext.type === 'wms' && ext.url && ext.layerName) {
                        return (
                            <WMSTileLayer
                                key={ext.id}
                                url={ext.url}
                                layers={ext.layerName}
                                format="image/png"
                                transparent={true}
                                opacity={externalOpacity[ext.id] ?? 0.8}
                                zIndex={600}
                            />
                        );
                    }

                    return null;
                })}

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
            {/* ── Botón flotante impresión ── */}
            <button className="pd-fab" onClick={() => setPrintOpen(true)} title="Diseñador de impresión">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z"/>
                    <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z"/>
                </svg>
                Imprimir mapa
            </button>

            {/* ── Diseñador de impresión ── */}
            {printOpen && (
                <PrintDesigner
                    mapInstance={mapInstance}
                    allLayers={layerMenuData}
                    onClose={() => setPrintOpen(false)}
                />
            )}
        </div>
    );
};

export default MapView;
