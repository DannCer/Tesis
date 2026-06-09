/**
 * @fileoverview Persistencia de tokens de autenticación usando la Cache API
 * del navegador en lugar de localStorage.
 *
 * Ventajas frente a localStorage:
 *  - No accesible desde iframes de terceros ni extensiones con acceso
 *    limitado al origen.
 *  - Los tokens no aparecen en las DevTools → Application → Local Storage,
 *    reduciendo la superficie de inspección accidental.
 *  - Mismo origen (same-origin) que localStorage, pero en un bucket separado.
 *
 * La Cache API es asíncrona; todas las funciones devuelven Promise.
 * Se usa una Request URL ficticia como clave dentro del cache nombrado
 * AUTH_CACHE_NAME para aislar los tokens del resto de cachés de la app.
 *
 * @module utils/tokenCache
 */

const AUTH_CACHE_NAME = 'auth-tokens-v1';

/** URLs ficticias usadas como claves dentro del cache. */
const KEYS = {
    access:  'https://auth.local/access_token',
    refresh: 'https://auth.local/refresh_token',
} as const;

type TokenKey = keyof typeof KEYS;

// ── Helpers internos ─────────────────────────────────────────────────────────

/** Abre (o crea) el cache de tokens. */
async function openCache(): Promise<Cache> {
    return caches.open(AUTH_CACHE_NAME);
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Lee un token del cache.
 * @returns El valor del token, o `null` si no existe.
 */
export async function getToken(key: TokenKey): Promise<string | null> {
    try {
        const cache    = await openCache();
        const response = await cache.match(KEYS[key]);
        if (!response) return null;
        return response.text();
    } catch {
        return null;
    }
}

/**
 * Escribe un token en el cache.
 * Sobreescribe cualquier valor anterior para esa clave.
 */
export async function setToken(key: TokenKey, value: string): Promise<void> {
    const cache = await openCache();
    await cache.put(
        KEYS[key],
        new Response(value, {
            headers: { 'Content-Type': 'text/plain' },
        })
    );
}

/**
 * Elimina un token del cache.
 * No lanza error si la clave no existía.
 */
export async function removeToken(key: TokenKey): Promise<void> {
    const cache = await openCache();
    await cache.delete(KEYS[key]);
}

/**
 * Elimina todos los tokens de autenticación (access + refresh).
 * Equivale a llamar removeToken('access') + removeToken('refresh').
 */
export async function clearTokens(): Promise<void> {
    await Promise.all([
        removeToken('access'),
        removeToken('refresh'),
    ]);
}