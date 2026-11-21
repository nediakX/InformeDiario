// Medición de baterías: una fila por medición en `mediciones_baterias` (un carro en una fecha, con todos
// sus bancos y baterías en `bancos`).
//
// Sin señal (en faena pasa seguido) se ven las mediciones de la última copia guardada en este equipo, y lo
// que se registra, corrige o borra queda en cola: se sube solo apenas vuelve la conexión. Si la base aún no
// tiene la tabla (falta correr el SQL), también queda en cola hasta que exista, así no se pierde nada.
import { useMemo, useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { esErrorDeRed } from '../lib/conexion';
import type { Division } from './divisiones';
import { type Banco, type MedicionBaterias, masNuevaPrimero } from './indicadoresBaterias';

export const TABLA_BATERIAS = 'mediciones_baterias';

interface FilaBD {
  id: string; division: Division; carro: string; fecha: string; turno: string | null; bancos: unknown;
  observaciones: string | null; registrado_por: string | null; registrado_nombre: string | null;
  actualizado_nombre: string | null; created_at: string; updated_at: string;
}

const numero = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return null;
};

function bancosDesdeBD(valor: unknown): Banco[] {
  if (!Array.isArray(valor)) return [];
  return valor.map(b => {
    const baterias = (b && typeof b === 'object' && Array.isArray((b as { baterias?: unknown }).baterias) ? (b as { baterias: unknown[] }).baterias : []);
    return {
      baterias: baterias.map(x => {
        const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
        return { resistencia: numero(o.resistencia), voltaje: numero(o.voltaje) };
      }),
    };
  });
}

const desdeBD = (f: FilaBD): MedicionBaterias => ({
  id: f.id,
  division: f.division,
  carro: f.carro,
  fecha: f.fecha,
  turno: f.turno === 'TURNO A' || f.turno === 'TURNO B' ? f.turno : null,
  bancos: bancosDesdeBD(f.bancos),
  observaciones: f.observaciones ?? '',
  registradoPor: f.registrado_por,
  registradoNombre: f.registrado_nombre ?? '',
  actualizadoNombre: f.actualizado_nombre ?? '',
  creadoEn: f.created_at,
  actualizadoEn: f.updated_at,
});

/** Columnas que se envían al guardar (quién la registró lo pone la base la primera vez). */
const aBD = (m: MedicionBaterias) => ({
  id: m.id,
  division: m.division,
  carro: m.carro,
  fecha: m.fecha,
  turno: m.turno,
  bancos: m.bancos.map(b => ({ baterias: b.baterias.map(x => ({ resistencia: x.resistencia, voltaje: x.voltaje })) })),
  observaciones: m.observaciones.trim() || null,
  registrado_nombre: m.registradoNombre || null,
  actualizado_nombre: m.actualizadoNombre || null,
});

/** La base todavía no tiene la tabla (falta correr el SQL de noviembre de 2026). */
export function faltaTablaBaterias(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  return !!e && (e.code === 'PGRST205' || e.code === '42P01' || /could not find the table|relation .+ does not exist/i.test(e.message ?? ''));
}

// --- Copia en este equipo (para ver las mediciones sin señal) --------------------------------------

interface Copia { mediciones: MedicionBaterias[]; guardadaEn: string }
const claveCopia = (division: Division) => `psinet_baterias_${division}`;

function guardarCopia(division: Division, copia: Copia) {
  try { localStorage.setItem(claveCopia(division), JSON.stringify(copia)); } catch { /* sin almacenamiento */ }
}
function leerCopia(division: Division): Copia | null {
  try {
    const c = JSON.parse(localStorage.getItem(claveCopia(division)) ?? 'null') as Copia | null;
    return c && Array.isArray(c.mediciones) ? c : null;
  } catch { return null; }
}

// --- Cola de lo que espera subir ------------------------------------------------------------------

export type CambioPendienteBaterias = {
  division: Division;
  id: string;
  /** Cuándo se hizo el cambio (ISO). */
  en: string;
  /** Motivo con que la nube no lo aceptó (no es falta de señal). */
  rechazo?: string;
} & ({ op: 'guardar'; medicion: MedicionBaterias } | { op: 'eliminar' });

const CLAVE_PENDIENTES = 'psinet_baterias_pendientes';
/** Avisa a la pantalla que cambió la cola. */
export const EVENTO_BATERIAS = 'psinet:baterias';
/** Avisa que cambios de la cola llegaron a la nube. */
const EVENTO_BATERIAS_SUBIDAS = 'psinet:baterias-subidas';

