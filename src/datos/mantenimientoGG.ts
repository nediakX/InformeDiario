// Tabla de mantenimiento de generadores: una fila por equipo en `mantenimiento_gg` (último mantenimiento,
// status, horas registradas, días del ciclo, refrigerante y último cambio de correa).
//
// Sin señal (en faena pasa seguido) la tabla se muestra con la última copia guardada en este equipo y
// los cambios quedan en cola: se suben solos apenas vuelve la conexión, sin perder ninguno.
import { useMemo, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { esErrorDeRed } from '../lib/conexion';
import type { Division } from './divisiones';
import type { DatosEquipo } from './indicadoresMantenimientoGG';

export const TABLA_MANTENIMIENTO_GG = 'mantenimiento_gg';

export interface FilaMantenimientoGG extends DatosEquipo {
  sitio: string;
  nombre: string;
  /** STATUS MMTTO de la planilla: cuánto se completó del último mantenimiento (0 a 100). */
  statusPct: number;
  refrigerante: string | null;
  orden: number;
}

/** Campos que se pueden cambiar desde la pantalla. */
export type CambiosMantenimientoGG = Partial<Omit<FilaMantenimientoGG, 'sitio' | 'orden'>>;

const COLUMNA: Record<keyof CambiosMantenimientoGG, string> = {
  nombre: 'nombre', ultimoHoras: 'ultimo_horas', ultimoFecha: 'ultimo_fecha', statusPct: 'status_pct',
  horasRegistradas: 'horas_registradas', horasRegistradasEn: 'horas_registradas_en', cicloDias: 'ciclo_dias',
  refrigerante: 'refrigerante', correaHoras: 'correa_horas', correaFecha: 'correa_fecha',
};
/** Columnas que agrega el SQL de noviembre de 2026. Si la base no se actualizó, no existen. */
const COLUMNAS_NUEVAS = ['status_pct', 'horas_registradas_en', 'correa_horas', 'correa_fecha'];
/** Sin la base actualizada, la fecha de las horas se puede omitir; el status y la correa no se pueden guardar. */
const NUEVAS_IMPRESCINDIBLES = ['status_pct', 'correa_horas', 'correa_fecha'];

type Numero = number | string | null | undefined;
interface FilaBD {
  sitio: string; nombre: string | null; ultimo_horas: Numero; ultimo_fecha: string | null; horas_registradas: Numero;
  ciclo_dias: number | null; refrigerante: string | null; orden: number | null;
  status_pct?: number | null; horas_registradas_en?: string | null; correa_horas?: Numero; correa_fecha?: string | null;
}

const numero = (v: Numero) => (v === null || v === undefined || v === '' ? null : Number(v));

const desdeBD = (f: FilaBD): FilaMantenimientoGG => ({
  sitio: f.sitio,
  nombre: f.nombre ?? '',
  ultimoHoras: numero(f.ultimo_horas),
  ultimoFecha: f.ultimo_fecha,
  statusPct: f.status_pct ?? 100,
  horasRegistradas: numero(f.horas_registradas),
  horasRegistradasEn: f.horas_registradas_en ?? null,
  cicloDias: f.ciclo_dias ?? 180,
  refrigerante: f.refrigerante,
  correaHoras: numero(f.correa_horas),
  correaFecha: f.correa_fecha ?? null,
  orden: f.orden ?? 0,
});

function aColumnas(cambios: CambiosMantenimientoGG): Record<string, unknown> {
  const datos: Record<string, unknown> = {};
  for (const [campo, valor] of Object.entries(cambios)) {
    const columna = COLUMNA[campo as keyof CambiosMantenimientoGG];
    if (columna && valor !== undefined) datos[columna] = valor;
  }
  return datos;
}

/** La base todavía no acepta días distintos de 180 y 210 (falta correr el SQL de los días). */
function diasNoPermitidos(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && e.code === '23514' && /ciclo_dias/i.test(e.message ?? '');
}

/** La base todavía no tiene una columna nueva (falta correr el SQL). */
function faltaColumna(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === 'PGRST204' || e.code === '42703' || /could not find the '.+' column|column .+ does not exist/i.test(e.message ?? ''));
}

// --- Copia en este equipo (para ver la tabla sin señal) -------------------------------------------

interface Copia { filas: FilaMantenimientoGG[]; faltaActualizarBD: boolean; guardadaEn: string }
const claveCopia = (division: Division) => `psinet_mtto_gg_${division}`;

function guardarCopia(division: Division, copia: Copia) {
  try { localStorage.setItem(claveCopia(division), JSON.stringify(copia)); } catch { /* sin almacenamiento */ }
}
function leerCopia(division: Division): Copia | null {
  try {
    const c = JSON.parse(localStorage.getItem(claveCopia(division)) ?? 'null') as Copia | null;
    return c && Array.isArray(c.filas) ? c : null;
  } catch { return null; }
}

