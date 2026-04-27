/**
 * ElevationProfile — Herramienta de perfil topográfico.
 *
 * Fuente de elevación: AWS Terrain Tiles (Terrarium encoding)
 * https://registry.opendata.aws/terrain-tiles/
 *
 * No requiere API key y permite CORS desde el navegador.
 * Codificación Terrarium: elevation = (R*256 + G + B/256) - 32768
 *
 * Tabs:
 *   - Medir: seleccionar resolución y dibujar línea
 *   - Resultado del Perfil: gráfico interactivo
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import '@styles/ElevationProfile.css';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ElevationPoint {
    distance: number;   // km desde el inicio
    elevation: number;  // metros
    lat: number;
    lng: number;
}

interface ElevationProfileProps {
    mapInstance: L.Map | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const RESOLUTIONS: { label: string; meters: number }[] = [
    { label: '5m',   meters: 5   },
    { label: '15m',  meters: 15  },
    { label: '30m',  meters: 30  },
    { label: '60m',  meters: 60  },
    { label: '90m',  meters: 90  },
    { label: '120m', meters: 120 },
];

const MAX_POINTS = 200;

// Zoom de los tiles Terrarium: 12 ≈ 38m/px, 13 ≈ 19m/px, 14 ≈ 9.5m/px
const TILE_ZOOM = 13;
const TILE_SIZE = 256;

// ─── Motor de elevación: Terrarium tiles (AWS, CORS habilitado) ───────────────

/** Convierte lat/lng al tile XYZ */
function latLngToTile(lat: number, lng: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const x = Math.floor((lng + 180) / 360 * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
        (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n
    );
    return { x, y };
}

/** Posición en píxeles del punto dentro de su tile */
function latLngToPixel(lat: number, lng: number, tileX: number, tileY: number, zoom: number) {
    const n = Math.pow(2, zoom);
    const px = Math.floor(((lng + 180) / 360 * n - tileX) * TILE_SIZE);
    const latRad = (lat * Math.PI) / 180;
    const py = Math.floor(
        ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n - tileY) * TILE_SIZE
    );
    return {
        px: Math.max(0, Math.min(TILE_SIZE - 1, px)),
        py: Math.max(0, Math.min(TILE_SIZE - 1, py)),
    };
}

/** Cache de tiles ya descargados (key = "z/x/y") */
const tileCache = new Map<string, ImageData>();

/** Descarga un tile Terrarium y extrae su ImageData */
async function loadTile(x: number, y: number, zoom: number): Promise<ImageData> {
    const key = `${zoom}/${x}/${y}`;
    if (tileCache.has(key)) return tileCache.get(key)!;

    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = TILE_SIZE;
            canvas.height = TILE_SIZE;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, TILE_SIZE, TILE_SIZE);
            const imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
            tileCache.set(key, imageData);
            resolve(imageData);
        };
        img.onerror = () => reject(new Error(`No se pudo cargar tile ${key}`));
        img.src = url;
    });
}

/** Decodifica Terrarium RGB → elevación en metros */
function terrariumDecode(r: number, g: number, b: number): number {
    return (r * 256 + g + b / 256) - 32768;
}

