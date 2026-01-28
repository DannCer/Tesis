import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles/variables.css';
import './styles/global.css';
import './styles/responsive-utilities.css';
import Principal from './pages/Principal';
import Geovisor from './pages/Geovisor';
import LayoutPrincipal from './components/layout/LayoutPrincipal';
import LayoutGeovisor from './components/layout/LayoutGeovisor';
import NotFound from './pages/NotFound';

createRoot(document.getElementById('root')).render(
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
          path="/geovisor" 
          element={
            <LayoutGeovisor>
              <Geovisor />
            </LayoutGeovisor>
          } 
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  </StrictMode>
);