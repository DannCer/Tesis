/**
 * @fileoverview Componente para gestionar proyectos QGIS Server
 * @module components/map/ProjectsManager
 */

import React, { useState, useEffect } from 'react';
import { projectsService } from '../../services/projectsService';
import { QgisProject, ProjectCapabilities } from '../../types/projects';
import '@styles/ProjectsManager.css';

interface ProjectsManagerProps {
    onProjectsChange?: () => void;
}

const ProjectsManager: React.FC<ProjectsManagerProps> = ({ onProjectsChange }) => {
    const [projects, setProjects] = useState<QgisProject[]>([]);
    const [editingProject, setEditingProject] = useState<QgisProject | null>(null);
    const [newProject, setNewProject] = useState({
        name: '',
        serverUrl: 'http://localhost/qgis/qgis_mapserv.fcgi.exe',
        projectPath: '',
        color: '#3182ce',
        enabled: true,
    });
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [capabilities, setCapabilities] = useState<Record<string, ProjectCapabilities>>({});
    const [loadingCapabilities, setLoadingCapabilities] = useState<Record<string, boolean>>({});

    useEffect(() => {
        loadProjects();
    }, []);

    const loadProjects = () => {
        const loaded = projectsService.getProjects();
        setProjects(loaded);
    };

    const handleAddProject = () => {
        if (!newProject.name || !newProject.projectPath) {
            alert('Por favor completa el nombre y la ruta del proyecto');
            return;
        }

        projectsService.addProject(newProject);
        setNewProject({
            name: '',
            serverUrl: 'http://localhost/qgis/qgis_mapserv.fcgi.exe',
            projectPath: '',
            color: '#3182ce',
            enabled: true,
        });
        setIsAddingNew(false);
        loadProjects();
        onProjectsChange?.();
    };

    const handleUpdateProject = (id: string, updates: Partial<QgisProject>) => {
        projectsService.updateProject(id, updates);
        setEditingProject(null);
        loadProjects();
        onProjectsChange?.();
    };

    const handleDeleteProject = (id: string) => {
        if (confirm('¿Estás seguro de eliminar este proyecto?')) {
            projectsService.deleteProject(id);
            loadProjects();
            onProjectsChange?.();
        }
    };

    const handleToggleProject = (id: string, enabled: boolean) => {
        projectsService.updateProject(id, { enabled });
        loadProjects();
        onProjectsChange?.();
    };

    const handleLoadCapabilities = async (projectId: string) => {
        setLoadingCapabilities(prev => ({ ...prev, [projectId]: true }));
        try {
            const caps = await projectsService.getProjectCapabilities(projectId);
            if (caps) {
                setCapabilities(prev => ({ ...prev, [projectId]: caps }));
            }
        } catch (error) {
            console.error('Error cargando capacidades:', error);
            alert('Error al cargar las capacidades del proyecto');
        } finally {
            setLoadingCapabilities(prev => ({ ...prev, [projectId]: false }));
        }
    };

    const colorOptions = [
        { value: '#e53e3e', label: '🔴 Rojo' },
        { value: '#3182ce', label: '🔵 Azul' },
        { value: '#38a169', label: '🟢 Verde' },
        { value: '#d69e2e', label: '🟡 Amarillo' },
        { value: '#805ad5', label: '🟣 Morado' },
        { value: '#dd6b20', label: '🟠 Naranja' },
    ];

    return (
        <div className="projects-manager">
            <div className="projects-header">
                <h3>Proyectos QGIS Server</h3>
                <button
                    className="btn btn-sm btn-primary"
                    onClick={() => setIsAddingNew(!isAddingNew)}
                >
                    {isAddingNew ? 'Cancelar' : '+ Agregar Proyecto'}
                </button>
            </div>

            {isAddingNew && (
                <div className="project-form">
                    <h4>Nuevo Proyecto</h4>
                    <div className="form-group">
                        <label>Nombre del Proyecto</label>
                        <input
                            type="text"
                            className="form-control"
                            value={newProject.name}
                            onChange={e => setNewProject({ ...newProject, name: e.target.value })}
                            placeholder="ej: Geológicos"
                        />
                    </div>
                    <div className="form-group">
                        <label>URL del Servidor QGIS</label>
                        <input
                            type="text"
                            className="form-control"
                            value={newProject.serverUrl}
                            onChange={e => setNewProject({ ...newProject, serverUrl: e.target.value })}
                            placeholder="http://localhost/qgis/qgis_mapserv.fcgi.exe"
                        />
                    </div>
                    <div className="form-group">
                        <label>Ruta del Proyecto (.qgz)</label>
                        <input
                            type="text"
                            className="form-control"
                            value={newProject.projectPath}
                            onChange={e => setNewProject({ ...newProject, projectPath: e.target.value })}
                            placeholder="C:/mis_proyectos/01_Geologicos.qgz"
                        />
                    </div>
                    <div className="form-group">
                        <label>Color Identificador</label>
                        <select
                            className="form-control"
                            value={newProject.color}
                            onChange={e => setNewProject({ ...newProject, color: e.target.value })}
                        >
                            {colorOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={handleAddProject}>
                            Agregar Proyecto
                        </button>
                        <button className="btn btn-secondary" onClick={() => setIsAddingNew(false)}>
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            <div className="projects-list">
                {projects.map(project => (
                    <div key={project.id} className="project-card">
                        <div className="project-header">
                            <div className="project-info">
                                <div
                                    className="project-color"
                                    style={{ backgroundColor: project.color }}
                                />
                                {editingProject?.id === project.id ? (
                                    <input
                                        type="text"
                                        className="form-control form-control-sm"
                                        value={editingProject.name}
                                        onChange={e => setEditingProject({ ...editingProject, name: e.target.value })}
                                        onBlur={() => handleUpdateProject(project.id, { name: editingProject.name })}
                                        onKeyPress={e => {
                                            if (e.key === 'Enter') {
                                                handleUpdateProject(project.id, { name: editingProject.name });
                                            }
                                        }}
                                        autoFocus
                                    />
                                ) : (
                                    <h4
                                        onClick={() => setEditingProject(project)}
                                        style={{ cursor: 'pointer' }}
                                        title="Clic para editar"
                                    >
                                        {project.name}
                                    </h4>
                                )}
                            </div>
                            <div className="project-actions">
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={project.enabled}
                                        onChange={e => handleToggleProject(project.id, e.target.checked)}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                                <button
                                    className="btn btn-sm btn-danger"
                                    onClick={() => handleDeleteProject(project.id)}
                                    title="Eliminar proyecto"
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>

                        <div className="project-details">
                            <p className="project-path">
                                <strong>Ruta:</strong> {project.projectPath}
                            </p>
                            <p className="project-url">
                                <strong>URL:</strong>{' '}
                                <code>{project.serverUrl}</code>
                            </p>
                        </div>

                        <div className="project-capabilities">
                            <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => handleLoadCapabilities(project.id)}
                                disabled={loadingCapabilities[project.id]}
                            >
                                {loadingCapabilities[project.id]
                                    ? 'Cargando...'
                                    : capabilities[project.id]
                                    ? 'Recargar Capas'
                                    : 'Detectar Capas'}
                            </button>

                            {capabilities[project.id] && (
                                <div className="capabilities-info">
                                    <div className="cap-stat">
                                        <strong>WMS:</strong> {capabilities[project.id].wmsLayers.length} capas
                                    </div>
                                    <div className="cap-stat">
                                        <strong>WFS:</strong> {capabilities[project.id].wfsLayers.length} capas
                                    </div>
                                    <details className="layers-list">
                                        <summary>Ver capas detectadas</summary>
                                        <div className="layers-content">
                                            <h5>Capas WMS:</h5>
                                            <ul>
                                                {capabilities[project.id].wmsLayers.map((layer, idx) => (
                                                    <li key={idx}>
                                                        <strong>{layer.title}</strong>
                                                        <br />
                                                        <small>{layer.name}</small>
                                                    </li>
                                                ))}
                                            </ul>
                                            <h5>Capas WFS:</h5>
                                            <ul>
                                                {capabilities[project.id].wfsLayers.map((layer, idx) => (
                                                    <li key={idx}>
                                                        <strong>{layer.title}</strong>
                                                        <br />
                                                        <small>{layer.name}</small>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </details>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {projects.length === 0 && (
                <div className="empty-state">
                    <p>No hay proyectos configurados</p>
                    <button className="btn btn-primary" onClick={() => setIsAddingNew(true)}>
                        Agregar Primer Proyecto
                    </button>
                </div>
            )}
        </div>
    );
};

export default ProjectsManager;
