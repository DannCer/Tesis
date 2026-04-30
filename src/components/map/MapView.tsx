import React, { useCallback, useState, useMemo, useRef, useEffect, memo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
    MapContainer,
    WMSTileLayer,
    useMapEvents,
    useMap,
    CircleMarker
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GeoJSON } from 'react-leaflet';

import MapContent from '@components/map/MapContent';
import LayerMenu from '@components/map/panels/LayerMenu';
import type { ExternalLayer } from '@types/geo';
import SwipeControl from '@components/map/controls/SwipeControl';
import SwipePanel from '@components/map/tools/SwipePanel';
import ElevationProfile from '@components/map/tools/ElevationProfile';
import AnalysisTool from '@components/map/tools/AnalysisTool';
import type { SwipeLayerConfig } from '@components/map/controls/SwipeControl';
import { featureStyle, DEFAULT_SYMBOLOGY } from '@utils/geo/symbologyUtils';
import GeoRasterLayerComponent from '@components/map/layers/GeoRasterLayerComponent';
import PixelInfoPanel from '@components/map/panels/PixelInfoPanel';
import Legend from '@components/map/panels/Legend';
import VectorLayer from '@components/map/layers/VectorLayer';
import { useWFSLayers } from '@hooks/map';
import { useRasterLayers } from '@hooks/map';
import { wfsService } from '@services/geoserver/wfsService';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import { dynamicRasterService } from '@services/geoserver/dynamicRasterService';
import { config, logger } from '@config/env';
import type { LayerConfig } from '@config/layers';
import type { WFSOptions } from '@types/map';
import '@styles/mapView.css';
import '@styles/PrintDesigner.css';
import { useApiLayersLoader } from '@hooks/api';
import { useLayersContext } from '@contexts/LayersContext';
import { useSelectedProjectLayers } from '@hooks/map/useSelectedProjectLayers';
import { ErrorBoundary } from '@components/common';

const PrintDesigner = lazy(() => import('@components/map/tools/PrintDesigner'));

// ─── Capturar instancia del mapa desde dentro del MapContainer ────────────────
// react-leaflet v4 no expone la instancia de L.Map via ref en MapContainer.
// El patrón correcto es un componente hijo que use useMap().

interface MapInstanceCaptureProps {
    onReady: (map: L.Map) => void;
}

const MapInstanceCapture: React.FC<MapInstanceCaptureProps> = ({ onReady }) => {
    const map = useMap();
    useEffect(() => {
        onReady(map);
    }, [map, onReady]);
    return null;
};


// ─── MapClickHandler ──────────────────────────────────────────────────────────

interface MapClickHandlerProps {
    onMapClick: (e: L.LeafletMouseEvent, map: L.Map) => void;
    swipeActive: boolean;
}

const MapClickHandler: React.FC<MapClickHandlerProps> = ({ onMapClick, swipeActive }) => {
    const map = useMapEvents({
        click: (e) => {
            // No disparar query de pixel mientras el comparador está activo
            if (swipeActive) return;
            onMapClick(e, map);
        }
    });
    return null;
};

// ─── Interfaces para componentes memoizados ────────────────────────────────────

interface WMSTileLayerProps {
    isActive: boolean;
    url: string;
    layers: string;
    format: string;
    transparent: boolean;
    opacity: number;
    params?: Record<string, unknown>;
    zIndex?: number;
    eventHandlers?: Record<string, () => void>;
}

interface VectorLayerMemoProps {
    id: string;
    wmsLayer: string;
    data: any;
    visible: boolean;
    timestamp: number;
    opacity: number;
    selectedFeatureId: string | number | null;
    onEachFeature: (feature: any, layer: L.Layer) => void;
    zIndex?: number;
    wmsBaseUrl?: string;
    pane?: string;
}

