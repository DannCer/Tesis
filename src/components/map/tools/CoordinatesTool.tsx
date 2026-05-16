/**
 * @fileoverview CoordinatesTool — Panel flotante para ubicar coordenadas en el mapa.
 *
 * Modos soportados:
 *  - Geográficas (DMS): Grados, Minutos, Segundos con dirección N/S/E/O
 *  - Decimales:         Longitud / Latitud en grados decimales
 *  - UTM:               Este (E), Norte (N) y Zona UTM (11N–16N)
 *
 * Al hacer clic en "Ubicar" vuela al punto, coloca un marcador pulsante
 * y abre un popup con las coordenadas. "Nuevo" limpia el marcador y el formulario.
 *
 * @module components/map/tools/CoordinatesTool
 */

import React, {
    useState, useCallback, useRef, useEffect, useMemo,
} from 'react';
import L from 'leaflet';
import '@styles/CoordinatesTool.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type CoordMode = 'geograficas' | 'decimales' | 'utm';

interface CoordinatesToolProps {
    mapInstance: L.Map | null;
    isOpen: boolean;
    onClose: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Zonas UTM disponibles para México */
const UTM_ZONES = ['11N', '12N', '13N', '14N', '15N', '16N'] as const;
type UtmZone = typeof UTM_ZONES[number];

/** Número de zona a partir del string (e.g. "14N" → 14) */
const zoneNumber = (z: UtmZone): number => parseInt(z, 10);

/** Rango de longitud (X) según zona UTM */
const utmXRange = (z: UtmZone) => {
    const n = zoneNumber(z);
    return { min: (n - 1) * 6 * 100_000, max: n * 6 * 100_000 };
};

/** Rango Y para México (zona norte aprox. 14°N–32°N → 1 550 000 – 3 500 000 m) */
const UTM_Y_RANGE = { min: 1_550_000, max: 3_550_000 };

// ─── Conversor UTM → LatLng ───────────────────────────────────────────────────
// Algoritmo de Karney simplificado (elipsoide WGS-84)

function utmToLatLng(easting: number, northing: number, zone: UtmZone): L.LatLng {
    const zoneNum = zoneNumber(zone);
    const k0 = 0.9996;
    const a  = 6_378_137;
    const e  = 0.0818191908426215;
    const e1sq = 0.006739496742;

    const x = easting  - 500_000;
    const y = northing; // Hemisferio Norte

    const M  = y / k0;
    const mu = M / (a * (1 - (e**2)/4 - 3*(e**4)/64 - 5*(e**6)/256));

    const e1    = (1 - Math.sqrt(1 - e**2)) / (1 + Math.sqrt(1 - e**2));
    const phi1  = mu
        + (3*e1/2 - 27*e1**3/32) * Math.sin(2*mu)
        + (21*e1**2/16 - 55*e1**4/32) * Math.sin(4*mu)
        + (151*e1**3/96) * Math.sin(6*mu)
        + (1097*e1**4/512) * Math.sin(8*mu);

    const N1 = a / Math.sqrt(1 - (e*Math.sin(phi1))**2);
    const T1 = Math.tan(phi1)**2;
    const C1 = e1sq * Math.cos(phi1)**2;
    const R1 = a * (1 - e**2) / Math.pow(1 - (e*Math.sin(phi1))**2, 1.5);
    const D  = x / (N1 * k0);

    const lat = phi1
        - (N1 * Math.tan(phi1) / R1) * (
            D**2/2
            - (5 + 3*T1 + 10*C1 - 4*C1**2 - 9*e1sq) * D**4 / 24
            + (61 + 90*T1 + 298*C1 + 45*T1**2 - 252*e1sq - 3*C1**2) * D**6 / 720
        );

    const lon = (
        D
        - (1 + 2*T1 + C1) * D**3 / 6
        + (5 - 2*C1 + 28*T1 - 3*C1**2 + 8*e1sq + 24*T1**2) * D**5 / 120
    ) / Math.cos(phi1);

    const lonDeg = lon * (180 / Math.PI) + (zoneNum * 6 - 183);
    const latDeg = lat * (180 / Math.PI);

    return L.latLng(latDeg, lonDeg);
}

// ─── Estado inicial de los formularios ────────────────────────────────────────

interface DmsState { deg: string; min: string; sec: string; }
const emptyDms = (): DmsState => ({ deg: '', min: '', sec: '' });

// ─── Componente principal ─────────────────────────────────────────────────────

const CoordinatesTool: React.FC<CoordinatesToolProps> = ({
    mapInstance,
    isOpen,
    onClose,
}) => {
    const [mode, setMode] = useState<CoordMode>('geograficas');
    const [error, setError] = useState<string>('');

    /* — Modo Geográficas DMS — */
    const [xDms, setXDms] = useState<DmsState>(emptyDms()); // Longitud (X)
    const [yDms, setYDms] = useState<DmsState>(emptyDms()); // Latitud  (Y)

    /* — Modo Decimales — */
    const [xDec, setXDec] = useState(''); // Longitud (X), rango -117 a -86
    const [yDec, setYDec] = useState(''); // Latitud  (Y), rango  14 a  32

    /* — Modo UTM — */
    const [utmE, setUtmE] = useState('');
    const [utmN, setUtmN] = useState('');
    const [utmZone, setUtmZone] = useState<UtmZone>('14N');

    /* Marcador activo en el mapa */
    const markerRef = useRef<L.Marker | null>(null);

    /* Limpiar marcador al cerrar */
    useEffect(() => {
        if (!isOpen) clearMarker();
    }, [isOpen]);

    const clearMarker = useCallback(() => {
        if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
        }
    }, []);

