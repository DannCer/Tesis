# Repository Guidelines

Geovisor CDMX is a geospatial web viewer for Mexico City territorial data, built with **React 19**, **TypeScript**, **Vite 7**, and **Leaflet**, integrated with **QGIS Server**.

## Project Structure & Module Organization

The application follows a standard React project structure with specialized modules for geospatial functionality:

- **`src/config/`**: Centralized configuration. `layersConfig.ts` defines the registry for vector and raster layers.
- **`src/services/`**: Data fetching logic for OGC services (WMS/WFS).
- **`src/hooks/`**: Specialized React hooks for managing map layers (`useWFSLayers.ts`, `useRasterLayers.ts`).
- **`src/utils/`**: Core geospatial utilities including symbology generation, style factories, and file format conversion (GeoJSON, GeoTIFF).
- **`src/components/map/`**: Encapsulates Leaflet-specific components and UI controls for the geovisor.

## Build, Test, and Development Commands

The project uses `npm` for dependency management and `vite` for the build pipeline.

- **Development**: `npm run dev` (starts HMR server on host)
- **Build**: `npm run build` (production build to `dist/`)
- **Type Check**: `npm run typecheck` (runs `tsc --noEmit`)
- **Lint**: `npm run lint` (runs ESLint)
- **Preview**: `npm run preview` (serves production build)
- **Test**: `npm test` (runs Vitest in watch mode)
- **Single Test**: `npx vitest <path/to/file>`
- **Coverage**: `npm run test:coverage`

## Coding Style & Naming Conventions

Enforced via **ESLint** and **TypeScript**:

- **Strict Types**: Use TypeScript for all components and utilities.
- **Variable Naming**: `varsIgnorePattern: '^[A-Z_]'` (allows Uppercase/Underscore for specific variables) and `argsIgnorePattern: '^_'` for unused parameters.
- **React Components**: Prefer functional components and hooks. `react-refresh/only-export-components` is enforced.
- **Layer Configuration**: When adding layers, ensure `wfsName` and `wmsLayer` match QGIS Server GetCapabilities exactly.

## Testing Guidelines

The project uses **Vitest** for unit testing and **React Testing Library** for component testing.

- **Location**: Tests are located in `src/tests/`.
- **Environment**: Configured with `jsdom` for browser API simulation.

## Commit Guidelines

The project follows a informal commit convention, typically using descriptive Spanish verbs (e.g., "Actualización", "Merge branch"). Pull requests are used for feature integration (e.g., `Home`, `laptop` branches).
