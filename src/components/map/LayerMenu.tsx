import React, { useState, useRef, useEffect, memo } from 'react';
import ReactDOM from 'react-dom';
import '../../styles/LayerMenu.css';
import { LayerData } from '../../hooks/useWFSLayers';
import { AVAILABLE_LAYERS, LayerConfig } from '../../config/layers';
import { config } from '../../config/env';
import AttributeTable from './AttributeTable';

interface LayerMenuProps {
    layers: Record<string, LayerData | any>;
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
    onLayerToggle: (id: string, isActive: boolean, type: 'vector' | 'raster') => void;
    onOpacityChange: (id: string, opacity: number, type: 'vector' | 'raster') => void;
}

// ─── Formatos de descarga ────────────────────────────────────────────────────

interface DownloadFormat {
    label: string;
    ext: string;
    icon: string;
    outputFormat: string;  // outputFormat para WFS
    description: string;
    color: string;
}

const VECTOR_FORMATS: DownloadFormat[] = [
    {
        label: 'Shapefile',
        ext: 'shp.zip',
        icon: '🗂️',
        outputFormat: 'SHAPE-ZIP',
        description: 'Compatible con ArcGIS, QGIS',
        color: '#e67e22',
    },
    {
        label: 'GeoJSON',
        ext: 'geojson',
        icon: '{ }',
        outputFormat: 'application/json',
        description: 'Ideal para web y código',
        color: '#27ae60',
    },
    {
        label: 'KML',
        ext: 'kml',
        icon: '🌍',
        outputFormat: 'application/vnd.google-earth.kml+xml',
        description: 'Google Earth / Maps',
        color: '#2980b9',
    },
];

const RASTER_FORMATS = [
    {
        label: 'GeoTIFF',
        ext: 'tif',
        icon: '🗺️',
        description: 'GeoTIFF con georeferenciación (WCS)',
        color: '#c0392b',
    },
];

// ─── URL helpers ─────────────────────────────────────────────────────────────

const getVectorDownloadUrl = (layer: LayerConfig, outputFormat: string): string => {
    const { geoserver } = config;
    const params = new URLSearchParams({
        service: 'WFS',
        version: '1.0.0',
        request: 'GetFeature',
        typeName: `${geoserver.workspace}:${layer.id}`,
        outputFormat,
    });
    return `${geoserver.wfsUrl}?${params.toString()}`;
};

const getRasterDownloadUrl = (layer: LayerConfig): string => {
    const { geoserver } = config;
    // WCS GetCoverage — devuelve GeoTIFF real con georeferenciación completa
    const params = new URLSearchParams({
        SERVICE: 'WCS',
        VERSION: '1.0.0',
        REQUEST: 'GetCoverage',
        COVERAGE: `${geoserver.workspace}:${layer.wmsLayer}`,
        CRS: 'EPSG:4326',
        BBOX: '-118.5,14.5,-86.5,32.7',
        WIDTH: '4096',
        HEIGHT: '3072',
        FORMAT: 'GeoTIFF',
    });
    if (layer.timeValue) params.append('TIME', layer.timeValue);
    return `${geoserver.wcsUrl}?${params.toString()}`;
};

// Forzar descarga de GeoJSON como archivo (evita que el browser lo abra inline)
const downloadGeoJSON = async (layer: LayerConfig) => {
    const url = getVectorDownloadUrl(layer, 'application/json');
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = `${layer.id}.geojson`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objUrl);
    } catch (e) {
        console.error('Error descargando GeoJSON:', e);
    }
};

// ─── Componente DropdownDownload ─────────────────────────────────────────────

interface DownloadDropdownProps {
    layer: LayerConfig;
}

