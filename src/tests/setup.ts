import '@testing-library/jest-dom';
import { vi } from 'vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';

// Mock para leaflet
vi.mock('leaflet', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('leaflet');
  return {
    ...actual,
    default: actual,
    map: vi.fn(),
    tileLayer: vi.fn(),
    marker: vi.fn(),
    circleMarker: vi.fn(),
    geoJSON: vi.fn(),
    CRS: {
      EPSG3857: {
        project: vi.fn((latlng: { lng: number; lat: number }) => ({ x: latlng.lng, y: latlng.lat })),
      },
    },
  };
});

// Mock para react-leaflet
vi.mock('react-leaflet', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-leaflet');
  return {
    ...actual,
    MapContainer: ({ children }: { children: ReactNode }) => createElement('div', null, children),
    TileLayer: () => createElement('div'),
    WMSTileLayer: () => createElement('div'),
    CircleMarker: () => createElement('div'),
    GeoJSON: ({ data }: { data: any }) => createElement('div', { 'data-testid': 'geojson-layer' }, `${data?.features?.length ?? 0} features`),
    useMapEvents: vi.fn(),
    useMap: vi.fn(() => null),
  };
});
