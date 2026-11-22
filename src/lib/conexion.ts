// Estado de la conexión a internet (para el modo sin conexión).
//
// navigator.onLine solo sabe si hay una red, no si llega a internet (en faena es común estar
// "conectado" a una red sin salida). Por eso además se marca "sin conexión" cuando una llamada a la
// nube falla por red, y se vuelve a "en línea" cuando una llamada funciona o el navegador avisa.
import { useSyncExternalStore } from 'react';

let enLinea = typeof navigator === 'undefined' ? true : navigator.onLine;
const oyentes = new Set<() => void>();

function cambiar(valor: boolean) {
  if (valor === enLinea) return;
  enLinea = valor;
  oyentes.forEach(fn => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => cambiar(true));
  window.addEventListener('offline', () => cambiar(false));
}

export const hayConexion = () => enLinea;
export const marcarSinConexion = () => cambiar(false);
export const marcarEnLinea = () => cambiar(true);

export function suscribirConexion(fn: () => void): () => void {
  oyentes.add(fn);
  return () => { oyentes.delete(fn); };
}

/** true si hay conexión a internet (se actualiza solo). */
export function useConexion(): boolean {
  return useSyncExternalStore(suscribirConexion, hayConexion, () => true);
}

/**
 * true si el error se debe a la red (sin señal, servidor inalcanzable, tiempo agotado), y no a un
 * problema de permisos o de datos. Solo los errores de red se dejan en cola para reintentar.
 */
export function esErrorDeRed(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!error) return false;
  const e = error as { message?: unknown; name?: unknown; details?: unknown; originalError?: unknown };
  const texto = `${String(e.name ?? '')} ${String(e.message ?? '')} ${String(e.details ?? '')}`;
  if (/failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|timed? ?out|aborted|AuthRetryableFetchError/i.test(texto)) {
    return true;
  }
  return e.originalError ? esErrorDeRed(e.originalError) : false;
}

/**
 * Errores de la nube que se arreglan solos: el servidor no respondió bien un rato (500, 502, 503, 504), hay
 * demasiadas peticiones (429) o la sesión venció y se renueva sola (401, JWT expired). Un cambio que falla así
 * no se descarta: queda en la cola del equipo y se reintenta.
 */
export function esErrorTransitorio(error: unknown): boolean {
  if (!error) return false;
  const e = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; name?: unknown };
  const status = Number(e.status ?? e.statusCode);
  if (status === 401 || status === 408 || status === 429 || (status >= 500 && status < 600)) return true;
  const texto = `${String(e.code ?? '')} ${String(e.name ?? '')} ${String(e.message ?? '')}`;
  return /JWT expired|PGRST30[13]|\b57014\b|Bad Gateway|Service (Temporarily )?Unavailable|Gateway Time-?out|Internal Server Error|upstream|too many requests|rate limit/i.test(texto);
}

/** Error de Supabase con el código HTTP de la respuesta (para saber si fue un error pasajero del servidor). */
export const conEstado = <E extends object>(error: E, status: number): E & { status: number } => Object.assign(error, { status });
