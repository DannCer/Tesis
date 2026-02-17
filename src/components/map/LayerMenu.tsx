import React, { useState, memo } from 'react';
import '../../styles/LayerMenu.css';
import { LayerData } from '../../hooks/useWFSLayers';
import { AVAILABLE_LAYERS, LayerConfig } from '../../config/layers';
import { config } from '../../config/env';

interface LayerMenuProps {
    layers: Record<string, LayerData | any>;
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
    onLayerToggle: (id: string, isActive: boolean, type: 'vector' | 'raster') => void;
    onOpacityChange: (id: string, opacity: number, type: 'vector' | 'raster') => void;
}

/**
 * Genera la URL de descarga para una capa
 */
const getDownloadUrl = (layer: LayerConfig): string => {
    const { geoserver } = config;
    const workspace = geoserver.workspace;
    
    if (layer.type === 'vector') {
        // Formato Shapefile para vectores via WFS
        const params = new URLSearchParams({
            service: 'WFS',
            version: '1.1.0',
            request: 'GetFeature',
            typeName: `${workspace}:${layer.id}`,
            outputFormat: 'SHAPE-ZIP'
        });
        return `${geoserver.wfsUrl}?${params.toString()}`;
    } else {
        // Formato GeoTIFF para rásters via WMS
        // Usamos un BBOX que cubra México (minx, miny, maxx, maxy)
        const params = new URLSearchParams({
            SERVICE: 'WMS',
            VERSION: '1.1.1',
            REQUEST: 'GetMap',
            LAYERS: `${workspace}:${layer.wmsLayer}`,
            FORMAT: 'image/geotiff',
            SRS: 'EPSG:4326',
            BBOX: '-120,14,-86,33',
            WIDTH: '1000',
            HEIGHT: '1000'
        });

        if (layer.timeValue) {
            params.append('TIME', layer.timeValue);
        }

        return `${geoserver.wmsUrl}?${params.toString()}`;
    }
};

/**
 * Componente de menú lateral para control de capas
 */
const LayerMenu: React.FC<LayerMenuProps> = memo(({ 
    layers, 
    loading, 
    errors,
    onLayerToggle,
    onOpacityChange 
}) => {
    const [collapsed, setCollapsed] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const handleCheckboxChange = (layer: LayerConfig, isChecked: boolean) => {
        onLayerToggle(layer.id, isChecked, layer.type);
    };

    const isLayerActive = (layerId: string) => {
        return layers[layerId]?.visible || false;
    };

    const isLayerLoading = (layerId: string) => {
        return loading[layerId] || false;
    };

    const getLayerError = (layerId: string) => {
        return errors[layerId] || null;
    };

    const filteredLayers = AVAILABLE_LAYERS.filter(layer => 
        layer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        layer.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

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
                    <div className="search-container">
                        <input 
                            type="text" 
                            placeholder="Buscar capas..." 
                            className="search-input"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="layers-list">
                        {/* Capas Vectoriales */}
                        {filteredLayers.filter(l => l.type === 'vector').length > 0 && (
                            <div className="layer-group">
                                <h6 className="layer-group-title">Capas Vectoriales</h6>
                                {filteredLayers.filter(l => l.type === 'vector').map(layer => {
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

                                            <div className="layer-actions">
                                                <a 
                                                    href={getDownloadUrl(layer)} 
                                                    className="download-link" 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    title={`Descargar ${layer.type === 'vector' ? 'Shapefile' : 'GeoTIFF'}`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                                        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                                        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                                                    </svg>
                                                </a>

                                                {isActive && (
                                                    <div 
                                                        className="layer-color-indicator"
                                                        style={{ backgroundColor: layer.color }}
                                                    />
                                                )}
                                            </div>

                                            {isActive && (
                                                <div className="layer-opacity-control">
                                                    <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="1" 
                                                        step="0.05" 
                                                        value={layers[layer.id]?.opacity || 0.8}
                                                        onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value), 'vector')}
                                                        className="opacity-slider"
                                                    />
                                                </div>
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
                        )}

                        {/* Capas Ráster */}
                        {filteredLayers.filter(l => l.type === 'raster').length > 0 && (
                            <div className="layer-group">
                                <h6 className="layer-group-title">Uso de Suelo y Vegetación</h6>
                                {filteredLayers.filter(l => l.type === 'raster').map(layer => {
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
                                                    <div className="layer-info">
                                                        <span className="layer-name">
                                                            {layer.name}
                                                            {layer.year && (
                                                                <span className="year-badge">
                                                                    {layer.year}
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span className="layer-description">
                                                            {layer.description}
                                                        </span>
                                                    </div>
                                                </label>
                                            </div>

                                            <div className="layer-actions">
                                                <a 
                                                    href={getDownloadUrl(layer)} 
                                                    className="download-link" 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    title={`Descargar ${layer.type === 'vector' ? 'Shapefile' : 'GeoTIFF'}`}
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                                        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                                        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                                                    </svg>
                                                </a>

                                                {isActive && (
                                                    <div 
                                                        className="layer-color-indicator"
                                                        style={{ backgroundColor: layer.color }}
                                                    />
                                                )}
                                            </div>

                                            {isActive && (
                                                <div className="layer-opacity-control">
                                                    <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                                                    <input 
                                                        type="range" 
                                                        min="0" 
                                                        max="1" 
                                                        step="0.05" 
                                                        value={layers[layer.id]?.opacity || 0.8}
                                                        onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value), 'raster')}
                                                        className="opacity-slider"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    <div className="menu-actions">
                        <button 
                            className="btn-action btn-action-secondary"
                            onClick={() => {
                                AVAILABLE_LAYERS.forEach(layer => {
                                    if (!isLayerActive(layer.id)) {
                                        handleCheckboxChange(layer, true);
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
                                        handleCheckboxChange(layer, false);
                                    }
                                });
                            }}
                        >
                            Desactivar todas
                        </button>
                    </div>

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
                                México
                            </p>
                            <p className="text-muted small mb-1 mt-2">
                                <strong>Series disponibles:</strong>
                            </p>
                            <p className="text-muted small">
                                7 series temporales (1985-2018)
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

LayerMenu.displayName = 'LayerMenu';

export default LayerMenu;
