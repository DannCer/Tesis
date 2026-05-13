/**
 * @fileoverview DrawTool — Panel flotante de dibujo sobre el mapa.
 *
 * Modos soportados:
 *  - Punto            (marcador con símbolo personalizable)
 *  - Línea            (segmento recto, 2 clics)
 *  - Polilínea        (línea de múltiples vértices)
 *  - Polilínea a mano alzada (arrastre libre)
 *  - Triángulo        (polígono de 3 vértices)
 *  - Extensión / BBox (rectángulo)
 *  - Círculo
 *  - Elipse
 *  - Polígono         (polígono cerrado de N vértices)
 *  - Polígono a mano alzada
 *  - Texto            (etiqueta que se coloca al hacer clic)
 *
 * @module components/map/tools/DrawTool
 */

import React, {
    useEffect, useRef, useState, useCallback, useMemo,
} from 'react';
import L from 'leaflet';
import '@styles/DrawTool.css';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type DrawMode =
    | 'punto'
    | 'linea'
    | 'polilinea'
    | 'polilinea-alzada'
    | 'triangulo'
    | 'extension'
    | 'circulo'
    | 'elipse'
    | 'poligono'
    | 'poligono-alzada'
    | 'texto';

interface DrawToolProps {
    mapInstance: L.Map | null;
    isOpen: boolean;
    onClose: () => void;
}

// ─── Paleta de estilos por defecto ────────────────────────────────────────────

const DEFAULT_POINT_STYLE = {
    symbol: 0,           // índice en POINT_SYMBOLS
    category: 'Básico',
    size: 24,
    color: '#0000CC',
    opacity: 0.5,
    outlineColor: '#0000CC',
    outlineWidth: 1,
};

const DEFAULT_LINE_STYLE = {
    presetIndex: 0,
    color: '#6aaa2e',
    styleType: 'Continuo',
    opacity: 0,
    width: 3,
    showMeasure: false,
};

const DEFAULT_POLY_STYLE = {
    presetIndex: 0,
    color: '#6aaa2e',
    opacity: 0.5,
    outlineColor: '#6aaa2e',
    outlineWidth: 2,
    showMeasure: false,
};

const DEFAULT_TEXT_STYLE = {
    text: '',
    fontColor: '#000000',
    fontSize: 20,
};

// ─── Definición de modos ───────────────────────────────────────────────────────

interface ModeDef {
    id: DrawMode;
    label: string;
    icon: string;        // SVG path data o emoji
    svgIcon?: string;    // SVG completo
}

const MODES: ModeDef[] = [
    { id: 'punto',           label: 'Punto',                    icon: 'punto'    },
    { id: 'linea',           label: 'Línea',                    icon: 'linea'    },
    { id: 'polilinea',       label: 'Polilínea',                icon: 'poli'     },
    { id: 'polilinea-alzada',label: 'Polilínea a mano alzada',  icon: 'alzada'   },
    { id: 'triangulo',       label: 'Triángulo',                icon: 'tri'      },
    { id: 'extension',       label: 'Extensión',                icon: 'ext'      },
    { id: 'circulo',         label: 'Círculo',                  icon: 'circ'     },
    { id: 'elipse',          label: 'Elipse',                   icon: 'elipse'   },
    { id: 'poligono',        label: 'Polígono',                 icon: 'poly'     },
    { id: 'poligono-alzada', label: 'Polígono a mano alzada',   icon: 'polyalz'  },
    { id: 'texto',           label: 'Texto',                    icon: 'texto'    },
];

// ─── Símbolos de punto (SVG mini para el grid) ────────────────────────────────

const POINT_CATEGORIES = ['Básico', 'Pines', 'Estrellas'];

// Colores base del catálogo
const CAT_COLORS = ['#4040e8','#cc0000','#6aaa2e','#8800cc','#0099cc','#ff8800','#8888cc','#cc4444'];

// Presets de línea (color, dash)
const LINE_PRESETS: Array<{ color: string; dash?: string }> = [
    { color: '#4040e8' }, { color: '#cc0000' }, { color: '#6aaa2e' },
    { color: '#8800cc' }, { color: '#0099cc' }, { color: '#ff8800' },
    { color: '#8888cc' }, { color: '#cc4444' },
    { color: '#4040e8', dash: '8,4' }, { color: '#cc0000', dash: '8,4' },
    { color: '#6aaa2e', dash: '8,4' }, { color: '#8800cc', dash: '8,4' },
    { color: '#0099cc', dash: '8,4' }, { color: '#ff8800', dash: '8,4' },
    { color: '#8888cc', dash: '8,4' }, { color: '#cc4444', dash: '8,4' },
    { color: '#4040e8', dash: '2,4' }, { color: '#cc0000', dash: '2,4' },
    { color: '#6aaa2e', dash: '2,4' }, { color: '#8800cc', dash: '2,4' },
    { color: '#0099cc', dash: '2,4' }, { color: '#ff8800', dash: '2,4' },
    { color: '#8888cc', dash: '2,4' }, { color: '#cc4444', dash: '2,4' },
];

// Presets de polígono (triángulo, bandera similar)
const POLY_PRESETS: Array<{ color: string; fill: string }> = CAT_COLORS.map(c => ({ color: c, fill: c + '99' }))
    .concat(CAT_COLORS.map(c => ({ color: c + '55', fill: c + '33' })))
    .concat(CAT_COLORS.map(c => ({ color: '#222', fill: c + '88' })));

const DASH_OPTIONS = ['Continuo', 'Discontinuo', 'Punteado'];

// ─── Helpers de conversión ────────────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function opacityToAlpha(opacity01: number) { return 1 - opacity01; }

function dashToArray(styleType: string, width: number): string | undefined {
    if (styleType === 'Discontinuo') return `${width * 4},${width * 2}`;
    if (styleType === 'Punteado')    return `${width},${width * 2}`;
    return undefined;
}