const DownloadDropdown: React.FC<DownloadDropdownProps> = ({ layer }) => {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);

    // Calcular posición del menú relativa al botón trigger
    const openMenu = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const menuWidth = 230;
            const left = rect.right - menuWidth; // alinear a la derecha del botón
            const top = rect.bottom + 6 + window.scrollY;
            setMenuStyle({
                position: 'absolute',
                top: top,
                left: Math.max(8, left), // no salir por la izquierda
                width: menuWidth,
                zIndex: 99999,
            });
        }
        setOpen(o => !o);
    };

    // Cerrar al hacer clic fuera o al hacer scroll
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const closeOnScroll = () => setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('scroll', closeOnScroll, true);
        return () => {
            document.removeEventListener('mousedown', close);
            document.removeEventListener('scroll', closeOnScroll, true);
        };
    }, [open]);

    const menuContent = (
        <div className="dl-menu" style={menuStyle} onMouseDown={e => e.stopPropagation()}>
            <div className="dl-menu-header">Descargar como…</div>
            {layer.type === 'vector'
                ? VECTOR_FORMATS.map(fmt => {
                    const isGeoJSON = fmt.outputFormat === 'application/json';
                    return isGeoJSON ? (
                        <button
                            key={fmt.ext}
                            className="dl-item dl-item-btn"
                            onClick={() => { downloadGeoJSON(layer); setOpen(false); }}
                        >
                            <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>
                                {fmt.icon}
                            </span>
                            <span className="dl-item-info">
                                <span className="dl-item-label">{fmt.label}</span>
                                <span className="dl-item-desc">{fmt.description}</span>
                            </span>
                            <span className="dl-item-ext">.{fmt.ext}</span>
                        </button>
                    ) : (
                        <a
                            key={fmt.ext}
                            href={getVectorDownloadUrl(layer, fmt.outputFormat)}
                            className="dl-item"
                            target="_blank"
                            rel="noopener noreferrer"
                            download={`${layer.id}.${fmt.ext}`}
                            onClick={() => setOpen(false)}
                        >
                            <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>
                                {fmt.icon}
                            </span>
                            <span className="dl-item-info">
                                <span className="dl-item-label">{fmt.label}</span>
                                <span className="dl-item-desc">{fmt.description}</span>
                            </span>
                            <span className="dl-item-ext">.{fmt.ext.replace('.zip', '')}</span>
                        </a>
                    );
                })
                : RASTER_FORMATS.map(fmt => (
                    <a
                        key={fmt.ext}
                        href={getRasterDownloadUrl(layer)}
                        className="dl-item"
                        target="_blank"
                        rel="noopener noreferrer"
                        download={`${layer.id}.${fmt.ext}`}
                        onClick={() => setOpen(false)}
                    >
                        <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>
                            {fmt.icon}
                        </span>
                        <span className="dl-item-info">
                            <span className="dl-item-label">{fmt.label}</span>
                            <span className="dl-item-desc">{fmt.description}</span>
                        </span>
                        <span className="dl-item-ext">.{fmt.ext}</span>
                    </a>
                ))
            }
        </div>
    );

    return (
        <div className="dl-dropdown">
            <button
                ref={triggerRef}
                className="dl-trigger"
                title="Opciones de descarga"
                onClick={openMenu}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                    <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                </svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" fill="currentColor" viewBox="0 0 16 16" className={`dl-caret ${open ? 'open' : ''}`}>
                    <path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/>
                </svg>
            </button>

            {open && ReactDOM.createPortal(menuContent, document.body)}
        </div>
    );
};

// ─── Iconos ──────────────────────────────────────────────────────────────────

const TableIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
    </svg>
);

// ─── LayerMenu principal ──────────────────────────────────────────────────────

