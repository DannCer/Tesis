import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    { ignores: ['dist', 'coverage'] },
    {
        extends: [
            js.configs.recommended,
            ...tseslint.configs.recommended,
        ],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,

            // Avisa si un componente exporta algo que no sea el componente en sí
            'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

            // any desactivado — el proyecto usa GeoJSON y Leaflet con tipos complejos
            '@typescript-eslint/no-explicit-any': 'off',

            // Variables sin usar: ignorar las que empiezan en mayúscula (constantes/tipos)
            // y parámetros que empiezan en _ (convención de "ignorar intencionalmente")
            '@typescript-eslint/no-unused-vars': ['warn', {
                varsIgnorePattern: '^[A-Z_]',
                argsIgnorePattern: '^_',
            }],

            // Desactiva la regla que bloquea console.* en código de producción;
            // el logger de config/env ya lo controla con el flag DEBUG_MODE.
            'no-console': 'off',
        },
    },
);
