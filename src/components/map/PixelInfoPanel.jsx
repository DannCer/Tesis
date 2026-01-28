import React from 'react';
import PropTypes from 'prop-types';
import '../../styles/pixelInfo.css';

/**
 * Diccionario de clasificaciones de uso de suelo
 * Basado en las series de INEGI - ajusta según tus datos reales
 */
const USO_SUELO_CLASIFICACIONES = {
    1: { nombre: 'Agricultura de riego', color: '#8B4513' },
    2: { nombre: 'Agricultura de temporal', color: '#F4A460' },
    3: { nombre: 'Bosque', color: '#228B22' },
    4: { nombre: 'Selva', color: '#006400' },
    5: { nombre: 'Matorral', color: '#9ACD32' },
    6: { nombre: 'Pastizal', color: '#ADFF2F' },
    7: { nombre: 'Zona urbana', color: '#DC143C' },
    8: { nombre: 'Cuerpo de agua', color: '#1E90FF' },
    9: { nombre: 'Sin vegetación', color: '#D3D3D3' },
    10: { nombre: 'Área sin clasificar', color: '#FFFFFF' },
    // Añade más clasificaciones según tu leyenda
};

/**
 * Componente para mostrar información del píxel consultado
 */
const PixelInfoPanel = ({ pixelInfo, loading, onClose }) => {
    if (!pixelInfo && !loading) return null;

    /**
     * Obtiene la clasificación de un valor de uso de suelo
     */
    const getClasificacion = (value) => {
        if (value === null || value === undefined) {
            return { nombre: 'Sin datos', color: '#E0E0E0' };
        }
        
        return USO_SUELO_CLASIFICACIONES[value] || { 
            nombre: `Clasificación ${value}`, 
            color: '#CCCCCC' 
        };
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
                <h4>📊 Consulta de Píxel</h4>
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
                        <span className="ms-2">Consultando valores...</span>
                    </div>
                )}

                {pixelInfo && !pixelInfo.error && (
                    <>
                        {/* Coordenadas */}
                        <div className="info-section">
                            <div className="info-label">
                                <span style={{ marginRight: '8px' }}>📍</span>
                                Coordenadas:
                            </div>
                            <div className="info-value coordinates">
                                {formatCoordinates(pixelInfo.coordinates)}
                            </div>
                        </div>

                        {/* Valores por serie */}
                        {pixelInfo.layers && pixelInfo.layers.length > 0 && (
                            <div className="info-section">
                                <div className="info-label">
                                    <span style={{ marginRight: '8px' }}>🗺️</span>
                                    Uso de Suelo por Serie:
                                </div>
                                <div className="layers-values">
                                    {pixelInfo.layers.map((layer, index) => {
                                        const clasificacion = getClasificacion(layer.value);
                                        
                                        return (
                                            <div key={index} className="layer-value-item">
                                                <div className="serie-header">
                                                    <span className="serie-name">
                                                        {layer.serieName || layer.layerName}
                                                    </span>
                                                    <span className="serie-year">
                                                        {layer.year}
                                                    </span>
                                                </div>
                                                
                                                {layer.value !== null && layer.value !== undefined ? (
                                                    <div className="layer-value">
                                                        <div 
                                                            className="color-indicator"
                                                            style={{ backgroundColor: clasificacion.color }}
                                                        />
                                                        <span className="clasificacion-nombre">
                                                            {clasificacion.nombre}
                                                        </span>
                                                        <span className="valor-numerico">
                                                            (Valor: {layer.value})
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="layer-value no-data">
                                                        <span style={{ marginRight: '8px' }}>⚠️</span>
                                                        Sin datos en esta ubicación
                                                    </div>
                                                )}
                                                
                                                {layer.error && (
                                                    <div className="layer-error">
                                                        <small className="text-danger">
                                                            ❌ {layer.error}
                                                        </small>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Información adicional si es útil */}
                        {pixelInfo.layers && pixelInfo.layers.length > 1 && (
                            <div className="info-section">
                                <small className="text-muted" style={{ fontSize: '11px', display: 'block', marginTop: '8px' }}>
                                    💡 Comparando {pixelInfo.layers.length} series temporales
                                </small>
                            </div>
                        )}
                    </>
                )}

                {pixelInfo && pixelInfo.error && (
                    <div className="error-state">
                        <div className="alert alert-danger mb-0">
                            <small>
                                <strong>❌ Error:</strong> {pixelInfo.error}
                            </small>
                        </div>
                    </div>
                )}
            </div>

            <div className="pixel-info-footer">
                <small className="text-muted">
                    💡 Haz clic en el mapa para consultar valores
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
            serieName: PropTypes.string,
            year: PropTypes.number,
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