// ─── Sub-componente: icono SVG del modo ────────────────────────────────────────

const ModeIcon: React.FC<{ icon: string; active: boolean }> = ({ icon, active }) => {
    const col = active ? '#fff' : '#555';
    switch (icon) {
        case 'punto':   return <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="5" fill={col}/></svg>;
        case 'linea':   return <svg viewBox="0 0 20 20"><line x1="3" y1="17" x2="17" y2="3" stroke={col} strokeWidth="2"/></svg>;
        case 'poli':    return <svg viewBox="0 0 20 20"><polyline points="3,17 8,5 14,12 17,4" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'alzada':  return <svg viewBox="0 0 20 20"><path d="M3,14 Q6,4 10,10 Q14,16 17,6" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'tri':     return <svg viewBox="0 0 20 20"><polygon points="10,3 17,17 3,17" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'ext':     return <svg viewBox="0 0 20 20"><rect x="3" y="5" width="14" height="10" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'circ':    return <svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'elipse':  return <svg viewBox="0 0 20 20"><ellipse cx="10" cy="10" rx="8" ry="5" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'poly':    return <svg viewBox="0 0 20 20"><polygon points="10,3 17,8 14,17 6,17 3,8" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'polyalz': return <svg viewBox="0 0 20 20"><path d="M5,14 Q8,4 12,10 Q15,14 17,8 L17,15 L5,15 Z" fill="none" stroke={col} strokeWidth="2"/></svg>;
        case 'texto':   return <svg viewBox="0 0 20 20"><text x="4" y="15" fontSize="14" fill={col} fontWeight="bold" fontFamily="serif">A</text></svg>;
        default:        return <svg viewBox="0 0 20 20"/>;
    }
};

// ─── Sub-componente: previsualización del punto ────────────────────────────────

const PointPreview: React.FC<{ size: number; color: string; opacity: number }> = ({ size, color, opacity }) => (
    <svg width={size} height={size} viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8" fill={hexToRgba(color, opacityToAlpha(opacity))} stroke={color} strokeWidth="1.5"/>
    </svg>
);

// ─── Sub-componente: grid de presets de línea ─────────────────────────────────

const LinePresetGrid: React.FC<{ selected: number; onSelect: (i: number) => void }> = ({ selected, onSelect }) => (
    <div className="dt-preset-grid dt-preset-grid--line">
        {LINE_PRESETS.map((p, i) => (
            <div
                key={i}
                className={`dt-preset-item dt-preset-item--line ${selected === i ? 'dt-preset-item--active' : ''}`}
                onClick={() => onSelect(i)}
            >
                <svg width="44" height="10" viewBox="0 0 44 10">
                    <line x1="2" y1="5" x2="42" y2="5"
                        stroke={p.color} strokeWidth="3"
                        strokeDasharray={p.dash}
                    />
                </svg>
            </div>
        ))}
    </div>
);

// ─── Sub-componente: grid de presets de polígono ──────────────────────────────

const PolyPresetGrid: React.FC<{ selected: number; onSelect: (i: number) => void }> = ({ selected, onSelect }) => (
    <div className="dt-preset-grid dt-preset-grid--poly">
        {POLY_PRESETS.map((p, i) => (
            <div
                key={i}
                className={`dt-preset-item dt-preset-item--poly ${selected === i ? 'dt-preset-item--active' : ''}`}
                onClick={() => onSelect(i)}
            >
                <svg width="28" height="28" viewBox="0 0 28 28">
                    <polygon points="14,2 26,26 2,26" fill={p.fill} stroke={p.color} strokeWidth="2"/>
                </svg>
            </div>
        ))}
    </div>
);

// ─── Sub-componente: grid de símbolos de punto ────────────────────────────────

const PointSymbolGrid: React.FC<{ selected: number; color: string; onSelect: (i: number) => void }> = ({ selected, color, onSelect }) => {
    const items: JSX.Element[] = [];
    // Básico: círculo, cuadrado, diamante, +, x, ⊗
    const basicShapes = ['circle','square','diamond','plus','cross','xcircle'];
    basicShapes.forEach((s, i) => {
        items.push(
            <div key={`b${i}`} className={`dt-sym-item ${selected === i ? 'dt-sym-item--active' : ''}`} onClick={() => onSelect(i)}>
                <ShapeIcon shape={s} color={color}/>
            </div>
        );
    });
    // Pines (índices 6-13)
    CAT_COLORS.forEach((c, i) => {
        items.push(
            <div key={`p${i}`} className={`dt-sym-item ${selected === i + 6 ? 'dt-sym-item--active' : ''}`} onClick={() => onSelect(i + 6)}>
                <svg width="20" height="28" viewBox="0 0 20 28"><circle cx="10" cy="10" r="8" fill={c}/><line x1="10" y1="18" x2="10" y2="28" stroke={c} strokeWidth="2"/></svg>
            </div>
        );
    });
    // Estrellas (índices 14-21)
    CAT_COLORS.forEach((c, i) => {
        items.push(
            <div key={`s${i}`} className={`dt-sym-item ${selected === i + 14 ? 'dt-sym-item--active' : ''}`} onClick={() => onSelect(i + 14)}>
                <svg width="24" height="24" viewBox="0 0 24 24">
                    <polygon points="12,2 15,9 22,9 16,14 18,21 12,17 6,21 8,14 2,9 9,9" fill={c}/>
                </svg>
            </div>
        );
    });
    return <div className="dt-sym-grid">{items}</div>;
};

