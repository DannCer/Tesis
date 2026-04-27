import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, process.cwd(), '');

    return {
        plugins: [react()],

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

        server: {
            port: 5173,
            host: '0.0.0.0',
            proxy: {
                // Redirige /api al backend FastAPI en desarrollo.
                // En producción Nginx maneja esto directamente.
                '/api': {
                    target: env.VITE_API_URL ?? 'http://localhost:8000',
                    changeOrigin: true,
                },
            },
        },

        build: {
            sourcemap: false,
            chunkSizeWarningLimit: 800,
        },
    };
});