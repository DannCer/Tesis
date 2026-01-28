import React from 'react';
import Header from './Header';
import '../../styles/global.css';

/**
 * Layout para el Geovisor
 * Incluye header y contenido a pantalla completa
 */
const LayoutGeovisor = ({ children }) => {
  return (
    <div className="layout-geovisor">
      <Header />
      <main className="geovisor-content">
        {children}
      </main>
    </div>
  );
};

export default LayoutGeovisor;