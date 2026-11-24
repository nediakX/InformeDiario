// Reportabilidad de GG (grupos generadores): cada reporte es una fila de la tabla `reportes_gg`
// (mismas columnas que el formulario "REPORTABILIDAD DE GG" de Google Forms y su planilla).
import { supabase } from '../lib/supabase';
import { esErrorDeRed } from '../lib/conexion';
import type { Division } from './divisiones';
import { esNoRealizada, reporteQueBloquea } from './reglasGG';

export const TABLA_GG = 'reportes_gg';

export const OPCIONES_COMBUSTIBLE = ['1/4', '1/2', '3/4', 'Lleno'] as const;
export const OPCIONES_REFRIGERANTE = ['Minimo', 'Medio', 'Alta'] as const;
export const OPCIONES_ACEITE = ['Bajo', 'Optimo', 'Sobre Relleno'] as const;
export const OPCIONES_TURNO = ['TURNO A', 'TURNO B'] as const;

/** Sitios del formulario (El Salvador). Andina usa sus carros. */
export const SITIOS_GG: Record<Division, string[]> = {
  el_salvador: [
    'LTE_CMF_01', 'LTE_CMF_02', 'LTE_CMF_04', 'LTE_CMF_08', 'LTE_CMF_09',
    'LTE_CMM_03', 'LTE_CMM_05', 'LTE_CMM_06', 'LTE_CMM_07', 'LTE_CMM_10',
    'LTE_11', 'LTE_CM_MMOO_01',
  ],
  andina: ['SUR_SUR', 'CONGRESO', 'CHIVATO', 'DNL', 'MORRENA', 'TRES_ESQUINAS', 'PIPA', '3700'],
};

/** Personas del formulario "P Q REPORTA" (se puede escribir otro nombre). */
export const REPORTAN_GG: Record<Division, string[]> = {
  el_salvador: [
    'Max Diaz', 'Oscar Muñoz', 'Patricio Santana', 'Carlos Moll', 'Camilo Pailapan', 'Luis Fernandez',
    'Alberto Arancibia', 'Juan Saavedra', 'Rodny Zambrano', 'Claudio Orrego', 'Juan Morata', 'Vanesa Aguilar',
    'Mirko Roja', 'Marcelo Artal', 'Fernando Contreras', 'Ronald Castillo', 'Ricardo Riquelme',
  ],
  andina: [],
};

export interface ReporteGG {
  id: string;
  division: Division;
  marcaTemporal: string;
  fecha: string;
  hora: string | null;
  sitio: string;
  turno: string;
  reporta: string;
  combustible: string | null;
  horometro: number | null;
  nroPartidas: number | null;
  nivelRefrigerante: string | null;
  nivelAceite: string | null;
  temperatura: number | null;
  /** Motivo o comentario de bitácora (ej: por qué no se pudo revisar el carro). */
  observaciones: string | null;
  creadoPor: string | null;
}

type Fila = {
  id: string; division: Division; marca_temporal: string; fecha: string; hora: string | null; sitio: string;
  turno: string; reporta: string; combustible: string | null; horometro: number | string | null;
  nro_partidas: number | null; nivel_refrigerante: string | null; nivel_aceite: string | null;
  temperatura?: number | string | null; observaciones?: string | null; creado_por: string | null;
  /** Columnas de una versión anterior de la tabla (dos temperaturas). */
  temperatura_1?: number | string | null; temperatura_2?: number | string | null;
};

const numero = (v: number | string | null) => (v === null || v === '' ? null : Number(v));

const aReporte = (f: Fila): ReporteGG => ({
  id: f.id, division: f.division, marcaTemporal: f.marca_temporal, fecha: f.fecha, hora: f.hora ? f.hora.slice(0, 5) : null,
  sitio: f.sitio, turno: f.turno, reporta: f.reporta, combustible: f.combustible, horometro: numero(f.horometro),
  nroPartidas: f.nro_partidas, nivelRefrigerante: f.nivel_refrigerante, nivelAceite: f.nivel_aceite,
  temperatura: numero(f.temperatura ?? f.temperatura_1 ?? f.temperatura_2 ?? null), observaciones: f.observaciones ?? null, creadoPor: f.creado_por,
});

export type NuevoReporteGG = Omit<ReporteGG, 'id' | 'marcaTemporal' | 'creadoPor'>;

