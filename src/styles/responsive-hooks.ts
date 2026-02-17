/**
 * Hooks para responsividad en React
 */

import { useState, useEffect } from 'react';

export type Breakpoint = '4k' | '2k' | 'hd' | 'xl' | 'lg' | 'md' | 'sm' | 'xs';

export interface Viewport {
  width: number;
  height: number;
  breakpoint: Breakpoint;
}

// Hook para detectar tamaño de pantalla
export const useViewport = (): Viewport => {
  const [viewport, setViewport] = useState<Viewport>({
    width: window.innerWidth,
    height: window.innerHeight,
    breakpoint: getBreakpoint(window.innerWidth)
  });

  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
        breakpoint: getBreakpoint(window.innerWidth)
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return viewport;
};

// Hook para detectar si es móvil
export const useIsMobile = (breakpoint = 768): boolean => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
};

// Hook para detectar pantalla grande (4K/2K)
export const useIsLargeScreen = (): boolean => {
  const [isLarge, setIsLarge] = useState(window.innerWidth >= 1920);

  useEffect(() => {
    const handleResize = () => {
      setIsLarge(window.innerWidth >= 1920);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isLarge;
};

// Helper para determinar breakpoint
function getBreakpoint(width: number): Breakpoint {
  if (width >= 3840) return '4k';
  if (width >= 2560) return '2k';
  if (width >= 1920) return 'hd';
  if (width >= 1200) return 'xl';
  if (width >= 992) return 'lg';
  if (width >= 768) return 'md';
  if (width >= 576) return 'sm';
  return 'xs';
}

// Hook para responsive styles
export const useResponsiveStyle = (styles: Record<string, any>): any => {
  const viewport = useViewport();
  
  return styles[viewport.breakpoint] || styles.default || {};
};
