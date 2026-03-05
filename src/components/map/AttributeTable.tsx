import React, { useState, useMemo, useCallback, useRef, memo } from 'react';
import '../../styles/AttributeTable.css';

interface AttributeTableProps {
    layerName: string;
    features: GeoJSON.Feature[];
    onClose: () => void;
}

// ============================================================================
// PARSER SQL WHERE
// ============================================================================

interface SqlError { message: string }
type SqlResult = { rows: Record<string, unknown>[] } | SqlError;

function applySqlWhere(rows: Record<string, unknown>[], sql: string): SqlResult {
    const expr = sql.trim();
    if (!expr) return { rows };
    try {
        const filtered = rows.filter(row => evalExpr(expr, row));
        return { rows: filtered };
    } catch (e: unknown) {
        return { message: e instanceof Error ? e.message : 'Error en la expresión SQL' };
    }
}

function extractField(s: string): { field: string; rest: string } | null {
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
    if (!f) throw new Error(`No se reconoce el nombre de campo en: "${s.slice(0, 50)}"`);

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
        const op = cmpM[1];
        const rawVal = cmpM[2];

        const strM = rawVal.trim().match(/^'([^']*)'$/);
        if (strM) {
            const a = String(colVal ?? '').toLowerCase();
            const b = strM[1].toLowerCase();
            if (op === '=' || op === '==') return a === b;
            if (op === '!=' || op === '<>') return a !== b;
            const result = a.localeCompare(b);
            if (op === '<')  return result < 0;
            if (op === '<=') return result <= 0;
            if (op === '>')  return result > 0;
            if (op === '>=') return result >= 0;
        }

        const num = parseFloat(rawVal.trim());
        if (!isNaN(num)) {
            const a = parseFloat(String(colVal ?? '').replace(/,/g, ''));
            if (isNaN(a)) return false;
            if (op === '=' || op === '==') return a === num;
            if (op === '!=' || op === '<>') return a !== num;
            if (op === '<')  return a < num;
            if (op === '<=') return a <= num;
            if (op === '>')  return a > num;
            if (op === '>=') return a >= num;
        }

        throw new Error(`Valor no reconocido: "${rawVal.trim().slice(0, 30)}"`);
    }

    throw new Error(`Operador no reconocido en: "${r.slice(0, 40)}"`);
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
    let depth = 0;
    let inSingle = false;
    let inDouble = false;
    let start = 0;

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
            const after  = nextChar === undefined || /[\s(]/.test(nextChar);
            if (before && ahead.startsWith(kw) && after) {
                const chunk = expr.slice(start, i).trim();
                if (chunk) {
                    parts.push(chunk);
                    start = i + kw.length;
                    i = start - 1;
                }
            }
        }
    }

    const last = expr.slice(start).trim();
    if (last) parts.push(last);
    return parts.length > 1 ? parts : [expr];
}

// ============================================================================
// CONSTANTE GLOBAL (fuera del componente para evitar re-declaración)
// ============================================================================

const ROWS_PER_PAGE = 1000;

// ============================================================================
// COMPONENTE
// ============================================================================

