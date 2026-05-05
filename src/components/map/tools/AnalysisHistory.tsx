/**
 * AnalysisHistory - Componente para mostrar y gestionar el historial
 * 
 * Permite ver análisis anteriores, recargarlos y eliminarlos.
 */

import React, { useState, useEffect } from 'react';
import { 
    getAnalysisHistory, 
    removeAnalysisFromHistory, 
    clearAnalysisHistory,
    formatTimestamp,
    formatRelativeTime,
    type AnalysisHistory as AnalysisHistoryType
} from './analysisToolUtils';
import '@styles/AnalysisHistory.css';

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

interface AnalysisHistoryProps {
    onLoadAnalysis?: (analysis: AnalysisHistoryType) => void;
    onClose?: () => void;
}

const MODE_LABELS = {
    point: '📍 Punto',
    line: '📏 Línea',
    polygon: '⬟ Polígono'
};

const UNIT_LABELS = {
    kilometers: 'km',
    meters: 'm',
    miles: 'mi'
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTE
// ═══════════════════════════════════════════════════════════════════════════

export const AnalysisHistory: React.FC<AnalysisHistoryProps> = ({ 
    onLoadAnalysis,
    onClose 
}) => {
    const [history, setHistory] = useState<AnalysisHistoryType[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

    // Cargar historial al montar
    useEffect(() => {
        setHistory(getAnalysisHistory());
    }, []);

    // ── Handlers ────────────────────────────────────────────────────────────

    const handleLoadAnalysis = (analysis: AnalysisHistoryType) => {
        if (onLoadAnalysis) {
            onLoadAnalysis(analysis);
        }
    };

    const handleDeleteAnalysis = (id: string) => {
        removeAnalysisFromHistory(id);
        setHistory(getAnalysisHistory());
        setShowDeleteConfirm(null);
    };

    const handleClearAll = () => {
        if (confirm('¿Eliminar todo el historial de análisis?')) {
            clearAnalysisHistory();
            setHistory([]);
        }
    };

    const toggleExpanded = (id: string) => {
        setExpanded(expanded === id ? null : id);
    };

    // ── Render ──────────────────────────────────────────────────────────────

    if (history.length === 0) {
        return (
            <div className="ah-container">
                <div className="ah-header">
                    <h3 className="ah-title">📜 Historial de Análisis</h3>
                    {onClose && (
                        <button className="ah-close-btn" onClick={onClose} aria-label="Cerrar">
                            ✕
                        </button>
                    )}
                </div>
                <div className="ah-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>No hay análisis guardados</p>
                    <p className="ah-empty-hint">
                        Los análisis se guardan automáticamente después de ejecutarlos
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="ah-container">
            <div className="ah-header">
                <h3 className="ah-title">📜 Historial de Análisis</h3>
                <div className="ah-header-actions">
                    <button 
                        className="ah-clear-btn"
                        onClick={handleClearAll}
                        title="Limpiar historial"
                    >
                        🗑️ Limpiar todo
                    </button>
                    {onClose && (
                        <button className="ah-close-btn" onClick={onClose} aria-label="Cerrar">
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className="ah-list">
                {history.map((item) => {
                    const isExpanded = expanded === item.id;
                    const totalFeatures = item.results?.reduce((sum, r) => sum + (r.count ?? 0), 0) || 0;
                    const layersWithData = item.results?.filter(r => (r.count ?? 0) > 0).length || 0;

                    return (
                        <div key={item.id} className="ah-item">
                            <div className="ah-item-header" onClick={() => toggleExpanded(item.id)}>
                                <div className="ah-item-main">
                                    <div className="ah-item-mode">
                                        {MODE_LABELS[item.mode]}
                                    </div>
                                    <div className="ah-item-meta">
                                        <span className="ah-item-time" title={formatTimestamp(item.timestamp)}>
                                            {formatRelativeTime(item.timestamp)}
                                        </span>
                                        {(item.mode === 'point' || item.mode === 'line') && (
                                            <span className="ah-item-buffer">
                                                Buffer: {item.distance} {UNIT_LABELS[item.unit]}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button 
                                    className="ah-expand-btn"
                                    aria-label={isExpanded ? 'Contraer' : 'Expandir'}
                                >
                                    {isExpanded ? '▼' : '▶'}
                                </button>
                            </div>

                            <div className="ah-item-summary">
                                <div className="ah-summary-stat">
                                    <span className="ah-summary-value">{totalFeatures.toLocaleString()}</span>
                                    <span className="ah-summary-label">features</span>
                                </div>
                                <div className="ah-summary-stat">
                                    <span className="ah-summary-value">{layersWithData}</span>
                                    <span className="ah-summary-label">capas</span>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="ah-item-details">
                                    {/* Mediciones */}
                                    {item.measurements && Object.keys(item.measurements).length > 0 && (
                                        <div className="ah-measurements">
                                            <h4 className="ah-section-title">Mediciones</h4>
                                            {item.measurements.length && (
                                                <div className="ah-measurement">
                                                    Longitud: <strong>{(item.measurements.length / 1000).toFixed(2)} km</strong>
                                                </div>
                                            )}
                                            {item.measurements.area && (
                                                <div className="ah-measurement">
                                                    Área: <strong>{(item.measurements.area / 1000000).toFixed(2)} km²</strong>
                                                </div>
                                            )}
                                            {item.measurements.buffer && (
                                                <div className="ah-measurement">
                                                    Buffer: <strong>{(item.measurements.buffer / 1000).toFixed(2)} km</strong>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Top resultados */}
                                    {item.results && (
                                        <div className="ah-results">
                                            <h4 className="ah-section-title">Top Resultados</h4>
                                            {item.results
                                                .filter(r => (r.count ?? 0) > 0)
                                                .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
                                                .slice(0, 5)
                                                .map(result => (
                                                    <div key={result.layerId} className="ah-result-item">
                                                        <span className="ah-result-name">{result.layerName}</span>
                                                        <span className="ah-result-count">{result.count?.toLocaleString()}</span>
                                                    </div>
                                                ))
                                            }
                                        </div>
                                    )}

                                    {/* Acciones */}
                                    <div className="ah-item-actions">
                                        {onLoadAnalysis && (
                                            <button
                                                className="ah-action-btn ah-action-btn--primary"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleLoadAnalysis(item);
                                                }}
                                            >
                                                📥 Cargar análisis
                                            </button>
                                        )}
                                        
                                        {showDeleteConfirm === item.id ? (
                                            <div className="ah-delete-confirm">
                                                <span>¿Eliminar?</span>
                                                <button
                                                    className="ah-confirm-btn ah-confirm-btn--danger"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteAnalysis(item.id);
                                                    }}
                                                >
                                                    Sí
                                                </button>
                                                <button
                                                    className="ah-confirm-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShowDeleteConfirm(null);
                                                    }}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                className="ah-action-btn ah-action-btn--danger"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowDeleteConfirm(item.id);
                                                }}
                                            >
                                                🗑️ Eliminar
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AnalysisHistory;