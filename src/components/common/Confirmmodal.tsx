/**
 * @fileoverview Modal de confirmación personalizado con estilo acorde a la aplicación
 * @module components/common/ConfirmModal
 */

import React, { useEffect } from 'react';
import '@styles/ConfirmModal.css';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: 'danger' | 'warning' | 'primary' | 'success' | 'info';
    onConfirm: () => void;
    onCancel: () => void;
    icon?: string;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirmar',
    cancelText = 'Cancelar',
    confirmVariant = 'danger',
    onConfirm,
    onCancel,
    icon = '⚠️'
}) => {
    // Cerrar con la tecla Escape
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onCancel();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Prevenir scroll del body cuando el modal está abierto
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return (
        <div className="confirm-modal-overlay" onClick={onCancel}>
            <div 
                className="confirm-modal" 
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
            >
                <div className="modal-header">
                    <div className="modal-icon">{icon}</div>
                    <h3 id="modal-title" className="modal-title">{title}</h3>
                </div>
                
                <div className="modal-body">
                    <p className="modal-message">{message}</p>
                </div>
                
                <div className="modal-footer">
                    <button 
                        className="btn btn-secondary"
                        onClick={onCancel}
                        autoFocus
                    >
                        {cancelText}
                    </button>
                    <button 
                        className={`btn btn-${confirmVariant}`}
                        onClick={() => {
                            onConfirm();
                            onCancel();
                        }}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;