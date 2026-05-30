/**
 * @fileoverview useExternalLayers — gestión de capas cargadas externamente
 * por el usuario (shapefiles, GeoJSON, GeoTIFFs locales).
 *
 * Extraído de MapView.tsx para reducir su complejidad cognitiva.
 * Encapsula el estado de las tres dimensiones de una capa externa:
 * presencia, visibilidad y opacidad.
 *
 * @module hooks/map/useExternalLayers
 */

import { useState, useCallback } from 'react';
import L from 'leaflet';
import type { ExternalLayer } from '@types/geo';

export interface UseExternalLayersReturn {
    externalLayers:  ExternalLayer[];
    externalVisible: Record<string, boolean>;
    externalOpacity: Record<string, number>;
    handleAddExternalLayer:     (layer: ExternalLayer, mapInstance: L.Map | null) => void;
    handleRemoveExternalLayer:  (id: string) => void;
    handleToggleExternalLayer:  (id: string, visible: boolean) => void;
    handleExternalOpacityChange:(id: string, opacity: number) => void;
}

export function useExternalLayers(): UseExternalLayersReturn {
    const [externalLayers,  setExternalLayers]  = useState<ExternalLayer[]>([]);
    const [externalVisible, setExternalVisible] = useState<Record<string, boolean>>({});
    const [externalOpacity, setExternalOpacity] = useState<Record<string, number>>({});

    const handleAddExternalLayer = useCallback((
        layer: ExternalLayer,
        mapInstance: L.Map | null,
    ) => {
        setExternalLayers(prev => [...prev, layer]);
        setExternalVisible(prev => ({ ...prev, [layer.id]: true }));
        setExternalOpacity(prev => ({ ...prev, [layer.id]: 0.8 }));

        // Hacer zoom automático al extent de la capa recién añadida
        if (layer.geojsonData && mapInstance) {
            try {
                const gl     = L.geoJSON(layer.geojsonData);
                const bounds = gl.getBounds();
                if (bounds.isValid()) mapInstance.fitBounds(bounds, { padding: [30, 30] });
            } catch { /* bounds inválidos — ignorar */ }
        }
    }, []);

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

    return {
        externalLayers,
        externalVisible,
        externalOpacity,
        handleAddExternalLayer,
        handleRemoveExternalLayer,
        handleToggleExternalLayer,
        handleExternalOpacityChange,
    };
}