const ShapeIcon: React.FC<{ shape: string; color: string }> = ({ shape, color }) => {
    switch (shape) {
        case 'circle':  return <svg width="20" height="20"><circle cx="10" cy="10" r="8" fill={color}/></svg>;
        case 'square':  return <svg width="20" height="20"><rect x="2" y="2" width="16" height="16" fill={color}/></svg>;
        case 'diamond': return <svg width="20" height="20"><polygon points="10,2 18,10 10,18 2,10" fill={color}/></svg>;
        case 'plus':    return <svg width="20" height="20"><line x1="10" y1="2" x2="10" y2="18" stroke={color} strokeWidth="3"/><line x1="2" y1="10" x2="18" y2="10" stroke={color} strokeWidth="3"/></svg>;
        case 'cross':   return <svg width="20" height="20"><line x1="3" y1="3" x2="17" y2="17" stroke={color} strokeWidth="3"/><line x1="17" y1="3" x2="3" y2="17" stroke={color} strokeWidth="3"/></svg>;
        case 'xcircle': return <svg width="20" height="20"><circle cx="10" cy="10" r="8" fill="none" stroke={color} strokeWidth="2"/><line x1="5" y1="5" x2="15" y2="15" stroke={color} strokeWidth="2"/><line x1="15" y1="5" x2="5" y2="15" stroke={color} strokeWidth="2"/></svg>;
        default:        return <svg width="20" height="20"/>;
    }
};

// ─── Previsualización de forma según modo polígono ────────────────────────────

interface PolyShapePreviewProps {
    mode: DrawMode;
    fill: string;
    stroke: string;
    strokeWidth: number;
}

const PolyShapePreview: React.FC<PolyShapePreviewProps> = ({ mode, fill, stroke, strokeWidth }) => {
    const sw = Math.max(1, Math.min(strokeWidth, 3));
    const common = { fill, stroke, strokeWidth: sw };

    switch (mode) {
        case 'triangulo':
            return (
                <svg width="36" height="32" viewBox="0 0 36 32">
                    <polygon points="18,2 34,30 2,30" {...common}/>
                </svg>
            );
        case 'extension':
            return (
                <svg width="44" height="30" viewBox="0 0 44 30">
                    <rect x="2" y="4" width="40" height="22" {...common}/>
                </svg>
            );
        case 'circulo':
            return (
                <svg width="34" height="34" viewBox="0 0 34 34">
                    <circle cx="17" cy="17" r="14" {...common}/>
                </svg>
            );
        case 'elipse':
            return (
                <svg width="44" height="30" viewBox="0 0 44 30">
                    <ellipse cx="22" cy="15" rx="20" ry="12" {...common}/>
                </svg>
            );
        case 'poligono':
            // Pentágono regular
            return (
                <svg width="34" height="34" viewBox="0 0 34 34">
                    <polygon
                        points={Array.from({ length: 5 }, (_, i) => {
                            const a = (i * 72 - 90) * Math.PI / 180;
                            return `${17 + 14 * Math.cos(a)},${17 + 14 * Math.sin(a)}`;
                        }).join(' ')}
                        {...common}
                    />
                </svg>
            );
        case 'poligono-alzada':
            // Forma irregular tipo "mano alzada"
            return (
                <svg width="40" height="34" viewBox="0 0 40 34">
                    <path
                        d="M6,28 Q10,6 16,14 Q22,22 28,10 Q32,4 36,18 L34,30 L6,30 Z"
                        {...common}
                    />
                </svg>
            );
        default:
            return (
                <svg width="36" height="32" viewBox="0 0 36 32">
                    <polygon points="18,2 34,30 2,30" {...common}/>
                </svg>
            );
    }
};

// ─── Componente principal ─────────────────────────────────────────────────────

