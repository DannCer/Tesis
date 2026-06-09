/**
 * @fileoverview CoordinatesTool — Panel flotante para ubicar coordenadas en el mapa.
 *
 * Modos soportados:
 *  - Geográficas (DMS): Grados, Minutos, Segundos con selector de dirección N/S/E/O
 *  - Decimales:         Longitud / Latitud en grados decimales
 *  - UTM:               Este (E), Norte (N) y Zona UTM (11N–16N)
 *
 * Funcionalidades:
 *  - "Ubicar": vuela al punto, coloca un marcador pulsante y abre un popup.
 *  - "Nuevo": limpia el marcador y el formulario.
 *  - "Clic en mapa" (ícono 📍 en el header): activa modo de captura — al hacer
 *    clic sobre el mapa coloca un pin y muestra las coordenadas del punto en los
 *    tres formatos con botones de copia individual.
 *
 * Correcciones v3:
 *  - Bug DMS: Math.abs() en grados para evitar signo duplicado con dirección.
 *  - Bug DMS: validación explícita deg >= 0 antes de convertir.
 *  - Clase ct-input--error aplicada correctamente en campos inválidos.
 *  - clearMarker() llamado al cambiar de modo.
 *  - utmXRange documentado como constante (no depende de zona en práctica).
 *  - dmsField movido fuera del render como función pura.
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
    /** true cuando el modo captura fue activado desde CursorCoordinates */
    externalCaptureMode?: boolean;
    /** Callback para notificar que el modo captura terminó (se capturó o se canceló) */
    onCaptureDone?: () => void;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

/** Zonas UTM disponibles para México */
const UTM_ZONES = ['11N', '12N', '13N', '14N', '15N', '16N'] as const;
type UtmZone = typeof UTM_ZONES[number];

/** Número de zona a partir del string (e.g. "14N" → 14) */
const zoneNumber = (z: UtmZone): number => parseInt(z, 10);

/** Rango de easting (X) en cualquier zona UTM con datum WGS-84.
 *  El false easting es 500 000 m; los límites prácticos son ~100 000–900 000 m. */
const UTM_X_RANGE = { min: 100_000, max: 900_000 };

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

