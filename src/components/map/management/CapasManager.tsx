/**
 * @fileoverview Componente para gestionar capas geográficas desde la API
 * @module components/map/CapasManager
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiService, ItemResponse, ItemCreate, GrupoResponse } from '@services/api';
import { config, logger } from '@config/env';
import ConfirmModal from '@components/common/ConfirmModal';
import AlertModal from '@components/common/AlertModal';
import '@styles/CapasManager.css';
import { CRUD_TIMEOUT_MS } from '@config/constants';

interface CapasManagerProps {
    onCapasChange?: () => void;
}

type ValidationStatus = 'idle' | 'loading' | 'ok' | 'error';
interface ValidationResult { status: ValidationStatus; message?: string; }

type SortField = 'id' | 'name' | 'group' | 'type' | 'wfsName' | 'wmsLayer';
type SortDir = 'asc' | 'desc';

// ── Validación WFS/WMS ────────────────────────────────────────────────────────

function buildCapabilitiesUrl(serverUrl: string, service: 'WFS' | 'WMS', version: string, projectPath: string): string {
    return `${serverUrl}?SERVICE=${service}&VERSION=${version}&REQUEST=GetCapabilities&MAP=${projectPath}`;
}

async function validateVectorLayer(wfsName: string, serverUrl: string, projectPath: string): Promise<void> {
    const url = buildCapabilitiesUrl(serverUrl, 'WFS', '1.1.0', projectPath);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CRUD_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`El servidor WFS respondió con HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/xml');
        const exceptionText = doc.querySelector('ExceptionText')?.textContent;
        if (exceptionText) throw new Error(`Error del servidor: ${exceptionText}`);
        const published = Array.from(doc.querySelectorAll('FeatureType > Name')).map(n => n.textContent ?? '');
        const found = published.some(name => name === wfsName || name.endsWith(`:${wfsName}`));
        if (!found) {
            const hint = published.length > 0
                ? `Capas disponibles: ${published.slice(0, 5).join(', ')}${published.length > 5 ? '…' : ''}`
                : 'El servidor no publicó ninguna capa WFS';
            throw new Error(`"${wfsName}" no está publicada en el WFS. ${hint}`);
        }
    } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') throw new Error('Tiempo de espera agotado. Verifica la conectividad con el servidor.');
        throw err;
    }
}

async function validateWmsLayer(wmsLayer: string, serverUrl: string, projectPath: string): Promise<void> {
    const url = buildCapabilitiesUrl(serverUrl, 'WMS', '1.3.0', projectPath);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CRUD_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`El servidor WMS respondió con HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/xml');
        const exceptionText = doc.querySelector('ExceptionText')?.textContent;
        if (exceptionText) throw new Error(`Error del servidor: ${exceptionText}`);
        const published = Array.from(doc.querySelectorAll('Layer > Name')).map(n => n.textContent ?? '').filter(Boolean);
        if (!published.some(name => name === wmsLayer)) {
            const hint = published.length > 0
                ? `Capas disponibles: ${published.slice(0, 5).join(', ')}${published.length > 5 ? '…' : ''}`
                : 'El servidor no publicó ninguna capa WMS';
            throw new Error(`"${wmsLayer}" no está publicada en el WMS. ${hint}`);
        }
    } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') throw new Error('Tiempo de espera agotado. Verifica la conectividad con el servidor.');
        throw err;
    }
}

// ── Componente ────────────────────────────────────────────────────────────────

const CapasManager: React.FC<CapasManagerProps> = ({ onCapasChange }) => {
    const [capas, setCapas] = useState<ItemResponse[]>([]);
    const [grupos, setGrupos] = useState<GrupoResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Nuevo
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newCapa, setNewCapa] = useState<ItemCreate>({
        name: '', description: '', group_id: 0, tipo: 'vector', wfsName: '', wmsLayer: '',
    });

    // Edición inline
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<ItemCreate>({
        name: '', description: '', group_id: 0, tipo: 'vector', wfsName: '', wmsLayer: '',
    });
    const [editSaving, setEditSaving] = useState(false);

    const [validations, setValidations] = useState<Map<number, ValidationResult>>(new Map());

    // Modales
    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; capaId: number | null; capaNombre: string }>({
        isOpen: false, capaId: null, capaNombre: '',
    });
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant?: 'error' | 'warning' | 'success' | 'info' }>({
        isOpen: false, title: '', message: '', variant: 'error',
    });

    // Búsqueda y orden
    const [search, setSearch] = useState('');
    const [sortField, setSortField] = useState<SortField>('id');
    const [sortDir, setSortDir] = useState<SortDir>('asc');

    const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'success' | 'info' = 'error') => {
        setAlertModal({ isOpen: true, title, message, variant });
    };

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [capasData, gruposData] = await Promise.all([apiService.getCapas(), apiService.getGrupos()]);
            setCapas(capasData);
            setGrupos(gruposData);
        } catch (err: unknown) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    // ── Filtrado + ordenado ───────────────────────────────────────────────────
    const capasFiltradas = useMemo(() => {
        const q = search.toLowerCase().trim();
        const filtered = q
            ? capas.filter(c =>
                c.id.toString().includes(q) ||
                c.name.toLowerCase().includes(q) ||
                c.group.toLowerCase().includes(q) ||
                c.type.toLowerCase().includes(q) ||
                c.wfsName.toLowerCase().includes(q) ||
                c.wmsLayer.toLowerCase().includes(q) ||
                (c.description ?? '').toLowerCase().includes(q)
            )
            : capas;

        return [...filtered].sort((a, b) => {
            let va: string | number = (a as any)[sortField] ?? '';
            let vb: string | number = (b as any)[sortField] ?? '';
            if (sortField === 'id') { va = Number(va); vb = Number(vb); }
            else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
            if (va < vb) return sortDir === 'asc' ? -1 : 1;
            if (va > vb) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
    }, [capas, search, sortField, sortDir]);

    const handleSort = (field: SortField) => {
        if (field === sortField) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        else { setSortField(field); setSortDir('asc'); }
    };

    const sortIcon = (field: SortField) => {
        if (field !== sortField) return <span className="sort-icon sort-icon--inactive">⇅</span>;
        return <span className="sort-icon sort-icon--active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
    };

    // ── Crear ─────────────────────────────────────────────────────────────────
    const handleCreateCapa = async () => {
        if (!newCapa.name.trim() || !newCapa.wfsName.trim() || !newCapa.wmsLayer.trim()) {
            showAlert('Campos requeridos', 'Nombre, WFS Name y WMS Layer son obligatorios.', 'warning');
            return;
        }
        if (!newCapa.group_id || newCapa.group_id === 0) {
            showAlert('Grupo requerido', 'Debes seleccionar un grupo antes de crear la capa.', 'warning');
            return;
        }
        try {
            await apiService.createCapa(newCapa);
            setNewCapa({ name: '', description: '', group_id: 0, tipo: 'vector', wfsName: '', wmsLayer: '' });
            setIsAddingNew(false);
            await loadData();
            onCapasChange?.();
        } catch (err: unknown) {
            showAlert('Error al crear la capa', err.message, 'error');
        }
    };

    // ── Editar ────────────────────────────────────────────────────────────────
    const startEdit = (capa: ItemResponse) => {
        const grupo = grupos.find(g => g.nombre === capa.group);
        setEditingId(capa.id);
        setEditForm({
            name: capa.name,
            description: capa.description ?? '',
            group_id: grupo?.id ?? 0,
            tipo: (capa.type as 'vector' | 'raster'),
            wfsName: capa.wfsName,
            wmsLayer: capa.wmsLayer,
        });
    };

    const cancelEdit = () => setEditingId(null);

    const handleSaveEdit = async () => {
        if (!editForm.name.trim() || !editForm.wfsName.trim() || !editForm.wmsLayer.trim()) {
            showAlert('Campos requeridos', 'Nombre, WFS Name y WMS Layer son obligatorios.', 'warning');
            return;
        }
        if (!editForm.group_id || editForm.group_id === 0) {
            showAlert('Grupo requerido', 'Debes seleccionar un grupo.', 'warning');
            return;
        }
        setEditSaving(true);
        try {
            await apiService.updateCapa(editingId!, editForm);
            setValidations(prev => { const next = new Map(prev); next.delete(editingId!); return next; });
            setEditingId(null);
            await loadData();
            onCapasChange?.();
        } catch (err: unknown) {
            showAlert('Error al actualizar la capa', err.message, 'error');
        } finally {
            setEditSaving(false);
        }
    };

    // ── Eliminar ──────────────────────────────────────────────────────────────
    const handleDeleteCapa = (id: number, name: string) => {
        setConfirmModal({ isOpen: true, capaId: id, capaNombre: name });
    };

    const confirmDeleteCapa = async () => {
        if (!confirmModal.capaId) return;
        try {
            await apiService.deleteCapa(confirmModal.capaId);
            setValidations(prev => { const next = new Map(prev); next.delete(confirmModal.capaId!); return next; });
            await loadData();
            onCapasChange?.();
        } catch (err: unknown) {
            showAlert('Error al eliminar la capa', err.message, 'error');
        }
    };

    const resolveProject = useCallback(
        (grupoNombre: string): { serverUrl: string; projectPath: string } => {
            const grupo = grupos.find(g => g.nombre === grupoNombre);
            return { serverUrl: config.qgisServer.url, projectPath: grupo?.url_proyecto ?? config.qgisServer.vectorProject };
        },
        [grupos]
    );

    const handleValidateCapa = useCallback(async (capa: ItemResponse) => {
        setValidations(prev => new Map(prev).set(capa.id, { status: 'loading' }));
        try {
            const { serverUrl, projectPath } = resolveProject(capa.group);
            logger.debug(`Validando capa [${capa.id}] "${capa.name}" (${capa.type})`, `→ ${serverUrl}?...&MAP=${projectPath}`);
            if (capa.type === 'vector') {
                await validateVectorLayer(capa.wfsName, serverUrl, projectPath);
                await validateWmsLayer(capa.wmsLayer, serverUrl, projectPath);
            } else {
                await validateWmsLayer(capa.wmsLayer, serverUrl, projectPath);
            }
            setValidations(prev => new Map(prev).set(capa.id, {
                status: 'ok',
                message: capa.type === 'vector'
                    ? `WFS "${capa.wfsName}" y WMS "${capa.wmsLayer}" están disponibles`
                    : `WMS "${capa.wmsLayer}" está disponible`,
            }));
        } catch (err: unknown) {
            logger.error(`Error validando capa "${capa.name}":`, err);
            setValidations(prev => new Map(prev).set(capa.id, {
                status: 'error', message: err.message ?? 'Error desconocido al validar la capa',
            }));
        }
    }, [resolveProject]);

    if (loading) {
        return (
            <div className="capas-manager">
                <div className="loading-state"><div className="spinner"></div><p>Cargando capas...</p></div>
            </div>
        );
    }

    return (
        <div className="capas-manager">
            <div className="manager-header">
                <h3>Capas Geográficas</h3>
                <button className="btn btn-primary" onClick={() => setIsAddingNew(!isAddingNew)} disabled={grupos.length === 0}>
                    {isAddingNew ? 'Cancelar' : '+ Nueva Capa'}
                </button>
            </div>

            {grupos.length === 0 && (
                <div className="warning-banner">
                    <span className="warning-icon">⚠️</span>
                    <span>Primero debes crear al menos un grupo en la pestaña "Grupos"</span>
                </div>
            )}

            {error && (
                <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <span>{error}</span>
                    <button onClick={loadData}>Reintentar</button>
                </div>
            )}

            {isAddingNew && (
                <div className="add-capa-form">
                    <h4>Nueva Capa</h4>
                    <div className="form-grid">
                        <div className="form-field">
                            <label>Nombre <span className="required">*</span></label>
                            <input type="text" className="input" value={newCapa.name}
                                onChange={e => setNewCapa({ ...newCapa, name: e.target.value })}
                                placeholder="ej: Volcanes Activos" />
                        </div>
                        <div className="form-field">
                            <label>Grupo <span className="required">*</span></label>
                            <select className="input" value={newCapa.group_id}
                                onChange={e => setNewCapa({ ...newCapa, group_id: parseInt(e.target.value) })}>
                                <option value={0}>Selecciona un grupo</option>
                                {grupos.map(grupo => (
                                    <option key={grupo.id} value={grupo.id}>{grupo.nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-field">
                            <label>Tipo</label>
                            <select className="input" value={newCapa.tipo}
                                onChange={e => setNewCapa({ ...newCapa, tipo: e.target.value as 'vector' | 'raster' })}>
                                <option value="vector">Vector</option>
                                <option value="raster">Ráster</option>
                            </select>
                        </div>
                        <div className="form-field full-width">
                            <label>Descripción</label>
                            <input type="text" className="input" value={newCapa.description || ''}
                                onChange={e => setNewCapa({ ...newCapa, description: e.target.value })}
                                placeholder="Breve descripción de la capa" />
                        </div>
                        <div className="form-field">
                            <label>WFS Name <span className="required">*</span></label>
                            <input type="text" className="input" value={newCapa.wfsName}
                                onChange={e => setNewCapa({ ...newCapa, wfsName: e.target.value })}
                                placeholder="ej: Volcanes_activos" />
                        </div>
                        <div className="form-field">
                            <label>WMS Layer <span className="required">*</span></label>
                            <input type="text" className="input" value={newCapa.wmsLayer}
                                onChange={e => setNewCapa({ ...newCapa, wmsLayer: e.target.value })}
                                placeholder="ej: Volcanes activos" />
                        </div>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={handleCreateCapa}>Crear Capa</button>
                        <button className="btn btn-secondary" onClick={() => setIsAddingNew(false)}>Cancelar</button>
                    </div>
                </div>
            )}

            {capas.length > 0 && (
                <div className="table-toolbar">
                    <div className="search-wrapper">
                        <span className="search-icon">🔎</span>
                        <input
                            type="text"
                            className="input search-input"
                            placeholder="Buscar por nombre, grupo, tipo, WFS, WMS…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button className="search-clear" onClick={() => setSearch('')} title="Limpiar búsqueda">✕</button>
                        )}
                    </div>
                    <span className="table-count">
                        {capasFiltradas.length} de {capas.length} capa{capas.length !== 1 ? 's' : ''}
                    </span>
                </div>
            )}

            <div className="capas-list">
                {capas.length === 0 ? (
                    <div className="empty-state">
                        <p>No hay capas registradas</p>
                        {grupos.length > 0 && (
                            <button className="btn btn-primary" onClick={() => setIsAddingNew(true)}>Crear Primera Capa</button>
                        )}
                    </div>
                ) : capasFiltradas.length === 0 ? (
                    <div className="empty-state">
                        <p>No se encontraron capas para <strong>"{search}"</strong></p>
                        <button className="btn btn-secondary" onClick={() => setSearch('')}>Limpiar búsqueda</button>
                    </div>
                ) : (
                    <div className="capas-table">
                        <table>
                            <thead>
                                <tr>
                                    <th className="th-sortable" onClick={() => handleSort('id')}>ID {sortIcon('id')}</th>
                                    <th className="th-sortable" onClick={() => handleSort('name')}>Nombre {sortIcon('name')}</th>
                                    <th className="th-sortable" onClick={() => handleSort('group')}>Grupo {sortIcon('group')}</th>
                                    <th className="th-sortable" onClick={() => handleSort('type')}>Tipo {sortIcon('type')}</th>
                                    <th className="th-sortable" onClick={() => handleSort('wfsName')}>WFS Name {sortIcon('wfsName')}</th>
                                    <th className="th-sortable" onClick={() => handleSort('wmsLayer')}>WMS Layer {sortIcon('wmsLayer')}</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {capasFiltradas.map(capa => {
                                    const v = validations.get(capa.id) ?? { status: 'idle' };
                                    const isEditing = editingId === capa.id;

                                    if (isEditing) {
                                        return (
                                            <tr key={capa.id} className="tr-editing">
                                                <td>{capa.id}</td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="input input--inline"
                                                        value={editForm.name}
                                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                        placeholder="Nombre"
                                                        autoFocus
                                                    />
                                                    <input
                                                        type="text"
                                                        className="input input--inline input--desc"
                                                        value={editForm.description ?? ''}
                                                        onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                        placeholder="Descripción (opcional)"
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className="input input--inline"
                                                        value={editForm.group_id}
                                                        onChange={e => setEditForm({ ...editForm, group_id: parseInt(e.target.value) })}
                                                    >
                                                        <option value={0}>Seleccionar…</option>
                                                        {grupos.map(g => (
                                                            <option key={g.id} value={g.id}>{g.nombre}</option>
                                                        ))}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        className="input input--inline"
                                                        value={editForm.tipo}
                                                        onChange={e => setEditForm({ ...editForm, tipo: e.target.value as 'vector' | 'raster' })}
                                                    >
                                                        <option value="vector">vector</option>
                                                        <option value="raster">raster</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="input input--inline"
                                                        value={editForm.wfsName}
                                                        onChange={e => setEditForm({ ...editForm, wfsName: e.target.value })}
                                                        placeholder="WFS Name"
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        type="text"
                                                        className="input input--inline"
                                                        value={editForm.wmsLayer}
                                                        onChange={e => setEditForm({ ...editForm, wmsLayer: e.target.value })}
                                                        placeholder="WMS Layer"
                                                    />
                                                </td>
                                                <td>
                                                    <div className="acciones-cell">
                                                        <button
                                                            className="btn-save-small"
                                                            onClick={handleSaveEdit}
                                                            disabled={editSaving}
                                                            title="Guardar cambios"
                                                        >
                                                            {editSaving ? '…' : '💾'}
                                                        </button>
                                                        <button
                                                            className="btn-cancel-small"
                                                            onClick={cancelEdit}
                                                            disabled={editSaving}
                                                            title="Cancelar edición"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    return (
                                        <tr key={capa.id}>
                                            <td>{capa.id}</td>
                                            <td>
                                                <div className="capa-name">
                                                    <strong>{capa.name}</strong>
                                                    {capa.description && <small>{capa.description}</small>}
                                                </div>
                                            </td>
                                            <td><span className="badge badge-group">{capa.group}</span></td>
                                            <td><span className={`badge badge-${capa.type}`}>{capa.type}</span></td>
                                            <td><code>{capa.wfsName}</code></td>
                                            <td>
                                                <code>{capa.wmsLayer}</code>
                                            </td>
                                            <td>
                                                <div className="acciones-cell">
                                                    <button
                                                        className={`btn-validate-small btn-validate--${v.status}`}
                                                        onClick={() => handleValidateCapa(capa)}
                                                        disabled={v.status === 'loading'}
                                                        title={
                                                            v.status === 'idle'    ? 'Validar disponibilidad en el servidor' :
                                                            v.status === 'loading' ? 'Validando…' :
                                                            v.message ?? ''
                                                        }
                                                        aria-label={`Validar capa ${capa.name}`}
                                                    >
                                                        {v.status === 'loading' && <span className="btn-validate__spinner" aria-hidden />}
                                                        {v.status === 'idle'    && '🔍'}
                                                        {v.status === 'ok'      && '✅'}
                                                        {v.status === 'error'   && '❌'}
                                                    </button>
                                                    {(v.status === 'ok' || v.status === 'error') && (
                                                        <span className={`validation-chip validation-chip--${v.status}`} title={v.message}>
                                                            {v.status === 'ok' ? 'OK' : 'Error'}
                                                        </span>
                                                    )}
                                                    <button
                                                        className="btn-edit-small"
                                                        onClick={() => startEdit(capa)}
                                                        title="Editar capa"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button className="btn-delete-small" onClick={() => handleDeleteCapa(capa.id, capa.name)} title="Eliminar capa">
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Eliminar Capa"
                message={`¿Estás seguro de que deseas eliminar la capa "${confirmModal.capaNombre}"? Esta acción no se puede deshacer y la capa ya no estará disponible en el geovisor.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                confirmVariant="danger"
                icon="🗑️"
                onConfirm={confirmDeleteCapa}
                onCancel={() => setConfirmModal({ isOpen: false, capaId: null, capaNombre: '' })}
            />

            <AlertModal
                isOpen={alertModal.isOpen}
                title={alertModal.title}
                message={alertModal.message}
                variant={alertModal.variant}
                onClose={() => setAlertModal(prev => ({ ...prev, isOpen: false }))}
            />
        </div>
    );
};

export default CapasManager;