import React, { useState, useMemo, memo } from 'react';
import '../../styles/AttributeTable.css';

interface AttributeTableProps {
    layerName: string;
    features: GeoJSON.Feature[];
    onClose: () => void;
}

const AttributeTable: React.FC<AttributeTableProps> = memo(({ layerName, features, onClose }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const rowsPerPage = 10;

    // Obtener columnas dinámicamente (excluir geometry)
    const columns = useMemo(() => {
        if (!features.length) return [];
        const allKeys = new Set<string>();
        features.forEach(f => {
            if (f.properties) {
                Object.keys(f.properties).forEach(k => allKeys.add(k));
            }
        });
        return Array.from(allKeys);
    }, [features]);

    // Filtrar y ordenar
    const processedRows = useMemo(() => {
        let rows = features.map(f => f.properties || {});

        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            rows = rows.filter(row =>
                Object.values(row).some(val =>
                    String(val ?? '').toLowerCase().includes(term)
                )
            );
        }

        if (sortColumn) {
            rows = [...rows].sort((a, b) => {
                const valA = a[sortColumn] ?? '';
                const valB = b[sortColumn] ?? '';
                const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true });
                return sortDirection === 'asc' ? cmp : -cmp;
            });
        }

        return rows;
    }, [features, searchTerm, sortColumn, sortDirection]);

    const totalPages = Math.ceil(processedRows.length / rowsPerPage);
    const paginatedRows = processedRows.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

    const handleSort = (col: string) => {
        if (sortColumn === col) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDirection('asc');
        }
        setCurrentPage(1);
    };

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    const exportCSV = () => {
        const header = columns.join(',');
        const rows = processedRows.map(row =>
            columns.map(col => {
                const val = String(row[col] ?? '');
                return val.includes(',') ? `"${val}"` : val;
            }).join(',')
        );
        const csv = [header, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${layerName}_atributos.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="attr-table-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="attr-table-modal">
                {/* Header */}
                <div className="attr-table-header">
                    <div className="attr-table-title">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
                            <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
                        </svg>
                        <span>Tabla de Atributos — <strong>{layerName}</strong></span>
                        <span className="attr-table-count">{processedRows.length} registros</span>
                    </div>
                    <div className="attr-table-controls">
                        <input
                            type="text"
                            placeholder="Buscar en tabla..."
                            className="attr-table-search"
                            value={searchTerm}
                            onChange={handleSearch}
                        />
                        <button className="attr-btn attr-btn-export" onClick={exportCSV} title="Exportar CSV">
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
                                <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
                            </svg>
                            CSV
                        </button>
                        <button className="attr-btn attr-btn-close" onClick={onClose} title="Cerrar">✕</button>
                    </div>
                </div>

                {/* Tabla */}
                <div className="attr-table-body">
                    {features.length === 0 ? (
                        <div className="attr-table-empty">
                            <p>Esta capa no tiene datos cargados. Actívala primero en el mapa.</p>
                        </div>
                    ) : columns.length === 0 ? (
                        <div className="attr-table-empty"><p>No se encontraron atributos.</p></div>
                    ) : (
                        <table className="attr-table">
                            <thead>
                                <tr>
                                    <th className="attr-th attr-th-num">#</th>
                                    {columns.map(col => (
                                        <th
                                            key={col}
                                            className={`attr-th attr-th-sortable ${sortColumn === col ? 'sorted' : ''}`}
                                            onClick={() => handleSort(col)}
                                        >
                                            {col}
                                            <span className="sort-icon">
                                                {sortColumn === col ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedRows.map((row, i) => (
                                    <tr key={i} className="attr-tr">
                                        <td className="attr-td attr-td-num">{(currentPage - 1) * rowsPerPage + i + 1}</td>
                                        {columns.map(col => (
                                            <td key={col} className="attr-td" title={String(row[col] ?? '')}>
                                                {row[col] === null || row[col] === undefined ? (
                                                    <span className="attr-null">null</span>
                                                ) : String(row[col])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Paginación */}
                {totalPages > 1 && (
                    <div className="attr-table-pagination">
                        <button
                            className="attr-page-btn"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                        >«</button>
                        <button
                            className="attr-page-btn"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                        >‹</button>
                        <span className="attr-page-info">
                            Página {currentPage} de {totalPages}
                        </span>
                        <button
                            className="attr-page-btn"
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages}
                        >›</button>
                        <button
                            className="attr-page-btn"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages}
                        >»</button>
                    </div>
                )}
            </div>
        </div>
    );
});

AttributeTable.displayName = 'AttributeTable';
export default AttributeTable;
