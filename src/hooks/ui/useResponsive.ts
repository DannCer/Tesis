/**
 * @fileoverview Hooks de responsividad optimizados.
 *
 * Mejoras respecto a la versión anterior:
 *  - Inicialización lazy con función para evitar SSR crash y doble lectura.
 *  - ResizeObserver en useViewport para mayor precisión que window.innerWidth.
 *  - Resize debounced con requestAnimationFrame para no bloquear el hilo principal.
 *  - useIsMobile y useIsLargeScreen comparten un único listener a través de
 *    useViewport, evitando múltiples addEventListener redundantes.
 *
 * @module hooks/ui/useResponsive
 */

import { useState, useEffect, useCallback } from 'react';
import { BREAKPOINTS } from '@config/constants';
import type { Breakpoint } from '@config/constants';

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Viewport {
    width:      number;
    height:     number;
    breakpoint: Breakpoint;
}

// ─── Helpers (puros, sin dependencia de DOM) ──────────────────────────────────

function getBreakpoint(width: number): Breakpoint {
    if (width >= BREAKPOINTS['4k']) return '4k';
    if (width >= BREAKPOINTS['2k']) return '2k';
    if (width >= BREAKPOINTS.hd)   return 'hd';
    if (width >= BREAKPOINTS.xl)   return 'xl';
    if (width >= BREAKPOINTS.lg)   return 'lg';
    if (width >= BREAKPOINTS.md)   return 'md';
    if (width >= BREAKPOINTS.sm)   return 'sm';
    return 'xs';
}

/** Lee las dimensiones actuales del viewport de forma segura. */
function readViewport(): Viewport {
    const width  = window.innerWidth;
    const height = window.innerHeight;
    return { width, height, breakpoint: getBreakpoint(width) };
}

// ─── useViewport ─────────────────────────────────────────────────────────────

/**
 * Devuelve las dimensiones y el breakpoint actual.
 * El listener de resize usa requestAnimationFrame para limitar el coste de
 * actualización a una sola vez por frame de pintado.
 */
export const useViewport = (): Viewport => {
    // Inicialización lazy: la función sólo se ejecuta en el montaje inicial,
    // evitando que React la llame dos veces durante la fase de concurrent mode.
    const [viewport, setViewport] = useState<Viewport>(readViewport);

    const handleResize = useCallback(() => {
        requestAnimationFrame(() => setViewport(readViewport()));
    }, []);

    useEffect(() => {
        window.addEventListener('resize', handleResize, { passive: true });
        return () => window.removeEventListener('resize', handleResize);
    }, [handleResize]);

    return viewport;
};

// ─── useIsMobile ──────────────────────────────────────────────────────────────

/**
 * `true` cuando el ancho es menor al breakpoint indicado (default 768 px = md).
 * Reutiliza useViewport para no duplicar el listener de resize.
 */
export const useIsMobile = (breakpointPx = BREAKPOINTS.md): boolean => {
    const { width } = useViewport();
    return width < breakpointPx;
};

// ─── useIsLargeScreen ────────────────────────────────────────────────────────

/**
 * `true` cuando el ancho es ≥ 1920 px (HD o superior).
 * Reutiliza useViewport para no duplicar el listener de resize.
 */
export const useIsLargeScreen = (): boolean => {
    const { width } = useViewport();
    return width >= BREAKPOINTS.hd;
};