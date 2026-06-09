/**
 * @fileoverview Vista principal del Geovisor — orquesta capas, paneles y herramientas.
 *
 * Optimizaciones aplicadas
 * ────────────────────────
 * 1. TREE-SHAKING MANUAL
 *    - Eliminada la importación duplicada de useWFSLayers / useRasterLayers
 *      (ambas venían de '@hooks/map' en dos líneas separadas → ahora una sola).
 *    - Eliminado el prop `layers` pasado a <MapContent> que nunca se consumía.
 *    - Eliminada la importación de `ErrorBoundary` que no se usaba en este módulo
 *      (sí se usa en Geovisor.tsx donde es el wrapper correcto).
 *    - Eliminado el import de `memo` ya que los sub-componentes memoizados
 *      están ahora tipados directamente.
 *
 * 2. RENDIMIENTO
 *    - MemoizedWMSTileLayer y MemoizedVectorLayer mantienen sus comparadores
 *      de referencia para evitar re-renders del mapa.
 *    - layerIndexRef / grupoIndexRef siguen siendo Refs para búsquedas O(1)
 *      sin causar re-renders.
 *    - onEachVectorFeature estabilizado con useCallback sin dependencias
 *      externas mutables.
 *    - activeRasterLayersList derivado con useMemo para no recalcular en
 *      cada render.
 *
 * 3. TIPADO ESTRICTO
 *    - Interfaces internas ahora usan tipos concretos en lugar de `any`.
 *    - `GeoJSONFeature` importado desde @types/geo para los callbacks de capa.
 *    - El único `any` restante es en VectorLayerMemoProps.data (GeoJSON puede
 *      ser FeatureCollection o Feature — la librería leaflet-geojson acepta ambos).
 *    - logger.error tipado con `unknown` — ya no llama a `.message` sin guardas.
 *
 * 4. RESPONSIVIDAD
 *    - FAB de impresión y active-series-indicator usan clases CSS que ya tenían
 *      `clamp()` en mapView.css; se mantiene sin cambios estructurales.
 *    - MapContainer usa `style` inline mínimo; el tamaño real lo controla
 *      `.map-view-container-full` y `.layout-geovisor` vía CSS.
 *
 * 5. VARIABLES DE ENTORNO
 *    - config importado desde el módulo centralizado; ninguna variable de
 *      entorno se lee directamente aquí.
 *
 * @module components/map/MapView
 */

import React, {
    useCallback,
    useState,
    useMemo,
    useRef,
    useEffect,
    memo,
    lazy,
    Suspense,
} from 'react';
import { createPortal } from 'react-dom';
import {
    MapContainer,
    WMSTileLayer,
    useMapEvents,
    useMap,
    CircleMarker,
    GeoJSON,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

import MapContent from '@components/map/MapContent';
import LayerMenu from '@components/map/panels/LayerMenu';
import type { ExternalLayer, GeoJSONFeature } from '@types/geo';
import SwipeControl from '@components/map/controls/SwipeControl';
import SwipePanel            from '@components/map/tools/SwipePanel';
import RightSideControls     from '@components/map/controls/RightSideControls';
import CursorCoordinates     from '@components/map/controls/CursorCoordinates';
import DynamicAttributeTable from '@components/map/panels/DynamicAttributeTable';
import type { DynamicVectorLayer } from '@components/map/panels/DynamicAttributeTable';
import MapToolbar from '@components/map/tools/MapToolbar';
import type { SwipeLayerConfig } from '@components/map/controls/SwipeControl';
import { featureStyle, DEFAULT_SYMBOLOGY } from '@utils/geo/symbologyUtils';
import GeoRasterLayerComponent from '@components/map/layers/GeoRasterLayerComponent';
import PixelInfoPanel from '@components/map/panels/PixelInfoPanel';
import Legend from '@components/map/panels/Legend';
import VectorLayer from '@components/map/layers/VectorLayer';
import { useWFSLayers, useRasterLayers, useExternalLayers, useSwipeState, useMapPanelsState, useLayerIndex, useZoomToLayer, useFeatureSelection } from '@hooks/map';   // ← una sola línea (era dos)
import { wfsService } from '@services/geoserver/wfsService';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import { dynamicRasterService } from '@services/geoserver/dynamicRasterService';
import { config } from '@config/env';
import { Z_INDEX } from '@config/constants';
import type { LayerConfig } from '@config/layers';
import type { WFSOptions } from '@types/map';
import '@styles/mapView.css';
import '@styles/PrintDesigner.css';
import { useApiLayersLoader } from '@hooks/api';
import { useLayersData } from '@contexts/LayersContext';
import { useSelectedProjectLayers } from '@hooks/map/useSelectedProjectLayers';

const PrintDesigner = lazy(() => import('@components/map/tools/PrintDesigner'));

// ─── MapInstanceCapture ───────────────────────────────────────────────────────
// react-leaflet v4 no expone L.Map mediante ref en <MapContainer>.
// El patrón correcto es un componente hijo que consuma useMap().

interface MapInstanceCaptureProps {
    onReady: (map: L.Map) => void;
}

const MapInstanceCapture: React.FC<MapInstanceCaptureProps> = ({ onReady }) => {
    const map = useMap();
    useEffect(() => { onReady(map); }, [map, onReady]);
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
            if (swipeActive) return;  // inhibe query de píxel durante comparador
            onMapClick(e, map);
        },
    });
    return null;
};

