/**
 * @fileoverview DynamicAttributeTable — Tabla de atributos dinámica con:
 *  - Pestañas por cada capa vectorial activa
 *  - Filtrado por extensión de mapa (moveend / zoomend)
 *  - Selección de renglones (click, Ctrl+click, Shift+click)
 *  - Resaltado de features seleccionadas en el mapa (color institucional)
 *  - Zoom a entidades seleccionadas
 *  - SQL WHERE, búsqueda global, ordenamiento, paginación, export CSV
 *  - Redimensionamiento de columnas por arrastre
 *
 * @module components/map/panels/DynamicAttributeTable
 */

import React, {
    useState, useMemo, useCallback, useRef, useEffect, memo,
} from 'react';
import L from 'leaflet';
import '@styles/DynamicAttributeTable.css';

// Los colores institucionales y la capa de resaltado son gestionados por MapView

// ============================================================================
// TIPOS
// ============================================================================

export interface DynamicVectorLayer {
    name: string;
    data: GeoJSON.FeatureCollection | null;
}

export interface DynamicAttributeTableProps {
    vectorLayers: Record<string, DynamicVectorLayer>;
    mapInstance: L.Map | null;
    onClose: () => void;
    /** Capa Leaflet de resaltado compartida con MapView */
    highlightLayerRef: React.MutableRefObject<L.GeoJSON | null>;
    /** Feature clicada en el mapa que debe seleccionarse en la tabla */
    mapSelectedFeature?: { layerId: string; feature: GeoJSON.Feature } | null;
    /** Callback para avisar que el evento ya fue consumido */
    onMapFeatureConsumed?: () => void;
}

/** Entrada del pipeline — preserva el índice original de feature */
interface PipelineEntry {
    row: Record<string, unknown>;
    fi: number; // índice en extentFeatures
}

// ============================================================================
// PARSER SQL WHERE
// ============================================================================

function applySqlFilter(
    entries: PipelineEntry[],
    sql: string,
): PipelineEntry[] | { message: string } {
    const expr = sql.trim();
    if (!expr) return entries;
    try {
        return entries.filter(({ row }) => evalExpr(expr, row));
    } catch (e) {
        return { message: e instanceof Error ? e.message : 'Error en la expresión SQL' };
    }
}

function extractField(s: string) {
    const dq = s.match(/^"([^"]+)"\s*([\s\S]*)/);
    if (dq) return { field: dq[1], rest: dq[2] };
    const br = s.match(/^\[([^\]]+)\]\s*([\s\S]*)/);
    if (br) return { field: br[1], rest: br[2] };
    const id = s.match(/^([\w\u00C0-\u024F][\w\u00C0-\u024F_]*)\s*([\s\S]*)/);
    if (id) return { field: id[1], rest: id[2] };
    return null;
}

function evalExpr(expr: string, row: Record<string, unknown>): boolean {
    const s = expr.trim();
    const orParts = splitLogical(s, 'OR');
    if (orParts.length > 1) return orParts.some(p => evalExpr(p, row));
    const andParts = splitLogical(s, 'AND');
    if (andParts.length > 1) return andParts.every(p => evalExpr(p, row));
    if (/^NOT\s+/i.test(s)) return !evalExpr(s.slice(4).trim(), row);
    if (s.startsWith('(') && matchingParen(s) === s.length - 1)
        return evalExpr(s.slice(1, -1), row);
    const f = extractField(s);
    if (!f) throw new Error(`Campo no reconocido: "${s.slice(0, 50)}"`);
    const { field, rest } = f;
    const colVal = row[field];
    const r = rest.trim();
    const nullM = r.match(/^IS\s+(NOT\s+)?NULL$/i);
    if (nullM) {
        const isNull = colVal === null || colVal === undefined || colVal === '';
        return nullM[1] ? !isNull : isNull;
    }
    const likeM = r.match(/^LIKE\s+'([^']*)'/i);
    if (likeM) {
        const val = String(colVal ?? '').toLowerCase();
        const pattern = likeM[1].toLowerCase().replace(/%/g, '.*').replace(/_/g, '.');
        return new RegExp(`^${pattern}$`).test(val);
    }
    const cmpM = r.match(/^(!=|<>|<=|>=|=|<|>)\s*([\s\S]+)$/);
    if (cmpM) {
        const op = cmpM[1], rawVal = cmpM[2];
        const strM = rawVal.trim().match(/^'([^']*)'$/);
        if (strM) {
            const a = String(colVal ?? '').toLowerCase();
            const b = strM[1].toLowerCase();
            if (op === '=' || op === '==') return a === b;
            if (op === '!=' || op === '<>') return a !== b;
            const res = a.localeCompare(b);
            return op === '<' ? res < 0 : op === '<=' ? res <= 0 : op === '>' ? res > 0 : res >= 0;
        }
        const num = parseFloat(rawVal.trim());
        if (!isNaN(num)) {
            const a = parseFloat(String(colVal ?? '').replace(/,/g, ''));
            if (isNaN(a)) return false;
            if (op === '=' || op === '==') return a === num;
            if (op === '!=' || op === '<>') return a !== num;
            return op === '<' ? a < num : op === '<=' ? a <= num : op === '>' ? a > num : a >= num;
        }
        throw new Error(`Valor no reconocido: "${rawVal.trim().slice(0, 30)}"`);
    }
    throw new Error(`Operador no reconocido: "${r.slice(0, 40)}"`);
}