export function pendientesBaterias(division?: Division): CambioPendienteBaterias[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) ?? '[]') as CambioPendienteBaterias[];
    return division ? lista.filter(p => p.division === division) : lista;
  } catch { return []; }
}
function guardarPendientes(lista: CambioPendienteBaterias[]) {
  try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO_BATERIAS));
}
/** Un cambio por medición: el último reemplaza al anterior (guardar dos veces sube solo lo último). */
function encolar(cambio: CambioPendienteBaterias) {
  guardarPendientes([...pendientesBaterias().filter(p => p.id !== cambio.id), cambio]);
}

/** Aplica sobre la lista lo que aún no sube (para que se vea igual sin señal). */
function conPendientes(division: Division, mediciones: MedicionBaterias[]): MedicionBaterias[] {
  const cola = pendientesBaterias(division);
  if (!cola.length) return mediciones;
  const porId = new Map(mediciones.map(m => [m.id, m]));
  for (const p of cola) {
    if (p.op === 'guardar') porId.set(p.id, p.medicion);
    else porId.delete(p.id);
  }
  return [...porId.values()].sort(masNuevaPrimero);
}

const leerColaTexto = () => { try { return localStorage.getItem(CLAVE_PENDIENTES) ?? '[]'; } catch { return '[]'; } };
const suscribirCola = (avisar: () => void) => {
  window.addEventListener(EVENTO_BATERIAS, avisar);
  window.addEventListener('storage', avisar); // otra pestaña del navegador
  return () => { window.removeEventListener(EVENTO_BATERIAS, avisar); window.removeEventListener('storage', avisar); };
};

/** Cambios de la división que esperan subir (se actualiza solo). */
export function usePendientesBaterias(division: Division): CambioPendienteBaterias[] {
  const texto = useSyncExternalStore(suscribirCola, leerColaTexto, () => '[]');
  return useMemo(() => {
    try { return (JSON.parse(texto) as CambioPendienteBaterias[]).filter(p => p.division === division); } catch { return []; }
  }, [texto, division]);
}

/** Descarta un cambio que la nube no aceptó. */
export function descartarPendienteBaterias(id: string) {
  guardarPendientes(pendientesBaterias().filter(p => p.id !== id));
}

// --- Leer y guardar --------------------------------------------------------------------------------

export interface MedicionesCargadas {
  mediciones: MedicionBaterias[];
  /** No se pudo leer la nube (sin señal): se muestra la copia de este equipo, si hay. */
  sinConexion: boolean;
  /** Cuándo se guardó la copia que se está mostrando (ISO), o null si no hay copia. */
  copiaDel: string | null;
  /** La base no tiene la tabla: lo registrado queda en este equipo hasta que se corra el SQL. */
  faltaTabla: boolean;
}

export async function listarMedicionesBaterias(division: Division): Promise<MedicionesCargadas> {
  try {
    const { data, error } = await supabase
      .from(TABLA_BATERIAS)
      .select('*')
      .eq('division', division)
      .order('fecha', { ascending: false });
    if (error) throw error;
    const mediciones = ((data ?? []) as FilaBD[]).map(desdeBD);
    guardarCopia(division, { mediciones, guardadaEn: new Date().toISOString() });
    return { mediciones: conPendientes(division, mediciones), sinConexion: false, copiaDel: null, faltaTabla: false };
  } catch (error) {
    if (faltaTablaBaterias(error)) return { mediciones: conPendientes(division, []), sinConexion: false, copiaDel: null, faltaTabla: true };
    if (!esErrorDeRed(error)) throw error;
    // Sin señal: la copia de este equipo (si hay) más lo que espera subir; igual se puede registrar.
    const copia = leerCopia(division);
    return { mediciones: conPendientes(division, copia?.mediciones ?? []), sinConexion: true, copiaDel: copia?.guardadaEn ?? null, faltaTabla: false };
  }
}

async function subir(p: CambioPendienteBaterias): Promise<void> {
  if (p.op === 'guardar') {
    const { error } = await supabase.from(TABLA_BATERIAS).upsert(aBD(p.medicion), { onConflict: 'id' });
    if (error) throw error;
  } else {
    const { error } = await supabase.from(TABLA_BATERIAS).delete().eq('id', p.id);
    if (error) throw error;
  }
}

/** 'pendiente': quedó en este equipo y sube solo (sin señal, o la base aún no tiene la tabla).
 *  'rechazado': la nube no lo aceptó (queda en la cola con el motivo, para verlo y descartarlo). */
export type ResultadoBaterias = 'guardado' | 'pendiente' | 'rechazado';

