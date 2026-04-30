/**
 * @fileoverview Utilidades de validación y sanitización para el Geovisor.
 * @module utils/validation
 */

// ============================================================================
// VALIDACIÓN DE URL
// ============================================================================

/**
 * Valida que una URL sea válida y segura
 * @param url - URL a validar
 * @returns true si la URL es válida
 */
export const isValidUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        // Solo permitir protocolos seguros o relativos
        return ['http:', 'https:'].includes(parsed.protocol) || url.startsWith('/');
    } catch {
        return false;
    }
};

/**
 * Sanitiza una URL eliminando parámetros potencialmente peligrosos
 * @param url - URL a sanitizar
 * @returns URL sanitizada
 */
export const sanitizeUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        // Eliminar parámetros que podrían ser injection
        const dangerousParams = ['javascript:', 'data:', 'vbscript:'];
        if (dangerousParams.some(p => url.toLowerCase().includes(p))) {
            return '';
        }
        return parsed.toString();
    } catch {
        return url;
    }
};

/**
 * Valida el nombre de una capa para prevenir inyección
 * @param layerName - Nombre de la capa
 * @returns true si el nombre es válido
 */
export const isValidLayerName = (layerName: string): boolean => {
    // Solo permitir caracteres alfanuméricos, guiones bajos y dos puntos (para workspace)
    const validPattern = /^[a-zA-Z0-9_:-]+$/;
    return validPattern.test(layerName);
};

/**
 * Sanitiza el nombre de una capa
 * @param layerName - Nombre de la capa
 * @returns Nombre sanitizado
 */
export const sanitizeLayerName = (layerName: string): string => {
    return layerName.replace(/[^a-zA-Z0-9_:-]/g, '').substring(0, 100);
};

// ============================================================================
// VALIDACIÓN DE ARCHIVOS
// ============================================================================

/**
 * Tipos MIME aceptados para archivos vectoriales
 */
export const ACCEPTED_VECTOR_MIME_TYPES = [
    'application/geojson',
    'application/json',
    'application/vnd.google-earth.kml+xml',
    'application/vnd.google-earth.kmz',
    'application/zip',
    'application/x-zip-compressed'
];

/**
 * Extensiones aceptadas para archivos vectoriales
 */
export const ACCEPTED_VECTOR_EXTENSIONS = ['.geojson', '.json', '.kml', '.kmz', '.zip'];

/**
 * Extensiones aceptadas para archivos ráster
 */
export const ACCEPTED_RASTER_EXTENSIONS = ['.tif', '.tiff'];

/**
 * Valida un archivo subido por el usuario
 * @param file - Archivo a validar
 * @param acceptedTypes - Tipos MIME aceptados
 * @param acceptedExtensions - Extensiones aceptadas
 * @returns true si el archivo es válido
 */
export const validateFile = (
    file: File,
    acceptedTypes: string[] = ACCEPTED_VECTOR_MIME_TYPES,
    acceptedExtensions: string[] = [...ACCEPTED_VECTOR_EXTENSIONS, ...ACCEPTED_RASTER_EXTENSIONS]
): { valid: boolean; error?: string } => {
    // Validar tamaño máximo (50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        return { valid: false, error: `El archivo excede el tamaño máximo de 50MB` };
    }

    // Validar extensión
    const fileName = file.name.toLowerCase();
    const hasValidExtension = acceptedExtensions.some(ext => fileName.endsWith(ext));
    if (!hasValidExtension) {
        return { valid: false, error: `Tipo de archivo no soportado` };
    }

    // Validar tipo MIME si está disponible
    if (file.type && !acceptedTypes.includes(file.type) && !file.type.startsWith('application/')) {
        // Algunos navegadores no detectan correctamente el tipo MIME
        logger.warn('Tipo MIME no estándar:', file.type);
    }

    return { valid: true };
};

// ============================================================================
// VALIDACIÓN DE DATOS GEOJSON
// ============================================================================

