/**
 * @fileoverview useFeatureSelection — gestión de selección y resaltado de features.
 *
 * Extraído de MapView para reducir su complejidad cognitiva.
 *
 * Responsabilidades:
 *  - Crea y destruye la capa de resaltado Leaflet (GeoJSON sobre pane dedicado)
 *  - Mantiene el WeakMap feature → layerId para identificación O(1)
 *  - Expone onEachVectorFeature (callback de react-leaflet GeoJSON)
 *  - Estado de feature seleccionada y notificación a DynamicAttributeTable
 *
 * @module hooks/map/useFeatureSelection
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import type { GeoJSONFeature } from '@types/geo';

const HIGHLIGHT_PANE = 'map-highlight-pane';

const getHighlightColors = () => ({
    primary: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary').trim() || '#cd171e',
    dark: getComputedStyle(document.documentElement)
        .getPropertyValue('--color-primary-dark').trim() || '#691B31',
});

export interface MapSelectedFeature {
    layerId: string;
    feature: GeoJSON.Feature;
}

interface UseFeatureSelectionParams {
    mapInstance: L.Map | null;
    vectorLayers: Record<string, { data?: { features?: unknown[] } }>;
}

interface UseFeatureSelectionReturn {
    selectedFeature: string | number | null;
    mapSelectedFeature: MapSelectedFeature | null;
    onMapFeatureConsumed: () => void;
    /** Alias de onMapFeatureConsumed — permite destructuring con nombre local en MapView. */
    clearMapSelectedFeature: () => void;
    mapHighlightLayerRef: React.RefObject<L.GeoJSON | null>;
    onEachVectorFeature: (feature: GeoJSONFeature, layer: L.Layer) => void;
    clearSelection: () => void;
}

const POPUP_SKIP_KEYS = new Set(['bbox', 'geometry', 'the_geom', 'geom']);

const escapeHtml = (value: unknown): string => {
    const str = String(value ?? '—');
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
};

export const useFeatureSelection = ({
    mapInstance,
    vectorLayers,
}: UseFeatureSelectionParams): UseFeatureSelectionReturn => {

    const [selectedFeature,    setSelectedFeature]    = useState<string | number | null>(null);
    const [mapSelectedFeature, setMapSelectedFeature] = useState<MapSelectedFeature | null>(null);
    const mapHighlightLayerRef = useRef<L.GeoJSON | null>(null);
    const featureToLayerIdRef  = useRef<WeakMap<object, string>>(new WeakMap());

    // Reconstruir WeakMap cuando cambian las capas vectoriales
    useEffect(() => {
        const wm = new WeakMap<object, string>();
        Object.entries(vectorLayers).forEach(([id, layer]) => {
            (layer.data?.features ?? []).forEach((f: unknown) => {
                if (f && typeof f === 'object') wm.set(f as object, id);
            });
        });
        featureToLayerIdRef.current = wm;
    }, [vectorLayers]);

    // Crear / destruir la capa de resaltado
    useEffect(() => {
        if (!mapInstance) return;

        if (!mapInstance.getPane(HIGHLIGHT_PANE)) {
            const pane = mapInstance.createPane(HIGHLIGHT_PANE);
            pane.style.zIndex = '450';
            pane.style.pointerEvents = 'none';
        }

        const { primary, dark } = getHighlightColors();

        const hl = L.geoJSON(undefined, {
            pane: HIGHLIGHT_PANE,
            style: () => ({ color: dark, fillColor: primary, fillOpacity: 0.30, weight: 3, opacity: 1 }),
            pointToLayer: (_f, latlng) => L.circleMarker(latlng, {
                pane: HIGHLIGHT_PANE, radius: 10,
                color: dark, fillColor: primary, fillOpacity: 0.50, weight: 3,
            }),
        }).addTo(mapInstance);

        mapHighlightLayerRef.current = hl;
        return () => { hl.remove(); mapHighlightLayerRef.current = null; };
    }, [mapInstance]);

    const onEachVectorFeature = useCallback((feature: GeoJSONFeature, layer: L.Layer) => {
        const props = feature.properties ?? {};

        const nombre =
            props.NOMBRE    ?? props.nombre    ??
            props.Estado    ?? props.estado    ??
            props.Municipio ?? props.municipio ??
            props.Localidad ?? props.localidad ??
            props.NAME      ?? props.name      ?? 'Elemento';

        const rows = Object.entries(props)
            .filter(([k]) => !POPUP_SKIP_KEYS.has(k.toLowerCase()))
            .map(([k, v]) => `<tr>
                <td style="padding:5px 12px 5px 0;font-weight:600;color:#555;white-space:nowrap;vertical-align:top;font-size:13px">${escapeHtml(k)}</td>
                <td style="padding:5px 0;color:#222;font-size:13px;word-break:break-word">${escapeHtml(v)}</td>
            </tr>`).join('');

        const content = `
            <div style="font-family:'Roboto','Segoe UI',sans-serif;min-width:300px;max-width:440px">
                <div style="background:#8d1c3d;color:#fff;padding:10px 14px;margin:-13px -20px 10px;border-radius:4px 4px 0 0;font-size:15px;font-weight:600">
                    ${escapeHtml(nombre)}
                </div>
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
                const fid = feature.id ?? props.id ?? crypto.randomUUID();
                setSelectedFeature(fid as string | number);
                layer.openPopup(e.latlng);
                const hl = mapHighlightLayerRef.current;
                if (hl) { hl.clearLayers(); hl.addData(feature as GeoJSON.Feature); }
                const lid = featureToLayerIdRef.current.get(feature);
                if (lid) setMapSelectedFeature({ layerId: lid, feature: feature as GeoJSON.Feature });
            },
            popupclose: () => {
                setSelectedFeature(null);
                mapHighlightLayerRef.current?.clearLayers();
            },
        });
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedFeature(null);
        mapHighlightLayerRef.current?.clearLayers();
    }, []);

    return {
        selectedFeature,
        mapSelectedFeature,
        onMapFeatureConsumed: () => setMapSelectedFeature(null),
        clearMapSelectedFeature: () => setMapSelectedFeature(null),
        mapHighlightLayerRef,
        onEachVectorFeature,
        clearSelection,
    };
};
