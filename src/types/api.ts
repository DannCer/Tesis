/**
 * @fileoverview Tipos de respuesta del backend FastAPI.
 * @module types/api
 */

// ── Grupos ────────────────────────────────────────────────────────────────────

export interface GrupoResponse {
    id: number;
    nombre: string;
    url_proyecto: string | null;
}

export interface GrupoCreate {
    nombre: string;
    url_proyecto?: string | null;
}

// ── Subgrupos ─────────────────────────────────────────────────────────────────

export interface SubgrupoResponse {
    id: number;
    nombre: string;
    grupo_id: number;
}

export interface SubgrupoCreate {
    nombre: string;
    grupo_id: number;
}

// ── Capas (Items) ─────────────────────────────────────────────────────────────

export interface ItemResponse {
    id: number;
    name: string;
    description: string | null;
    group: string;
    subgroup: string | null;        // nombre del subgrupo (puede ser null)
    subgroup_id: number | null;     // id del subgrupo (puede ser null)
    type: 'vector' | 'raster';
    wfsName: string;
    wmsLayer: string;
}

export interface ItemCreate {
    name: string;
    description?: string | null;
    group_id: number;
    subgroup_id?: number | null;    // opcional
    tipo?: 'vector' | 'raster';
    wfsName: string;
    wmsLayer: string;
}