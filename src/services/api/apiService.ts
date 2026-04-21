import { logger } from '@config/env';
import type {
    GrupoResponse, GrupoCreate,
    ItemResponse, ItemCreate,
} from '@types/api';
import type { VectorLayerDef, RasterLayerDef } from '@types/geo';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const API_V1 = `${API_BASE_URL}/api/v1`;

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_V1}${endpoint}`;
    try {
        // Agregar token JWT si existe
        const token = localStorage.getItem('access_token');
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        logger.debug('API Request:', url);
        const response = await fetch(url, {
            ...options,
            headers,
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

export const apiService = {
    getGrupos: (): Promise<GrupoResponse[]> =>
        request('/gestion/grupos'),

    createGrupo: (g: GrupoCreate): Promise<GrupoResponse> =>
        request('/gestion/grupos', { method: 'POST', body: JSON.stringify(g) }),

    deleteGrupo: (id: number): Promise<void> =>
        request(`/gestion/grupos/${id}`, { method: 'DELETE' }),

    getCapas: (): Promise<ItemResponse[]> =>
        request('/gestion/'),

    createCapa: (c: ItemCreate): Promise<ItemResponse> =>
        request('/gestion/', { method: 'POST', body: JSON.stringify(c) }),

    deleteCapa: (id: number): Promise<void> =>
        request(`/gestion/${id}`, { method: 'DELETE' }),

    healthCheck: (): Promise<unknown> =>
        request('/health'),

    convertItemToVectorLayer: (item: ItemResponse): VectorLayerDef => (
        {
            id: `layer_${item.id}`,
            name: item.name,
            description: item.description ?? '',
            group: item.group,
            type: 'vector',
            wfsName: item.wfsName,
            wmsLayer: item.wmsLayer,
        }
    ),

    convertItemToRasterLayer: (item: ItemResponse): RasterLayerDef => (
        {
            id: `layer_${item.id}`,
            name: item.name,
            description: item.description ?? '',
            group: item.group,
            type: 'raster',
            wmsLayer: item.wmsLayer,
        }
    ),
};