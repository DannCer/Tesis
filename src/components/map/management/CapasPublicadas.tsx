/**
 * @fileoverview Componente para visualizar capas publicadas desde la API
 * @module components/map/CapasPublicadas
 */

import React from 'react';
import { usePublishedLayers } from '@hooks/api';
import '@styles/CapasPublicadas.css';

const CapasPublicadas: React.FC = () => {
    const { vectorLayers, rasterLayers, grupos, loading, error, refresh } = usePublishedLayers();

    if (loading) {
        return (
            <div className="capas-publicadas">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando capas publicadas...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="capas-publicadas">
                <div className="error-state">
                    <span className="error-icon">⚠️</span>
                    <h3>Error al cargar capas</h3>
                    <p>{error}</p>
                    <button className="btn btn-primary" onClick={refresh}>
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    const totalCapas = vectorLayers.length + rasterLayers.length;

    // Agrupar capas por grupo
    const capasPorGrupo = new Map<string, { vector: typeof vectorLayers; raster: typeof rasterLayers }>();

    vectorLayers.forEach(layer => {
        if (!capasPorGrupo.has(layer.group)) {
            capasPorGrupo.set(layer.group, { vector: [], raster: [] });
        }
        capasPorGrupo.get(layer.group)!.vector.push(layer);
    });

    rasterLayers.forEach(layer => {
        if (!capasPorGrupo.has(layer.group)) {
            capasPorGrupo.set(layer.group, { vector: [], raster: [] });
        }
        capasPorGrupo.get(layer.group)!.raster.push(layer);
    });

    return (
        <div className="capas-publicadas">
            <div className="publicadas-header">
                <div className="header-info">
                    <h3>🗺️ Capas Publicadas</h3>
                    <p>Capas disponibles desde la API del backend</p>
                </div>
                <button className="btn btn-secondary" onClick={refresh}>
                    ↻ Actualizar
                </button>
            </div>

            <div className="stats-grid">
                <div className="stat-card">
                    <div className="stat-value">{totalCapas}</div>
                    <div className="stat-label">Total de Capas</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{vectorLayers.length}</div>
                    <div className="stat-label">Capas Vectoriales</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{rasterLayers.length}</div>
                    <div className="stat-label">Capas Ráster</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{grupos.length}</div>
                    <div className="stat-label">Grupos</div>
                </div>
            </div>

            {totalCapas === 0 ? (
                <div className="empty-state">
                    <p>No hay capas publicadas</p>
                    <small>Agrega capas desde la sección de "Gestión de Capas"</small>
                </div>
            ) : (
                <div className="grupos-container">
                    {Array.from(capasPorGrupo.entries()).map(([grupoNombre, capas]) => {
                        const totalGrupo = capas.vector.length + capas.raster.length;
                        
                        return (
                            <div key={grupoNombre} className="grupo-section">
                                <div className="grupo-header">
                                    <h4>{grupoNombre}</h4>
                                    <span className="grupo-count">
                                        {totalGrupo} capa{totalGrupo !== 1 ? 's' : ''}
                                    </span>
                                </div>

                                {capas.vector.length > 0 && (
                                    <div className="capas-type-section">
                                        <h5>
                                            <span className="type-badge vector">Vector</span>
                                            {capas.vector.length} capa{capas.vector.length !== 1 ? 's' : ''}
                                        </h5>
                                        <div className="capas-grid">
                                            {capas.vector.map(layer => (
                                                <div key={layer.id} className="capa-card">
                                                    <div className="capa-header">
                                                        <h6>{layer.name}</h6>
                                                        <span className="capa-id">{layer.id}</span>
                                                    </div>
                                                    {layer.description && (
                                                        <p className="capa-description">{layer.description}</p>
                                                    )}
                                                    <div className="capa-details">
                                                        <div className="detail-item">
                                                            <strong>WFS:</strong>
                                                            <code>{layer.wfsName}</code>
                                                        </div>
                                                        <div className="detail-item">
                                                            <strong>WMS:</strong>
                                                            <code>{layer.wmsLayer}</code>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {capas.raster.length > 0 && (
                                    <div className="capas-type-section">
                                        <h5>
                                            <span className="type-badge raster">Ráster</span>
                                            {capas.raster.length} capa{capas.raster.length !== 1 ? 's' : ''}
                                        </h5>
                                        <div className="capas-grid">
                                            {capas.raster.map(layer => (
                                                <div key={layer.id} className="capa-card">
                                                    <div className="capa-header">
                                                        <h6>{layer.name}</h6>
                                                        <span className="capa-id">{layer.id}</span>
                                                    </div>
                                                    {layer.description && (
                                                        <p className="capa-description">{layer.description}</p>
                                                    )}
                                                    <div className="capa-details">
                                                        <div className="detail-item">
                                                            <strong>WMS:</strong>
                                                            <code>{layer.wmsLayer}</code>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default CapasPublicadas;
