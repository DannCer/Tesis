/**
 * @fileoverview Hook para gestionar capas agrupadas por proyecto QGIS
 * @module hooks/useProjectLayers
 */

import { useState, useEffect, useCallback } from 'react';
import { projectsService } from '@services/projects';
import { QgisProject, DetectedLayer, ProjectCapabilities } from '@types/projects';
import { logger } from '@config/env';

export interface ProjectLayerItem {
    projectId: string;
    projectName: string;
    projectColor?: string;
    layerId: string;
    layerName: string;
    layerTitle: string;
    layerType: 'wms' | 'wfs';
    enabled: boolean;
}

export interface ProjectLayersGroup {
    project: QgisProject;
    layers: ProjectLayerItem[];
    wmsCount: number;
    wfsCount: number;
}

/**
 * Hook para gestionar capas agrupadas por proyecto
 */
export const useProjectLayers = () => {
    const [projects, setProjects] = useState<QgisProject[]>([]);
    const [capabilities, setCapabilities] = useState<Record<string, ProjectCapabilities>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [layerStates, setLayerStates] = useState<Record<string, boolean>>({});

    // Cargar proyectos
    const loadProjects = useCallback(() => {
        const loaded = projectsService.getActiveProjects();
        setProjects(loaded);
        
        // Cargar capacidades para cada proyecto
        loaded.forEach(project => {
            loadProjectCapabilities(project.id);
        });
    }, []);

    // Cargar capacidades de un proyecto
    const loadProjectCapabilities = useCallback(async (projectId: string) => {
        setLoading(prev => ({ ...prev, [projectId]: true }));
        setErrors(prev => ({ ...prev, [projectId]: '' }));
        
        try {
            const caps = await projectsService.getProjectCapabilities(projectId);
            if (caps) {
                setCapabilities(prev => ({ ...prev, [projectId]: caps }));
            } else {
                setErrors(prev => ({ 
                    ...prev, 
                    [projectId]: 'No se pudieron cargar las capacidades' 
                }));
            }
        } catch (error: any) {
            logger.error('Error cargando capacidades:', error);
            setErrors(prev => ({ 
                ...prev, 
                [projectId]: error.message || 'Error desconocido' 
            }));
        } finally {
            setLoading(prev => ({ ...prev, [projectId]: false }));
        }
    }, []);

    // Construir grupos de capas por proyecto
    const getProjectLayersGroups = useCallback((): ProjectLayersGroup[] => {
        return projects.map(project => {
            const caps = capabilities[project.id];
            const layers: ProjectLayerItem[] = [];

            if (caps) {
                // Agregar capas WMS
                caps.wmsLayers.forEach(layer => {
                    const layerId = `${project.id}:wms:${layer.name}`;
                    layers.push({
                        projectId: project.id,
                        projectName: project.name,
                        projectColor: project.color,
                        layerId,
                        layerName: layer.name,
                        layerTitle: layer.title,
                        layerType: 'wms',
                        enabled: layerStates[layerId] ?? false,
                    });
                });

                // Agregar capas WFS
                caps.wfsLayers.forEach(layer => {
                    const layerId = `${project.id}:wfs:${layer.name}`;
                    layers.push({
                        projectId: project.id,
                        projectName: project.name,
                        projectColor: project.color,
                        layerId,
                        layerName: layer.name,
                        layerTitle: layer.title,
                        layerType: 'wfs',
                        enabled: layerStates[layerId] ?? false,
                    });
                });
            }

            return {
                project,
                layers,
                wmsCount: caps?.wmsLayers.length ?? 0,
                wfsCount: caps?.wfsLayers.length ?? 0,
            };
        });
    }, [projects, capabilities, layerStates]);

    // Toggle capa
    const toggleLayer = useCallback((layerId: string) => {
        setLayerStates(prev => ({
            ...prev,
            [layerId]: !prev[layerId],
        }));
    }, []);

    // Activar todas las capas de un proyecto
    const enableAllProjectLayers = useCallback((projectId: string) => {
        const caps = capabilities[projectId];
        if (!caps) return;

        const newStates: Record<string, boolean> = {};
        caps.wmsLayers.forEach(layer => {
            newStates[`${projectId}:wms:${layer.name}`] = true;
        });
        caps.wfsLayers.forEach(layer => {
            newStates[`${projectId}:wfs:${layer.name}`] = true;
        });

        setLayerStates(prev => ({ ...prev, ...newStates }));
    }, [capabilities]);

    // Desactivar todas las capas de un proyecto
    const disableAllProjectLayers = useCallback((projectId: string) => {
        const caps = capabilities[projectId];
        if (!caps) return;

        const newStates: Record<string, boolean> = {};
        caps.wmsLayers.forEach(layer => {
            newStates[`${projectId}:wms:${layer.name}`] = false;
        });
        caps.wfsLayers.forEach(layer => {
            newStates[`${projectId}:wfs:${layer.name}`] = false;
        });

        setLayerStates(prev => ({ ...prev, ...newStates }));
    }, [capabilities]);

    // Recargar capacidades de un proyecto
    const reloadProjectCapabilities = useCallback((projectId: string) => {
        loadProjectCapabilities(projectId);
    }, [loadProjectCapabilities]);

    // Inicializar
    useEffect(() => {
        loadProjects();
    }, [loadProjects]);

    return {
        projects,
        projectLayersGroups: getProjectLayersGroups(),
        loading,
        errors,
        toggleLayer,
        enableAllProjectLayers,
        disableAllProjectLayers,
        reloadProjectCapabilities,
        refreshProjects: loadProjects,
    };
};
