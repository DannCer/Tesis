/**
 * Hooks para responsividad en React
 */

import { useState, useEffect } from 'react';

// Hook para detectar tamaño de pantalla
export const useViewport = () => {
  const [viewport, setViewport] = useState({
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
export const useIsMobile = (breakpoint = 768) => {
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
export const useIsLargeScreen = () => {
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
function getBreakpoint(width) {
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
export const useResponsiveStyle = (styles) => {
  const viewport = useViewport();
  
  return styles[viewport.breakpoint] || styles.default || {};
};