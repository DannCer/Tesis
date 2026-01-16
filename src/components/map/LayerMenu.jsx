import React, { useState } from 'react';
import PropTypes from 'prop-types';
import '../../styles/layerMenu.css';

/**
 * Configuración de capas disponibles
 */
const AVAILABLE_LAYERS = [
    // CAPAS VECTORIALES
    {
        id: 'vw_estados',
        name: 'Estados',
        description: 'Límites estatales',
        icon: '🗺',
        color: '#cd171e',
        type: 'vector'
    },
    {
        id: 'vw_municipios',
        name: 'Municipios',
        description: 'Límites municipales',
        icon: '📍',
        color: '#BC955B',
        type: 'vector'
    },
    {
        id: 'vw_localidades',
        name: 'Localidades',
        description: 'Localidades urbanas y rurales',
        icon: '🏘',
        color: '#691B31',
        type: 'vector'
    },
    // CAPAS RÁSTER (las que tienes configuradas en MapView.jsx)
    {
        id: 'usvserie1',  // Cambia serie1 por usvserie1
        name: 'Serie 1',
        description: 'Uso de suelo serie 1',
        icon: '📊',
        color: '#2E8B57',
        type: 'raster'
    },
    {
        id: 'usvserie2',  // Cambia serie2 por usvserie2
        name: 'Serie 2',
        description: 'Uso de suelo serie 2',
        icon: '📊',
        color: '#4682B4',
        type: 'raster'
    },
    {
        id: 'serie3',
        name: 'Serie 3',
        description: 'Uso de suelo serie 3',
        icon: '📊',
        color: '#FF6347',
        type: 'raster'
    },
    {
        id: 'serie4',
        name: 'Serie 4',
        description: 'Uso de suelo serie 4',
        icon: '📊',
        color: '#9370DB',
        type: 'raster'
    },
    {
        id: 'serie5',
        name: 'Serie 5',
        description: 'Uso de suelo serie 5',
        icon: '📊',
        color: '#20B2AA',
        type: 'raster'
    },
    {
        id: 'serie6',
        name: 'Serie 6',
        description: 'Uso de suelo serie 6',
        icon: '📊',
        color: '#FFD700',
        type: 'raster'
    },
    {
        id: 'serie7',
        name: 'Serie 7',
        description: 'Uso de suelo serie 7',
        icon: '📊',
        color: '#FF69B4',
        type: 'raster'
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
    const handleCheckboxChange = (layer, isChecked) => {
        onLayerToggle(layer.id, isChecked, layer.type);
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
                        {/* Capas Vectoriales */}
                        <div className="layer-group">
                            <h6 className="layer-group-title">Capas Vectoriales</h6>
                            {AVAILABLE_LAYERS.filter(l => l.type === 'vector').map(layer => {
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
                                                onChange={(e) => handleCheckboxChange(layer, e.target.checked)}
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

                                        {isActive && (
                                            <div 
                                                className="layer-color-indicator"
                                                style={{ backgroundColor: layer.color }}
                                            />
                                        )}

                                        {isLoading && (
                                            <div className="layer-status">
                                                <div className="spinner-border spinner-border-sm" role="status">
                                                    <span className="visually-hidden">Cargando...</span>
                                                </div>
                                            </div>
                                        )}

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

                        {/* Capas Ráster */}
                        <div className="layer-group">
                            <h6 className="layer-group-title">Capas Ráster</h6>
                            {AVAILABLE_LAYERS.filter(l => l.type === 'raster').map(layer => {
                                const isActive = isLayerActive(layer.id);

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
                                                onChange={(e) => handleCheckboxChange(layer, e.target.checked)}
                                            />
                                            <label htmlFor={layer.id} className="layer-label">
                                                <span className="layer-icon">{layer.icon}</span>
                                                <div className="layer-info">
                                                    <span className="layer-name">{layer.name}</span>
                                                    <span className="layer-description">
                                                        {layer.description}
                                                    </span>
                                                    <span className="feature-count raster-hint">
                                                        Haz clic para consultar valores
                                                    </span>
                                                </div>
                                            </label>
                                        </div>

                                        {isActive && (
                                            <div 
                                                className="layer-color-indicator"
                                                style={{ backgroundColor: layer.color }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
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