// --- Cambios en cola (sin señal) -------------------------------------------------------------------

export interface CambioPendienteGG {
  division: Division;
  sitio: string;
  cambios: CambiosMantenimientoGG;
  /** Cuándo se hizo el último cambio de este equipo (ISO). */
  en: string;
  /** Motivo con que la nube no aceptó el cambio (no es falta de señal). */
  rechazo?: string;
}

const CLAVE_PENDIENTES = 'psinet_mtto_gg_pendientes';
/** Avisa a la pantalla que cambió la cola de cambios sin subir. */
export const EVENTO_MTTO_GG = 'psinet:mantenimiento-gg';

export function pendientesMantenimientoGG(division?: Division): CambioPendienteGG[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) ?? '[]') as CambioPendienteGG[];
    return division ? lista.filter(p => p.division === division) : lista;
  } catch { return []; }
}
function guardarPendientes(lista: CambioPendienteGG[]) {
  try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO_MTTO_GG));
}
function encolar(division: Division, sitio: string, cambios: CambiosMantenimientoGG) {
  const lista = pendientesMantenimientoGG();
  const i = lista.findIndex(p => p.division === division && p.sitio === sitio);
  const en = new Date().toISOString();
  if (i === -1) lista.push({ division, sitio, cambios, en });
  else lista[i] = { division, sitio, cambios: { ...lista[i].cambios, ...cambios }, en };
  guardarPendientes(lista);
}

/** Aplica sobre las filas los cambios que aún no suben (para que se vean igual sin señal). */
function conPendientes(division: Division, filas: FilaMantenimientoGG[]): FilaMantenimientoGG[] {
  const cola = pendientesMantenimientoGG(division);
  if (!cola.length) return filas;
  return filas.map(f => {
    const p = cola.find(x => x.sitio === f.sitio);
    return p ? { ...f, ...p.cambios } : f;
  });
}

const leerColaTexto = () => { try { return localStorage.getItem(CLAVE_PENDIENTES) ?? '[]'; } catch { return '[]'; } };
const suscribirCola = (avisar: () => void) => {
  window.addEventListener(EVENTO_MTTO_GG, avisar);
  window.addEventListener('storage', avisar); // otra pestaña del navegador
  return () => { window.removeEventListener(EVENTO_MTTO_GG, avisar); window.removeEventListener('storage', avisar); };
};

/** Cambios de la división que esperan señal para subir (se actualiza solo). */
export function usePendientesMantenimientoGG(division: Division): CambioPendienteGG[] {
  const texto = useSyncExternalStore(suscribirCola, leerColaTexto, () => '[]');
  return useMemo(() => {
    try { return (JSON.parse(texto) as CambioPendienteGG[]).filter(p => p.division === division); } catch { return []; }
  }, [texto, division]);
}

/** Descarta los cambios de un equipo que la nube no aceptó. */
export function descartarPendienteMantenimientoGG(division: Division, sitio: string) {
  guardarPendientes(pendientesMantenimientoGG().filter(p => !(p.division === division && p.sitio === sitio)));
}

// --- Leer y guardar --------------------------------------------------------------------------------

export interface TablaMantenimientoCargada {
  filas: FilaMantenimientoGG[];
  /** La base no tiene las columnas nuevas (falta correr el SQL): el status y la correa no se guardan. */
  faltaActualizarBD: boolean;
  /** Sin conexión: la tabla es la copia guardada en este equipo (cuándo se guardó, ISO). */
  copiaDel: string | null;
}

export async function listarMantenimientoGG(division: Division): Promise<TablaMantenimientoCargada> {
  try {
    const { data, error } = await supabase
      .from(TABLA_MANTENIMIENTO_GG)
      .select('*')
      .eq('division', division)
      .order('orden', { ascending: true });
    if (error) throw error;
    const crudas = (data ?? []) as FilaBD[];
    const filas = crudas.map(desdeBD);
    const faltaActualizarBD = crudas.length > 0 && !('correa_horas' in crudas[0]);
    guardarCopia(division, { filas, faltaActualizarBD, guardadaEn: new Date().toISOString() });
    return { filas: conPendientes(division, filas), faltaActualizarBD, copiaDel: null };
  } catch (error) {
    const copia = esErrorDeRed(error) ? leerCopia(division) : null;
    if (!copia) throw error;
    return { filas: conPendientes(division, copia.filas), faltaActualizarBD: copia.faltaActualizarBD, copiaDel: copia.guardadaEn };
  }
}

const actualizar = (division: Division, sitio: string, datos: Record<string, unknown>) => supabase
  .from(TABLA_MANTENIMIENTO_GG)
  .update({ ...datos, updated_at: new Date().toISOString() })
  .eq('division', division)
  .eq('sitio', sitio)
  .select('sitio');

/**
 * Sube los cambios de un equipo. 'falta_bd': no se pudo guardar el status o la correa (base sin actualizar);
 * 'falta_bd_dias': no se pudieron guardar días distintos de 180 y 210 (base sin actualizar; lo demás sí se guarda).
 */
