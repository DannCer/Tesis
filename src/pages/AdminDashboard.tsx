import React, { useState, useEffect } from 'react';
import { useAuth } from '@hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import '@styles/admin-dashboard.css';

interface Usuario {
    id: number;
    username: string;
    email: string;
    nombre_completo: string | null;
    activo: boolean;
    creado_en: string;
}

const AdminDashboard: React.FC = () => {
    const { state, logout } = useAuth();
    const navigate = useNavigate();
    const [usuarios, setUsuarios] = useState<Usuario[]>([]);
    const [loading, setLoading] = useState(false);
    const [feedback, setFeedback] = useState<{ msg: string; tipo: 'ok' | 'error' } | null>(null);
    const [newUserForm, setNewUserForm] = useState({
        username: '',
        email: '',
        password: '',
        nombre_completo: '',
    });

    useEffect(() => {
        loadUsuarios();
    }, []);

    const showFeedback = (msg: string, tipo: 'ok' | 'error') => {
        setFeedback({ msg, tipo });
        setTimeout(() => setFeedback(null), 3500);
    };

    const loadUsuarios = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch('http://localhost:8000/api/v1/admin/usuarios', {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Error al cargar usuarios');
            const data: Usuario[] = await response.json();
            setUsuarios(data);
        } catch (error) {
            showFeedback('No se pudo cargar la lista de usuarios.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        const token = localStorage.getItem('access_token');
        try {
            const response = await fetch('http://localhost:8000/api/v1/admin/usuarios', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(newUserForm),
            });
            if (!response.ok) throw new Error('Error al crear usuario');
            setNewUserForm({ username: '', email: '', password: '', nombre_completo: '' });
            await loadUsuarios();
            showFeedback(`Usuario "${newUserForm.username}" creado correctamente.`, 'ok');
        } catch (error) {
            showFeedback('No se pudo crear el usuario.', 'error');
        }
    };

    const handleDeleteUser = async (userId: number, username: string) => {
        if (!window.confirm(`¿Eliminar al usuario "${username}"?`)) return;
        const token = localStorage.getItem('access_token');
        try {
            const response = await fetch(`http://localhost:8000/api/v1/admin/usuarios/${userId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('Error al eliminar usuario');
            await loadUsuarios();
            showFeedback(`Usuario "${username}" eliminado.`, 'ok');
        } catch (error) {
            showFeedback('No se pudo eliminar el usuario.', 'error');
        }
    };

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    return (
        <div className="admin-dashboard">
            {/* Header */}
            <header className="admin-header">
                <div className="admin-header-left">
                    <button className="btn-back-admin" onClick={() => navigate('/gestion-proyectos')}>
                        ← Gestión de Proyectos
                    </button>
                    <div>
                        <h1>Panel de Administrador</h1>
                        <p className="admin-header-sub">Control de acceso y usuarios del sistema</p>
                    </div>
                </div>
                <div className="admin-header-right">
                    <div className="admin-user-badge">
                        <span className="admin-user-icon">👤</span>
                        <span>{state.user?.nombre_completo || state.user?.username}</span>
                        <span className="admin-role-tag">Admin</span>
                    </div>
                    <button onClick={handleLogout} className="btn-logout">
                        Cerrar sesión
                    </button>
                </div>
            </header>

            {/* Feedback toast */}
            {feedback && (
                <div className={`admin-toast admin-toast--${feedback.tipo}`}>
                    {feedback.tipo === 'ok' ? '✓' : '✕'} {feedback.msg}
                </div>
            )}

            <main className="admin-content">

                {/* Stats bar */}
                <div className="admin-stats">
                    <div className="stat-card">
                        <span className="stat-number">{usuarios.length}</span>
                        <span className="stat-label">Usuarios registrados</span>
                    </div>
                    <div className="stat-card">
                        <span className="stat-number">{usuarios.filter(u => u.activo).length}</span>
                        <span className="stat-label">Usuarios activos</span>
                    </div>
                    <div className="stat-card stat-card--accent">
                        <span className="stat-number">1</span>
                        <span className="stat-label">Administrador</span>
                    </div>
                </div>

                {/* Crear usuario */}
                <section className="admin-card">
                    <div className="admin-card-header">
                        <h2>Crear nuevo usuario</h2>
                        <span className="admin-card-badge">Acceso al geovisor</span>
                    </div>
                    <form onSubmit={handleCreateUser} className="form-create-user">
                        <div className="form-field">
                            <label>Usuario</label>
                            <input
                                type="text"
                                placeholder="nombre_usuario"
                                value={newUserForm.username}
                                onChange={(e) => setNewUserForm({ ...newUserForm, username: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label>Correo electrónico</label>
                            <input
                                type="email"
                                placeholder="correo@ejemplo.com"
                                value={newUserForm.email}
                                onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label>Contraseña</label>
                            <input
                                type="password"
                                placeholder="Mínimo 8 caracteres"
                                value={newUserForm.password}
                                onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label>Nombre completo <span className="field-optional">(opcional)</span></label>
                            <input
                                type="text"
                                placeholder="Nombre Apellido"
                                value={newUserForm.nombre_completo}
                                onChange={(e) => setNewUserForm({ ...newUserForm, nombre_completo: e.target.value })}
                            />
                        </div>
                        <button type="submit" className="btn-create">
                            Crear usuario
                        </button>
                    </form>
                </section>

                {/* Listado de usuarios */}
                <section className="admin-card">
                    <div className="admin-card-header">
                        <h2>Usuarios registrados</h2>
                        <button className="btn-refresh" onClick={loadUsuarios} title="Recargar">
                            ↻ Recargar
                        </button>
                    </div>
                    {loading ? (
                        <div className="admin-loading">Cargando usuarios...</div>
                    ) : (
                        <div className="usuarios-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Correo</th>
                                        <th>Nombre</th>
                                        <th>Estado</th>
                                        <th>Registrado</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {usuarios.map((u) => (
                                        <tr key={u.id}>
                                            <td>
                                                <span className="username-cell">
                                                    {u.username}
                                                    {u.username === 'admin' && (
                                                        <span className="tag-admin">admin</span>
                                                    )}
                                                </span>
                                            </td>
                                            <td>{u.email}</td>
                                            <td>{u.nombre_completo || <span className="text-muted">—</span>}</td>
                                            <td>
                                                <span className={`status-badge ${u.activo ? 'status-active' : 'status-inactive'}`}>
                                                    {u.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td className="text-muted">
                                                {new Date(u.creado_en).toLocaleDateString('es-MX')}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleDeleteUser(u.id, u.username)}
                                                    className="btn-delete"
                                                    disabled={u.username === 'admin'}
                                                    title={u.username === 'admin' ? 'No se puede eliminar al admin' : 'Eliminar usuario'}
                                                >
                                                    Eliminar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {usuarios.length === 0 && (
                                        <tr>
                                            <td colSpan={6} className="table-empty">
                                                No hay usuarios registrados
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default AdminDashboard;