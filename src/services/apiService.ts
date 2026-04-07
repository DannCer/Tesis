/**
 * @fileoverview Servicio para conectarse a la API del backend
 * @module services/apiService
 */

import { logger } from '../config/env';

// ============================================================================
// TIPOS
// ============================================================================

export interface GrupoResponse {
    id: number;
    nombre: string;
    url_proyecto: string | null;
}

export interface GrupoCreate {
    nombre: string;
    url_proyecto?: string | null;
}

export interface ItemResponse {
    id: number;
    name: string;
    description: string | null;
    group: string;
    type: 'vector' | 'raster';
    wfsName: string;
    wmsLayer: string;
}

export interface ItemCreate {
    name: string;
    description?: string | null;
    group_id: number;
    tipo?: 'vector' | 'raster';
    wfsName: string;
    wmsLayer: string;
}

// ============================================================================
// CONFIGURACIÓN
// ============================================================================

const API_BASE_URL = 'http://localhost:8000';
const API_V1 = `${API_BASE_URL}/api/v1`;

// ============================================================================
// SERVICIO API
// ============================================================================

class ApiService {
    private baseUrl: string;

    constructor(baseUrl: string = API_V1) {
        this.baseUrl = baseUrl;
    }

    /**
     * Método genérico para hacer peticiones HTTP
     */
    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;
        
        try {
            logger.debug('API Request:', url, options);
            
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(
                    error.detail || `HTTP ${response.status}: ${response.statusText}`
                );
            }

            // 204 No Content no tiene body
            if (response.status === 204) {
                return null as T;
            }

            const data = await response.json();
            logger.debug('API Response:', data);
            return data;

        } catch (error: any) {
            logger.error('API Error:', error);
            throw error;
        }
    }

    // ========================================================================
    // GRUPOS (PROYECTOS)
    // ========================================================================

    /**
     * Obtener todos los grupos
     */
    async getGrupos(): Promise<GrupoResponse[]> {
        return this.request<GrupoResponse[]>('/gestion/grupos');
    }

    /**
     * Crear un nuevo grupo
     */
    async createGrupo(grupo: GrupoCreate): Promise<GrupoResponse> {
        return this.request<GrupoResponse>('/gestion/grupos', {
            method: 'POST',
            body: JSON.stringify(grupo),
        });
    }

    /**
     * Eliminar un grupo (borrado lógico)
     */
    async deleteGrupo(grupoId: number): Promise<void> {
        return this.request<void>(`/gestion/grupos/${grupoId}`, {
            method: 'DELETE',
        });
    }

    // ========================================================================
    // CAPAS (ITEMS)
    // ========================================================================

    /**
     * Obtener todas las capas publicadas
     */
    async getCapas(): Promise<ItemResponse[]> {
        return this.request<ItemResponse[]>('/gestion/');
    }

    /**
     * Crear una nueva capa
     */
    async createCapa(capa: ItemCreate): Promise<ItemResponse> {
        return this.request<ItemResponse>('/gestion/', {
            method: 'POST',
            body: JSON.stringify(capa),
        });
    }

    /**
     * Eliminar una capa (borrado lógico)
     */
    async deleteCapa(layerId: number): Promise<void> {
        return this.request<void>(`/gestion/${layerId}`, {
            method: 'DELETE',
        });
    }

    // ========================================================================
    // HEALTH
    // ========================================================================

    /**
     * Verificar el estado de la API
     */
    async healthCheck(): Promise<any> {
        return this.request<any>('/health', {}, );
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    /**
     * Convertir ItemResponse a formato compatible con VectorLayerDef
     */
    convertItemToVectorLayer(item: ItemResponse) {
        return {
            id: `layer_${item.id}`,
            name: item.name,
            description: item.description || '',
            group: item.group,
            wfsName: item.wfsName,
            wmsLayer: item.wmsLayer,
            // Campos opcionales con defaults
            color: '#3388ff',
            weight: 2,
            fillOpacity: 0.15,
        };
    }

    /**
     * Convertir ItemResponse a formato compatible con RasterLayerDef
     */
    convertItemToRasterLayer(item: ItemResponse) {
        return {
            id: `layer_${item.id}`,
            name: item.name,
            description: item.description || '',
            group: item.group,
            wmsLayer: item.wmsLayer,
        };
    }
}

// ============================================================================
// EXPORTAR INSTANCIA SINGLETON
// ============================================================================

export const apiService = new ApiService();
export default ApiService;
