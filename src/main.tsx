import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import ReactGA from 'react-ga4';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@styles/variables.css';
import '@styles/global.css';
import '@styles/responsive-utilities.css';

import { AuthProvider } from '@contexts/AuthContext';
import { LayersProvider } from '@contexts/LayersContext';
import { MapProvider } from '@contexts/MapContext';
import AppLayout from '@components/layout/AppLayout';

ReactGA.initialize("G-25T40ZMFML");

const AnalyticsTracker = () => {
    const location = useLocation();

    useEffect(() => {
        ReactGA.send({
            hitType: "pageview",
            page: location.pathname + location.search
        });
    }, [location]);

    return null;
};

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