/**
 * @fileoverview Layout principal de la aplicación.
 * 
 * Envuelve las páginas principales con el Header y Footer institucionales.
 * Usado para la página de inicio y otras páginas informativas.
 * 
 * @module components/layout/LayoutPrincipal
 */

import React from 'react';
import Header from './Header';
/*import Footer from './Footer';

/**
 * Layout principal con encabezado y pie de página.
 * 
 * Estructura:
 * - Header (navegación institucional)
 * - Main (contenido de la página)
 * - Footer (información de contacto)
 * 
 * @component
 * @param {Object} props - Propiedades del componente
 * @param {React.ReactNode} props.children - Contenido de la página
 * @returns {JSX.Element} Layout con Header y Footer
 * 
 * @example
 * <LayoutPrincipal>
 *   <HomePage />
 * </LayoutPrincipal>
 */
const LayoutPrincipal = ({children}) => {
  return (
    <div className="layout-principal">
      <Header />
      <main className="container-max">{children}</main>
      {/*<Footer /> */}
    </div>
  );
};

export default LayoutPrincipal;