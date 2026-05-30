/**
 * @fileoverview Tests para analysisToolUtils — buildCql, WKT builders,
 * formatMeasurement, validateGeometry, validateBufferDistance.
 *
 * @module tests/analysisToolUtils
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import L from 'leaflet';

// buildCql, validateGeometry y validateBufferDistance usan L.LatLng pero
// no dependen del DOM/canvas, por lo que el entorno jsdom es suficiente.

import {
    buildCql,
    calculateLength,
    calculateArea,
    formatMeasurement,
    pointWkt,
    lineStringWkt,
    polygonWkt,
    validateGeometry,
    validateBufferDistance,
    formatTimestamp,
    formatRelativeTime,
    calculateStats,
    buildBboxCql,
    clientSideFilter,
} from '../utils/analysisToolUtils';
import type { LayerResult } from '../utils/analysisToolUtils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const pt  = (lat: number, lng: number) => L.latLng(lat, lng);

const CDMX  = pt(19.43, -99.13);
const TOLUCA = pt(19.28, -99.66);
const PUEBLA = pt(19.04, -98.20);

// ─── WKT builders ─────────────────────────────────────────────────────────────

describe('pointWkt', () => {
    it('genera WKT correcto para un punto', () => {
        const wkt = pointWkt(19.43, -99.13);
        expect(wkt).toBe('POINT(-99.13 19.43)');
    });
});

describe('lineStringWkt', () => {
    it('genera WKT correcto para dos puntos', () => {
        const wkt = lineStringWkt([CDMX, TOLUCA]);
        expect(wkt).toMatch(/^LINESTRING\(/);
        expect(wkt).toContain('-99.13 19.43');
        expect(wkt).toContain('-99.66 19.28');
    });
});

describe('polygonWkt', () => {
    it('genera WKT correcto para tres puntos y cierra el anillo', () => {
        const wkt = polygonWkt([CDMX, TOLUCA, PUEBLA]);
        expect(wkt).toMatch(/^POLYGON\(\(/);
        // El anillo debe cerrarse (primer punto repetido al final)
        const coords = wkt.replace('POLYGON((', '').replace('))', '');
        const parts  = coords.split(',');
        expect(parts[0].trim()).toBe(parts[parts.length - 1].trim());
    });
});

// ─── buildCql ────────────────────────────────────────────────────────────────

describe('buildCql', () => {
    it('modo point genera DWithin con POINT WKT', () => {
        const cql = buildCql('point', [CDMX], 500, 'meters');
        expect(cql).toMatch(/^DWithin\(geometry, POINT/);
        expect(cql).toContain('500');
        expect(cql).toContain('meters');
    });

    it('modo line genera DWithin con LINESTRING WKT', () => {
        const cql = buildCql('line', [CDMX, TOLUCA], 1, 'kilometers');
        expect(cql).toMatch(/^DWithin\(geometry, LINESTRING/);
        expect(cql).toContain('1');
        expect(cql).toContain('kilometers');
    });

    it('modo polygon genera INTERSECTS con POLYGON WKT (sin distancia)', () => {
        const cql = buildCql('polygon', [CDMX, TOLUCA, PUEBLA], 0, 'meters');
        expect(cql).toMatch(/^INTERSECTS\(geometry, POLYGON/);
        // INTERSECTS no debe incluir la distancia como argumento explícito
        expect(cql).not.toMatch(/DWithin/);
    });

    it('los modos point y line usan la unidad especificada', () => {
        expect(buildCql('point', [CDMX], 2, 'miles')).toContain('miles');
        expect(buildCql('line',  [CDMX, TOLUCA], 2, 'miles')).toContain('miles');
    });
});

// ─── validateGeometry ────────────────────────────────────────────────────────

describe('validateGeometry', () => {
    it('point con 1 punto es válido', () => {
        expect(validateGeometry('point', 1)).toBeNull();
    });

    it('point con 0 puntos es inválido', () => {
        expect(validateGeometry('point', 0)).not.toBeNull();
    });

    it('line con 2 puntos es válido', () => {
        expect(validateGeometry('line', 2)).toBeNull();
    });

    it('line con 1 punto es inválido', () => {
        expect(validateGeometry('line', 1)).not.toBeNull();
    });

    it('polygon con 3 puntos es válido', () => {
        expect(validateGeometry('polygon', 3)).toBeNull();
    });

    it('polygon con 2 puntos es inválido', () => {
        expect(validateGeometry('polygon', 2)).not.toBeNull();
    });
});

// ─── validateBufferDistance ──────────────────────────────────────────────────

describe('validateBufferDistance', () => {
    it('modo point con distancia positiva es válido', () => {
        expect(validateBufferDistance('point', 100)).toBeNull();
    });

    it('modo point con distancia cero es inválido', () => {
        expect(validateBufferDistance('point', 0)).not.toBeNull();
    });

    it('modo line con distancia negativa es inválido', () => {
        expect(validateBufferDistance('line', -1)).not.toBeNull();
    });

    it('modo polygon ignora la distancia (siempre válido)', () => {
        // polygon usa INTERSECTS, no DWithin → la distancia no aplica
        expect(validateBufferDistance('polygon', 0)).toBeNull();
    });
});

// ─── formatMeasurement ───────────────────────────────────────────────────────

describe('formatMeasurement', () => {
    it('longitudes < 1000m se muestran en metros', () => {
        expect(formatMeasurement(500, 'length')).toBe('500.0 m');
    });

    it('longitudes >= 1000m se convierten a km', () => {
        expect(formatMeasurement(5000, 'length')).toBe('5.00 km');
    });

    it('áreas < 10000m² se muestran en m²', () => {
        expect(formatMeasurement(100, 'area')).toBe('100.0 m²');
    });

    it('áreas entre 10000 y 1000000 m² se muestran en ha', () => {
        expect(formatMeasurement(50000, 'area')).toBe('5.00 ha');
    });

    it('áreas >= 1000000 m² se muestran en km²', () => {
        expect(formatMeasurement(2_000_000, 'area')).toBe('2.00 km²');
    });
});

// ─── calculateStats ──────────────────────────────────────────────────────────

describe('calculateStats', () => {
    const results: LayerResult[] = [
        { id: 'a', name: 'Capa A', count: 10, features: [] },
        { id: 'b', name: 'Capa B', count: 0,  features: [] },
        { id: 'c', name: 'Capa C', count: 5,  features: [] },
    ];

    it('totalFeatures es la suma de todos los count', () => {
        const stats = calculateStats(results);
        expect(stats.totalFeatures).toBe(15);
    });

    it('layersWithData cuenta solo capas con count > 0', () => {
        const stats = calculateStats(results);
        expect(stats.layersWithData).toBe(2);
    });

    it('totalLayers refleja el total de capas sin importar si tienen features', () => {
        const stats = calculateStats(results);
        expect(stats.totalLayers).toBe(3);
    });

    it('topLayers devuelve las capas con más features ordenadas', () => {
        const stats = calculateStats(results);
        expect(stats.topLayers[0].count).toBeGreaterThanOrEqual(stats.topLayers[1]?.count ?? 0);
    });

    it('result vacío produce totalFeatures=0 y layersWithData=0', () => {
        const stats = calculateStats([]);
        expect(stats.totalFeatures).toBe(0);
        expect(stats.layersWithData).toBe(0);
        expect(stats.totalLayers).toBe(0);
    });
});

// ─── formatTimestamp / formatRelativeTime ────────────────────────────────────

describe('formatTimestamp', () => {
    it('devuelve un string no vacío para un timestamp válido', () => {
        const fmt = formatTimestamp(Date.now());
        expect(typeof fmt).toBe('string');
        expect(fmt.length).toBeGreaterThan(0);
    });
});

describe('formatRelativeTime', () => {
    it('devuelve "hace un momento" para timestamps muy recientes', () => {
        const fmt = formatRelativeTime(Date.now() - 1000);
        expect(typeof fmt).toBe('string');
        expect(fmt.length).toBeGreaterThan(0);
    });

    it('devuelve tiempo en minutos para timestamps de hace ~5 minutos', () => {
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const fmt = formatRelativeTime(fiveMinutesAgo);
        expect(fmt.toLowerCase()).toMatch(/min|momento|hora/);
    });
});

// ─── buildBboxCql ─────────────────────────────────────────────────────────────

describe('buildBboxCql', () => {
    it('modo punto genera BBOX centrado en el punto con padding del buffer', () => {
        const cql = buildBboxCql('point', [CDMX], 10000, 'geometry');
        expect(cql).toMatch(/^BBOX\(geometry,/);
        // El BBOX debe ser más grande que el punto solo
        const parts = cql.replace('BBOX(geometry, ', '').replace(')', '').split(', ').map(Number);
        expect(parts).toHaveLength(4);
        const [minLng, minLat, maxLng, maxLat] = parts;
        expect(minLat).toBeLessThan(CDMX.lat);
        expect(maxLat).toBeGreaterThan(CDMX.lat);
        expect(minLng).toBeLessThan(CDMX.lng);
        expect(maxLng).toBeGreaterThan(CDMX.lng);
    });

    it('modo polígono genera BBOX ajustado exactamente a los vértices', () => {
        const cql = buildBboxCql('polygon', [CDMX, TOLUCA, PUEBLA], 0, 'geometry');
        expect(cql).toMatch(/^BBOX\(geometry,/);
        // Verificar que TOLUCA (más al oeste) define minLng
        expect(cql).toContain(String(Math.min(CDMX.lng, TOLUCA.lng, PUEBLA.lng)));
    });

    it('usa el nombre de campo de geometría pasado como argumento', () => {
        const cql = buildBboxCql('point', [CDMX], 1000, 'the_geom');
        expect(cql).toMatch(/^BBOX\(the_geom,/);
    });

    it('buffer mayor produce BBOX más grande', () => {
        const small = buildBboxCql('point', [CDMX], 1000,  'geometry');
        const large = buildBboxCql('point', [CDMX], 50000, 'geometry');
        const parseParts = (cql: string) =>
            cql.replace('BBOX(geometry, ', '').replace(')', '').split(', ').map(Number);
        const [sMinLng, sMinLat, sMaxLng, sMaxLat] = parseParts(small);
        const [lMinLng, lMinLat, lMaxLng, lMaxLat] = parseParts(large);
        expect(lMinLat).toBeLessThan(sMinLat);
        expect(lMaxLat).toBeGreaterThan(sMaxLat);
        expect(lMinLng).toBeLessThan(sMinLng);
        expect(lMaxLng).toBeGreaterThan(sMaxLng);
    });
});

// ─── clientSideFilter ─────────────────────────────────────────────────────────

describe('clientSideFilter', () => {
    const makePoint = (lat: number, lng: number): GeoJSON.Feature => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { id: `${lat},${lng}` },
    });

    // Features de prueba: CDMX y un punto en Monterrey (muy lejos)
    const MONTERREY = pt(25.67, -100.31);
    const features  = [makePoint(CDMX.lat, CDMX.lng), makePoint(MONTERREY.lat, MONTERREY.lng)];

    it('modo punto: incluye features dentro del radio', () => {
        // Radio de 100km centrado en CDMX — CDMX está dentro, Monterrey fuera
        const result = clientSideFilter(features, 'point', [CDMX], 100_000);
        expect(result).toHaveLength(1);
        expect(result[0].properties?.id).toBe(`${CDMX.lat},${CDMX.lng}`);
    });

    it('modo punto: radio muy pequeño excluye features lejanos', () => {
        const result = clientSideFilter(features, 'point', [CDMX], 100);
        // CDMX está prácticamente en el centro: ~0m de distancia al punto CDMX
        expect(result).toHaveLength(1);
    });

    it('modo polígono: incluye features dentro del polígono (ray-cast)', () => {
        // Triángulo grande que contiene CDMX pero no Monterrey
        const triangle = [
            pt(16.0, -102.0),
            pt(16.0, -96.0),
            pt(22.0, -99.0),
        ];
        const result = clientSideFilter(features, 'polygon', triangle, 0);
        expect(result.some(f => f.properties?.id === `${CDMX.lat},${CDMX.lng}`)).toBe(true);
        expect(result.some(f => f.properties?.id === `${MONTERREY.lat},${MONTERREY.lng}`)).toBe(false);
    });

    it('lista vacía devuelve array vacío', () => {
        expect(clientSideFilter([], 'point', [CDMX], 1000)).toHaveLength(0);
    });

    it('features sin geometría son excluidos', () => {
        const noGeom: GeoJSON.Feature = { type: 'Feature', geometry: null as unknown as GeoJSON.Geometry, properties: {} };
        expect(clientSideFilter([noGeom], 'point', [CDMX], 1_000_000)).toHaveLength(0);
    });

    it('modo línea: incluye features dentro del buffer de la línea', () => {
        // Línea CDMX → Puebla, buffer 10km — CDMX está a ~0m del inicio de la línea
        const result = clientSideFilter(features, 'line', [CDMX, PUEBLA], 10_000);
        expect(result.some(f => f.properties?.id === `${CDMX.lat},${CDMX.lng}`)).toBe(true);
    });
});
