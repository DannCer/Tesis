/**
 * @fileoverview Controlador de tiempo para series ráster.
 *
 * Optimizaciones:
 *  - Intervalo de animación: `1200` → `TIME_CONTROLLER_INTERVAL_MS` de constants.ts
 *  - memo() — no tiene estado compartido con el mapa; sólo emite eventos.
 *  - useCallback en onChange para evitar re-suscripciones en el useEffect.
 *
 * @module components/map/controls/TimeController
 */

import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { TIME_CONTROLLER_INTERVAL_MS } from '@config/constants';
import '@styles/TimeController.css';

// Las fechas de las series USV publicadas en QGIS Server.
// Si se agregan nuevas series, añadirlas aquí.
const TIMES = [
    '1985-01-01',
    '1993-01-01',
    '2002-01-01',
    '2007-01-01',
    '2011-01-01',
    '2014-01-01',
    '2018-01-01',
] as const;

interface TimeControllerProps {
    currentTime: string;
    onChange:    (time: string) => void;
}

const TimeController = memo<TimeControllerProps>(({ currentTime, onChange }) => {
    const [playing,  setPlaying]  = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentIndex = TIMES.indexOf(currentTime as typeof TIMES[number]);

    const advance = useCallback(() => {
        onChange(TIMES[(currentIndex + 1) % TIMES.length]);
    }, [currentIndex, onChange]);

    useEffect(() => {
        if (!playing) return;
        intervalRef.current = setInterval(advance, TIME_CONTROLLER_INTERVAL_MS); // ← antes 1200
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [playing, advance]);

    return (
        <div className="time-controller">
            <button
                onClick={() => setPlaying(p => !p)}
                aria-label={playing ? 'Pausar reproducción' : 'Reproducir animación temporal'}
                title={playing ? 'Pausar' : 'Reproducir'}
            >
                {playing ? '⏸' : '▶'}
            </button>

            <input
                type="range"
                min={0}
                max={TIMES.length - 1}
                step={1}
                value={currentIndex === -1 ? 0 : currentIndex}
                onChange={e => onChange(TIMES[parseInt(e.target.value)])}
                aria-label="Seleccionar año"
            />

            <span className="time-label" aria-live="polite">
                {currentTime.slice(0, 4)}
            </span>
        </div>
    );
});

TimeController.displayName = 'TimeController';

export default TimeController;