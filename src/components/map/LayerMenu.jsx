import React, { useState } from 'react';
import PropTypes from 'prop-types';
import '../../styles/layerMenu.css';

/**
 * Configuración de capas disponibles
 */
const AVAILABLE_LAYERS = [
    {
        id: 'vw_estados',  // Cambié wv_ por vw_
        name: 'Estados',
        description: 'Límites estatales',
        icon: '🗺',
        color: '#cd171e'
    },
    {
        id: 'vw_municipios',  // Cambié wv_ por vw_
        name: 'Municipios',
        description: 'Límites municipales',
        icon: '📍',
        color: '#BC955B'
    },
    {
        id: 'vw_localidades',  // Cambié wv_ por vw_
        name: 'Localidades',
        description: 'Localidades urbanas y rurales',
        icon: '🏘',
        color: '#691B31'
    }
];

/**
 * Componente de menú lateral para control de capas
 */
const LayerMenu = ({ 
    layers, 
    loading, 
    errors,
    onLayerToggle 
}) => {
    const [collapsed, setCollapsed] = useState(false);

    /**
     * Maneja el cambio de estado de un checkbox
     */
    const handleCheckboxChange = (layerId, isChecked) => {
        onLayerToggle(layerId, isChecked);
    };

    /**
     * Verifica si una capa está activa
     */
    const isLayerActive = (layerId) => {
        return layers[layerId]?.visible || false;
    };

    /**
     * Verifica si una capa está cargando
     */
    const isLayerLoading = (layerId) => {
        return loading[layerId] || false;
    };

    /**
     * Obtiene el error de una capa
     */
    const getLayerError = (layerId) => {
        return errors[layerId] || null;
    };

    /**
     * Cuenta capas activas
     */
    const activeCount = Object.values(layers).filter(l => l?.visible).length;

    return (
        <div className={`layer-menu ${collapsed ? 'collapsed' : ''}`}>
            {/* Header del menú */}
            <div className="layer-menu-header">
                <div className="header-content">
                    <h3>Capas</h3>
                    {activeCount > 0 && (
                        <span className="active-badge">{activeCount}</span>
                    )}
                </div>
                <button 
                    className="collapse-btn"
                    onClick={() => setCollapsed(!collapsed)}
                    title={collapsed ? 'Expandir' : 'Contraer'}
                >
                    {collapsed ? '→' : '←'}
                </button>
            </div>

            {/* Contenido del menú */}
            {!collapsed && (
                <div className="layer-menu-content">
                    {/* Información general */}
                    <div className="menu-info">
                        <p className="text-muted small mb-3">
                            Selecciona las capas que deseas visualizar en el mapa
                        </p>
                    </div>

                    {/* Lista de capas */}
                    <div className="layers-list">
                        {AVAILABLE_LAYERS.map(layer => {
                            const isActive = isLayerActive(layer.id);
                            const isLoading = isLayerLoading(layer.id);
                            const error = getLayerError(layer.id);
                            const featureCount = layers[layer.id]?.data?.features?.length;

                            return (
                                <div 
                                    key={layer.id} 
                                    className={`layer-item ${isActive ? 'active' : ''}`}
                                >
                                    <div className="layer-checkbox-wrapper">
                                        <input
                                            type="checkbox"
                                            id={layer.id}
                                            className="layer-checkbox"
                                            checked={isActive}
                                            onChange={(e) => handleCheckboxChange(layer.id, e.target.checked)}
                                            disabled={isLoading}
                                        />
                                        <label htmlFor={layer.id} className="layer-label">
                                            <span className="layer-icon">{layer.icon}</span>
                                            <div className="layer-info">
                                                <span className="layer-name">{layer.name}</span>
                                                <span className="layer-description">
                                                    {layer.description}
                                                </span>
                                                {featureCount && (
                                                    <span className="feature-count">
                                                        {featureCount} elementos
                                                    </span>
                                                )}
                                            </div>
                                        </label>
                                    </div>

                                    {/* Color indicator */}
                                    {isActive && (
                                        <div 
                                            className="layer-color-indicator"
                                            style={{ backgroundColor: layer.color }}
                                        />
                                    )}

                                    {/* Estado de carga */}
                                    {isLoading && (
                                        <div className="layer-status">
                                            <div className="spinner-border spinner-border-sm" role="status">
                                                <span className="visually-hidden">Cargando...</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Error */}
                                    {error && (
                                        <div className="layer-error">
                                            <small className="text-danger">
                                                ⚠️ {error}
                                            </small>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Acciones rápidas */}
                    <div className="menu-actions">
                        <button 
                            className="btn-action btn-action-secondary"
                            onClick={() => {
                                AVAILABLE_LAYERS.forEach(layer => {
                                    if (!isLayerActive(layer.id)) {
                                        handleCheckboxChange(layer.id, true);
                                    }
                                });
                            }}
                        >
                            Activar todas
                        </button>
                        <button 
                            className="btn-action btn-action-secondary"
                            onClick={() => {
                                AVAILABLE_LAYERS.forEach(layer => {
                                    if (isLayerActive(layer.id)) {
                                        handleCheckboxChange(layer.id, false);
                                    }
                                });
                            }}
                        >
                            Desactivar todas
                        </button>
                    </div>

                    {/* Información del proyecto */}
                    <div className="menu-footer">
                        <div className="info-section">
                            <h5>Información</h5>
                            <p className="text-muted small mb-1">
                                <strong>Proyecto:</strong>
                            </p>
                            <p className="text-muted small">
                                Monitoreo del Cambio en el Uso de Suelo Urbano
                            </p>
                            <p className="text-muted small mb-1 mt-2">
                                <strong>Área de estudio:</strong>
                            </p>
                            <p className="text-muted small">
                                Valle de México
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

LayerMenu.propTypes = {
    layers: PropTypes.object.isRequired,
    loading: PropTypes.object.isRequired,
    errors: PropTypes.object.isRequired,
    onLayerToggle: PropTypes.func.isRequired
};

export default LayerMenu;