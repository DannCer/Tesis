/**
 * @fileoverview Encabezado institucional — navegación contextual por ruta.
 *
 * Optimizaciones:
 *  - memo() para evitar re-renders cuando el padre se actualiza sin cambiar ruta.
 *  - Handlers de navegación con useCallback.
 *  - Botones extraídos a sub-componente NavButton para homologar estilos y
 *    eliminar JSX repetido (~60 líneas reducidas).
 *  - Clases responsivas en `btn-action-text` para ocultar texto en móviles
 *    sin romper la estructura del header.
 *
 * @module components/layout/Header
 */

import React, { memo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '@styles/header.css';

// ─── Sub-componente reutilizable ──────────────────────────────────────────────

interface NavButtonProps {
    onClick: () => void;
    title: string;
    icon: string;
    label: string;
    accent?: boolean;
}

const NavButton: React.FC<NavButtonProps> = memo(({ onClick, title, icon, label, accent }) => (
    <button
        className={`btn-header-action${accent ? ' btn-header-action--accent' : ''}`}
        onClick={onClick}
        title={title}
        aria-label={title}
    >
        <span className="btn-action-icon" aria-hidden="true">{icon}</span>
        {/* btn-action-text se oculta en xs/sm mediante header.css para no saturar móviles */}
        <span className="btn-action-text">{label}</span>
    </button>
));
NavButton.displayName = 'NavButton';

// ─── Header ───────────────────────────────────────────────────────────────────

const Header: React.FC = () => {
    const navigate  = useNavigate();
    const { pathname } = useLocation();

    const isGeovisor     = pathname === '/geovisor';
    const isPrincipal    = pathname === '/';
    const isArquitectura = pathname === '/arquitectura';

    // Handlers estables — no recrean closures en cada render
    const goHome         = useCallback(() => navigate('/'),                   [navigate]);
    const goGeovisor     = useCallback(() => navigate('/geovisor'),           [navigate]);
    const goArquitectura = useCallback(() => navigate('/arquitectura'),        [navigate]);
    const goGestion      = useCallback(() => navigate('/gestion-proyectos'),   [navigate]);

    return (
        <header className="main-header">
            <nav className="site-nav" aria-label="Navegación principal">
                <div className="header-content">

                    {/* Logos institucionales */}
                    <div className="logos-container" aria-label="Logos institucionales">
                        <div className="logo-item">
                            <img src="/img/escudos/logo_UNAM.png" alt="Universidad Nacional Autónoma de México" />
                        </div>
                        <div className="logo-sep" aria-hidden="true" />
                        <div className="logo-item">
                            <img src="/img/escudos/logo_FI.png" alt="Facultad de Ingeniería" />
                        </div>
                    </div>

                    {/* Acciones contextuales por ruta */}
                    <nav className="header-actions" aria-label="Acciones de navegación">

                        {isGeovisor && (
                            <>
                                <NavButton onClick={goHome}    title="Ir a Inicio"                  icon="🏠" label="Inicio" />
                                <NavButton onClick={goGestion} title="Ir a Gestión de Proyectos"   icon="🗂️" label="Gestión de Proyectos" />
                            </>
                        )}

                        {isPrincipal && (
                            <>
                                <NavButton onClick={goArquitectura} title="Ir a Arquitectura" icon="🏗️" label="Arquitectura" />
                                <NavButton onClick={goGeovisor}     title="Abrir Geovisor"    icon="🗺️" label="Geovisor" accent />
                            </>
                        )}

                        {isArquitectura && (
                            <>
                                <NavButton onClick={goHome}     title="Ir a Inicio"    icon="🏠" label="Inicio" />
                                <NavButton onClick={goGeovisor} title="Abrir Geovisor" icon="🗺️" label="Geovisor" accent />
                            </>
                        )}

                    </nav>
                </div>
            </nav>
        </header>
    );
};

export default memo(Header);