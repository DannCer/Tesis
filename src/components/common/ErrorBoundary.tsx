/**
 * @fileoverview ErrorBoundary reutilizable para capturar errores en el árbol de componentes.
 * Evita que un error en un componente hijo colapse toda la vista.
 * @module components/common/ErrorBoundary
 */

import React, { Component } from 'react';

interface Props {
    children: React.ReactNode;
    /** Componente alternativo a mostrar. Si se omite se usa el fallback por defecto. */
    fallback?: React.ReactNode;
    /** Callback opcional para registrar el error (ej. Sentry). */
    onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo): void {
        console.error('[ErrorBoundary] Error capturado:', error, info.componentStack);
        this.props.onError?.(error, info);
    }

    handleReset = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return <>{this.props.fallback}</>;
            }

            return (
                <div
                    role="alert"
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        minHeight: '200px',
                        padding: '2rem',
                        textAlign: 'center',
                        fontFamily: 'system-ui, sans-serif',
                        color: '#333',
                    }}
                >
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                    <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 600 }}>
                        Ocurrió un error inesperado
                    </h2>
                    {this.state.error && (
                        <p style={{ fontSize: '0.85rem', color: '#666', margin: '0 0 1rem', maxWidth: '420px' }}>
                            {this.state.error.message}
                        </p>
                    )}
                    <button
                        onClick={this.handleReset}
                        style={{
                            padding: '0.5rem 1.25rem',
                            background: '#8d1c3d',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                        }}
                    >
                        Reintentar
                    </button>
                </div>
            );
        }

        return <>{this.props.children}</>;
    }
}

export default ErrorBoundary;
