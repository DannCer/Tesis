/**
 * @fileoverview Modal de alerta/notificación con estilo coherente al proyecto
 * @module components/common/AlertModal
 */

import React, { useEffect } from 'react';
import '@styles/ConfirmModal.css';

export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

interface AlertModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    variant?: AlertVariant;
    closeText?: string;
    onClose: () => void;
}

const VARIANT_ICONS: Record<AlertVariant, string> = {
    error:   '❌',
    warning: '⚠️',
    success: '✅',
    info:    'ℹ️',
};

const AlertModal: React.FC<AlertModalProps> = ({
    isOpen,
    title,
    message,
    variant = 'error',
    closeText = 'Aceptar',
    onClose,
}) => {
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="confirm-modal-overlay" onClick={onClose}>
            <div
                className="confirm-modal"
                onClick={e => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="alert-modal-title"
            >
                <div className="modal-header">
                    <div className="modal-icon">{VARIANT_ICONS[variant]}</div>
                    <h3 id="alert-modal-title" className="modal-title">{title}</h3>
                </div>
                <div className="modal-body">
                    <p className="modal-message">{message}</p>
                </div>
                <div className="modal-footer">
                    <button
                        className={`btn btn-${variant === 'error' ? 'danger' : variant === 'warning' ? 'warning' : 'primary'}`}
                        onClick={onClose}
                        autoFocus
                    >
                        {closeText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AlertModal;
