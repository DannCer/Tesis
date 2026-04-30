/**
 * @fileoverview Tests para el servicio WFS
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wfsService } from '@services/geoserver';

// Mock del módulo env
vi.mock('../config/env', () => ({
  config: {
    qgisServer: {
      wfsUrl: 'http://localhost/qgis/qgis_mapserv.fcgi.exe?MAP=/test.qgz',
      timeout: 30000,
      maxFeatures: 200000,
    },
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  },
}));

describe('WFSService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getFeatures', () => {
    it('debería construir la URL correctamente con parámetros básicos', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      await wfsService.getFeatures('TestLayer');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('SERVICE=WFS'),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
          headers: { Accept: 'application/json' },
        })
      );
    });

    it('debería incluir CQL_FILTER cuando se proporciona', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      await wfsService.getFeatures('TestLayer', { cql_filter: "tipo = 'urbano'" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('CQL_FILTER='),
        expect.anything()
      );
    });

    it('debería incluir propertyName cuando se proporciona', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      await wfsService.getFeatures('TestLayer', { propertyName: 'nombre,area' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('PROPERTYNAME=nombre%2Carea'),
        expect.anything()
      );
    });

    it('debería manejar errores de respuesta', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Layer not found',
      });
      global.fetch = mockFetch;

      await expect(wfsService.getFeatures('NonExistentLayer'))
        .rejects
        .toThrow('Error WFS: 404 Not Found');
    });

    it('debería manejar timeout de petición', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
      global.fetch = mockFetch;

      await expect(wfsService.getFeatures('TestLayer'))
        .rejects
        .toThrow('La petición tardó demasiado tiempo');
    });
  });

  describe('getFeatureCount', () => {
    it('debería retornar el número total de features', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ totalFeatures: 42, numberMatched: 42 }),
      });
      global.fetch = mockFetch;

      const count = await wfsService.getFeatureCount('TestLayer');

      expect(count).toBe(42);
    });

    it('debería retornar 0 si no hay features', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ totalFeatures: 0, numberMatched: 0 }),
      });
      global.fetch = mockFetch;

      const count = await wfsService.getFeatureCount('EmptyLayer');

      expect(count).toBe(0);
    });
  });

  describe('getUniqueValues', () => {
    it('debería extraer valores únicos de un campo', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({
          features: [
            { properties: { tipo: 'urbano' } },
            { properties: { tipo: 'rural' } },
            { properties: { tipo: 'urbano' } },
            { properties: { tipo: 'industrial' } },
          ],
        }),
      });
      global.fetch = mockFetch;

      const values = await wfsService.getUniqueValues('TestLayer', 'tipo');

      expect(values).toEqual(['industrial', 'rural', 'urbano']);
    });

    it('debería manejar campos con valores null', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: vi.fn().mockReturnValue('application/json') },
        json: async () => ({
          features: [
            { properties: { tipo: 'urbano' } },
            { properties: { tipo: null } },
            { properties: { tipo: undefined } },
          ],
        }),
      });
      global.fetch = mockFetch;

      const values = await wfsService.getUniqueValues('TestLayer', 'tipo');

      expect(values).toEqual(['urbano']);
    });
  });

  describe('getFeaturesByBBox', () => {
    it('debería construir URL con BBOX correctamente', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      await wfsService.getFeaturesByBBox('TestLayer', [-99.5, 19.0, -98.5, 19.5]);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('BBOX=-99.5%2C19%2C-98.5%2C19.5'),
        expect.anything()
      );
    });
  });
});
