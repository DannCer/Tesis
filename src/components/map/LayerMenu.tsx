import React, { useState, useRef, useEffect, useCallback, memo } from 'react';
import ReactDOM from 'react-dom';
import '../../styles/LayerMenu.css';
import { LayerData } from '../../hooks/useWFSLayers';
import { AVAILABLE_LAYERS, LayerConfig } from '../../config/layers';
import { config } from '../../config/env';
import AttributeTable from './AttributeTable';
import { fileToGeoJSON, VECTOR_ACCEPT } from '../../utils/fileToGeoJSON';
import { loadGeoTIFF } from '../../utils/georasterLoader';
import { isValidOpacity, normalizeOpacity } from '../../utils/validation';
import {
    SymbologyStyle, GeomType, DEFAULT_SYMBOLOGY,
    detectGeomType, extractFields, autoCategorize,
} from '../../utils/symbologyUtils';


// ─── Props ───────────────────────────────────────────────────────────────────

interface LayerMenuProps {
    layers: Record<string, LayerData | any>;
    loading: Record<string, boolean>;
    errors: Record<string, string | null>;
    onLayerToggle: (id: string, isActive: boolean, type: 'vector' | 'raster') => void;
    onOpacityChange: (id: string, opacity: number, type: 'vector' | 'raster') => void;
    externalLayers: ExternalLayer[];
    externalVisible: Record<string, boolean>;
    externalOpacity: Record<string, number>;
    onAddExternalLayer: (layer: ExternalLayer) => void;
    onRemoveExternalLayer: (id: string) => void;
    onToggleExternalLayer: (id: string, visible: boolean) => void;
    onExternalOpacityChange: (id: string, opacity: number) => void;
}

// ─── Tipos capas externas ─────────────────────────────────────────────────────

export type AddLayerType = 'vector' | 'raster' | 'ogc';

export interface ExternalLayer {
    id: string;
    name: string;
    type: 'vector' | 'raster' | 'wms' | 'wfs';
    url: string;
    layerName?: string;
    file?: File;
    geojsonData?: GeoJSON.FeatureCollection;
    georasterData?: unknown;
    georasterBounds?: [[number, number], [number, number]];
    symbology?: SymbologyStyle;
}

// ─── Descarga ─────────────────────────────────────────────────────────────────

interface DownloadFormat { label: string; ext: string; icon: string; outputFormat: string; description: string; color: string; }

const VECTOR_FORMATS: DownloadFormat[] = [
    { label: 'Shapefile', ext: 'shp.zip', icon: '\uD83D\uDDC2\uFE0F', outputFormat: 'SHAPE-ZIP',                             description: 'Compatible con ArcGIS, QGIS', color: '#e67e22' },
    { label: 'GeoJSON',   ext: 'geojson', icon: '{ }',               outputFormat: 'application/json',                      description: 'Ideal para web y código',      color: '#27ae60' },
    { label: 'KML',       ext: 'kml',     icon: '\uD83C\uDF0D',       outputFormat: 'application/vnd.google-earth.kml+xml',  description: 'Google Earth / Maps',          color: '#2980b9' },
];
const RASTER_FORMATS = [{ label: 'GeoTIFF', ext: 'tif', icon: '\uD83D\uDDFA\uFE0F', description: 'GeoTIFF con georeferenciación (WCS)', color: '#c0392b' }];

