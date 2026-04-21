/**
 * @fileoverview Componente para gestionar capas geográficas desde la API
 * @module components/map/CapasManager
 */

import React, { useState, useEffect, useCallback } from 'react';
import { apiService, ItemResponse, ItemCreate, GrupoResponse } from '@services/api';
import { config, logger } from '@config/env';
import ConfirmModal from '@components/common/ConfirmModal';
import '@styles/CapasManager.css';

interface CapasManagerProps {
    onCapasChange?: () => void;
}

// ── Tipos para el estado de validación por capa ─────────────────────────────

type ValidationStatus = 'idle' | 'loading' | 'ok' | 'error';

interface ValidationResult {
    status: ValidationStatus;
    message?: string;
}

// ── Lógica de validación ─────────────────────────────────────────────────────

/**
 * Construye la URL de GetCapabilities para QGIS Server con el orden correcto:
 * primero SERVICE/VERSION/REQUEST y MAP al final, sin codificar la ruta del
 * proyecto (QGIS Server en Windows necesita C:/ruta/proyecto.qgz).
 *
 * Resultado:
 *   http://localhost/qgis/qgis_mapserv.fcgi.exe
 *     ?SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities
 *     &MAP=C:/mis_proyectos/02_Hidrometeorologicos.qgz
 */
function buildCapabilitiesUrl(
    serverUrl: string,
    service: 'WFS' | 'WMS',
    version: string,
    projectPath: string
): string {
    return `${serverUrl}?SERVICE=${service}&VERSION=${version}&REQUEST=GetCapabilities&MAP=${projectPath}`;
}

async function validateVectorLayer(
    wfsName: string,
    serverUrl: string,
    projectPath: string
): Promise<void> {
    const url = buildCapabilitiesUrl(serverUrl, 'WFS', '1.1.0', projectPath);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`El servidor WFS respondió con HTTP ${response.status}`);
        }

        const xml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const exceptionText = doc.querySelector('ExceptionText')?.textContent;
        if (exceptionText) throw new Error(`Error del servidor: ${exceptionText}`);

        const published = Array.from(doc.querySelectorAll('FeatureType > Name'))
            .map(n => n.textContent ?? '');
        const found = published.some(
            name => name === wfsName || name.endsWith(`:${wfsName}`)
        );

        if (!found) {
            const hint = published.length > 0
                ? `Capas disponibles: ${published.slice(0, 5).join(', ')}${published.length > 5 ? '…' : ''}`
                : 'El servidor no publicó ninguna capa WFS';
            throw new Error(`"${wfsName}" no está publicada en el WFS. ${hint}`);
        }
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError')
            throw new Error('Tiempo de espera agotado. Verifica la conectividad con el servidor.');
        throw err;
    }
}

async function validateWmsLayer(
    wmsLayer: string,
    serverUrl: string,
    projectPath: string
): Promise<void> {
    const url = buildCapabilitiesUrl(serverUrl, 'WMS', '1.3.0', projectPath);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`El servidor WMS respondió con HTTP ${response.status}`);
        }

        const xml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(xml, 'text/xml');

        const exceptionText = doc.querySelector('ExceptionText')?.textContent;
        if (exceptionText) throw new Error(`Error del servidor: ${exceptionText}`);

        const published = Array.from(doc.querySelectorAll('Layer > Name'))
            .map(n => n.textContent ?? '')
            .filter(Boolean);
        const found = published.some(name => name === wmsLayer);

        if (!found) {
            const hint = published.length > 0
                ? `Capas disponibles: ${published.slice(0, 5).join(', ')}${published.length > 5 ? '…' : ''}`
                : 'El servidor no publicó ninguna capa WMS';
            throw new Error(`"${wmsLayer}" no está publicada en el WMS. ${hint}`);
        }
    } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError')
            throw new Error('Tiempo de espera agotado. Verifica la conectividad con el servidor.');
        throw err;
    }
}

// ── Componente ───────────────────────────────────────────────────────────────