function matchingParen(s: string): number {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') { depth--; if (depth === 0) return i; }
    }
    return -1;
}

function splitLogical(expr: string, keyword: string): string[] {
    const kw = keyword.toUpperCase();
    const parts: string[] = [];
    let depth = 0, inSingle = false, inDouble = false, start = 0;
    for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        if (ch === '"' && !inSingle) inDouble = !inDouble;
        if (inSingle || inDouble) continue;
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth === 0) {
            const ahead = expr.slice(i).toUpperCase();
            const prevChar = expr[i - 1];
            const nextChar = expr[i + kw.length];
            const before = i === 0 || /\s/.test(prevChar);
            const after = nextChar === undefined || /[\s(]/.test(nextChar);
            if (before && ahead.startsWith(kw) && after) {
                const chunk = expr.slice(start, i).trim();
                if (chunk) { parts.push(chunk); start = i + kw.length; i = start - 1; }
            }
        }
    }
    const last = expr.slice(start).trim();
    if (last) parts.push(last);
    return parts.length > 1 ? parts : [expr];
}

// ============================================================================
// UTILIDADES GEOESPACIALES
// ============================================================================

function geomBBox(
    geom: GeoJSON.Geometry | null | undefined,
): [number, number, number, number] | null {
    if (!geom) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const expand = (lng: number, lat: number) => {
        if (lng < minX) minX = lng; if (lat < minY) minY = lat;
        if (lng > maxX) maxX = lng; if (lat > maxY) maxY = lat;
    };
    const walk = (c: unknown): void => {
        if (!Array.isArray(c)) return;
        if (typeof c[0] === 'number') expand(c[0] as number, c[1] as number);
        else (c as unknown[]).forEach(walk);
    };
    walk((geom as { coordinates?: unknown }).coordinates);
    return minX === Infinity ? null : [minX, minY, maxX, maxY];
}

function featureIntersectsBounds(f: GeoJSON.Feature, bounds: L.LatLngBounds): boolean {
    const bbox = geomBBox(f.geometry);
    if (!bbox) return true;
    return bounds.intersects(L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]));
}

function featureBounds(f: GeoJSON.Feature): L.LatLngBounds | null {
    const bbox = geomBBox(f.geometry);
    if (!bbox) return null;
    const b = L.latLngBounds([bbox[1], bbox[0]], [bbox[3], bbox[2]]);
    return b.isValid() ? b : null;
}

// ============================================================================
// CONSTANTES
// ============================================================================

const ROWS_PER_PAGE   = 300;
const SEARCH_DEBOUNCE = 180;

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