// ✨ Componentes memoizados para evitar re-renderizados innecesarios
const MemoizedWMSTileLayer = memo(
    ({ isActive, ...rest }: WMSTileLayerProps) => {
        if (!isActive) return null;
        return <WMSTileLayer {...(rest as any)} />;
    },
    (prev, next) =>
        prev.isActive === next.isActive &&
        prev.opacity === next.opacity &&
        prev.url === next.url &&
        prev.layers === next.layers &&
        (prev.params as any)?.TIME === (next.params as any)?.TIME
);
MemoizedWMSTileLayer.displayName = 'MemoizedWMSTileLayer';

const MemoizedVectorLayer = memo(
    (props: VectorLayerMemoProps) => <VectorLayer {...props} />,
    (prev, next) =>
        prev.id === next.id &&
        prev.visible === next.visible &&
        prev.opacity === next.opacity &&
        prev.timestamp === next.timestamp &&
        prev.wmsBaseUrl === next.wmsBaseUrl &&
        prev.pane === next.pane
);
MemoizedVectorLayer.displayName = 'MemoizedVectorLayer';

// ─── Utilidad: escapar HTML para prevenir XSS en popups ──────────────────────
const escapeHtml = (value: unknown): string => {
    const str = String(value ?? '—');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

const MapView: React.FC = () => {
    const mapConfig = config.map || {
        center: [19.4326, -99.1332],
        zoom: 10
    };

    const { layersByGroup } = useApiLayersLoader();
    const { grupos, availableLayers: contextLayers } = useLayersContext();
    const {
        layers: projectLayers,
        loading: projectLoading,
        selectedProjectId,
        selectedProjectName,
    } = useSelectedProjectLayers();

    const RASTER_SERIES = useMemo(
        () => Object.values(layersByGroup).flat().filter(l => l.type === 'raster'),
        [layersByGroup]
    );

    // ✅ CORRECCIÓN: mapInstance se captura con MapInstanceCapture (useMap()) en lugar
    // de ref={setMapInstance}, que en react-leaflet v4 devuelve el contenedor DOM, no L.Map.
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    const handleMapReady = useCallback((map: L.Map) => {
        setMapInstance(map);
    }, []);

    const [printOpen, setPrintOpen] = useState(false);
    const [wmsError, setWmsError] = useState<string | null>(null);
    const [selectedFeature, setSelectedFeature] = useState<any>(null);
    const [externalLayers, setExternalLayers] = useState<ExternalLayer[]>([]);
    const [externalVisible, setExternalVisible] = useState<Record<string, boolean>>({});
    const [externalOpacity, setExternalOpacity] = useState<Record<string, number>>({});

    const [swipeActive, setSwipeActive] = useState(false);
    const [swipeLeft, setSwipeLeft] = useState<SwipeLayerConfig | null>(null);
    const [swipeRight, setSwipeRight] = useState<SwipeLayerConfig | null>(null);
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
        if (layer.geojsonData && mapInstance) {
            try {
                const gl = L.geoJSON(layer.geojsonData);
                const bounds = gl.getBounds();
                if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [30, 30] });
            } catch { /* ignore */ }
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

    const availableLayers = useMemo((): LayerConfig[] => {
        const projectFlat = projectLayers ?? [];
        return [...contextLayers, ...projectFlat];
    }, [contextLayers, projectLayers]);

    // ✨ Índices para búsquedas O(1)
    const layerIndexRef = useRef<Map<string, LayerConfig>>(new Map());
    const grupoIndexRef = useRef<Map<string, any>>(new Map());

    useEffect(() => {
        const newLayerIndex = new Map<string, LayerConfig>();
        availableLayers.forEach(layer => {
            newLayerIndex.set(layer.id, layer);
        });
        layerIndexRef.current = newLayerIndex;

        const newGrupoIndex = new Map<string, any>();
        (grupos || []).forEach(grupo => {
            newGrupoIndex.set(grupo.nombre, grupo);
        });
        grupoIndexRef.current = newGrupoIndex;
    }, [availableLayers, grupos]);

    const combinedLayersByGroup = useMemo(() => {
        const combined = { ...layersByGroup };
        if (projectLayers && projectLayers.length > 0 && selectedProjectName) {
            combined[selectedProjectName] = projectLayers;
        }
        return combined;
    }, [layersByGroup, projectLayers, selectedProjectName]);

    const {
        layers: vectorLayers,
        loading: vectorLoading,
        errors: vectorErrors,
        loadLayer,
        toggleLayer,
        setLayerOpacity
    } = useWFSLayers();

    const {
        activeLayers,
        opacityLayers,
        pixelInfo,
        loading: rasterLoading,
        toggleRasterLayer,
        setRasterLayerOpacity,
        queryPixelValue,
        clearPixelInfo
    } = useRasterLayers(availableLayers);

    const zoomToLayer = useCallback(async (layerId: string, type: 'vector' | 'raster', data?: any) => {
        if (!mapInstance) return;
        const layerCfg = layerIndexRef.current.get(layerId);
        if (!layerCfg) return;

        if (type === 'vector') {
            const wfsName = layerCfg.wfsName ?? layerCfg.id;
            const groupName = layerCfg.group;
            const dynamicBounds = groupName
                ? await dynamicWfsService.getLayerExtent(wfsName, groupName).catch(() => null)
                : await wfsService.getLayerExtent(wfsName).catch(() => null);
            if (dynamicBounds) {
                mapInstance.fitBounds(dynamicBounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            } else if (data) {
                try {
                    const geoJsonLayer = L.geoJSON(data);
                    const bounds = geoJsonLayer.getBounds();
                    if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [20, 20] });
                } catch (err) {
                    logger.error('Error al calcular bounds para zoom:', err);
                }
            } else if (layerCfg.bounds) {
                mapInstance.fitBounds(layerCfg.bounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            }
        } else if (type === 'raster') {
            const wmsLayer = layerCfg.wmsLayer || 'usv_mosaico';
            const groupName = layerCfg.group;
            const dynamicBounds = groupName
                ? await dynamicRasterService.getLayerExtent(wmsLayer, groupName).catch(() => null)
                : null;
            if (dynamicBounds) {
                mapInstance.fitBounds(dynamicBounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            } else if (layerCfg.bounds) {
                mapInstance.fitBounds(layerCfg.bounds as L.LatLngBoundsExpression, { padding: [20, 20] });
            }
        }
    }, [mapInstance]);

    const onEachVectorFeature = useCallback((feature: any, layer: L.Layer) => {
        const props = feature.properties ?? {};
        const SKIP = new Set(['bbox', 'geometry', 'the_geom', 'geom']);
        const nombre =
            props.NOMBRE ?? props.nombre ??
            props.Estado ?? props.estado ??
            props.Municipio ?? props.municipio ??
            props.Localidad ?? props.localidad ??
            props.NAME ?? props.name ?? 'Elemento';

        const rows = Object.entries(props)
            .filter(([k]) => !SKIP.has(k.toLowerCase()))
            .map(([k, v]) => `<tr>
                <td style="padding:5px 12px 5px 0;font-weight:600;color:#555;white-space:nowrap;vertical-align:top;font-size:13px">${escapeHtml(k)}</td>
                <td style="padding:5px 0;color:#222;font-size:13px;word-break:break-word">${escapeHtml(v)}</td>
            </tr>`).join('');

        const content = `
            <div style="font-family:'Roboto','Segoe UI',sans-serif;min-width:300px;max-width:440px">
                <div style="background:#8d1c3d;color:#fff;padding:10px 14px;margin:-13px -20px 10px;border-radius:4px 4px 0 0;font-size:15px;font-weight:600">${nombre}</div>
                <div style="max-height:260px;overflow-y:auto">
                    <table style="border-collapse:collapse;width:100%">
                        <tbody>${rows || '<tr><td style="color:#999;font-size:13px">Sin atributos</td>'}</tbody>
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

    const handleLayerToggle = useCallback(async (layerId: string, isActive: boolean, layerType: 'vector' | 'raster') => {
        if (layerType === 'vector') {
            if (vectorLayers[layerId]) {
                toggleLayer(layerId);
                if (isActive) {
                    autoZoomedVectorLayersRef.current.add(layerId);
                    zoomToLayer(layerId, 'vector', vectorLayers[layerId].data);
                } else {
                    autoZoomedVectorLayersRef.current.delete(layerId);
                    // ✅ CORRECCIÓN: limpiar error WMS al desactivar la capa
                    setWmsError(null);
                }
            } else if (isActive) {
                const layerCfg = layerIndexRef.current.get(layerId);
                const nameToLoad = layerCfg?.wfsName ?? layerId;
                const groupName = layerCfg?.group;

                let options: WFSOptions = {};
                if (layerId === 'incendios_recurrencia') {
                    options = { simplifyTolerance: 10 };
                }

                await loadLayer(nameToLoad, groupName, options, layerId);
            } else {
                autoZoomedVectorLayersRef.current.delete(layerId);
            }
        } else if (layerType === 'raster') {
            toggleRasterLayer(layerId, isActive);
            if (isActive) {
                zoomToLayer(layerId, 'raster');
            } else {
                // ✅ CORRECCIÓN: limpiar error WMS al desactivar la capa raster
                setWmsError(null);
            }
        }
    }, [vectorLayers, loadLayer, toggleLayer, toggleRasterLayer, zoomToLayer]);

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
                    // ✅ CORRECCIÓN: opacidad individual por serie, no el booleano rasterLoading
                    opacity: opacityLayers[s.id] ?? 0.8,
                    type: 'raster',
                    description: `Año ${s.year}`
                }
            ])
        )
    }), [vectorLayers, activeLayers, opacityLayers]);

    // ✅ CORRECCIÓN: loading por capa separado — cada serie tiene su propio estado,
    // no todas comparten el mismo booleano rasterLoading.
    const combinedLoading = useMemo(() => ({
        ...vectorLoading,
        ...Object.fromEntries(
            RASTER_SERIES.map(s => [s.id, activeLayers[s.id] ? rasterLoading : false])
        )
    }), [vectorLoading, rasterLoading, activeLayers, RASTER_SERIES]);

    const combinedErrors = useMemo(() => ({
        ...vectorErrors,
        ...Object.fromEntries(
            RASTER_SERIES.map(s => [s.id, null])
        )
    }), [vectorErrors, RASTER_SERIES]);

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
                layerState={layerMenuData}
                layersByGroup={combinedLayersByGroup}
                loading={combinedLoading}
                errors={combinedErrors}
                onLayerToggle={handleLayerToggle}
                onOpacityChange={handleOpacityChange}
                externalLayers={externalLayers}
                externalVisible={externalVisible}
                externalOpacity={externalOpacity}
                onAddExternalLayer={handleAddExternalLayer}
                onRemoveExternalLayer={handleRemoveExternalLayer}
                onToggleExternalLayer={handleToggleExternalLayer}
                onExternalOpacityChange={handleExternalOpacityChange}
                toolbarSlot={
                    <>
                        <SwipePanel
                            active={swipeActive}
                            onActivate={handleSwipeActivate}
                            onDeactivate={handleSwipeDeactivate}
                        />
                        <ElevationProfile mapInstance={mapInstance} />
                        <AnalysisTool mapInstance={mapInstance} />
                    </>
                }
            />

            <PixelInfoPanel
                pixelInfo={pixelInfo}
                loading={rasterLoading}
                onClose={clearPixelInfo}
            />

            {/* ✅ CORRECCIÓN: wmsError dentro del flujo visual correcto, sobre el mapa */}
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
                preferCanvas={true}
                doubleClickZoom={false}
            >
                {/* ✅ CORRECCIÓN: captura la instancia real de L.Map desde dentro del contexto */}
                <MapInstanceCapture onReady={handleMapReady} />

                <MapContent layers={combinedLayersByGroup} />

                {/* ✅ CORRECCIÓN: pasa swipeActive para inhibir queryPixelValue mientras swipe está activo */}
                <MapClickHandler onMapClick={handleMapClick} swipeActive={swipeActive} />

                {swipeActive && swipeLeft && swipeRight && (
                    <SwipeControl
                        leftLayer={swipeLeft}
                        rightLayer={swipeRight}
                        onClose={handleSwipeDeactivate}
                    />
                )}

                {RASTER_SERIES.map((serie, index) => {
                    const serieConfig = layerIndexRef.current.get(serie.id);
                    const groupName = serieConfig?.group;
                    let wmsUrl = config.qgisServer.wmsRasterUrl;

                    if (groupName && grupos && grupos.length > 0) {
                        const grupo = grupoIndexRef.current.get(groupName);
                        if (grupo && grupo.url_proyecto) {
                            wmsUrl = `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
                        }
                    }

                    return (
                        <MemoizedWMSTileLayer
                            key={`${serie.id}-${serie.timeValue}`}
                            isActive={activeLayers[serie.id] ?? false}
                            url={wmsUrl}
                            layers={serie.wmsLayer || 'usv_mosaico'}
                            format="image/png"
                            transparent={true}
                            opacity={opacityLayers[serie.id] ?? 0.8}
                            params={{
                                TIME: serie.timeValue,
                                TILED: true,
                            }}
                            zIndex={500 + index}
                            eventHandlers={{
                                tileerror: () => setWmsError(`Error cargando ${serie.name}`),
                                tileload: () => setWmsError(null)
                            }}
                        />
                    );
                })}

                {Object.entries(vectorLayers).map(([id, layer], index) => {
                    const cfg = layerIndexRef.current.get(id);
                    let wmsBaseUrl: string | undefined;
                    if (cfg?.group && grupos && grupos.length > 0) {
                        const grupo = grupoIndexRef.current.get(cfg.group);
                        if (grupo && grupo.url_proyecto) {
                            wmsBaseUrl = `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
                        }
                    }

                    // Cuando el swipe está activo, los ImageOverlay de puntos deben ir
                    // a los panes de overlay del swipe para recibir el clip correcto.
                    const swipePane =
                        swipeActive && swipeLeft?.id === id  ? 'swipe-left-overlay'  :
                        swipeActive && swipeRight?.id === id ? 'swipe-right-overlay' :
                        undefined;

                    return (
                        <MemoizedVectorLayer
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
                            wmsBaseUrl={wmsBaseUrl}
                            pane={swipePane}
                        />
                    );
                })}

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

                {externalLayers.map(ext => {
                    if (!externalVisible[ext.id]) return null;
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

                <Legend
                    activeLayers={activeLayers}
                    vectorLayers={vectorLayers as any}
                    grupos={grupos}
                />
            </MapContainer>

            {activeRasterLayersList.length > 0 && (
                <div className="active-series-indicator">
                    <span className="indicator-title">Series activas:</span>
                    {RASTER_SERIES.filter(s => activeLayers[s.id]).map(s => (
                        <span key={s.id} className="series-badge">
                            {s.name} ({s.year})
                        </span>
                    ))}
                    <div style={{ fontSize: '0.8rem', marginTop: '5px', opacity: 0.9 }}>
                        Haz clic en el mapa para consultar clasificación
                    </div>
                </div>
            )}

            {createPortal(
                <>
                    <button className="pd-fab" onClick={() => setPrintOpen(true)} title="Diseñador de impresión">
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" />
                            <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z" />
                        </svg>
                        Imprimir mapa
                    </button>

                    {printOpen && (
                        <Suspense fallback={<div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', zIndex: 9999, color: '#fff' }}>Cargando diseñador…</div>}>
                            <PrintDesigner
                                mapInstance={mapInstance}
                                allLayers={layerMenuData}
                                onClose={() => setPrintOpen(false)}
                            />
                        </Suspense>
                    )}
                </>,
                document.body
            )}
        </div>
    );
};

export default MapView;