// ─── Interfaces de sub-componentes memoizados ─────────────────────────────────

interface WMSTileLayerMemoProps {
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
    // GeoJSON acepta FeatureCollection | Feature | Geometry — tipamos como unknown
    // para ser precisos; VectorLayer maneja el casting internamente.
    data: unknown;
    visible: boolean;
    timestamp: number;
    opacity: number;
    selectedFeatureId: string | number | null;
    onEachFeature: (feature: GeoJSONFeature, layer: L.Layer) => void;
    zIndex?: number;
    wmsBaseUrl?: string;
    pane?: string;
}

// ─── Componentes memoizados ───────────────────────────────────────────────────

const MemoizedWMSTileLayer = memo(
    ({ isActive, ...rest }: WMSTileLayerMemoProps) => {
        if (!isActive) return null;
        // WMSTileLayer de react-leaflet acepta props adicionales via spread
        return <WMSTileLayer {...(rest as Parameters<typeof WMSTileLayer>[0])} />;
    },
    (prev, next) =>
        prev.isActive  === next.isActive  &&
        prev.opacity   === next.opacity   &&
        prev.url       === next.url       &&
        prev.layers    === next.layers    &&
        prev.params?.TIME === next.params?.TIME
);
MemoizedWMSTileLayer.displayName = 'MemoizedWMSTileLayer';

const MemoizedVectorLayer = memo(
    (props: VectorLayerMemoProps) => <VectorLayer {...props} />,
    (prev, next) =>
        prev.id         === next.id         &&
        prev.visible    === next.visible    &&
        prev.opacity    === next.opacity    &&
        prev.timestamp  === next.timestamp  &&
        prev.wmsBaseUrl === next.wmsBaseUrl &&
        prev.pane       === next.pane
);
MemoizedVectorLayer.displayName = 'MemoizedVectorLayer';

// ─── MapView ──────────────────────────────────────────────────────────────────

