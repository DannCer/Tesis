import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@styles/variables.css';
import '@styles/global.css';
import '@styles/responsive-utilities.css';

import { AuthProvider } from '@contexts/AuthContext';  // ← AGREGAR
import { LayersProvider } from '@contexts/LayersContext';
import { MapProvider } from '@contexts/MapContext';
import AppLayout from '@components/layout/AppLayout';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento root en el DOM.');

createRoot(rootElement).render(
    <StrictMode>
        <Router>
            <AuthProvider>  
                <LayersProvider>
                    <MapProvider>
                        <AppLayout />
                    </MapProvider>
                </LayersProvider>
            </AuthProvider>  
        </Router>
    </StrictMode>
);