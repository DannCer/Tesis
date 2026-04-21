import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '@styles/header.css';

const Header: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const isGeovisor = location.pathname === '/geovisor';

    return (
        <header className="main-header">
            <nav className="site-nav">
                <div className="container-max">
                    <div className="header-content">
                        <div className="logos-container">
                            <div className="logoL">
                                <img src="/img/escudos/logo_UNAM.png" alt="Logo UNAM" />
                            </div>
                            <div className="logoR">
                                <img src="/img/escudos/logo_FI.png" alt="Logo FI" />
                            </div>
                        </div>

                        {/* Mostrar botón de Gestión de Proyectos solo en el geovisor */}
                        {isGeovisor && (
                            <button
                                className="btn-gestion-proyectos-header"
                                onClick={() => navigate('/gestion-proyectos')}
                                title="Ir a Gestión de Proyectos"
                                aria-label="Ir a Gestión de Proyectos"
                            >
                                <span className="btn-text">Gestión de Proyectos</span>
                            </button>
                        )}
                    </div>
                </div>
            </nav>
        </header>
    );
};

export default Header;