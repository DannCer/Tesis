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
        <div className="login-page">
            <div className="login-card">
                <header className="login-header">
                    <div className="login-logos-container">
                        <div className="login-logo-item">
                            <img
                                src="/img/escudos/logo_UNAM.png"
                                alt="Universidad Nacional Autónoma de México"
                            />
                        </div>

                        <div className="logo-sep" aria-hidden="true" />

                        <div className="login-logo-item">
                            <img
                                src="/img/escudos/logo_FI.png"
                                alt="Facultad de Ingeniería"
                            />
                        </div>
                    </div>
                    <div className="login-header-content">
                        <h1>Geovisor Atlas de Riesgos</h1>
                        <p>Sistema de información geoespacial</p>
                    </div>
                </header>

                <div className="login-body">
                    <form onSubmit={handleSubmit} className="login-form">
                        <div className="form-field">
                            <label htmlFor="username">Usuario</label>
                            <input
                                id="username"
                                type="text"
                                className="form-control"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Ingresa tu usuario"
                                disabled={isLoading}
                                required
                            />
                        </div>

                        <div className="form-field">
                            <label htmlFor="password">Contraseña</label>
                            <input
                                id="password"
                                type="password"
                                className="form-control"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Ingresa tu contraseña"
                                disabled={isLoading}
                                required
                            />
                        </div>

                        {state.error && (
                            <div className="login-error">{state.error}</div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="btn btn-primary btn-lg btn-login"
                        >
                            {isLoading ? 'Verificando...' : 'Ingresar'}
                        </button>
                    </form>

                    <button
                        className="btn-login-home"
                        onClick={() => navigate('/')}
                    >
                        ← Volver al inicio
                    </button>
                    <footer className="login-footer">
                        <p>¿No tienes cuenta? Contacta al administrador.</p>

                    </footer>
                </div>


            </div>
        </div>
    );
};

export default Login;