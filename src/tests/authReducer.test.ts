/**
 * @fileoverview Tests para authReducer.
 *
 * Verifica que el reducer sea PURO — ningún test debe producir side-effects
 * en localStorage. Si algún `it` falla por escribir en localStorage, significa
 * que regresó un efecto secundario al reducer.
 *
 * @module tests/authReducer
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ─── Mock mínimo de contextos que AuthContext importa ─────────────────────────
vi.mock('../services/api/apiService', () => ({
    apiService: {
        auth: {
            login:   vi.fn(),
            me:      vi.fn(),
            logout:  vi.fn(),
            refresh: vi.fn(),
        },
    },
}));

vi.mock('../config/env', () => ({
    config: { api: { baseUrl: 'http://localhost' } },
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { authReducer, authInitialState } from '../contexts/AuthContext';
import type { AuthState } from '../contexts/AuthContext';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const mockUser = {
    id:              1,
    username:        'testuser',
    email:           'test@example.com',
    nombre_completo: 'Test User',
    activo:          true,
    es_admin:        false,
    creado_en:       '2024-01-01T00:00:00Z',
};

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('authReducer — pureza y corrección', () => {

    // Espía de localStorage para detectar efectos secundarios en el reducer
    const localStorageSpy = {
        setItem:    vi.spyOn(Storage.prototype, 'setItem'),
        removeItem: vi.spyOn(Storage.prototype, 'removeItem'),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Si cualquier acción del reducer toca localStorage, el test falla aquí
        expect(localStorageSpy.setItem,    'reducer no debe escribir en localStorage')
            .not.toHaveBeenCalled();
        expect(localStorageSpy.removeItem, 'reducer no debe borrar de localStorage')
            .not.toHaveBeenCalled();
    });

    // ── Estado inicial ────────────────────────────────────────────────────────

    it('estado inicial es correcto', () => {
        expect(authInitialState).toMatchObject({
            isAuthenticated: false,
            user:            null,
            loading:         true,
            error:           null,
        });
    });

    it('acción desconocida devuelve el estado sin cambios', () => {
        // @ts-expect-error — probando acción inválida
        const next = authReducer(authInitialState, { type: 'UNKNOWN_ACTION' });
        expect(next).toBe(authInitialState);
    });

    // ── LOGIN_START ───────────────────────────────────────────────────────────

    it('LOGIN_START pone loading=true y limpia error', () => {
        const state: AuthState = { ...authInitialState, error: 'prev error', loading: false };
        const next = authReducer(state, { type: 'LOGIN_START' });
        expect(next.loading).toBe(true);
        expect(next.error).toBeNull();
        // inmutabilidad — no muta el estado original
        expect(state.loading).toBe(false);
    });

    // ── LOGIN_SUCCESS ─────────────────────────────────────────────────────────

    it('LOGIN_SUCCESS autentica al usuario y limpia error', () => {
        const state: AuthState = { ...authInitialState, loading: true };
        const next = authReducer(state, {
            type: 'LOGIN_SUCCESS',
            payload: { user: mockUser },
        });
        expect(next.isAuthenticated).toBe(true);
        expect(next.user).toEqual(mockUser);
        expect(next.loading).toBe(false);
        expect(next.error).toBeNull();
    });

    it('LOGIN_SUCCESS NO toca localStorage (reducer puro)', () => {
        authReducer(authInitialState, { type: 'LOGIN_SUCCESS', payload: { user: mockUser } });
        // afterEach verifica la ausencia de llamadas a localStorage
    });

    // ── LOGIN_ERROR ───────────────────────────────────────────────────────────

    it('LOGIN_ERROR guarda el mensaje y deja isAuthenticated=false', () => {
        const state: AuthState = { ...authInitialState, loading: true };
        const next = authReducer(state, { type: 'LOGIN_ERROR', payload: 'Credenciales inválidas' });
        expect(next.isAuthenticated).toBe(false);
        expect(next.user).toBeNull();
        expect(next.loading).toBe(false);
        expect(next.error).toBe('Credenciales inválidas');
    });

    it('LOGIN_ERROR NO toca localStorage (reducer puro)', () => {
        authReducer(authInitialState, { type: 'LOGIN_ERROR', payload: 'err' });
    });

    // ── LOGOUT ────────────────────────────────────────────────────────────────

    it('LOGOUT resetea al estado inicial con loading=false', () => {
        const authenticated: AuthState = {
            isAuthenticated: true,
            user:            mockUser,
            loading:         false,
            error:           null,
        };
        const next = authReducer(authenticated, { type: 'LOGOUT' });
        expect(next.isAuthenticated).toBe(false);
        expect(next.user).toBeNull();
        expect(next.loading).toBe(false);
        expect(next.error).toBeNull();
    });

    it('LOGOUT NO toca localStorage (reducer puro)', () => {
        authReducer(authInitialState, { type: 'LOGOUT' });
    });

    // ── SET_LOADING ───────────────────────────────────────────────────────────

    it('SET_LOADING actualiza solo loading', () => {
        const next = authReducer(authInitialState, { type: 'SET_LOADING', payload: false });
        expect(next.loading).toBe(false);
        expect(next.isAuthenticated).toBe(authInitialState.isAuthenticated);
    });

    // ── SET_USER ──────────────────────────────────────────────────────────────

    it('SET_USER actualiza user e isAuthenticated', () => {
        const next = authReducer(authInitialState, { type: 'SET_USER', payload: mockUser });
        expect(next.user).toEqual(mockUser);
        expect(next.isAuthenticated).toBe(true);
    });

    // ── Inmutabilidad ─────────────────────────────────────────────────────────

    it('el reducer no muta el estado original en ninguna acción', () => {
        const original = { ...authInitialState };
        authReducer(authInitialState, { type: 'LOGIN_START' });
        authReducer(authInitialState, { type: 'LOGIN_SUCCESS', payload: { user: mockUser } });
        authReducer(authInitialState, { type: 'LOGIN_ERROR', payload: 'err' });
        authReducer(authInitialState, { type: 'LOGOUT' });
        expect(authInitialState).toEqual(original);
    });
});
