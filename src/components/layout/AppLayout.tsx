// src/components/layout/AppLayout.tsx
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import LayoutPrincipal from '@components/layout/LayoutPrincipal';
import LayoutGeovisor from '@components/layout/LayoutGeovisor';
import Principal from '@pages/Principal';
import Arquitectura from '@pages/Arquitectura';
import Geovisor from '@pages/Geovisor';
import GestionProyectos from '@pages/GestionProyectos';
import NotFound from '@pages/NotFound';

const AppLayout = () => {
    const { pathname } = useLocation();

    // ScrollToTop directamente aquí
    useEffect(() => {
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: 'smooth'
        });
    }, [pathname]);

    return (
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
    );
};

export default AppLayout;