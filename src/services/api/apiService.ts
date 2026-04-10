/**
 * @fileoverview Servicio HTTP para el backend FastAPI.
 * Capa de comunicación con /api/v1 — sin estado, solo Promises.
 * @module services/api/apiService
 */

import { logger } from '@config/env';
import type {
    GrupoResponse, GrupoCreate,
    ItemResponse, ItemCreate,
} from '@types/api';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const API_V1       = `${API_BASE_URL}/api/v1`;

// ============================================================================
// CLIENTE HTTP GENÉRICO
// ============================================================================

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_V1}${endpoint}`;
    try {
        logger.debug('API Request:', url);
        const response = await fetch(url, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...options.headers },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail ?? `HTTP ${response.status}: ${response.statusText}`);
        }

        if (response.status === 204) return null as T;

        const data = await response.json();
        logger.debug('API Response:', data);
        return data;
    } catch (error: any) {
        logger.error('API Error:', error);
        throw error;
    }
}

// ============================================================================
// API SERVICE — funciones exportadas directamente (no class)
// ============================================================================

export const apiService = {

    // ── Grupos ──────────────────────────────────────────────────────────────

    getGrupos: ():                    Promise<GrupoResponse[]> =>
        request('/gestion/grupos'),

    createGrupo: (g: GrupoCreate):    Promise<GrupoResponse> =>
        request('/gestion/grupos', { method: 'POST', body: JSON.stringify(g) }),

    deleteGrupo: (id: number):        Promise<void> =>
        request(`/gestion/grupos/${id}`, { method: 'DELETE' }),

    // ── Capas ───────────────────────────────────────────────────────────────

    getCapas: ():                     Promise<ItemResponse[]> =>
        request('/gestion/'),

    createCapa: (c: ItemCreate):      Promise<ItemResponse> =>
        request('/gestion/', { method: 'POST', body: JSON.stringify(c) }),

    deleteCapa: (id: number):         Promise<void> =>
        request(`/gestion/${id}`, { method: 'DELETE' }),

    // ── Health ──────────────────────────────────────────────────────────────

    healthCheck: ():                  Promise<unknown> =>
        request('/health'),

    // ── Conversores ─────────────────────────────────────────────────────────

    convertItemToVectorLayer: (item: ItemResponse): VectorLayerDef => ({
        id:          `layer_${item.id}`,
        name:        item.name,
        description: item.description ?? '',
        group:       item.group,
        type:        'vector',
        wfsName:     item.wfsName,
        wmsLayer:    item.wmsLayer,
    }),

    convertItemToRasterLayer: (item: ItemResponse): RasterLayerDef => ({
        id:          `layer_${item.id}`,
        name:        item.name,
        description: item.description ?? '',
        group:       item.group,
        type:        'raster',
        wmsLayer:    item.wmsLayer,
    }),
};
