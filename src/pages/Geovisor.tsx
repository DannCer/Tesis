import React from 'react';
import { useNavigate } from 'react-router-dom';
import MapView from '@components/map/MapView';

const Geovisor: React.FC = () => {
    const navigate = useNavigate();

    return (
        <>
            <MapView />
            <button
                className="btn-gestion-proyectos"
                onClick={() => navigate('/gestion-proyectos')}
                title="Ir a Gestión de Proyectos"
            >
                ⚙ Gestión de Proyectos
            </button>
        </>
    );
};

export default Geovisor;