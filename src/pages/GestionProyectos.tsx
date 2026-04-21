/**
 * @fileoverview Página para gestión de proyectos QGIS Server y capas desde API
 * @module pages/GestionProyectos
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import GruposManager from '@components/map/management/GruposManager';
import CapasManager from '@components/map/management/CapasManager';
import CapasPublicadas from '@components/map/management/CapasPublicadas';
import '@styles/gestion-proyectos.css';
import '@styles/admin-dashboard.css';

const GestionProyectos: React.FC = () => {
    const navigate = useNavigate();
    const { state, logout } = useAuth();
    const [activeTab, setActiveTab] = useState<'grupos' | 'capas' | 'publicadas'>('grupos');

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div className="gestion-proyectos-page">
            {/* Header — misma estructura que AdminDashboard */}
            <header className="admin-header">
                <div className="admin-header-left">
                    <button className="btn-back-admin" onClick={() => navigate('/geovisor')}>
                        ← Geovisor
                    </button>
                    <div>
                        <h1>Gestión de Capas y Proyectos</h1>
                    </div>
                </div>
                <div className="admin-header-right">
                    {state.user?.es_admin && (
                        <button className="btn-admin" onClick={() => navigate('/admin')}>
                            Panel de Administrador
                        </button>
                    )}
                    <div className="admin-user-badge">
                        <span className="admin-user-icon">👤</span>
                        <span>{state.user?.nombre_completo || state.user?.username}</span>
                        {state.user?.es_admin && (
                            <span className="admin-role-tag">Admin</span>
                        )}
                    </div>
                    <button onClick={handleLogout} className="btn-logout">
                        Cerrar sesión
                    </button>
                </div>
            </header>

            {/* Tabs */}
            <div className="tabs-container">
                <div className="tabs">
                    <button
                        className={`tab ${activeTab === 'grupos' ? 'active' : ''}`}
                        onClick={() => setActiveTab('grupos')}
                    >
                        Grupos
                    </button>
                    <button
                        className={`tab ${activeTab === 'capas' ? 'active' : ''}`}
                        onClick={() => setActiveTab('capas')}
                    >
                        Gestión de Capas
                    </button>
                    <button
                        className={`tab ${activeTab === 'publicadas' ? 'active' : ''}`}
                        onClick={() => setActiveTab('publicadas')}
                    >
                        Capas Publicadas
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="gestion-content">
                {activeTab === 'grupos' && (
                    <div className="tab-panel">
                        <div className="info-box">
                            <h3>Gestión de Grupos</h3>
                            <p>
                                Los grupos representan proyectos QGIS Server. Cada grupo puede tener
                                asociada una URL del proyecto (.qgz) y contendrá múltiples capas
                                geográficas.
                            </p>
                        </div>
                        <GruposManager />
                    </div>
                )}

                {activeTab === 'capas' && (
                    <div className="tab-panel">
                        <div className="info-box">
                            <h3>Gestión de Capas</h3>
                            <p>
                                Administra las capas geográficas del sistema. Cada capa debe pertenecer
                                a un grupo y tener configurados sus nombres WFS y WMS para ser
                                consumida por el geovisor.
                            </p>
                        </div>
                        <CapasManager />
                    </div>
                )}

                {activeTab === 'publicadas' && (
                    <div className="tab-panel">
                        <CapasPublicadas />
                    </div>
                )}
            </div>

            {/* Help Section */}
            <div className="help-section">
                <h3>Flujo de Trabajo Recomendado</h3>
                <div className="workflow-steps">
                    <div className="workflow-step">
                        <div className="step-number">1</div>
                        <div className="step-content">
                            <h4>Crear Grupos</h4>
                            <p>Ve a la pestaña "Grupos" y crea los grupos que representen tus proyectos QGIS</p>
                        </div>
                    </div>
                    <div className="workflow-step">
                        <div className="step-number">2</div>
                        <div className="step-content">
                            <h4>Agregar Capas</h4>
                            <p>En "Gestión de Capas", agrega las capas geográficas asignándolas a los grupos</p>
                        </div>
                    </div>
                    <div className="workflow-step">
                        <div className="step-number">3</div>
                        <div className="step-content">
                            <h4>Verificar Publicación</h4>
                            <p>Revisa en "Capas Publicadas" que todas las capas estén correctamente registradas</p>
                        </div>
                    </div>
                    <div className="workflow-step">
                        <div className="step-number">4</div>
                        <div className="step-content">
                            <h4>Visualizar en el Geovisor</h4>
                            <p>Las capas estarán disponibles automáticamente en el menú de capas del geovisor</p>
                        </div>
                    </div>
                </div>
                <p className="help-note">
                    <strong>Nota:</strong> Los cambios en la API se reflejan automáticamente en el
                    geovisor. 
                </p>
            </div>
        </div>
    );
};

export default GestionProyectos;