import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requireAdmin?: boolean;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    requireAdmin = false,
}) => {
    const { state } = useAuth();
    const location = useLocation();

    if (state.loading) {
        return <div className="loading-spinner">Cargando...</div>;
    }

    if (!state.isAuthenticated) {
        // Guardamos la ruta actual para redirigir de vuelta después del login
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requireAdmin && !state.user?.es_admin) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
};