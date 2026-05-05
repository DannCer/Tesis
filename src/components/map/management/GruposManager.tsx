/**
 * @fileoverview Componente para gestionar grupos (proyectos QGIS) desde la API
 * @module components/map/GruposManager
 */

import React, { useState, useEffect } from 'react';
import { apiService, GrupoResponse, GrupoCreate } from '@services/api';
import { config } from '@config/env';
import { UPLOAD_TIMEOUT_MS } from '@config/constants';
import ConfirmModal from '@components/common/ConfirmModal';
import AlertModal from '@components/common/AlertModal';
import '@styles/GruposManager.css';

interface GruposManagerProps {
    onGruposChange?: () => void;
}

// ── Validación XML ────────────────────────────────────────────────────────────

type XmlValidStatus = 'idle' | 'loading' | 'ok' | 'error';
interface XmlValidResult {
    status: XmlValidStatus;
    title?: string;
    layerCount?: number;
    message?: string;
}

async function validateGroupXml(serverUrl: string, projectPath: string): Promise<Omit<XmlValidResult, 'status'>> {
    const url = `${serverUrl}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&MAP=${projectPath}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Servidor respondió HTTP ${response.status}`);
        const doc = new DOMParser().parseFromString(await response.text(), 'text/xml');
        const exceptionText = doc.querySelector('ExceptionText')?.textContent;
        if (exceptionText) throw new Error(`Error del servidor: ${exceptionText}`);
        const title =
            doc.querySelector('WMS_Capabilities > Service > Title')?.textContent ??
            doc.querySelector('Title')?.textContent ??
            'Sin título';
        const layers = Array.from(doc.querySelectorAll('Layer > Name')).length;
        return { title: title.trim(), layerCount: layers };
    } catch (err: unknown) {
        clearTimeout(timeoutId);
        if (err instanceof Error && err.name === 'AbortError') throw new Error('Tiempo de espera agotado (2 min). Verifica la conectividad con el servidor.');
        throw err;
    }
}

// ── Componente ────────────────────────────────────────────────────────────────

