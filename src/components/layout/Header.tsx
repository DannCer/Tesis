import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '@styles/header.css';

const Header: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const path = location.pathname;

    const isGeovisor = path === '/geovisor';
    const isPrincipal = path === '/';
    const isArquitectura = path === '/arquitectura';

    return (
        <header className="main-header">
            <nav className="site-nav">
                <div className="header-content">

                    <div className="logos-container">
                        <div className="logo-item">
                            <img src="/img/escudos/logo_UNAM.png" alt="UNAM" />
                        </div>

                        <div className="logo-sep" />

                        <div className="logo-item">
                            <img src="/img/escudos/logo_FI.png" alt="FI" />
                        </div>
                    </div>

                    {/* ── Acciones contextuales por ruta ── */}
                    <div className="header-actions">

                        {/* Geovisor → Inicio y Gestión de Proyectos */}
                        {isGeovisor && (
                            <>
                                <button
                                    className="btn-header-action"
                                    onClick={() => navigate('/')}
                                    title="Ir a Inicio"
                                    aria-label="Ir a Inicio"
                                >
                                    <span className="btn-action-icon">🏠</span>
                                    <span className="btn-action-text">Inicio</span>
                                </button>
                                <button
                                    className="btn-header-action"
                                    onClick={() => navigate('/gestion-proyectos')}
                                    title="Ir a Gestión de Proyectos"
                                    aria-label="Ir a Gestión de Proyectos"
                                >
                                    <span className="btn-action-icon">🗂️</span>
                                    <span className="btn-action-text">Gestión de Proyectos</span>
                                </button>
                            </>
                        )}

                        {/* Página principal → Arquitectura y Geovisor */}
                        {isPrincipal && (
                            <>
                                <button
                                    className="btn-header-action"
                                    onClick={() => navigate('/arquitectura')}
                                    title="Ir a Arquitectura"
                                    aria-label="Ir a Arquitectura"
                                >
                                    <span className="btn-action-icon">🏗️</span>
                                    <span className="btn-action-text">Arquitectura</span>
                                </button>
                                <button
                                    className="btn-header-action btn-header-action--accent"
                                    onClick={() => navigate('/geovisor')}
                                    title="Abrir Geovisor"
                                    aria-label="Abrir Geovisor"
                                >
                                    <span className="btn-action-icon">🗺️</span>
                                    <span className="btn-action-text">Geovisor</span>
                                </button>
                            </>
                        )}

                        {/* Arquitectura → Inicio y Geovisor */}
                        {isArquitectura && (
                            <>
                                <button
                                    className="btn-header-action"
                                    onClick={() => navigate('/')}
                                    title="Ir a Inicio"
                                    aria-label="Ir a Inicio"
                                >
                                    <span className="btn-action-icon">🏠</span>
                                    <span className="btn-action-text">Inicio</span>
                                </button>
                                <button
                                    className="btn-header-action btn-header-action--accent"
                                    onClick={() => navigate('/geovisor')}
                                    title="Abrir Geovisor"
                                    aria-label="Abrir Geovisor"
                                >
                                    <span className="btn-action-icon">🗺️</span>
                                    <span className="btn-action-text">Geovisor</span>
                                </button>
                            </>
                        )}

                    </div>

                </div>
            </nav>
        </header>
    );
};

export default Header;