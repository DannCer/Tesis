import React, { useEffect, useRef, useState } from 'react';
import '../../styles/TimeController.css';

const TIMES = [
  '1985-01-01',
  '1993-01-01',
  '2002-01-01',
  '2007-01-01',
  '2011-01-01',
  '2014-01-01',
  '2018-01-01'
];

export default function TimeController({ currentTime, onChange }) {
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef(null);

  const currentIndex = TIMES.indexOf(currentTime);

  useEffect(() => {
    if (!playing) return;

    intervalRef.current = setInterval(() => {
      onChange(
        TIMES[(currentIndex + 1) % TIMES.length]
      );
    }, 1200);

    return () => clearInterval(intervalRef.current);
  }, [playing, currentIndex, onChange]);

  return (
    <div className="time-controller">
      <button onClick={() => setPlaying(!playing)}>
        {playing ? '⏸' : '▶'}
      </button>

      <input
        type="range"
        min={0}
        max={TIMES.length - 1}
        step={1}
        value={currentIndex}
        onChange={e => onChange(TIMES[e.target.value])}
      />

      <span className="time-label">
        {currentTime.slice(0, 4)}
      </span>
    </div>
  );
}
