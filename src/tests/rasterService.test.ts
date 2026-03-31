/**
 * @fileoverview Tests para el servicio Raster (WMS)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rasterService } from '../services/rasterService';

// Mock del módulo env
vi.mock('../config/env', () => ({
  config: {
    qgisServer: {
      wmsRasterUrl: 'http://localhost/qgis/qgis_mapserv.fcgi.exe?MAP=/raster.qgz',
      timeout: 30000,
    },
  },
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  },
}));

describe('RasterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPixelValue', () => {
    const mockParams = {
      bbox: [-99.5, 19.0, -98.5, 19.5],
      width: 800,
      height: 600,
      clickPoint: [400, 300] as [number, number],
      srs: 'EPSG:3857' as const,
    };

    it('debería construir URL GetFeatureInfo correctamente', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      await rasterService.getPixelValue('TestLayer', mockParams);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toEqual(expect.stringContaining('REQUEST=GetFeatureInfo'));
      expect(mockFetch.mock.calls[0][0]).toEqual(expect.stringContaining('LAYERS=TestLayer'));
      expect(mockFetch.mock.calls[0][0]).toEqual(expect.stringContaining('X=400'));
      expect(mockFetch.mock.calls[0][0]).toEqual(expect.stringContaining('Y=300'));
    });

    it('debería incluir parámetro TIME cuando se proporciona', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      await rasterService.getPixelValue('TestLayer', {
        ...mockParams,
        time: '2022-01-01',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toEqual(expect.stringContaining('TIME=2022-01-01'));
    });

    it('debería manejar respuesta vacía (sin features)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [] }),
      });
      global.fetch = mockFetch;

      const result = await rasterService.getPixelValue('TestLayer', mockParams);

      expect(result.value).toBeNull();
      expect(result.message).toBe('No hay datos en esta ubicación');
    });

    it('debería parsear valor de píxel desde properties', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{
            properties: {
              TestLayer: 42,
            },
            geometry: { coordinates: [-99.1, 19.4] },
          }],
        }),
      });
      global.fetch = mockFetch;

      const result = await rasterService.getPixelValue('TestLayer', mockParams);

      expect(result.value).toBe(42);
      expect(result.layerName).toBe('TestLayer');
    });

    it('debería formatear valores decimales a 4 posiciones', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{
            properties: { TestLayer: 3.14159265 },
          }],
        }),
      });
      global.fetch = mockFetch;

      const result = await rasterService.getPixelValue('TestLayer', mockParams);

      expect(result.value).toBe(3.1416);
    });

    it('debería buscar valor en propiedades con nombres alternativos', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [{
            properties: {
              GRAY_INDEX: 128,
            },
          }],
        }),
      });
      global.fetch = mockFetch;

      const result = await rasterService.getPixelValue('TestLayer', mockParams);

      expect(result.value).toBe(128);
    });

    it('debería manejar error de respuesta', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      await expect(rasterService.getPixelValue('TestLayer', mockParams))
        .rejects
        .toThrow('Error GetFeatureInfo: 500');
    });
  });

  describe('getMultiplePixelValues', () => {
    it('debería consultar múltiples capas en paralelo', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [{ properties: { value: 1 } }] }),
      });
      global.fetch = mockFetch;

      const queries = [
        { layerName: 'Layer1', params: { bbox: [], width: 100, height: 100, clickPoint: [50, 50] as [number, number] } },
        { layerName: 'Layer2', params: { bbox: [], width: 100, height: 100, clickPoint: [50, 50] as [number, number] } },
      ];

      const results = await rasterService.getMultiplePixelValues(queries);

      expect(results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('debería continuar con consultas exitosas si una falla', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ features: [{ properties: { value: 1 } }] }),
        })
        .mockRejectedValueOnce(new Error('Network error'));

      global.fetch = mockFetch;

      const queries = [
        { layerName: 'Layer1', params: { bbox: [], width: 100, height: 100, clickPoint: [50, 50] as [number, number] } },
        { layerName: 'Layer2', params: { bbox: [], width: 100, height: 100, clickPoint: [50, 50] as [number, number] } },
      ];

      const results = await rasterService.getMultiplePixelValues(queries);

      expect(results).toHaveLength(2);
      expect(results[0].value).toBe(1);
      expect(results[1].error).toBeDefined();
    });
  });
});