const AttributeTable: React.FC<AttributeTableProps> = memo(({ layerName, features, onClose }) => {
    const [searchTerm,    setSearchTerm]    = useState('');
    const [sqlInput,      setSqlInput]      = useState('');
    const [sqlApplied,    setSqlApplied]    = useState('');
    const [sqlError,      setSqlError]      = useState('');
    const [sqlOpen,       setSqlOpen]       = useState(false);
    const [sortColumn,    setSortColumn]    = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [currentPage,   setCurrentPage]   = useState(1);

    const sortColumnRef    = useRef<string | null>(null);
    const sortDirectionRef = useRef<'asc' | 'desc'>('asc');

    const columns = useMemo(() => {
        if (!features.length) return [];
        const keys = new Set<string>();
        features.forEach(f => {
            if (f.properties) Object.keys(f.properties).forEach(k => keys.add(k));
        });
        return Array.from(keys);
    }, [features]);

    const processedRows = useMemo(() => {
        let rows = features.map(f => f.properties as Record<string, unknown> || {});

        if (sqlApplied.trim()) {
            const result = applySqlWhere(rows, sqlApplied);
            rows = 'message' in result ? [] : result.rows;
        }

        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            rows = rows.filter(row =>
                Object.values(row).some(val => String(val ?? '').toLowerCase().includes(term))
            );
        }

        if (sortColumn) {
            rows = [...rows].sort((a, b) => {
                const valA = String(a[sortColumn] ?? '');
                const valB = String(b[sortColumn] ?? '');
                const order = valA.localeCompare(valB, undefined, { numeric: true });
                return sortDirection === 'asc' ? order : -order;
            });
        }

        return rows;
    }, [features, sqlApplied, searchTerm, sortColumn, sortDirection]);

    const totalPages    = Math.max(1, Math.ceil(processedRows.length / ROWS_PER_PAGE));
    const paginatedRows = processedRows.slice(
        (currentPage - 1) * ROWS_PER_PAGE,
        currentPage * ROWS_PER_PAGE
    );

    const handleSort = (col: string) => {
        if (sortColumnRef.current === col) {
            const newDir = sortDirectionRef.current === 'asc' ? 'desc' : 'asc';
            sortDirectionRef.current = newDir;
            setSortDirection(newDir);
        } else {
            sortColumnRef.current    = col;
            sortDirectionRef.current = 'asc';
            setSortColumn(col);
            setSortDirection('asc');
            setCurrentPage(1);
        }
    };

    const applySQL = useCallback(() => {
        setSqlError('');
        const test = applySqlWhere(
            features.map(f => f.properties as Record<string, unknown> || {}),
            sqlInput
        );
        if ('message' in test) {
            setSqlError(test.message);
        } else {
            setSqlApplied(sqlInput);
            setCurrentPage(1);
        }
    }, [sqlInput, features]);

    const clearSQL = useCallback(() => {
        setSqlInput('');
        setSqlApplied('');
        setSqlError('');
        setCurrentPage(1);
    }, []);

    const exportCSV = useCallback(() => {
        const header = columns.join(',');
        const csvRows = processedRows.map(row =>
            columns.map(col => {
                const val = String(row[col] ?? '');
                return val.includes(',') || val.includes('"')
                    ? `"${val.replace(/"/g, '""')}"` : val;
            }).join(',')
        );
        const csv  = [header, ...csvRows].join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `${layerName}_atributos.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }, [columns, processedRows, layerName]);

    const hasSqlFilter  = !!sqlApplied.trim();
    const totalFeatures = features.length;

    return (
        <div className="attr-table-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="attr-table-modal">

                {/* ── Header ─────────────────────────────────────── */}
                <div className="attr-table-header">
                    <div className="attr-table-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
                        </svg>
                        <span>Tabla de Atributos — <strong>{layerName}</strong></span>
                        <span className="attr-table-count">
                            {processedRows.length}
                            {hasSqlFilter && processedRows.length !== totalFeatures && (
                                <span style={{ opacity: 0.7 }}> / {totalFeatures}</span>
                            )}{' '}registros
                            {hasSqlFilter && <span className="attr-sql-badge">SQL</span>}
                        </span>
                    </div>
                    <div className="attr-table-controls">
                        <input
                            type="text"
                            placeholder="Buscar..."
                            className="attr-table-search"
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                        <button
                            className={`attr-btn attr-btn-sql${sqlOpen ? ' active' : ''}${hasSqlFilter ? ' has-filter' : ''}`}
                            onClick={() => setSqlOpen(o => !o)}
                            title="Filtro SQL WHERE"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                            </svg>
                            Filtro SQL
                        </button>
                        <button className="attr-btn attr-btn-export" onClick={exportCSV} title="Exportar CSV">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                            </svg>
                            CSV
                        </button>
                        <button className="attr-btn attr-btn-close" onClick={onClose} title="Cerrar">✕</button>
                    </div>
                </div>

                {/* ── Panel SQL ───────────────────────────────────── */}
                {sqlOpen && (
                    <div className="attr-sql-panel">
                        <div className="attr-sql-label">
                            <code>WHERE</code>
                            <span className="attr-sql-hint">
                                Ej: <em>&quot;Población total&quot; &gt; 10000</em> &nbsp;|&nbsp;
                                <em>&quot;Nombre municipio&quot; LIKE &apos;%ciudad%&apos;</em> &nbsp;|&nbsp;
                                <em>clave IS NULL</em>
                                &nbsp;— Nombres con espacios van entre <em>&quot;comillas&quot;</em>
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
                                    >
                                        {col}
                                    </button>
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

                {/* ── Tabla ───────────────────────────────────────── */}
                <div className="attr-table-body">
                    {features.length === 0 ? (
                        <div className="attr-table-empty">
                            <p>Esta capa no tiene datos cargados. Actívala primero en el mapa.</p>
                        </div>
                    ) : processedRows.length === 0 ? (
                        <div className="attr-table-empty">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="#ccc" viewBox="0 0 16 16" style={{ marginBottom: 8 }}>
                                <path d="M6 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm-2-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z"/>
                            </svg>
                            <p>Ningún registro coincide con el filtro aplicado.</p>
                            {hasSqlFilter && (
                                <button className="attr-btn attr-btn-clear" onClick={clearSQL} style={{ marginTop: 8 }}>
                                    ✕ Limpiar filtro
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
                                            onClick={() => handleSort(col)}
                                        >
                                            {col}
                                            <span className="sort-icon">
                                                {sortColumn === col
                                                    ? (sortDirection === 'asc' ? ' ▲' : ' ▼')
                                                    : ' ⇅'}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, i) => (
                                    <tr key={i} className="attr-tr">
                                        <td className="attr-td attr-td-num">
                                            {(currentPage - 1) * ROWS_PER_PAGE + i + 1}
                                        </td>
                                        {columns.map(col => (
                                            <td key={col} className="attr-td" title={String(row[col] ?? '')}>
                                                {row[col] === null || row[col] === undefined
                                                    ? <span className="attr-null">null</span>
                                                    : String(row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* ── Paginación ──────────────────────────────────── */}
                {totalPages > 1 && (
                    <div className="attr-table-pagination">
                        <button className="attr-page-btn" onClick={() => setCurrentPage(1)}                disabled={currentPage === 1}>«</button>
                        <button className="attr-page-btn" onClick={() => setCurrentPage(p => p - 1)}       disabled={currentPage === 1}>‹</button>
                        <span className="attr-page-info">
                            {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, processedRows.length)} de {processedRows.length}
                        </span>
                        <button className="attr-page-btn" onClick={() => setCurrentPage(p => p + 1)}       disabled={currentPage === totalPages}>›</button>
                        <button className="attr-page-btn" onClick={() => setCurrentPage(totalPages)}        disabled={currentPage === totalPages}>»</button>
                    </div>
                )}

            </div>
        </div>
    );
});

AttributeTable.displayName = 'AttributeTable';
export default AttributeTable;