function utmToLatLng(easting: number, northing: number, zone: UtmZone): L.LatLng {
    const a    = 6_378_137.0;
    const f    = 1 / 298.257223563;
    const b    = a * (1 - f);
    const e2   = 1 - (b * b) / (a * a);
    const e    = Math.sqrt(e2);
    const ep2  = e2 / (1 - e2);
    const k0   = 0.9996;
    const E0   = 500_000;

    const zoneNum  = zoneNumber(zone);
    const lambda0  = ((zoneNum * 6) - 183) * (Math.PI / 180);

    const x = easting  - E0;
    const y = northing;

    const n    = (a - b) / (a + b);
    const n2   = n * n;
    const n3   = n2 * n;
    const n4   = n3 * n;

    const A0 = a / (1 + n) * (1 + n2 / 4 + n4 / 64);

    const M  = y / k0;
    const mu = M / A0;

    const beta1 =  3/2  * n   - 27/32  * n3;
    const beta2 =  21/16 * n2  - 55/32  * n4;
    const beta3 =  151/96 * n3;
    const beta4 =  1097/512 * n4;

    const phi1 = mu
        + beta1 * Math.sin(2 * mu)
        + beta2 * Math.sin(4 * mu)
        + beta3 * Math.sin(6 * mu)
        + beta4 * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = sinPhi1 / cosPhi1;

    const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const T1 = tanPhi1 * tanPhi1;
    const C1 = ep2 * cosPhi1 * cosPhi1;
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const D  = x / (N1 * k0);

    const latRad = phi1
        - (N1 * tanPhi1 / R1) * (
            D * D / 2
            - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D * D * D * D / 24
            + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
        );

    const lonRad = lambda0 + (
        D
        - (1 + 2 * T1 + C1) * D * D * D / 6
        + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cosPhi1;

    return L.latLng(latRad * (180 / Math.PI), lonRad * (180 / Math.PI));
}

// ─── Conversor LatLng → UTM ────────────────────────────────────────────────────

function latLngToUtm(lat: number, lon: number): { e: number; n: number; zone: UtmZone } {
    const a  = 6_378_137.0;
    const f  = 1 / 298.257223563;
    const b  = a * (1 - f);
    const e2 = 1 - (b * b) / (a * a);
    const k0 = 0.9996;
    const E0 = 500_000;

    const zoneNum = Math.floor((lon + 180) / 6) + 1;
    const lambda0 = ((zoneNum * 6) - 183) * (Math.PI / 180);

    const latRad = lat * (Math.PI / 180);
    const lonRad = lon * (Math.PI / 180);

    const N  = a / Math.sqrt(1 - e2 * Math.sin(latRad) ** 2);
    const T  = Math.tan(latRad) ** 2;
    const C  = (e2 / (1 - e2)) * Math.cos(latRad) ** 2;
    const A2 = Math.cos(latRad) * (lonRad - lambda0);

    const n  = (a - b) / (a + b);
    const n2 = n * n; const n3 = n2 * n; const n4 = n3 * n;
    const A0 = a / (1 + n) * (1 + n2 / 4 + n4 / 64);
    const alpha1 = n/2  - 2*n2/3  + 5*n3/16;
    const alpha2 = 13*n2/48 - 3*n3/5;
    const alpha3 = 61*n3/240;

    const latMerid = A0 * (
        latRad
        - alpha1 * Math.sin(2 * latRad)
        + alpha2 * Math.sin(4 * latRad)
        - alpha3 * Math.sin(6 * latRad)
    );

    const easting = E0 + k0 * N * (
        A2
        + (1 - T + C) * A2 ** 3 / 6
        + (5 - 18 * T + T ** 2 + 72 * C - 58 * (e2 / (1 - e2))) * A2 ** 5 / 120
    );

    const northing = k0 * (
        latMerid
        + N * Math.tan(latRad) * (
            A2 ** 2 / 2
            + (5 - T + 9 * C + 4 * C ** 2) * A2 ** 4 / 24
            + (61 - 58 * T + T ** 2 + 600 * C - 330 * (e2 / (1 - e2))) * A2 ** 6 / 720
        )
    );

    const zone = `${zoneNum}N` as UtmZone;
    return { e: Math.round(easting), n: Math.round(northing), zone };
}

// ─── Conversor decimal → DMS string ───────────────────────────────────────────

function decToDms(decimal: number, isLon: boolean): string {
    const abs = Math.abs(decimal);
    const deg = Math.floor(abs);
    const minFull = (abs - deg) * 60;
    const min = Math.floor(minFull);
    const sec = ((minFull - min) * 60).toFixed(2);
    const dir = isLon
        ? (decimal < 0 ? 'O' : 'E')
        : (decimal < 0 ? 'S' : 'N');
    return `${deg}° ${min}' ${sec}" ${dir}`;
}

// ─── Estado inicial ────────────────────────────────────────────────────────────

interface DmsState { deg: string; min: string; sec: string; }
const emptyDms = (): DmsState => ({ deg: '', min: '', sec: '' });

// ─── Helper dmsField (fuera del componente para evitar recreaciones) ──────────

interface DmsFieldProps {
    val: DmsState;
    set: React.Dispatch<React.SetStateAction<DmsState>>;
    dirValue: 'N' | 'S' | 'E' | 'O';
    setDir: React.Dispatch<React.SetStateAction<'N' | 'S'>> | React.Dispatch<React.SetStateAction<'E' | 'O'>>;
    options: readonly string[];
    maxDeg: number;
    axis: string;
    hasError: boolean;
}

const DmsField: React.FC<DmsFieldProps> = ({ val, set, dirValue, setDir, options, maxDeg, axis, hasError }) => (
    <div className="ct-dms-group">
        <input
            className={`ct-dms-input${hasError ? ' ct-input--error' : ''}`}
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
            className={`ct-dms-input${hasError ? ' ct-input--error' : ''}`}
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
            className={`ct-dms-input${hasError ? ' ct-input--error' : ''}`}
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

// ─── Subcomponente: resultado de captura de clic en mapa ──────────────────────

interface CaptureResultProps {
    lat: number;
    lon: number;
    onClear: () => void;
}

const CaptureResult: React.FC<CaptureResultProps> = ({ lat, lon, onClear }) => {
    const [copied, setCopied] = useState<string | null>(null);

    const utm = useMemo(() => latLngToUtm(lat, lon), [lat, lon]);
    const dmsLon = decToDms(lon, true);
    const dmsLat = decToDms(lat, false);

    const copy = (text: string, key: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(key);
            setTimeout(() => setCopied(null), 1800);
        });
    };

    const rows: { label: string; value: string; key: string }[] = [
        {
            label: 'Decimales',
            value: `${lon.toFixed(6)}, ${lat.toFixed(6)}`,
            key: 'dec',
        },
        {
            label: 'GMS',
            value: `${dmsLon}  ${dmsLat}`,
            key: 'dms',
        },
        {
            label: 'UTM',
            value: `E ${utm.e.toLocaleString()}  N ${utm.n.toLocaleString()}  Zona ${utm.zone}`,
            key: 'utm',
        },
    ];

    return (
        <div className="ct-capture-result">
            <div className="ct-capture-header">
                <span className="ct-capture-title">📌 Punto capturado</span>
                <button className="ct-capture-clear" onClick={onClear} title="Limpiar punto">✕</button>
            </div>
            {rows.map(row => (
                <div key={row.key} className="ct-capture-row">
                    <span className="ct-capture-label">{row.label}</span>
                    <span className="ct-capture-value" title={row.value}>{row.value}</span>
                    <button
                        className={`ct-copy-btn${copied === row.key ? ' ct-copy-btn--done' : ''}`}
                        onClick={() => copy(row.value, row.key)}
                        title="Copiar"
                        aria-label={`Copiar ${row.label}`}
                    >
                        {copied === row.key ? '✓' : '⎘'}
                    </button>
                </div>
            ))}
        </div>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const CoordinatesTool: React.FC<CoordinatesToolProps> = ({
    mapInstance,
    isOpen,
    onClose,
    externalCaptureMode = false,
    onCaptureDone,
}) => {
    const [mode, setMode] = useState<CoordMode>('geograficas');
    const [error, setError] = useState<string>('');
    const [fieldErrors, setFieldErrors] = useState<{ x: boolean; y: boolean }>({ x: false, y: false });

    /* — Modo Geográficas DMS — */
    const [xDms, setXDms] = useState<DmsState>(emptyDms());
    const [yDms, setYDms] = useState<DmsState>(emptyDms());
    const [xDir, setXDir] = useState<'E' | 'O'>('O');
    const [yDir, setYDir] = useState<'N' | 'S'>('N');

    /* — Modo Decimales — */
    const [xDec, setXDec] = useState('');
    const [yDec, setYDec] = useState('');

    /* — Modo UTM — */
    const [utmE, setUtmE] = useState('');
    const [utmN, setUtmN] = useState('');
    const [utmZone, setUtmZone] = useState<UtmZone>('14N');

    /* — Modo captura por clic — */
    const [captureMode, setCaptureMode]   = useState(false);
    const [capturedPoint, setCapturedPoint] = useState<{ lat: number; lon: number } | null>(null);

    /* Marcador activo en el mapa */
    const markerRef = useRef<L.Marker | null>(null);

    const clearMarker = useCallback(() => {
        if (markerRef.current) {
            markerRef.current.remove();
            markerRef.current = null;
        }
    }, []);

    /* Sincronizar con captura externa (activada desde el ícono ⌖ de CursorCoordinates) */
    useEffect(() => {
        if (externalCaptureMode) {
            setCaptureMode(true);
            clearMarker();
            setCapturedPoint(null);
        }
    }, [externalCaptureMode, clearMarker]);

    /* Limpiar marcador al cerrar */
    useEffect(() => {
        if (!isOpen) {
            clearMarker();
            setCaptureMode(false);
            setCapturedPoint(null);
        }
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

    /* Icono pin de captura (azul) */
    const capturePinIcon = useMemo(() => L.divIcon({
        className: '',
        html: [
            '<div class="ct-pin-wrapper">',
            '  <div class="ct-pin-ring ct-pin-ring--capture"></div>',
            '  <svg class="ct-pin-svg" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">',
            '    <path d="M16 2C9.373 2 4 7.373 4 14c0 9 12 26 12 26S28 23 28 14C28 7.373 22.627 2 16 2z"',
            '      fill="#1a56db" stroke="#fff" stroke-width="1.5"/>',
            '    <circle cx="16" cy="14" r="5" fill="#fff" opacity="0.9"/>',
            '  </svg>',
            '</div>',
        ].join(''),
        iconSize:    [32, 42],
        iconAnchor:  [16, 42],
        popupAnchor: [0, -44],
    }), []);

    /* Volar a punto y poner marcador */
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

    /* ── Modo captura por clic ──────────────────────────────────────────────── */

    const toggleCaptureMode = useCallback(() => {
        setCaptureMode(prev => {
            const next = !prev;
            if (!next) {
                if (mapInstance) mapInstance.getContainer().style.cursor = '';
                onCaptureDone?.();
            }
            return next;
        });
        if (!captureMode) {
            clearMarker();
            setCapturedPoint(null);
        }
    }, [captureMode, clearMarker, mapInstance, onCaptureDone]);

    useEffect(() => {
        if (!mapInstance) return;

        if (captureMode) {
            mapInstance.getContainer().style.cursor = 'crosshair';
        } else {
            mapInstance.getContainer().style.cursor = '';
        }

        if (!captureMode) return;

        const handleMapClick = (e: L.LeafletMouseEvent) => {
            const { lat, lng } = e.latlng;
            setCapturedPoint({ lat, lon: lng });
            clearMarker();

            const marker = L.marker(e.latlng, { icon: capturePinIcon })
                .addTo(mapInstance);
            markerRef.current = marker;

            // Salir del modo captura después del clic
            setCaptureMode(false);
            mapInstance.getContainer().style.cursor = '';
            onCaptureDone?.();
        };

        mapInstance.once('click', handleMapClick);

        return () => {
            mapInstance.off('click', handleMapClick);
        };
    }, [captureMode, mapInstance, clearMarker, capturePinIcon]);

    /* Limpiar punto capturado */
    const clearCaptured = useCallback(() => {
        setCapturedPoint(null);
        clearMarker();
    }, [clearMarker]);

    /* ── Parsear y ubicar ───────────────────────────────────────────────────── */

    const handleUbicar = useCallback(() => {
        setError('');
        setFieldErrors({ x: false, y: false });

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

                // FIX: validar que grados sean positivos antes de aplicar dirección
                if (xd < 0 || xm < 0 || xs < 0)
                    throw new Error('Los grados, minutos y segundos deben ser positivos.');
                if (yd < 0 || ym < 0 || ys < 0)
                    throw new Error('Los grados, minutos y segundos deben ser positivos.');

                // FIX: usar Math.abs para evitar duplicar signo negativo
                const lonSign = xDir === 'O' ? -1 : 1;
                const latSign = yDir === 'S' ? -1 : 1;
                const lon = lonSign * (Math.abs(xd) + Math.abs(xm) / 60 + Math.abs(xs) / 3600);
                const lat = latSign * (Math.abs(yd) + Math.abs(ym) / 60 + Math.abs(ys) / 3600);

                if (lon < LON_RANGE.min || lon > LON_RANGE.max) {
                    setFieldErrors(f => ({ ...f, x: true }));
                    throw new Error(`Longitud fuera del rango de México (${LON_RANGE.min}° a ${LON_RANGE.max}°).`);
                }
                if (lat < LAT_RANGE.min || lat > LAT_RANGE.max) {
                    setFieldErrors(f => ({ ...f, y: true }));
                    throw new Error(`Latitud fuera del rango de México (${LAT_RANGE.min}° a ${LAT_RANGE.max}°).`);
                }

                flyToPoint(
                    L.latLng(lat, lon),
                    `${Math.abs(xd)}° ${Math.abs(xm)}' ${Math.abs(xs)}" ${xDir}<br>${Math.abs(yd)}° ${Math.abs(ym)}' ${Math.abs(ys)}" ${yDir}`,
                );

            } else if (mode === 'decimales') {
                const lon = parseFloat(xDec);
                const lat = parseFloat(yDec);

                const xNaN = Number.isNaN(lon);
                const yNaN = Number.isNaN(lat);

                if (xNaN || yNaN) {
                    // FIX: marcar visualmente los campos con error
                    setFieldErrors({ x: xNaN, y: yNaN });
                    throw new Error('Ingresa coordenadas decimales válidas.');
                }

                if (lon < LON_RANGE.min || lon > LON_RANGE.max) {
                    setFieldErrors(f => ({ ...f, x: true }));
                    throw new Error(`Longitud fuera del rango (${LON_RANGE.min} a ${LON_RANGE.max}).`);
                }
                if (lat < LAT_RANGE.min || lat > LAT_RANGE.max) {
                    setFieldErrors(f => ({ ...f, y: true }));
                    throw new Error(`Latitud fuera del rango (${LAT_RANGE.min} a ${LAT_RANGE.max}).`);
                }

                flyToPoint(
                    L.latLng(lat, lon),
                    `Lon: ${lon.toFixed(6)}<br>Lat: ${lat.toFixed(6)}`,
                );

            } else {
                const e = parseFloat(utmE);
                const n = parseFloat(utmN);

                const eNaN = Number.isNaN(e);
                const nNaN = Number.isNaN(n);

                if (eNaN || nNaN) {
                    // FIX: marcar visualmente los campos con error
                    setFieldErrors({ x: eNaN, y: nNaN });
                    throw new Error('Ingresa valores UTM válidos.');
                }

                if (e < UTM_X_RANGE.min || e > UTM_X_RANGE.max) {
                    setFieldErrors(f => ({ ...f, x: true }));
                    throw new Error(`Este fuera de rango (${UTM_X_RANGE.min.toLocaleString()} – ${UTM_X_RANGE.max.toLocaleString()} m).`);
                }
                if (n < UTM_Y_RANGE.min || n > UTM_Y_RANGE.max) {
                    setFieldErrors(f => ({ ...f, y: true }));
                    throw new Error(`Norte fuera de rango (${UTM_Y_RANGE.min.toLocaleString()} – ${UTM_Y_RANGE.max.toLocaleString()}).`);
                }

                const latlng = utmToLatLng(e, n, utmZone);

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
        setFieldErrors({ x: false, y: false });
        setXDms(emptyDms()); setYDms(emptyDms());
        setXDir('O'); setYDir('N');
        setXDec(''); setYDec('');
        setUtmE(''); setUtmN('');
        setCapturedPoint(null);
        clearMarker();
    }, [clearMarker]);

    /* — Cambio de modo — */
    const handleModeChange = useCallback((m: CoordMode) => {
        setMode(m);
        setError('');
        setFieldErrors({ x: false, y: false });
        // FIX: limpiar marcador al cambiar de modo
        clearMarker();
    }, [clearMarker]);

    if (!isOpen) return null;

    return (
        <div className="ct-panel" role="dialog" aria-label="Coordenadas" aria-modal="false">

            {/* ── Header ── */}
            <div className="ct-header" data-drag-handle>
                {/* FIX: botón de captura por clic a la izquierda del título */}
                <button
                    className={`ct-capture-btn${captureMode ? ' ct-capture-btn--active' : ''}`}
                    onClick={toggleCaptureMode}
                    title={captureMode ? 'Cancelar captura' : 'Haz clic en el mapa para capturar un punto'}
                    aria-label="Capturar punto del mapa"
                    aria-pressed={captureMode}
                >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                            fill="currentColor" opacity="0.9"/>
                        <circle cx="12" cy="9" r="2.5" fill="white"/>
                    </svg>
                </button>
                <span className="ct-header-title">Coordenadas</span>
                <button className="ct-close-btn" onClick={onClose} title="Cerrar" aria-label="Cerrar panel">
                    ✕
                </button>
            </div>

            {/* ── Aviso de modo captura ── */}
            {captureMode && (
                <div className="ct-capture-notice" role="status">
                    <span>🎯 Haz clic en el mapa para capturar un punto</span>
                    <button className="ct-capture-cancel" onClick={toggleCaptureMode}>Cancelar</button>
                </div>
            )}

            {/* ── Resultado de captura ── */}
            {capturedPoint && !captureMode && (
                <CaptureResult
                    lat={capturedPoint.lat}
                    lon={capturedPoint.lon}
                    onClear={clearCaptured}
                />
            )}

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
                                <DmsField
                                    val={xDms} set={setXDms}
                                    dirValue={xDir} setDir={setXDir as React.Dispatch<React.SetStateAction<'E' | 'O'>>}
                                    options={['O', 'E']} maxDeg={180} axis="Longitud"
                                    hasError={fieldErrors.x}
                                />
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">Y</span>
                                <DmsField
                                    val={yDms} set={setYDms}
                                    dirValue={yDir} setDir={setYDir as React.Dispatch<React.SetStateAction<'N' | 'S'>>}
                                    options={['N', 'S']} maxDeg={90} axis="Latitud"
                                    hasError={fieldErrors.y}
                                />
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
                                    className={`ct-input${fieldErrors.x ? ' ct-input--error' : ''}`}
                                    type="number"
                                    step="0.000001"
                                    placeholder="-99.133209"
                                    value={xDec}
                                    onChange={e => { setXDec(e.target.value); setFieldErrors(f => ({ ...f, x: false })); }}
                                    aria-label="Longitud decimal"
                                />
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">Y</span>
                                <input
                                    className={`ct-input${fieldErrors.y ? ' ct-input--error' : ''}`}
                                    type="number"
                                    step="0.000001"
                                    placeholder="19.432608"
                                    value={yDec}
                                    onChange={e => { setYDec(e.target.value); setFieldErrors(f => ({ ...f, y: false })); }}
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
                                    className={`ct-input${fieldErrors.x ? ' ct-input--error' : ''}`}
                                    type="number"
                                    step="1"
                                    placeholder="490000"
                                    value={utmE}
                                    onChange={e => { setUtmE(e.target.value); setFieldErrors(f => ({ ...f, x: false })); }}
                                    aria-label="Este UTM"
                                />
                            </div>
                            <div className="ct-row">
                                <span className="ct-row-label">N</span>
                                <input
                                    className={`ct-input${fieldErrors.y ? ' ct-input--error' : ''}`}
                                    type="number"
                                    step="1"
                                    placeholder="2149000"
                                    value={utmN}
                                    onChange={e => { setUtmN(e.target.value); setFieldErrors(f => ({ ...f, y: false })); }}
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
                                Rango E &nbsp;{UTM_X_RANGE.min.toLocaleString()} – {UTM_X_RANGE.max.toLocaleString()}
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