const DynamicAttributeTable: React.FC<DynamicAttributeTableProps> = memo(({
    vectorLayers,
    mapInstance,
    onClose,
    highlightLayerRef,
    mapSelectedFeature,
    onMapFeatureConsumed,
}) => {

    // ── Capas visibles disponibles ──────────────────────────────────────────
    const visibleLayerIds = useMemo(() =>
        Object.entries(vectorLayers ?? {})
            .filter(([, l]) => l?.data && Array.isArray(l.data.features) && l.data.features.length > 0)
            .map(([id]) => id),
        [vectorLayers],
    );

    const [activeTab,       setActiveTab]       = useState<string>('');
    const [filterByExtent,  setFilterByExtent]  = useState(false);
    const [mapBounds,       setMapBounds]       = useState<L.LatLngBounds | null>(null);
    // selectedFiSet: índices en extentFeatures (no en processedEntries)
    const [selectedFiSet,   setSelectedFiSet]   = useState<Set<number>>(new Set());
    const lastClickedFi = useRef<number | null>(null);

    // ── SQL / búsqueda / UI ─────────────────────────────────────────────────
    const [searchTerm,      setSearchTerm]      = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [sqlInput,        setSqlInput]        = useState('');
    const [sqlApplied,      setSqlApplied]      = useState('');
    const [sqlError,        setSqlError]        = useState('');
    const [sqlOpen,         setSqlOpen]         = useState(false);
    const [sortColumn,      setSortColumn]      = useState<string | null>(null);
    const [sortDirection,   setSortDirection]   = useState<'asc' | 'desc'>('asc');
    const [currentPage,     setCurrentPage]     = useState(1);
    const [columnWidths,    setColumnWidths]    = useState<Record<string, number>>({});
    const [tableOpacity,    setTableOpacity]    = useState(100);

    const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);
    const sortColRef  = useRef<string | null>(null);
    const sortDirRef  = useRef<'asc' | 'desc'>('asc');
    const tbodyRef    = useRef<HTMLTableSectionElement>(null);

    // La capa de resaltado es gestionada por MapView y se recibe via `highlightLayerRef`

    // ── Sincronizar pestaña activa ──────────────────────────────────────────
    useEffect(() => {
        if (visibleLayerIds.length === 0) { setActiveTab(''); return; }
        if (!visibleLayerIds.includes(activeTab)) {
            setActiveTab(visibleLayerIds[0]);
            setSelectedFiSet(new Set());
            highlightLayerRef.current?.clearLayers();
        }
    }, [visibleLayerIds, activeTab]);

    const handleTabChange = useCallback((id: string) => {
        setActiveTab(id);
        setSelectedFiSet(new Set());
        highlightLayerRef.current?.clearLayers();
        setCurrentPage(1);
        setSqlInput(''); setSqlApplied(''); setSqlError('');
        setSearchTerm(''); setDebouncedSearch('');
        setSortColumn(null); sortColRef.current = null;
        lastClickedFi.current = null;
    }, []);

    // ── Limpiar highlight al cerrar ─────────────────────────────────────────
    const handleClose = useCallback(() => {
        highlightLayerRef.current?.clearLayers();
        onClose();
    }, [onClose]);

    // ── Eventos del mapa ────────────────────────────────────────────────────
    useEffect(() => {
        if (!mapInstance) return;
        const update = () => setMapBounds(mapInstance.getBounds());
        update();
        mapInstance.on('moveend zoomend', update);
        return () => { mapInstance.off('moveend zoomend', update); };
    }, [mapInstance]);

    // ── Resize de columnas ──────────────────────────────────────────────────
    const handleResizeStart = useCallback((col: string, e: React.MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        resizingRef.current = { col, startX: e.clientX, startW: columnWidths[col] || 150 };
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [columnWidths]);

    useEffect(() => {
        const onMove = (e: MouseEvent) => {
            if (!resizingRef.current) return;
            const { col, startX, startW } = resizingRef.current;
            setColumnWidths(prev => ({ ...prev, [col]: Math.max(60, startW + e.clientX - startX) }));
        };
        const onUp = () => {
            resizingRef.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
    }, []);

    // ── Debounce búsqueda ───────────────────────────────────────────────────
    useEffect(() => {
        const t = window.setTimeout(() => setDebouncedSearch(searchTerm), SEARCH_DEBOUNCE);
        return () => clearTimeout(t);
    }, [searchTerm]);

    // ── Features de la capa activa ──────────────────────────────────────────
    const activeLayer   = vectorLayers?.[activeTab];
    const allFeatures   = useMemo(() =>
        Array.isArray(activeLayer?.data?.features) ? activeLayer!.data!.features : [],
        [activeLayer],
    );

    const extentFeatures = useMemo(() => {
        if (!filterByExtent || !mapBounds) return allFeatures as GeoJSON.Feature[];
        return (allFeatures as GeoJSON.Feature[]).filter(f => featureIntersectsBounds(f, mapBounds));
    }, [allFeatures, filterByExtent, mapBounds]);

    const columns = useMemo(() => {
        const keys = new Set<string>();
        allFeatures.forEach(f => {
            const feat = f as GeoJSON.Feature;
            if (feat?.properties) Object.keys(feat.properties).forEach(k => keys.add(k));
        });
        return Array.from(keys);
    }, [allFeatures]);

    // ── Pipeline con índice de feature preservado ───────────────────────────
    const baseEntries = useMemo<PipelineEntry[]>(
        () => extentFeatures.map((f, fi) => ({
            row: (f.properties as Record<string, unknown>) || {},
            fi,
        })),
        [extentFeatures],
    );

    const sqlEntries = useMemo<PipelineEntry[]>(() => {
        if (!sqlApplied.trim()) return baseEntries;
        const result = applySqlFilter(baseEntries, sqlApplied);
        return 'message' in result ? [] : result;
    }, [baseEntries, sqlApplied]);

    const processedEntries = useMemo<PipelineEntry[]>(() => {
        let entries = sqlEntries;
        if (debouncedSearch.trim()) {
            const term = debouncedSearch.toLowerCase();
            entries = entries.filter(({ row }) =>
                Object.values(row).some(v => String(v ?? '').toLowerCase().includes(term)),
            );
        }
        if (sortColumn) {
            entries = [...entries].sort((a, b) => {
                const va = String(a.row[sortColumn] ?? '');
                const vb = String(b.row[sortColumn] ?? '');
                const ord = va.localeCompare(vb, undefined, { numeric: true });
                return sortDirection === 'asc' ? ord : -ord;
            });
        }
        return entries;
    }, [sqlEntries, debouncedSearch, sortColumn, sortDirection]);

    const totalPages       = Math.max(1, Math.ceil(processedEntries.length / ROWS_PER_PAGE));
    const paginatedEntries = processedEntries.slice(
        (currentPage - 1) * ROWS_PER_PAGE,
        currentPage * ROWS_PER_PAGE,
    );

    // ── Selección + actualización de capa de resaltado ──────────────────────
    const handleRowClick = useCallback((fi: number, e: React.MouseEvent) => {
        setSelectedFiSet(prev => {
            const next = new Set(prev);
            if (e.shiftKey && lastClickedFi.current !== null) {
                const fiList = processedEntries.map(en => en.fi);
                const fromIdx = fiList.indexOf(lastClickedFi.current);
                const toIdx   = fiList.indexOf(fi);
                if (fromIdx !== -1 && toIdx !== -1) {
                    const lo = Math.min(fromIdx, toIdx);
                    const hi = Math.max(fromIdx, toIdx);
                    for (let i = lo; i <= hi; i++) next.add(fiList[i]);
                }
            } else if (e.ctrlKey || e.metaKey) {
                if (next.has(fi)) next.delete(fi); else next.add(fi);
            } else {
                if (next.size === 1 && next.has(fi)) next.clear();
                else { next.clear(); next.add(fi); }
            }
            lastClickedFi.current = fi;
            return next;
        });
    }, [processedEntries]);

    // Sincronizar capa de resaltado con la selección
    useEffect(() => {
        const hl = highlightLayerRef.current;
        if (!hl) return;
        hl.clearLayers();
        if (selectedFiSet.size === 0) return;
        selectedFiSet.forEach(fi => {
            const feature = extentFeatures[fi];
            if (feature) hl.addData(feature);
        });
    }, [selectedFiSet, extentFeatures]);

    const clearSelection = useCallback(() => {
        setSelectedFiSet(new Set());
        lastClickedFi.current = null;
    }, []);

    // ── Selección desde clic en el mapa ─────────────────────────────────────
    useEffect(() => {
        if (!mapSelectedFeature) return;
        const { layerId, feature } = mapSelectedFeature;

        // 1. Cambiar a la pestaña de la capa correspondiente (si está visible)
        if (visibleLayerIds.includes(layerId) && activeTab !== layerId) {
            handleTabChange(layerId); // limpia selección, SQL, búsqueda y sort
        }

        // 2. Buscar el índice de la feature en las features de esa capa
        const layerFeatures = vectorLayers?.[layerId]?.data?.features ?? [];
        const fi = (layerFeatures as GeoJSON.Feature[]).indexOf(feature as GeoJSON.Feature);

        if (fi !== -1) {
            setSelectedFiSet(new Set([fi]));
            lastClickedFi.current = fi;
            // Scroll a la página que contiene esa fila
            const page = Math.floor(fi / ROWS_PER_PAGE) + 1;
            setCurrentPage(page);
        }

        onMapFeatureConsumed?.();
    // handleTabChange y vectorLayers son estables o se actualizan antes de este efecto
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapSelectedFeature]);

    // ── Scroll al primer renglón seleccionado (tras selección desde mapa) ────
    useEffect(() => {
        if (selectedFiSet.size !== 1 || !tbodyRef.current) return;
        const [fi] = selectedFiSet;
        // Buscar el tr cuyo key coincide con el fi en la página actual
        const rows = tbodyRef.current.querySelectorAll('tr');
        const idx = paginatedEntries.findIndex(e => e.fi === fi);
        if (idx !== -1 && rows[idx]) {
            rows[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    // Solo cuando cambia selectedFiSet; paginatedEntries se deriva del mismo render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedFiSet]);

    // ── Zoom a seleccionados ────────────────────────────────────────────────
    const zoomToSelected = useCallback(() => {
        if (!mapInstance || selectedFiSet.size === 0) return;
        let combined: L.LatLngBounds | null = null;
        selectedFiSet.forEach(fi => {
            const fb = featureBounds(extentFeatures[fi]);
            if (!fb) return;
            combined = combined ? combined.extend(fb) : fb;
        });
        if (combined && (combined as L.LatLngBounds).isValid()) {
            mapInstance.fitBounds(combined as L.LatLngBounds, { padding: [30, 30], maxZoom: 16 });
        }
    }, [mapInstance, selectedFiSet, extentFeatures]);

    const handleRefresh = useCallback(() => {
        if (mapInstance) setMapBounds(mapInstance.getBounds());
    }, [mapInstance]);

    // ── SQL ─────────────────────────────────────────────────────────────────
    const applySQL = useCallback(() => {
        setSqlError('');
        const test = applySqlFilter(baseEntries, sqlInput);
        if ('message' in test) { setSqlError(test.message); }
        else { setSqlApplied(sqlInput); setCurrentPage(1); clearSelection(); }
    }, [sqlInput, baseEntries, clearSelection]);

    const clearSQL = useCallback(() => {
        setSqlInput(''); setSqlApplied(''); setSqlError(''); setCurrentPage(1);
    }, []);

    // ── Ordenamiento ────────────────────────────────────────────────────────
    const handleSort = useCallback((col: string) => {
        if (sortColRef.current === col) {
            const nd = sortDirRef.current === 'asc' ? 'desc' : 'asc';
            sortDirRef.current = nd; setSortDirection(nd);
        } else {
            sortColRef.current = col; sortDirRef.current = 'asc';
            setSortColumn(col); setSortDirection('asc'); setCurrentPage(1);
        }
    }, []);

    // ── Exportar CSV ────────────────────────────────────────────────────────
    const exportCSV = useCallback(() => {
        const header = columns.join(',');
        const csvRows = processedEntries.map(({ row }) =>
            columns.map(col => {
                const val = String(row[col] ?? '');
                return val.includes(',') || val.includes('"')
                    ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(','),
        );
        const blob = new Blob(
            ['\uFEFF' + [header, ...csvRows].join('\n')],
            { type: 'text/csv;charset=utf-8;' },
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(activeLayer?.name ?? activeTab ?? 'tabla').replace(/[/\\:*?"<>|]/g, '_')}_atributos.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [columns, processedEntries, activeLayer, activeTab]);

    // ── Estado derivado UI ──────────────────────────────────────────────────
    const hasSqlFilter   = !!sqlApplied.trim();
    const selCount       = selectedFiSet.size;
    const totalFeatures  = allFeatures.length;
    const extentFiltered = filterByExtent && extentFeatures.length !== totalFeatures;

    // ── Sin capas visibles ──────────────────────────────────────────────────
    if (visibleLayerIds.length === 0) {
        return (
            <div className="dat-overlay">
                <div className="dat-modal" style={{ opacity: tableOpacity / 100 }}>
                    <div className="dat-tabs">
                        <span style={{ padding: '0.6rem 1rem', color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem' }}>
                            Tabla de Atributos
                        </span>
                        <div style={{ flex: 1 }} />
                        <button className="dat-tab-close" onClick={handleClose}>✕</button>
                    </div>
                    <div className="attr-table-empty" style={{ margin: 'auto', padding: '2rem' }}>
                        <p>No hay capas vectoriales activas con datos cargados.</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>
                            Activa una capa vectorial en el panel de capas para ver sus atributos.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="dat-overlay">
            <div className="dat-modal" style={{ opacity: tableOpacity / 100 }}>

                {/* ══ PESTAÑAS ══════════════════════════════════════════════ */}
                <div className="dat-tabs" role="tablist">
                    {visibleLayerIds.map(id => (
                        <button
                            key={id}
                            role="tab"
                            aria-selected={activeTab === id}
                            className={`dat-tab${activeTab === id ? ' dat-tab--active' : ''}`}
                            onClick={() => handleTabChange(id)}
                            title={vectorLayers[id]?.name ?? id}
                        >
                            <TabIcon size={13} />
                            <span className="dat-tab-label">{vectorLayers[id]?.name ?? id}</span>
                        </button>
                    ))}
                    <div style={{ flex: 1 }} />
                    {/* ── Control de opacidad ── */}
                    <div className="attr-opacity-control attr-opacity-control--tabs" title={`Opacidad: ${tableOpacity}%`}>
                        <svg className="attr-opacity-icon" viewBox="0 0 16 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                            <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1v12A6 6 0 0 1 8 2z"/>
                        </svg>
                        <input
                            className="attr-opacity-slider"
                            type="range"
                            min={20}
                            max={100}
                            step={1}
                            value={tableOpacity}
                            onChange={e => setTableOpacity(Number(e.target.value))}
                            aria-label="Opacidad de la tabla"
                        />
                        <span className="attr-opacity-value">{tableOpacity}%</span>
                    </div>
                    <button className="dat-tab-close" onClick={handleClose} title="Cerrar tabla">✕</button>
                </div>

                {/* ══ BARRA DE HERRAMIENTAS ═══════════════════════════════ */}
                <div className="dat-toolbar">
                    <input
                        type="text"
                        className="dat-search"
                        placeholder="Buscar en tabla…"
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />

                    <button
                        className={`dat-tool-btn${filterByExtent ? ' dat-tool-btn--active' : ''}`}
                        onClick={() => setFilterByExtent(v => !v)}
                        title={filterByExtent
                            ? 'Mostrando solo entidades en la vista del mapa'
                            : 'Filtrar por extensión del mapa'}
                    >
                        <ExtentIcon />
                        <span>Filtrar por extensión</span>
                        {filterByExtent && <span className="dat-badge">{extentFeatures.length}</span>}
                    </button>

                    <button
                        className={`dat-tool-btn${selCount === 0 ? ' dat-tool-btn--disabled' : ''}`}
                        onClick={selCount > 0 ? zoomToSelected : undefined}
                        title={selCount > 0
                            ? `Zoom a ${selCount} entidad(es) seleccionada(s)`
                            : 'Selecciona entidades para hacer zoom'}
                        aria-disabled={selCount === 0}
                    >
                        <ZoomIcon /><span>Acercar</span>
                    </button>

                    <button
                        className={`dat-tool-btn${selCount === 0 ? ' dat-tool-btn--disabled' : ''}`}
                        onClick={selCount > 0 ? clearSelection : undefined}
                        title="Borrar selección"
                        aria-disabled={selCount === 0}
                    >
                        <ClearIcon /><span>Borrar selección</span>
                    </button>

                    <button
                        className={`dat-tool-btn${sqlOpen ? ' dat-tool-btn--active' : ''}${hasSqlFilter ? ' dat-tool-btn--filtered' : ''}`}
                        onClick={() => setSqlOpen(o => !o)}
                        title="Filtro SQL WHERE"
                    >
                        <SqlIcon /><span>SQL</span>
                    </button>

                    <button className="dat-tool-btn" onClick={handleRefresh} title="Actualizar extensión del mapa">
                        <RefreshIcon /><span>Actualizar</span>
                    </button>

                    <button className="dat-tool-btn" onClick={exportCSV} title="Exportar a CSV">
                        <CsvIcon /><span>CSV</span>
                    </button>
                </div>

                {/* ══ PANEL SQL ═════════════════════════════════════════════ */}
                {sqlOpen && (
                    <div className="attr-sql-panel">
                        <div className="attr-sql-label">
                            <code>WHERE</code>
                            <span className="attr-sql-hint">
                                Ej: <em>&quot;campo&quot; &gt; 100</em> &nbsp;|&nbsp;
                                <em>&quot;nombre&quot; LIKE &apos;%valor%&apos;</em> &nbsp;|&nbsp;
                                <em>campo IS NULL</em>
                            </span>
                        </div>
                        <div className="attr-sql-row">
                            <div className="attr-sql-fields">
                                <span className="attr-sql-fields-label">Campos:</span>
                                {columns.map(col => (
                                    <button
                                        key={col}
                                        className="attr-sql-chip"
                                        onClick={() => {
                                            const safe = /^[\w\u00C0-\u024F]+$/.test(col) ? col : `"${col}"`;
                                            setSqlInput(prev => prev ? `${prev} ${safe}` : safe);
                                        }}
                                        title={`Insertar campo "${col}"`}
                                    >{col}</button>
                                ))}
                            </div>
                        </div>
                        <div className="attr-sql-row">
                            <input
                                type="text"
                                className={`attr-sql-input${sqlError ? ' error' : ''}`}
                                placeholder="campo = 'valor' AND otro > 100 ..."
                                value={sqlInput}
                                onChange={e => { setSqlInput(e.target.value); setSqlError(''); }}
                                onKeyDown={e => e.key === 'Enter' && applySQL()}
                                spellCheck={false}
                            />
                            <button className="attr-btn attr-btn-apply" onClick={applySQL}>Aplicar</button>
                            {hasSqlFilter && (
                                <button className="attr-btn attr-btn-clear" onClick={clearSQL}>✕ Limpiar</button>
                            )}
                        </div>
                        {sqlError && (
                            <div className="attr-sql-error">
                                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
                                    <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                                    <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0zM7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 4.995z"/>
                                </svg>
                                {sqlError}
                            </div>
                        )}
                    </div>
                )}

                {/* ══ TABLA ════════════════════════════════════════════════ */}
                <div className="attr-table-body">
                    {allFeatures.length === 0 ? (
                        <div className="attr-table-empty">
                            <p>Esta capa no tiene datos cargados.</p>
                        </div>
                    ) : processedEntries.length === 0 ? (
                        <div className="attr-table-empty">
                            <p>Ningún registro coincide con los filtros aplicados.</p>
                            {hasSqlFilter && (
                                <button className="attr-btn attr-btn-clear" onClick={clearSQL} style={{ marginTop: 8 }}>
                                    ✕ Limpiar filtro SQL
                                </button>
                            )}
                        </div>
                    ) : (
                        <table className="attr-table">
                            <thead>
                                <tr>
                                    <th className="attr-th attr-th-num">#</th>
                                    {columns.map(col => (
                                        <th
                                            key={col}
                                            className={`attr-th attr-th-sortable${sortColumn === col ? ' sorted' : ''}`}
                                            style={{
                                                width: columnWidths[col] ? `${columnWidths[col]}px` : '150px',
                                                minWidth: '60px',
                                                position: 'relative',
                                            }}
                                        >
                                            <div
                                                className="attr-th-content"
                                                onClick={() => handleSort(col)}
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                                            >
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {col}
                                                </span>
                                                <span className="sort-icon">
                                                    {sortColumn === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                                                </span>
                                            </div>
                                            <div className="attr-resize-handle" onMouseDown={e => handleResizeStart(col, e)} />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody ref={tbodyRef}>
                                {paginatedEntries.map(({ row, fi }, pageIdx) => {
                                    const globalNum  = (currentPage - 1) * ROWS_PER_PAGE + pageIdx + 1;
                                    const isSelected = selectedFiSet.has(fi);
                                    return (
                                        <tr
                                            key={fi}
                                            className={`attr-tr dat-tr${isSelected ? ' dat-tr--selected' : ''}`}
                                            onClick={e => handleRowClick(fi, e)}
                                        >
                                            <td className="attr-td attr-td-num">{globalNum}</td>
                                            {columns.map(col => (
                                                <td key={col} className="attr-td" title={String(row[col] ?? '')}>
                                                    {row[col] === null || row[col] === undefined
                                                        ? <span className="attr-null">null</span>
                                                        : String(row[col])}
                                                </td>
                                            ))}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ══ PAGINACIÓN ════════════════════════════════════════════ */}
                {totalPages > 1 && (
                    <div className="attr-table-pagination">
                        <button className="attr-page-btn" onClick={() => setCurrentPage(1)}           disabled={currentPage === 1}>«</button>
                        <button className="attr-page-btn" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>‹</button>
                        <span className="attr-page-info">
                            {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, processedEntries.length)} de {processedEntries.length}
                        </span>
                        <button className="attr-page-btn" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>›</button>
                        <button className="attr-page-btn" onClick={() => setCurrentPage(totalPages)}  disabled={currentPage === totalPages}>»</button>
                    </div>
                )}

                {/* ══ BARRA DE ESTADO ══════════════════════════════════════ */}
                <div className="dat-statusbar">
                    <span className="dat-status-count">
                        {processedEntries.length}
                        {(hasSqlFilter || extentFiltered) && processedEntries.length !== totalFeatures && (
                            <span style={{ opacity: 0.65 }}> / {totalFeatures}</span>
                        )}{' '}entidades
                        {hasSqlFilter   && <span className="attr-sql-badge">SQL</span>}
                        {extentFiltered && <span className="dat-extent-badge">Extensión</span>}
                    </span>
                    {selCount > 0 && (
                        <span className="dat-status-selected">
                            {selCount} seleccionado{selCount > 1 ? 's' : ''}
                            <button className="dat-desel-btn" onClick={clearSelection} title="Borrar selección">✕</button>
                        </span>
                    )}
                    <span style={{ flex: 1 }} />
                    <span className="dat-status-hint">Shift+clic: rango · Ctrl+clic: múltiple</span>
                </div>

            </div>
        </div>
    );
});

DynamicAttributeTable.displayName = 'DynamicAttributeTable';
export default DynamicAttributeTable;

// ============================================================================
// ÍCONOS SVG
// ============================================================================

const TabIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
    </svg>
);
const ExtentIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2 2h2v2H2V2zm0 4h2v2H2V6zm0 4h2v2H2v-2zm4-8h2v2H6V2zm0 4h2v2H6V6zm0 4h2v2H6v-2zm4-8h2v2h-2V2zm0 4h2v2h-2V6zm0 4h2v2h-2v-2zM1 1v14h14V1H1zm1 1h12v12H2V2z"/>
    </svg>
);
const ZoomIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.099zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        <path d="M6.5 3a.5.5 0 0 1 .5.5V6h2.5a.5.5 0 0 1 0 1H7v2.5a.5.5 0 0 1-1 0V7H3.5a.5.5 0 0 1 0-1H6V3.5a.5.5 0 0 1 .5-.5z"/>
    </svg>
);
const ClearIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 1 0z"/>
    </svg>
);
const SqlIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
    </svg>
);
const RefreshIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path fillRule="evenodd" d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
        <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
    </svg>
);
const CsvIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
        <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
    </svg>
);