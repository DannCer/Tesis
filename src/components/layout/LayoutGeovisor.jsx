import React from 'react';
import Header from './Header';

/**
 * Layout para el Geovisor
 * Incluye header y contenido a pantalla completa
 */
const LayoutGeovisor = ({ children }) => {
  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden' 
    }}>
      <Header />
      <main style={{ 
        flex: 1, 
        padding: 0, 
        margin: 0,
        overflow: 'hidden'
      }}>
        {children}
      </main>
    </div>
  );
};

export default LayoutGeovisor;