/**
 * @fileoverview useSwipeState — estado del comparador de capas por deslizamiento.
 *
 * Extraído de MapView.tsx. Encapsula los tres valores de estado del swipe
 * y sus dos handlers de activación/desactivación.
 *
 * @module hooks/map/useSwipeState
 */

import { useState, useCallback } from 'react';
import type { SwipeLayerConfig } from '@components/map/controls/SwipeControl';

export interface UseSwipeStateReturn {
    swipeActive: boolean;
    swipeLeft:   SwipeLayerConfig | null;
    swipeRight:  SwipeLayerConfig | null;
    handleSwipeActivate:   (left: SwipeLayerConfig, right: SwipeLayerConfig) => void;
    handleSwipeDeactivate: () => void;
}

export function useSwipeState(): UseSwipeStateReturn {
    const [swipeActive, setSwipeActive] = useState(false);
    const [swipeLeft,   setSwipeLeft]   = useState<SwipeLayerConfig | null>(null);
    const [swipeRight,  setSwipeRight]  = useState<SwipeLayerConfig | null>(null);

    const handleSwipeActivate = useCallback((
        left:  SwipeLayerConfig,
        right: SwipeLayerConfig,
    ) => {
        setSwipeLeft(left);
        setSwipeRight(right);
        setSwipeActive(true);
    }, []);

    const handleSwipeDeactivate = useCallback(() => {
        setSwipeActive(false);
        setSwipeLeft(null);
        setSwipeRight(null);
    }, []);

    return {
        swipeActive,
        swipeLeft,
        swipeRight,
        handleSwipeActivate,
        handleSwipeDeactivate,
    };
}