const LayerMenu: React.FC<LayerMenuProps> = memo(({ layers, loading, errors, onLayerToggle, onOpacityChange }) => {
    const [collapsed, setCollapsed] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [attributeTableLayerId, setAttributeTableLayerId] = useState<string | null>(null);

    const handleCheckboxChange = (layer: LayerConfig, isChecked: boolean) => onLayerToggle(layer.id, isChecked, layer.type);
    const isLayerActive = (layerId: string) => layers[layerId]?.visible || false;
    const isLayerLoading = (layerId: string) => loading[layerId] || false;
    const getLayerError = (layerId: string) => errors[layerId] || null;

    const filteredLayers = AVAILABLE_LAYERS.filter(layer =>
        layer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        layer.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount = Object.values(layers).filter(l => l?.visible).length;
    const activeTableLayer = attributeTableLayerId ? AVAILABLE_LAYERS.find(l => l.id === attributeTableLayerId) : null;
    const activeTableFeatures = attributeTableLayerId ? (layers[attributeTableLayerId]?.data?.features ?? []) : [];

    return (
        <>
            <div className={`layer-menu ${collapsed ? 'collapsed' : ''}`}>
                <div className="layer-menu-header">
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                    <button className="collapse-btn" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expandir' : 'Contraer'}>
                        {collapsed ? '→' : '←'}
                    </button>
                </div>

                {!collapsed && (
                    <div className="layer-menu-content">
                        <div className="search-container">
                            <input type="text" placeholder="Buscar capas..." className="search-input" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>

                        <div className="layers-list">

                            {/* ── Capas Vectoriales ─────────────────────── */}
                            {filteredLayers.filter(l => l.type === 'vector').length > 0 && (
                                <div className="layer-group">
                                    <h6 className="layer-group-title">Capas Vectoriales</h6>
                                    {filteredLayers.filter(l => l.type === 'vector').map(layer => {
                                        const isActive = isLayerActive(layer.id);
                                        const isLoading = isLayerLoading(layer.id);
                                        const error = getLayerError(layer.id);
                                        const featureCount = layers[layer.id]?.data?.features?.length;

                                        return (
                                            <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input type="checkbox" id={layer.id} className="layer-checkbox" checked={isActive} onChange={(e) => handleCheckboxChange(layer, e.target.checked)} disabled={isLoading} />
                                                    <label htmlFor={layer.id} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">{layer.name}</span>
                                                            <span className="layer-description">{layer.description}</span>
                                                            {featureCount && <span className="feature-count">{featureCount} elementos</span>}
                                                        </div>
                                                    </label>
                                                </div>

                                                <div className="layer-actions">
                                                    {/* Tabla de atributos */}
                                                    <button className="table-btn" title="Ver tabla de atributos" onClick={() => setAttributeTableLayerId(layer.id)}>
                                                        <TableIcon />
                                                    </button>

                                                    {/* Descarga desplegable */}
                                                    <DownloadDropdown layer={layer} />

                                                    {isActive && <div className="layer-color-indicator" style={{ backgroundColor: layer.color }} />}
                                                </div>

                                                {isActive && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                                                        <input type="range" min="0" max="1" step="0.05" value={layers[layer.id]?.opacity || 0.8} onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value), 'vector')} className="opacity-slider" />
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
                                                        <small className="text-danger">⚠️ {error}</small>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ── Capas Ráster ─────────────────────────── */}
                            {filteredLayers.filter(l => l.type === 'raster').length > 0 && (
                                <div className="layer-group">
                                    <h6 className="layer-group-title">Uso de Suelo y Vegetación</h6>
                                    {filteredLayers.filter(l => l.type === 'raster').map(layer => {
                                        const isActive = isLayerActive(layer.id);
                                        return (
                                            <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input type="checkbox" id={layer.id} className="layer-checkbox" checked={isActive} onChange={(e) => handleCheckboxChange(layer, e.target.checked)} />
                                                    <label htmlFor={layer.id} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">
                                                                {layer.name}
                                                                {layer.year && <span className="year-badge">{layer.year}</span>}
                                                            </span>
                                                            <span className="layer-description">{layer.description}</span>
                                                        </div>
                                                    </label>
                                                </div>

                                                <div className="layer-actions">
                                                    {/* Descarga desplegable */}
                                                    <DownloadDropdown layer={layer} />

                                                    {isActive && <div className="layer-color-indicator" style={{ backgroundColor: layer.color }} />}
                                                </div>

                                                {isActive && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                                                        <input type="range" min="0" max="1" step="0.05" value={layers[layer.id]?.opacity || 0.8} onChange={(e) => onOpacityChange(layer.id, parseFloat(e.target.value), 'raster')} className="opacity-slider" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="menu-actions">
                            <button className="btn-action btn-action-secondary" onClick={() => AVAILABLE_LAYERS.forEach(layer => { if (!isLayerActive(layer.id)) handleCheckboxChange(layer, true); })}>
                                Activar todas
                            </button>
                            <button className="btn-action btn-action-secondary" onClick={() => AVAILABLE_LAYERS.forEach(layer => { if (isLayerActive(layer.id)) handleCheckboxChange(layer, false); })}>
                                Desactivar todas
                            </button>
                        </div>

                        <div className="menu-footer">
                            <div className="info-section">
                                <h5>Información</h5>
                                <p className="text-muted small mb-1"><strong>Proyecto:</strong></p>
                                <p className="text-muted small">Monitoreo del Cambio en el Uso de Suelo Urbano</p>
                                <p className="text-muted small mb-1 mt-2"><strong>Área de estudio:</strong></p>
                                <p className="text-muted small">México</p>
                                <p className="text-muted small mb-1 mt-2"><strong>Series disponibles:</strong></p>
                                <p className="text-muted small">7 series temporales (1985-2018)</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Tabla de Atributos */}
            {attributeTableLayerId && activeTableLayer && (
                <AttributeTable
                    layerName={activeTableLayer.name}
                    features={activeTableFeatures}
                    onClose={() => setAttributeTableLayerId(null)}
                />
            )}
        </>
    );
});

LayerMenu.displayName = 'LayerMenu';
export default LayerMenu;
