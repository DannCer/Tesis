import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@styles/variables.css';
import '@styles/global.css';
import '@styles/responsive-utilities.css';

import { AuthProvider } from '@contexts/AuthContext';
import { LayersProvider } from '@contexts/LayersContext';
import { MapProvider } from '@contexts/MapContext';
import AppLayout from '@components/layout/AppLayout';

// GA Measurement ID leído de la variable de entorno.
// En desarrollo puede omitirse (VITE_GA_MEASUREMENT_ID vacío → no inicializa).
const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;
if (GA_ID) ReactGA.initialize(GA_ID);

/** Registra pageviews en GA4 en cada cambio de ruta. Solo activo si GA_ID está definido. */
const AnalyticsTracker = () => {
    const location = useLocation();
    useEffect(() => {
        if (!GA_ID) return;
        ReactGA.send({ hitType: 'pageview', page: location.pathname + location.search });
    }, [location]);
    return null;
};

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento root en el DOM.');

createRoot(rootElement).render(
    <StrictMode>
        <Router>
            <AnalyticsTracker />
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