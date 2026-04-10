import React, { useRef, useState, useEffect, useCallback } from 'react';
import '@styles/pixelInfo.css';
import { MapPixelData } from '@hooks/map';

interface PixelInfoPanelProps {
    pixelInfo: MapPixelData | null;
    loading: boolean;
    onClose: () => void;
}

const formatCoordinates = (coords: [number, number] | undefined): string => {
    if (!coords) return 'N/A';
    const lat = coords[0] >= 0 ? `${coords[0].toFixed(6)}° N` : `${Math.abs(coords[0]).toFixed(6)}° S`;
    const lng = coords[1] >= 0 ? `${coords[1].toFixed(6)}° E` : `${Math.abs(coords[1]).toFixed(6)}° O`;
    return `${lat},  ${lng}`;
};

const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'number') {
        return Number.isInteger(value) ? String(value) : value.toFixed(4);
    }
    return String(value);
};

/** Tabla colapsable con todas las propiedades crudas del GetFeatureInfo */
const RawPropsTable: React.FC<{ props: Record<string, unknown> }> = ({ props }) => {
    const [open, setOpen] = useState(false);
    const entries = Object.entries(props);
    if (entries.length === 0) return null;
    return (
        <div className="pip-raw">
            <button className="pip-raw-toggle" onClick={() => setOpen(o => !o)}>
                {open ? '▲' : '▼'} Propiedades ({entries.length})
            </button>
            {open && (
                <table className="pip-raw-table">
                    <tbody>
                        {entries.map(([k, v]) => (
                            <tr key={k}>
                                <td className="pip-raw-key">{k}</td>
                                <td className="pip-raw-val">{String(v ?? '—')}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};

const PixelInfoPanel: React.FC<PixelInfoPanelProps> = ({ pixelInfo, loading, onClose }) => {
    const panelRef  = useRef<HTMLDivElement>(null);
    const dragState = useRef({ dragging: false, startX: 0, startY: 0, initLeft: 0, initTop: 0 });
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        if ((pixelInfo || loading) && !pos && panelRef.current) {
            const rect = panelRef.current.getBoundingClientRect();
            setPos({ top: rect.top, left: rect.left });
        }
    }, [pixelInfo, loading, pos]);

    const onMouseDown = useCallback((e: React.MouseEvent) => {
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
            const w = panel.offsetWidth;
            const h = panel.offsetHeight;
            setPos({
                left: Math.max(0, Math.min(window.innerWidth  - w, dragState.current.initLeft + (me.clientX - dragState.current.startX))),
                top:  Math.max(0, Math.min(window.innerHeight - h, dragState.current.initTop  + (me.clientY - dragState.current.startY))),
            });
        };

        const onUp = () => {
            dragState.current.dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
    }, []);

    if (!pixelInfo && !loading) return null;

    const panelStyle: React.CSSProperties = pos
        ? { position: 'fixed', top: pos.top, left: pos.left, right: 'auto', animation: 'none' }
        : {};

    return (
        <div className="pixel-info-panel" ref={panelRef} style={panelStyle}>

            {/* ── Header arrastrable ── */}
            <div className="pixel-info-header" onMouseDown={onMouseDown}>
                <div className="pip-header-left">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor"
                        viewBox="0 0 16 16" style={{ opacity: 0.7, marginRight: 8, flexShrink: 0 }}>
                        <path d="M7 2a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 8a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-3 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm3 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
                    </svg>
                    <h4>Consulta de Píxel</h4>
                </div>
                <button className="pip-close-btn" onClick={onClose} title="Cerrar">✕</button>
            </div>

            {/* ── Body ── */}
            <div className="pip-body">

                {loading && (
                    <div className="pip-loading">
                        <span className="pip-spinner" />
                        <span>Consultando valores…</span>
                    </div>
                )}

                {pixelInfo && !pixelInfo.error && (
                    <>
                        {/* Coordenadas */}
                        <div className="pip-coords">
                            <span className="pip-coords-icon">📍</span>
                            <span className="pip-coords-text">{formatCoordinates(pixelInfo.coordinates)}</span>
                        </div>

                        {/* Una tarjeta por capa activa */}
                        {pixelInfo.layers && pixelInfo.layers.length > 0 ? (
                            <div className="pip-layers">
                                {pixelInfo.layers.map((layer, i) => (
                                    <div key={i} className="pip-layer-card">

                                        <div className="pip-layer-name">
                                            {layer.serieName || layer.layerName}
                                        </div>

                                        {layer.error ? (
                                            <div className="pip-layer-error">❌ {layer.error}</div>
                                        ) : layer.value !== null && layer.value !== undefined ? (
                                            <div className="pip-layer-value">
                                                <span className="pip-value-num">{formatValue(layer.value)}</span>
                                            </div>
                                        ) : (
                                            <div className="pip-layer-nodata">⚠️ Sin datos en esta ubicación</div>
                                        )}

                                        {/* Propiedades crudas — útil para depurar nombres de banda */}
                                        {layer.rawProperties && Object.keys(layer.rawProperties).length > 0 && (
                                            <RawPropsTable props={layer.rawProperties as Record<string, unknown>} />
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="pip-empty">No hay capas ráster activas.</div>
                        )}
                    </>
                )}

                {pixelInfo?.error && (
                    <div className="pip-global-error">
                        <strong>❌ Error:</strong> {pixelInfo.error}
                    </div>
                )}
            </div>

            {/* ── Footer ── */}
            <div className="pip-footer">
                💡 Haz clic en el mapa para consultar valores
            </div>
        </div>
    );
};

export default PixelInfoPanel;