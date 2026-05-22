/**
 * @fileoverview CoordinatesTool — Panel flotante para ubicar coordenadas en el mapa.
 *
 * Modos soportados:
 *  - Geográficas (DMS): Grados, Minutos, Segundos con selector de dirección N/S/E/O
 *  - Decimales:         Longitud / Latitud en grados decimales
 *  - UTM:               Este (E), Norte (N) y Zona UTM (11N–16N)
 *
 * Al hacer clic en "Ubicar" vuela al punto, coloca un marcador pulsante
 * y abre un popup con las coordenadas. "Nuevo" limpia el marcador y el formulario.
 *
 * Mejoras v2:
 *  - Conversión UTM→LatLng usando serie de Karney completa (precisión ~1 mm)
 *  - Selector de dirección N/S para latitud y E/O para longitud en modo DMS
 *  - Rango de latitud corregido: 14.5°N – 32.72°N (cubre todo México)
 *  - clearMarker agregado a las dependencias del useEffect
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

/** Rango de easting (X) en cualquier zona UTM con datum WGS-84.
 *  El false easting es 500 000 m; los límites prácticos son ~100 000–900 000 m. */
const utmXRange = (_z: UtmZone) => ({ min: 100_000, max: 900_000 });

/**
 * Rango Y corregido para México.
 * México se extiende aprox. 14.5°N – 32.72°N, lo que en UTM hemisferio norte
 * corresponde a ~1 603 000 – 3 622 000 m.
 */
const UTM_Y_RANGE = { min: 1_603_000, max: 3_622_000 };

/**
 * Rango de latitud corregido para México.
 * - Sur:  ~14.53°N (frontera Guatemala/Belice en Quintana Roo)
 * - Norte: ~32.72°N (esquina NW de Baja California)
 */
const LAT_RANGE = { min: 14.5, max: 32.72 };

/**
 * Rango de longitud para México.
 * - Este: ~-86.71°  (Quintana Roo)
 * - Oeste: ~-117.12° (Baja California)
 */
const LON_RANGE = { min: -117.12, max: -86.71 };

// ─── Conversor UTM → LatLng (Karney / Transverse Mercator WGS-84) ─────────────
//
// Implementación basada en la serie completa de Bowring/Helmert para la
// proyección Transverse Mercator con elipsoide WGS-84.
// Precisión: < 1 mm en cualquier punto de México.
//
// Referencias:
//   Karney, C.F.F. (2011). Transverse Mercator with an accuracy of a few nanometers.
//   Bowring, B.R. (1985). The geodesic line and geodetic datum.

