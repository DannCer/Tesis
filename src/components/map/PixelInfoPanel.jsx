import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/pixelInfo.css';

/**
 * Diccionario de clasificaciones para diferentes capas
 * Ajusta estos valores según tus datos
 */
const CLASSIFICATIONS = {
     'usvserie1': {  // Cambia serie1 por usvserie1
        1: 'Uso 1',
        2: 'Uso 2',
        3: 'Uso 3',
        4: 'Uso 4',
        5: 'Uso 5',
        formatter: (value) => `Clasificación: ${value}`
    },
    'serie2': {
        formatter: (value) => `Valor: ${value}`
    },
    'serie3': {
        formatter: (value) => `Valor: ${value}`
    },
    'serie4': {
        formatter: (value) => `Valor: ${value}`
    },
    'serie5': {
        formatter: (value) => `Valor: ${value}`
    },
    'serie6': {
        formatter: (value) => `Valor: ${value}`
    },
    'serie7': {
        formatter: (value) => `Valor: ${value}`
    }
};

/**
 * Componente para mostrar información del píxel consultado
 */
const PixelInfoPanel = ({ pixelInfo, loading, onClose }) => {
    if (!pixelInfo && !loading) return null;

    /**
     * Obtiene la clasificación de un valor
     */
    const getClassification = (layerName, value) => {
        const classification = CLASSIFICATIONS[layerName];
        
        if (!classification) {
            return value;
        }

        if (classification.formatter) {
            return classification.formatter(value);
        }

        return classification[value] || value;
    };

    /**
     * Formatea las coordenadas
     */
    const formatCoordinates = (coords) => {
        if (!coords) return 'N/A';
        return `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
    };

    return (
        <div className="pixel-info-panel">
            <div className="pixel-info-header">
                <h4>Información del Píxel</h4>
                <button 
                    className="close-btn"
                    onClick={onClose}
                    title="Cerrar"
                >
                    ✕
                </button>
            </div>

            <div className="pixel-info-content">
                {loading && (
                    <div className="loading-state">
                        <div className="spinner-border spinner-border-sm" role="status">
                            <span className="visually-hidden">Cargando...</span>
                        </div>
                        <span className="ms-2">Consultando...</span>
                    </div>
                )}

                {pixelInfo && !pixelInfo.error && (
                    <>
                        {/* Coordenadas */}
                        <div className="info-section">
                            <div className="info-label">Coordenadas:</div>
                            <div className="info-value coordinates">
                                {formatCoordinates(pixelInfo.coordinates)}
                            </div>
                        </div>

                        {/* Valores por capa */}
                        {pixelInfo.layers && pixelInfo.layers.length > 0 && (
                            <div className="info-section">
                                <div className="info-label">Valores:</div>
                                <div className="layers-values">
                                    {pixelInfo.layers.map((layer, index) => (
                                        <div key={index} className="layer-value-item">
                                            <div className="layer-name">
                                                {layer.layerName}
                                            </div>
                                            {layer.value !== null ? (
                                                <div className="layer-value">
                                                    <span className="value-badge">
                                                        {getClassification(layer.layerName, layer.value)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="layer-value no-data">
                                                    Sin datos
                                                </div>
                                            )}
                                            {layer.error && (
                                                <div className="layer-error">
                                                    <small className="text-danger">
                                                        {layer.error}
                                                    </small>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {pixelInfo && pixelInfo.error && (
                    <div className="error-state">
                        <div className="alert alert-danger mb-0">
                            <small>
                                <strong>Error:</strong> {pixelInfo.error}
                            </small>
                        </div>
                    </div>
                )}
            </div>

            <div className="pixel-info-footer">
                <small className="text-muted">
                    Haz clic en el mapa para consultar valores
                </small>
            </div>
        </div>
    );
};

PixelInfoPanel.propTypes = {
    pixelInfo: PropTypes.shape({
        coordinates: PropTypes.arrayOf(PropTypes.number),
        layers: PropTypes.arrayOf(PropTypes.shape({
            layerName: PropTypes.string,
            value: PropTypes.any,
            error: PropTypes.string
        })),
        error: PropTypes.string,
        timestamp: PropTypes.number
    }),
    loading: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired
};

export default PixelInfoPanel;