import React from 'react';
import { useNavigate } from 'react-router-dom';
import LayoutPrincipal from '../components/layout/LayoutPrincipal';
import '../styles/notfound.css';

const NotFound: React.FC = () => {
    const navigate = useNavigate();

    /**
     * Maneja el evento de clic para regresar a la página principal
     */
    const handleGoHome = () => {
        navigate('/');
    };

    return (
        <LayoutPrincipal>
            <div className="notfound-container">
                <div className="container-max">
                    <div className="row justify-content-center">
                        <div className="col-12 col-md-8 text-center">
                            {/* Número 404 grande */}
                            <div className="error-code">404</div>
                            
                            {/* Título */}
                            <h2 className="error-title">
                                Página no encontrada
                            </h2>

                            {/* Mensaje descriptivo */}
                            <p className="error-message">
                                La dirección que has ingresado no existe o fue movida.
                            </p>

                            {/* Botón de acción */}
                            <button
                                className="btn btn-primary btn-lg mt-4"
                                onClick={handleGoHome}
                            >
                                Volver al inicio
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </LayoutPrincipal>
    );
};

export default NotFound;