const GruposManager: React.FC<GruposManagerProps> = ({ onGruposChange }) => {
    const [grupos, setGrupos] = useState<GrupoResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Formulario nuevo grupo
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newGrupo, setNewGrupo] = useState<GrupoCreate>({ nombre: '', url_proyecto: '' });

    // Estado de edición
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<GrupoCreate>({ nombre: '', url_proyecto: '' });
    const [editSaving, setEditSaving] = useState(false);

    // Validaciones XML por grupo
    const [xmlValidations, setXmlValidations] = useState<Map<number, XmlValidResult>>(new Map());

    const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; grupoId: number | null; grupoNombre: string }>({
        isOpen: false, grupoId: null, grupoNombre: '',
    });
    const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; variant?: 'error' | 'warning' | 'success' | 'info' }>({
        isOpen: false, title: '', message: '', variant: 'error',
    });

    const showAlert = (title: string, message: string, variant: 'error' | 'warning' | 'success' | 'info' = 'error') => {
        setAlertModal({ isOpen: true, title, message, variant });
    };

    const loadGrupos = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await apiService.getGrupos();
            setGrupos(data.sort((a, b) => a.id - b.id));
        } catch (err: unknown) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadGrupos(); }, []);

    // ── Crear ─────────────────────────────────────────────────────────────────
    const handleCreateGrupo = async () => {
        if (!newGrupo.nombre.trim()) {
            showAlert('Campo requerido', 'El nombre del grupo es obligatorio.', 'warning');
            return;
        }
        try {
            await apiService.createGrupo(newGrupo);
            setNewGrupo({ nombre: '', url_proyecto: '' });
            setIsAddingNew(false);
            await loadGrupos();
            onGruposChange?.();
        } catch (err: unknown) {
            showAlert('Error al crear el grupo', err.message, 'error');
        }
    };

    // ── Editar ────────────────────────────────────────────────────────────────
    const startEdit = (grupo: GrupoResponse) => {
        setEditingId(grupo.id);
        setEditForm({ nombre: grupo.nombre, url_proyecto: grupo.url_proyecto ?? '' });
    };

    const cancelEdit = () => setEditingId(null);

    const handleSaveEdit = async () => {
        if (!editForm.nombre.trim()) {
            showAlert('Campo requerido', 'El nombre del grupo es obligatorio.', 'warning');
            return;
        }
        setEditSaving(true);
        try {
            await apiService.updateGrupo(editingId!, editForm);
            setEditingId(null);
            await loadGrupos();
            onGruposChange?.();
        } catch (err: unknown) {
            showAlert('Error al actualizar el grupo', err.message, 'error');
        } finally {
            setEditSaving(false);
        }
    };

    // ── Eliminar ──────────────────────────────────────────────────────────────
    const handleDeleteGrupo = (id: number, nombre: string) => {
        setConfirmModal({ isOpen: true, grupoId: id, grupoNombre: nombre });
    };

    const confirmDeleteGrupo = async () => {
        if (!confirmModal.grupoId) return;
        try {
            await apiService.deleteGrupo(confirmModal.grupoId);
            await loadGrupos();
            onGruposChange?.();
        } catch (err: unknown) {
            showAlert('Error al eliminar el grupo', err.message, 'error');
        }
    };

    // ── Validar XML ───────────────────────────────────────────────────────────
    const handleValidateXml = async (grupo: GrupoResponse) => {
        if (!grupo.url_proyecto) {
            showAlert('Sin ruta de proyecto', 'Este grupo no tiene una ruta de proyecto configurada.', 'warning');
            return;
        }
        setXmlValidations(prev => new Map(prev).set(grupo.id, { status: 'loading' }));
        try {
            const result = await validateGroupXml(config.qgisServer.url, grupo.url_proyecto);
            setXmlValidations(prev => new Map(prev).set(grupo.id, { status: 'ok', ...result }));
        } catch (err: unknown) {
            setXmlValidations(prev => new Map(prev).set(grupo.id, {
                status: 'error',
                message: err.message ?? 'Error desconocido al validar el proyecto',
            }));
        }
    };

    if (loading) {
        return (
            <div className="grupos-manager">
                <div className="loading-state"><div className="spinner"></div><p>Cargando grupos...</p></div>
            </div>
        );
    }

    return (
        <div className="grupos-manager">
            <div className="manager-header">
                <h3>📁 Grupos (Proyectos QGIS)</h3>
                <button className="btn btn-primary" onClick={() => setIsAddingNew(!isAddingNew)}>
                    {isAddingNew ? 'Cancelar' : '+ Nuevo Grupo'}
                </button>
            </div>

            {error && (
                <div className="error-banner">
                    <span className="error-icon">⚠️</span>
                    <span>{error}</span>
                    <button onClick={loadGrupos}>Reintentar</button>
                </div>
            )}

            {isAddingNew && (
                <div className="add-grupo-form">
                    <h4>Nuevo Grupo</h4>
                    <div className="form-row">
                        <div className="form-field">
                            <label>Nombre del Grupo <span className="required">*</span></label>
                            <input
                                type="text"
                                className="input"
                                value={newGrupo.nombre}
                                onChange={e => setNewGrupo({ ...newGrupo, nombre: e.target.value })}
                                placeholder="ej: Geológicos"
                            />
                        </div>
                        <div className="form-field">
                            <label>Ruta Proyecto QGIS</label>
                            <div className="input-with-file-selector">
                                <input
                                    type="text"
                                    className="input"
                                    value={newGrupo.url_proyecto || ''}
                                    onChange={e => setNewGrupo({ ...newGrupo, url_proyecto: e.target.value })}
                                    placeholder="C:/mis_proyectos/01_Geologicos.qgz"
                                />
                                <label className="btn btn-secondary btn-file-selector" style={{ color: 'white' }} title="Seleccionar archivo .qgz o .qgs">
                                    Explorar
                                    <input
                                        type="file"
                                        accept=".qgz,.qgs"
                                        style={{ display: 'none' }}
                                        onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const fileName = file.name;
                                                if (!newGrupo.url_proyecto) {
                                                    setNewGrupo({ ...newGrupo, url_proyecto: `C:/mis_proyectos/${fileName}` });
                                                } else {
                                                    const currentPath = newGrupo.url_proyecto;
                                                    const lastSlash = Math.max(currentPath.lastIndexOf('/'), currentPath.lastIndexOf('\\'));
                                                    const directory = lastSlash > -1 ? currentPath.substring(0, lastSlash + 1) : 'C:/mis_proyectos/';
                                                    setNewGrupo({ ...newGrupo, url_proyecto: directory + fileName });
                                                }
                                                e.target.value = '';
                                            }
                                        }}
                                    />
                                </label>
                            </div>
                            <small className="form-hint">
                                Escribe la ruta completa del servidor o usa "Explorar" para autocompletar el nombre del archivo
                            </small>
                        </div>
                    </div>
                    <div className="form-actions">
                        <button className="btn btn-primary" onClick={handleCreateGrupo}>Crear Grupo</button>
                        <button className="btn btn-secondary" onClick={() => setIsAddingNew(false)}>Cancelar</button>
                    </div>
                </div>
            )}

            <div className="grupos-list">
                {grupos.length === 0 ? (
                    <div className="empty-state">
                        <p>No hay grupos registrados</p>
                        <button className="btn btn-primary" onClick={() => setIsAddingNew(true)}>Crear Primer Grupo</button>
                    </div>
                ) : (
                    <div className="grupos-grid">
                        {grupos.map(grupo => {
                            const xmlVal = xmlValidations.get(grupo.id) ?? { status: 'idle' as XmlValidStatus };
                            const isEditing = editingId === grupo.id;

                            return (
                                <div key={grupo.id} className={`grupo-card${isEditing ? ' grupo-card--editing' : ''}`}>
                                    {isEditing ? (
                                        /* ── Modo edición ── */
                                        <div className="grupo-edit-form">
                                            <div className="form-field">
                                                <label>Nombre <span className="required">*</span></label>
                                                <input
                                                    type="text"
                                                    className="input"
                                                    value={editForm.nombre}
                                                    onChange={e => setEditForm({ ...editForm, nombre: e.target.value })}
                                                    autoFocus
                                                />
                                            </div>
                                            <div className="form-field">
                                                <label>Ruta Proyecto QGIS</label>
                                                <input
                                                    type="text"
                                                    className="input"
                                                    value={editForm.url_proyecto ?? ''}
                                                    onChange={e => setEditForm({ ...editForm, url_proyecto: e.target.value })}
                                                    placeholder="C:/mis_proyectos/..."
                                                />
                                            </div>
                                            <div className="form-actions form-actions--compact">
                                                <button
                                                    className="btn btn-primary btn--sm"
                                                    onClick={handleSaveEdit}
                                                    disabled={editSaving}
                                                >
                                                    {editSaving ? 'Guardando…' : '💾 Guardar'}
                                                </button>
                                                <button className="btn btn-secondary btn--sm" onClick={cancelEdit} disabled={editSaving}>
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ── Modo visualización ── */
                                        <>
                                            <div className="grupo-header">
                                                <div className="grupo-info"><h4>{grupo.nombre}</h4></div>
                                                <div className="grupo-actions">
                                                    <button
                                                        className={`btn-validate-xml btn-validate-xml--${xmlVal.status}`}
                                                        onClick={() => handleValidateXml(grupo)}
                                                        disabled={xmlVal.status === 'loading' || !grupo.url_proyecto}
                                                        title={
                                                            !grupo.url_proyecto
                                                                ? 'Sin ruta de proyecto configurada'
                                                                : xmlVal.status === 'idle'
                                                                    ? 'Validar GetCapabilities XML del proyecto'
                                                                    : xmlVal.status === 'loading'
                                                                        ? 'Validando…'
                                                                        : xmlVal.status === 'ok'
                                                                            ? `${xmlVal.layerCount} capa(s)`
                                                                            : xmlVal.message
                                                        }
                                                    >
                                                        {xmlVal.status === 'loading' && <span className="btn-validate__spinner" aria-hidden />}
                                                        {xmlVal.status === 'idle' && '🔎 XML'}
                                                        {xmlVal.status === 'ok' && '✅ XML'}
                                                        {xmlVal.status === 'error' && '❌ XML'}
                                                    </button>
                                                    <button className="btn-edit" onClick={() => startEdit(grupo)} title="Editar grupo">✏️</button>
                                                    <button className="btn-delete" onClick={() => handleDeleteGrupo(grupo.id, grupo.nombre)} title="Eliminar grupo">🗑️</button>
                                                </div>
                                            </div>

                                            {grupo.url_proyecto && (
                                                <div className="grupo-url">
                                                    <strong>Enlace a proyecto:</strong>
                                                    <a
                                                        href={`${config.qgisServer.url}?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&MAP=${grupo.url_proyecto}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{ display: 'block', wordBreak: 'break-all', fontSize: '0.85em' }}
                                                    >
                                                        Abrir GetCapabilities
                                                    </a>
                                                </div>
                                            )}

                                            {(xmlVal.status === 'ok' || xmlVal.status === 'error') && (
                                                <div className={`xml-validation-result xml-validation-result--${xmlVal.status}`}>
                                                    {xmlVal.status === 'ok' ? (
                                                        <>
                                                            <span className="xml-result-icon">✅</span>
                                                            <div>
                                                                <span className="xml-result-detail">{xmlVal.layerCount} capa(s) publicada(s)</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span className="xml-result-icon">❌</span>
                                                            <span>{xmlVal.message}</span>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                title="Eliminar Grupo"
                message={`¿Estás seguro de que deseas eliminar el grupo "${confirmModal.grupoNombre}"? Esta acción no se puede deshacer.`}
                confirmText="Eliminar"
                cancelText="Cancelar"
                confirmVariant="danger"
                icon="🗑️"
                onConfirm={confirmDeleteGrupo}
                onCancel={() => setConfirmModal({ isOpen: false, grupoId: null, grupoNombre: '' })}
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

export default GruposManager;