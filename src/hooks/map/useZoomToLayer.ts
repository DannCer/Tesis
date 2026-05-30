/**
 * @fileoverview useZoomToLayer — hace fit del mapa a la extensión de una capa.
 *
 * Extraído de MapView para reducir su complejidad cognitiva.
 *
 * Estrategia de zoom (por orden de prioridad):
 *  1. Extent real desde QGIS Server (WFS GetFeature / WMS GetCapabilities)
 *  2. Bounds calculados del GeoJSON cargado en memoria (solo vectorial)
 *  3. Bounds estáticos definidos en LayerConfig
 *
 * También expone `autoZoomedVectorLayersRef` para que el llamador pueda
 * rastrear qué capas ya recibieron auto-zoom y evitar repetirlo.
 *
 * @module hooks/map/useZoomToLayer
 */

import { useCallback, useRef } from 'react';
import L from 'leaflet';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import { dynamicRasterService } from '@services/geoserver/dynamicRasterService';
import { wfsService } from '@services/geoserver/wfsService';
import { logger } from '@config/env';
import type { LayerConfig } from '@config/layers';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface UseZoomToLayerParams {
    mapInstance: L.Map | null;
    /** Ref con índice O(1) layerId → LayerConfig (creado por useLayerIndex) */
    layerIndexRef: React.RefObject<Map<string, LayerConfig>>;
}

interface UseZoomToLayerReturn {
    /**
     * Hace fitBounds al mapa apuntando a la extensión de la capa indicada.
     * Es async y gestiona todos los fallbacks internamente.
     */
    zoomToLayer: (layerId: string, type: 'vector' | 'raster', data?: unknown) => Promise<void>;
    /**
     * Set de IDs de capas que ya recibieron auto-zoom en esta sesión.
     * El llamador puede añadir/borrar IDs para controlar si se repite el zoom.
     */
    autoZoomedVectorLayersRef: React.RefObject<Set<string>>;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useZoomToLayer = ({
    mapInstance,
    layerIndexRef,
}: UseZoomToLayerParams): UseZoomToLayerReturn => {

    /** Capas que ya recibieron auto-zoom; evita repetir el fit en cada render. */
    const autoZoomedVectorLayersRef = useRef<Set<string>>(new Set());

    const zoomToLayer = useCallback(async (
        layerId: string,
        type: 'vector' | 'raster',
        data?: unknown
    ) => {
        if (!mapInstance) return;

        const layerCfg = layerIndexRef.current?.get(layerId);
        if (!layerCfg) return;

        const fitOpts: L.FitBoundsOptions = { padding: [20, 20] };

        if (type === 'vector') {
            const wfsName   = layerCfg.wfsName ?? layerCfg.id;
            const groupName = layerCfg.group;

            // 1. Extent desde QGIS Server
            const bounds = groupName
                ? await dynamicWfsService.getLayerExtent(wfsName, groupName).catch(() => null)
                : await wfsService.getLayerExtent(wfsName).catch(() => null);

            if (bounds) {
                mapInstance.fitBounds(bounds as L.LatLngBoundsExpression, fitOpts);
                return;
            }

            // 2. Bounds calculados del GeoJSON en memoria
            if (data) {
                try {
                    const gl = L.geoJSON(data as GeoJSON.GeoJsonObject);
                    const b  = gl.getBounds();
                    if (b.isValid()) {
                        mapInstance.fitBounds(b, fitOpts);
                        return;
                    }
                } catch (err) {
                    logger.error('Error al calcular bounds para zoom:', err);
                }
            }

            // 3. Bounds estáticos de LayerConfig
            if (layerCfg.bounds) {
                mapInstance.fitBounds(layerCfg.bounds as L.LatLngBoundsExpression, fitOpts);
            }

        } else {
            // Raster: extent desde QGIS Server o bounds estáticos
            const wmsLayer  = layerCfg.wmsLayer ?? 'usv_mosaico';
            const groupName = layerCfg.group;

            const bounds = groupName
                ? await dynamicRasterService.getLayerExtent(wmsLayer, groupName).catch(() => null)
                : null;

            if (bounds) {
                mapInstance.fitBounds(bounds as L.LatLngBoundsExpression, fitOpts);
            } else if (layerCfg.bounds) {
                mapInstance.fitBounds(layerCfg.bounds as L.LatLngBoundsExpression, fitOpts);
            }
        }
    }, [mapInstance, layerIndexRef]);

    return { zoomToLayer, autoZoomedVectorLayersRef };
};
