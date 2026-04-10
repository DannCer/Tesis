/**
 * @fileoverview Hook tipado para consumir LayersContext.
 * Lanza un error explícito si se usa fuera del LayersProvider.
 * @module contexts/LayersContext/useLayersContext
 */

import { useContext } from 'react';
import { LayersContext } from './LayersContext';
import type { LayersContextValue } from './LayersContext';

export const useLayersContext = (): LayersContextValue => {
    const ctx = useContext(LayersContext);
    if (!ctx) {
        throw new Error(
            'useLayersContext debe usarse dentro de <LayersProvider>. ' +
            'Asegúrate de que LayersProvider envuelva el árbol de componentes en main.tsx.'
        );
    }
    return ctx;
};
