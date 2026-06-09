/**
 * @fileoverview Menú lateral de capas — búsqueda, grupos colapsables, descarga y capas externas.
 *
 * Optimizaciones respecto a la versión anterior:
 *
 * 1. VALORES HARDCODEADOS ELIMINADOS
 *    - BBOX '14.532,-118.454,32.718,-86.710' → MEXICO_BBOX_WMS de constants.ts
 *    - setTimeout(…, 2000) → COPY_FEEDBACK_MS
 *    - AbortSignal.timeout(6000) → CAPABILITIES_TIMEOUT_MS
 *    - zIndex: 99999 en menuStyle → Z_INDEX.layerMenu
 *    - Colores #1a73e8 y #9c27b0 de los badges WFS/WMS → clases CSS en LayerMenu.css
 *      (eliminados los style inline restantes en los botones de servicio)
 *    - Colores #fff5f5, #feb2b2, #c53030 del bloque de error API → clase .api-error-block
 *    - style inline color: '#666' del loading → clase .api-loading-block
 *    - style inline en caret del "Agregar capa" → clase CSS .add-layer-caret
 *
 * 2. TIPADO
 *    - getProjectUrlForLayer y getServiceInfo: parámetro `grupos` tipado como
 *      `GrupoLike[]` en vez de `any[]`.
 *    - LayerMenuProps.layerState: `Record<string, LayerData>` — eliminado `| any`.
 *
 * 3. MEMO / CALLBACKS
 *    - handleCheckboxChange, isLayerActive, isLayerLoading, getLayerError
 *      envueltos en useCallback para no re-crear en cada render del menú.
 *    - renderLayerItem extraído fuera del componente padre para estabilidad.
 *
 * @module components/map/panels/LayerMenu
 */

import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import ReactDOM from 'react-dom';
import { geoJSONToKML, wfsXmlToGeoJSON, isWfsXml } from '@utils/geo/fileToGeoJSON';
import * as shpwrite from '@mapbox/shp-write';
import '@styles/LayerMenu.css';
import type { LayerData } from '@hooks/map';
import type { LayerConfig } from '@config/layers';
import { useLayersData, useLayersMeta } from '@contexts/LayersContext';
import { config, logger } from '@config/env';
import AttributeTable from './AttributeTable';
import {
    SymbologyStyle, DEFAULT_SYMBOLOGY,
} from '@utils/geo/symbologyUtils';
import type { ExternalLayer, DownloadFormat } from '@types/geo';
import { VECTOR_DOWNLOAD_FORMATS, RASTER_DOWNLOAD_FORMATS } from '@types/geo';
import {
    COPY_FEEDBACK_MS,
    CAPABILITIES_TIMEOUT_MS,
    Z_INDEX,
    MEXICO_BBOX_WMS,
    LAYER_DEFAULT_OPACITY,
} from '@config/constants';

export type { ExternalLayer };

// ─── Tipos locales ────────────────────────────────────────────────────────────