const CapasManager: React.FC<CapasManagerProps> = ({ onCapasChange }) => {
    const [capas, setCapas] = useState<ItemResponse[]>([]);
    const [grupos, setGrupos] = useState<GrupoResponse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isAddingNew, setIsAddingNew] = useState(false);
    const [newCapa, setNewCapa] = useState<ItemCreate>({
        name: '',
        description: '',
        group_id: 0,
        tipo: 'vector',
        wfsName: '',
        wmsLayer: '',
    });

    /** Mapa de resultados de validación, indexado por ID de capa */
    const [validations, setValidations] = useState<Map<number, ValidationResult>>(new Map());

    // Estado para el modal de confirmación
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        capaId: number | null;
        capaNombre: string;
    }>({
        isOpen: false,
        capaId: null,
        capaNombre: '',
    });

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [capasData, gruposData] = await Promise.all([
                apiService.getCapas(),
                apiService.getGrupos(),
            ]);
            setCapas(capasData);
            setGrupos(gruposData);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleCreateCapa = async () => {
        if (!newCapa.name.trim() || !newCapa.wfsName.trim() || !newCapa.wmsLayer.trim()) {
            alert('Nombre, wfsName y wmsLayer son requeridos');
            return;
        }
        if (!newCapa.group_id || newCapa.group_id === 0) {
            alert('Debes seleccionar un grupo');
            return;
        }
        try {
            await apiService.createCapa(newCapa);
            setNewCapa({ name: '', description: '', group_id: 0, tipo: 'vector', wfsName: '', wmsLayer: '' });
            setIsAddingNew(false);
            await loadData();
            onCapasChange?.();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    const handleDeleteCapa = async (id: number, name: string) => {
        // Abrir modal de confirmación
        setConfirmModal({
            isOpen: true,
            capaId: id,
            capaNombre: name,
        });
    };

    // Confirmar eliminación
    const confirmDeleteCapa = async () => {
        if (!confirmModal.capaId) return;

        try {
            await apiService.deleteCapa(confirmModal.capaId);
            setValidations(prev => { const next = new Map(prev); next.delete(confirmModal.capaId!); return next; });
            await loadData();
            onCapasChange?.();
        } catch (err: any) {
            alert(`Error: ${err.message}`);
        }
    };

    /**
     * Resuelve el servidor y la ruta del proyecto a partir del grupo de la capa.
     * Si el grupo tiene url_proyecto se usa esa ruta; si no, cae al proyecto
     * vectorial por defecto configurado en el .env.
     */
    const resolveProject = useCallback(
        (grupoNombre: string): { serverUrl: string; projectPath: string } => {
            const grupo = grupos.find(g => g.nombre === grupoNombre);
            const serverUrl = config.qgisServer.url;
            const projectPath = grupo?.url_proyecto ?? config.qgisServer.vectorProject;
            return { serverUrl, projectPath };
        },
        [grupos]
    );

    /**
     * Valida que la capa exista en el servidor QGIS usando el proyecto
     * asociado al grupo al que pertenece.
     * - Vector: verifica WFS GetCapabilities + WMS GetCapabilities
     * - Ráster: verifica WMS GetCapabilities
     */
    const handleValidateCapa = useCallback(async (capa: ItemResponse) => {
        setValidations(prev => new Map(prev).set(capa.id, { status: 'loading' }));

        try {
            // Resolver servidor y ruta del proyecto según el grupo de la capa
            const { serverUrl, projectPath } = resolveProject(capa.group);
            logger.debug(
                `Validando capa [${capa.id}] "${capa.name}" (${capa.type})`,
                `→ ${serverUrl}?...&MAP=${projectPath}`
            );

            if (capa.type === 'vector') {
                await validateVectorLayer(capa.wfsName, serverUrl, projectPath);
                await validateWmsLayer(capa.wmsLayer, serverUrl, projectPath);
            } else {
                await validateWmsLayer(capa.wmsLayer, serverUrl, projectPath);
            }

            setValidations(prev =>
                new Map(prev).set(capa.id, {
                    status: 'ok',
                    message: capa.type === 'vector'
                        ? `WFS "${capa.wfsName}" y WMS "${capa.wmsLayer}" están disponibles en el servidor`
                        : `WMS "${capa.wmsLayer}" está disponible en el servidor`,
                })
            );
        } catch (err: any) {
            logger.error(`Error validando capa "${capa.name}":`, err);
            setValidations(prev =>
                new Map(prev).set(capa.id, {
                    status: 'error',
                    message: err.message ?? 'Error desconocido al validar la capa',
                })
            );
        }
    }, [resolveProject]);

    if (loading) {
        return (
            <div className="capas-manager">
                <div className="loading-state">
                    <div className="spinner"></div>
                    <p>Cargando capas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="capas-manager">
            <div className="manager-header">
                <h3>🗺️ Capas Geográficas</h3>
                <button
                    className="btn btn-primary"
                    onClick={() => setIsAddingNew(!isAddingNew)}
                    disabled={grupos.length === 0}
                >
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

            <div className="capas-list">
                {capas.length === 0 ? (
                    <div className="empty-state">
                        <p>No hay capas registradas</p>
                        {grupos.length > 0 && (
                            <button className="btn btn-primary" onClick={() => setIsAddingNew(true)}>
                                Crear Primera Capa
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="capas-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Nombre</th>
                                    <th>Grupo</th>
                                    <th>Tipo</th>
                                    <th>WFS Name</th>
                                    <th>WMS Layer</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {capas.map(capa => {
                                    const v = validations.get(capa.id) ?? { status: 'idle' };
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
                                            <td><code>{capa.wmsLayer}</code></td>
                                            <td>
                                                <div className="acciones-cell">

                                                    {/* ── Botón Validar ── */}
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

                                                    {/* ── Chip de resultado ── */}
                                                    {(v.status === 'ok' || v.status === 'error') && (
                                                        <span
                                                            className={`validation-chip validation-chip--${v.status}`}
                                                            title={v.message}
                                                        >
                                                            {v.status === 'ok' ? 'OK' : 'Error'}
                                                        </span>
                                                    )}

                                                    {/* ── Botón Eliminar ── */}
                                                    <button
                                                        className="btn-delete-small"
                                                        onClick={() => handleDeleteCapa(capa.id, capa.name)}
                                                        title="Eliminar capa"
                                                    >
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

            {/* Modal de confirmación */}
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
        </div>
    );
};

export default CapasManager;