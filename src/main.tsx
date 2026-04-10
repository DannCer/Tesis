import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/variables.css';
import './styles/global.css';
import './styles/responsive-utilities.css';
import Principal from './pages/Principal';
import Arquitectura from './pages/Arquitectura';
import Geovisor from './pages/Geovisor';
import GestionProyectos from './pages/GestionProyectos';
import LayoutPrincipal from './components/layout/LayoutPrincipal';
import LayoutGeovisor from './components/layout/LayoutGeovisor';
import NotFound from './pages/NotFound';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('No se encontró el elemento root en el DOM.');

createRoot(rootElement).render(
  <StrictMode>
    <Router>
      <Routes>
        <Route
          path="/"
          element={
            <LayoutPrincipal>
              <Principal />
            </LayoutPrincipal>
          }
        />
        <Route
          path="/arquitectura"
          element={
            <LayoutPrincipal>
              <Arquitectura />
            </LayoutPrincipal>
          }
        />
        <Route 
          path="/geovisor" 
          element={
            <LayoutGeovisor>
              <Geovisor />
            </LayoutGeovisor>
          } 
        />
        <Route 
          path="/gestion-proyectos" 
          element={<GestionProyectos />} 
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  </StrictMode>
);
