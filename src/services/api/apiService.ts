/**
 * @fileoverview Servicio HTTP centralizado para la API REST (FastAPI).
 *
 * Optimizaciones:
 *  - `API_BASE_URL` ahora se lee de `config.apiUrl` (centralizado en env.ts)
 *    en vez de acceder a `import.meta.env.VITE_API_URL` directamente.
 *    Esto garantiza que el único punto de acceso a variables de entorno
 *    sea `src/config/env.ts`.
 *  - Se mantiene `export const API_BASE_URL` para compatibilidad con cualquier
 *    módulo que ya lo importe directamente.
 *  - Tipado mejorado en `request<T>`: `error: unknown` en lugar de `any`.
 *
 * @module services/api/apiService
 */

import { config, logger } from '@config/env';
import type {
    GrupoResponse, GrupoCreate,
    SubgrupoResponse, SubgrupoCreate,
    ItemResponse, ItemCreate,
} from '@types/api';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';
import type { CurrentUser, TokenResponse } from '@contexts/AuthContext';

// ============================================================================
// URL BASE — configurada desde VITE_API_URL en los archivos .env
// ============================================================================

/** URL base de la API REST. Proviene de config.apiUrl → VITE_API_URL en .env */
export const API_BASE_URL = config.apiUrl;
export const API_V1       = `${API_BASE_URL}/api/v1`;

// ============================================================================
// REQUEST HELPER
// ============================================================================

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_V1}${endpoint}`;
    try {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string>),
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        logger.debug('API Request:', url);
        const response = await fetch(url, { ...options, headers });

        if (!response.ok) {
            const err = await response.json().catch(() => ({})) as { detail?: string };
            throw new Error(err.detail ?? `HTTP ${response.status}: ${response.statusText}`);
        }

        if (response.status === 204) return null as T;

        const data = await response.json() as T;
        logger.debug('API Response:', data);
        return data;
    } catch (error: unknown) {
        logger.error('API Error:', error);
        throw error;
    }
}

// ============================================================================
// API SERVICE
// ============================================================================

export const apiService = {

    // ── AUTH  —  /api/v1/auth/* ────────────────────────────────────────────
    auth: {
        /** Login: devuelve access_token y refresh_token */
        login: (username: string, password: string): Promise<TokenResponse> =>
            request('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ username, password }),
            }),

        /** Devuelve el usuario autenticado a partir del token en localStorage */
        me: (): Promise<CurrentUser> =>
            request('/auth/me'),

        /** Invalida la sesión en el servidor */
        logout: (): Promise<void> =>
            request('/auth/logout', { method: 'POST' }),

        /** Renueva el access_token usando el refresh_token */
        refresh: (refreshToken: string): Promise<Pick<TokenResponse, 'access_token'>> =>
            request('/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refresh_token: refreshToken }),
            }),
    },

    // ── ADMIN  —  /api/v1/admin/* ──────────────────────────────────────────
    admin: {
        getUsuarios:   <T = unknown>(): Promise<T[]> =>
            request('/admin/usuarios'),

        createUsuario: <TBody, TRes = unknown>(body: TBody): Promise<TRes> =>
            request('/admin/usuarios', { method: 'POST', body: JSON.stringify(body) }),

        deleteUsuario: (id: number): Promise<void> =>
            request(`/admin/usuarios/${id}`, { method: 'DELETE' }),
    },

    // ── GESTIÓN DE CAPAS  —  /api/v1/gestion/* ────────────────────────────
    getGrupos: (): Promise<GrupoResponse[]> =>
        request('/gestion/grupos'),

    createGrupo: (g: GrupoCreate): Promise<GrupoResponse> =>
        request('/gestion/grupos', { method: 'POST', body: JSON.stringify(g) }),

    updateGrupo: (id: number, g: GrupoCreate): Promise<GrupoResponse> =>
        request(`/gestion/grupos/${id}`, { method: 'PUT', body: JSON.stringify(g) }),

    deleteGrupo: (id: number): Promise<void> =>
        request(`/gestion/grupos/${id}`, { method: 'DELETE' }),

    // ── SUBGRUPOS  —  /api/v1/gestion/subgrupos ───────────────────────────
    getSubgrupos: (): Promise<SubgrupoResponse[]> =>
        request('/gestion/subgrupos'),

    getSubgruposPorGrupo: (grupoId: number): Promise<SubgrupoResponse[]> =>
        request(`/gestion/grupos/${grupoId}/subgrupos`),

    createSubgrupo: (s: SubgrupoCreate): Promise<SubgrupoResponse> =>
        request('/gestion/subgrupos', { method: 'POST', body: JSON.stringify(s) }),

    updateSubgrupo: (id: number, s: SubgrupoCreate): Promise<SubgrupoResponse> =>
        request(`/gestion/subgrupos/${id}`, { method: 'PUT', body: JSON.stringify(s) }),

    deleteSubgrupo: (id: number): Promise<void> =>
        request(`/gestion/subgrupos/${id}`, { method: 'DELETE' }),

    getCapas: (): Promise<ItemResponse[]> =>
        request('/gestion/'),

    createCapa: (c: ItemCreate): Promise<ItemResponse> =>
        request('/gestion/', { method: 'POST', body: JSON.stringify(c) }),

    updateCapa: (id: number, c: ItemCreate): Promise<ItemResponse> =>
        request(`/gestion/${id}`, { method: 'PUT', body: JSON.stringify(c) }),

    deleteCapa: (id: number): Promise<void> =>
        request(`/gestion/${id}`, { method: 'DELETE' }),

    healthCheck: (): Promise<unknown> =>
        request('/health'),

    // ── CONVERTERS ────────────────────────────────────────────────────────
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