// QGIS Server: el typeName no lleva workspace, y la URL base ya tiene MAP=
const getVectorDownloadUrl = (layer: LayerConfig, outputFormat: string) => {
    const { qgisServer } = config;
    const wfsName = (layer as any).wfsName ?? layer.id;
    return `${qgisServer.wfsUrl}&${new URLSearchParams({ SERVICE:'WFS', VERSION:'1.1.0', REQUEST:'GetFeature', TYPENAME: wfsName, outputFormat })}`;
};
// QGIS Server no soporta WCS nativo; descarga como WFS GeoTIFF o imagen WMS
const getRasterDownloadUrl = (layer: LayerConfig) => {
    const { qgisServer } = config;
    const p = new URLSearchParams({ SERVICE:'WMS', VERSION:'1.3.0', REQUEST:'GetMap', LAYERS: layer.wmsLayer ?? layer.id, CRS:'EPSG:4326', BBOX:'18.999,−99.406,19.643,−98.882', WIDTH:'4096', HEIGHT:'3072', FORMAT:'image/tiff' });
    if (layer.timeValue) p.append('TIME', layer.timeValue);
    return `${qgisServer.wmsRasterUrl}&${p}`;
};
const downloadGeoJSON = async (layer: LayerConfig) => {
    try {
        const res = await fetch(getVectorDownloadUrl(layer, 'application/json'));
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `${layer.id}.geojson` });
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) { console.error('Error descargando GeoJSON:', e); }
};

const DownloadDropdown: React.FC<{ layer: LayerConfig }> = ({ layer }) => {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
    const triggerRef = useRef<HTMLButtonElement>(null);
    const openMenu = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const mw = 230;
            setMenuStyle({ position:'absolute', top: rect.bottom + 6 + window.scrollY, left: Math.max(8, rect.right - mw), width: mw, zIndex: 99999 });
        }
        setOpen(o => !o);
    };
    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => { if (!triggerRef.current?.contains(e.target as Node)) setOpen(false); };
        const scroll = () => setOpen(false);
        document.addEventListener('mousedown', close);
        document.addEventListener('scroll', scroll, true);
        return () => { document.removeEventListener('mousedown', close); document.removeEventListener('scroll', scroll, true); };
    }, [open]);
    const menu = (
        <div className="dl-menu" style={menuStyle} onMouseDown={e => e.stopPropagation()}>
            <div className="dl-menu-header">Descargar como</div>
            {layer.type === 'vector'
                ? VECTOR_FORMATS.map(fmt => fmt.outputFormat === 'application/json'
                    ? <button key={fmt.ext} className="dl-item dl-item-btn" onClick={() => { downloadGeoJSON(layer); setOpen(false); }}>
                        <span className="dl-item-icon" style={{ background:`${fmt.color}18`, color:fmt.color }}>{fmt.icon}</span>
                        <span className="dl-item-info"><span className="dl-item-label">{fmt.label}</span><span className="dl-item-desc">{fmt.description}</span></span>
                        <span className="dl-item-ext">.{fmt.ext}</span>
                      </button>
                    : <a key={fmt.ext} href={getVectorDownloadUrl(layer, fmt.outputFormat)} className="dl-item" target="_blank" rel="noopener noreferrer" download={`${layer.id}.${fmt.ext}`} onClick={() => setOpen(false)}>
                        <span className="dl-item-icon" style={{ background:`${fmt.color}18`, color:fmt.color }}>{fmt.icon}</span>
                        <span className="dl-item-info"><span className="dl-item-label">{fmt.label}</span><span className="dl-item-desc">{fmt.description}</span></span>
                        <span className="dl-item-ext">.{fmt.ext.replace('.zip','')}</span>
                      </a>)
                : RASTER_FORMATS.map(fmt => <a key={fmt.ext} href={getRasterDownloadUrl(layer)} className="dl-item" target="_blank" rel="noopener noreferrer" download={`${layer.id}.${fmt.ext}`} onClick={() => setOpen(false)}>
                    <span className="dl-item-icon" style={{ background:`${fmt.color}18`, color:fmt.color }}>{fmt.icon}</span>
                    <span className="dl-item-info"><span className="dl-item-label">{fmt.label}</span><span className="dl-item-desc">{fmt.description}</span></span>
                    <span className="dl-item-ext">.{fmt.ext}</span>
                  </a>)
            }
        </div>
    );
    return (
        <div className="dl-dropdown">
            <button ref={triggerRef} className="dl-trigger" title="Opciones de descarga" onClick={openMenu}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" fill="currentColor" viewBox="0 0 16 16" className={`dl-caret ${open?'open':''}`}><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
            </button>
            {open && ReactDOM.createPortal(menu, document.body)}
        </div>
    );
};

const TableIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
    </svg>
);

// ─── OGC detector ─────────────────────────────────────────────────────────────

function guessOGC(url: string): 'wms' | 'wfs' | null {
    const l = url.toLowerCase();
    if (l.includes('service=wms') || /\/wms[/?]?/.test(l)) return 'wms';
    if (l.includes('service=wfs') || /\/wfs[/?]?/.test(l)) return 'wfs';
    return null;
}

async function probeOGC(rawUrl: string): Promise<'wms' | 'wfs' | null> {
    let base = rawUrl.trim();
    try { const u = new URL(base); u.search = ''; base = u.toString(); } catch { /**/ }
    const tryFetch = async (params: string) => {
        try { return await (await fetch(`${base}?${params}`, { signal: AbortSignal.timeout(6000) })).text(); }
        catch { return ''; }
    };
    const wms = await tryFetch('service=WMS&request=GetCapabilities');
    if (wms.includes('WMS_Capabilities') || wms.includes('WMT_MS_Capabilities')) return 'wms';
    const wfs = await tryFetch('service=WFS&request=GetCapabilities');
    if (wfs.includes('WFS_Capabilities') || wfs.includes('FeatureTypeList')) return 'wfs';
    return null;
}

// ─── SymbologyEditor ──────────────────────────────────────────────────────────

interface SymbologyEditorProps {
    features: GeoJSON.Feature[];
    geomType: GeomType;
    symbology: SymbologyStyle;
    onChange: (s: SymbologyStyle) => void;
}