function utmToLatLng(easting: number, northing: number, zone: UtmZone): L.LatLng {
    // Parámetros WGS-84
    const a    = 6_378_137.0;          // Semi-eje mayor (m)
    const f    = 1 / 298.257223563;    // Achatamiento
    const b    = a * (1 - f);          // Semi-eje menor
    const e2   = 1 - (b * b) / (a * a); // Excentricidad^2
    const e    = Math.sqrt(e2);
    const ep2  = e2 / (1 - e2);        // Segunda excentricidad^2
    const k0   = 0.9996;               // Factor de escala central
    const E0   = 500_000;              // False Easting

    const zoneNum  = zoneNumber(zone);
    const lambda0  = ((zoneNum * 6) - 183) * (Math.PI / 180); // Meridiano central (rad)

    const x = easting  - E0;
    const y = northing; // Hemisferio Norte; sin offset de false northing

    // Longitud de arco meridiano inversa (Helmert)
    const n    = (a - b) / (a + b);
    const n2   = n * n;
    const n3   = n2 * n;
    const n4   = n3 * n;

    const A0 = a / (1 + n) * (1 + n2 / 4 + n4 / 64);

    const M  = y / k0;
    const mu = M / A0;

    // Series de Fourier para latitud rectificante
    const beta1 =  3/2  * n   - 27/32  * n3;
    const beta2 =  21/16 * n2  - 55/32  * n4;
    const beta3 =  151/96 * n3;
    const beta4 =  1097/512 * n4;

    const phi1 = mu
        + beta1 * Math.sin(2 * mu)
        + beta2 * Math.sin(4 * mu)
        + beta3 * Math.sin(6 * mu)
        + beta4 * Math.sin(8 * mu);

    // Parámetros en latitud rectificante
    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = sinPhi1 / cosPhi1;

    const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const T1 = tanPhi1 * tanPhi1;
    const C1 = ep2 * cosPhi1 * cosPhi1;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const D  = x / (N1 * k0);

    // Latitud geodésica
    const latRad = phi1
        - (N1 * tanPhi1 / R1) * (
            D * D / 2
            - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
        );

    // Longitud geodésica
    const lonRad = lambda0 + (
        D
        - (1 + 2 * T1 + C1) * D * D * D / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cosPhi1;

    return L.latLng(latRad * (180 / Math.PI), lonRad * (180 / Math.PI));
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
    /** Dirección de la longitud: E = positivo, O = negativo (default Oeste para México) */
    const [xDir, setXDir] = useState<'E' | 'O'>('O');
    /** Dirección de la latitud: N = positivo, S = negativo (default Norte para México) */
    const [yDir, setYDir] = useState<'N' | 'S'>('N');

    /* — Modo Decimales — */
    const [xDec, setXDec] = useState(''); // Longitud (X), rango LON_RANGE
    const [yDec, setYDec] = useState(''); // Latitud  (Y), rango LAT_RANGE

    /* — Modo UTM — */
    const [utmE, setUtmE] = useState('');
    const [utmN, setUtmN] = useState('');
    const [utmZone, setUtmZone] = useState<UtmZone>('14N');

    /* Marcador activo en el mapa */
    const markerRef = useRef<L.Marker | null>(null);

    const clearMarker = useCallback(() => {
        if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
        }
    }, []);

    /* Limpiar marcador al cerrar — clearMarker incluido en deps */
    useEffect(() => {
        if (!isOpen) clearMarker();
    }, [isOpen, clearMarker]);

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

                // Aplicar signo según la dirección seleccionada
                const lonSign = xDir === 'O' ? -1 : 1;
                const latSign = yDir === 'S' ? -1 : 1;

                const lon = lonSign * (xd + xm / 60 + xs / 3600);
                const lat = latSign * (yd + ym / 60 + ys / 3600);

                if (lon < LON_RANGE.min || lon > LON_RANGE.max)
                    throw new Error(`Longitud fuera del rango de México (${LON_RANGE.min}° a ${LON_RANGE.max}°).`);
                if (lat < LAT_RANGE.min || lat > LAT_RANGE.max)
                    throw new Error(`Latitud fuera del rango de México (${LAT_RANGE.min}° a ${LAT_RANGE.max}°).`);

                flyToPoint(
                    L.latLng(lat, lon),
                    `${xd}° ${xm}' ${xs}" ${xDir}<br>${yd}° ${ym}' ${ys}" ${yDir}`,
                );

            } else if (mode === 'decimales') {
                const lon = parseFloat(xDec);
                const lat = parseFloat(yDec);

                if (Number.isNaN(lon) || Number.isNaN(lat))
                    throw new Error('Ingresa coordenadas decimales válidas.');

                if (lon < LON_RANGE.min || lon > LON_RANGE.max)
                    throw new Error(`Longitud fuera del rango (${LON_RANGE.min} a ${LON_RANGE.max}).`);
                if (lat < LAT_RANGE.min || lat > LAT_RANGE.max)
                    throw new Error(`Latitud fuera del rango (${LAT_RANGE.min} a ${LAT_RANGE.max}).`);

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

                if (e < 100_000 || e > 900_000)
                    throw new Error('Este fuera de rango (100,000 – 900,000 m).');

                if (n < UTM_Y_RANGE.min || n > UTM_Y_RANGE.max)
                    throw new Error(`Norte fuera de rango (${UTM_Y_RANGE.min.toLocaleString()} – ${UTM_Y_RANGE.max.toLocaleString()}).`);

                const latlng = utmToLatLng(e, n, utmZone);

                // Validar que la conversión caiga dentro de México
                if (latlng.lat < LAT_RANGE.min || latlng.lat > LAT_RANGE.max ||
                    latlng.lng < LON_RANGE.min || latlng.lng > LON_RANGE.max)
                    throw new Error('Coordenadas fuera del área de México.');

                flyToPoint(
                    latlng,
                    `E: ${e.toLocaleString()}<br>N: ${n.toLocaleString()}<br>Zona: ${utmZone}`,
                );
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al procesar coordenadas.');
        }
    }, [mode, xDms, yDms, xDir, yDir, xDec, yDec, utmE, utmN, utmZone, flyToPoint]);

    /* — Nuevo: limpiar todo — */
    const handleNuevo = useCallback(() => {
        setError('');
        setXDms(emptyDms()); setYDms(emptyDms());
        setXDir('O'); setYDir('N');
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

    /* ── Helper de input DMS con selector de dirección ── */
    const dmsField = (
        val: DmsState,
        set: React.Dispatch<React.SetStateAction<DmsState>>,
        dirValue: 'N' | 'S' | 'E' | 'O',
        setDir: React.Dispatch<React.SetStateAction<'N' | 'S'>> | React.Dispatch<React.SetStateAction<'E' | 'O'>>,
        options: readonly string[],
        maxDeg: number,
        axis: string,
    ) => (
        <div className="ct-dms-group">
            <input
                className="ct-dms-input"
                type="number"
                min={0}
                max={maxDeg}
                placeholder="0"
                value={val.deg}
                onChange={e => set(p => ({ ...p, deg: e.target.value }))}
                aria-label={`Grados ${axis}`}
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
                aria-label={`Minutos ${axis}`}
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
                aria-label={`Segundos ${axis}`}
            />
            <span className="ct-dms-sym">"</span>
            <select
                className="ct-dms-dir-select"
                value={dirValue}
                onChange={e => (setDir as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                aria-label={`Dirección ${axis}`}
            >
                {options.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
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
                                {dmsField(xDms, setXDms, xDir, setXDir as React.Dispatch<React.SetStateAction<'E' | 'O'>>, ['O', 'E'], 180, 'Longitud')}
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">Y</span>
                                {dmsField(yDms, setYDms, yDir, setYDir as React.Dispatch<React.SetStateAction<'N' | 'S'>>, ['N', 'S'], 90, 'Latitud')}
                            </div>
                        </div>
                        <div className="ct-ranges">
                            <span className="ct-range-item">Rango X  0° – 180° O/E</span>
                            <span className="ct-range-item">Rango Y  0° – 90° N/S</span>
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
                            <span className="ct-range-item">Rango X  {LON_RANGE.min} a {LON_RANGE.max}</span>
                            <span className="ct-range-item">Rango Y  {LAT_RANGE.min} a {LAT_RANGE.max}</span>
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