/** Obtiene elevaciones para un array de puntos usando tiles Terrarium */
async function fetchElevations(
    points: { lat: number; lng: number }[]
): Promise<number[]> {
    // Agrupar puntos por tile para minimizar descargas
    const tileGroups = new Map<string, { x: number; y: number; indices: number[] }>();
    points.forEach((p, i) => {
        const { x, y } = latLngToTile(p.lat, p.lng, TILE_ZOOM);
        const key = `${TILE_ZOOM}/${x}/${y}`;
        if (!tileGroups.has(key)) tileGroups.set(key, { x, y, indices: [] });
        tileGroups.get(key)!.indices.push(i);
    });

    const elevations = new Array<number>(points.length).fill(0);

    await Promise.all(
        [...tileGroups.entries()].map(async ([, { x, y, indices }]) => {
            try {
                const imageData = await loadTile(x, y, TILE_ZOOM);
                indices.forEach(i => {
                    const p = points[i];
                    const { px, py } = latLngToPixel(p.lat, p.lng, x, y, TILE_ZOOM);
                    const offset = (py * TILE_SIZE + px) * 4;
                    const r = imageData.data[offset];
                    const g = imageData.data[offset + 1];
                    const b = imageData.data[offset + 2];
                    elevations[i] = terrariumDecode(r, g, b);
                });
            } catch {
                // Si falla un tile, dejar elevación en 0
            }
        })
    );

    return elevations;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

/** Distancia haversine entre dos puntos en kilómetros */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Interpola N puntos equidistantes a lo largo de una polilínea [lat,lng][] */
function interpolateAlongLine(
    coords: [number, number][],
    numPoints: number
): { lat: number; lng: number; distance: number }[] {
    if (coords.length < 2 || numPoints < 2) return [];

    const segLengths: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < coords.length - 1; i++) {
        const d = haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
        segLengths.push(d);
        totalLength += d;
    }

    const result: { lat: number; lng: number; distance: number }[] = [];
    const step = totalLength / (numPoints - 1);

    for (let p = 0; p < numPoints; p++) {
        const target = step * p;
        let acc = 0;
        let placed = false;
        for (let i = 0; i < segLengths.length; i++) {
            if (acc + segLengths[i] >= target || i === segLengths.length - 1) {
                const rem = target - acc;
                const t = segLengths[i] > 0 ? Math.min(rem / segLengths[i], 1) : 0;
                const lat = coords[i][0] + t * (coords[i + 1][0] - coords[i][0]);
                const lng = coords[i][1] + t * (coords[i + 1][1] - coords[i][1]);
                result.push({ lat, lng, distance: target });
                placed = true;
                break;
            }
            acc += segLengths[i];
        }
        if (!placed) {
            const last = coords[coords.length - 1];
            result.push({ lat: last[0], lng: last[1], distance: totalLength });
        }
    }
    return result;
}

// ─── Sub-componente: Gráfico SVG ──────────────────────────────────────────────

interface ProfileChartProps {
    data: ElevationPoint[];
    onHover: (point: ElevationPoint | null) => void;
    hoveredIdx: number | null;
}