/** Forma mínima de un grupo que este módulo necesita. */
interface GrupoLike {
    id?: number | string;
    nombre: string;
    url_proyecto?: string;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LayerMenuProps {
    layerState:             Record<string, LayerData>;   // ← ya no acepta any
    layersByGroup:          Record<string, LayerConfig[]>;
    loading:                Record<string, boolean>;
    errors:                 Record<string, string | null>;
    onLayerToggle:          (id: string, isActive: boolean, type: 'vector' | 'raster') => void;
    onOpacityChange:        (id: string, opacity: number, type: 'vector' | 'raster') => void;
    externalLayers:         ExternalLayer[];
    externalVisible:        Record<string, boolean>;
    externalOpacity:        Record<string, number>;
    onRemoveExternalLayer:  (id: string) => void;
    onToggleExternalLayer:  (id: string, visible: boolean) => void;
    onExternalOpacityChange:(id: string, opacity: number) => void;
    toolbarSlot?:           React.ReactNode;
    /** Control externo del estado colapsado (lo maneja MapToolbar) */
    isCollapsed?:           boolean;
    /** Callback para que MapToolbar notifique el toggle */
    onCollapseToggle?:      () => void;
    /** Abre el bottom sheet móvil desde el toolbar (botón de capas en móvil) */
    mobileMenuOpen?:        boolean;
    /** Callback para sincronizar cierre con MapToolbar */
    onMobileMenuClose?:     () => void;
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

const getProjectUrlForLayer = (layer: LayerConfig, grupos: GrupoLike[]): string => {
    if (!layer.group) return config.qgisServer.wfsUrl;
    const grupo = grupos.find(g => g.nombre === layer.group);
    if (!grupo?.url_proyecto) {
        logger.warn(`No se encontró proyecto para el grupo "${layer.group}", usando URL por defecto`);
        return config.qgisServer.wfsUrl;
    }
    return `${config.qgisServer.url}?MAP=${encodeURIComponent(grupo.url_proyecto)}`;
};

const getVectorDownloadUrl = (
    layer: LayerConfig,
    outputFormat: string,
    grupos: GrupoLike[] = []
): string => {
    const wfsName = (layer as LayerConfig & { wfsName?: string }).wfsName ?? layer.id;
    const baseUrl = getProjectUrlForLayer(layer, grupos);
    const url     = new URL(baseUrl);
    url.searchParams.set('SERVICE',      'WFS');
    url.searchParams.set('VERSION',      '1.1.0');
    url.searchParams.set('REQUEST',      'GetFeature');
    url.searchParams.set('TYPENAME',     wfsName);
    url.searchParams.set('outputFormat', outputFormat);
    return url.toString();
};

// ─── WCS helpers ──────────────────────────────────────────────────────────────
//
// resolveWcsCoverage consulta WCS GetCapabilities, detecta si WCS está
// habilitado y extrae tanto el nombre real de la cobertura como su BBOX,
// para que GetCoverage no tenga ningún valor hardcodeado.

interface WcsCoverageInfo {
    name: string;
    /** BBOX en CRS84: [minLon, minLat, maxLon, maxLat] */
    bbox: [number, number, number, number];
}

// Cache: baseUrl → lista de coberturas con su bbox
const wcsCapabilitiesCache = new Map<string, WcsCoverageInfo[]>();

async function resolveWcsCoverage(
    baseUrl: string,
    wmsLayerName: string
): Promise<WcsCoverageInfo> {
    let coverages = wcsCapabilitiesCache.get(baseUrl);

    if (!coverages) {
        const capUrl = new URL(baseUrl);
        capUrl.searchParams.set('SERVICE', 'WCS');
        capUrl.searchParams.set('VERSION', '1.0.0');
        capUrl.searchParams.set('REQUEST', 'GetCapabilities');

        const res = await fetch(capUrl.toString());
        if (!res.ok) throw new Error(`WCS GetCapabilities falló: HTTP ${res.status}`);

        const xml = await res.text();

        if (xml.includes('WMS_Capabilities') || xml.includes('WMT_MS_Capabilities')) {
            throw new Error(
                'WCS no está habilitado en este proyecto de QGIS Server.\n\n' +
                'Para habilitarlo: abre el proyecto en QGIS Desktop → ' +
                'Proyecto → Propiedades → QGIS Server → pestaña WCS → ' +
                'activa "Habilitar servicio WCS" y marca las capas ráster que quieres publicar.'
            );
        }

        // Parsear cada <CoverageOfferingBrief> extrayendo <name> y <lonLatEnvelope>
        const briefRegex = /<CoverageOfferingBrief[\s\S]*?<\/CoverageOfferingBrief>/g;
        const nameRegex  = /<(?:wcs:)?name>([\s\S]*?)<\/(?:wcs:)?name>/;
        const posRegex   = /<(?:gml:)?pos>([\s\S]*?)<\/(?:gml:)?pos>/g;

        coverages = [];
        for (const brief of xml.matchAll(briefRegex)) {
            const nameMatch = brief[0].match(nameRegex);
            if (!nameMatch) continue;
            const name = nameMatch[1].trim();

            const positions = [...brief[0].matchAll(posRegex)].map(m =>
                m[1].trim().split(/\s+/).map(Number)
            );
            // lonLatEnvelope tiene dos <gml:pos>: SW y NE (lon lat)
            if (positions.length >= 2) {
                const [sw, ne] = positions;
                coverages.push({
                    name,
                    bbox: [sw[0], sw[1], ne[0], ne[1]],
                });
            } else {
                // Sin bbox en capabilities → se resolverá con DescribeCoverage
                coverages.push({ name, bbox: [-180, -90, 180, 90] });
            }
        }

        if (coverages.length === 0) {
            throw new Error(
                'WCS está habilitado pero no tiene coberturas publicadas.\n\n' +
                'En QGIS Desktop → Proyecto → Propiedades → QGIS Server → WCS, ' +
                'asegúrate de marcar las capas ráster en la lista de coberturas publicadas.'
            );
        }
        wcsCapabilitiesCache.set(baseUrl, coverages);
    }

    const lower = wmsLayerName.toLowerCase();

    // 1) Coincidencia exacta
    const exact = coverages.find(c => c.name === wmsLayerName);
    if (exact) return exact;

    // 2) Case-insensitive
    const ci = coverages.find(c => c.name.toLowerCase() === lower);
    if (ci) return ci;

    // 3) Parcial
    const partial = coverages.find(c =>
        c.name.toLowerCase().includes(lower) || lower.includes(c.name.toLowerCase())
    );
    if (partial) return partial;

    // 4) Fallback con aviso
    logger.warn(
        `WCS: cobertura "${wmsLayerName}" no encontrada. ` +
        `Disponibles: [${coverages.map(c => c.name).join(', ')}]. ` +
        `Usando "${coverages[0].name}".`
    );
    return coverages[0];
}

const getRasterBaseUrl = (layer: LayerConfig, grupos: GrupoLike[] = []): string =>
    layer.group ? getProjectUrlForLayer(layer, grupos) : config.qgisServer.wmsRasterUrl;

const getServiceInfo = (layer: LayerConfig, type: 'wfs' | 'wms', grupos: GrupoLike[] = []) => {
    const wfsName  = (layer as LayerConfig & { wfsName?: string }).wfsName ?? layer.id;
    const wmsLayer = (layer as LayerConfig & { wmsLayer?: string }).wmsLayer ?? layer.id;

    if (type === 'wfs') {
        const baseUrl = getProjectUrlForLayer(layer, grupos);

        // La URL de conexión para el diálogo WFS de QGIS debe ser SOLO la base
        // (MAP=...) sin parámetros SERVICE/VERSION.
        // El diálogo "WFS / OGC API – Funcionalidades" de QGIS los agrega solo.
        // Si se incluye SERVICE=WFS en la URL, QGIS la abre en modo "OGC API"
        // en el diálogo Vectorial genérico y falla.
        const feat = new URL(baseUrl);
        feat.searchParams.set('SERVICE',  'WFS');
        feat.searchParams.set('VERSION',  '1.1.0');
        feat.searchParams.set('REQUEST',  'GetFeature');
        feat.searchParams.set('TYPENAME', wfsName);

        return {
            type:            'WFS' as const,
            connectionUrl:   baseUrl,        // ← URL limpia para el diálogo WFS de QGIS
            getFeatureUrl:   feat.toString(), // ← URL completa para uso directo/ArcGIS
            layerName:       wfsName,
        };
    }

    const baseUrl = layer.group
        ? getProjectUrlForLayer(layer, grupos)
        : config.qgisServer.wmsUrl;

    // URL de conexión para QGIS/ArcGIS: solo la base (MAP=...).
    // QGIS agrega SERVICE/VERSION/REQUEST por su cuenta.
    const conn = new URL(baseUrl);

    const caps = new URL(baseUrl);
    caps.searchParams.set('SERVICE', 'WMS');
    caps.searchParams.set('VERSION', '1.3.0');
    caps.searchParams.set('REQUEST', 'GetCapabilities');

    return {
        type:            'WMS' as const,
        connectionUrl:   conn.toString(),   // ← solo base, sin SERVICE ni VERSION
        capabilitiesUrl: caps.toString(),
        getFeatureUrl:   '',
        layerName:       wmsLayer,
    };
};

const getCombinedServiceInfo = (layer: LayerConfig, grupos: GrupoLike[] = []) => {
    const wfs = layer.type === 'vector' ? getServiceInfo(layer, 'wfs', grupos) : null;
    const wms = getServiceInfo(layer, 'wms', grupos);
    return { wfs, wms };
};

// ─── Descarga programática ────────────────────────────────────────────────────

// ─── Descarga programática ────────────────────────────────────────────────────
//
// QGIS Server WFS 1.1.0 con frecuencia ignora outputFormat y devuelve
// wfs:FeatureCollection XML sin importar lo que se pida (SHAPE-ZIP, KML, etc.).
// Estrategia defensiva:
//   1. Pedir GeoJSON (el más confiable en QGIS Server)
//   2. Si la respuesta es WFS XML: convertir con wfsXmlToGeoJSON()
//   3. Convertir el GeoJSON al formato final en cliente (KML, Shapefile…)

async function downloadVectorFormat(
    layer: LayerConfig,
    fmt: DownloadFormat,
    grupos: GrupoLike[] = []
): Promise<void> {
    const safeName = (layer.name ?? layer.id).replace(/[/\\:*?"<>|]/g, '_');

    // Paso 1: Obtener GeoJSON (siempre pedir application/json primero)
    const geojsonUrl = getVectorDownloadUrl(layer, 'application/json', grupos);
    let fc: GeoJSON.FeatureCollection;

    try {
        const res  = await fetch(geojsonUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();

        if (isWfsXml(text)) {
            // QGIS Server ignoró outputFormat y devolvió WFS XML → convertir
            logger.warn(`QGIS Server devolvió WFS XML en vez de GeoJSON para "${layer.name}". Convirtiendo en cliente.`);
            fc = wfsXmlToGeoJSON(text);
        } else {
            fc = JSON.parse(text) as GeoJSON.FeatureCollection;
        }
    } catch (e) {
        logger.error(`Error obteniendo datos de "${layer.name}":`, e);
        return;
    }

    if (!fc.features.length) {
        logger.warn(`La capa "${layer.name}" no tiene features para descargar.`);
        return;
    }

    // Paso 2: Generar el archivo en el formato solicitado
    let blob: Blob = new Blob();
    let filename: string = safeName;

    if (fmt.ext === 'kml') {
        const kmlStr = geoJSONToKML(fc, layer.name ?? layer.id);
        blob         = new Blob([kmlStr], { type: 'application/vnd.google-earth.kml+xml' });
        filename     = `${safeName}.kml`;

    } else if (fmt.ext === 'zip') {
        // Shapefile: intentar descarga directa del servidor primero.
        // Si el servidor devuelve WFS XML o falla, generar el Shapefile en cliente
        // usando @mapbox/shp-write + jszip en lugar de caer a GeoJSON.
        const shpUrl = getVectorDownloadUrl(layer, 'SHAPE-ZIP', grupos);
        let serverShpOk = false;
        try {
            const res = await fetch(shpUrl);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const arrayBuf = await res.arrayBuffer();
            const header   = new TextDecoder().decode(arrayBuf.slice(0, 100));

            if (isWfsXml(header)) {
                // Servidor ignoró SHAPE-ZIP → generar en cliente
                logger.warn(`QGIS Server no soporta SHAPE-ZIP para "${layer.name}". Generando Shapefile en cliente.`);
            } else {
                blob         = new Blob([arrayBuf], { type: 'application/zip' });
                filename     = `${safeName}.zip`;
                serverShpOk  = true;
            }
        } catch {
            logger.warn(`Error al pedir SHAPE-ZIP para "${layer.name}". Generando Shapefile en cliente.`);
        }

        if (!serverShpOk) {
            // Generar Shapefile comprimido en ZIP directamente en el cliente
            try {
                const zipBuffer = await shpwrite.zip(fc as GeoJSON.FeatureCollection, {
                    outputType: 'arraybuffer',
                    compression: 'DEFLATE',
                    types: {
                        point:        safeName,
                        polygon:      safeName,
                        polyline:     safeName,
                        multipoint:   safeName,
                        multipolygon: safeName,
                        multiline:    safeName,
                    },
                });
                blob     = new Blob([zipBuffer as ArrayBuffer], { type: 'application/zip' });
                filename = `${safeName}.zip`;
            } catch (shpErr) {
                // Fallback final solo si shp-write también falla
                logger.error(`Error generando Shapefile en cliente para "${layer.name}":`, shpErr);
                blob     = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json' });
                filename = `${safeName}.geojson`;
            }
        }

    } else {
        // GeoJSON y otros formatos de texto
        blob     = new Blob([JSON.stringify(fc, null, 2)], { type: 'application/geo+json;charset=utf-8;' });
        filename = `${safeName}.${fmt.ext}`;
    }

    // Paso 3: Disparar descarga
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ─── Descarga de ráster ───────────────────────────────────────────────────────
//
// El atributo `download` en un <a> solo funciona para URLs del mismo origen.
// Como el servidor QGIS está en un dominio distinto, el navegador ignora el
// atributo y navega/abre la URL en lugar de descargar el archivo.
// Solución: obtener el binario con fetch() y disparar la descarga desde un
// Blob object URL (mismo origen → atributo download siempre funciona).

async function downloadRasterFormat(
    layer: LayerConfig,
    fmt: DownloadFormat,
    grupos: GrupoLike[] = []
): Promise<void> {
    const safeName = (layer.name ?? layer.id).replace(/[/\\:*?"<>|]/g, '_');
    const baseUrl  = getRasterBaseUrl(layer, grupos);

    // Descubrir nombre real y BBOX de la cobertura desde WCS GetCapabilities
    let coverage: WcsCoverageInfo;
    try {
        coverage = await resolveWcsCoverage(baseUrl, layer.wmsLayer ?? layer.id);
    } catch (e) {
        logger.error(`WCS GetCapabilities falló para "${layer.name}":`, e);
        alert(`No se pudo conectar con el servidor WCS para "${layer.name}".\n${e instanceof Error ? e.message : String(e)}`);
        return;
    }

    // Calcular WIDTH/HEIGHT proporcionales al extent real (máx 4096 px en el eje mayor)
    const [minLon, minLat, maxLon, maxLat] = coverage.bbox;
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;
    const MAX_PX  = 4096;
    const [width, height] = lonSpan >= latSpan
        ? [MAX_PX, Math.max(1, Math.round(MAX_PX * latSpan / lonSpan))]
        : [Math.max(1, Math.round(MAX_PX * lonSpan / latSpan)), MAX_PX];

    // Construir GetCoverage sin ningún valor hardcodeado
    const fetchUrl = new URL(baseUrl);
    fetchUrl.searchParams.set('SERVICE',  'WCS');
    fetchUrl.searchParams.set('VERSION',  '1.0.0');
    fetchUrl.searchParams.set('REQUEST',  'GetCoverage');
    fetchUrl.searchParams.set('COVERAGE', coverage.name);
    fetchUrl.searchParams.set('CRS',      'EPSG:4326');
    fetchUrl.searchParams.set('BBOX',     `${minLon},${minLat},${maxLon},${maxLat}`);
    fetchUrl.searchParams.set('WIDTH',    String(width));
    fetchUrl.searchParams.set('HEIGHT',   String(height));
    fetchUrl.searchParams.set('FORMAT',   'GTiff');
    if (layer.timeValue) fetchUrl.searchParams.set('TIME', layer.timeValue);

    logger.debug(`WCS GetCoverage → ${fetchUrl.toString()}`);

    let res: Response;
    try {
        res = await fetch(fetchUrl.toString());
    } catch (e) {
        logger.error(`Error de red descargando GeoTIFF "${layer.name}":`, e);
        alert(`Error de red al descargar "${layer.name}".\n${e instanceof Error ? e.message : String(e)}`);
        return;
    }

    const arrayBuf    = await res.arrayBuffer();
    const contentType = res.headers.get('Content-Type') ?? '';

    // Detectar ServiceExceptionReport (el servidor responde 4xx + XML)
    if (!res.ok || contentType.includes('xml') || contentType.includes('text')) {
        const text = new TextDecoder().decode(arrayBuf.slice(0, 1024));
        if (!res.ok || text.includes('ServiceException') || text.includes('ExceptionReport')) {
            const match = text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/);
            const msg   = match?.[1]?.trim() ?? `HTTP ${res.status} — ${text.slice(0, 300)}`;
            logger.error(`WCS GetCoverage error para "${layer.name}" (cobertura: "${coverage.name}") [${res.status}]:`, msg);
            alert(`El servidor rechazó la descarga de "${layer.name}":\n${msg}`);
            return;
        }
    }

    const blob     = new Blob([arrayBuf], { type: 'image/tiff' });
    const filename = `${safeName}.${fmt.ext}`;

    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// ─── ServiceModal (combinado WFS + WMS) ───────────────────────────────────────

interface ServiceModalProps {
    combined:  ReturnType<typeof getCombinedServiceInfo>;
    layerName: string;
    onClose:   () => void;
}

const ServiceModal: React.FC<ServiceModalProps> = ({ combined, layerName, onClose }) => {
    const [copied, setCopied] = useState<string | null>(null);

    const copy = useCallback(async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = Object.assign(document.createElement('textarea'), {
                value: text, style: 'position:fixed;opacity:0',
            });
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        setCopied(key);
        setTimeout(() => setCopied(null), COPY_FEEDBACK_MS);
    }, []);

    const CopyBtn: React.FC<{ text: string; id: string }> = memo(({ text, id }) => (
        <button
            className={`svc-copy-btn ${copied === id ? 'copied' : ''}`}
            onClick={() => copy(text, id)}
            title="Copiar"
        >
            {copied === id ? '✓ Copiado' : '⎘ Copiar'}
        </button>
    ));
    CopyBtn.displayName = 'CopyBtn';

    const { wfs, wms } = combined;

    const modal = (
        <div className="svc-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Servicios OGC — ${layerName}`}>
            <div className="svc-modal" onClick={e => e.stopPropagation()}>
                <div className="svc-header">
                    <div className="svc-header-left">
                        <span className="svc-badge svc-badge-ogc">OGC</span>
                        <div>
                            <div className="svc-title">Consumir como servicio</div>
                            <div className="svc-subtitle">{layerName}</div>
                        </div>
                    </div>
                    <button className="svc-close" onClick={onClose} title="Cerrar" aria-label="Cerrar modal">×</button>
                </div>

                {/* ── Sección WFS ── */}
                {wfs && (
                    <div className="svc-section">
                        <div className="svc-section-header">
                            <span className="svc-badge svc-badge-wfs">WFS</span>
                            <span className="svc-section-title">Web Feature Service · QGIS, ArcGIS</span>
                        </div>
                        <div className="svc-instructions">
                            <strong>En QGIS:</strong> panel izquierdo → <em>WFS / OGC API – Funcionalidades</em> →
                            clic derecho → Nueva conexión → pegar URL → versión <strong>1.1</strong> → Aceptar →
                            doble clic en <code>{wfs.layerName}</code> para añadirla al mapa.
                        </div>
                        <div className="svc-rows">
                            <div className="svc-row">
                                <span className="svc-row-label">URL de conexión WFS (pegar en QGIS)</span>
                                <div className="svc-row-value">
                                    <input readOnly className="svc-url-input" value={wfs.getFeatureUrl} onFocus={e => e.target.select()} />
                                    <CopyBtn text={wfs.getFeatureUrl} id="wfs-conn" />
                                </div>
                            </div>
                            <div className="svc-row">
                                <span className="svc-row-label">Nombre de la capa</span>
                                <div className="svc-row-value">
                                    <input readOnly className="svc-url-input svc-url-mono" value={wfs.layerName} onFocus={e => e.target.select()} />
                                    <CopyBtn text={wfs.layerName} id="wfs-lyr" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Sección WMS ── */}
                <div className="svc-section">
                    <div className="svc-section-header">
                        <span className="svc-badge svc-badge-wms">WMS</span>
                        <span className="svc-section-title">Web Map Service · visor web, SIG</span>
                    </div>
                    <div className="svc-instructions">
                        <strong>En QGIS:</strong> Capa → Agregar capa → WMS/WMTS →
                        Nueva conexión → pegar URL → Conectar →
                        seleccionar <code>{wms.layerName}</code> → Añadir.
                    </div>
                    <div className="svc-rows">
                        <div className="svc-row">
                            <span className="svc-row-label">① URL de conexión</span>
                            <div className="svc-row-value">
                                <input readOnly className="svc-url-input" value={wms.connectionUrl} onFocus={e => e.target.select()} />
                                <CopyBtn text={wms.connectionUrl} id="wms-conn" />
                            </div>
                        </div>
                        <div className="svc-row">
                            <span className="svc-row-label">② Nombre de capa (seleccionar en lista)</span>
                            <div className="svc-row-value">
                                <input readOnly className="svc-url-input svc-url-mono" value={wms.layerName} onFocus={e => e.target.select()} />
                                <CopyBtn text={wms.layerName} id="wms-lyr" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    return ReactDOM.createPortal(modal, document.body);
};

// ─── DownloadDropdown ─────────────────────────────────────────────────────────

const DownloadDropdown: React.FC<{ layer: LayerConfig; grupos?: GrupoLike[] }> = memo(
    ({ layer, grupos = [] }) => {
        const [open,         setOpen]         = useState(false);
        const [menuStyle,    setMenuStyle]    = useState<React.CSSProperties>({});
        const [serviceModal, setServiceModal] = useState<ReturnType<typeof getCombinedServiceInfo> | null>(null);
        const [downloading,  setDownloading]  = useState<string | null>(null);
        const triggerRef = useRef<HTMLButtonElement>(null);

        const openMenu = useCallback(() => {
            if (!triggerRef.current) return;
            const rect = triggerRef.current.getBoundingClientRect();
            const mw   = 245;
            const vw   = window.innerWidth;
            const vh   = window.innerHeight;
            const left = Math.max(8, Math.min(rect.right - mw, vw - mw - 8));
            const menuH = Math.min(320, vh * 0.55);
            const spaceBelow = vh - rect.bottom;
            const top = spaceBelow < menuH
                ? rect.top - menuH - 6 + window.scrollY
                : rect.bottom + 6 + window.scrollY;

            setMenuStyle({
                position: 'absolute',
                top,
                left,
                width:  Math.min(mw, vw - 16),
                zIndex: Z_INDEX.layerMenu,   // ← antes 99999
            });
            setOpen(o => !o);
        }, []);

        useEffect(() => {
            if (!open) return;
            const close  = (e: MouseEvent) => { if (!triggerRef.current?.contains(e.target as Node)) setOpen(false); };
            const scroll = () => setOpen(false);
            document.addEventListener('mousedown', close);
            document.addEventListener('scroll', scroll, true);
            return () => {
                document.removeEventListener('mousedown', close);
                document.removeEventListener('scroll', scroll, true);
            };
        }, [open]);

        const openServices = useCallback(() => {
            setOpen(false);
            setServiceModal(getCombinedServiceInfo(layer, grupos));
        }, [layer, grupos]);

        const handleDownload = useCallback(async (fmt: DownloadFormat) => {
            setOpen(false);
            setDownloading(fmt.ext);
            if (layer.type === 'raster') {
                await downloadRasterFormat(layer, fmt, grupos);
            } else {
                await downloadVectorFormat(layer, fmt, grupos);
            }
            setDownloading(null);
        }, [layer, grupos]);

        const menu = (
            <div className="dl-menu" style={menuStyle} onMouseDown={e => e.stopPropagation()}>
                <div className="dl-menu-header">Descargar como</div>

                {layer.type === 'vector'
                    ? VECTOR_DOWNLOAD_FORMATS.map(fmt => (
                        <button key={fmt.ext} className="dl-item dl-item-btn" onClick={() => handleDownload(fmt)}>
                            <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>{fmt.icon}</span>
                            <span className="dl-item-info">
                                <span className="dl-item-label">{fmt.label}</span>
                                <span className="dl-item-desc">{fmt.description}</span>
                            </span>
                            <span className="dl-item-ext">.{fmt.ext}</span>
                        </button>
                    ))
                    : RASTER_DOWNLOAD_FORMATS.map(fmt => (
                        <button key={fmt.ext} className="dl-item dl-item-btn" onClick={() => handleDownload(fmt)}>
                            <span className="dl-item-icon" style={{ background: `${fmt.color}18`, color: fmt.color }}>{fmt.icon}</span>
                            <span className="dl-item-info">
                                <span className="dl-item-label">{fmt.label}</span>
                                <span className="dl-item-desc">{fmt.description}</span>
                            </span>
                            <span className="dl-item-ext">.{fmt.ext}</span>
                        </button>
                    ))
                }

                <div className="dl-menu-section">Consumir como servicio</div>

                <button className="dl-item dl-item-btn dl-item-service" onClick={openServices}>
                    <span className="dl-item-icon dl-item-icon-svc dl-item-icon-wfs">⊞</span>
                    <span className="dl-item-info">
                        <span className="dl-item-label">WFS / WMS</span>
                        <span className="dl-item-desc">QGIS, ArcGIS, visor web</span>
                    </span>
                    <span className="dl-item-ext svc-arrow">›</span>
                </button>
            </div>
        );

        return (
            <div className="dl-dropdown">
                <button
                    ref={triggerRef}
                    className={`dl-trigger ${downloading ? 'dl-trigger-loading' : ''}`}
                    title="Opciones de descarga y servicios"
                    onClick={openMenu}
                    aria-label="Opciones de descarga y servicios OGC"
                >
                    <span className="dl-trigger-icon" aria-hidden="true">
                        {downloading ? '⟳' : '⬇'}
                    </span>
                    <span className={`dl-caret ${open ? 'open' : ''}`} aria-hidden="true">▾</span>
                </button>
                {open && ReactDOM.createPortal(menu, document.body)}
                {serviceModal && (
                    <ServiceModal
                        combined={serviceModal}
                        layerName={layer.name}
                        onClose={() => setServiceModal(null)}
                    />
                )}
            </div>
        );
    }
);
DownloadDropdown.displayName = 'DownloadDropdown';

// ─── TableIcon ────────────────────────────────────────────────────────────────

const TableIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z" />
    </svg>
));
TableIcon.displayName = 'TableIcon';



// ─── LayerMenu principal ──────────────────────────────────────────────────────

const LayerMenu: React.FC<LayerMenuProps> = memo(({
    layerState: layers,
    layersByGroup,
    loading,
    errors,
    onLayerToggle,
    onOpacityChange,
    externalLayers,
    externalVisible,
    externalOpacity,
    onRemoveExternalLayer,
    onToggleExternalLayer,
    onExternalOpacityChange,
    toolbarSlot,
    isCollapsed,
    onCollapseToggle,
    mobileMenuOpen,
    onMobileMenuClose,
}) => {
    const { availableLayers: AVAILABLE_LAYERS, grupos } = useLayersData();
    const { loading: apiLoading, error: apiError } = useLayersMeta();

    const [collapsed,            setCollapsed]            = useState(false);

    // En móvil: la visibilidad del sheet la controla el padre (mobileMenuOpen).
    // En escritorio: no se usa. Se mantiene un alias para compatibilidad interna.
    const menuOpen = mobileMenuOpen ?? false;
    const closeMenu = useCallback(() => { onMobileMenuClose?.(); }, [onMobileMenuClose]);

    // ── Drag-to-close para el bottom sheet móvil ──────────────────────────────
    const sheetRef       = useRef<HTMLDivElement>(null);
    const dragStartY     = useRef<number>(0);
    const dragCurrentY   = useRef<number>(0);
    const isDragging     = useRef<boolean>(false);

    const onSheetTouchStart = useCallback((e: React.TouchEvent) => {
        dragStartY.current   = e.touches[0].clientY;
        dragCurrentY.current = 0;
        isDragging.current   = true;
        if (sheetRef.current) sheetRef.current.style.transition = 'none';
    }, []);

    const onSheetTouchMove = useCallback((e: React.TouchEvent) => {
        if (!isDragging.current) return;
        const delta = e.touches[0].clientY - dragStartY.current;
        dragCurrentY.current = delta;
        if (delta > 0 && sheetRef.current) {
            sheetRef.current.style.transform = `translateY(${delta}px)`;
        }
    }, []);

    const onSheetTouchEnd = useCallback(() => {
        isDragging.current = false;
        const shouldClose = dragCurrentY.current > 100;
        if (sheetRef.current) {
            // Restaurar la transición CSS antes de soltar el inline transform,
            // así el sheet regresa suavemente (o desaparece si closeMenu remueve .open).
            sheetRef.current.style.transition = '';
            sheetRef.current.style.transform  = '';
        }
        if (shouldClose) closeMenu();
    }, [closeMenu]);
    // Control externo: si MapToolbar pasa isCollapsed, ese valor manda
    const effectiveCollapsed  = isCollapsed ?? collapsed;
    const handleCollapseToggle = onCollapseToggle ?? (() => setCollapsed(c => !c));
    const [searchTerm,           setSearchTerm]           = useState('');
    const [attributeTableLayerId,setAttributeTableLayerId]= useState<string | null>(null);
    const [collapsedGroups,      setCollapsedGroups]      = useState<Set<string>>(() => {
        const keys = new Set<string>([...Object.keys(layersByGroup), '__imported__']);
        // Añadir claves de subgrupos para que arranquen colapsados
        Object.entries(layersByGroup).forEach(([group, layers]) => {
            layers.forEach(l => {
                if (l.subgroup) keys.add(`${group}::${l.subgroup}`);
            });
        });
        return keys;
    });

    const toggleGroup = useCallback((group: string) =>
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.has(group) ? next.delete(group) : next.add(group);
            return next;
        }), []);

    // Cuando llegan datos de la API (asíncrono), registrar los subgrupos
    // nuevos como colapsados sin tocar los que el usuario ya haya abierto.
    useEffect(() => {
        setCollapsedGroups(prev => {
            const next = new Set(prev);
            Object.entries(layersByGroup).forEach(([group, layerList]) => {
                next.add(group); // grupos también colapsados por defecto
                layerList.forEach(l => {
                    if (l.subgroup) next.add(`${group}::${l.subgroup}`);
                });
            });
            next.add('__imported__');
            return next;
        });
    }, [layersByGroup]);

    const isLayerActive  = useCallback((id: string) => layers[id]?.visible  ?? false, [layers]);
    const isLayerLoading = useCallback((id: string) => loading[id]          ?? false, [loading]);
    const getLayerError  = useCallback((id: string) => errors[id]           ?? null,  [errors]);

    const handleCheckboxChange = useCallback(
        (layer: LayerConfig, isChecked: boolean) => onLayerToggle(layer.id, isChecked, layer.type),
        [onLayerToggle]
    );

    const normalizedSearch = searchTerm.toLowerCase();

    const groupedLayers = useMemo(() => {
        const grouped = new Map<string, LayerConfig[]>();
        Object.entries(layersByGroup).forEach(([group, groupLayers]) => {
            const filtered = normalizedSearch
                ? groupLayers.filter(l =>
                    l.name.toLowerCase().includes(normalizedSearch) ||
                    l.description.toLowerCase().includes(normalizedSearch)
                )
                : groupLayers;
            if (filtered.length > 0) {
                grouped.set(group, [...filtered].sort((a, b) => {
                    const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
                    const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
                    return numA - numB;
                }));
            }
        });
        return grouped;
    }, [layersByGroup, normalizedSearch]);

    const activeCount       = useMemo(() => Object.values(layers).filter(l => l?.visible).length, [layers]);
    const activeTableLayer  = useMemo(() =>
        attributeTableLayerId ? AVAILABLE_LAYERS.find(l => l.id === attributeTableLayerId) : null,
        [attributeTableLayerId, AVAILABLE_LAYERS]
    );
    const activeTableFeatures = useMemo(() =>
        attributeTableLayerId ? (layers[attributeTableLayerId]?.data?.features ?? []) : [],
        [attributeTableLayerId, layers]
    );

    const renderLayerItem = useCallback((layer: LayerConfig) => {
        const isActive  = isLayerActive(layer.id);
        const isLoading = isLayerLoading(layer.id);
        const err       = getLayerError(layer.id);
        const fc        = layers[layer.id]?.data?.features?.length;
        const opacity   = layers[layer.id]?.opacity ?? LAYER_DEFAULT_OPACITY;

        return (
            <div key={layer.id} className={`layer-item ${isActive ? 'active' : ''}`}>
                <div className="layer-checkbox-wrapper">
                    <input
                        type="checkbox" id={layer.id} className="layer-checkbox"
                        checked={isActive} disabled={isLoading}
                        onChange={e => handleCheckboxChange(layer, e.target.checked)}
                    />
                    <label htmlFor={layer.id} className="layer-label">
                        <div className="layer-info">
                            <span className="layer-name">
                                {layer.name}
                                {layer.year && <span className="year-badge">{layer.year}</span>}
                                {layer.type === 'raster' && <span className="layer-type-badge">WMS</span>}
                            </span>
                            <span className="layer-description">
                                {layer.description}
                                {fc != null && <span className="feature-count"> · {fc} elementos</span>}
                            </span>
                        </div>
                    </label>
                </div>

                <div className="layer-actions">
                    {isActive && layer.type === 'vector' && (
                        <button className="table-btn" title="Ver tabla de atributos" onClick={() => setAttributeTableLayerId(layer.id)}>
                            <TableIcon />
                        </button>
                    )}
                    <DownloadDropdown layer={layer} grupos={grupos as GrupoLike[]} />
                </div>

                {isActive && (
                    <div className="layer-opacity-control">
                        <span className="opacity-label">Opacidad: {Math.round(opacity * 100)}%</span>
                        <input
                            type="range" min="0" max="1" step="0.05" value={opacity}
                            onChange={e => onOpacityChange(layer.id, parseFloat(e.target.value), layer.type)}
                            className="opacity-slider"
                        />
                    </div>
                )}

                {isLoading && (
                    <div className="layer-status" role="status" aria-label="Cargando capa">
                        <div className="spinner-border spinner-border-sm">
                            <span className="visually-hidden">Cargando…</span>
                        </div>
                    </div>
                )}
                {err && <div className="layer-error" role="alert"><small className="text-danger">{err}</small></div>}
            </div>
        );
    }, [isLayerActive, isLayerLoading, getLayerError, layers, handleCheckboxChange, onOpacityChange, grupos]);

    const menuContent = (
        <div className="layer-menu-content">
            <div className="search-container">
                <input
                    type="text" placeholder="Buscar capas…" className="search-input"
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    aria-label="Buscar capas"
                />
            </div>

            <div className="layers-list">
                {/* Loading de API — clase CSS, sin style inline */}
                {apiLoading && (
                    <div className="api-loading-block" role="status" aria-live="polite">
                        Cargando capas…
                    </div>
                )}

                {/* Error de API — clase CSS, sin style inline con colores hardcodeados */}
                {apiError && !apiLoading && (
                    <div className="api-error-block" role="alert">
                        <strong>Error al cargar capas:</strong> {apiError}
                    </div>
                )}

                {/* Grupos unificados */}
                {!apiLoading && [...groupedLayers.entries()]
                    .sort(([groupA], [groupB]) => {
                        const idA = (grupos as GrupoLike[])?.find(g => g.nombre === groupA)?.id ?? Infinity;
                        const idB = (grupos as GrupoLike[])?.find(g => g.nombre === groupB)?.id ?? Infinity;
                        return Number(idA) - Number(idB);
                    })
                    .map(([group, groupLayers]) => {
                        if (groupLayers.length === 0) return null;
                        const isGroupCollapsed = collapsedGroups.has(group);
                        const activeInGroup    = groupLayers.filter(l => isLayerActive(l.id)).length;

                        // Separar capas con subgrupo de capas sin subgrupo
                        const sinSubgrupo = groupLayers.filter(l => !l.subgroup);
                        // Ordenar subgrupos por subgroup_id (orden de creación)
                        const subgruposUnicos = [...new Map(
                            groupLayers
                                .filter(l => l.subgroup)
                                .map(l => [l.subgroup!, l.subgroup_id ?? Infinity])
                        ).entries()]
                            .sort(([, idA], [, idB]) => idA - idB)
                            .map(([nombre]) => nombre);

                        return (
                            <div key={group} className="layer-group">
                                <button
                                    className={`layer-group-header ${isGroupCollapsed ? 'collapsed' : ''}`}
                                    onClick={() => toggleGroup(group)}
                                    aria-expanded={!isGroupCollapsed}
                                >
                                    <span className="group-title-text">{group}</span>
                                    <span className="group-meta">
                                        {activeInGroup > 0 && <span className="group-active-badge">{activeInGroup}</span>}
                                        <span className="group-count">{groupLayers.length}</span>
                                        <span className={`group-chevron ${isGroupCollapsed ? 'closed' : ''}`} aria-hidden="true">▾</span>
                                    </span>
                                </button>
                                {!isGroupCollapsed && (
                                    <div className="layer-group-body">
                                        {/* Subgrupos como secciones colapsables */}
                                        {subgruposUnicos.map(subgrupo => {
                                            const subKey = `${group}::${subgrupo}`;
                                            const isSubCollapsed = collapsedGroups.has(subKey);
                                            const subLayers = groupLayers.filter(l => l.subgroup === subgrupo);
                                            const activeInSub = subLayers.filter(l => isLayerActive(l.id)).length;

                                            return (
                                                <div key={subKey} className="layer-subgroup">
                                                    <button
                                                        className={`layer-subgroup-header ${isSubCollapsed ? 'collapsed' : ''}`}
                                                        onClick={() => toggleGroup(subKey)}
                                                        aria-expanded={!isSubCollapsed}
                                                    >
                                                        <span className="subgroup-title-text">{subgrupo}</span>
                                                        <span className="group-meta">
                                                            {activeInSub > 0 && <span className="group-active-badge">{activeInSub}</span>}
                                                            <span className="group-count">{subLayers.length}</span>
                                                            <span className={`group-chevron ${isSubCollapsed ? 'closed' : ''}`} aria-hidden="true">▾</span>
                                                        </span>
                                                    </button>
                                                    {!isSubCollapsed && (
                                                        <div className="layer-subgroup-body">
                                                            {subLayers.map(renderLayerItem)}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {/* Capas sin subgrupo directamente */}
                                        {sinSubgrupo.map(renderLayerItem)}
                                    </div>
                                )}
                            </div>
                        );
                    })
                }

                {/* Capas importadas */}
                {externalLayers.length > 0 && (() => {
                    const isGroupCollapsed = collapsedGroups.has('__imported__');
                    return (
                        <div className="layer-group">
                            <button
                                className={`layer-group-header ${isGroupCollapsed ? 'collapsed' : ''}`}
                                onClick={() => toggleGroup('__imported__')}
                                aria-expanded={!isGroupCollapsed}
                            >
                                <span className="group-title-text">⬆ Capas importadas</span>
                                <span className="group-meta">
                                    <span className="group-count">{externalLayers.length}</span>
                                    <span className={`group-chevron ${isGroupCollapsed ? 'closed' : ''}`} aria-hidden="true">▾</span>
                                </span>
                            </button>
                            {!isGroupCollapsed && (
                                <div className="layer-group-body">
                                    {externalLayers.map(ext => {
                                        const isVisible = externalVisible[ext.id] ?? true;
                                        const opacity   = externalOpacity[ext.id] ?? LAYER_DEFAULT_OPACITY;
                                        const fmt =
                                            ext.type === 'wms'    ? `WMS · ${ext.layerName}` :
                                            ext.type === 'wfs'    ? `WFS · ${ext.layerName}` :
                                            ext.type === 'raster' ? 'GeoTIFF local' :
                                            ext.file              ? `${ext.file.name.split('.').pop()?.toUpperCase()} local` : 'Vectorial';

                                        return (
                                            <div key={ext.id} className={`layer-item ${isVisible ? 'active' : ''}`}>
                                                <div className="layer-checkbox-wrapper">
                                                    <input
                                                        type="checkbox" id={`ext-${ext.id}`} className="layer-checkbox"
                                                        checked={isVisible}
                                                        onChange={e => onToggleExternalLayer(ext.id, e.target.checked)}
                                                    />
                                                    <label htmlFor={`ext-${ext.id}`} className="layer-label">
                                                        <div className="layer-info">
                                                            <span className="layer-name">{ext.name}</span>
                                                            <span className="layer-description">{fmt}</span>
                                                        </div>
                                                    </label>
                                                </div>
                                                <div className="layer-actions">
                                                    <button className="imported-delete-btn" title="Eliminar capa" aria-label={`Eliminar capa ${ext.name}`} onClick={() => onRemoveExternalLayer(ext.id)}>
                                                        🗑
                                                    </button>
                                                </div>
                                                {isVisible && (
                                                    <div className="layer-opacity-control">
                                                        <span className="opacity-label">Opacidad: {Math.round(opacity * 100)}%</span>
                                                        <input
                                                            type="range" min="0" max="1" step="0.05" value={opacity}
                                                            onChange={e => onExternalOpacityChange(ext.id, parseFloat(e.target.value))}
                                                            className="opacity-slider"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );

    return (
        <>
            {/* Overlay oscuro */}
            {menuOpen && <div className="layer-menu-overlay" onClick={() => { closeMenu(); }} aria-hidden="true" />}

            {/* Panel escritorio */}
            <div className={`layer-menu desktop-menu ${effectiveCollapsed ? 'collapsed' : ''}`}>
                <div className="layer-menu-header">
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                </div>
                {menuContent}
            </div>

            {/* Toolbar de herramientas — renderizado fuera del desktop-menu para
                que permanezca visible en móvil (donde desktop-menu se oculta).
                La clase `slot-collapsed` permite al CSS compensar el desplazamiento
                del menú colapsado. */}
            {toolbarSlot && (
                <div className={`layer-menu-toolbar-slot${effectiveCollapsed ? ' slot-collapsed' : ''}`}>
                    {toolbarSlot}
                </div>
            )}

            {/* Bottom sheet móvil */}
            <div
                ref={sheetRef}
                className={`layer-menu mobile-menu ${menuOpen ? 'open' : ''}`}
                onTouchStart={onSheetTouchStart}
                onTouchMove={onSheetTouchMove}
                onTouchEnd={onSheetTouchEnd}
            >
                <div className="mobile-menu-handle" onClick={() => { closeMenu(); }}>
                    <span className="handle-bar" aria-hidden="true" />
                    <div className="header-content">
                        <h3>Capas</h3>
                        {activeCount > 0 && <span className="active-badge">{activeCount}</span>}
                    </div>
                </div>
                {menuContent}
            </div>

            {attributeTableLayerId && activeTableLayer && (
                <AttributeTable
                    layer={activeTableLayer}
                    features={activeTableFeatures}
                    onClose={() => setAttributeTableLayerId(null)}
                />
            )}
        </>
    );
});

LayerMenu.displayName = 'LayerMenu';

export default LayerMenu;