import React, { ReactNode } from 'react';
import Header from './Header';
import '../../styles/global.css';

interface LayoutGeovisorProps {
  children: ReactNode;
}

/**
 * Layout para el Geovisor
 * Incluye header y contenido a pantalla completa
 */
const LayoutGeovisor: React.FC<LayoutGeovisorProps> = ({ children }) => {
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
