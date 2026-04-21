/**
 * @fileoverview Componente para gestionar grupos (proyectos QGIS) desde la API
 * @module components/map/GruposManager
 */

import React, { useState, useEffect } from 'react';
import { apiService, GrupoResponse, GrupoCreate } from '@services/api';
import ConfirmModal from '@components/common/ConfirmModal';
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

    // Estado para el modal de confirmación
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        grupoId: number | null;
        grupoNombre: string;
    }>({
        isOpen: false,
        grupoId: null,
        grupoNombre: '',
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
        // Abrir modal de confirmación
        setConfirmModal({
            isOpen: true,
            grupoId: id,
            grupoNombre: nombre,
        });
    };

    // Confirmar eliminación
    const confirmDeleteGrupo = async () => {
        if (!confirmModal.grupoId) return;

        try {
            await apiService.deleteGrupo(confirmModal.grupoId);
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
                            <div className="input-with-file-selector">
                                <input
                                    type="text"
                                    className="input"
                                    value={newGrupo.url_proyecto || ''}
                                    onChange={e => setNewGrupo({ ...newGrupo, url_proyecto: e.target.value })}
                                    placeholder="C:/mis_proyectos/01_Geologicos.qgz"
                                />
                                <label className="btn btn-secondary btn-file-selector" title="Seleccionar archivo .qgz o .qgs">
                                    📁 Explorar
                                    <input
                                        type="file"
                                        accept=".qgz,.qgs"
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                // Mostrar solo el nombre del archivo seleccionado
                                                const fileName = file.name;
                                                
                                                // Si el usuario no ha escrito nada, sugerir una ruta base
                                                if (!newGrupo.url_proyecto) {
                                                    setNewGrupo({ 
                                                        ...newGrupo, 
                                                        url_proyecto: `C:/mis_proyectos/${fileName}`
                                                    });
                                                } else {
                                                    // Si ya hay una ruta, reemplazar solo el nombre del archivo
                                                    const currentPath = newGrupo.url_proyecto;
                                                    const lastSlash = Math.max(
                                                        currentPath.lastIndexOf('/'),
                                                        currentPath.lastIndexOf('\\')
                                                    );
                                                    
                                                    if (lastSlash > -1) {
                                                        const directory = currentPath.substring(0, lastSlash + 1);
                                                        setNewGrupo({ 
                                                            ...newGrupo, 
                                                            url_proyecto: directory + fileName
                                                        });
                                                    } else {
                                                        setNewGrupo({ 
                                                            ...newGrupo, 
                                                            url_proyecto: `C:/mis_proyectos/${fileName}`
                                                        });
                                                    }
                                                }
                                                
                                                // Resetear el input file para permitir seleccionar el mismo archivo nuevamente
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                            <small className="form-hint">
                                💡 Escribe la ruta completa del servidor o usa "Explorar" para autocompletar el nombre del archivo
                            </small>
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

            {/* Modal de confirmación */}
            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Eliminar Grupo"
                message={`¿Estás seguro de que deseas eliminar el grupo "${confirmModal.grupoNombre}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                confirmVariant="danger"
                icon="🗑️"
                onConfirm={confirmDeleteGrupo}
                onCancel={() => setConfirmModal({ isOpen: false, grupoId: null, grupoNombre: '' })}
            />
        </div>
    );
};

export default GruposManager;