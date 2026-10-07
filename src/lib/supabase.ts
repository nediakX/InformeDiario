import { createClient } from '@supabase/supabase-js';
import { esErrorDeRed, marcarEnLinea, marcarSinConexion } from './conexion';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY: la sincronización en la nube no funcionará.");
}

// Cliente único de la app. La sesión del usuario (login) se guarda en el dispositivo y se renueva sola;
// las políticas de la base de datos solo dejan leer/escribir a las cuentas aprobadas.
// Con señal débil una llamada puede quedar colgada para siempre: se corta a los 60 s y se trata
// como "sin conexión" (el cambio queda en cola y se sube después). Cada respuesta que llega
// confirma que hay conexión; cada fallo de red marca "sin conexión".
const TIEMPO_MAXIMO_MS = 60_000;
const fetchConTiempoMaximo: typeof fetch = async (input, init) => {
  const controlador = new AbortController();
  const timer = setTimeout(() => controlador.abort(new DOMException("Tiempo de espera agotado (timeout)", "TimeoutError")), TIEMPO_MAXIMO_MS);
  init?.signal?.addEventListener("abort", () => controlador.abort(init.signal?.reason), { once: true });
  try {
    const respuesta = await fetch(input, { ...init, signal: controlador.signal });
    marcarEnLinea();
    return respuesta;
  } catch (error) {
    if (esErrorDeRed(error)) marcarSinConexion();
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  global: { fetch: fetchConTiempoMaximo },
  // Sin reintentos automáticos de las consultas (esperaban 1 + 2 + 4 s sin señal antes de rendirse):
  // sin conexión se usa al instante la copia local, y los cambios pendientes se reintentan solos
  // desde la cola de sincronización.
  db: { retry: false },
});

export const BORRADORES_TABLE = "borradores";
export const EVIDENCIAS_BUCKET = "evidencias";
// Borradores de Mantenimiento de Generador e Informe de Falla — Carro: una sola tabla genérica,
// con "tipo" para distinguirlos y "datos" (JSONB) con el estado completo del formulario.
export const BORRADORES_OTROS_TABLE = "borradores_otros";