async function aplicar(cambio: CambioPendienteBaterias): Promise<ResultadoBaterias> {
  // Primero queda en este equipo y después se sube: si se corta la señal a medio subir o se cierra la
  // app, el cambio no se pierde (se sube solo después). Un cambio nuevo de la misma medición reemplaza
  // al que esperaba.
  encolar(cambio);
  if (!pendientesBaterias().some(p => p.id === cambio.id && p.en === cambio.en)) {
    // El equipo no deja guardar nada (almacenamiento lleno o bloqueado): se sube directo.
    await subir(cambio);
    return 'guardado';
  }
  await sincronizarBaterias();
  const queda = pendientesBaterias().find(p => p.id === cambio.id && p.en === cambio.en);
  if (!queda) return 'guardado';
  return queda.rechazo ? 'rechazado' : 'pendiente';
}

export const guardarMedicionBaterias = (m: MedicionBaterias) =>
  aplicar({ op: 'guardar', division: m.division, id: m.id, medicion: m, en: new Date().toISOString() });

export const eliminarMedicionBaterias = (division: Division, id: string) =>
  aplicar({ op: 'eliminar', division, id, en: new Date().toISOString() });

async function subirCola(): Promise<number> {
  let subidos = 0;
  for (const p of pendientesBaterias()) {
    try {
      await subir(p);
    } catch (error) {
      if (esErrorDeRed(error) || faltaTablaBaterias(error)) break; // se intenta más tarde
      console.error('No se pudo subir una medición de baterías:', error);
      const motivo = (error as { message?: string })?.message?.trim() || 'sin detalle';
      guardarPendientes(pendientesBaterias().map(x => (x.id === p.id && x.en === p.en ? { ...x, rechazo: motivo } : x)));
      continue;
    }
    // Sale de la cola solo si nadie la cambió mientras subía (si cambió, sube en la próxima vuelta).
    guardarPendientes(pendientesBaterias().filter(x => !(x.id === p.id && x.en === p.en)));
    subidos += 1;
  }
  if (subidos) window.dispatchEvent(new Event(EVENTO_BATERIAS_SUBIDAS));
  return subidos;
}

/** Cambios de la cola que llegaron a la nube (la pantalla vuelve a leer la lista). */
export function suscribirSubidasBaterias(alSubir: () => void): () => void {
  window.addEventListener(EVENTO_BATERIAS_SUBIDAS, alSubir);
  return () => window.removeEventListener(EVENTO_BATERIAS_SUBIDAS, alSubir);
}

let enCurso: Promise<number> | null = null;
/** Sube lo que quedó en cola. Devuelve cuántos cambios se subieron. Si ya se está subiendo, espera y
 *  vuelve a revisar la cola (así lo que se agregó mientras tanto también sube). */
export function sincronizarBaterias(): Promise<number> {
  if (enCurso) return enCurso.then(() => sincronizarBaterias());
  if (!pendientesBaterias().length) return Promise.resolve(0);
  enCurso = subirCola().finally(() => { enCurso = null; });
  return enCurso;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void sincronizarBaterias(); });
  window.setInterval(() => { if (pendientesBaterias().some(p => !p.rechazo)) void sincronizarBaterias(); }, 30_000);
}

/** Escucha lo que registran otras personas en la división. */
export function suscribirMedicionesBaterias(division: Division, alCambiar: () => void): () => void {
  const canal = supabase
    .channel(`baterias-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA_BATERIAS, filter: `division=eq.${division}` }, alCambiar)
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}

// --- Medición a medio llenar (en este equipo) ------------------------------------------------------

/** Lo escrito en cada casilla, tal cual (así "3," a medio escribir no se pierde). */
export interface CasillasBateria { r: string; v: string }

export interface BorradorBaterias {
  /** Medición que se está corrigiendo (null = nueva). */
  editando: string | null;
  carro: string;
  fecha: string;
  bancos: CasillasBateria[][];
  observaciones: string;
  guardadoEn: string;
}
/** Un borrador para la medición nueva y uno por cada medición que se esté corrigiendo. */
const claveBorrador = (division: Division, editando: string | null) => `psinet_baterias_borrador_${division}_${editando ?? 'nueva'}`;

export function leerBorradorBaterias(division: Division, editando: string | null): BorradorBaterias | null {
  try {
    const b = JSON.parse(localStorage.getItem(claveBorrador(division, editando)) ?? 'null') as BorradorBaterias | null;
    return b && typeof b.carro === 'string' && Array.isArray(b.bancos) ? b : null;
  } catch { return null; }
}
export function guardarBorradorBaterias(division: Division, editando: string | null, b: BorradorBaterias | null) {
  try {
    if (b) localStorage.setItem(claveBorrador(division, editando), JSON.stringify(b));
    else localStorage.removeItem(claveBorrador(division, editando));
  } catch { /* sin almacenamiento */ }
}