/**
 * Valida que un objeto sea un GeoJSON FeatureCollection válido
 * @param data - Datos a validar
 * @returns true si es válido
 */
export const isValidGeoJSON = (data: any): boolean => {
    if (!data || typeof data !== 'object') return false;
    if (data.type !== 'FeatureCollection') return false;
    if (!Array.isArray(data.features)) return false;

    // Validar cada feature
    return data.features.every((feature: any) => {
        return feature &&
            feature.type === 'Feature' &&
            feature.geometry !== undefined &&
            feature.properties !== undefined;
    });
};

/**
 * Limita el número de features para prevenir problemas de rendimiento
 * @param features - Array de features
 * @param maxFeatures - Número máximo de features
 * @returns Features limitados
 */
export const limitFeatures = <T extends { properties?: any }>(
    features: T[],
    maxFeatures: number = 200000
): T[] => {
    if (features.length <= maxFeatures) return features;
    console.warn(`Limitando features de ${features.length} a ${maxFeatures}`);
    return features.slice(0, maxFeatures);
};

// ============================================================================
// VALIDACIÓN DE NÚMEROS
// ============================================================================

/**
 * Valida que un número esté dentro de un rango
 * @param value - Valor a validar
 * @param min - Valor mínimo
 * @param max - Valor máximo
 * @returns true si está en el rango
 */
export const isInRange = (value: number, min: number, max: number): boolean => {
    return value >= min && value <= max;
};

/**
 * Valida opacidad (0-1)
 * @param opacity - Opacidad a validar
 * @returns true si es válida
 */
export const isValidOpacity = (opacity: number): boolean => {
    return isInRange(opacity, 0, 1);
};

/**
 * Normaliza opacidad a rango válido
 * @param opacity - Opacidad
 * @returns Opacidad normalizada
 */
export const normalizeOpacity = (opacity: number): number => {
    return Math.max(0, Math.min(1, opacity));
};

// ============================================================================
// VALIDACIÓN DE COORDENADAS
// ============================================================================

/**
 * Valida coordenadas geográficas
 * @param lat - Latitud
 * @param lng - Longitud
 * @returns true si son válidas
 */
export const isValidCoordinates = (lat: number, lng: number): boolean => {
    return isInRange(lat, -90, 90) && isInRange(lng, -180, 180);
};

/**
 * Valida un bounding box
 * @param bbox - Array de 4 números [minX, minY, maxX, maxY]
 * @returns true si es válido
 */
export const isValidBBox = (bbox: number[]): boolean => {
    if (!Array.isArray(bbox) || bbox.length !== 4) return false;
    const [minX, minY, maxX, maxY] = bbox;
    return (
        isInRange(minX, -180, 180) &&
        isInRange(minY, -90, 90) &&
        isInRange(maxX, -180, 180) &&
        isInRange(maxY, -90, 90) &&
        minX <= maxX &&
        minY <= maxY
    );
};

// ============================================================================
// SANITIZACIÓN DE TEXTO
// ============================================================================

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param text - Texto a sanitizar
 * @returns Texto seguro
 */
export const escapeHtml = (text: string): string => {
    const map: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
};

/**
 * Limita la longitud de un texto
 * @param text - Texto a limitar
 * @param maxLength - Longitud máxima
 * @returns Texto limitado
 */
export const truncateText = (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
};

// ============================================================================
// LOGGER INTERNO
// ============================================================================

const logger = {
    warn: (message: string, ...args: any[]) => {
        console.warn(`[Validation] ${message}`, ...args);
    },
    error: (message: string, ...args: any[]) => {
        console.error(`[Validation] ${message}`, ...args);
    }
};

export default {
    isValidUrl,
    sanitizeUrl,
    isValidLayerName,
    sanitizeLayerName,
    validateFile,
    isValidGeoJSON,
    limitFeatures,
    isInRange,
    isValidOpacity,
    normalizeOpacity,
    isValidCoordinates,
    isValidBBox,
    escapeHtml,
    truncateText
};
