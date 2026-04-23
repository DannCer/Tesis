import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/**
 * Extiende la configuración de Vite para que los tests hereden
 * los alias de rutas (@components, @hooks, etc.) sin duplicarlos.
 */
export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            globals: true,
            environment: 'jsdom',
            setupFiles: './src/tests/setup.ts',
            include: ['src/**/*.{test,spec}.{ts,tsx}'],
            coverage: {
                reporter: ['text', 'json', 'html'],
                exclude: ['node_modules/', 'src/tests/'],
            },
        },
    })
);
