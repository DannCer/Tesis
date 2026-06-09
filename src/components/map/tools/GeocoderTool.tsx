/**
 * @fileoverview GeocoderTool — Buscador de direcciones con autocompletado.
 *
 * Al seleccionar un resultado:
 *  1. Vuela al punto y coloca un marcador temporal.
 *  2. Muestra un modal preguntando si se desea analizar las capas a 500 m.
 *  3. Si el usuario confirma, ejecuta el mismo análisis que AnalysisTool
 *     sobre ArcGIS REST FeatureServer (Atlas de Riesgos CDMX), usando un
 *     círculo de radio fijo ANALYSIS_RADIUS_M centrado en la dirección.
 *
 * @module components/map/tools/GeocoderTool
 */

import React, {
    useState, useCallback, useRef, useEffect, useId,
} from 'react';
import ReactDOM from 'react-dom';
import L from 'leaflet';
import { logger } from '@config/env';
import {
    ANALYSIS_LAYERS,
    GREEN_GROUPS,
    buildCircleRing,
    queryArcGISLayer,
    getDisplayValue,
    buildInitialResults,
    pickName,
    SKIP_FIELDS,
    type LayerResult,
} from '@utils/arcgisAnalysis';
import '@styles/GeocoderTool.css';
import '@styles/AnalysisTool.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadCSVWithBOM(data: Record<string, unknown>[], filename: string) {
    if (data.length === 0) return;
    const headers = Object.keys(data[0]);
    const escape = (val: unknown): string => {
        const str = String(val ?? '');
        return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const rows = [
        headers.map(escape).join(','),
        ...data.map(row => headers.map(h => escape(row[h])).join(',')),
    ];
    const BOM  = '\uFEFF';
    const blob = new Blob([BOM + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface NominatimResult {
    place_id: number;
    display_name: string;
    lat: string;
    lon: string;
    type: string;
    importance: number;
    address?: {
        road?: string;
        suburb?: string;
        city?: string;
        state?: string;
        country?: string;
        postcode?: string;
    };
}

export interface GeocoderToolProps {
    isOpen:      boolean;
    onClose:     () => void;
    mapInstance: L.Map | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const NOMINATIM_URL     = 'https://nominatim.openstreetmap.org/search';
const DEBOUNCE_MS       = 380;
const MIN_QUERY_LENGTH  = 3;
const MAX_RESULTS_API   = 10;
const MAX_RESULTS_SHOW  = 6;
const MARKER_ACCENT     = '#cd171e';
const ANALYSIS_RADIUS_M = 500; // metros — radio fijo del círculo de análisis

// ─── Zoom dinámico ────────────────────────────────────────────────────────────

function dynamicZoom(result: NominatimResult): number {
    const { importance, type } = result;
    const streetTypes = ['house', 'building', 'residential', 'road', 'highway', 'street'];
    if (streetTypes.includes(type)) return 17;
    if (importance >= 0.7) return 10;
    if (importance >= 0.5) return 12;
    if (importance >= 0.3) return 14;
    return 16;
}

// ─── Icono marcador ───────────────────────────────────────────────────────────

const MARKER_SVG = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
  <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 24 12 24s12-15 12-24C24 5.37 18.63 0 12 0z"
        fill="${MARKER_ACCENT}" stroke="#fff" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="5" fill="#fff"/>
</svg>`);

const RESULT_ICON = L.icon({
    iconUrl:     `data:image/svg+xml,${MARKER_SVG}`,
    iconSize:    [24, 36],
    iconAnchor:  [12, 36],
    popupAnchor: [0, -38],
});

// ─── Helpers Nominatim ────────────────────────────────────────────────────────

function buildShortAddress(result: NominatimResult): string {
    const a = result.address;
    if (!a) return result.display_name;
    const parts = [a.road, a.suburb, a.city ?? a.state].filter(Boolean);
    return parts.join(', ') || result.display_name;
}

function placeIcon(type: string): string {
    if (['house', 'building', 'residential'].includes(type)) return '🏠';
    if (['road', 'highway', 'street'].includes(type))        return '🛣️';
    if (['park', 'forest', 'nature_reserve'].includes(type)) return '🌳';
    if (['hospital', 'clinic'].includes(type))               return '🏥';
    if (['school', 'university', 'college'].includes(type))  return '🎓';
    if (['restaurant', 'food', 'cafe'].includes(type))       return '🍽️';
    if (['station', 'metro_station'].includes(type))         return '🚇';
    if (['administrative', 'city', 'municipality'].includes(type)) return '🏛️';
    return '📍';
}

function deduplicateResults(results: NominatimResult[]): NominatimResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
        const key = `${parseFloat(r.lat).toFixed(4)},${parseFloat(r.lon).toFixed(4)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ─── Sub-componente: Modal de confirmación de análisis ────────────────────────

interface AnalysisModalProps {
    address: string;
    onConfirm: () => void;
    onCancel:  () => void;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ address, onConfirm, onCancel }) => {
    // Cerrar con Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onCancel]);

    return (
        <div className="gc-analysis-overlay" onClick={onCancel}>
            <div
                className="gc-analysis-modal"
                onClick={e => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="gc-modal-title"
            >
                <div className="gc-analysis-modal__header">
                    <span className="gc-analysis-modal__icon">📍</span>
                    <h3 id="gc-modal-title" className="gc-analysis-modal__title">Análisis</h3>
                </div>
                <div className="gc-analysis-modal__body">
                    <p className="gc-analysis-modal__msg">
                        ¿Desea ver qué hay en {ANALYSIS_RADIUS_M} metros a la redonda de{' '}
                        <strong>{address}</strong>?
                    </p>
                </div>
                <div className="gc-analysis-modal__footer">
                    <button className="gc-analysis-modal__btn gc-analysis-modal__btn--no" onClick={onCancel}>
                        No
                    </button>
                    <button className="gc-analysis-modal__btn gc-analysis-modal__btn--yes" onClick={onConfirm} autoFocus>
                        Sí
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Sub-componente: Panel de resultados del análisis ─────────────────────────

interface AnalysisPanelProps {
    address:         string;
    results:         LayerResult[];
    loading:         boolean;
    onClose:         () => void;
    detailLayerId:   string | null;
    onLoadDetails:   (lr: LayerResult, idx: number) => void;
    onSetDetailId:   (id: string | null) => void;
    onShowOnMap:     (lr: LayerResult) => void;
    onExportCSV:     () => void;
    activeMapLayerId: string | null;
}

/**
 * Panel de resultados del análisis — usa exactamente las mismas clases at-*
 * que AnalysisTool para garantizar presentación idéntica.
 */
const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
    address, results, loading, onClose,
    detailLayerId, onLoadDetails, onSetDetailId, onShowOnMap,
    onExportCSV, activeMapLayerId,
}) => {
    const demoResult   = results.find(r => r.layerId === 'demo_inegi');
    const tableResults = results.filter(r => r.layerId !== 'demo_inegi');

    const totalDone   = results.filter(r => r.count !== null).length;
    const totalLayers = results.length;
    const progress    = totalLayers > 0 ? Math.round((totalDone / totalLayers) * 100) : 0;
    const hitCount    = tableResults.filter(r => (r.count ?? 0) > 0).length;

    return (
        <>
            {/* ── Sección demográfica ── */}
            {demoResult && (
                <div className="at-demo-section">
                    <div className="at-demo-header">
                        <span>
                            <img
                                src="https://www.atlas.cdmx.gob.mx/analisisn3/widgets/Analisis/images/Simbologia/INEGI_CPV2020.png"
                                alt="INEGI"
                                style={{ width: 16, height: 16, verticalAlign: 'middle', marginRight: 6, objectFit: 'contain' }}
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                            Fuente: INEGI-CPV2020
                        </span>
                    </div>
                    {demoResult.count === null ? (
                        <p className="at-demo-empty">Consultando demografía…</p>
                    ) : demoResult.demoData ? (
                        <table className="at-demo-table">
                            <tbody>
                                <tr>
                                    <td><span className="at-demo-icon">👤</span> Población Total</td>
                                    <td className="at-demo-val">{demoResult.demoData.pobtot.toLocaleString()}{demoResult.demoData.hasReserved && ' *'}</td>
                                </tr>
                                <tr>
                                    <td><span className="at-demo-icon">👴</span> Población mayor a 60 años</td>
                                    <td className="at-demo-val">{demoResult.demoData.p_60ymas.toLocaleString()}</td>
                                </tr>
                                <tr>
                                    <td><span className="at-demo-icon">♿</span> Población con discapacidad</td>
                                    <td className="at-demo-val">{demoResult.demoData.pcon_disc.toLocaleString()}</td>
                                </tr>
                                <tr>
                                    <td><span className="at-demo-icon">🏠</span> Total de viviendas habitadas</td>
                                    <td className="at-demo-val">{demoResult.demoData.tvivhab.toLocaleString()}</td>
                                </tr>
                                <tr>
                                    <td><span className="at-demo-icon">⚠️</span> Viviendas habitadas sin drenaje</td>
                                    <td className="at-demo-val">{demoResult.demoData.vph_nodren.toLocaleString()}</td>
                                </tr>
                            </tbody>
                        </table>
                    ) : (
                        <p className="at-demo-empty">Sin datos demográficos en el área.</p>
                    )}
                    {demoResult.demoData?.hasReserved && (
                        <p className="at-demo-reserved">* Algunos AGEBs tienen datos reservados (INEGI).</p>
                    )}
                </div>
            )}

            {/* ── Resumen y estado de carga ── */}
            {loading ? (
                <div className="at-loading-state">
                    <div className="at-loading-spinner" />
                    <p className="at-loading-title">Consultando capas…</p>
                    <p className="at-loading-progress">{totalDone} / {totalLayers} capas</p>
                    <div className="at-progress-bar">
                        <div className="at-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            ) : (
                <div className="at-results-summary">
                    <strong>{hitCount} capa{hitCount !== 1 ? 's' : ''} con datos</strong> de {tableResults.length} consultadas.
                    <br /><small style={{ color: 'var(--color-text-muted)' }}>{address} — radio {ANALYSIS_RADIUS_M} m</small>
                </div>
            )}

            {/* ── Exportar CSV ── */}
            {!loading && results.some(r => (r.count ?? 0) > 0) && (
                <div className="at-export-buttons">
                    <button className="at-export-btn" onClick={onExportCSV}>📊 Exportar CSV</button>
                    <button className="at-export-btn" onClick={onClose} style={{ borderColor: 'var(--color-gray-400)', color: 'var(--color-text-muted)' }}>✕ Cerrar</button>
                </div>
            )}
            {!loading && !results.some(r => (r.count ?? 0) > 0) && (
                <button className="at-export-btn" onClick={onClose} style={{ borderColor: 'var(--color-gray-400)', color: 'var(--color-text-muted)' }}>✕ Cerrar análisis</button>
            )}

            {/* ── Tabla de capas ── */}
            <table className="at-results-table">
                <thead>
                    <tr>
                        <th>NOMBRE</th>
                        <th>TOTAL</th>
                        <th>LEYENDA</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    {tableResults.map((lr, _i) => {
                        const realIdx = results.indexOf(lr);
                        const { text, hasData } = getDisplayValue(lr);
                        const isOpen   = detailLayerId === lr.layerId;
                        const isGreen  = GREEN_GROUPS.has(lr.group);

                        // Cabecera de grupo: primer elemento o cambio de grupo
                        const prevLr = tableResults[_i - 1];
                        const isNewGroup = !prevLr || prevLr.group !== lr.group;

                        return (
                            <React.Fragment key={lr.layerId}>
                                {isNewGroup && (
                                    <tr>
                                        <td colSpan={4} style={{
                                            padding: '5px 10px',
                                            fontWeight: 700,
                                            fontSize: '0.72rem',
                                            background: isGreen ? '#e2efda' : '#d9e1f2',
                                            color: isGreen ? '#375623' : '#1f3864',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                        }}>
                                            {lr.group}
                                        </td>
                                    </tr>
                                )}
                                <tr className={`${!hasData ? 'at-row--zero' : ''} ${isGreen ? 'at-row--green' : ''}`}>
                                    <td className="at-layer-name">{lr.layerName}</td>
                                    <td className={hasData ? 'at-count' : 'at-count--zero'}>{text}</td>
                                    <td className="at-legend-cell">
                                        {lr.symbolUrl ? (
                                            <img src={lr.symbolUrl} className="at-legend-img" alt=""
                                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                                        ) : lr.legendColor ? (
                                            <span className="at-legend-poly" style={{ backgroundColor: lr.legendColor }} />
                                        ) : null}
                                    </td>
                                    <td>
                                        {hasData && (
                                            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                                <button
                                                    className="at-details-btn"
                                                    disabled={lr.loadingDetails}
                                                    aria-expanded={isOpen}
                                                    onClick={() => {
                                                        if (isOpen) onSetDetailId(null);
                                                        else onLoadDetails(lr, realIdx);
                                                    }}
                                                >
                                                    {lr.loadingDetails ? '…' : isOpen ? 'Ocultar' : 'Detalles'}
                                                </button>
                                                {lr.features && lr.features.length > 0 && (
                                                    <button
                                                        className={`at-details-btn${activeMapLayerId === lr.layerId ? ' at-details-btn--active-map' : ''}`}
                                                        title={activeMapLayerId === lr.layerId ? 'Ocultar del mapa' : 'Ver en mapa'}
                                                        onClick={() => onShowOnMap(lr)}
                                                    >
                                                        {activeMapLayerId === lr.layerId ? '🗺️ ✕' : '🗺️'}
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                </tr>

                                {/* Panel expandible de features */}
                                {isOpen && lr.features && (
                                    <tr>
                                        <td colSpan={4} style={{ padding: 0 }}>
                                            <div className="at-detail-panel">
                                                <p className="at-detail-panel-title">
                                                    {lr.layerName} — {lr.features.length} features
                                                    {(lr.count ?? 0) > lr.features.length
                                                        ? ` (primeros ${lr.features.length} de ${lr.count})`
                                                        : ''}
                                                </p>
                                                {lr.features.length === 0 && (
                                                    <p style={{ fontSize: '0.74rem', color: 'var(--color-text-muted)', margin: 0, fontStyle: 'italic' }}>
                                                        Sin features para mostrar.
                                                    </p>
                                                )}
                                                {lr.features.map((f, fi) => {
                                                    const props   = f.properties ?? {};
                                                    const name    = pickName(props);
                                                    const entries = Object.entries(props)
                                                        .filter(([k]) => !SKIP_FIELDS.has(k))
                                                        .slice(0, 6);
                                                    return (
                                                        <div key={fi} className="at-feature-item">
                                                            <div className="at-feature-item-name">{name}</div>
                                                            {entries.map(([k, v]) => (
                                                                <div key={k} className="at-feature-attr">
                                                                    {k}: <span>{String(v ?? '—')}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    );
                                                })}
                                                <button className="at-detail-close" onClick={() => onSetDetailId(null)}>
                                                    Cerrar detalles
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const GeocoderTool: React.FC<GeocoderToolProps> = ({ isOpen, onClose, mapInstance }) => {
    const inputId = useId();

    const [query,       setQuery]       = useState('');
    const [results,     setResults]     = useState<NominatimResult[]>([]);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [selected,    setSelected]    = useState<NominatimResult | null>(null);

    // Estados del análisis
    const [showModal,          setShowModal]          = useState(false);
    const [analysisResults,    setAnalysisResults]    = useState<LayerResult[] | null>(null);
    const [analysisLoading,    setAnalysisLoading]    = useState(false);
    const [pendingResult,      setPendingResult]      = useState<NominatimResult | null>(null);
    const [detailLayerId,      setDetailLayerId]      = useState<string | null>(null);
    const [featuresLayerGroup, setFeaturesLayerGroup] = useState<L.LayerGroup | null>(null);
    const [activeMapLayerId,    setActiveMapLayerId]    = useState<string | null>(null);

    // Ref con la última dirección seleccionada (para loadDetails)
    const selectedResultRef = useRef<NominatimResult | null>(null);

    const inputRef    = useRef<HTMLInputElement>(null);
    const inputWrapRef = useRef<HTMLDivElement>(null);
    const listRef     = useRef<HTMLUListElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortRef    = useRef<AbortController | null>(null);
    const markerRef   = useRef<L.Marker | null>(null);
    const abortAnalysisRef = useRef<AbortController | null>(null);

    // ── Focus / cleanup al abrir/cerrar ───────────────────────────────────────
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 80);
        } else {
            setQuery(''); setResults([]); setError(null);
            setSelected(null); setActiveIndex(-1);
            setShowModal(false); setAnalysisResults(null);
            setPendingResult(null); setDetailLayerId(null);
            featuresLayerGroup?.clearLayers();
            setFeaturesLayerGroup(null);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    useEffect(() => {
        return () => {
            markerRef.current?.remove();
            abortRef.current?.abort();
            abortAnalysisRef.current?.abort();
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    // ── Marcador ──────────────────────────────────────────────────────────────
    const clearMarker = useCallback(() => {
        markerRef.current?.remove();
        markerRef.current = null;
    }, []);

    const placeMarker = useCallback((result: NominatimResult) => {
        if (!mapInstance) return;
        clearMarker();
        const lat = parseFloat(result.lat);
        const lon = parseFloat(result.lon);
        const marker = L.marker([lat, lon], { icon: RESULT_ICON });
        marker.bindPopup(`
            <div class="gc-popup">
                <strong class="gc-popup__title">${buildShortAddress(result)}</strong>
                <span class="gc-popup__coords">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
            </div>`, { maxWidth: 260, offset: [0, -4] });
        marker.addTo(mapInstance);
        marker.openPopup();
        markerRef.current = marker;
    }, [mapInstance, clearMarker]);

    // ── Búsqueda Nominatim ────────────────────────────────────────────────────
    const search = useCallback(async (q: string) => {
        if (q.trim().length < MIN_QUERY_LENGTH) { setResults([]); setLoading(false); return; }
        abortRef.current?.abort();
        abortRef.current = new AbortController();
        setLoading(true); setError(null);
        try {
            const params = new URLSearchParams({
                q, format: 'json', addressdetails: '1',
                limit: String(MAX_RESULTS_API), countrycodes: 'mx',
                dedupe: '1', zoom: '18',
            });
            if (mapInstance) {
                const b = mapInstance.getBounds();
                params.set('viewbox', `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`);
                params.set('bounded', '1');
            }
            const res  = await fetch(`${NOMINATIM_URL}?${params}`, {
                signal: abortRef.current.signal,
                headers: { 'Accept-Language': 'es-MX,es,en' },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: NominatimResult[] = await res.json();
            const sorted = [...data].sort((a, b) => b.importance - a.importance);
            const unique = deduplicateResults(sorted).slice(0, MAX_RESULTS_SHOW);
            setResults(unique);
            setActiveIndex(-1);
            if (unique.length === 0) setError('Sin resultados. Intenta con otra dirección.');
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            logger.error('GeocoderTool — error Nominatim:', err);
            setError('No se pudo conectar con el servicio de búsqueda.');
        } finally {
            setLoading(false);
        }
    }, [mapInstance]);

    // ── Análisis espacial (ArcGIS REST — misma lógica que AnalysisTool) ───────
    const runAnalysis = useCallback(async (result: NominatimResult) => {
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);

        abortAnalysisRef.current?.abort();
        const controller = new AbortController();
        abortAnalysisRef.current = controller;

        // Construir círculo de 500 m exactamente igual que AnalysisTool en modo 'point'
        const ring        = buildCircleRing(L.latLng(lat, lng), ANALYSIS_RADIUS_M);
        const geometry    = JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } });
        const geometryType = 'esriGeometryPolygon';

        // Inicializar todas las capas en estado "cargando"
        const initial = buildInitialResults();
        setAnalysisResults(initial);
        setAnalysisLoading(true);

        await Promise.all(
            ANALYSIS_LAYERS.map(async (layer, idx) => {
                if (controller.signal.aborted) return;
                try {
                    const { count, categorias, demoData } = await queryArcGISLayer(
                        layer, geometry, geometryType, controller.signal,
                    );
                    if (controller.signal.aborted) return;
                    setAnalysisResults(prev => {
                        if (!prev) return prev;
                        const next = [...prev];
                        next[idx] = { ...next[idx], count, categorias, demoData };
                        return next;
                    });
                } catch {
                    if (controller.signal.aborted) return;
                    setAnalysisResults(prev => {
                        if (!prev) return prev;
                        const next = [...prev];
                        next[idx] = { ...next[idx], count: 0, categorias: [], demoData: null, error: true };
                        return next;
                    });
                }
            }),
        );

        if (!controller.signal.aborted) setAnalysisLoading(false);
    }, []);

    // ── Seleccionar resultado ─────────────────────────────────────────────────
    const handleSelect = useCallback((result: NominatimResult) => {
        const lat  = parseFloat(result.lat);
        const lon  = parseFloat(result.lon);
        const zoom = dynamicZoom(result);

        setSelected(result);
        setQuery(buildShortAddress(result));
        setResults([]);
        setActiveIndex(-1);
        setAnalysisResults(null);
        setDetailLayerId(null);
        selectedResultRef.current = result;           // guardar para loadDetails

        if (mapInstance) {
            mapInstance.flyTo([lat, lon], zoom, { animate: true, duration: 1.4 });
            placeMarker(result);
        }

        // Siempre ofrecer análisis (capas fijas de Atlas CDMX, no depende de capas activas)
        setPendingResult(result);
        setShowModal(true);
    }, [mapInstance, placeMarker]);

    // ── Modal: confirmar análisis ─────────────────────────────────────────────
    const handleAnalysisConfirm = useCallback(() => {
        setShowModal(false);
        if (pendingResult) runAnalysis(pendingResult);
    }, [pendingResult, runAnalysis]);

    const handleAnalysisCancel = useCallback(() => {
        setShowModal(false);
        setPendingResult(null);
    }, []);

    const handleCloseAnalysis = useCallback(() => {
        abortAnalysisRef.current?.abort();
        setAnalysisResults(null);
        setAnalysisLoading(false);
        setDetailLayerId(null);
        featuresLayerGroup?.clearLayers();
        setFeaturesLayerGroup(null);
        setActiveMapLayerId(null);
    }, [featuresLayerGroup]);

    // ── Cargar detalles de una capa (idéntico a AnalysisTool.loadDetails) ─────
    const loadDetails = useCallback(async (lr: LayerResult, idx: number) => {
        // Si ya tiene features cacheados, solo abrir el panel
        if (lr.features) { setDetailLayerId(lr.layerId); return; }

        setAnalysisResults(prev => {
            if (!prev) return prev;
            const u = [...prev];
            u[idx] = { ...u[idx], loadingDetails: true };
            return u;
        });
        setDetailLayerId(lr.layerId);

        try {
            const res = selectedResultRef.current;
            if (!res) throw new Error('No hay dirección seleccionada');
            const lat = parseFloat(res.lat);
            const lng = parseFloat(res.lon);

            const ring        = buildCircleRing(L.latLng(lat, lng), ANALYSIS_RADIUS_M);
            const geometry    = JSON.stringify({ rings: [ring], spatialReference: { wkid: 4326 } });
            const layerDef    = ANALYSIS_LAYERS.find(l => l.id === lr.layerId);
            const where       = layerDef?.where ?? '1=1';

            const params = new URLSearchParams({
                f:                 'geojson',
                geometry,
                geometryType:      'esriGeometryPolygon',
                inSR:              '4326',
                spatialRel:        'esriSpatialRelIntersects',
                where,
                outFields:         '*',
                returnGeometry:    'true',
                resultRecordCount: '100',
            });

            const response = await fetch(`${lr.url}/query`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body:    params.toString(),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data     = await response.json();
            const features = (data.features ?? []) as GeoJSON.Feature[];

            setAnalysisResults(prev => {
                if (!prev) return prev;
                const u = [...prev];
                u[idx] = { ...u[idx], features, loadingDetails: false };
                return u;
            });
        } catch (err) {
            logger.error(`[GeocoderTool] Error detalles ${lr.layerName}:`, err);
            setAnalysisResults(prev => {
                if (!prev) return prev;
                const u = [...prev];
                u[idx] = { ...u[idx], loadingDetails: false };
                return u;
            });
        }
    }, []);

    // ── Visualizar features en el mapa (toggle: 1er click muestra, 2do oculta) ─
    const showFeaturesOnMap = useCallback((lr: LayerResult) => {
        if (!mapInstance || !lr.features) return;

        // Toggle: si ya está activa, ocultar
        if (activeMapLayerId === lr.layerId) {
            featuresLayerGroup?.clearLayers();
            setFeaturesLayerGroup(null);
            setActiveMapLayerId(null);
            return;
        }

        featuresLayerGroup?.clearLayers();
        const group = L.layerGroup().addTo(mapInstance);

        const fillColor = lr.legendColor ?? '#2563eb';

        // Borde contrastante según luminancia
        const hexLum = (hex: string): number => {
            const c = hex.replace('#', '');
            const r = parseInt(c.substring(0,2), 16) / 255;
            const g = parseInt(c.substring(2,4), 16) / 255;
            const b = parseInt(c.substring(4,6), 16) / 255;
            const lin = (v: number) => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        };
        let strokeColor = '#ffffff';
        try { strokeColor = hexLum(fillColor.length === 7 ? fillColor : '#2563eb') > 0.35 ? '#1a1a1a' : '#ffffff'; }
        catch { strokeColor = '#ffffff'; }

        const pointIcon = lr.symbolUrl
            ? L.icon({
                iconUrl:     lr.symbolUrl,
                iconSize:    [24, 24],
                iconAnchor:  [12, 12],
                popupAnchor: [0, -14],
            })
            : null;

        let bounds: L.LatLngBounds | null = null;

        lr.features.forEach(feature => {
            if (!feature.geometry) return;
            const geomType = (feature.geometry as GeoJSON.Geometry).type;
            const isPoint  = geomType === 'Point' || geomType === 'MultiPoint';

            const layer = L.geoJSON(feature as unknown as GeoJSON.GeoJsonObject, {
                style: {
                    color:       strokeColor,
                    weight:      2.5,
                    fillColor,
                    fillOpacity: 0.5,
                    opacity:     1,
                },
                pointToLayer: (_pt, latlng) =>
                    pointIcon
                        ? L.marker(latlng, { icon: pointIcon })
                        : L.circleMarker(latlng, {
                            radius:      8,
                            color:       strokeColor,
                            fillColor,
                            fillOpacity: 0.9,
                            weight:      2.5,
                        }),
            });

            const name = pickName(feature.properties ?? {});
            layer.bindPopup(
                `<strong>${name}</strong><br/><span style="color:#666;font-size:0.8em">${lr.layerName}</span>`,
            );
            layer.addTo(group);

            try {
                const lb = isPoint ? (layer as L.GeoJSON).getBounds() : layer.getBounds();
                if (lb && lb.isValid()) bounds = bounds ? bounds.extend(lb) : lb;
            } catch { /* algunos features puntuales no tienen getBounds */ }
        });

        setFeaturesLayerGroup(group);
        setActiveMapLayerId(lr.layerId);
        if (bounds && (bounds as L.LatLngBounds).isValid())
            mapInstance.fitBounds(bounds as L.LatLngBounds, { padding: [50, 50] });
    }, [mapInstance, featuresLayerGroup, activeMapLayerId]);

    // ── Exportar CSV (misma lógica que AnalysisTool) ──────────────────────────
    const handleExportCSV = useCallback(() => {
        if (!analysisResults) return;
        const demoR = analysisResults.find(r => r.operation === 'suma');

        const demoRows = demoR?.demoData ? [
            { Nombre: '── Fuente: INEGI-CPV2020 ──',        Grupo: 'Demografía', Total: '',                              Categorías: '' },
            { Nombre: 'Población Total',                     Grupo: 'Demografía', Total: demoR.demoData.pobtot,           Categorías: '' },
            { Nombre: 'Población mayor a 60 años',           Grupo: 'Demografía', Total: demoR.demoData.p_60ymas,         Categorías: '' },
            { Nombre: 'Población con discapacidad',          Grupo: 'Demografía', Total: demoR.demoData.pcon_disc,        Categorías: '' },
            { Nombre: 'Total de viviendas habitadas',        Grupo: 'Demografía', Total: demoR.demoData.tvivhab,          Categorías: '' },
            { Nombre: 'Viviendas habitadas sin drenaje',     Grupo: 'Demografía', Total: demoR.demoData.vph_nodren,       Categorías: demoR.demoData.hasReserved ? '(*) Datos reservados descartados' : '' },
        ] : [];

        const layerRows = analysisResults
            .filter(r => r.operation !== 'suma' && (r.count ?? 0) > 0)
            .map(r => ({
                Nombre:     r.layerName,
                Grupo:      r.group,
                Total:      r.count ?? 0,
                Categorías: r.categorias?.join(' | ') ?? '',
            }));

        const data = [...demoRows, ...layerRows];
        if (data.length === 0) { alert('No hay resultados para exportar'); return; }

        const addr = selected ? buildShortAddress(selected).replace(/[^a-z0-9]/gi, '_').slice(0, 40) : 'direccion';
        downloadCSVWithBOM(data, `analisis-${addr}-${new Date().toISOString().split('T')[0]}.csv`);
    }, [analysisResults, selected]);

    // ── Limpiar ───────────────────────────────────────────────────────────────
    const handleClear = useCallback(() => {
        setQuery(''); setResults([]); setError(null);
        setSelected(null); setActiveIndex(-1);
        setShowModal(false); setAnalysisResults(null);
        setPendingResult(null); setDetailLayerId(null);
        abortAnalysisRef.current?.abort();
        featuresLayerGroup?.clearLayers();
        setFeaturesLayerGroup(null);
        clearMarker();
        inputRef.current?.focus();
    }, [clearMarker, featuresLayerGroup]);

    // ── Teclado ───────────────────────────────────────────────────────────────
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            if (results.length > 0) setResults([]);
            else onClose();
            return;
        }
        if (!results.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex(prev => {
                const next = prev < results.length - 1 ? prev + 1 : 0;
                listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                return next;
            });
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex(prev => {
                const next = prev > 0 ? prev - 1 : results.length - 1;
                listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
                return next;
            });
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const target = activeIndex >= 0 ? results[activeIndex] : results[0];
            if (target) handleSelect(target);
        }
    }, [results, activeIndex, handleSelect, onClose]);

    const handleSubmit = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim().length >= MIN_QUERY_LENGTH) {
            const target = activeIndex >= 0 ? results[activeIndex] : results[0];
            if (target) handleSelect(target);
            else search(query);
        }
    }, [query, results, activeIndex, handleSelect, search]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val); setSelected(null); setError(null);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (val.trim().length < MIN_QUERY_LENGTH) { setResults([]); return; }
        debounceRef.current = setTimeout(() => search(val), DEBOUNCE_MS);
    }, [search]);

    // Estado para la posición fija del dropdown (portal)
    const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

    const showDropdown = results.length > 0;

    // Recalcula la posición del dropdown cuando aparece o el panel se mueve
    useEffect(() => {
        if (!showDropdown || !inputWrapRef.current) { setDropdownRect(null); return; }
        const update = () => {
            if (!inputWrapRef.current) return;
            const rect = inputWrapRef.current.getBoundingClientRect();
            setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [showDropdown]);

    if (!isOpen) return null;

    return (
        <>
            <div className="gc-panel" role="dialog" aria-label="Buscador de direcciones">

                {/* ── Header ── */}
                <div className="gc-header" data-drag-handle>
                    <svg className="gc-header__icon" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                         strokeLinejoin="round" aria-hidden="true">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M16.5 16.5 22 22" />
                    </svg>
                    <span className="gc-header__title">Buscar dirección</span>
                    <button className="gc-header__close" onClick={onClose} aria-label="Cerrar">✕</button>
                </div>

                {/* ── Cuerpo ── */}
                <div className="gc-body">
                    <form className="gc-form" onSubmit={handleSubmit} autoComplete="off" noValidate>
                        <label htmlFor={inputId} className="gc-form__label">
                            Dirección, lugar o colonia
                        </label>
                        <div className="gc-input-wrap" ref={inputWrapRef}>
                            <svg className="gc-input-wrap__icon" viewBox="0 0 24 24" fill="none"
                                 stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round" aria-hidden="true">
                                <circle cx="11" cy="11" r="7" />
                                <path d="M16.5 16.5 22 22" />
                            </svg>
                            <input
                                id={inputId} ref={inputRef} type="text" className="gc-input"
                                value={query} onChange={handleInputChange} onKeyDown={handleKeyDown}
                                placeholder="Ej: Reforma 222, Av. Universidad, Zócalo…"
                                aria-label="Buscar dirección" aria-autocomplete="list"
                                aria-expanded={showDropdown}
                                aria-activedescendant={activeIndex >= 0 ? `gc-result-${activeIndex}` : undefined}
                                aria-controls="gc-results-list" spellCheck={false}
                            />
                            {query && (
                                <button type="button" className="gc-input-wrap__clear"
                                        onClick={handleClear} aria-label="Limpiar búsqueda">✕</button>
                            )}
                            <button type="submit" className="gc-input-wrap__submit"
                                    disabled={query.trim().length < MIN_QUERY_LENGTH || loading}
                                    aria-label="Buscar">
                                {loading
                                    ? <span className="gc-spinner" aria-hidden="true" />
                                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                           strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                           aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg>
                                }
                            </button>
                        </div>
                    </form>

                    {/* Dropdown renderizado fuera del panel via portal para escapar overflow:hidden */}
                    {showDropdown && dropdownRect && ReactDOM.createPortal(
                        <ul
                            id="gc-results-list"
                            ref={listRef}
                            className="gc-results gc-results--portal"
                            role="listbox"
                            aria-label="Resultados de búsqueda"
                            style={{
                                position: 'fixed',
                                top:   dropdownRect.top,
                                left:  dropdownRect.left,
                                width: dropdownRect.width,
                            }}
                        >
                            {results.map((r, i) => (
                                <li key={r.place_id} id={`gc-result-${i}`} role="option"
                                    aria-selected={i === activeIndex}
                                    className={`gc-result ${i === activeIndex ? 'gc-result--active' : ''}`}
                                    onClick={() => handleSelect(r)}
                                    onMouseEnter={() => setActiveIndex(i)}>
                                    <span className="gc-result__icon" aria-hidden="true">{placeIcon(r.type)}</span>
                                    <span className="gc-result__text">
                                        <span className="gc-result__name">{buildShortAddress(r)}</span>
                                        <span className="gc-result__sub">{r.display_name}</span>
                                    </span>
                                    </li>
                                ))}
                            </ul>,
                        document.body,
                    )}

                    {error && !showDropdown && (
                        <p className="gc-error" role="alert">⚠ {error}</p>
                    )}

                    {selected && !showDropdown && (
                        <div className="gc-selected">
                            <div className="gc-selected__row">
                                <span className="gc-selected__pin">📍</span>
                                <div className="gc-selected__info">
                                    <strong className="gc-selected__name">{buildShortAddress(selected)}</strong>
                                    <span className="gc-selected__coords">
                                        {parseFloat(selected.lat).toFixed(6)},&nbsp;
                                        {parseFloat(selected.lon).toFixed(6)}
                                    </span>
                                </div>
                            </div>
                            <div className="gc-selected__actions">
                                <button className="gc-btn gc-btn--secondary" onClick={() => {
                                    if (mapInstance) {
                                        mapInstance.flyTo(
                                            [parseFloat(selected.lat), parseFloat(selected.lon)],
                                            dynamicZoom(selected), { animate: true, duration: 1.2 }
                                        );
                                        markerRef.current?.openPopup();
                                    }
                                }}>↗ Volver al punto</button>
                                <button className="gc-btn gc-btn--danger" onClick={handleClear}>
                                    🗑 Limpiar punto
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Panel de resultados del análisis */}
                    {analysisResults !== null && (
                        <AnalysisPanel
                            address={selected ? buildShortAddress(selected) : ''}
                            results={analysisResults}
                            loading={analysisLoading}
                            onClose={handleCloseAnalysis}
                            detailLayerId={detailLayerId}
                            onLoadDetails={loadDetails}
                            onSetDetailId={setDetailLayerId}
                            onShowOnMap={showFeaturesOnMap}
                            onExportCSV={handleExportCSV}
                            activeMapLayerId={activeMapLayerId}
                        />
                    )}

                    {!selected && markerRef.current && query && !showDropdown && (
                        <div className="gc-active-marker-bar">
                            <span className="gc-active-marker-bar__label">📍 Hay un punto activo en el mapa</span>
                            <button className="gc-btn gc-btn--danger gc-btn--sm" onClick={handleClear}>
                                🗑 Limpiar
                            </button>
                        </div>
                    )}

                    {!query && !selected && (
                        <p className="gc-hint">
                            Escribe al menos {MIN_QUERY_LENGTH} caracteres para buscar.<br />
                            Usa <kbd>↑</kbd> <kbd>↓</kbd> para navegar, <kbd>Enter</kbd> para seleccionar.
                        </p>
                    )}
                </div>
            </div>

            {/* Modal de confirmación (fuera del panel para z-index correcto) */}
            {showModal && pendingResult && (
                <AnalysisModal
                    address={buildShortAddress(pendingResult)}
                    onConfirm={handleAnalysisConfirm}
                    onCancel={handleAnalysisCancel}
                />
            )}
        </>
    );
};

export default GeocoderTool;