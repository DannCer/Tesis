/**
 * GeoRasterLayerComponent.tsx
 * Renderiza un GeoTIFF local en Leaflet usando georaster-layer-for-leaflet.
 *
 * Dependencias: npm install georaster georaster-layer-for-leaflet
 */

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import type L from 'leaflet';

interface GeoRasterLayerProps {
    georaster: unknown;
    opacity?: number;
    resolution?: number;
    layerId?: string;
}

// Pane dedicado — z-index 450 queda sobre el mapa base (tilePane = 200)
const PANE_NAME   = 'georasterPane';
const PANE_ZINDEX = 450;

const GeoRasterLayerComponent: React.FC<GeoRasterLayerProps> = ({
    georaster,
    opacity = 0.8,
    resolution = 256,
}) => {
    const map      = useMap();
    const layerRef = useRef<L.Layer | null>(null);

    useEffect(() => {
        if (!georaster) return;
        let mounted = true;

        const addLayer = async () => {
            let GeoRasterLayer: new (opts: unknown) => L.Layer;
            try {
                const mod = await import('georaster-layer-for-leaflet');
                GeoRasterLayer = (mod.default ?? mod) as typeof GeoRasterLayer;
            } catch {
                console.error('[GeoRasterLayer] Ejecuta: npm install georaster georaster-layer-for-leaflet');
                return;
            }
            if (!mounted) return;

            // Limpiar capa anterior
            if (layerRef.current) {
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }

            // Crear pane dedicado con z-index mayor al mapa base (solo si no existe)
            if (!map.getPane(PANE_NAME)) {
                map.createPane(PANE_NAME);
            }
            const paneEl = map.getPane(PANE_NAME);
            if (paneEl) paneEl.style.zIndex = String(PANE_ZINDEX);

            const layer = new GeoRasterLayer({
                georaster,
                opacity,
                resolution,
                pane: PANE_NAME,  // ← clave: pane propio sobre el mapa base
            });

            layer.addTo(map);
            layerRef.current = layer;

            // Zoom automático al extent del raster
            try {
                const g = georaster as any;
                if (g.xmin !== undefined) {
                    const Leaflet = (await import('leaflet')).default;
                    const bounds  = Leaflet.latLngBounds([g.ymin, g.xmin], [g.ymax, g.xmax]);
                    if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
                }
            } catch { /* sin zoom */ }
        };

        addLayer();

        return () => {
            mounted = false;
            if (layerRef.current) {
                map.removeLayer(layerRef.current);
                layerRef.current = null;
            }
        };
    }, [georaster, map, opacity, resolution]);

    // Actualizar opacidad sin re-montar la capa
    useEffect(() => {
        const layer = layerRef.current as unknown as { setOpacity?: (o: number) => void } | null;
        if (layer?.setOpacity) layer.setOpacity(opacity);
    }, [opacity]);

    return null;
};

export default GeoRasterLayerComponent;
