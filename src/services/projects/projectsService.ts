/**
 * @fileoverview Servicio para gestión de proyectos QGIS Server
 * @module services/projectsService
 */

import { QgisProject, DetectedLayer, ProjectCapabilities } from '@types/projects';
import { logger } from '@config/env';

const STORAGE_KEY = 'qgis_projects';

/**
 * Servicio para gestionar proyectos QGIS Server
 */
class ProjectsService {
    private projects: QgisProject[] = [];

    constructor() {
        this.loadProjects();
    }

    /**
     * Carga proyectos desde localStorage
     */
    private loadProjects(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                this.projects = JSON.parse(stored);
                logger.log('Proyectos cargados:', this.projects.length);
            } else {
                // Proyectos por defecto
                this.projects = this.getDefaultProjects();
                this.saveProjects();
            }
        } catch (error) {
            logger.error('Error al cargar proyectos:', error);
            this.projects = this.getDefaultProjects();
        }
    }

    /**
     * Proyectos por defecto basados en la configuración actual
     */
    private getDefaultProjects(): QgisProject[] {
        const serverUrl = 'http://localhost/qgis/qgis_mapserv.fcgi.exe';
        
        return [
            {
                id: 'geologicos',
                name: '🌋 Geológicos',
                serverUrl: serverUrl,
                projectPath: 'C:/mis_proyectos/01_Geologicos.qgz',
                fullUrl: `${serverUrl}?MAP=C:/mis_proyectos/01_Geologicos.qgz`,
                color: '#e53e3e',
                enabled: true,
                lastUpdated: new Date().toISOString(),
            },
            {
                id: 'hidrometeorologicos',
                name: '💧 Hidrometeorológicos',
                serverUrl: serverUrl,
                projectPath: 'C:/mis_proyectos/02_Hidrometeorologicos.qgz',
                fullUrl: `${serverUrl}?MAP=C:/mis_proyectos/02_Hidrometeorologicos.qgz`,
                color: '#3182ce',
                enabled: true,
                lastUpdated: new Date().toISOString(),
            },
        ];
    }

    /**
     * Guarda proyectos en localStorage
     */
    private saveProjects(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.projects));
            logger.log('Proyectos guardados');
        } catch (error) {
            logger.error('Error al guardar proyectos:', error);
        }
    }

    /**
     * Obtiene todos los proyectos
     */
    getProjects(): QgisProject[] {
        return [...this.projects];
    }

    /**
     * Obtiene proyectos activos
     */
    getActiveProjects(): QgisProject[] {
        return this.projects.filter(p => p.enabled);
    }

    /**
     * Obtiene un proyecto por ID
     */
    getProject(id: string): QgisProject | undefined {
        return this.projects.find(p => p.id === id);
    }

    /**
     * Agrega un nuevo proyecto
     */
    addProject(project: Omit<QgisProject, 'id' | 'fullUrl' | 'lastUpdated'>): QgisProject {
        const id = this.generateId(project.name);
        const fullUrl = `${project.serverUrl}?MAP=${encodeURIComponent(project.projectPath)}`;
        
        const newProject: QgisProject = {
            ...project,
            id,
            fullUrl,
            lastUpdated: new Date().toISOString(),
        };

        this.projects.push(newProject);
        this.saveProjects();
        logger.log('Proyecto agregado:', newProject.name);
        
        return newProject;
    }

    /**
     * Actualiza un proyecto existente
     */
    updateProject(id: string, updates: Partial<Omit<QgisProject, 'id'>>): QgisProject | null {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) return null;

        const project = this.projects[index];
        const updated: QgisProject = {
            ...project,
            ...updates,
            id, // ID no se puede cambiar
            lastUpdated: new Date().toISOString(),
        };

        // Reconstruir fullUrl si cambió serverUrl o projectPath
        if (updates.serverUrl || updates.projectPath) {
            updated.fullUrl = `${updated.serverUrl}?MAP=${encodeURIComponent(updated.projectPath)}`;
        }

        this.projects[index] = updated;
        this.saveProjects();
        logger.log('Proyecto actualizado:', updated.name);
        
        return updated;
    }

    /**
     * Elimina un proyecto
     */
    deleteProject(id: string): boolean {
        const index = this.projects.findIndex(p => p.id === id);
        if (index === -1) return false;

        const project = this.projects[index];
        this.projects.splice(index, 1);
        this.saveProjects();
        logger.log('Proyecto eliminado:', project.name);
        
        return true;
    }

    /**
     * Obtiene capacidades WMS de un proyecto
     */
    async getWMSCapabilities(project: QgisProject): Promise<DetectedLayer[]> {
        try {
            const url = `${project.fullUrl}&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities`;
            logger.debug('GetCapabilities WMS:', url);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // Verificar errores en el XML
            const serviceException = xmlDoc.querySelector('ServiceException');
            if (serviceException) {
                throw new Error(`Error del servidor: ${serviceException.textContent}`);
            }

            const layers: DetectedLayer[] = [];
            const layerElements = xmlDoc.querySelectorAll('Layer[queryable="1"]');

            layerElements.forEach(layer => {
                const name = layer.querySelector('Name')?.textContent?.trim();
                const title = layer.querySelector('Title')?.textContent?.trim();
                const abstract = layer.querySelector('Abstract')?.textContent?.trim();

                if (name && title) {
                    // Obtener BoundingBox
                    let bbox: DetectedLayer['bbox'];
                    const bboxElement = layer.querySelector('BoundingBox');
                    if (bboxElement) {
                        bbox = {
                            minx: parseFloat(bboxElement.getAttribute('minx') || '0'),
                            miny: parseFloat(bboxElement.getAttribute('miny') || '0'),
                            maxx: parseFloat(bboxElement.getAttribute('maxx') || '0'),
                            maxy: parseFloat(bboxElement.getAttribute('maxy') || '0'),
                            crs: bboxElement.getAttribute('CRS') || 'EPSG:4326',
                        };
                    }

                    layers.push({
                        name,
                        title,
                        abstract,
                        bbox,
                    });
                }
            });

            logger.log(`WMS: ${layers.length} capas detectadas en "${project.name}"`);
            return layers;

        } catch (error: any) {
            logger.error('Error en getWMSCapabilities:', error);
            throw new Error(`No se pudo obtener GetCapabilities WMS: ${error.message}`);
        }
    }

    /**
     * Obtiene capacidades WFS de un proyecto
     */
    async getWFSCapabilities(project: QgisProject): Promise<DetectedLayer[]> {
        try {
            const url = `${project.fullUrl}&SERVICE=WFS&VERSION=1.1.0&REQUEST=GetCapabilities`;
            logger.debug('GetCapabilities WFS:', url);

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
            }

            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

            // Verificar errores
            const serviceException = xmlDoc.querySelector('ServiceException');
            if (serviceException) {
                throw new Error(`Error del servidor: ${serviceException.textContent}`);
            }

            const layers: DetectedLayer[] = [];
            const featureTypes = xmlDoc.querySelectorAll('FeatureType');

            featureTypes.forEach(ft => {
                const name = ft.querySelector('Name')?.textContent?.trim();
                const title = ft.querySelector('Title')?.textContent?.trim();
                const abstract = ft.querySelector('Abstract')?.textContent?.trim();

                if (name && title) {
                    // Obtener BoundingBox
                    let bbox: DetectedLayer['bbox'];
                    const bboxElement = ft.querySelector('WGS84BoundingBox, LatLongBoundingBox');
                    if (bboxElement) {
                        // WFS 1.1.0 usa LowerCorner/UpperCorner
                        const lower = bboxElement.querySelector('LowerCorner')?.textContent?.trim().split(' ');
                        const upper = bboxElement.querySelector('UpperCorner')?.textContent?.trim().split(' ');
                        
                        if (lower && upper) {
                            bbox = {
                                minx: parseFloat(lower[0]),
                                miny: parseFloat(lower[1]),
                                maxx: parseFloat(upper[0]),
                                maxy: parseFloat(upper[1]),
                                crs: 'EPSG:4326',
                            };
                        } else {
                            // WFS 1.0.0 usa atributos
                            bbox = {
                                minx: parseFloat(bboxElement.getAttribute('minx') || '0'),
                                miny: parseFloat(bboxElement.getAttribute('miny') || '0'),
                                maxx: parseFloat(bboxElement.getAttribute('maxx') || '0'),
                                maxy: parseFloat(bboxElement.getAttribute('maxy') || '0'),
                                crs: 'EPSG:4326',
                            };
                        }
                    }

                    layers.push({
                        name,
                        title,
                        abstract,
                        bbox,
                    });
                }
            });

            logger.log(`WFS: ${layers.length} capas detectadas en "${project.name}"`);
            return layers;

        } catch (error: any) {
            logger.error('Error en getWFSCapabilities:', error);
            throw new Error(`No se pudo obtener GetCapabilities WFS: ${error.message}`);
        }
    }

    /**
     * Obtiene todas las capacidades de un proyecto (WMS + WFS)
     */
    async getProjectCapabilities(projectId: string): Promise<ProjectCapabilities | null> {
        const project = this.getProject(projectId);
        if (!project) return null;

        try {
            const [wmsLayers, wfsLayers] = await Promise.all([
                this.getWMSCapabilities(project).catch(() => []),
                this.getWFSCapabilities(project).catch(() => []),
            ]);

            return {
                projectId,
                wmsLayers,
                wfsLayers,
                timestamp: new Date().toISOString(),
            };
        } catch (error) {
            logger.error('Error obteniendo capacidades:', error);
            return null;
        }
    }

    /**
     * Genera un ID único a partir del nombre
     */
    private generateId(name: string): string {
        const base = name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
            .replace(/[^a-z0-9]+/g, '_') // Reemplazar caracteres especiales
            .replace(/^_+|_+$/g, ''); // Quitar guiones al inicio/fin

        // Verificar si existe
        let id = base;
        let counter = 1;
        while (this.projects.some(p => p.id === id)) {
            id = `${base}_${counter}`;
            counter++;
        }

        return id;
    }

    /**
     * Resetea a proyectos por defecto
     */
    resetToDefaults(): void {
        this.projects = this.getDefaultProjects();
        this.saveProjects();
        logger.log('Proyectos reseteados a valores por defecto');
    }
}

export const projectsService = new ProjectsService();
export default ProjectsService;
