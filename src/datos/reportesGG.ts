// Reportabilidad de GG (grupos generadores): cada reporte es una fila de la tabla `reportes_gg`
// (mismas columnas que el formulario "REPORTABILIDAD DE GG" de Google Forms y su planilla).
import { supabase } from '../lib/supabase';
import { esErrorDeRed } from '../lib/conexion';
import type { Division } from './divisiones';

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
    'Ricardo Morales', 'Mirko Roja', 'Marcelo Artal', 'Fernando Contreras', 'Ronald Castillo', 'Ricardo Riquelme',
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
  creadoPor: string | null;
}

type Fila = {
  id: string; division: Division; marca_temporal: string; fecha: string; hora: string | null; sitio: string;
  turno: string; reporta: string; combustible: string | null; horometro: number | string | null;
  nro_partidas: number | null; nivel_refrigerante: string | null; nivel_aceite: string | null;
  temperatura?: number | string | null; creado_por: string | null;
  /** Columnas de una versión anterior de la tabla (dos temperaturas). */
  temperatura_1?: number | string | null; temperatura_2?: number | string | null;
};

const numero = (v: number | string | null) => (v === null || v === '' ? null : Number(v));

const aReporte = (f: Fila): ReporteGG => ({
  id: f.id, division: f.division, marcaTemporal: f.marca_temporal, fecha: f.fecha, hora: f.hora ? f.hora.slice(0, 5) : null,
  sitio: f.sitio, turno: f.turno, reporta: f.reporta, combustible: f.combustible, horometro: numero(f.horometro),
  nroPartidas: f.nro_partidas, nivelRefrigerante: f.nivel_refrigerante, nivelAceite: f.nivel_aceite,
  temperatura: numero(f.temperatura ?? f.temperatura_1 ?? f.temperatura_2 ?? null), creadoPor: f.creado_por,
});

export type NuevoReporteGG = Omit<ReporteGG, 'id' | 'marcaTemporal' | 'creadoPor'>;

const aFila = (r: NuevoReporteGG) => ({
  division: r.division, fecha: r.fecha, hora: r.hora || null, sitio: r.sitio, turno: r.turno, reporta: r.reporta,
  combustible: r.combustible, horometro: r.horometro, nro_partidas: r.nroPartidas, nivel_refrigerante: r.nivelRefrigerante,
  nivel_aceite: r.nivelAceite, temperatura: r.temperatura,
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
export interface ReporteGGPendiente extends ReporteGG { pendiente: true }

const CLAVE_PENDIENTES = 'psinet_reportes_gg_pendientes';
export const EVENTO_GG = 'psinet:reportes-gg';

export function pendientesGG(): ReporteGGPendiente[] {
  try { return JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) ?? '[]') as ReporteGGPendiente[]; } catch { return []; }
}
function guardarPendientes(lista: ReporteGGPendiente[]) {
  try { localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(lista)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event(EVENTO_GG));
}

const filaCompleta = (r: ReporteGG) => ({ ...aFila(r), id: r.id, marca_temporal: r.marcaTemporal });

/**
 * Guarda un reporte nuevo. El id se crea en el equipo: si no hay señal (en terreno pasa seguido), el
 * reporte queda guardado aquí y se sube solo apenas vuelva la conexión, sin duplicarse.
 */
export async function crearReporteGG(r: NuevoReporteGG, creadoPor: string | null): Promise<ReporteGG | ReporteGGPendiente> {
  const nuevo: ReporteGG = { ...r, id: crypto.randomUUID(), marcaTemporal: new Date().toISOString(), creadoPor };
  try {
    const { data, error } = await supabase.from(TABLA_GG).upsert(filaCompleta(nuevo)).select('*').single();
    if (error) throw error;
    return aReporte(data as Fila);
  } catch (error) {
    if (!esErrorDeRed(error)) throw error;
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
    guardarPendientes(pendientes.map(p => (p.id === r.id ? { ...r, pendiente: true } : p)));
    return { ...r };
  }
  const { data, error } = await supabase.from(TABLA_GG).update(aFila(r)).eq('id', r.id).select('*').single();
  if (error) throw error;
  return aReporte(data as Fila);
}

let subiendo = false;
/** Sube los reportes que quedaron guardados sin señal. Devuelve cuántos se subieron. */
export async function sincronizarPendientesGG(): Promise<number> {
  if (subiendo) return 0;
  const pendientes = pendientesGG();
  if (!pendientes.length) return 0;
  subiendo = true;
  let subidos = 0;
  try {
    for (const p of pendientes) {
      const { pendiente: _p, ...reporte } = p;
      void _p;
      const { error } = await supabase.from(TABLA_GG).upsert(filaCompleta(reporte));
      if (error) { if (esErrorDeRed(error)) break; console.error('No se pudo subir un reporte de GG:', error); continue; }
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
  window.setInterval(() => { if (pendientesGG().length) void sincronizarPendientesGG(); }, 30_000);
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
