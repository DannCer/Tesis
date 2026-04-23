import React, { ReactNode } from 'react';
import Header from '@components/layout/Header';
import '@styles/global.css';
import { SelectedProjectProvider } from '@/contexts/SelectedProjectContext';

interface LayoutGeovisorProps {
  children: ReactNode;
}

/**
 * Layout para el Geovisor
 * Incluye header y contenido a pantalla completa
 */
const LayoutGeovisor: React.FC<LayoutGeovisorProps> = ({ children }) => {
  return (
    <SelectedProjectProvider>
      <div className="layout-geovisor">
      <Header />
      <main className="geovisor-content">
        {children}
      </main>
    </div>
    </SelectedProjectProvider>
    
  );
};

export default LayoutGeovisor;
