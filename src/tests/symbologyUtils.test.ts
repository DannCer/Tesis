/**
 * @fileoverview Tests para utilidades de simbología
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateExpression,
  classifyFeatures,
  detectGeomType,
  extractFields,
  extractUniqueValues,
  autoCategorize,
  featureStyle,
  getColorInRamp,
  DEFAULT_SYMBOLOGY,
} from '../utils/symbologyUtils';

describe('symbologyUtils', () => {
  describe('evaluateExpression', () => {
    const properties = { area: 100, population: 5000, density: 50 };

    it('debería evaluar campo simple', () => {
      expect(evaluateExpression('area', properties)).toBe(100);
    });

    it('debería evaluar expresión aritmética', () => {
      expect(evaluateExpression('population / area', properties)).toBe(50);
      expect(evaluateExpression('area * 2', properties)).toBe(200);
    });

    it('debería manejar paréntesis', () => {
      expect(evaluateExpression('(area + population) / 2', properties)).toBe(2550);
    });

    it('debería retornar null para expresión inválida', () => {
      expect(evaluateExpression('invalid_field', properties)).toBeNull();
      expect(evaluateExpression('console.log("hack")', properties)).toBeNull();
    });

    it('debería manejar notación decimal con coma', () => {
      expect(evaluateExpression('3,14', {})).toBe(3.14);
    });
  });

  describe('getColorInRamp', () => {
    it('debería retornar color hex válido', () => {
      const color = getColorInRamp('Azules', 0.5);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
    });

    it('debería manejar valores fuera de rango', () => {
      expect(() => getColorInRamp('Azules', -0.5)).not.toThrow();
      expect(() => getColorInRamp('Azules', 1.5)).not.toThrow();
    });

    it('debería retornar colores consistentes', () => {
      const color1 = getColorInRamp('Azules', 0);
      const color2 = getColorInRamp('Azules', 0);
      expect(color1).toBe(color2);
    });
  });

  describe('detectGeomType', () => {
    it('debería detectar tipo Point', () => {
      const features = [
        { geometry: { type: 'Point' } },
        { geometry: { type: 'Point' } },
      ];
      expect(detectGeomType(features as any)).toBe('point');
    });

    it('debería detectar tipo Polygon', () => {
      const features = [{ geometry: { type: 'Polygon' } }];
      expect(detectGeomType(features as any)).toBe('polygon');
    });

    it('debería detectar tipo mixto', () => {
      const features = [
        { geometry: { type: 'Point' } },
        { geometry: { type: 'Polygon' } },
      ];
      expect(detectGeomType(features as any)).toBe('mixed');
    });

    it('debería manejar features sin geometría', () => {
      const features = [{ geometry: null }, {}];
      expect(detectGeomType(features as any)).toBe('mixed');
    });
  });

  describe('extractFields', () => {
    it('debería extraer nombres de campos únicos', () => {
      const features = [
        { properties: { name: 'A', area: 100 } },
        { properties: { name: 'B', population: 500 } },
      ];
      const fields = extractFields(features as any);
      expect(fields).toEqual(expect.arrayContaining(['name', 'area', 'population']));
    });

    it('debería manejar features sin properties', () => {
      const features = [{}, { properties: null }];
      expect(extractFields(features as any)).toEqual([]);
    });
  });

  describe('extractUniqueValues', () => {
    it('debería extraer valores únicos de un campo', () => {
      const features = [
        { properties: { tipo: 'urbano' } },
        { properties: { tipo: 'rural' } },
        { properties: { tipo: 'urbano' } },
      ];
      const values = extractUniqueValues(features as any, 'tipo');
      expect(values).toEqual(expect.arrayContaining(['rural', 'urbano']));
      expect(values).toHaveLength(2);
    });

    it('debería ignorar valores null/undefined', () => {
      const features = [
        { properties: { tipo: 'urbano' } },
        { properties: { tipo: null } },
        { properties: { tipo: undefined } },
      ];
      const values = extractUniqueValues(features as any, 'tipo');
      expect(values).toEqual(['urbano']);
    });
  });

  describe('autoCategorize', () => {
    it('debería generar categorías con colores distintos', () => {
      const features = [
        { properties: { tipo: 'A' } },
        { properties: { tipo: 'B' } },
        { properties: { tipo: 'C' } },
      ];
      const categories = autoCategorize(features as any, 'tipo');
      expect(categories).toHaveLength(3);
      expect(categories.map(c => c.value)).toEqual(['A', 'B', 'C']);
      expect(new Set(categories.map(c => c.color)).size).toBe(3);
    });
  });

  describe('classifyFeatures', () => {
    const features = [
      { properties: { value: 10 } },
      { properties: { value: 20 } },
      { properties: { value: 30 } },
      { properties: { value: 40 } },
      { properties: { value: 50 } },
    ];

    it('debería clasificar por intervalos iguales', () => {
      const classes = classifyFeatures(features as any, 'value', 5, 'equal', 'Azules');
      expect(classes).toHaveLength(5);
      expect(classes?.[0].min).toBe(10);
      expect(classes?.[classes.length - 1].max).toBe(50);
    });

    it('debería clasificar por cuantiles', () => {
      const classes = classifyFeatures(features as any, 'value', 5, 'quantile', 'Azules');
      expect(classes).toHaveLength(5);
    });

    it('debería manejar expresión aritmética', () => {
      const features2 = [
        { properties: { a: 10, b: 2 } },
        { properties: { a: 20, b: 4 } },
      ];
      const classes = classifyFeatures(features2 as any, 'a / b', 2, 'equal', 'Azules');
      expect(classes).toBeDefined();
    });

    it('debería manejar campos no numéricos', () => {
      const features2 = [{ properties: { name: 'A' } }];
      const classes = classifyFeatures(features2 as any, 'name', 5, 'equal', 'Azules');
      // La función convierte strings a 0, así que retorna una clase con valor 0
      expect(classes).toBeDefined();
      expect(classes?.[0].min).toBe(0);
    });
  });

  describe('featureStyle', () => {
    const feature = {
      type: 'Feature' as const,
      geometry: {
        type: 'Point' as const,
        coordinates: [0, 0] as [number, number],
      },
      properties: { tipo: 'A', value: 10 },
    };

    it('debería retornar estilo single por defecto', () => {
      const style = featureStyle(feature, DEFAULT_SYMBOLOGY);
      expect(style.fillColor).toBe(DEFAULT_SYMBOLOGY.fillColor);
      expect(style.color).toBe(DEFAULT_SYMBOLOGY.strokeColor);
    });

    it('debería aplicar estilo categorical', () => {
      const symbology = {
        mode: 'categorical' as const,
        field: 'tipo',
        categories: [{ value: 'A', color: '#ff0000' }],
        fillColor: '#00ff00',
        strokeColor: '#0000ff',
        fillOpacity: 0.5,
        strokeWeight: 2,
      };
      const style = featureStyle(feature, symbology);
      expect(style.fillColor).toBe('#ff0000');
    });

    it('debería usar otherColor para categoría no encontrada', () => {
      const symbology = {
        mode: 'categorical' as const,
        field: 'tipo',
        categories: [{ value: 'B', color: '#ff0000' }],
        otherColor: '#aaaaaa',
        fillColor: '#00ff00',
        strokeColor: '#0000ff',
        fillOpacity: 0.5,
        strokeWeight: 2,
      };
      const style = featureStyle(feature, symbology);
      expect(style.fillColor).toBe('#aaaaaa');
    });
  });
});
