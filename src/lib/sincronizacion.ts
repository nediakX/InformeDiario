// Modo sin conexión: cola de cambios pendientes y copia local de las listas.
//
// Cuando no hay señal, guardar o eliminar un informe no falla: el cambio queda en una cola en este
// dispositivo (IndexedDB, con sus fotos) y se sube solo a la nube al volver la conexión. Mientras
// tanto, las listas se arman con la última copia descargada más los cambios de la cola, así que
// todo lo que se guardó sin señal se sigue viendo y se puede seguir editando.
//
// Si hay varios cambios del mismo informe, solo se guarda el último (cada informe ocupa un lugar en
// la cola). Si dos personas editan el mismo informe sin señal, al sincronizar queda el último en subir.
import { useSyncExternalStore } from 'react';
import { leerLocal, guardarLocal, borrarLocal } from './almacenLocal';
import { esErrorDeRed, hayConexion, suscribirConexion } from './conexion';

export type TablaSync = 'borradores' | 'borradores_otros';

export interface OperacionPendiente {
  /** `${tabla}:${id}` — un lugar por informe en la cola. */
  clave: string;
  tabla: TablaSync;
  tipo: 'guardar' | 'eliminar';
  id: string;
  /** Informe completo a guardar (con sus fotos todavía en el dispositivo). */
  entry?: unknown;
  /** Momento en que se encoló (distingue versiones del mismo informe). */
  encoladoEn: string;
  intentos: number;
  ultimoError?: string;
}

interface Ejecutor {
  guardar: (entry: unknown) => Promise<unknown>;
  eliminar: (id: string) => Promise<void>;
}

const CLAVE_INDICE = 'sync_cola_indice';
const claveItem = (clave: string) => `sync_cola:${clave}`;
export const claveCola = (tabla: TablaSync, id: string) => `${tabla}:${id}`;

const cola = new Map<string, OperacionPendiente>();
const ejecutores = new Map<TablaSync, Ejecutor>();
let cargada: Promise<void> | null = null;
let sincronizando = false;
let promesaSync: Promise<void> | null = null;

// --- Estado observable (para el indicador de conexión) --------------------------------------
interface EstadoSync { pendientes: number; sincronizando: boolean; conError: number }
let estado: EstadoSync = { pendientes: 0, sincronizando: false, conError: 0 };
const oyentes = new Set<() => void>();
function publicar() {
  const items = [...cola.values()];
  estado = { pendientes: items.length, sincronizando, conError: items.filter(i => i.ultimoError && !esMensajeDeRed(i.ultimoError)).length };
  oyentes.forEach(fn => fn());
}
const esMensajeDeRed = (m: string) => esErrorDeRed({ message: m });
export function useEstadoSincronizacion(): EstadoSync {
  return useSyncExternalStore(fn => { oyentes.add(fn); return () => { oyentes.delete(fn); }; }, () => estado, () => estado);
}

// --- Cola persistente ----------------------------------------------------------------------
function cargarCola(): Promise<void> {
  if (!cargada) {
    cargada = (async () => {
      const indice = (await leerLocal<string[]>(CLAVE_INDICE)) ?? [];
      for (const clave of indice) {
        const item = await leerLocal<OperacionPendiente>(claveItem(clave));
        if (item) cola.set(clave, item);
      }
      publicar();
    })().catch(error => { console.error('No se pudo leer la cola de sincronización:', error); });
  }
  return cargada;
}

const guardarIndice = () => guardarLocal(CLAVE_INDICE, [...cola.keys()]);

async function ponerEnCola(op: Omit<OperacionPendiente, 'clave' | 'encoladoEn' | 'intentos'>): Promise<void> {
  await cargarCola();
  const clave = claveCola(op.tabla, op.id);
  const item: OperacionPendiente = { ...op, clave, encoladoEn: new Date().toISOString(), intentos: 0 };
  cola.set(clave, item);
  await guardarLocal(claveItem(clave), item);
  await guardarIndice();
  publicar();
}

/** Quita un informe de la cola. Si se indica la versión, solo se quita si no llegó otra más nueva mientras tanto. */
async function quitarDeCola(clave: string, version?: string): Promise<void> {
  await cargarCola();
  const actual = cola.get(clave);
  if (!actual || (version && actual.encoladoEn !== version)) return;
  cola.delete(clave);
  await borrarLocal(claveItem(clave));
  await guardarIndice();
  publicar();
}

/** Cada tabla registra cómo guardar/eliminar de verdad en la nube (lo usa la sincronización). */
export function registrarEjecutor(tabla: TablaSync, ejecutor: Ejecutor) {
  ejecutores.set(tabla, ejecutor);
}

/**
 * Guarda en la nube; si no hay conexión, deja el cambio en la cola y devuelve el informe tal cual.
 * Cualquier otro error (permisos, datos) se lanza como siempre.
 */
