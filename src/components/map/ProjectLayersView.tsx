/**
 * @fileoverview Componente para mostrar capas agrupadas por proyecto QGIS
 * @module components/map/ProjectLayersView
 */

import React, { useState } from 'react';
import { useProjectLayers } from '../../hooks/useProjectLayers';
import '../../styles/ProjectLayersView.css';

const ProjectLayersView: React.FC = () => {
    const {
        projectLayersGroups,
        loading,
        errors,
        toggleLayer,
        enableAllProjectLayers,
        disableAllProjectLayers,
        reloadProjectCapabilities,
    } = useProjectLayers();

    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

    const toggleProject = (projectId: string) => {
        setExpandedProjects(prev => ({
            ...prev,
            [projectId]: !prev[projectId],
        }));
    };

    if (projectLayersGroups.length === 0) {
        return (
            <div className="project-layers-empty">
                <p>No hay proyectos activos configurados</p>
                <small>Configura proyectos QGIS Server en la sección de gestión</small>
            </div>
        );
    }

    return (
        <div className="project-layers-view">
            {projectLayersGroups.map(group => {
                const isExpanded = expandedProjects[group.project.id] ?? true;
                const isLoading = loading[group.project.id];
                const error = errors[group.project.id];
                const enabledCount = group.layers.filter(l => l.enabled).length;

                return (
                    <div key={group.project.id} className="project-group">
                        {/* Project Header */}
                        <div className="project-group-header">
                            <div className="project-header-left">
                                <div
                                    className="project-color-indicator"
                                    style={{ backgroundColor: group.project.color }}
                                />
                                <button
                                    className="project-expand-btn"
                                    onClick={() => toggleProject(group.project.id)}
                                >
                                    {isExpanded ? '▼' : '▶'}
                                </button>
                                <div className="project-info">
                                    <h4>{group.project.name}</h4>
                                    <div className="project-stats">
                                        <span className="stat-badge">
                                            {enabledCount}/{group.layers.length} activas
                                        </span>
                                        <span className="stat-badge wms">
                                            WMS: {group.wmsCount}
                                        </span>
                                        <span className="stat-badge wfs">
                                            WFS: {group.wfsCount}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="project-header-actions">
                                {group.layers.length > 0 && (
                                    <>
                                        <button
                                            className="btn-icon"
                                            onClick={() => enableAllProjectLayers(group.project.id)}
                                            title="Activar todas"
                                        >
                                            ✓
                                        </button>
                                        <button
                                            className="btn-icon"
                                            onClick={() => disableAllProjectLayers(group.project.id)}
                                            title="Desactivar todas"
                                        >
                                            ✕
                                        </button>
                                    </>
                                )}
                                <button
                                    className="btn-icon"
                                    onClick={() => reloadProjectCapabilities(group.project.id)}
                                    title="Recargar capas"
                                    disabled={isLoading}
                                >
                                    {isLoading ? '⟳' : '↻'}
                                </button>
                            </div>
                        </div>

                        {/* Loading State */}
                        {isLoading && (
                            <div className="project-loading">
                                <div className="loading-spinner"></div>
                                <span>Cargando capas...</span>
                            </div>
                        )}

                        {/* Error State */}
                        {error && !isLoading && (
                            <div className="project-error">
                                <span className="error-icon">⚠️</span>
                                <span>{error}</span>
                            </div>
                        )}

                        {/* Layers List */}
                        {isExpanded && !isLoading && !error && group.layers.length > 0 && (
                            <div className="project-layers-list">
                                {group.layers.map(layer => (
                                    <div
                                        key={layer.layerId}
                                        className={`layer-item ${layer.enabled ? 'active' : ''}`}
                                    >
                                        <label className="layer-label">
                                            <input
                                                type="checkbox"
                                                checked={layer.enabled}
                                                onChange={() => toggleLayer(layer.layerId)}
                                            />
                                            <div className="layer-content">
                                                <div className="layer-title">
                                                    {layer.layerTitle}
                                                </div>
                                                <div className="layer-meta">
                                                    <span className={`layer-type ${layer.layerType}`}>
                                                        {layer.layerType.toUpperCase()}
                                                    </span>
                                                    <span className="layer-name">
                                                        {layer.layerName}
                                                    </span>
                                                </div>
                                            </div>
                                        </label>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Empty State */}
                        {isExpanded && !isLoading && !error && group.layers.length === 0 && (
                            <div className="project-empty">
                                <p>No se detectaron capas en este proyecto</p>
                                <small>Verifica que el proyecto .qgz tenga capas publicadas</small>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};

export default ProjectLayersView;