    /* Icono SVG tipo pin institucional con anillo pulsante */
    const pinIcon = useMemo(() => L.divIcon({
        className: '',
        html: [
            '<div class="ct-pin-wrapper">',
            '  <div class="ct-pin-ring"></div>',
            '  <svg class="ct-pin-svg" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">',
            '    <path d="M16 2C9.373 2 4 7.373 4 14c0 9 12 26 12 26S28 23 28 14C28 7.373 22.627 2 16 2z"',
            '      fill="#691B31" stroke="#fff" stroke-width="1.5"/>',
            '    <circle cx="16" cy="14" r="5" fill="#fff" opacity="0.9"/>',
            '  </svg>',
            '</div>',
        ].join(''),
        iconSize:    [32, 42],
        iconAnchor:  [16, 42],
        popupAnchor: [0, -44],
    }), []);

    /* Coloca marcador SVG y vuela; abre popup al terminar */
    const flyToPoint = useCallback((latlng: L.LatLng, label: string) => {
        if (!mapInstance) return;
        clearMarker();

        const marker = L.marker(latlng, { icon: pinIcon })
            .addTo(mapInstance)
            .bindPopup(
                '<div style="font-family:monospace;font-size:0.8rem;line-height:1.6;color:#2d3748">' + label + '</div>',
                { maxWidth: 240, offset: L.point(0, -4) }
            );

        markerRef.current = marker;

        mapInstance.flyTo(latlng, Math.max(mapInstance.getZoom(), 14), {
            duration: 1.2,
            easeLinearity: 0.35,
        });

        mapInstance.once('moveend', () => { marker.openPopup(); });
    }, [mapInstance, clearMarker, pinIcon]);

