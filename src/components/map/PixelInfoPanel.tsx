import React from 'react';
import '../../styles/pixelInfo.css';
import { MapPixelData } from '../../hooks/useRasterLayers';
import { LAND_USE_CLASSES } from '../../config/layers';

interface PixelInfoPanelProps {
    pixelInfo: MapPixelData | null;
    loading: boolean;
    onClose: () => void;
}

/**
 * Componente para mostrar información del píxel consultado
 */
const PixelInfoPanel: React.FC<PixelInfoPanelProps> = ({ pixelInfo, loading, onClose }) => {
    if (!pixelInfo && !loading) return null;

    /**
     * Obtiene la clasificación de un valor de uso de suelo
     */
    const getClasificacion = (value: any) => {
        if (value === null || value === undefined) {
            return { nombre: 'Sin datos', color: '#E0E0E0' };
        }
        
        const numericValue = typeof value === 'string' ? parseInt(value) : value;
        return LAND_USE_CLASSES[numericValue] || { 
            nombre: `Clasificación ${value}`, 
            color: '#CCCCCC' 
        };
    };

    /**
     * Formatea las coordenadas
     */
    const formatCoordinates = (coords: [number, number] | undefined) => {
        if (!coords) return 'N/A';
        return `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
    };

    return (
        <div className="pixel-info-panel">
            <div className="pixel-info-header">
                <h4>Consulta de Píxel</h4>
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

export default PixelInfoPanel;
