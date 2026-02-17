/**
 * @fileoverview Layout principal de la aplicación.
 * 
 * Envuelve las páginas principales con el Header y Footer institucionales.
 * Usado para la página de inicio y otras páginas informativas.
 * 
 * @module components/layout/LayoutPrincipal
 */

import React, { ReactNode } from 'react';
import Header from './Header';

interface LayoutPrincipalProps {
  children: ReactNode;
}

/**
 * Layout principal con encabezado y pie de página.
 * 
 * Estructura:
 * - Header (navegación institucional)
 * - Main (contenido de la página)
 * - Footer (información de contacto)
 */
const LayoutPrincipal: React.FC<LayoutPrincipalProps> = ({ children }) => {
  return (
    <div className="layout-principal">
      <Header />
      <main className="container-max">{children}</main>
    </div>
  );
};

export default LayoutPrincipal;
