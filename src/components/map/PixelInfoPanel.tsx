import React, { useRef, useState, useEffect, useCallback } from 'react';
import '../../styles/pixelInfo.css';
import { MapPixelData } from '../../hooks/useRasterLayers';
import { LAND_USE_CLASSES } from '../../config/layers';

interface PixelInfoPanelProps {
    pixelInfo: MapPixelData | null;
    loading: boolean;
    onClose: () => void;
}

const PixelInfoPanel: React.FC<PixelInfoPanelProps> = ({ pixelInfo, loading, onClose }) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const dragState = useRef({ dragging: false, startX: 0, startY: 0, initLeft: 0, initTop: 0 });
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    // Inicializar posición desde CSS la primera vez que aparece
    useEffect(() => {
        if ((pixelInfo || loading) && !pos && panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            setPos({ top: rect.top, left: rect.left });
        }
    }, [pixelInfo, loading]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
        // Ignorar clicks en botones
        if ((e.target as HTMLElement).closest('button')) return;
        e.preventDefault();
        const panel = panelRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        dragState.current = {
            dragging: true,
            startX: e.clientX,
            startY: e.clientY,
            initLeft: rect.left,
            initTop: rect.top,
        };

        const onMove = (me: MouseEvent) => {
            if (!dragState.current.dragging) return;
            const dx = me.clientX - dragState.current.startX;
            const dy = me.clientY - dragState.current.startY;
            const newLeft = dragState.current.initLeft + dx;
            const newTop = dragState.current.initTop + dy;
            // Limitar al viewport
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            setPos({
                left: Math.max(0, Math.min(window.innerWidth - w, newLeft)),
                top: Math.max(0, Math.min(window.innerHeight - h, newTop)),
            });
        };

        const onUp = () => {
            dragState.current.dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, []);

    const getClasificacion = (value: any) => {
        if (value === null || value === undefined) return { nombre: 'Sin datos', color: '#E0E0E0' };
        const numericValue = typeof value === 'string' ? parseInt(value) : value;
        return LAND_USE_CLASSES[numericValue] || { nombre: `Clasificación ${value}`, color: '#CCCCCC' };
    };

    const formatCoordinates = (coords: [number, number] | undefined) => {
        if (!coords) return 'N/A';
        return `${coords[0].toFixed(6)}, ${coords[1].toFixed(6)}`;
    };

    if (!pixelInfo && !loading) return null;

    const panelStyle: React.CSSProperties = pos
        ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto', animation: 'none' }
        : {};

    return (
        <div
            className="pixel-info-panel"
            ref={panelRef}
            style={panelStyle}
        >
            {/* Header arrastrable */}
            <div
                className="pixel-info-header"
                onMouseDown={onMouseDown}
                style={{ cursor: 'grab' }}
            >
                <div className="pixel-header-left">
                    {/* Ícono de drag */}
                    <svg className="drag-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style={{ opacity: 0.6, marginRight: '8px', flexShrink: 0 }}>
                        <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                    </svg>
                    <h4>Consulta de Píxel</h4>
                </div>
                <button className="close-btn" onClick={onClose} title="Cerrar" style={{ cursor: 'pointer' }}>✕</button>
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
                        <div className="info-section">
                            <div className="info-label">Coordenadas:</div>
                            <div className="info-value coordinates">
                                {formatCoordinates(pixelInfo.coordinates)}
                            </div>
                        </div>

                        {pixelInfo.layers && pixelInfo.layers.length > 0 && (
                            <div className="info-section">
                                <div className="info-label">Uso de Suelo por Serie:</div>
                                <div className="layers-values">
                                    {pixelInfo.layers.map((layer, index) => {
                                        const clasificacion = getClasificacion(layer.value);
                                        return (
                                            <div key={index} className="layer-value-item">
                                                <div className="serie-header">
                                                    <span className="serie-name">{layer.serieName || layer.layerName}</span>
                                                    <span className="serie-year">{layer.year}</span>
                                                </div>
                                                {layer.value !== null && layer.value !== undefined ? (
                                                    <div className="layer-value">
                                                        <div className="color-indicator" style={{ backgroundColor: clasificacion.color }} />
                                                        <span className="clasificacion-nombre">{clasificacion.nombre}</span>
                                                        <span className="valor-numerico">(Valor: {layer.value})</span>
                                                    </div>
                                                ) : (
                                                    <div className="layer-value no-data">
                                                        <span style={{ marginRight: '8px' }}>⚠️</span>
                                                        Sin datos en esta ubicación
                                                    </div>
                                                )}
                                                {layer.error && (
                                                    <div className="layer-error">
                                                        <small className="text-danger">❌ {layer.error}</small>
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
                            <small><strong>❌ Error:</strong> {pixelInfo.error}</small>
                        </div>
                    </div>
                )}
            </div>

            <div className="pixel-info-footer">
                <small className="text-muted">💡 Haz clic en el mapa para consultar valores</small>
            </div>
        </div>
    );
};

export default PixelInfoPanel;
