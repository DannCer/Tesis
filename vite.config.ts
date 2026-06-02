/**
 * vite.config.ts — Configuración Vite optimizada para Geovisor CDMX
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import compression from 'vite-plugin-compression2';
import path from 'path';

export default defineConfig({
    plugins: [
        react(),

        // Compresión Brotli y Gzip
        compression({ algorithm: 'brotliCompress', ext: '.br', threshold: 1024 }),
        compression({ algorithm: 'gzip', ext: '.gz', threshold: 1024 }),
    ],

    resolve: {
        alias: {
            '@components': path.resolve(__dirname, 'src/components'),
            '@config': path.resolve(__dirname, 'src/config'),
            '@contexts': path.resolve(__dirname, 'src/contexts'),
            '@hooks': path.resolve(__dirname, 'src/hooks'),
            '@services': path.resolve(__dirname, 'src/services'),
            '@utils': path.resolve(__dirname, 'src/utils'),
            '@types': path.resolve(__dirname, 'src/types'),
            '@styles': path.resolve(__dirname, 'src/styles'),
            '@assets': path.resolve(__dirname, 'src/assets'),
            '@pages': path.resolve(__dirname, 'src/pages'),
        },
    },

    build: {
        target: 'es2020',
        sourcemap: false,
        chunkSizeWarningLimit: 800,

        rollupOptions: {
            output: {
                // ── Code splitting inteligente ────────────────────────────
                manualChunks(id) {
                    if (id.includes('node_modules/react') ||
                        id.includes('node_modules/react-dom') ||
                        id.includes('node_modules/react-router-dom')) {
                        return 'vendor-react';
                    }

                    if (id.includes('node_modules/leaflet') ||
                        id.includes('node_modules/react-leaflet')) {
                        return 'vendor-leaflet';
                    }

                    if (id.includes('node_modules/georaster')) {
                        return 'vendor-georaster';
                    }

                    if (id.includes('node_modules/@mapbox/shp-write') ||
                        id.includes('node_modules/shpjs')) {
                        return 'vendor-shapefile';
                    }

                    if (id.includes('node_modules/bootstrap')) {
                        return 'vendor-bootstrap';
                    }
                },

                entryFileNames: 'assets/[name]-[hash].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },

    server: {
        host: true,
        port: 5173,
        proxy: {
            '/qgis': {
                target: 'http://192.168.100.184',
                changeOrigin: true,
                timeout: 120_000,
            },
            '/api': {
                target: 'http://192.168.100.184:8000',
                changeOrigin: true,
                timeout: 30_000,
            },
        },
    },
});