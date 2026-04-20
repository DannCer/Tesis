/**
 * @fileoverview Componente para gestionar grupos (proyectos QGIS) desde la API
 * @module components/map/GruposManager
 */

import React, { useState, useEffect } from 'react';
import { apiService, GrupoResponse, GrupoCreate } from '@services/api';
import '@styles/GruposManager.css';

interface GruposManagerProps {
    onGruposChange?: () => void;
}

const GruposManager: React.FC<GruposManagerProps> = ({ onGruposChange }) => {
    const [grupos, setGrupos] = useState<GrupoResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newGrupo, setNewGrupo] = useState<GrupoCreate>({
        nombre: '',
        url_proyecto: '',
    });

    // Cargar grupos
    const loadGrupos = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiService.getGrupos();
            setGrupos(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadGrupos();
    }, []);

    // Crear grupo
    const handleCreateGrupo = async () => {
        if (!newGrupo.nombre.trim()) {
            alert('El nombre del grupo es requerido');
            return;
        }

        try {
            await apiService.createGrupo(newGrupo);
            setNewGrupo({ nombre: '', url_proyecto: '' });
            setIsAddingNew(false);
            await loadGrupos();
            onGruposChange?.();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    // Eliminar grupo
    const handleDeleteGrupo = async (id: number, nombre: string) => {
        if (!confirm(`¿Estás seguro de eliminar el grupo "${nombre}"?`)) {
            return;
        }

        try {
            await apiService.deleteGrupo(id);
            await loadGrupos();
            onGruposChange?.();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    if (loading) {
        return (
            <div className="grupos-manager">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando grupos...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="grupos-manager">
            <div className="manager-header">
                <h3>📁 Grupos (Proyectos QGIS)</h3>
                <button
                    className="btn btn-primary"
                    onClick={() => setIsAddingNew(!isAddingNew)}
                >
                    {isAddingNew ? 'Cancelar' : '+ Nuevo Grupo'}
                </button>
            </div>

            {error && (
                <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <span>{error}</span>
                    <button onClick={loadGrupos}>Reintentar</button>
                </div>
            )}

            {isAddingNew && (
                <div className="add-grupo-form">
                    <h4>Nuevo Grupo</h4>
                    <div className="form-row">
                        <div className="form-field">
                            <label>
                                Nombre del Grupo <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={newGrupo.nombre}
                                onChange={e => setNewGrupo({ ...newGrupo, nombre: e.target.value })}
                                placeholder="ej: 🌋 Geológicos"
                            />
                        </div>
                        <div className="form-field">
                            <label>Ruta Proyecto QGIS</label>
                            <input
                                type="text"
                                className="input"
                                value={newGrupo.url_proyecto || ''}
                                onChange={e => setNewGrupo({ ...newGrupo, url_proyecto: e.target.value })}
                                placeholder="C:/mis_proyectos/01_Geologicos.qgz"
                            />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={handleCreateGrupo}>
                            Crear Grupo
                        </button>
                        <button className="btn btn-secondary" onClick={() => setIsAddingNew(false)}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <div className="grupos-list">
                {grupos.length === 0 ? (
                    <div className="empty-state">
                        <p>No hay grupos registrados</p>
                        <button className="btn btn-primary" onClick={() => setIsAddingNew(true)}>
                            Crear Primer Grupo
                        </button>
                    </div>
                ) : (
                    <div className="grupos-grid">
                        {grupos.map(grupo => (
                            <div key={grupo.id} className="grupo-card">
                                <div className="grupo-header">
                                    <div className="grupo-info">
                                        <h4>{grupo.nombre}</h4>
                                    </div>
                                    <button
                                        className="btn-delete"
                                        onClick={() => handleDeleteGrupo(grupo.id, grupo.nombre)}
                                        title="Eliminar grupo"
                                    >
                                        🗑️
                                    </button>
                                </div>
                                {grupo.url_proyecto && (
                                    <div className="grupo-url">
                                        <strong>Enlace a proyecto:</strong>
                                        <a
                                            href={`http://localhost/qgis/qgis_mapserv.fcgi.exe?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&MAP=${grupo.url_proyecto}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ display: 'block', wordBreak: 'break-all', fontSize: '0.85em' }}
                                        >
                                            Abrir GetCapabilities
                                        </a>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default GruposManager;
