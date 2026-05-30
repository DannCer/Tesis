/**
 * @fileoverview GeocoderTool — Buscador de direcciones con autocompletado.
 *
 * Al seleccionar un resultado:
 *  1. Vuela al punto y coloca un marcador temporal.
 *  2. Muestra un modal preguntando si se desea analizar las capas a 500 m.
 *  3. Si el usuario confirma, consulta todas las capas vectoriales activas
 *     con la misma lógica de AnalysisTool (BBOX + filtro cliente).
 *
 * @module components/map/tools/GeocoderTool
 */

import React, {
    useState, useCallback, useRef, useEffect, useId,
} from 'react';
import L from 'leaflet';
import { logger } from '@config/env';
import { useLayersData } from '@contexts/LayersContext';
import { dynamicWfsService } from '@services/geoserver/dynamicWfsService';
import '@styles/GeocoderTool.css';

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

interface LayerAnalysisResult {
    layerId: string;
    layerName: string;
    count: number | null; // null = cargando, -1 = error
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
const ANALYSIS_RADIUS_M = 500; // metros

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

// ─── Helpers de análisis espacial (misma lógica que AnalysisTool) ─────────────

function buildBboxCql(lat: number, lng: number, radiusM: number, geomField = 'geometry'): string {
    const DEG_LAT = radiusM / 111320;
    const DEG_LNG = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
    return `BBOX(${geomField},${lng - DEG_LNG},${lat - DEG_LAT},${lng + DEG_LNG},${lat + DEG_LAT})`;
}

function clientFilter(features: GeoJSON.Feature[], lat: number, lng: number, radiusM: number): GeoJSON.Feature[] {
    const center = L.latLng(lat, lng);
    return features.filter(f => {
        const g = f.geometry;
        if (!g) return false;
        let coords: number[] | null = null;
        if (g.type === 'Point')           coords = g.coordinates;
        else if (g.type === 'MultiPoint') coords = g.coordinates[0];
        else if (g.type === 'LineString') coords = g.coordinates[0];
        else if (g.type === 'MultiLineString') coords = g.coordinates[0][0];
        else if (g.type === 'Polygon')    coords = g.coordinates[0][0];
        else if (g.type === 'MultiPolygon') coords = g.coordinates[0][0][0];
        if (!coords) return false;
        return center.distanceTo(L.latLng(coords[1], coords[0])) <= radiusM;
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
    address:  string;
    results:  LayerAnalysisResult[];
    loading:  boolean;
    onClose:  () => void;
}

const AnalysisPanel: React.FC<AnalysisPanelProps> = ({ address, results, loading, onClose }) => {
    const done    = results.filter(r => r.count !== null);
    const withHits = results.filter(r => r.count !== null && r.count > 0);

    return (
        <div className="gc-analysis-panel">
            <div className="gc-analysis-panel__header">
                <span className="gc-analysis-panel__title">
                    🔍 Análisis — {ANALYSIS_RADIUS_M} m
                </span>
                <button className="gc-analysis-panel__close" onClick={onClose} aria-label="Cerrar análisis">✕</button>
            </div>
            <p className="gc-analysis-panel__subtitle">{address}</p>

            {loading && done.length === 0 && (
                <p className="gc-analysis-panel__loading">Consultando capas…</p>
            )}

            {results.length === 0 && !loading && (
                <p className="gc-analysis-panel__empty">No hay capas vectoriales activas.</p>
            )}

            <ul className="gc-analysis-panel__list">
                {results.map(r => (
                    <li key={r.layerId} className="gc-analysis-panel__item">
                        <span className="gc-analysis-panel__layer">{r.layerName}</span>
                        <span className={`gc-analysis-panel__count ${
                            r.count === null ? 'gc-analysis-panel__count--loading' :
                            r.count === -1   ? 'gc-analysis-panel__count--error'   :
                            r.count === 0    ? 'gc-analysis-panel__count--zero'    :
                                               'gc-analysis-panel__count--hit'
                        }`}>
                            {r.count === null ? '…'       :
                             r.count === -1   ? '!'        :
                             r.count === 0    ? '0'        :
                             `${r.count}`}
                        </span>
                    </li>
                ))}
            </ul>

            {!loading && done.length > 0 && (
                <p className="gc-analysis-panel__summary">
                    {withHits.length > 0
                        ? `${withHits.length} capa${withHits.length !== 1 ? 's' : ''} con registros cercanos`
                        : 'Sin registros en ninguna capa'}
                </p>
            )}
        </div>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const GeocoderTool: React.FC<GeocoderToolProps> = ({ isOpen, onClose, mapInstance }) => {
    const inputId = useId();
    const { vectorLayers } = useLayersData();

    const [query,       setQuery]       = useState('');
    const [results,     setResults]     = useState<NominatimResult[]>([]);
    const [loading,     setLoading]     = useState(false);
    const [error,       setError]       = useState<string | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [selected,    setSelected]    = useState<NominatimResult | null>(null);

    // Estados del análisis
    const [showModal,        setShowModal]        = useState(false);
    const [analysisResults,  setAnalysisResults]  = useState<LayerAnalysisResult[] | null>(null);
    const [analysisLoading,  setAnalysisLoading]  = useState(false);
    const [pendingResult,    setPendingResult]     = useState<NominatimResult | null>(null);

    const inputRef    = useRef<HTMLInputElement>(null);
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
            setPendingResult(null);
        }
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

    // ── Análisis espacial ─────────────────────────────────────────────────────
    const runAnalysis = useCallback(async (result: NominatimResult) => {
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);

        abortAnalysisRef.current?.abort();
        const controller = new AbortController();
        abortAnalysisRef.current = controller;

        const initial: LayerAnalysisResult[] = vectorLayers.map(vl => ({
            layerId:   vl.id,
            layerName: vl.name,
            count:     null,
        }));
        setAnalysisResults(initial);
        setAnalysisLoading(true);

        await Promise.all(
            vectorLayers.map(async (vl, idx) => {
                if (controller.signal.aborted) return;
                try {
                    const wfsName   = vl.wfsName || vl.name;
                    const group     = vl.group   || 'Sin grupo';
                    const geomField = await dynamicWfsService.getGeometryFieldName(wfsName, group);
                    const bboxCql   = buildBboxCql(lat, lng, ANALYSIS_RADIUS_M, geomField);
                    const data      = await dynamicWfsService.getFeatures(
                        wfsName, group, { cql_filter: bboxCql, maxFeatures: 0 }
                    );
                    if (controller.signal.aborted) return;
                    const count = clientFilter(data.features ?? [], lat, lng, ANALYSIS_RADIUS_M).length;
                    setAnalysisResults(prev => {
                        if (!prev) return prev;
                        const next = [...prev];
                        next[idx] = { ...next[idx], count };
                        return next;
                    });
                } catch {
                    if (controller.signal.aborted) return;
                    setAnalysisResults(prev => {
                        if (!prev) return prev;
                        const next = [...prev];
                        next[idx] = { ...next[idx], count: -1 };
                        return next;
                    });
                }
            })
        );

        if (!controller.signal.aborted) setAnalysisLoading(false);
    }, [vectorLayers]);

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

        if (mapInstance) {
            mapInstance.flyTo([lat, lon], zoom, { animate: true, duration: 1.4 });
            placeMarker(result);
        }

        // Mostrar modal solo si hay capas vectoriales activas
        if (vectorLayers.length > 0) {
            setPendingResult(result);
            setShowModal(true);
        }
    }, [mapInstance, placeMarker, vectorLayers]);

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
    }, []);

    // ── Limpiar ───────────────────────────────────────────────────────────────
    const handleClear = useCallback(() => {
        setQuery(''); setResults([]); setError(null);
        setSelected(null); setActiveIndex(-1);
        setShowModal(false); setAnalysisResults(null);
        setPendingResult(null);
        abortAnalysisRef.current?.abort();
        clearMarker();
        inputRef.current?.focus();
    }, [clearMarker]);

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

    if (!isOpen) return null;

    const showDropdown = results.length > 0;

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
                        <div className="gc-input-wrap">
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

                        {showDropdown && (
                            <ul id="gc-results-list" ref={listRef} className="gc-results"
                                role="listbox" aria-label="Resultados de búsqueda">
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
                            </ul>
                        )}
                    </form>

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
