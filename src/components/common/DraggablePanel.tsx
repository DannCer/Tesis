/**
 * @fileoverview DraggablePanel — Envuelve cualquier panel flotante y le añade
 * la capacidad de arrastrarse por la pantalla.
 *
 * El arrastre se activa al hacer mousedown sobre cualquier elemento con el
 * atributo `data-drag-handle` dentro del panel.
 *
 * Requiere que el panel interior tenga la clase CSS anulada por
 * `.draggable-panel-host` en MapToolbar.css (position → static).
 *
 * @module components/common/DraggablePanel
 */

import React, { useEffect, useRef } from 'react';
import { useDraggable } from '@hooks/ui/useDraggable';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DraggablePanelProps {
    /** Contenido del panel (el componente de herramienta). */
    children: React.ReactNode;
    /** Controla si el panel está visible (se usa para resetear posición). */
    isOpen: boolean;
    /** Ancho por defecto del panel en px (debe coincidir con el CSS original). */
    defaultWidth: number;
    /** z-index del host. Por defecto 1400. */
    zIndex?: number;
}

// ─── Componente ───────────────────────────────────────────────────────────────

const DraggablePanel: React.FC<DraggablePanelProps> = ({
    children,
    isOpen,
    defaultWidth,
    zIndex = 1400,
}) => {
    const { pos, isDragging, onMouseDown, resetPos } = useDraggable();
    const hostRef = useRef<HTMLDivElement>(null);

    // Resetear posición cada vez que el panel se abre (UX: aparece centrado)
    useEffect(() => {
        if (isOpen) resetPos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // ── Estilo dinámico del host ─────────────────────────────────────────────
    const hostStyle: React.CSSProperties = pos
        ? {
            // Posición arrastrada: coords absolutas
            position:  'fixed',
            left:       pos.x,
            top:        pos.y,
            bottom:    'auto',
            transform: 'none',
            width:      defaultWidth,
            maxWidth:  'calc(100vw - 2rem)',
            zIndex,
        }
        : {
            // Posición por defecto: centrado sobre la toolbar (igual que los paneles originales)
            position:  'fixed',
            bottom:    '7rem',
            left:      '50%',
            transform: 'translateX(-50%)',
            width:      defaultWidth,
            maxWidth:  'calc(100vw - 2rem)',
            zIndex,
            // Ocultar cuando no está abierto (evita bloquear interacciones)
            ...(isOpen ? {} : { pointerEvents: 'none' as const, visibility: 'hidden' as const }),
        };

    return (
        <div
            ref={hostRef}
            className={`draggable-panel-host${isDragging ? ' draggable-panel-host--dragging' : ''}`}
            style={hostStyle}
            onMouseDown={onMouseDown}
            data-draggable-host
        >
            {children}
        </div>
    );
};

export default DraggablePanel;