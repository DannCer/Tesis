/**
 * @fileoverview Contexto para mantener el proyecto QGIS seleccionado globalmente
 * @module contexts/SelectedProjectContext
 * 
 * Permite que cualquier componente acceda al proyecto actualmente seleccionado
 * y actualice dinámicamente las capas mostradas en el mapa
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import { logger } from '@config/env';
import { QgisProject } from '@types/projects';

/**
 * Tipos para el contexto
 */
interface SelectedProjectContextType {
    /** Proyecto actualmente seleccionado */
    selectedProject: QgisProject | null;
    
    /** Función para cambiar el proyecto seleccionado */
    setSelectedProject: (project: QgisProject | null) => void;
    
    /** ID del proyecto seleccionado (convenience accessor) */
    projectId: string | null;
    
    /** Nombre del proyecto seleccionado (convenience accessor) */
    projectName: string | null;
    
    /** Limpiar selección */
    clearSelection: () => void;
}

/**
 * Context instance
 */
const SelectedProjectContext = createContext<SelectedProjectContextType | undefined>(undefined);

/**
 * Provider component - Envuelve la aplicación
 */
export const SelectedProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [selectedProject, setSelectedProjectState] = useState<QgisProject | null>(null);

    const setSelectedProject = useCallback((project: QgisProject | null) => {
        setSelectedProjectState(project);
        logger.debug('Proyecto seleccionado:', project?.name || 'ninguno');
    }, []);

    const clearSelection = useCallback(() => {
        setSelectedProjectState(null);
    }, []);

    const value: SelectedProjectContextType = {
        selectedProject,
        setSelectedProject,
        projectId: selectedProject?.id ?? null,
        projectName: selectedProject?.name ?? null,
        clearSelection,
    };

    return (
        <SelectedProjectContext.Provider value={value}>
            {children}
        </SelectedProjectContext.Provider>
    );
};

/**
 * Hook para usar el contexto
 * @throws Error si se usa fuera del SelectedProjectProvider
 */
export const useSelectedProject = (): SelectedProjectContextType => {
    const context = useContext(SelectedProjectContext);
    if (context === undefined) {
        throw new Error(
            'useSelectedProject debe usarse dentro de un SelectedProjectProvider. ' +
            'Asegúrate de envolver tu aplicación con <SelectedProjectProvider>'
        );
    }
    return context;
};

export default SelectedProjectContext;