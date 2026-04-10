/**
 * @fileoverview Hooks de responsividad.
 * Migrado desde styles/responsive-hooks.ts a su ubicación correcta en hooks/ui/.
 * @module hooks/ui/useResponsive
 */

import { useState, useEffect } from 'react';
import { BREAKPOINTS } from '@config/constants';
import type { Breakpoint } from '@config/constants';

export interface Viewport {
    width:      number;
    height:     number;
    breakpoint: Breakpoint;
}

function getBreakpoint(width: number): Breakpoint {
    if (width >= 3840) return '4k';
    if (width >= 2560) return '2k';
    if (width >= 1920) return 'hd';
    if (width >= 1200) return 'xl';
    if (width >= 992)  return 'lg';
    if (width >= 768)  return 'md';
    if (width >= 576)  return 'sm';
    return 'xs';
}

/** Dimensiones y breakpoint actual de la ventana. */
export const useViewport = (): Viewport => {
    const [viewport, setViewport] = useState<Viewport>({
        width:      window.innerWidth,
        height:     window.innerHeight,
        breakpoint: getBreakpoint(window.innerWidth),
    });

    useEffect(() => {
        const handleResize = () => setViewport({
            width:      window.innerWidth,
            height:     window.innerHeight,
            breakpoint: getBreakpoint(window.innerWidth),
        });
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return viewport;
};

/** `true` cuando el ancho es menor al breakpoint indicado (default 768px). */
export const useIsMobile = (breakpointPx = BREAKPOINTS.md): boolean => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < breakpointPx);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < breakpointPx);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [breakpointPx]);

    return isMobile;
};

/** `true` cuando el ancho es ≥ 1920px (pantalla HD o superior). */
export const useIsLargeScreen = (): boolean => {
    const [isLarge, setIsLarge] = useState(window.innerWidth >= BREAKPOINTS.hd);

    useEffect(() => {
        const handleResize = () => setIsLarge(window.innerWidth >= BREAKPOINTS.hd);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return isLarge;
};
