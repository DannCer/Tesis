import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@hooks/useAuth';
import '@styles/login.css';

const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, state } = useAuth();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Si venía de una ruta protegida, redirigir de vuelta después del login
    const from = (location.state as any)?.from?.pathname || '/geovisor';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            await login(username, password);
            navigate(from, { replace: true });
        } catch (error) {
            console.error('Error en login:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <div className="login-logo">
                    <img src="/img/escudos/logo_UNAM.png" alt="Logo UNAM" />
                </div>

                <h1>Geovisor Atlas de Riesgos</h1>
                <h2>Sistema de información geoespacial</h2>
                <div className="login-divider" />

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="username">Usuario</label>
                        <input
                            id="username"
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Ingresa tu usuario"
                            disabled={isLoading}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Contraseña</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Ingresa tu contraseña"
                            disabled={isLoading}
                            required
                        />
                    </div>

                    {state.error && (
                        <div className="error-message">{state.error}</div>
                    )}

                    <button type="submit" disabled={isLoading} className="btn-login">
                        {isLoading ? 'Verificando...' : 'Ingresar'}
                    </button>
                </form>

                <p className="help-text">
                    ¿No tienes cuenta? Contacta al administrador.
                </p>

                <button
                    className="btn-login-home"
                    onClick={() => navigate('/')}
                >
                    ← Volver al inicio
                </button>

                <div className="login-footer-logos">
                    <img src="/img/escudos/logo_UNAM.png" alt="UNAM" />
                    <img src="/img/escudos/logo_FI.png" alt="Facultad de Ingeniería" />
                </div>
            </div>
        </div>
    );
};

export default Login;