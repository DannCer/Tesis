/**
 * @fileoverview Hooks tipados para consumir los contextos de capas.
 *
 * Exporta tres hooks:
 *
 * - useLayersData()    — datos estables de capas (recomendado para la mayoría)
 * - useLayersMeta()    — estado de operación: loading, error, refresh
 * - useLayersContext() — valor combinado (retro-compatibilidad; evitar en código nuevo)
 *
 * @module contexts/LayersContext/useLayersContext
 */

import { useContext } from 'react';
import { LayersDataContext, LayersMetaContext } from './LayersContext';
import type { LayersDataContextValue, LayersMetaContextValue, LayersContextValue } from './LayersContext';

// ─── Hook de datos (sin re-renders por loading) ───────────────────────────────

export const useLayersData = (): LayersDataContextValue => {
    const ctx = useContext(LayersDataContext);
    if (!ctx) throw new Error('useLayersData debe usarse dentro de <LayersProvider>.');
    return ctx;
};

// ─── Hook de meta (loading / error / refresh) ─────────────────────────────────

export const useLayersMeta = (): LayersMetaContextValue => {
    const ctx = useContext(LayersMetaContext);
    if (!ctx) throw new Error('useLayersMeta debe usarse dentro de <LayersProvider>.');
    return ctx;
};

// ─── Hook combinado (retro-compatibilidad) ────────────────────────────────────
// Combina ambos contextos en un único objeto. Suscribe al componente a
// AMBOS contextos, por lo que se re-renderizará cuando loading cambie.
// Usar useLayersData() en su lugar cuando no se necesite loading/error/refresh.

export const useLayersContext = (): LayersContextValue => {
    const data = useLayersData();
    const meta = useLayersMeta();
    return { ...data, ...meta };
};
