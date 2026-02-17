---
description: Repository Information Overview
alwaysApply: true
---

# geovisor_tesis Information

## Summary
Geovisor Tesis is a web-based GIS dashboard built with React and Leaflet for monitoring land use and vegetation changes (USV). It integrates with GeoServer to visualize and query complex temporal raster series and vector geographic data, providing a professional interface for spatial analysis.

## Structure
- **src/components**: Contains React components, including a specialized `map/` directory for Leaflet integrations (MapView, LayerMenu, Legend, PixelInfoPanel).
- **src/services**: Core logic for interacting with GeoServer via WFS (Vector) and WMS (Raster) protocols.
- **src/hooks**: Custom React hooks for managing state and side effects of geographic data fetching.
- **src/config**: Centralized configuration for environment variables, server URLs, and layer definitions.
- **src/styles**: Modular CSS for the geovisor's professional UI.
- **public/img**: Static assets for the application.

## Language & Runtime
**Language**: TypeScript  
**Version**: ^5.9.3  
**Build System**: Vite ^7.2.4  
**Package Manager**: npm

## Dependencies
**Main Dependencies**:
- `react` (^19.2.0): UI framework.
- `leaflet` (^1.9.4): Mapping library.
- `react-leaflet` (^5.0.0): React components for Leaflet.
- `react-router-dom` (^7.12.0): Routing.
- `bootstrap` (^5.3.8): Base styling framework.

**Development Dependencies**:
- `typescript` (^5.9.3)
- `vite` (^7.2.4)
- `eslint` (^9.39.1)

## Build & Installation
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Typecheck and Lint
npm run typecheck
npm run lint
```

## Main Files & Resources
- **Entry Point**: `src/main.tsx`
- **Main Page**: `src/pages/Principal.tsx`
- **Map Controller**: `src/components/map/MapView.tsx`
- **Layer Config**: `src/config/layers.ts`
- **GeoServer Services**: `src/services/wfsService.ts`, `src/services/rasterService.ts`

## Testing
**Framework**: No dedicated testing framework currently configured.
**Validation**:
- `npm run typecheck`: Uses `tsc` for static type analysis.
- `npm run lint`: Uses `eslint` for code style and quality enforcement.

## Project Architecture
The project follows a modular service-oriented architecture. Geographic interaction is abstracted into singleton services (`wfsService`, `rasterService`), while state management is handled via custom hooks (`useWFSLayers`, `useRasterLayers`). A "Single Source of Truth" approach is used for layer configuration in `layers.ts`. The map rendering is optimized using Canvas for large vector datasets. Dynamic interaction includes fetching layer extents directly from GeoServer `GetCapabilities` metadata for both WFS and WMS services.