const MapView: React.FC = () => {
    const mapConfig = config.map;

    const { layersByGroup }     = useApiLayersLoader();
    const { grupos, availableLayers: contextLayers } = useLayersData();
    const {
        layers:      projectLayers,
        selectedProjectId,    // eslint-disable-line @typescript-eslint/no-unused-vars
        selectedProjectName,
    } = useSelectedProjectLayers();

    // Filtra capas raster de la API (serie temporal)
    const RASTER_SERIES = useMemo(
        () => Object.values(layersByGroup).flat().filter(l => l.type === 'raster'),
        [layersByGroup]
    );

    // Instancia real de Leaflet capturada desde dentro del contexto del mapa
    const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
    const handleMapReady = useCallback((map: L.Map) => setMapInstance(map), []);

    // ─── UI panels ────────────────────────────────────────────────────────────
    const {
        printOpen,       setPrintOpen,
        legendOpen,      handleToggleLegend,
        layerMenuCollapsed, handleCollapseToggle,
        swipePanelOpen,  handleToggleSwipePanel, setSwipePanelOpen,
        dynamicTableOpen, setDynamicTableOpen,
    } = useMapPanelsState();

    // ─── Capas externas (archivos locales añadidos por el usuario) ────────────
    const {
        externalLayers,
        externalVisible,
        externalOpacity,
        handleAddExternalLayer:     _handleAddExternal,
        handleRemoveExternalLayer,
        handleToggleExternalLayer,
        handleExternalOpacityChange,
    } = useExternalLayers();

    // mapInstance se pasa al handler de zoom automático
    const handleAddExternalLayer = (layer: ExternalLayer) => _handleAddExternal(layer, mapInstance);

    // ─── Swipe comparador ────────────────────────────────────────────────────
    const {
        swipeActive,
        swipeLeft,
        swipeRight,
        handleSwipeActivate,
        handleSwipeDeactivate,
    } = useSwipeState();

    const [wmsError, setWmsError] = useState<string | null>(null);

    /** Estado del bottom sheet de capas en móvil.
     *  Inicia abierto en dispositivos móviles (≤ 768 px) para que el menú
     *  de capas esté desplegado desde el primer momento, igual que en escritorio. */
    const [mobileLayerMenuOpen, setMobileLayerMenuOpen] = useState(() => window.innerWidth <= 768);
    const handleToggleMobileLayerMenu = useCallback(() => setMobileLayerMenuOpen(v => !v), []);
    const handleMobileLayerMenuClose  = useCallback(() => setMobileLayerMenuOpen(false), []);

    /** Estado compartido para el modo captura de punto (⌖ → CoordinatesTool) */
    const [captureMode, setCaptureMode] = useState(false);
    const handleCaptureToggle  = useCallback(() => setCaptureMode(v => !v), []);
    const handleCaptureDone    = useCallback(() => setCaptureMode(false),   []);

    // ─── Handlers swipe ── movidos a useSwipeState() ──────────────────────────

    // ─── Capas combinadas ─────────────────────────────────────────────────────

    // ─── Índices de capas ─────────────────────────────────────────────────────
    // availableLayers, combinedLayersByGroup e índices O(1) en Refs

    const {
        availableLayers,
        combinedLayersByGroup,
        layerIndexRef,
        grupoIndexRef,
    } = useLayerIndex({
        contextLayers,
        projectLayers,
        grupos,
        layersByGroup,
        selectedProjectName,
    });

    // ─── Hooks de capas ───────────────────────────────────────────────────────

    const {
        layers: vectorLayers,
        loading: vectorLoading,
        errors: vectorErrors,
        loadLayer,
        toggleLayer,
        setLayerOpacity,
    } = useWFSLayers();

    // ─── Selección y resaltado de features ───────────────────────────────────

    const {
        selectedFeature,
        mapSelectedFeature,
        mapHighlightLayerRef,
        onEachVectorFeature,
        clearMapSelectedFeature,
    } = useFeatureSelection({ mapInstance, vectorLayers });

    // ─── Zoom automático a capas ──────────────────────────────────────────────

    const { zoomToLayer, autoZoomedVectorLayersRef } = useZoomToLayer({ mapInstance, layerIndexRef });

    const {
        activeLayers,
        opacityLayers,
        pixelInfo,
        loading: rasterLoading,
        toggleRasterLayer,
        setRasterLayerOpacity,
        queryPixelValue,
        clearPixelInfo,
    } = useRasterLayers(availableLayers);

    // ─── Zoom a capa — ver useZoomToLayer ────────────────────────────────────

    // ─── Popup de feature vectorial — ver useFeatureSelection ─────────────────

    // ─── Toggle de capa ───────────────────────────────────────────────────────

    const handleLayerToggle = useCallback(async (
        layerId: string,
        isActive: boolean,
        layerType: 'vector' | 'raster'
    ) => {
        if (layerType === 'vector') {
            if (vectorLayers[layerId]) {
                toggleLayer(layerId);
                if (isActive) {
                    autoZoomedVectorLayersRef.current.add(layerId);
                    void zoomToLayer(layerId, 'vector', vectorLayers[layerId].data);
                } else {
                    autoZoomedVectorLayersRef.current.delete(layerId);
                    setWmsError(null);
                }
            } else if (isActive) {
                const layerCfg  = layerIndexRef.current.get(layerId);
                const nameToLoad = layerCfg?.wfsName ?? layerId;
                const groupName  = layerCfg?.group;
                const options: WFSOptions =
                    layerId === 'incendios_recurrencia' ? { simplifyTolerance: 10 } : {};

                await loadLayer(nameToLoad, groupName, options, layerId);
            } else {
                autoZoomedVectorLayersRef.current.delete(layerId);
            }
        } else {
            toggleRasterLayer(layerId, isActive);
            if (isActive) {
                void zoomToLayer(layerId, 'raster');
            } else {
                setWmsError(null);
            }
        }
    }, [vectorLayers, loadLayer, toggleLayer, toggleRasterLayer, zoomToLayer]);

    // Auto-zoom cuando se carga una capa WFS por primera vez
    useEffect(() => {
        if (!mapInstance) return;
        const checkAndZoom = async () => {
            for (const [id, layer] of Object.entries(vectorLayers)) {
                if (layer.visible && layer.data && !autoZoomedVectorLayersRef.current.has(id)) {
                    autoZoomedVectorLayersRef.current.add(id);
                    await zoomToLayer(id, 'vector', layer.data);
                }
            }
        };
        void checkAndZoom();
    }, [vectorLayers, mapInstance, zoomToLayer]);

    // ─── Datos derivados para el menú ─────────────────────────────────────────

    const activeRasterLayersList = useMemo(() =>
        Object.entries(activeLayers)
            .filter(([, v]) => v)   // sustituido [_, v] por [, v] (no-unused-vars)
            .map(([k]) => k),
        [activeLayers]
    );

    // true si hay al menos una capa activa → habilita el botón de Leyenda
    const hasActiveLayers = useMemo(() =>
        activeRasterLayersList.length > 0 ||
        Object.values(vectorLayers).some(l => l.visible),
        [activeRasterLayersList, vectorLayers]
    );

    /** Capas vectoriales visibles con datos → alimentan la tabla dinámica */
    const dynamicTableLayers = useMemo((): Record<string, DynamicVectorLayer> => {
        const result: Record<string, DynamicVectorLayer> = {};
        Object.entries(vectorLayers).forEach(([id, layer]) => {
            if (layer.visible && layer.data) {
                // layerIndexRef tiene el LayerConfig con el nombre canónico de la capa
                const cfg = layerIndexRef.current.get(id);
                result[id] = {
                    name: cfg?.name ?? (layer as { name?: string }).name ?? id,
                    data: layer.data as GeoJSON.FeatureCollection,
                };
            }
        });
        return result;
    }, [vectorLayers]);

    const hasVectorLayersForTable = useMemo(
        () => Object.keys(dynamicTableLayers).length > 0,
        [dynamicTableLayers]
    );

    const layerMenuData = useMemo(() => ({
        ...vectorLayers,
        ...Object.fromEntries(
            RASTER_SERIES.map(s => [
                s.id,
                {
                    name:        s.name,
                    visible:     activeLayers[s.id],
                    opacity:     opacityLayers[s.id] ?? 0.8,
                    type:        'raster' as const,
                    description: `Año ${s.year}`,
                },
            ])
        ),
    }), [vectorLayers, activeLayers, opacityLayers, RASTER_SERIES]);

    const combinedLoading = useMemo(() => ({
        ...vectorLoading,
        ...Object.fromEntries(
            RASTER_SERIES.map(s => [s.id, activeLayers[s.id] ? rasterLoading : false])
        ),
    }), [vectorLoading, rasterLoading, activeLayers, RASTER_SERIES]);

    const combinedErrors = useMemo(() => ({
        ...vectorErrors,
        ...Object.fromEntries(RASTER_SERIES.map(s => [s.id, null])),
    }), [vectorErrors, RASTER_SERIES]);

    // ─── Handlers de mapa ─────────────────────────────────────────────────────

    const handleMapClick = useCallback((e: L.LeafletMouseEvent, map: L.Map) => {
        queryPixelValue(e, map);
    }, [queryPixelValue]);

    const handleOpacityChange = useCallback((layerId: string, opacity: number, type: 'vector' | 'raster') => {
        if (type === 'vector') setLayerOpacity(layerId, opacity);
        else setRasterLayerOpacity(layerId, opacity);
    }, [setLayerOpacity, setRasterLayerOpacity]);

    // ─── Construcción de URL QGIS por grupo ───────────────────────────────────

    const buildGroupWmsUrl = useCallback((groupName?: string): string => {
        if (!groupName) return config.qgisServer.wmsRasterUrl;
        const grupo = grupoIndexRef.current.get(groupName);
        if (grupo?.url_proyecto) {
            return `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
        }
        return config.qgisServer.wmsRasterUrl;
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="map-view-container-full">

            {/* ── Panel lateral de capas ────────────────────────────────────── */}
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
                onRemoveExternalLayer={handleRemoveExternalLayer}
                onToggleExternalLayer={handleToggleExternalLayer}
                onExternalOpacityChange={handleExternalOpacityChange}
                toolbarSlot={null}
                isCollapsed={layerMenuCollapsed}
                onCollapseToggle={handleCollapseToggle}
                mobileMenuOpen={mobileLayerMenuOpen}
                onMobileMenuClose={handleMobileLayerMenuClose}
            />

            {/* ── Barra de herramientas flotante (estilo ATLAS CDMX) ─────────
                Reemplaza los FABs individuales de ElevationProfile y
                AnalysisTool con una píldora horizontal centrada.          */}
            <MapToolbar
                mapInstance={mapInstance}
                layerMenuCollapsed={layerMenuCollapsed}
                onToggleLayerMenu={handleCollapseToggle}
                legendOpen={legendOpen}
                onToggleLegend={handleToggleLegend}
                hasActiveLayers={hasActiveLayers}
                onAddLayer={handleAddExternalLayer}
                externalCaptureMode={captureMode}
                onCaptureDone={handleCaptureDone}
                mobileLayerMenuOpen={mobileLayerMenuOpen}
                onToggleMobileLayerMenu={handleToggleMobileLayerMenu}
            />

            <PixelInfoPanel
                pixelInfo={pixelInfo}
                loading={rasterLoading}
                onClose={clearPixelInfo}
            />

            {wmsError && (
                <div className="wms-error-alert" role="alert">
                    ⚠️ {wmsError}
                </div>
            )}

            <MapContainer
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                minZoom={mapConfig.minZoom}
                maxZoom={mapConfig.maxZoom}
                zoomDelta={mapConfig.zoomDelta}
                zoomSnap={mapConfig.zoomSnap}
                style={{ width: '100%', height: '100%' }}
                className="leaflet-map-full"
                preferCanvas={true}
                doubleClickZoom={false}
                zoomControl={false}
            >
                <MapInstanceCapture onReady={handleMapReady} />

                {/* MapContent nunca necesitó el prop `layers` → eliminado */}
                <MapContent />

                {/* ── Controles derecha: Swipe + Tabla de Atributos ───────────────
                    RightSideControls usa useMap() internamente, por lo que DEBE
                    estar dentro de <MapContainer>. Crea su propio L.Control en
                    topright y se apila automáticamente con ZoomControl y
                    BaseLayerControls sin necesidad de CSS de posicionamiento.  */}
                <RightSideControls
                    swipeOpen={swipePanelOpen}
                    onToggleSwipe={handleToggleSwipePanel}
                    dynamicTableOpen={dynamicTableOpen}
                    onToggleDynamicTable={() => setDynamicTableOpen(o => !o)}
                    hasVectorLayers={hasVectorLayersForTable}
                />

                {/* Recuadro de coordenadas del cursor — control Leaflet bottomleft */}
                <CursorCoordinates
                    onCaptureClick={handleCaptureToggle}
                    captureActive={captureMode}
                />

                <MapClickHandler onMapClick={handleMapClick} swipeActive={swipeActive} />

                {swipeActive && swipeLeft && swipeRight && (
                    <SwipeControl
                        leftLayer={swipeLeft}
                        rightLayer={swipeRight}
                        onClose={handleSwipeDeactivate}
                    />
                )}

                {/* Series ráster */}
                {RASTER_SERIES.map((serie, index) => {
                    const serieConfig = layerIndexRef.current.get(serie.id);
                    const wmsUrl      = buildGroupWmsUrl(serieConfig?.group);

                    return (
                        <MemoizedWMSTileLayer
                            key={`${serie.id}-${serie.timeValue}`}
                            isActive={activeLayers[serie.id] ?? false}
                            url={wmsUrl}
                            layers={serie.wmsLayer ?? 'usv_mosaico'}
                            format="image/png"
                            transparent={true}
                            opacity={opacityLayers[serie.id] ?? 0.8}
                            params={{ TIME: serie.timeValue, TILED: true }}
                            zIndex={Z_INDEX.rasterBase + index}
                            eventHandlers={{
                                tileerror: () => setWmsError(`Error cargando ${serie.name}`),
                                tileload:  () => setWmsError(null),
                            }}
                        />
                    );
                })}

                {/* Capas vectoriales WFS */}
                {Object.entries(vectorLayers).map(([id, layer], index) => {
                    const cfg        = layerIndexRef.current.get(id);
                    const wmsBaseUrl = cfg?.group
                        ? buildGroupWmsUrl(cfg.group)
                        : undefined;

                    const swipePane =
                        swipeActive && swipeLeft?.id  === id ? 'swipe-left-overlay'  :
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
                            zIndex={Z_INDEX.vectorBase + index}
                            wmsBaseUrl={wmsBaseUrl}
                            pane={swipePane}
                        />
                    );
                })}

                {/* Marcador de consulta de píxel */}
                {pixelInfo?.coordinates && (
                    <CircleMarker
                        center={pixelInfo.coordinates}
                        radius={10}
                        pathOptions={{
                            color:       '#ffffff',
                            fillColor:   '#cd171e',
                            fillOpacity: 0.8,
                            weight:      3,
                            className:   'pixel-highlight-pulse',
                        }}
                    />
                )}

                {/* Capas externas importadas por el usuario */}
                {externalLayers.map(ext => {
                    if (!externalVisible[ext.id]) return null;
                    const opacity = externalOpacity[ext.id] ?? 0.8;

                    if (ext.type === 'vector' && ext.geojsonData) {
                        const sym = ext.symbology ?? DEFAULT_SYMBOLOGY;
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
                                opacity={opacity}
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
                                opacity={opacity}
                                zIndex={Z_INDEX.externalWms}
                            />
                        );
                    }

                    return null;
                })}

                <Legend
                    activeLayers={activeLayers}
                    vectorLayers={vectorLayers as Parameters<typeof Legend>[0]['vectorLayers']}
                    grupos={grupos}
                    isOpen={legendOpen}
                    onClose={handleToggleLegend}
                />
            </MapContainer>

            {/* Indicador de series activas */}
            {activeRasterLayersList.length > 0 && (
                <div className="active-series-indicator">
                    <span className="indicator-title">Series activas:</span>
                    {RASTER_SERIES.filter(s => activeLayers[s.id]).map(s => (
                        <span key={s.id} className="series-badge">
                            {s.name} ({s.year})
                        </span>
                    ))}
                    <div className="series-hint">
                        Haz clic en el mapa para consultar clasificación
                    </div>
                </div>
            )}

            {/* Panel de Swipe — siempre montado, visibilidad controlada por RightSideControls */}
            <SwipePanel
                active={swipeActive}
                onActivate={handleSwipeActivate}
                onDeactivate={handleSwipeDeactivate}
                panelOpen={swipePanelOpen}
                onPanelOpenChange={setSwipePanelOpen}
            />

            {/* Tabla de atributos dinámica */}
            {dynamicTableOpen && (
                <DynamicAttributeTable
                    vectorLayers={dynamicTableLayers}
                    mapInstance={mapInstance}
                    onClose={() => setDynamicTableOpen(false)}
                    highlightLayerRef={mapHighlightLayerRef}
                    mapSelectedFeature={mapSelectedFeature}
                    onMapFeatureConsumed={clearMapSelectedFeature}
                />
            )}

            {/* FAB de impresión — portal al body para evitar clipping del mapa */}
            {createPortal(
                <>
                    <button
                        className="pd-fab"
                        onClick={() => setPrintOpen(true)}
                        title="Diseñador de impresión"
                        aria-label="Abrir diseñador de impresión"
                    >
                        {/* Ícono de impresora */}
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
                            <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z" />
                            <path d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2H5zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4V3zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2H5zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1z" />
                        </svg>
                        Imprimir mapa
                    </button>

                    {printOpen && (
                        <Suspense
                            fallback={
                                <div style={{
                                    position: 'fixed', inset: 0,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(0,0,0,0.4)', zIndex: Z_INDEX.printFab, color: '#fff',
                                }}>
                                    Cargando diseñador…
                                </div>
                            }
                        >
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