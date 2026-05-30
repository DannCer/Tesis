/**
 * @fileoverview useMapPanelsState — visibilidad de los paneles de UI del mapa.
 *
 * Extraído de MapView.tsx. Centraliza el estado abierto/cerrado de los 5
 * paneles de la interfaz del Geovisor que MapView coordina.
 * Ninguno de estos booleanos afecta la lógica GIS — son estado de UI puro.
 *
 * @module hooks/map/useMapPanelsState
 */

import { useState, useCallback } from 'react';

export interface UseMapPanelsStateReturn {
    printOpen:          boolean;
    legendOpen:         boolean;
    layerMenuCollapsed: boolean;
    swipePanelOpen:     boolean;
    dynamicTableOpen:   boolean;

    setPrintOpen:           (open: boolean) => void;
    setSwipePanelOpen:      (open: boolean) => void;
    handleToggleLegend:     () => void;
    handleCollapseToggle:   () => void;
    handleToggleSwipePanel: () => void;
    setDynamicTableOpen:    (open: boolean) => void;
}

export function useMapPanelsState(): UseMapPanelsStateReturn {
    const [printOpen,          setPrintOpen]          = useState(false);
    const [legendOpen,         setLegendOpen]         = useState(false);
    const [layerMenuCollapsed, setLayerMenuCollapsed] = useState(false);
    const [swipePanelOpen,     setSwipePanelOpen]     = useState(false);
    const [dynamicTableOpen,   setDynamicTableOpen]   = useState(false);

    const handleToggleLegend     = useCallback(() => setLegendOpen(o => !o), []);
    const handleCollapseToggle   = useCallback(() => setLayerMenuCollapsed(c => !c), []);
    const handleToggleSwipePanel = useCallback(() => setSwipePanelOpen(o => !o), []);

    return {
        printOpen,
        legendOpen,
        layerMenuCollapsed,
        swipePanelOpen,
        dynamicTableOpen,
        setPrintOpen,
        setSwipePanelOpen,
        handleToggleLegend,
        handleCollapseToggle,
        handleToggleSwipePanel,
        setDynamicTableOpen,
    };
}