/** El carro ya tenía su reportabilidad de ese día (la hizo otra persona, o este equipo sin señal): no se guarda otra. */
export class ReporteGGRepetido extends Error {
  readonly existente: ReporteGG;
  constructor(existente: ReporteGG) {
    super(`${existente.sitio} ya tiene su reportabilidad del ${existente.fecha}.`);
    this.name = 'ReporteGGRepetido';
    this.existente = existente;
  }
}

const aFila = (r: NuevoReporteGG) => ({
  division: r.division, fecha: r.fecha, hora: r.hora || null, sitio: r.sitio, turno: r.turno, reporta: r.reporta,
  combustible: r.combustible, horometro: r.horometro, nro_partidas: r.nroPartidas, nivel_refrigerante: r.nivelRefrigerante,
  nivel_aceite: r.nivelAceite, temperatura: r.temperatura, observaciones: r.observaciones || null,
});

export interface FiltroGG {
  division: Division;
  sitio?: string;
  desde?: string;
  hasta?: string;
}

const consulta = (f: FiltroGG) => {
  let q = supabase.from(TABLA_GG).select('*').eq('division', f.division);
  if (f.sitio) q = q.eq('sitio', f.sitio);
  if (f.desde) q = q.gte('fecha', f.desde);
  if (f.hasta) q = q.lte('fecha', f.hasta);
  return q.order('fecha', { ascending: false }).order('hora', { ascending: false, nullsFirst: false }).order('marca_temporal', { ascending: false });
};

/** Una página de reportes (los más recientes primero). */
export async function listarReportesGG(f: FiltroGG, desde = 0, cantidad = 100): Promise<ReporteGG[]> {
  const { data, error } = await consulta(f).range(desde, desde + cantidad - 1);
  if (error) throw error;
  return (data as Fila[]).map(aReporte);
}

/** Todos los reportes del filtro (para descargar el Excel), de a 1000. */
export async function todosLosReportesGG(f: FiltroGG): Promise<ReporteGG[]> {
  const todos: ReporteGG[] = [];
  for (let desde = 0; ; desde += 1000) {
    const pagina = await listarReportesGG(f, desde, 1000);
    todos.push(...pagina);
    if (pagina.length < 1000) return todos;
  }
}

/** Reporte guardado solo en este equipo (sin señal), esperando subir a la nube. */
export interface ReporteGGPendiente extends ReporteGG {
  pendiente: true;
  /** Motivo con que la nube NO aceptó el reporte (no es falta de señal). Igual se sigue reintentando. */
  rechazo?: string;
  /**
   * Al volver la señal, el carro ya tenía su reportabilidad de ese día (la hizo otra persona): este no se sube para no
   * duplicarla. Queda en el equipo hasta que se descarte o, un supervisor, lo use en lugar del que ya estaba.
   */
  repetido?: { id: string; hora: string | null; reporta: string; noRealizada: boolean };
}

const CLAVE_PENDIENTES = 'psinet_reportes_gg_pendientes';
export const EVENTO_GG = 'psinet:reportes-gg';

export function pendientesGG(): ReporteGGPendiente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) ?? '[]') as ReporteGGPendiente[]; } catch { return []; }
}
function guardarPendientes(lista: ReporteGGPendiente[]) {
  try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO_GG));
}
/** Reportes de la división que siguen en el equipo y cuentan (sin los repetidos, que no se van a subir). */
export const pendientesValidosGG = (division: Division) => pendientesGG().filter(p => p.division === division && !p.repetido);

/** Reportes de un carro en un día, en la nube. */
async function reportesDelCarroEnElDia(division: Division, fecha: string, sitio: string): Promise<ReporteGG[]> {
  const { data, error } = await supabase.from(TABLA_GG).select('*').eq('division', division).eq('fecha', fecha).eq('sitio', sitio);
  if (error) throw error;
  return (data as Fila[]).map(aReporte);
}

// Lo que ya está reportado hoy, guardado en el equipo: sin señal se sigue viendo qué carros estaban hechos.
const CLAVE_HOY = 'psinet_reportes_gg_hoy';
export function guardarReportesDelDia(division: Division, fecha: string, reportes: ReporteGG[]) {
  try { localStorage.setItem(`${CLAVE_HOY}_${division}`, JSON.stringify({ fecha, guardado: new Date().toISOString(), reportes })); } catch { /* sin almacenamiento */ }
}
export function reportesDelDiaGuardados(division: Division, fecha: string): { guardado: string; reportes: ReporteGG[] } | null {
  try {
    const dato = JSON.parse(localStorage.getItem(`${CLAVE_HOY}_${division}`) ?? 'null') as { fecha: string; guardado: string; reportes: ReporteGG[] } | null;
    return dato && dato.fecha === fecha && Array.isArray(dato.reportes) ? { guardado: dato.guardado, reportes: dato.reportes } : null;
  } catch { return null; }
}

