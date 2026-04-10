/**
 * @fileoverview Tipos de respuesta del backend FastAPI.
 * Extraídos desde services/api/apiService.ts para centralizar la definición.
 * @module types/api
 */

// ============================================================================
// GRUPOS
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

// ============================================================================
// CAPAS (ITEMS)
// ============================================================================

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
