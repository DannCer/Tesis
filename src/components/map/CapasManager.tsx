/**
 * @fileoverview Componente para gestionar capas geográficas desde la API
 * @module components/map/CapasManager
 */

import React, { useState, useEffect } from 'react';
import { apiService, ItemResponse, ItemCreate, GrupoResponse } from '../../services/apiService';
import '../../styles/CapasManager.css';

interface CapasManagerProps {
    onCapasChange?: () => void;
}

const CapasManager: React.FC<CapasManagerProps> = ({ onCapasChange }) => {
    const [capas, setCapas] = useState<ItemResponse[]>([]);
    const [grupos, setGrupos] = useState<GrupoResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newCapa, setNewCapa] = useState<ItemCreate>({
        name: '',
        description: '',
        group_id: 0,
        tipo: 'vector',
        wfsName: '',
        wmsLayer: '',
    });

    // Cargar capas y grupos
    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [capasData, gruposData] = await Promise.all([
                apiService.getCapas(),
                apiService.getGrupos(),
            ]);
            setCapas(capasData);
            setGrupos(gruposData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Crear capa
    const handleCreateCapa = async () => {
        if (!newCapa.name.trim() || !newCapa.wfsName.trim() || !newCapa.wmsLayer.trim()) {
            alert('Nombre, wfsName y wmsLayer son requeridos');
            return;
        }

        if (!newCapa.group_id || newCapa.group_id === 0) {
            alert('Debes seleccionar un grupo');
            return;
        }

        try {
            await apiService.createCapa(newCapa);
            setNewCapa({
                name: '',
                description: '',
                group_id: 0,
                tipo: 'vector',
                wfsName: '',
                wmsLayer: '',
            });
            setIsAddingNew(false);
            await loadData();
            onCapasChange?.();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    // Eliminar capa
    const handleDeleteCapa = async (id: number, name: string) => {
        if (!confirm(`¿Estás seguro de eliminar la capa "${name}"?`)) {
            return;
        }

        try {
            await apiService.deleteCapa(id);
            await loadData();
            onCapasChange?.();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    if (loading) {
        return (
            <div className="capas-manager">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando capas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="capas-manager">
            <div className="manager-header">
                <h3>🗺️ Capas Geográficas</h3>
                <button
                    className="btn btn-primary"
                    onClick={() => setIsAddingNew(!isAddingNew)}
                    disabled={grupos.length === 0}
                >
                    {isAddingNew ? 'Cancelar' : '+ Nueva Capa'}
                </button>
            </div>

            {grupos.length === 0 && (
                <div className="warning-banner">
                    <span className="warning-icon">⚠️</span>
                    <span>Primero debes crear al menos un grupo en la pestaña "Grupos"</span>
                </div>
            )}

            {error && (
                <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <span>{error}</span>
                    <button onClick={loadData}>Reintentar</button>
                </div>
            )}

            {isAddingNew && (
                <div className="add-capa-form">
                    <h4>Nueva Capa</h4>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>
                                Nombre <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={newCapa.name}
                                onChange={e => setNewCapa({ ...newCapa, name: e.target.value })}
                                placeholder="ej: Volcanes Activos"
                            />
                        </div>
                        <div className="form-field">
                            <label>
                                Grupo <span className="required">*</span>
                            </label>
                            <select
                                className="input"
                                value={newCapa.group_id}
                                onChange={e => setNewCapa({ ...newCapa, group_id: parseInt(e.target.value) })}
                            >
                                <option value={0}>Selecciona un grupo</option>
                                {grupos.map(grupo => (
                                    <option key={grupo.id} value={grupo.id}>
                                        {grupo.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>Tipo</label>
                            <select
                                className="input"
                                value={newCapa.tipo}
                                onChange={e => setNewCapa({ ...newCapa, tipo: e.target.value as 'vector' | 'raster' })}
                            >
                                <option value="vector">Vector</option>
                                <option value="raster">Ráster</option>
                            </select>
                        </div>
                        <div className="form-field full-width">
                            <label>Descripción</label>
                            <input
                                type="text"
                                className="input"
                                value={newCapa.description || ''}
                                onChange={e => setNewCapa({ ...newCapa, description: e.target.value })}
                                placeholder="Breve descripción de la capa"
                            />
                        </div>
                        <div className="form-field">
                            <label>
                                WFS Name <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={newCapa.wfsName}
                                onChange={e => setNewCapa({ ...newCapa, wfsName: e.target.value })}
                                placeholder="ej: Volcanes_activos"
                            />
                        </div>
                        <div className="form-field">
                            <label>
                                WMS Layer <span className="required">*</span>
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={newCapa.wmsLayer}
                                onChange={e => setNewCapa({ ...newCapa, wmsLayer: e.target.value })}
                                placeholder="ej: Volcanes activos"
                            />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={handleCreateCapa}>
                            Crear Capa
                        </button>
                        <button className="btn btn-secondary" onClick={() => setIsAddingNew(false)}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <div className="capas-list">
                {capas.length === 0 ? (
                    <div className="empty-state">
                        <p>No hay capas registradas</p>
                        {grupos.length > 0 && (
                            <button className="btn btn-primary" onClick={() => setIsAddingNew(true)}>
                                Crear Primera Capa
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="capas-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nombre</th>
                                    <th>Grupo</th>
                                    <th>Tipo</th>
                                    <th>WFS Name</th>
                                    <th>WMS Layer</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {capas.map(capa => (
                                    <tr key={capa.id}>
                                        <td>{capa.id}</td>
                                        <td>
                                            <div className="capa-name">
                                                <strong>{capa.name}</strong>
                                                {capa.description && (
                                                    <small>{capa.description}</small>
                                                )}
                                            </div>
                                        </td>
                                        <td>
                                            <span className="badge badge-group">{capa.group}</span>
                                        </td>
                                        <td>
                                            <span className={`badge badge-${capa.type}`}>
                                                {capa.type}
                                            </span>
                                        </td>
                                        <td>
                                            <code>{capa.wfsName}</code>
                                        </td>
                                        <td>
                                            <code>{capa.wmsLayer}</code>
                                        </td>
                                        <td>
                                            <button
                                                className="btn-delete-small"
                                                onClick={() => handleDeleteCapa(capa.id, capa.name)}
                                                title="Eliminar capa"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CapasManager;