    /* — Parsear y ubicar — */
    const handleUbicar = useCallback(() => {
        setError('');

        try {
            if (mode === 'geograficas') {
                const xd = parseFloat(xDms.deg || '0');
                const xm = parseFloat(xDms.min || '0');
                const xs = parseFloat(xDms.sec || '0');
                const yd = parseFloat(yDms.deg || '0');
                const ym = parseFloat(yDms.min || '0');
                const ys = parseFloat(yDms.sec || '0');

                if ([xd, xm, xs, yd, ym, ys].some(Number.isNaN))
                    throw new Error('Ingresa valores numéricos válidos.');

                const lon = -(xd + xm / 60 + xs / 3600); // Oeste negativo
                const lat =   yd + ym / 60 + ys / 3600;  // Norte positivo

                if (lon < -117 || lon > -86) throw new Error('Longitud fuera del rango (Rango X 0 a 117°).');
                if (lat < 14   || lat > 32)  throw new Error('Latitud fuera del rango (Rango Y 0 a 32°).');

                flyToPoint(
                    L.latLng(lat, lon),
                    `${xd}° ${xm}' ${xs}" O<br>${yd}° ${ym}' ${ys}" N`,
                );

            } else if (mode === 'decimales') {
                const lon = parseFloat(xDec);
                const lat = parseFloat(yDec);

                if (Number.isNaN(lon) || Number.isNaN(lat))
                    throw new Error('Ingresa coordenadas decimales válidas.');

                if (lon < -117 || lon > -86) throw new Error('Longitud fuera del rango (-117 a -86).');
                if (lat <  14  || lat >  32) throw new Error('Latitud fuera del rango (14 a 32).');

                flyToPoint(
                    L.latLng(lat, lon),
                    `Lon: ${lon.toFixed(6)}<br>Lat: ${lat.toFixed(6)}`,
                );

            } else {
                // UTM
                const e = parseFloat(utmE);
                const n = parseFloat(utmN);

                if (Number.isNaN(e) || Number.isNaN(n))
                    throw new Error('Ingresa valores UTM válidos.');

                if (n < UTM_Y_RANGE.min || n > UTM_Y_RANGE.max)
                    throw new Error(`Norte fuera de rango (${UTM_Y_RANGE.min.toLocaleString()} – ${UTM_Y_RANGE.max.toLocaleString()}).`);

                const latlng = utmToLatLng(e, n, utmZone);

                if (latlng.lng < -120 || latlng.lng > -84)
                    throw new Error('Coordenadas fuera del área de México.');

                flyToPoint(
                    latlng,
                    `E: ${e.toLocaleString()}<br>N: ${n.toLocaleString()}<br>Zona: ${utmZone}`,
                );
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al procesar coordenadas.');
        }
    }, [mode, xDms, yDms, xDec, yDec, utmE, utmN, utmZone, flyToPoint]);

    /* — Nuevo: limpiar todo — */
    const handleNuevo = useCallback(() => {
        setError('');
        setXDms(emptyDms()); setYDms(emptyDms());
        setXDec(''); setYDec('');
        setUtmE(''); setUtmN('');
        clearMarker();
    }, [clearMarker]);

    /* — Cambio de modo — */
    const handleModeChange = useCallback((m: CoordMode) => {
        setMode(m);
        setError('');
    }, []);

    /* Rango X/Y dinámico según zona UTM */
    const utmXr = useMemo(() => utmXRange(utmZone), [utmZone]);

    if (!isOpen) return null;

    /* ── Helpers de input DMS ── */
    const dmsField = (
        val: DmsState,
        set: React.Dispatch<React.SetStateAction<DmsState>>,
        sym: string,
        dir: string,
        max: number,
    ) => (
        <div className="ct-dms-group">
            <input
                className="ct-dms-input"
                type="number"
                min={0}
                max={max}
                placeholder="0"
                value={val.deg}
                onChange={e => set(p => ({ ...p, deg: e.target.value }))}
                aria-label={`Grados ${dir}`}
            />
            <span className="ct-dms-sym">°</span>
            <input
                className="ct-dms-input"
                type="number"
                min={0}
                max={59}
                placeholder="0"
                value={val.min}
                onChange={e => set(p => ({ ...p, min: e.target.value }))}
                aria-label={`Minutos ${dir}`}
            />
            <span className="ct-dms-sym">'</span>
            <input
                className="ct-dms-input"
                type="number"
                min={0}
                max={59.999}
                step={0.001}
                placeholder="0"
                value={val.sec}
                onChange={e => set(p => ({ ...p, sec: e.target.value }))}
                aria-label={`Segundos ${dir}`}
            />
            <span className="ct-dms-sym">"</span>
            <span className="ct-dms-dir">{sym}</span>
        </div>
    );

    return (
        <div className="ct-panel" role="dialog" aria-label="Coordenadas" aria-modal="false">

            {/* ── Header ── */}
            <div className="ct-header" data-drag-handle>
                <span className="ct-header-icon">📍</span>
                <span className="ct-header-title">Coordenadas</span>
                <button className="ct-close-btn" onClick={onClose} title="Cerrar" aria-label="Cerrar panel">
                    ✕
                </button>
            </div>

            {/* ── Tabs de modo ── */}
            <div className="ct-tabs" role="tablist">
                {(['geograficas', 'decimales', 'utm'] as CoordMode[]).map(m => (
                    <button
                        key={m}
                        role="tab"
                        aria-selected={mode === m}
                        className={`ct-tab${mode === m ? ' ct-tab--active' : ''}`}
                        onClick={() => handleModeChange(m)}
                    >
                        {m === 'geograficas' ? 'Geográficas' : m === 'decimales' ? 'Decimales' : 'UTM'}
                    </button>
                ))}
            </div>

            {/* ── Cuerpo ── */}
            <div className="ct-body">

                {/* — Geográficas DMS — */}
                {mode === 'geograficas' && (
                    <>
                        <div className="ct-fields">
                            <div className="ct-row">
                                <span className="ct-row-label">X</span>
                                {dmsField(xDms, setXDms, 'Oeste', 'Longitud', 117)}
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">Y</span>
                                {dmsField(yDms, setYDms, 'Norte', 'Latitud', 32)}
                            </div>
                        </div>
                        <div className="ct-ranges">
                            <span className="ct-range-item">Rango X  0 a 117°</span>
                            <span className="ct-range-item">Rango Y  0 a 32°</span>
                        </div>
                    </>
                )}

                {/* — Decimales — */}
                {mode === 'decimales' && (
                    <>
                        <div className="ct-fields">
                            <div className="ct-row">
                                <span className="ct-row-label">X</span>
                                <input
                                    className="ct-input"
                                    type="number"
                                    step="0.000001"
                                    placeholder="-99.133209"
                                    value={xDec}
                                    onChange={e => setXDec(e.target.value)}
                                    aria-label="Longitud decimal"
                                />
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">Y</span>
                                <input
                                    className="ct-input"
                                    type="number"
                                    step="0.000001"
                                    placeholder="19.432608"
                                    value={yDec}
                                    onChange={e => setYDec(e.target.value)}
                                    aria-label="Latitud decimal"
                                />
                            </div>
                        </div>
                        <div className="ct-ranges">
                            <span className="ct-range-item">Rango X  -117 a -86</span>
                            <span className="ct-range-item">Rango Y  14 a 32</span>
                        </div>
                    </>
                )}

                {/* — UTM — */}
                {mode === 'utm' && (
                    <>
                        <div className="ct-fields">
                            <div className="ct-row">
                                <span className="ct-row-label">E</span>
                                <input
                                    className="ct-input"
                                    type="number"
                                    step="1"
                                    placeholder="490000"
                                    value={utmE}
                                    onChange={e => setUtmE(e.target.value)}
                                    aria-label="Este UTM"
                                />
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">N</span>
                                <input
                                    className="ct-input"
                                    type="number"
                                    step="1"
                                    placeholder="2149000"
                                    value={utmN}
                                    onChange={e => setUtmN(e.target.value)}
                                    aria-label="Norte UTM"
                                />
                            </div>
                        </div>
                        <div className="ct-utm-zone-row">
                            <span className="ct-utm-zone-label">ZONA UTM</span>
                            <select
                                className="ct-utm-zone-select"
                                value={utmZone}
                                onChange={e => setUtmZone(e.target.value as UtmZone)}
                                aria-label="Zona UTM"
                            >
                                {UTM_ZONES.map(z => (
                                    <option key={z} value={z}>{z}</option>
                                ))}
                            </select>
                        </div>
                        <div className="ct-ranges">
                            <span className="ct-range-item">
                                Rango E &nbsp;{utmXr.min.toLocaleString()} – {utmXr.max.toLocaleString()}
                            </span>
                            <span className="ct-range-item">
                                Rango N &nbsp;{UTM_Y_RANGE.min.toLocaleString()} – {UTM_Y_RANGE.max.toLocaleString()}
                            </span>
                        </div>
                    </>
                )}

                {/* — Error — */}
                {error && <div className="ct-error" role="alert">⚠ {error}</div>}
            </div>

            {/* ── Footer ── */}
            <div className="ct-footer">
                <button className="ct-btn ct-btn--secondary" onClick={handleNuevo}>
                    Nuevo
                </button>
                <button className="ct-btn ct-btn--primary" onClick={handleUbicar}>
                    Ubicar
                </button>
            </div>
        </div>
    );
};

export default CoordinatesTool;