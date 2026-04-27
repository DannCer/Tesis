import React, { createContext, useReducer, useEffect, ReactNode } from 'react';
import { apiService } from '@services/api/apiService';

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
    | { type: 'LOGIN_SUCCESS'; payload: { user: CurrentUser; accessToken: string; refreshToken: string } }
    | { type: 'LOGIN_ERROR'; payload: string }
    | { type: 'LOGOUT' }
    | { type: 'SET_LOADING'; payload: boolean }
    | { type: 'SET_USER'; payload: CurrentUser };

const initialState: AuthState = {
    isAuthenticated: false,
    user: null,
    loading: true,
    error: null,
};

const authReducer = (state: AuthState, action: AuthAction): AuthState => {
    switch (action.type) {
        case 'LOGIN_START':
            return { ...state, loading: true, error: null };
        case 'LOGIN_SUCCESS':
            localStorage.setItem('access_token', action.payload.accessToken);
            localStorage.setItem('refresh_token', action.payload.refreshToken);
            return {
                ...state,
                isAuthenticated: true,
                user: action.payload.user,
                loading: false,
                error: null,
            };
        case 'LOGIN_ERROR':
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            return {
                ...state,
                isAuthenticated: false,
                user: null,
                loading: false,
                error: action.payload,
            };
        case 'LOGOUT':
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            return { ...initialState, loading: false };
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
    const [state, dispatch] = useReducer(authReducer, initialState);

    useEffect(() => {
        checkAuth();
    }, []);

    const login = async (username: string, password: string) => {
        dispatch({ type: 'LOGIN_START' });
        try {
            const tokens = await apiService.auth.login(username, password);
            localStorage.setItem('access_token', tokens.access_token);
            localStorage.setItem('refresh_token', tokens.refresh_token);
            const user = await apiService.auth.me();

            dispatch({
                type: 'LOGIN_SUCCESS',
                payload: {
                    user,
                    accessToken: tokens.access_token,
                    refreshToken: tokens.refresh_token,
                },
            });
        } catch (error: any) {
            dispatch({ type: 'LOGIN_ERROR', payload: error.message || 'Error de login' });
            throw error;
        }
    };

    const logout = async () => {
        try {
            const token = localStorage.getItem('access_token');
            if (token) await apiService.auth.logout();
        } catch (error) {
            console.error('Error en logout:', error);
        } finally {
            dispatch({ type: 'LOGOUT' });
        }
    };

    const checkAuth = async () => {
        const token = localStorage.getItem('access_token');
        if (!token) {
            dispatch({ type: 'SET_LOADING', payload: false });
            return;
        }

        try {
            const user = await apiService.auth.me();
            dispatch({ type: 'SET_USER', payload: user });
        } catch (error) {
            console.error('Error al verificar auth:', error);
            dispatch({ type: 'LOGOUT' });
        } finally {
            dispatch({ type: 'SET_LOADING', payload: false });
        }
    };

    const refreshToken = async () => {
        const refresh = localStorage.getItem('refresh_token');
        if (!refresh) throw new Error('No refresh token');

        try {
            const tokens = await apiService.auth.refresh(refresh);
            localStorage.setItem('access_token', tokens.access_token);
        } catch (error) {
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