const SymbologyEditor: React.FC<SymbologyEditorProps> = ({ features, geomType, symbology, onChange }) => {
    const fields = extractFields(features);
    const isLine = geomType === 'line';
    const set = (patch: Partial<SymbologyStyle>) => onChange({ ...symbology, ...patch });

    const handleFieldChange = (field: string) => {
        const categories = autoCategorize(features, field);
        set({ field, categories, mode: 'categorical' });
    };

    return (
        <div className="sym-editor">
            <div className="sym-modes">
                <button className={`sym-mode-btn ${symbology.mode === 'single' ? 'selected' : ''}`}
                    onClick={() => set({ mode:'single', field:undefined, categories:undefined })}>
                    Color único
                </button>
                <button className={`sym-mode-btn ${symbology.mode === 'categorical' ? 'selected' : ''}`}
                    onClick={() => { if (fields.length && !symbology.field) handleFieldChange(fields[0]); else set({ mode:'categorical' }); }}>
                    Por campo
                </button>
            </div>

            {symbology.mode === 'single' && (
                <div className="sym-single">
                    {!isLine && (
                        <div className="sym-row">
                            <label className="sym-label">Relleno</label>
                            <div className="sym-color-row">
                                <input type="color" value={symbology.fillColor} onChange={e => set({ fillColor: e.target.value })} className="sym-color-input" />
                                <input type="range" min={0} max={1} step={0.05} value={symbology.fillOpacity} onChange={e => set({ fillOpacity: parseFloat(e.target.value) })} className="opacity-slider sym-opacity" />
                                <span className="sym-pct">{Math.round(symbology.fillOpacity * 100)}%</span>
                            </div>
                        </div>
                    )}
                    <div className="sym-row">
                        <label className="sym-label">{isLine ? 'Color' : 'Borde'}</label>
                        <div className="sym-color-row">
                            <input type="color" value={symbology.strokeColor} onChange={e => set({ strokeColor: e.target.value })} className="sym-color-input" />
                            <input type="number" min={0.5} max={8} step={0.5} value={symbology.strokeWeight} onChange={e => set({ strokeWeight: parseFloat(e.target.value) })} className="sym-weight-input" />
                            <span className="sym-label" style={{ fontSize:'0.68rem' }}>px</span>
                        </div>
                    </div>
                </div>
            )}

            {symbology.mode === 'categorical' && (
                <div className="sym-categorical">
                    <div className="sym-row">
                        <label className="sym-label">Campo</label>
                        <select className="sym-select" value={symbology.field ?? ''} onChange={e => handleFieldChange(e.target.value)}>
                            <option value="" disabled>Selecciona un campo</option>
                            {fields.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    {symbology.field && symbology.categories && (
                        <div className="sym-categories">
                            <span className="sym-label">Valores ({symbology.categories.length})</span>
                            <div className="sym-cat-list">
                                {symbology.categories.map(cat => (
                                    <div key={cat.value} className="sym-cat-row">
                                        <input type="color" value={cat.color}
                                            onChange={e => set({ categories: symbology.categories!.map(c => c.value === cat.value ? {...c, color: e.target.value} : c) })}
                                            className="sym-color-input sym-color-sm" />
                                        <span className="sym-cat-label" title={cat.value}>{cat.value}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="sym-row" style={{ marginTop:6 }}>
                                <label className="sym-label">Opacidad</label>
                                <div className="sym-color-row">
                                    <input type="range" min={0} max={1} step={0.05} value={symbology.fillOpacity} onChange={e => set({ fillOpacity: parseFloat(e.target.value) })} className="opacity-slider sym-opacity" />
                                    <span className="sym-pct">{Math.round(symbology.fillOpacity * 100)}%</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── AddLayerPanel ────────────────────────────────────────────────────────────

type PanelStep = 'form' | 'symbology';

const LAYER_TYPE_OPTIONS = [
    { value: 'vector' as AddLayerType, label: 'Vectorial',    icon: '\uD83D\uDCC1', desc: 'GeoJSON, KML, KMZ o Shapefile (.zip)' },
    { value: 'raster' as AddLayerType, label: 'GeoTIFF',      icon: '\uD83D\uDDFA\uFE0F', desc: 'GeoTIFF local' },
    { value: 'ogc'    as AddLayerType, label: 'Servicio OGC', icon: '\uD83C\uDF10', desc: 'WMS o WFS (auto-detectado)' },
];

const AddLayerPanel: React.FC<{ onAddLayer: (layer: ExternalLayer) => void }> = ({ onAddLayer }) => {
    const [open, setOpen]     = useState(false);
    const [step, setStep]     = useState<PanelStep>('form');
    const [type, setType]     = useState<AddLayerType>('vector');
    const [name, setName]     = useState('');
    const [url, setUrl]       = useState('');
    const [layerName, setLayerName] = useState('');
    const [file, setFile]     = useState<File | null>(null);
    const [error, setError]   = useState('');
    const [loading, setLoading]   = useState(false);
    const [probing, setProbing]   = useState(false);
    const [detectedOGC, setDetectedOGC] = useState<'wms' | 'wfs' | null>(null);
    const [pendingFeatures, setPendingFeatures] = useState<GeoJSON.Feature[]>([]);
    const [geomType, setGeomType] = useState<GeomType>('polygon');
    const [symbology, setSymbology] = useState<SymbologyStyle>({ ...DEFAULT_SYMBOLOGY });
    const fileRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setStep('form'); setName(''); setUrl(''); setLayerName('');
        setFile(null); setError(''); setLoading(false); setProbing(false);
        setDetectedOGC(null); setPendingFeatures([]); setSymbology({ ...DEFAULT_SYMBOLOGY });
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleTypeChange = (t: AddLayerType) => { setType(t); reset(); };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0] ?? null;
        setFile(f);
        if (f && !name) setName(f.name.replace(/\.\w+$/, ''));
        setError('');
    };

    const handleUrlChange = (val: string) => {
        setUrl(val);
        const guessed = guessOGC(val);
        setDetectedOGC(guessed);
        setError('');
    };

    const handleProbe = async () => {
        if (!url.trim()) { setError('Ingresa la URL del servicio'); return; }
        setProbing(true); setError(''); setDetectedOGC(null);
        const result = await probeOGC(url);
        setProbing(false);
        if (result) { setDetectedOGC(result); }
        else { setError('No se pudo detectar el tipo de servicio. Verifica la URL o que el servidor permita CORS.'); }
    };

    const handleContinue = useCallback(async () => {
        setError('');
        const displayName = name.trim() || (file?.name ?? url.split('/').pop() ?? 'Capa externa');

        if (type === 'vector') {
            if (!file) { setError('Selecciona un archivo'); return; }
            setLoading(true);
            try {
                const result = await fileToGeoJSON(file);
                if (!result.ok) { setError(result.error); return; }
                const gt = detectGeomType(result.data.features);
                setPendingFeatures(result.data.features);
                setGeomType(gt);
                setSymbology({ ...DEFAULT_SYMBOLOGY });
                setName(displayName);
                setStep('symbology');
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Error al leer el archivo');
            } finally { setLoading(false); }
            return;
        }

        if (type === 'raster') {
            if (!file) { setError('Selecciona un archivo GeoTIFF'); return; }
            setLoading(true);
            try {
                const result = await loadGeoTIFF(file);
                if (!result.ok) { setError(result.error); return; }
                onAddLayer({ id:`ext_${Date.now()}`, name: displayName, type:'raster', url:'', file, georasterData:result.georaster, georasterBounds:result.bounds });
                reset();
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Error al cargar el GeoTIFF');
            } finally { setLoading(false); }
            return;
        }

        // OGC
        if (!url.trim()) { setError('La URL del servicio es obligatoria'); return; }
        if (!layerName.trim()) { setError('El nombre de la capa es obligatorio'); return; }
        if (!detectedOGC) { setError('Primero detecta el tipo de servicio (WMS/WFS)'); return; }
        let cleanUrl = url.trim();
        try { const u = new URL(cleanUrl); u.search = ''; cleanUrl = u.toString(); } catch { /**/ }
        onAddLayer({ id:`ext_${Date.now()}`, name: displayName || layerName, type: detectedOGC, url: cleanUrl, layerName: layerName.trim() });
        reset();
    }, [type, name, url, layerName, file, detectedOGC, onAddLayer]);

    const handleAddWithSymbology = useCallback(() => {
        const fc: GeoJSON.FeatureCollection = { type:'FeatureCollection', features: pendingFeatures };
        onAddLayer({ id:`ext_${Date.now()}`, name, type:'vector', url:'', file: file ?? undefined, geojsonData: fc, symbology });
        reset();
    }, [pendingFeatures, name, file, symbology, onAddLayer]);

    const SpinIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" className="spin">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
        </svg>
    );

    return (
        <div className="add-layer-panel">
            <button className={`add-layer-toggle ${open ? 'open' : ''}`} onClick={() => { setOpen(o => !o); if (open) reset(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                Agregar capa
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16" style={{ marginLeft:'auto', transform: open ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}><path d="M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z"/></svg>
            </button>

            {open && (
                <div className="add-layer-form">

                    {step === 'form' && (
                        <>
                            <div className="add-layer-types">
                                {LAYER_TYPE_OPTIONS.map(opt => (
                                    <button key={opt.value} className={`add-type-btn ${type === opt.value ? 'selected' : ''}`} onClick={() => handleTypeChange(opt.value)} title={opt.desc}>
                                        <span className="add-type-icon">{opt.icon}</span>
                                        <span className="add-type-label">{opt.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="add-layer-field">
                                <label className="add-layer-label">Nombre</label>
                                <input type="text" className="add-layer-input" placeholder="Nombre para mostrar" value={name} onChange={e => setName(e.target.value)} />
                            </div>

                            {(type === 'vector' || type === 'raster') && (
                                <div className="add-layer-field">
                                    <label className="add-layer-label">{type === 'vector' ? 'Archivo vectorial' : 'Archivo GeoTIFF'}</label>
                                    <div className={`add-layer-dropzone ${file ? 'has-file' : ''}`}
                                        onClick={() => fileRef.current?.click()}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) { setFile(f); if (!name) setName(f.name.replace(/\.\w+$/, '')); } }}>
                                        {file
                                            ? <span className="add-layer-filename"> {file.name}</span>
                                            : <span className="add-layer-droptext">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>
                                                {type === 'vector' ? 'GeoJSON \u00B7 KML \u00B7 KMZ \u00B7 Shapefile (.zip)' : 'Arrastra o haz clic para seleccionar'}
                                              </span>}
                                        <input ref={fileRef} type="file" accept={type === 'vector' ? VECTOR_ACCEPT : '.tif,.tiff'} style={{ display:'none' }} onChange={handleFileChange} />
                                    </div>
                                </div>
                            )}

                            {type === 'ogc' && (
                                <>
                                    <div className="add-layer-field">
                                        <label className="add-layer-label">URL del servicio</label>
                                        <div className="ogc-url-row">
                                            <input type="url" className="add-layer-input" placeholder="http://localhost/qgis/qgis_mapserv.fcgi.exe?MAP=C:/mis_proyectos/mi_proyecto.qgz" value={url}
                                                onChange={e => handleUrlChange(e.target.value)} />
                                            {detectedOGC
                                                ? <span className={`ogc-badge ogc-badge-${detectedOGC}`}>{detectedOGC.toUpperCase()}</span>
                                                : <button className="ogc-probe-btn" onClick={handleProbe} disabled={probing}>
                                                    {probing ? <SpinIcon /> : 'Detectar'}
                                                  </button>}
                                        </div>
                                        <span className="add-layer-hint">El tipo (WMS/WFS) se detecta por la URL o haciendo clic en "Detectar"</span>
                                    </div>
                                    <div className="add-layer-field">
                                        <label className="add-layer-label">Nombre de la capa</label>
                                        <input type="text" className="add-layer-input" placeholder="nombre_capa (exacto como aparece en QGIS)" value={layerName} onChange={e => setLayerName(e.target.value)} />
                                        <span className="add-layer-hint">
                                            {detectedOGC === 'wms' && 'Layer name del GetCapabilities WMS'}
                                            {detectedOGC === 'wfs' && 'TypeName del feature type WFS'}
                                            {!detectedOGC && 'Detecta el servicio para ver la ayuda espec\xEDfica'}
                                        </span>
                                    </div>
                                </>
                            )}

                            {error && (
                                <div className="add-layer-error">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
                                    {error}
                                </div>
                            )}

                            <button className="add-layer-submit" onClick={handleContinue} disabled={loading || probing}>
                                {loading
                                    ? <span className="add-layer-loading"><SpinIcon /> Cargando...</span>
                                    : <><svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                                    {type === 'vector' ? 'Continuar \u2192 Simbología' : 'Agregar al mapa'}</>}
                            </button>
                        </>
                    )}

                    {step === 'symbology' && (
                        <>
                            <div className="sym-header">
                                <button className="sym-back-btn" onClick={() => setStep('form')}> Volver</button>
                                <span className="sym-header-title">Simbología <strong>{name}</strong></span>
                            </div>
                            <div className="sym-geom-badge">
                                {geomType === 'point'   && '\u25CF Puntos'}
                                {geomType === 'line'    && '\u254C L\xEDneas'}
                                {geomType === 'polygon' && '\u25AD Pol\xEDgonos'}
                                {geomType === 'mixed'   && '\u2B61 Mixto'}
                                {' \u00B7 '}{pendingFeatures.length} elementos
                            </div>
                            <SymbologyEditor features={pendingFeatures} geomType={geomType} symbology={symbology} onChange={setSymbology} />
                            {error && (
                                <div className="add-layer-error">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/></svg>
                                    {error}
                                </div>
                            )}
                            <button className="add-layer-submit" onClick={handleAddWithSymbology}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"/></svg>
                                Agregar al mapa
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

// ─── LayerMenu principal ──────────────────────────────────────────────────────

const LayerMenu: React.FC<LayerMenuProps> = memo(({ layers, loading, errors, onLayerToggle, onOpacityChange, externalLayers, externalVisible, externalOpacity, onAddExternalLayer, onRemoveExternalLayer, onToggleExternalLayer, onExternalOpacityChange }) => {
    const [collapsed, setCollapsed]   = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [attributeTableLayerId, setAttributeTableLayerId] = useState<string | null>(null);

    const handleCheckboxChange = (layer: LayerConfig, isChecked: boolean) => onLayerToggle(layer.id, isChecked, layer.type);
    const isLayerActive  = (id: string) => layers[id]?.visible || false;
    const isLayerLoading = (id: string) => loading[id] || false;
    const getLayerError  = (id: string) => errors[id] || null;

    const filteredLayers = AVAILABLE_LAYERS.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.description.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const activeCount         = Object.values(layers).filter(l => l?.visible).length;
    const activeTableLayer    = attributeTableLayerId ? AVAILABLE_LAYERS.find(l => l.id === attributeTableLayerId) : null;
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
                        {collapsed ? '\u2192' : '\u2190'}
                    </button>
                </div>

                {!collapsed && (
                    <div className="layer-menu-content">
                        <div className="search-container">
                            <input type="text" placeholder="Buscar capas..." className="search-input" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            <AddLayerPanel onAddLayer={onAddExternalLayer} />
                        </div>

                        <div className="layers-list">

                            {/* Vectoriales */}
                            {Array.from(new Set(filteredLayers.filter(l => l.type === 'vector').map(l => l.group ?? 'Capas Vectoriales'))).map(group => {
                                const gl = filteredLayers.filter(l => l.type === 'vector' && (l.group ?? 'Capas Vectoriales') === group);
                                if (!gl.length) return null;
                                return (
                                    <div key={group} className="layer-group">
                                        <h6 className="layer-group-title">{group}</h6>
                                        {gl.map(layer => {
                                            const isActive  = isLayerActive(layer.id);
                                            const isLoading = isLayerLoading(layer.id);
                                            const err       = getLayerError(layer.id);
                                            const fc        = layers[layer.id]?.data?.features?.length;
                                            return (
                                                <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                                                    <div className="layer-checkbox-wrapper">
                                                        <input type="checkbox" id={layer.id} className="layer-checkbox" checked={isActive} onChange={e => handleCheckboxChange(layer, e.target.checked)} disabled={isLoading} />
                                                        <label htmlFor={layer.id} className="layer-label">
                                                            <div className="layer-info">
                                                                <span className="layer-name">{layer.name}</span>
                                                                <span className="layer-description">{layer.description}<br/>{fc && <span className="feature-count"> {fc} elementos</span>}</span>
                                                            </div>
                                                        </label>
                                                    </div>
                                                    <div className="layer-actions">
                                                        {isActive && <button className="table-btn" title="Ver tabla de atributos" onClick={() => setAttributeTableLayerId(layer.id)}><TableIcon /></button>}
                                                        <DownloadDropdown layer={layer} />
                                                        {isActive && <div className="layer-color-indicator" style={{ backgroundColor: layer.color }} />}
                                                    </div>
                                                    {isActive && (
                                                        <div className="layer-opacity-control">
                                                            <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                                                            <input type="range" min="0" max="1" step="0.05" value={layers[layer.id]?.opacity || 0.8} onChange={e => { const v = parseFloat(e.target.value); if (isValidOpacity(v)) onOpacityChange(layer.id, normalizeOpacity(v), 'vector'); }} className="opacity-slider" />
                                                        </div>
                                                    )}
                                                    {isLoading && <div className="layer-status"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Cargando...</span></div></div>}
                                                    {err && <div className="layer-error" role="alert"><small className="text-danger"> {err}</small></div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {/* Ráster */}
                            {filteredLayers.filter(l => l.type === 'raster').length > 0 && (
                                <div className="layer-group">
                                    <h6 className="layer-group-title">Uso de Suelo y Vegetación</h6>
                                    {filteredLayers.filter(l => l.type === 'raster').map(layer => {
                                        const isActive = isLayerActive(layer.id);
                                        return (
                                            <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input type="checkbox" id={layer.id} className="layer-checkbox" checked={isActive} onChange={e => handleCheckboxChange(layer, e.target.checked)} />
                                                    <label htmlFor={layer.id} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">{layer.name}{layer.year && <span className="year-badge">{layer.year}</span>}</span>
                                                            <span className="layer-description">{layer.description}</span>
                                                        </div>
                                                    </label>
                                                </div>
                                                <div className="layer-actions">
                                                    <DownloadDropdown layer={layer} />
                                                    {isActive && <div className="layer-color-indicator" style={{ backgroundColor: layer.color }} />}
                                                </div>
                                                {isActive && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round((layers[layer.id]?.opacity || 0.8) * 100)}%</span>
                                                        <input type="range" min="0" max="1" step="0.05" value={layers[layer.id]?.opacity || 0.8} onChange={e => onOpacityChange(layer.id, parseFloat(e.target.value), 'raster')} className="opacity-slider" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Capas importadas */}
                            {externalLayers.length > 0 && (
                                <div className="layer-group">
                                    <h6 className="layer-group-title imported-title">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16" style={{ marginRight:4 }}><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/></svg>
                                        Capas importadas
                                        <span className="imported-count">{externalLayers.length}</span>
                                    </h6>
                                    {externalLayers.map(ext => {
                                        const isVisible = externalVisible[ext.id] ?? true;
                                        const opacity   = externalOpacity[ext.id]  ?? 0.8;
                                        const fmt =
                                            ext.type === 'wms'    ? `WMS \u00B7 ${ext.layerName}` :
                                            ext.type === 'wfs'    ? `WFS \u00B7 ${ext.layerName}` :
                                            ext.type === 'raster' ? 'GeoTIFF local' :
                                            ext.file ? ext.file.name.split('.').pop()?.toUpperCase() + ' local' : 'Vectorial';
                                        return (
                                            <div key={ext.id} className={`layer-item ${isVisible ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input type="checkbox" id={`ext-${ext.id}`} className="layer-checkbox" checked={isVisible} onChange={e => onToggleExternalLayer(ext.id, e.target.checked)} />
                                                    <label htmlFor={`ext-${ext.id}`} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">{ext.name}</span>
                                                            <span className="layer-description">{fmt}</span>
                                                        </div>
                                                    </label>
                                                </div>
                                                <div className="layer-actions">
                                                    <button className="imported-delete-btn" title="Eliminar capa" onClick={() => onRemoveExternalLayer(ext.id)}>
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fillRule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>
                                                    </button>
                                                </div>
                                                {isVisible && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round(opacity * 100)}%</span>
                                                        <input type="range" min="0" max="1" step="0.05" value={opacity} onChange={e => onExternalOpacityChange(ext.id, parseFloat(e.target.value))} className="opacity-slider" />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                        </div>
                    </div>
                )}
            </div>

            {attributeTableLayerId && activeTableLayer && (
                <AttributeTable layerName={activeTableLayer.name} features={activeTableFeatures} onClose={() => setAttributeTableLayerId(null)} />
            )}
        </>
    );
});

LayerMenu.displayName = 'LayerMenu';
export default LayerMenu;