export async function guardarConCola<T>(tabla: TablaSync, id: string, entry: T, guardarEnNube: (e: T) => Promise<T>): Promise<T> {
  await cargarCola();
  const clave = claveCola(tabla, id);
  // Si hay cambios anteriores de otros informes esperando, este se pone a la fila (respeta el orden).
  if (!hayConexion()) {
    await ponerEnCola({ tabla, tipo: 'guardar', id, entry });
    return entry;
  }
  try {
    const guardado = await guardarEnNube(entry);
    await quitarDeCola(clave); // lo que hubiera en cola de este informe ya quedó superado
    return guardado;
  } catch (error) {
    if (!esErrorDeRed(error)) throw error;
    await ponerEnCola({ tabla, tipo: 'guardar', id, entry });
    return entry;
  }
}

/** Elimina en la nube; sin conexión, la eliminación queda en cola (y reemplaza un guardado pendiente). */
export async function eliminarConCola(tabla: TablaSync, id: string, eliminarEnNube: (id: string) => Promise<void>): Promise<void> {
  await cargarCola();
  const clave = claveCola(tabla, id);
  if (hayConexion()) {
    try {
      await eliminarEnNube(id);
      await quitarDeCola(clave);
      return;
    } catch (error) {
      if (!esErrorDeRed(error)) throw error;
    }
  }
  await ponerEnCola({ tabla, tipo: 'eliminar', id });
}

/**
 * Lista de la nube (o, sin conexión, la última copia guardada) + los cambios que están en cola.
 * `perteneceALaLista` decide qué informes en cola van en esta lista (tipo, división…).
 */
export async function listaConCambiosLocales<T extends { id: string }>(
  claveCache: string,
  pedirANube: () => Promise<T[]>,
  tabla: TablaSync,
  perteneceALaLista: (entry: T) => boolean,
  ordenar: (a: T, b: T) => number,
): Promise<T[]> {
  await cargarCola();
  let lista: T[];
  try {
    lista = await pedirANube();
    void guardarLocal(claveCache, lista);
  } catch (error) {
    if (!esErrorDeRed(error)) console.error('No se pudo cargar la lista desde la nube:', error);
    lista = (await leerLocal<T[]>(claveCache)) ?? [];
  }
  const porId = new Map(lista.map(e => [e.id, e]));
  for (const op of cola.values()) {
    if (op.tabla !== tabla) continue;
    if (op.tipo === 'eliminar') { porId.delete(op.id); continue; }
    const entry = op.entry as T;
    if (entry && perteneceALaLista(entry)) porId.set(op.id, entry);
  }
  return [...porId.values()].sort(ordenar);
}

/** true si el informe tiene cambios guardados solo en este dispositivo (aún no subidos). */
export const tieneCambiosPendientes = (tabla: TablaSync, id: string) => cola.has(claveCola(tabla, id));

// --- Sincronización ------------------------------------------------------------------------
export const EVENTO_SINCRONIZADO = 'psinet:sincronizado';

/** Sube a la nube todo lo que quedó en cola, en orden. Se detiene si se vuelve a perder la señal. */
export function sincronizar(): Promise<void> {
  if (promesaSync) return promesaSync;
  promesaSync = (async () => {
    await cargarCola();
    if (!cola.size) return;
    sincronizando = true;
    publicar();
    let subidos = 0;
    try {
      const items = [...cola.values()].sort((a, b) => a.encoladoEn.localeCompare(b.encoladoEn));
      for (const item of items) {
        const ejecutor = ejecutores.get(item.tabla);
        if (!ejecutor) continue;
        try {
          if (item.tipo === 'guardar') await ejecutor.guardar(item.entry);
          else await ejecutor.eliminar(item.id);
          await quitarDeCola(item.clave, item.encoladoEn);
          subidos += 1;
        } catch (error) {
          const mensaje = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
          const actual = cola.get(item.clave);
          if (actual && actual.encoladoEn === item.encoladoEn) {
            actual.intentos += 1;
            actual.ultimoError = mensaje;
            void guardarLocal(claveItem(item.clave), actual);
          }
          if (esErrorDeRed(error)) break; // se perdió la señal: se reintenta después
          console.error(`No se pudo sincronizar ${item.clave}:`, error);
        }
      }
    } finally {
      sincronizando = false;
      publicar();
      if (subidos > 0 && typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_SINCRONIZADO));
    }
  })().finally(() => { promesaSync = null; });
  return promesaSync;
}

// Reintentos automáticos: al volver la conexión y cada 20 s mientras haya cambios pendientes.
if (typeof window !== 'undefined') {
  void cargarCola().then(() => { if (hayConexion()) void sincronizar(); });
  suscribirConexion(() => { if (hayConexion()) void sincronizar(); });
  window.setInterval(() => {
    if (cola.size && !sincronizando) void sincronizar();
  }, 20_000);
}
