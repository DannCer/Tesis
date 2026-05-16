/**
 * @fileoverview useDraggable — Hook para paneles flotantes arrastrables.
 * @module hooks/ui/useDraggable
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragPosition {
    x: number;
    y: number;
}

export interface UseDraggableReturn {
    pos:          DragPosition | null;
    isDragging:   boolean;
    onMouseDown:  (e: React.MouseEvent<HTMLElement>) => void;
    resetPos:     () => void;
}

/**
 * Gestiona la posición arrastrable de un panel flotante.
 *
 * Uso:
 *   const { pos, isDragging, onMouseDown } = useDraggable();
 *
 * Adjunta `onMouseDown` al elemento que sirve de «asa» de arrastre.
 * Cuando `pos === null`, el panel usa su posición CSS por defecto.
 * Tras el primer arrastre, `pos` contiene la posición absoluta en px.
 */
export function useDraggable(): UseDraggableReturn {
    const [pos,        setPos]        = useState<DragPosition | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // Ref sincronizado con pos para evitar stale closure en handlers de window
    const posRef = useRef<DragPosition | null>(null);
    useEffect(() => { posRef.current = pos; }, [pos]);

    const resetPos = useCallback(() => setPos(null), []);

    const onMouseDown = useCallback((e: React.MouseEvent<HTMLElement>) => {
        // Solo botón primario
        if (e.button !== 0) return;

        // No iniciar arrastre si el clic es sobre un elemento interactivo
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, textarea, a, [role="button"]')) return;

        e.preventDefault();

        // Obtener posición inicial del panel desde getBoundingClientRect
        // si aún no se ha arrastrado (pos === null)
        const hostEl = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-draggable-host]');
        const rect   = hostEl?.getBoundingClientRect();

        const startPos: DragPosition = posRef.current ?? (
            rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 }
        );
        const startMouse = { x: e.clientX, y: e.clientY };

        document.body.style.userSelect = 'none';
        document.body.style.cursor     = 'grabbing';
        setIsDragging(true);

        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startMouse.x;
            const dy = ev.clientY - startMouse.y;

            // Clamp para que el panel no salga de la ventana
            const newX = Math.max(0, Math.min(window.innerWidth  - 80, startPos.x + dx));
            const newY = Math.max(0, Math.min(window.innerHeight - 40, startPos.y + dy));

            setPos({ x: newX, y: newY });
        };

        const onUp = () => {
            document.body.style.userSelect = '';
            document.body.style.cursor     = '';
            setIsDragging(false);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup',   onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
    }, []);

    return { pos, isDragging, onMouseDown, resetPos };
}