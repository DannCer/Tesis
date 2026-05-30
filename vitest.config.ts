import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Configuración de Vitest con alias de rutas duplicados desde vite.config.ts.
 * No se puede usar mergeConfig cuando vite.config exporta una función callback,
 * por lo que los alias se declaran directamente aquí.
 */
export default defineConfig({
    resolve: {
        alias: {
            '@':           path.resolve(__dirname, './src'),
            '@components': path.resolve(__dirname, './src/components'),
            '@hooks':      path.resolve(__dirname, './src/hooks'),
            '@services':   path.resolve(__dirname, './src/services'),
            '@contexts':   path.resolve(__dirname, './src/contexts'),
            '@types':      path.resolve(__dirname, './src/types'),
            '@utils':      path.resolve(__dirname, './src/utils'),
            '@config':     path.resolve(__dirname, './src/config'),
            '@pages':      path.resolve(__dirname, './src/pages'),
            '@styles':     path.resolve(__dirname, './src/styles'),
            '@assets':     path.resolve(__dirname, './src/assets'),
        },
    },
    test: {
        globals:     true,
        environment: 'jsdom',
        setupFiles:  './src/tests/setup.ts',
        include:     ['src/**/*.{test,spec}.{ts,tsx}'],
        coverage: {
            reporter: ['text', 'json', 'html'],
            exclude:  ['node_modules/', 'src/tests/'],
        },
    },
});