const filaCompleta = (r: ReporteGG) => ({ ...aFila(r), id: r.id, marca_temporal: r.marcaTemporal });

/**
 * Guarda un reporte nuevo. El id se crea en el equipo: si no hay señal (en terreno pasa seguido), el
 * reporte queda guardado aquí y se sube solo apenas vuelva la conexión, sin duplicarse.
 * Si el carro ya tiene su reportabilidad de ese día, no se guarda otra (lanza ReporteGGRepetido).
 */
export async function crearReporteGG(r: NuevoReporteGG, creadoPor: string | null): Promise<ReporteGG | ReporteGGPendiente> {
  const nuevo: ReporteGG = { ...r, id: crypto.randomUUID(), marcaTemporal: new Date().toISOString(), creadoPor };
  const comoNuevo = { ...nuevo, noRealizada: esNoRealizada(nuevo) };
  // Uno de este mismo equipo que todavía no sube (sin señal).
  const enEquipo = reporteQueBloquea(comoNuevo, pendientesValidosGG(r.division));
  if (enEquipo) throw new ReporteGGRepetido(enEquipo);
  try {
    const enNube = reporteQueBloquea(comoNuevo, await reportesDelCarroEnElDia(r.division, r.fecha, r.sitio));
    if (enNube) throw new ReporteGGRepetido(enNube);
    // Si el mismo reporte ya había subido (reintento), no se toca: corregir es solo para supervisores.
    const { error } = await supabase.from(TABLA_GG).upsert(filaCompleta(nuevo), { ignoreDuplicates: true });
    if (error) throw error;
    return nuevo;
  } catch (error) {
    if (error instanceof ReporteGGRepetido || !esErrorDeRed(error)) throw error;
    const pendiente: ReporteGGPendiente = { ...nuevo, pendiente: true };
    guardarPendientes([...pendientesGG(), pendiente]);
    return pendiente;
  }
}

/** Corrige un reporte ya guardado (quien lo hizo o un administrador). */
export async function actualizarReporteGG(r: ReporteGG): Promise<ReporteGG> {
  // Si todavía no se sube (sin señal), se corrige en el equipo.
  const pendientes = pendientesGG();
  if (pendientes.some(p => p.id === r.id)) {
    guardarPendientes(pendientes.map(p => (p.id === r.id ? { ...r, pendiente: true, rechazo: undefined } : p)));
    return { ...r };
  }
  const { data, error } = await supabase.from(TABLA_GG).update(aFila(r)).eq('id', r.id).select('*').single();
  if (error) throw error;
  return aReporte(data as Fila);
}

/** Anota en el equipo el motivo con que la nube no aceptó un reporte guardado (solo si cambió). */
function marcarRechazo(id: string, motivo: string | undefined) {
  const texto = (motivo ?? '').trim() || 'sin detalle';
  const lista = pendientesGG();
  if (!lista.some(x => x.id === id && x.rechazo !== texto)) return; // ya anotado: no repintar cada 30 s
  guardarPendientes(lista.map(x => (x.id === id ? { ...x, rechazo: texto } : x)));
}

/** Anota en el equipo que el carro ya tenía su reportabilidad de ese día (este reporte no se sube). */
function marcarRepetido(id: string, existente: ReporteGG) {
  const repetido = { id: existente.id, hora: existente.hora, reporta: existente.reporta, noRealizada: esNoRealizada(existente) };
  guardarPendientes(pendientesGG().map(x => (x.id === id ? { ...x, rechazo: undefined, repetido } : x)));
}

/** Reporte hecho sin señal que salió repetido: se descarta y queda el que ya estaba en la nube. */
export function descartarPendienteGG(id: string) {
  guardarPendientes(pendientesGG().filter(x => x.id !== id));
}

/**
 * Supervisor: el reporte hecho sin señal reemplaza al que ya estaba ese día (se corrige ese reporte con estos datos,
 * así sigue habiendo uno solo). Si el que estaba ya no existe, este se sube como reporte nuevo.
 */
