/**
 * @fileoverview Preferencias de carga bbox por capa — almacenadas en localStorage
 * No hay backend involucrado; es una decisión puramente del cliente.
 */

const STORAGE_KEY = 'geovisor:bbox_layers';

function load(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        return new Set();
    }
}

function save(set: Set<string>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
}

export const bboxLayerPrefs = {
    isBBox: (layerId: string): boolean => load().has(layerId),
    enable:  (layerId: string): void => { const s = load(); s.add(layerId);    save(s); },
    disable: (layerId: string): void => { const s = load(); s.delete(layerId); save(s); },
    toggle:  (layerId: string): boolean => {
        const s = load();
        if (s.has(layerId)) { s.delete(layerId); save(s); return false; }
        else                { s.add(layerId);    save(s); return true;  }
    },
    getAll:  (): string[] => Array.from(load()),
};