const ProfileChart: React.FC<ProfileChartProps> = ({ data, onHover, hoveredIdx }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const W = 310;
    const H = 160;
    const PAD = { top: 12, right: 10, bottom: 30, left: 55 };
    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    if (!data.length) return null;

    const minElev = Math.min(...data.map(d => d.elevation));
    const maxElev = Math.max(...data.map(d => d.elevation));
    const elevRange = maxElev - minElev || 1;
    const maxDist = data[data.length - 1].distance;

    const toX = (d: number) => PAD.left + (d / maxDist) * chartW;
    const toY = (e: number) => PAD.top + chartH - ((e - minElev) / elevRange) * chartH;

    // Path de la línea
    const linePath = data
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.distance).toFixed(1)},${toY(p.elevation).toFixed(1)}`)
        .join(' ');

    // Path de relleno (área bajo la curva)
    const areaPath = `${linePath} L${toX(maxDist).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${PAD.left},${(PAD.top + chartH).toFixed(1)} Z`;

    // Ticks Y
    const yTicks = 4;
    const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
        minElev + (elevRange / yTicks) * i
    );

    // Ticks X
    const xTicks = 4;
    const xTickValues = Array.from({ length: xTicks + 1 }, (_, i) =>
        (maxDist / xTicks) * i
    );

    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left - PAD.left;
        const frac = Math.max(0, Math.min(1, x / chartW));
        const targetDist = frac * maxDist;
        let closest = 0;
        let minDiff = Infinity;
        data.forEach((p, i) => {
            const diff = Math.abs(p.distance - targetDist);
            if (diff < minDiff) { minDiff = diff; closest = i; }
        });
        onHover(data[closest]);
    };

    const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

    return (
        <svg
            ref={svgRef}
            width={W}
            height={H}
            className="ep-chart-svg"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => onHover(null)}
        >
            <defs>
                <linearGradient id="epGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5a623" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#f5a623" stopOpacity="0.25" />
                </linearGradient>
                <clipPath id="epClip">
                    <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
                </clipPath>
            </defs>

            {/* Fondo suave */}
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH}
                fill="#f0f8ff" rx="2" />

            {/* Grillas Y */}
            {yTickValues.map((v, i) => (
                <line
                    key={i}
                    x1={PAD.left} x2={PAD.left + chartW}
                    y1={toY(v)} y2={toY(v)}
                    stroke="#d0dce8" strokeWidth="1"
                />
            ))}

            {/* Área rellena */}
            <path d={areaPath} fill="url(#epGrad)" clipPath="url(#epClip)" />

            {/* Línea del perfil */}
            <path d={linePath} fill="none" stroke="#e06e00" strokeWidth="2"
                clipPath="url(#epClip)" />

            {/* Eje Y — etiquetas */}
            {yTickValues.map((v, i) => (
                <text
                    key={i}
                    x={PAD.left - 5}
                    y={toY(v) + 4}
                    textAnchor="end"
                    className="ep-axis-label"
                >
                    {Math.round(v).toLocaleString()}
                </text>
            ))}

            {/* Eje X — etiquetas */}
            {xTickValues.map((v, i) => (
                <text
                    key={i}
                    x={toX(v)}
                    y={PAD.top + chartH + 18}
                    textAnchor="middle"
                    className="ep-axis-label"
                >
                    {v.toFixed(1)}
                </text>
            ))}

            {/* Línea de referencia horizontal (media) */}
            <line
                x1={PAD.left} x2={PAD.left + chartW}
                y1={toY((minElev + maxElev) / 2)}
                y2={toY((minElev + maxElev) / 2)}
                stroke="#ffffff" strokeWidth="1" strokeDasharray="4 3"
                opacity="0.7"
            />

            {/* Tooltip de hover */}
            {hovered && (
                <g>
                    {/* Línea vertical */}
                    <line
                        x1={toX(hovered.distance)} x2={toX(hovered.distance)}
                        y1={PAD.top} y2={PAD.top + chartH}
                        stroke="#333" strokeWidth="1" strokeDasharray="3 2"
                    />
                    {/* Punto */}
                    <circle
                        cx={toX(hovered.distance)} cy={toY(hovered.elevation)}
                        r={5} fill="#8d1c3d" stroke="#fff" strokeWidth="2"
                    />
                    {/* Tooltip box */}
                    {(() => {
                        const tx = toX(hovered.distance);
                        const ty = toY(hovered.elevation);
                        const boxW = 110;
                        const boxH = 38;
                        const bx = tx + boxW > W - 5 ? tx - boxW - 6 : tx + 8;
                        const by = ty - boxH / 2 < PAD.top ? PAD.top : ty - boxH / 2;
                        const delta = hovered.elevation - data[0].elevation;
                        return (
                            <g>
                                <rect x={bx} y={by} width={boxW} height={boxH}
                                    fill="#1a2a3a" rx="3" opacity="0.92" />
                                <text x={bx + 7} y={by + 14}
                                    fill="#7ecfff" className="ep-tooltip-label">
                                    {hovered.elevation.toFixed(0)} m
                                </text>
                                <rect
                                    x={bx + 7} y={by + 20}
                                    width={72} height={14}
                                    fill={delta >= 0 ? '#c0392b' : '#27ae60'}
                                    rx="2"
                                />
                                <text x={bx + 43} y={by + 31}
                                    fill="#fff" textAnchor="middle"
                                    className="ep-tooltip-delta">
                                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                                </text>
                            </g>
                        );
                    })()}
                </g>
            )}
        </svg>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────

const ElevationProfile: React.FC<ElevationProfileProps> = ({ mapInstance }) => {
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState<'medir' | 'resultado'>('medir');
    const [resolution, setResolution] = useState(RESOLUTIONS[2]); // 30m
    const [resOpen, setResOpen] = useState(false);
    const [drawing, setDrawing] = useState(false);
    const [points, setPoints] = useState<[number, number][]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [profileData, setProfileData] = useState<ElevationPoint[]>([]);
    const [hoveredPoint, setHoveredPoint] = useState<ElevationPoint | null>(null);
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

    // Refs para capas Leaflet temporales
    const polylineRef = useRef<L.Polyline | null>(null);
    const markersRef = useRef<L.CircleMarker[]>([]);
    const previewLineRef = useRef<L.Polyline | null>(null);
    // Marcador que se mueve sobre la línea al hacer hover en el gráfico
    const hoverMarkerRef = useRef<L.CircleMarker | null>(null);

    // ── Limpiar capas del mapa ────────────────────────────────────────────────

    const clearMapLayers = useCallback(() => {
        if (!mapInstance) return;
        polylineRef.current?.remove();
        polylineRef.current = null;
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];
        previewLineRef.current?.remove();
        previewLineRef.current = null;
        hoverMarkerRef.current?.remove();
        hoverMarkerRef.current = null;
    }, [mapInstance]);

    // ── Iniciar dibujo ────────────────────────────────────────────────────────

    const startDrawing = useCallback(() => {
        if (!mapInstance) return;
        clearMapLayers();
        setPoints([]);
        setProfileData([]);
        setError(null);
        setDrawing(true);
        mapInstance.getContainer().style.cursor = 'crosshair';
    }, [mapInstance, clearMapLayers]);

    // ── Manejadores de eventos del mapa ───────────────────────────────────────

    useEffect(() => {
        if (!mapInstance || !drawing) return;

        const onClick = (e: L.LeafletMouseEvent) => {
            const newPt: [number, number] = [e.latlng.lat, e.latlng.lng];
            setPoints(prev => {
                const updated = [...prev, newPt];
                // Actualizar polyline
                if (polylineRef.current) {
                    polylineRef.current.setLatLngs(updated);
                } else {
                    polylineRef.current = L.polyline(updated, {
                        color: '#8d1c3d',
                        weight: 3,
                        dashArray: '6 4',
                    }).addTo(mapInstance);
                }
                // Marcar punto
                const marker = L.circleMarker(e.latlng, {
                    radius: 5,
                    fillColor: '#8d1c3d',
                    color: '#fff',
                    weight: 2,
                    fillOpacity: 1,
                }).addTo(mapInstance);
                markersRef.current.push(marker);
                return updated;
            });
        };

        const onDblClick = (e: L.LeafletMouseEvent) => {
            L.DomEvent.stopPropagation(e);
            finishDrawing();
        };

        const onMouseMove = (e: L.LeafletMouseEvent) => {
            setPoints(prev => {
                if (prev.length === 0) return prev;
                const last = prev[prev.length - 1];
                if (previewLineRef.current) {
                    previewLineRef.current.setLatLngs([[last[0], last[1]], e.latlng]);
                } else {
                    previewLineRef.current = L.polyline([[last[0], last[1]], e.latlng], {
                        color: '#8d1c3d',
                        weight: 2,
                        opacity: 0.5,
                        dashArray: '4 4',
                    }).addTo(mapInstance);
                }
                return prev;
            });
        };

        mapInstance.on('click', onClick);
        mapInstance.on('dblclick', onDblClick);
        mapInstance.on('mousemove', onMouseMove);

        return () => {
            mapInstance.off('click', onClick);
            mapInstance.off('dblclick', onDblClick);
            mapInstance.off('mousemove', onMouseMove);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapInstance, drawing]);

    // ── Finalizar dibujo y obtener elevaciones ────────────────────────────────

    const finishDrawing = useCallback(async () => {
        if (!mapInstance) return;
        setDrawing(false);
        mapInstance.getContainer().style.cursor = '';
        previewLineRef.current?.remove();
        previewLineRef.current = null;

        setPoints(currentPoints => {
            if (currentPoints.length < 2) {
                setError('Dibuja al menos 2 puntos en el mapa.');
                return currentPoints;
            }
            fetchProfile(currentPoints);
            return currentPoints;
        });
    }, [mapInstance]);

    const fetchProfile = useCallback(async (coords: [number, number][]) => {
        setLoading(true);
        setError(null);
        try {
            // Calcular longitud total
            let totalKm = 0;
            for (let i = 0; i < coords.length - 1; i++) {
                totalKm += haversine(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
            }

            // Número de puntos según resolución
            const resMeters = resolution.meters;
            const totalMeters = totalKm * 1000;
            let numPoints = Math.ceil(totalMeters / resMeters) + 1;
            numPoints = Math.max(2, Math.min(numPoints, MAX_POINTS));

            const interpolated = interpolateAlongLine(coords, numPoints);
            const elevations = await fetchElevations(interpolated);

            const result: ElevationPoint[] = interpolated.map((p, i) => ({
                distance: p.distance,
                elevation: elevations[i],
                lat: p.lat,
                lng: p.lng,
            }));

            setProfileData(result);
            setTab('resultado');
        } catch (err: any) {
            setError(`Error al obtener elevaciones: ${err.message}`);
        } finally {
            setLoading(false);
        }
    }, [resolution]);

    // ── Cancelar / Limpiar ────────────────────────────────────────────────────

    const handleClose = useCallback(() => {
        setOpen(false);
        setDrawing(false);
        clearMapLayers();
        setPoints([]);
        setProfileData([]);
        setError(null);
        setTab('medir');
        if (mapInstance) mapInstance.getContainer().style.cursor = '';
    }, [mapInstance, clearMapLayers]);

    const handleReset = useCallback(() => {
        clearMapLayers();
        setPoints([]);
        setProfileData([]);
        setError(null);
        setTab('medir');
        setDrawing(false);
        if (mapInstance) mapInstance.getContainer().style.cursor = '';
    }, [mapInstance, clearMapLayers]);

    // ── Hover en gráfico → mover marcador en el mapa ─────────────────────────

    const handleChartHover = useCallback((point: ElevationPoint | null) => {
        setHoveredPoint(point);

        if (point && mapInstance) {
            const idx = profileData.indexOf(point);
            setHoveredIdx(idx >= 0 ? idx : null);

            const latlng: L.LatLngExpression = [point.lat, point.lng];
            if (hoverMarkerRef.current) {
                hoverMarkerRef.current.setLatLng(latlng);
            } else {
                hoverMarkerRef.current = L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: '#1a2a3a',
                    color: '#7ecfff',
                    weight: 2,
                    fillOpacity: 0.95,
                    className: 'ep-hover-map-marker',
                }).addTo(mapInstance);
            }
        } else {
            setHoveredIdx(null);
            hoverMarkerRef.current?.remove();
            hoverMarkerRef.current = null;
        }
    }, [mapInstance, profileData]);

    // ── Estadísticas del perfil ───────────────────────────────────────────────

    const stats = React.useMemo(() => {
        if (!profileData.length) return null;
        const elevs = profileData.map(p => p.elevation);
        return {
            min: Math.min(...elevs),
            max: Math.max(...elevs),
            start: elevs[0],
            end: elevs[elevs.length - 1],
            totalDist: profileData[profileData.length - 1].distance,
        };
    }, [profileData]);

    // ─── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="ep-wrapper">
            {/* Botón flotante */}
            <button
                className={`ep-fab ${open ? 'ep-fab--active' : ''}`}
                onClick={() => (open ? handleClose() : setOpen(true))}
                title="Perfil de elevación"
            >                
                Perfil de Elevación
            </button>

            {/* Panel */}
            {open && (
                <div className="ep-panel">
                    {/* Encabezado */}
                    <div className="ep-header">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 18l5-8 4 5 3-4 6 7H3z" />
                        </svg>
                        <span>Perfil de elevación</span>
                        <div className="ep-header-actions">
                            {profileData.length > 0 && (
                                <button className="ep-icon-btn" onClick={handleReset} title="Nueva medición">↺</button>
                            )}
                            <button className="ep-icon-btn ep-close-btn" onClick={handleClose} title="Cerrar">✕</button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="ep-tabs">
                        <button
                            className={`ep-tab ${tab === 'medir' ? 'ep-tab--active' : ''}`}
                            onClick={() => setTab('medir')}
                        >
                            Medir
                        </button>
                        <button
                            className={`ep-tab ${tab === 'resultado' ? 'ep-tab--active' : ''}`}
                            onClick={() => setTab('resultado')}
                            disabled={!profileData.length}
                        >
                            Resultado del Perfil
                        </button>
                    </div>

                    {/* Contenido: tab Medir */}
                    {tab === 'medir' && (
                        <div className="ep-body">
                            <p className="ep-instructions">
                                Use la herramienta para <strong>dibujar una línea</strong> en el
                                mapa para el cual se desea ver el perfil de elevación.
                                <br />
                                <em>Doble clic para finalizar.</em>
                            </p>

                            <p className="ep-label">Escoge la resolución del Modelo:</p>

                            {/* Selector de resolución */}
                            <div className="ep-res-selector">
                                <button
                                    className="ep-res-trigger"
                                    onClick={() => setResOpen(o => !o)}
                                >
                                    {resolution.label}
                                    <span className="ep-res-arrow">{resOpen ? '▲' : '▼'}</span>
                                </button>
                                {resOpen && (
                                    <div className="ep-res-dropdown">
                                        {RESOLUTIONS.map(r => (
                                            <button
                                                key={r.label}
                                                className={`ep-res-option ${r.label === resolution.label ? 'ep-res-option--active' : ''}`}
                                                onClick={() => { setResolution(r); setResOpen(false); }}
                                            >
                                                {r.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {error && <p className="ep-error">{error}</p>}

                            <button
                                className={`ep-draw-btn ${drawing ? 'ep-draw-btn--active' : ''}`}
                                onClick={drawing ? finishDrawing : startDrawing}
                                disabled={loading}
                            >
                                {loading
                                    ? '⏳ Obteniendo elevaciones…'
                                    : drawing
                                    ? `✔ Finalizar línea (${points.length} pts)`
                                    : '✏ Dibujar línea en el mapa'}
                            </button>

                            {drawing && (
                                <p className="ep-hint">
                                    Haz clic en el mapa para agregar puntos.
                                    Doble clic o usa el botón para finalizar.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Contenido: tab Resultado */}
                    {tab === 'resultado' && profileData.length > 0 && (
                        <div className="ep-body ep-body--chart">
                            <p className="ep-chart-hint">
                                Pase el mouse sobre el gráfico Perfil de elevación para
                                mostrar las elevaciones y mostrar la ubicación en el mapa.
                            </p>

                            {hoveredPoint && (
                                <div className="ep-hover-badge">
                                    <span className="ep-hover-elev">
                                        {hoveredPoint.elevation.toFixed(0)} Metros
                                    </span>
                                    <span className={`ep-hover-delta ${hoveredPoint.elevation - profileData[0].elevation >= 0 ? 'ep-hover-delta--pos' : 'ep-hover-delta--neg'}`}>
                                        {(hoveredPoint.elevation - profileData[0].elevation) >= 0 ? '+' : ''}
                                        {(hoveredPoint.elevation - profileData[0].elevation).toFixed(2)}
                                    </span>
                                </div>
                            )}

                            <p className="ep-chart-title">Perfil de Elevación</p>

                            <div className="ep-chart-area">
                                <div className="ep-y-label">Elevación en Metros</div>
                                <ProfileChart
                                    data={profileData}
                                    onHover={handleChartHover}
                                    hoveredIdx={hoveredIdx}
                                />
                            </div>
                            <p className="ep-x-label">Distancia en Kilómetros</p>

                            {stats && (
                                <div className="ep-stats">
                                    <div className="ep-stat">
                                        <span className="ep-stat-label">Mín</span>
                                        <span className="ep-stat-val">{stats.min.toFixed(0)} m</span>
                                    </div>
                                    <div className="ep-stat">
                                        <span className="ep-stat-label">Máx</span>
                                        <span className="ep-stat-val">{stats.max.toFixed(0)} m</span>
                                    </div>
                                    <div className="ep-stat">
                                        <span className="ep-stat-label">Distancia</span>
                                        <span className="ep-stat-val">{stats.totalDist.toFixed(2)} km</span>
                                    </div>
                                    <div className="ep-stat">
                                        <span className="ep-stat-label">Δ Elev</span>
                                        <span className="ep-stat-val">{(stats.end - stats.start).toFixed(0)} m</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ElevationProfile;