export async function usarPendienteGGEnLugarDelExistente(id: string): Promise<void> {
  const p = pendientesGG().find(x => x.id === id);
  if (!p?.repetido) return;
  const { pendiente: _p, rechazo: _r, repetido, ...datos } = p;
  void _p; void _r;
  const { data, error } = await supabase.from(TABLA_GG).update(aFila(datos)).eq('id', repetido.id).select('id');
  if (error) throw error;
  if (data && data.length) { descartarPendienteGG(id); return; }
  // El que estaba se borró entretanto: este vuelve a la cola y se sube (si no hay otro ese día).
  guardarPendientes(pendientesGG().map(x => (x.id === id ? { ...x, repetido: undefined } : x)));
  await sincronizarPendientesGG();
}

let subiendo = false;
/** Sube los reportes que quedaron guardados sin señal. Devuelve cuántos se subieron. */
export async function sincronizarPendientesGG(): Promise<number> {
  if (subiendo) return 0;
  // Los repetidos esperan que la persona decida (descartar o usar el suyo): no se suben solos.
  const pendientes = pendientesGG().filter(p => !p.repetido);
  if (!pendientes.length) return 0;
  subiendo = true;
  let subidos = 0;
  try {
    for (const p of pendientes) {
      const { pendiente: _p, ...reporte } = p;
      void _p;
      // Antes de subir: si mientras no había señal otra persona ya reportó ese carro ese día, este no se sube.
      let existentes: ReporteGG[];
      try {
        existentes = await reportesDelCarroEnElDia(p.division, p.fecha, p.sitio);
      } catch (error) {
        if (esErrorDeRed(error)) break; // sin señal: se intenta más tarde
        console.error('No se pudo revisar si el reporte de GG ya estaba:', error);
        marcarRechazo(p.id, (error as { message?: string } | null)?.message);
        continue;
      }
      const yaEstaba = reporteQueBloquea({ ...p, noRealizada: esNoRealizada(p) }, existentes);
      if (yaEstaba) { marcarRepetido(p.id, yaEstaba); continue; }
      const { error } = await supabase.from(TABLA_GG).upsert(filaCompleta(reporte), { ignoreDuplicates: true });
      if (error) {
        if (esErrorDeRed(error)) break; // sin señal: se intenta más tarde
        console.error('No se pudo subir un reporte de GG:', error);
        marcarRechazo(p.id, error.message); // la nube lo rechazó: queda marcado en pantalla
        continue;
      }
      guardarPendientes(pendientesGG().filter(x => x.id !== p.id));
      subidos += 1;
    }
  } catch (error) {
    if (!esErrorDeRed(error)) console.error('No se pudieron subir los reportes de GG:', error);
  } finally {
    subiendo = false;
  }
  return subidos;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void sincronizarPendientesGG(); });
  window.setInterval(() => { if (pendientesGG().some(p => !p.repetido)) void sincronizarPendientesGG(); }, 30_000);
}

/** Combustible como porcentaje (para los gráficos). */
export const COMBUSTIBLE_PCT: Record<string, number> = { '1/4': 25, '1/2': 50, '3/4': 75, Lleno: 100 };

/** Vuelve a crear un reporte borrado (botón "Deshacer"), con su mismo id y hora de envío. */
export async function restaurarReporteGG(r: ReporteGG): Promise<void> {
  const { error } = await supabase.from(TABLA_GG).insert({ ...aFila(r), id: r.id, marca_temporal: r.marcaTemporal });
  if (error) throw error;
}

export async function eliminarReporteGG(id: string): Promise<void> {
  // Si estaba guardado solo en el equipo (sin señal), se quita de ahí.
  const pendientes = pendientesGG();
  if (pendientes.some(p => p.id === id)) { guardarPendientes(pendientes.filter(p => p.id !== id)); return; }
  const { error } = await supabase.from(TABLA_GG).delete().eq('id', id);
  if (error) throw error;
}

/** Escucha los reportes nuevos o borrados por otras personas de la división. */
export function suscribirReportesGG(division: Division, alCambiar: () => void): () => void {
  const canal = supabase
    .channel(`reportes-gg-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLA_GG, filter: `division=eq.${division}` }, alCambiar)
    .subscribe();
  return () => { void supabase.removeChannel(canal); };
}

/** Texto con decimales "a la chilena" (coma) aceptado: "1105,1" → 1105.1. Vacío → null. */
export const leerNumero = (t: string): number | null => {
  const limpio = t.trim().replace(/\s/g, '').replace(',', '.');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
};
