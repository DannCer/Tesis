import React, { createContext, useReducer, useEffect, ReactNode } from 'react';
import { apiService } from '@services/api/apiService';
import { getToken, setToken, clearTokens } from '@utils/tokenCache';

export interface AuthState {
    isAuthenticated: boolean;
    user: CurrentUser | null;
    loading: boolean;
    error: string | null;
}

export interface CurrentUser {
    id: number;
    username: string;
    email: string;
    nombre_completo: string | null;
    activo: boolean;
    es_admin: boolean;
    creado_en: string;
}

export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
}

type AuthAction =
    | { type: 'LOGIN_START' }
    | { type: 'LOGIN_SUCCESS'; payload: { user: CurrentUser } }
    | { type: 'LOGIN_ERROR'; payload: string }
    | { type: 'LOGOUT' }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_USER'; payload: CurrentUser };

/** @internal exportado solo para tests unitarios */
export const authInitialState: AuthState = {
    isAuthenticated: false,
    user: null,
    loading: true,
    error: null,
};

/** @internal exportado solo para tests unitarios */
export const authReducer = (state: AuthState, action: AuthAction): AuthState => {
    switch (action.type) {
        case 'LOGIN_START':
            return { ...state, loading: true, error: null };
        case 'LOGIN_SUCCESS':
            // Reducer puro: la persistencia en caché la maneja
            // la función login() del provider, que ya escribió los tokens
            // antes de despachar esta acción.
            return {
                ...state,
                isAuthenticated: true,
                user: action.payload.user,
                loading: false,
                error: null,
            };
        case 'LOGIN_ERROR':
            // El provider limpia el caché en el catch de login() si es necesario.
            // El reducer solo actualiza el estado de React.
            return {
                ...state,
                isAuthenticated: false,
                user: null,
                loading: false,
                error: action.payload,
            };
        case 'LOGOUT':
            // La limpieza del caché ocurre en logout() del provider,
            // que llama apiService.auth.logout() antes de despachar esta acción.
            return { ...authInitialState, loading: false };
        case 'SET_LOADING':
            return { ...state, loading: action.payload };
        case 'SET_USER':
            return { ...state, user: action.payload, isAuthenticated: true };
        default:
            return state;
    }
};

interface AuthContextType {
    state: AuthState;
    login: (username: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    refreshToken: () => Promise<void>;
    checkAuth: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, authInitialState);

    useEffect(() => {
        checkAuth();
    }, []);

    const login = async (username: string, password: string) => {
        dispatch({ type: 'LOGIN_START' });
        try {
            const tokens = await apiService.auth.login(username, password);
            // Única escritura de tokens — el reducer no toca el caché.
            await setToken('access',  tokens.access_token);
            await setToken('refresh', tokens.refresh_token);
            const user = await apiService.auth.me();
            dispatch({ type: 'LOGIN_SUCCESS', payload: { user } });
        } catch (error: unknown) {
            // Limpiar tokens si el login falló después de recibirlos
            await clearTokens();
            const message = error instanceof Error ? error.message : 'Error de login';
            dispatch({ type: 'LOGIN_ERROR', payload: message });
            throw error;
        }
    };

    const logout = async () => {
        try {
            const token = await getToken('access');
            if (token) await apiService.auth.logout();
        } catch (error) {
            console.error('Error en logout:', error);
        } finally {
            // Limpieza explícita aquí — el reducer LOGOUT es ahora puro.
            await clearTokens();
            dispatch({ type: 'LOGOUT' });
        }
    };

    const checkAuth = async () => {
        const token = await getToken('access');
        if (!token) {
            dispatch({ type: 'SET_LOADING', payload: false });
            return;
        }

        try {
            const user = await apiService.auth.me();
            dispatch({ type: 'SET_USER', payload: user });
        } catch (error) {
            console.error('Error al verificar auth:', error);
            await clearTokens();
            dispatch({ type: 'LOGOUT' });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    const refreshToken = async () => {
        const refresh = await getToken('refresh');
        if (!refresh) throw new Error('No refresh token');

        try {
            const tokens = await apiService.auth.refresh(refresh);
            await setToken('access', tokens.access_token);
        } catch (error) {
            await clearTokens();
            dispatch({ type: 'LOGOUT' });
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ state, login, logout, refreshToken, checkAuth }}>
            {children}
        </AuthContext.Provider>
    );
};