/**
 * @fileoverview Hook para cargar capas del proyecto QGIS seleccionado dinámicamente
 * @module hooks/map/useSelectedProjectLayers
 * 
 * Obtiene las capas WMS y WFS del proyecto seleccionado desde QGIS Server
 * y las convierte al formato LayerConfig de la aplicación
 */

import { useState, useEffect, useCallback } from 'react';
import { useSelectedProject } from '@contexts/SelectedProjectContext';
import { projectsService } from '@services/projects';
import { LayerConfig } from '@config/layers';
import { logger } from '@config/env';

/**
 * Interface para el retorno del hook
 */
export interface SelectedProjectLayersResult {
    /** Capas del proyecto seleccionado */
    layers: LayerConfig[];
    
    /** Indicador de carga */
    loading: boolean;
    
    /** Mensaje de error si algo falló */
    error: string | null;
    
    /** Función para recargar manualmente */
    refreshLayers: () => Promise<void>;
    
    /** ID del proyecto actualmente seleccionado */
    selectedProjectId: string | null;
    
    /** Nombre del proyecto actualmente seleccionado */
    selectedProjectName: string | null;
    
    /** Cantidad de capas WMS */
    wmsCount: number;
    
    /** Cantidad de capas WFS */
    wfsCount: number;
}

/**
 * Hook: Cargar capas dinámicamente según el proyecto seleccionado
 * 
 * @example
 * ```typescript
 * const { layers, loading, error } = useSelectedProjectLayers();
 * 
 * if (loading) return <div>Cargando capas...</div>;
 * if (error) return <div>Error: {error}</div>;
 * 
 * return (
 *   <LayerMenu layers={layers} />
 * );
 * ```
 */
export const useSelectedProjectLayers = (): SelectedProjectLayersResult => {
    const { selectedProject, projectId, projectName } = useSelectedProject();
    
    const [layers, setLayers] = useState<LayerConfig[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [wmsCount, setWmsCount] = useState(0);
    const [wfsCount, setWfsCount] = useState(0);

    /**
     * Función principal: cargar capas del proyecto seleccionado
     */
    const loadProjectLayers = useCallback(async () => {
        // Si no hay proyecto seleccionado, limpiar
        if (!selectedProject) {
            setLayers([]);
            setError(null);
            setWmsCount(0);
            setWfsCount(0);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            logger.log(`Cargando capas del proyecto: ${selectedProject.name}`);

            // Obtener capacidades (WMS + WFS) del proyecto
            const capabilities = await projectsService.getProjectCapabilities(
                selectedProject.id
            );

            if (!capabilities) {
                throw new Error('No se pudieron obtener las capacidades del proyecto');
            }

            // Convertir capacidades de WMS a LayerConfig
            const wmsLayers: LayerConfig[] = capabilities.wmsLayers.map((layer) => ({
                id: `${selectedProject.id}:wms:${layer.name}`,
                name: layer.title || layer.name,
                description: layer.abstract || `Capa ráster del proyecto ${selectedProject.name}`,
                type: 'raster' as const,
                group: selectedProject.name, // Agrupar por nombre del proyecto
                wmsLayer: layer.name,
                showLegend: true,
                color: selectedProject.color, // Color del proyecto
                bounds: layer.bbox ? {
                    south: layer.bbox.miny,
                    west: layer.bbox.minx,
                    north: layer.bbox.maxy,
                    east: layer.bbox.maxx,
                } : undefined,
            }));

            // Convertir capacidades de WFS a LayerConfig
            const wfsLayers: LayerConfig[] = capabilities.wfsLayers.map((layer) => ({
                id: `${selectedProject.id}:wfs:${layer.name}`,
                name: layer.title || layer.name,
                description: layer.abstract || `Capa vectorial del proyecto ${selectedProject.name}`,
                type: 'vector' as const,
                group: selectedProject.name, // Agrupar por nombre del proyecto
                wfsName: layer.name,
                showLegend: true,
                color: selectedProject.color, // Color del proyecto
                bounds: layer.bbox ? {
                    south: layer.bbox.miny,
                    west: layer.bbox.minx,
                    north: layer.bbox.maxy,
                    east: layer.bbox.maxx,
                } : undefined,
            }));

            // Combinar todas las capas
            const allLayers = [...wmsLayers, ...wfsLayers];

            setLayers(allLayers);
            setWmsCount(wmsLayers.length);
            setWfsCount(wfsLayers.length);
            setError(null);

            logger.log(
                `✓ Capas cargadas: ${wmsLayers.length} WMS + ${wfsLayers.length} WFS ` +
                `del proyecto "${selectedProject.name}"`
            );

        } catch (err: any) {
            logger.error('Error cargando capas del proyecto:', err);
            setError(
                err.message || 'Error desconocido al cargar las capas del proyecto'
            );
            setLayers([]);
            setWmsCount(0);
            setWfsCount(0);
        } finally {
            setLoading(false);
        }
    }, [selectedProject]);

    /**
     * Efecto: Recargar capas cuando cambia el proyecto seleccionado
     * Se usa projectId para evitar loops infinitos
     */
    useEffect(() => {
        loadProjectLayers();
    }, [projectId]); // Solo el ID, no el objeto completo

    return {
        layers,
        loading,
        error,
        refreshLayers: loadProjectLayers,
        selectedProjectId: projectId,
        selectedProjectName: projectName,
        wmsCount,
        wfsCount,
    };
};

export default useSelectedProjectLayers;