const DrawTool: React.FC<DrawToolProps> = ({ mapInstance, isOpen, onClose }) => {
    const [activeMode, setActiveMode] = useState<DrawMode | null>(null);

    // Estilos
    const [ptStyle, setPtStyle] = useState({ ...DEFAULT_POINT_STYLE });
    const [lnStyle, setLnStyle] = useState({ ...DEFAULT_LINE_STYLE });
    const [pyStyle, setPyStyle] = useState({ ...DEFAULT_POLY_STYLE });
    const [txStyle, setTxStyle] = useState({ ...DEFAULT_TEXT_STYLE });

    // Historial de capas dibujadas (para deshacer/rehacer)
    const historyRef  = useRef<L.Layer[]>([]);
    const redoRef     = useRef<L.Layer[]>([]);
    const groupRef    = useRef<L.LayerGroup | null>(null);

    // Estado de dibujo en curso
    const drawingRef  = useRef(false);
    const pointsRef   = useRef<L.LatLng[]>([]);
    const tempLayersRef = useRef<L.Layer[]>([]);
    const [, forceUpdate] = useState(0);
    const rerender = useCallback(() => forceUpdate(n => n + 1), []);

    // ── Inicializar grupo ──────────────────────────────────────────────────────

    useEffect(() => {
        if (!mapInstance) return;
        const group = L.layerGroup().addTo(mapInstance);
        groupRef.current = group;
        return () => { group.remove(); };
    }, [mapInstance]);

    // ── Limpiar listeners al cerrar o cambiar modo ─────────────────────────────

    const cleanupDraw = useCallback(() => {
        if (!mapInstance) return;
        mapInstance.off('click');
        mapInstance.off('mousemove');
        mapInstance.off('mousedown');
        mapInstance.off('mouseup');
        mapInstance.dragging.enable();
        mapInstance.getContainer().style.cursor = '';
        // Eliminar capas temporales
        tempLayersRef.current.forEach(l => l.remove());
        tempLayersRef.current = [];
        pointsRef.current = [];
        drawingRef.current = false;
    }, [mapInstance]);

    useEffect(() => {
        if (!isOpen) {
            cleanupDraw();
            setActiveMode(null);
        }
    }, [isOpen, cleanupDraw]);

    // ── Obtener opciones de estilo de línea según modo ─────────────────────────

    const lineOptions = useCallback((): L.PolylineOptions => {
        const preset = LINE_PRESETS[lnStyle.presetIndex] ?? LINE_PRESETS[0];
        const color = lnStyle.color;
        const dash  = dashToArray(lnStyle.styleType, lnStyle.width);
        return {
            color,
            weight: lnStyle.width,
            opacity: opacityToAlpha(lnStyle.opacity),
            dashArray: dash,
        };
    }, [lnStyle]);

    const polyOptions = useCallback((): L.PathOptions => {
        return {
            color:       pyStyle.outlineColor,
            weight:      pyStyle.outlineWidth,
            fillColor:   pyStyle.color,
            fillOpacity: opacityToAlpha(pyStyle.opacity),
            opacity:     1,
        };
    }, [pyStyle]);

    // ── Helpers de historial ───────────────────────────────────────────────────

    const addToHistory = useCallback((layer: L.Layer) => {
        historyRef.current.push(layer);
        redoRef.current = [];
        rerender();
    }, [rerender]);

    const handleUndo = useCallback(() => {
        const layer = historyRef.current.pop();
        if (layer) {
            groupRef.current?.removeLayer(layer);
            redoRef.current.push(layer);
            rerender();
        }
    }, [rerender]);

    const handleRedo = useCallback(() => {
        const layer = redoRef.current.pop();
        if (layer) {
            groupRef.current?.addLayer(layer);
            historyRef.current.push(layer);
            rerender();
        }
    }, [rerender]);

    const handleClear = useCallback(() => {
        groupRef.current?.clearLayers();
        historyRef.current = [];
        redoRef.current = [];
        rerender();
    }, [rerender]);

    // ── Crear marcador de punto ────────────────────────────────────────────────

    const createPointMarker = useCallback((latlng: L.LatLng): L.Layer => {
        const size = ptStyle.size;
        const color = ptStyle.color;
        const idx = ptStyle.symbol;
        let svgContent = '';
        if (idx < 6) {
            const shapes = ['circle','square','diamond','plus','cross','xcircle'];
            const s = shapes[idx];
            const half = size / 2;
            switch (s) {
                case 'circle':  svgContent = `<circle cx="${half}" cy="${half}" r="${half - 1}" fill="${color}" opacity="${opacityToAlpha(ptStyle.opacity)}"/>`; break;
                case 'square':  svgContent = `<rect x="1" y="1" width="${size - 2}" height="${size - 2}" fill="${color}" opacity="${opacityToAlpha(ptStyle.opacity)}"/>`; break;
                case 'diamond': svgContent = `<polygon points="${half},1 ${size-1},${half} ${half},${size-1} 1,${half}" fill="${color}" opacity="${opacityToAlpha(ptStyle.opacity)}"/>`; break;
                case 'plus':    svgContent = `<line x1="${half}" y1="2" x2="${half}" y2="${size-2}" stroke="${color}" stroke-width="3"/><line x1="2" y1="${half}" x2="${size-2}" y2="${half}" stroke="${color}" stroke-width="3"/>`; break;
                case 'cross':   svgContent = `<line x1="3" y1="3" x2="${size-3}" y2="${size-3}" stroke="${color}" stroke-width="3"/><line x1="${size-3}" y1="3" x2="3" y2="${size-3}" stroke="${color}" stroke-width="3"/>`; break;
                case 'xcircle': svgContent = `<circle cx="${half}" cy="${half}" r="${half-1}" fill="none" stroke="${color}" stroke-width="2"/><line x1="4" y1="4" x2="${size-4}" y2="${size-4}" stroke="${color}" stroke-width="2"/><line x1="${size-4}" y1="4" x2="4" y2="${size-4}" stroke="${color}" stroke-width="2"/>`; break;
            }
        } else if (idx < 14) {
            const c = CAT_COLORS[(idx - 6) % CAT_COLORS.length];
            svgContent = `<circle cx="${size/2}" cy="${size/2 - 2}" r="${size/2 - 2}" fill="${c}"/><line x1="${size/2}" y1="${size - 4}" x2="${size/2}" y2="${size}" stroke="${c}" stroke-width="2"/>`;
        } else {
            const c = CAT_COLORS[(idx - 14) % CAT_COLORS.length];
            const pts = Array.from({length: 10}, (_, i) => {
                const angle = (i * 36 - 90) * Math.PI / 180;
                const r = i % 2 === 0 ? size / 2 - 1 : size / 4;
                return `${size/2 + r * Math.cos(angle)},${size/2 + r * Math.sin(angle)}`;
            }).join(' ');
            svgContent = `<polygon points="${pts}" fill="${c}"/>`;
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${svgContent}</svg>`;
        const icon = L.divIcon({
            html: svg,
            iconSize: [size, size],
            iconAnchor: [size / 2, size / 2],
            className: 'dt-custom-marker',
        });
        return L.marker(latlng, { icon });
    }, [ptStyle]);

    // ── Crear texto en el mapa ────────────────────────────────────────────────

    const createTextMarker = useCallback((latlng: L.LatLng): L.Layer => {
        const icon = L.divIcon({
            html: `<span style="font-size:${txStyle.fontSize}px;color:${txStyle.fontColor};white-space:nowrap;pointer-events:none;text-shadow:0 0 3px #fff,0 0 3px #fff;">${txStyle.text || 'Texto'}</span>`,
            className: 'dt-text-marker',
            iconAnchor: [0, txStyle.fontSize / 2],
        });
        return L.marker(latlng, { icon });
    }, [txStyle]);

    // ── Activar modo de dibujo ────────────────────────────────────────────────

    const activateMode = useCallback((mode: DrawMode) => {
        if (!mapInstance) return;
        cleanupDraw();
        setActiveMode(mode);

        mapInstance.getContainer().style.cursor = 'crosshair';
        const group = groupRef.current!;

        // ── PUNTO ──────────────────────────────────────────────────────────────
        if (mode === 'punto') {
            mapInstance.on('click', (e: L.LeafletMouseEvent) => {
                const marker = createPointMarker(e.latlng);
                group.addLayer(marker);
                addToHistory(marker);
            });
            return;
        }

        // ── TEXTO ──────────────────────────────────────────────────────────────
        if (mode === 'texto') {
            mapInstance.on('click', (e: L.LeafletMouseEvent) => {
                const marker = createTextMarker(e.latlng);
                group.addLayer(marker);
                addToHistory(marker);
            });
            return;
        }

        // ── LÍNEA (2 clics) ───────────────────────────────────────────────────
        if (mode === 'linea') {
            let first: L.LatLng | null = null;
            let tempLine: L.Polyline | null = null;
            mapInstance.on('click', (e: L.LeafletMouseEvent) => {
                if (!first) {
                    first = e.latlng;
                } else {
                    if (tempLine) { tempLine.remove(); }
                    const line = L.polyline([first, e.latlng], lineOptions());
                    group.addLayer(line);
                    addToHistory(line);
                    first = null;
                    tempLine = null;
                }
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!first) return;
                if (tempLine) tempLine.remove();
                tempLine = L.polyline([first, e.latlng], { ...lineOptions(), opacity: 0.5 }).addTo(mapInstance);
                tempLayersRef.current = [tempLine];
            });
            return;
        }

        // ── POLILÍNEA (N clics, doble clic cierra) ───────────────────────────
        if (mode === 'polilinea') {
            const pts: L.LatLng[] = [];
            let tempLine: L.Polyline | null = null;
            mapInstance.on('click', (e: L.LeafletMouseEvent) => {
                pts.push(e.latlng);
                if (pts.length >= 2) {
                    if (tempLine) tempLine.remove();
                    tempLine = L.polyline(pts, { ...lineOptions(), opacity: 0.5 }).addTo(mapInstance);
                    tempLayersRef.current = [tempLine];
                }
            });
            mapInstance.on('dblclick', (e: L.LeafletMouseEvent) => {
                e.originalEvent.preventDefault();
                if (pts.length >= 2) {
                    if (tempLine) tempLine.remove();
                    const line = L.polyline(pts, lineOptions());
                    group.addLayer(line);
                    addToHistory(line);
                }
                pts.length = 0;
                tempLayersRef.current = [];
                tempLine = null;
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (pts.length === 0) return;
                if (tempLine) tempLine.remove();
                tempLine = L.polyline([...pts, e.latlng], { ...lineOptions(), opacity: 0.5 }).addTo(mapInstance);
                tempLayersRef.current = [tempLine];
            });
            return;
        }

        // ── POLILÍNEA A MANO ALZADA ───────────────────────────────────────────
        if (mode === 'polilinea-alzada') {
            let pts: L.LatLng[] = [];
            let tempLine: L.Polyline | null = null;
            mapInstance.on('mousedown', () => {
                pts = [];
                drawingRef.current = true;
                mapInstance.dragging.disable();
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current) return;
                pts.push(e.latlng);
                if (tempLine) tempLine.remove();
                if (pts.length >= 2) {
                    tempLine = L.polyline(pts, { ...lineOptions(), opacity: 0.7 }).addTo(mapInstance);
                    tempLayersRef.current = [tempLine];
                }
            });
            mapInstance.on('mouseup', () => {
                if (!drawingRef.current) return;
                drawingRef.current = false;
                mapInstance.dragging.enable();
                if (tempLine) tempLine.remove();
                if (pts.length >= 2) {
                    const line = L.polyline(pts, lineOptions());
                    group.addLayer(line);
                    addToHistory(line);
                }
                pts = [];
                tempLayersRef.current = [];
                tempLine = null;
            });
            return;
        }

        // ── TRIÁNGULO (3 clics) ───────────────────────────────────────────────
        if (mode === 'triangulo') {
            const pts: L.LatLng[] = [];
            let tempPoly: L.Polygon | null = null;
            mapInstance.on('click', (e: L.LeafletMouseEvent) => {
                pts.push(e.latlng);
                if (pts.length === 3) {
                    if (tempPoly) tempPoly.remove();
                    const poly = L.polygon(pts, polyOptions());
                    group.addLayer(poly);
                    addToHistory(poly);
                    pts.length = 0;
                    tempLayersRef.current = [];
                    tempPoly = null;
                }
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (pts.length === 0) return;
                if (tempPoly) tempPoly.remove();
                const preview = pts.length === 1 ? [pts[0], e.latlng, e.latlng] : [pts[0], pts[1], e.latlng];
                tempPoly = L.polygon(preview, { ...polyOptions(), fillOpacity: 0.2 }).addTo(mapInstance);
                tempLayersRef.current = [tempPoly];
            });
            return;
        }

        // ── EXTENSIÓN / BBOX ──────────────────────────────────────────────────
        if (mode === 'extension') {
            let start: L.LatLng | null = null;
            let tempRect: L.Rectangle | null = null;
            mapInstance.on('mousedown', (e: L.LeafletMouseEvent) => {
                start = e.latlng;
                drawingRef.current = true;
                mapInstance.dragging.disable();
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current || !start) return;
                if (tempRect) tempRect.remove();
                tempRect = L.rectangle([start, e.latlng], { ...polyOptions(), fillOpacity: 0.2 }).addTo(mapInstance);
                tempLayersRef.current = [tempRect];
            });
            mapInstance.on('mouseup', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current || !start) return;
                drawingRef.current = false;
                mapInstance.dragging.enable();
                if (tempRect) tempRect.remove();
                const rect = L.rectangle([start, e.latlng], polyOptions());
                group.addLayer(rect);
                addToHistory(rect);
                start = null;
                tempRect = null;
                tempLayersRef.current = [];
            });
            return;
        }

        // ── CÍRCULO (clic + arrastre) ─────────────────────────────────────────
        if (mode === 'circulo') {
            let center: L.LatLng | null = null;
            let tempCirc: L.Circle | null = null;
            mapInstance.on('mousedown', (e: L.LeafletMouseEvent) => {
                center = e.latlng;
                drawingRef.current = true;
                mapInstance.dragging.disable();
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current || !center) return;
                const r = center.distanceTo(e.latlng);
                if (tempCirc) tempCirc.remove();
                tempCirc = L.circle(center, { radius: r, ...polyOptions(), fillOpacity: 0.2 }).addTo(mapInstance);
                tempLayersRef.current = [tempCirc];
            });
            mapInstance.on('mouseup', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current || !center) return;
                drawingRef.current = false;
                mapInstance.dragging.enable();
                if (tempCirc) tempCirc.remove();
                const r = center.distanceTo(e.latlng);
                if (r > 0) {
                    const circ = L.circle(center, { radius: r, ...polyOptions() });
                    group.addLayer(circ);
                    addToHistory(circ);
                }
                center = null;
                tempCirc = null;
                tempLayersRef.current = [];
            });
            return;
        }

        // ── ELIPSE (aproximada con polígono) ──────────────────────────────────
        if (mode === 'elipse') {
            let center: L.LatLng | null = null;
            let tempElipse: L.Polygon | null = null;
            const buildEllipse = (c: L.LatLng, rx: number, ry: number): L.LatLng[] => {
                return Array.from({ length: 64 }, (_, i) => {
                    const angle = (i / 64) * 2 * Math.PI;
                    const dlat = (ry * Math.sin(angle)) / 111320;
                    const dlng = (rx * Math.cos(angle)) / (111320 * Math.cos(c.lat * Math.PI / 180));
                    return L.latLng(c.lat + dlat, c.lng + dlng);
                });
            };
            mapInstance.on('mousedown', (e: L.LeafletMouseEvent) => {
                center = e.latlng;
                drawingRef.current = true;
                mapInstance.dragging.disable();
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current || !center) return;
                const rx = Math.abs(center.distanceTo(L.latLng(center.lat, e.latlng.lng)));
                const ry = Math.abs(center.distanceTo(L.latLng(e.latlng.lat, center.lng)));
                const pts = buildEllipse(center, rx, ry);
                if (tempElipse) tempElipse.remove();
                tempElipse = L.polygon(pts, { ...polyOptions(), fillOpacity: 0.2 }).addTo(mapInstance);
                tempLayersRef.current = [tempElipse];
            });
            mapInstance.on('mouseup', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current || !center) return;
                drawingRef.current = false;
                mapInstance.dragging.enable();
                if (tempElipse) tempElipse.remove();
                const rx = Math.abs(center.distanceTo(L.latLng(center.lat, e.latlng.lng)));
                const ry = Math.abs(center.distanceTo(L.latLng(e.latlng.lat, center.lng)));
                if (rx > 0 && ry > 0) {
                    const pts = buildEllipse(center, rx, ry);
                    const elipse = L.polygon(pts, polyOptions());
                    group.addLayer(elipse);
                    addToHistory(elipse);
                }
                center = null;
                tempElipse = null;
                tempLayersRef.current = [];
            });
            return;
        }

        // ── POLÍGONO (N clics, doble clic cierra) ─────────────────────────────
        if (mode === 'poligono') {
            const pts: L.LatLng[] = [];
            let tempPoly: L.Polygon | null = null;
            mapInstance.on('click', (e: L.LeafletMouseEvent) => {
                pts.push(e.latlng);
            });
            mapInstance.on('dblclick', (e: L.LeafletMouseEvent) => {
                e.originalEvent.preventDefault();
                if (pts.length >= 3) {
                    if (tempPoly) tempPoly.remove();
                    const poly = L.polygon(pts, polyOptions());
                    group.addLayer(poly);
                    addToHistory(poly);
                }
                pts.length = 0;
                tempLayersRef.current = [];
                tempPoly = null;
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (pts.length === 0) return;
                if (tempPoly) tempPoly.remove();
                tempPoly = L.polygon([...pts, e.latlng], { ...polyOptions(), fillOpacity: 0.2 }).addTo(mapInstance);
                tempLayersRef.current = [tempPoly];
            });
            return;
        }

        // ── POLÍGONO A MANO ALZADA ────────────────────────────────────────────
        if (mode === 'poligono-alzada') {
            let pts: L.LatLng[] = [];
            let tempPoly: L.Polygon | null = null;
            mapInstance.on('mousedown', () => {
                pts = [];
                drawingRef.current = true;
                mapInstance.dragging.disable();
            });
            mapInstance.on('mousemove', (e: L.LeafletMouseEvent) => {
                if (!drawingRef.current) return;
                pts.push(e.latlng);
                if (tempPoly) tempPoly.remove();
                if (pts.length >= 3) {
                    tempPoly = L.polygon(pts, { ...polyOptions(), fillOpacity: 0.2 }).addTo(mapInstance);
                    tempLayersRef.current = [tempPoly];
                }
            });
            mapInstance.on('mouseup', () => {
                if (!drawingRef.current) return;
                drawingRef.current = false;
                mapInstance.dragging.enable();
                if (tempPoly) tempPoly.remove();
                if (pts.length >= 3) {
                    const poly = L.polygon(pts, polyOptions());
                    group.addLayer(poly);
                    addToHistory(poly);
                }
                pts = [];
                tempLayersRef.current = [];
                tempPoly = null;
            });
            return;
        }
    }, [mapInstance, cleanupDraw, lineOptions, polyOptions, ptStyle, txStyle, createPointMarker, createTextMarker, addToHistory]);

    // ── Re-activar modo si cambian estilos para actualizar los closures ────────
    // (Solo re-activa si ya había un modo activo — no interrumpe al usuario)
    // Esto se maneja directamente en los handlers de clic porque usamos callbacks.

    // ── Seleccionar modo ───────────────────────────────────────────────────────

    const handleModeSelect = useCallback((mode: DrawMode) => {
        if (activeMode === mode) {
            // Desactivar
            cleanupDraw();
            setActiveMode(null);
        } else {
            activateMode(mode);
        }
    }, [activeMode, activateMode, cleanupDraw]);

    // ── Re-activar cuando cambian lineOptions o polyOptions ───────────────────
    useEffect(() => {
        if (activeMode && activeMode !== 'punto' && activeMode !== 'texto') {
            activateMode(activeMode);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lnStyle, pyStyle]);

    useEffect(() => {
        if (activeMode === 'punto') activateMode('punto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ptStyle]);

    useEffect(() => {
        if (activeMode === 'texto') activateMode('texto');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [txStyle]);

    // ── Determinar si el modo actual usa estilo de línea, polígono, punto o texto

    const isLineMode    = activeMode && ['linea','polilinea','polilinea-alzada'].includes(activeMode);
    const isPolyMode    = activeMode && ['triangulo','extension','circulo','elipse','poligono','poligono-alzada'].includes(activeMode);
    const isPointMode   = activeMode === 'punto';
    const isTextMode    = activeMode === 'texto';

    // ── Panel de opciones según modo ──────────────────────────────────────────

    const renderOptions = () => {
        if (!activeMode) return null;

        if (isPointMode) return (
            <div className="dt-options">
                <div className="dt-preview-row">
                    <span className="dt-label">Previsualización:</span>
                    <PointPreview size={ptStyle.size} color={ptStyle.color} opacity={ptStyle.opacity}/>
                </div>
                <PointSymbolGrid selected={ptStyle.symbol} color={ptStyle.color} onSelect={i => setPtStyle(s => ({ ...s, symbol: i }))}/>
                <div className="dt-field">
                    <label className="dt-label">Tamaño de símbolo:</label>
                    <div className="dt-spinner-row">
                        <input type="number" className="dt-spinner" min={8} max={64} value={ptStyle.size}
                            onChange={e => setPtStyle(s => ({ ...s, size: +e.target.value }))}/>
                        <div className="dt-spinner-btns">
                            <button onClick={() => setPtStyle(s => ({ ...s, size: Math.min(64, s.size + 1) }))}>▲</button>
                            <button onClick={() => setPtStyle(s => ({ ...s, size: Math.max(8, s.size - 1) }))}>▼</button>
                        </div>
                    </div>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Color:</label>
                    <input type="color" className="dt-color-input" value={ptStyle.color}
                        onChange={e => setPtStyle(s => ({ ...s, color: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Transparencia:</label>
                    <SliderRow value={ptStyle.opacity} onChange={v => setPtStyle(s => ({ ...s, opacity: v }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Color del contorno:</label>
                    <input type="color" className="dt-color-input" value={ptStyle.outlineColor}
                        onChange={e => setPtStyle(s => ({ ...s, outlineColor: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Ancho del contorno:</label>
                    <div className="dt-spinner-row">
                        <input type="number" className="dt-spinner" min={0} max={10} value={ptStyle.outlineWidth}
                            onChange={e => setPtStyle(s => ({ ...s, outlineWidth: +e.target.value }))}/>
                        <div className="dt-spinner-btns">
                            <button onClick={() => setPtStyle(s => ({ ...s, outlineWidth: Math.min(10, s.outlineWidth + 1) }))}>▲</button>
                            <button onClick={() => setPtStyle(s => ({ ...s, outlineWidth: Math.max(0, s.outlineWidth - 1) }))}>▼</button>
                        </div>
                    </div>
                </div>
            </div>
        );

        if (isLineMode) return (
            <div className="dt-options">
                <div className="dt-preview-row">
                    <span className="dt-label">Previsualización:</span>
                    <svg width="160" height="8"><line x1="0" y1="4" x2="160" y2="4"
                        stroke={lnStyle.color} strokeWidth={lnStyle.width}
                        strokeDasharray={dashToArray(lnStyle.styleType, lnStyle.width)}/></svg>
                </div>
                <LinePresetGrid selected={lnStyle.presetIndex} onSelect={i => {
                    const p = LINE_PRESETS[i];
                    setLnStyle(s => ({ ...s, presetIndex: i, color: p.color, styleType: p.dash ? (p.dash.includes(',4') && p.dash.startsWith('8') ? 'Discontinuo' : 'Punteado') : 'Continuo' }));
                }}/>
                <div className="dt-field">
                    <label className="dt-label">Color:</label>
                    <input type="color" className="dt-color-input" value={lnStyle.color}
                        onChange={e => setLnStyle(s => ({ ...s, color: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Estilo:</label>
                    <select className="dt-select" value={lnStyle.styleType}
                        onChange={e => setLnStyle(s => ({ ...s, styleType: e.target.value }))}>
                        {DASH_OPTIONS.map(o => <option key={o}>{o}</option>)}
                    </select>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Transparencia:</label>
                    <SliderRow value={lnStyle.opacity} onChange={v => setLnStyle(s => ({ ...s, opacity: v }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Ancho:</label>
                    <div className="dt-spinner-row">
                        <input type="number" className="dt-spinner" min={1} max={20} value={lnStyle.width}
                            onChange={e => setLnStyle(s => ({ ...s, width: +e.target.value }))}/>
                        <div className="dt-spinner-btns">
                            <button onClick={() => setLnStyle(s => ({ ...s, width: Math.min(20, s.width + 1) }))}>▲</button>
                            <button onClick={() => setLnStyle(s => ({ ...s, width: Math.max(1, s.width - 1) }))}>▼</button>
                        </div>
                    </div>
                </div>
                <label className="dt-checkbox-row">
                    <input type="checkbox" checked={lnStyle.showMeasure}
                        onChange={e => setLnStyle(s => ({ ...s, showMeasure: e.target.checked }))}/>
                    <span>Mostrar medidas</span>
                </label>
            </div>
        );

        if (isPolyMode) return (
            <div className="dt-options">
                <div className="dt-preview-row">
                    <span className="dt-label">Previsualización:</span>
                    <PolyShapePreview
                        mode={activeMode!}
                        fill={hexToRgba(pyStyle.color, opacityToAlpha(pyStyle.opacity))}
                        stroke={pyStyle.outlineColor}
                        strokeWidth={pyStyle.outlineWidth}
                    />
                </div>
                <PolyPresetGrid selected={pyStyle.presetIndex} onSelect={i => {
                    const p = POLY_PRESETS[i];
                    setPyStyle(s => ({ ...s, presetIndex: i, color: p.color, outlineColor: p.color }));
                }}/>
                <div className="dt-field">
                    <label className="dt-label">Color:</label>
                    <input type="color" className="dt-color-input" value={pyStyle.color}
                        onChange={e => setPyStyle(s => ({ ...s, color: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Transparencia:</label>
                    <SliderRow value={pyStyle.opacity} onChange={v => setPyStyle(s => ({ ...s, opacity: v }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Color del contorno:</label>
                    <input type="color" className="dt-color-input" value={pyStyle.outlineColor}
                        onChange={e => setPyStyle(s => ({ ...s, outlineColor: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Ancho del contorno:</label>
                    <div className="dt-spinner-row">
                        <input type="number" className="dt-spinner" min={0} max={10} value={pyStyle.outlineWidth}
                            onChange={e => setPyStyle(s => ({ ...s, outlineWidth: +e.target.value }))}/>
                        <div className="dt-spinner-btns">
                            <button onClick={() => setPyStyle(s => ({ ...s, outlineWidth: Math.min(10, s.outlineWidth + 1) }))}>▲</button>
                            <button onClick={() => setPyStyle(s => ({ ...s, outlineWidth: Math.max(0, s.outlineWidth - 1) }))}>▼</button>
                        </div>
                    </div>
                </div>
                <label className="dt-checkbox-row">
                    <input type="checkbox" checked={pyStyle.showMeasure}
                        onChange={e => setPyStyle(s => ({ ...s, showMeasure: e.target.checked }))}/>
                    <span>Mostrar medidas</span>
                </label>
            </div>
        );

        if (isTextMode) return (
            <div className="dt-options">
                <div className="dt-preview-row">
                    <span className="dt-label">Previsualización:</span>
                    <span style={{ fontSize: Math.min(txStyle.fontSize, 24), color: txStyle.fontColor }}>{txStyle.text || 'Texto'}</span>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Texto:</label>
                    <input type="text" className="dt-text-input" value={txStyle.text}
                        onChange={e => setTxStyle(s => ({ ...s, text: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Color de fuente:</label>
                    <input type="color" className="dt-color-input" value={txStyle.fontColor}
                        onChange={e => setTxStyle(s => ({ ...s, fontColor: e.target.value }))}/>
                </div>
                <div className="dt-field">
                    <label className="dt-label">Tamaño de fuente:</label>
                    <div className="dt-spinner-row">
                        <input type="number" className="dt-spinner" min={8} max={72} value={txStyle.fontSize}
                            onChange={e => setTxStyle(s => ({ ...s, fontSize: +e.target.value }))}/>
                        <div className="dt-spinner-btns">
                            <button onClick={() => setTxStyle(s => ({ ...s, fontSize: Math.min(72, s.fontSize + 1) }))}>▲</button>
                            <button onClick={() => setTxStyle(s => ({ ...s, fontSize: Math.max(8, s.fontSize - 1) }))}>▼</button>
                        </div>
                    </div>
                </div>
            </div>
        );

        return null;
    };

    if (!isOpen) return null;

    const canUndo = historyRef.current.length > 0;
    const canRedo = redoRef.current.length > 0;

    return (
        <div className="dt-panel" role="dialog" aria-label="Dibujar">
            {/* ── Header ──────────────────────────────────────────────────── */}
            <div className="dt-header">
                <span className="dt-header-icon">✏️</span>
                <span className="dt-header-title">Dibujar</span>
                <button className="dt-close-btn" onClick={onClose} aria-label="Cerrar">−</button>
                <button className="dt-close-btn" onClick={onClose} aria-label="Cerrar panel">✕</button>
            </div>

            {/* ── Cuerpo ──────────────────────────────────────────────────── */}
            <div className="dt-body">
                <p className="dt-section-label">Seleccionar modo de dibujo</p>

                {/* Barra de modos */}
                <div className="dt-mode-bar">
                    {MODES.map(m => (
                        <button
                            key={m.id}
                            className={`dt-mode-btn ${activeMode === m.id ? 'dt-mode-btn--active' : ''}`}
                            title={m.label}
                            onClick={() => handleModeSelect(m.id)}
                        >
                            <ModeIcon icon={m.icon} active={activeMode === m.id}/>
                        </button>
                    ))}
                </div>

                {/* Opciones del modo activo */}
                {renderOptions()}

                {/* Botones de acción */}
                <div className="dt-actions">
                    <button className="dt-action-btn" onClick={handleUndo} disabled={!canUndo}>Deshacer</button>
                    <button className="dt-action-btn" onClick={handleRedo} disabled={!canRedo}>Rehacer</button>
                    <button className="dt-action-btn" onClick={handleClear} disabled={historyRef.current.length === 0}>Borrar</button>
                </div>
            </div>
        </div>
    );
};

// ─── SliderRow helper ─────────────────────────────────────────────────────────

const SliderRow: React.FC<{ value: number; onChange: (v: number) => void }> = ({ value, onChange }) => (
    <div className="dt-slider-wrap">
        <div className="dt-slider-labels">
            <span>Opaco</span><span>Transparente</span>
        </div>
        <div className="dt-slider-row">
            <button className="dt-slider-btn" onClick={() => onChange(Math.max(0, value - 0.1))}>−</button>
            <input type="range" min={0} max={1} step={0.01} value={value}
                onChange={e => onChange(+e.target.value)} className="dt-slider"/>
            <button className="dt-slider-btn" onClick={() => onChange(Math.min(1, value + 0.1))}>+</button>
        </div>
        <div className="dt-slider-pct-row">
            <span>0%</span><span>50%</span><span>100%</span>
        </div>
    </div>
);

export default DrawTool;