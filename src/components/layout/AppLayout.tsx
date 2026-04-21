import { useEffect } from 'react';
import { useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import LayoutPrincipal from '@components/layout/LayoutPrincipal';
import LayoutGeovisor from '@components/layout/LayoutGeovisor';
import { ProtectedRoute } from '@components/ProtectedRoute';  // ← AGREGAR
import Principal from '@pages/Principal';
import Arquitectura from '@pages/Arquitectura';
import Geovisor from '@pages/Geovisor';
import GestionProyectos from '@pages/GestionProyectos';
import Login from '@pages/Login';  // ← AGREGAR
import AdminDashboard from '@pages/AdminDashboard';  // ← AGREGAR
import NotFound from '@pages/NotFound';

const AppLayout = () => {
    const { pathname } = useLocation();
    const { state } = useAuth();

    useEffect(() => {
        window.scrollTo({
            top: 0,
            left: 0,
            behavior: 'smooth'
        });
    }, [pathname]);

    if (state.loading) {
        return <div className="loading-spinner">Cargando...</div>;
    }

    return (
        <Routes>
            {/* Ruta de Login (pública) */}
            <Route path="/login" element={<Login />} />

            {/* Rutas públicas */}
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

            {/* Geovisor (público) */}
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
                element={
                    <ProtectedRoute>
                        <GestionProyectos />
                    </ProtectedRoute>
                }
            />

            {/* Panel de Admin (solo admin) */}
            <Route
                path="/admin"
                element={
                    <ProtectedRoute requireAdmin={true}>
                        <AdminDashboard />
                    </ProtectedRoute>
                }
            />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
        </Routes>
    );
};

export default AppLayout;