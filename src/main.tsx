import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@styles/variables.css';
import '@styles/global.css';
import '@styles/responsive-utilities.css';

import { LayersProvider } from '@contexts/LayersContext';
import { MapProvider }    from '@contexts/MapContext';
import AppLayout          from '@components/layout/AppLayout';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento root en el DOM.');

createRoot(rootElement).render(
    <StrictMode>
        <Router>
            {/* LayersProvider: carga las capas desde la API una sola vez,
                disponibles en toda la app vía useLayersContext() */}
            <LayersProvider>
                {/* MapProvider: expone la instancia de Leaflet vía useMapContext() */}
                <MapProvider>
                    <AppLayout />
                </MapProvider>
            </LayersProvider>
        </Router>
    </StrictMode>
);