async function subir(division: Division, sitio: string, cambios: CambiosMantenimientoGG): Promise<'guardado' | 'falta_bd' | 'falta_bd_dias'> {
  const datos = aColumnas(cambios);
  let { data, error } = await actualizar(division, sitio, datos);
  if (error && diasNoPermitidos(error)) {
    // Se guarda lo demás que venía en el cambio (si había algo) y se avisa que los días no.
    const sinDias = Object.fromEntries(Object.entries(cambios).filter(([c]) => c !== 'cicloDias')) as CambiosMantenimientoGG;
    if (Object.keys(sinDias).length && await subir(division, sitio, sinDias) === 'falta_bd') return 'falta_bd';
    return 'falta_bd_dias';
  }
  let faltaBD = false;
  if (error && faltaColumna(error)) {
    // Base sin el SQL nuevo: se guarda lo que sí existe y se avisa lo que no.
    faltaBD = NUEVAS_IMPRESCINDIBLES.some(c => c in datos);
    const existentes = Object.fromEntries(Object.entries(datos).filter(([c]) => !COLUMNAS_NUEVAS.includes(c)));
    if (!Object.keys(existentes).length) return 'falta_bd';
    ({ data, error } = await actualizar(division, sitio, existentes));
  }
  if (error) throw error;
  if (!data?.length) throw new Error('El equipo no está en la tabla o no tienes permiso para cambiarlo.');
  return faltaBD ? 'falta_bd' : 'guardado';
}

export type ResultadoGuardado = 'guardado' | 'pendiente' | 'falta_bd' | 'falta_bd_dias';

/**
 * Guarda los campos que cambiaron de un equipo (solo esos, para no pisar lo que otra persona cambió en
 * otros campos). Sin señal quedan guardados en este equipo y se suben solos después.
 */
export async function guardarCambiosMantenimientoGG(division: Division, sitio: string, cambios: CambiosMantenimientoGG): Promise<ResultadoGuardado> {
  // Si este equipo ya tiene cambios esperando, este va a la cola detrás de ellos (en orden).
  if (pendientesMantenimientoGG(division).some(p => p.sitio === sitio)) {
    encolar(division, sitio, cambios);
    void sincronizarMantenimientoGG();
    return 'pendiente';
  }
  try {
    return await subir(division, sitio, cambios);
  } catch (error) {
    if (!esErrorDeRed(error)) throw error;
    encolar(division, sitio, cambios);
    return 'pendiente';
  }
}

let subiendo = false;
/** Sube los cambios que quedaron guardados sin señal. Devuelve cuántos equipos se subieron. */
export async function sincronizarMantenimientoGG(): Promise<number> {
  if (subiendo) return 0;
  const cola = pendientesMantenimientoGG();
  if (!cola.length) return 0;
  subiendo = true;
  let subidos = 0;
  try {
    for (const p of cola) {
      try {
        if (await subir(p.division, p.sitio, p.cambios) === 'falta_bd_dias') {
          // Lo demás ya subió: en la cola quedan solo los días, avisando por qué la nube no los acepta.
          const motivo = 'para guardar días distintos de 180 y 210 falta actualizar la base de datos';
          guardarPendientes(pendientesMantenimientoGG().map(x => (x.division === p.division && x.sitio === p.sitio && x.en === p.en
            ? { ...x, cambios: { cicloDias: p.cambios.cicloDias }, rechazo: motivo } : x)));
          continue;
        }
      } catch (error) {
        if (esErrorDeRed(error)) break; // sin señal: se intenta más tarde
        console.error('No se pudo subir un cambio de la tabla de mantenimiento GG:', error);
        const motivo = (error as { message?: string })?.message?.trim() || 'sin detalle';
        guardarPendientes(pendientesMantenimientoGG().map(x => (x.division === p.division && x.sitio === p.sitio && x.rechazo !== motivo ? { ...x, rechazo: motivo } : x)));
        continue;
      }
      // Se quita de la cola solo si nadie lo cambió mientras subía (si cambió, sube en la próxima vuelta).
      guardarPendientes(pendientesMantenimientoGG().filter(x => !(x.division === p.division && x.sitio === p.sitio && x.en === p.en)));
      subidos += 1;
    }
  } finally {
    subiendo = false;
  }
  return subidos;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void sincronizarMantenimientoGG(); });
  window.setInterval(() => { if (pendientesMantenimientoGG().length) void sincronizarMantenimientoGG(); }, 30_000);
}

/** Escucha los cambios que hacen otras personas en la tabla de la división. */
export function suscribirMantenimientoGG(division: Division, alCambiar: () => void): () => void {
  const canal = supabase
    .channel(`mantenimiento-gg-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA_MANTENIMIENTO_GG, filter: `division=eq.${division}` }, alCambiar)
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}
