// Datos y cálculos del Panel de administración (KPIs y estadísticas).
// Todo se calcula en el navegador a partir de las mismas tablas que usa la app.
import { supabase, BORRADORES_TABLE, BORRADORES_OTROS_TABLE } from '../lib/supabase';
import { type BorradorEntry, type BorradorRow, rowToEntry, estadoBorrador, contarFotos, type EstadoBorrador } from '../datos/borradoresDiario';
import { type BorradorOtroRow, type BorradorOtroEntry, rowToOtroEntry, contarFotosGenerico, estadoBorradorGenerico } from '../datos/borradoresOtros';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import { letraDeFecha, semanaDeFecha, TURNOS_AUTOMATICOS } from '../datos/turnos';
import type { Perfil } from '../auth/sesion';

export type Periodo = 'semana' | '30' | '90';

export const PERIODOS: { valor: Periodo; etiqueta: string }[] = [
  { valor: 'semana', etiqueta: 'Semana de turno actual' },
  { valor: '30', etiqueta: 'Últimos 30 días' },
  { valor: '90', etiqueta: 'Últimos 90 días' },
];

export const TIPOS_FALLA: Record<string, string> = {
  sin_gestion_energia: 'Sin gestión (energía)',
  falla_general_generador: 'Falla general generador',
  disyuntor_sobrecorriente: 'Disyuntor / batería',
  personalizado: 'Otra (personalizada)',
};

export interface Rango { desde: string; hasta: string; dias: string[] }

export function rangoDePeriodo(periodo: Periodo, hoy = hoyLocalISO()): Rango {
  const desde = periodo === 'semana' ? semanaDeFecha(hoy).inicio : sumarDias(hoy, -(Number(periodo) - 1));
  const dias: string[] = [];
  for (let d = desde; d <= hoy; d = sumarDias(d, 1)) dias.push(d);
  return { desde, hasta: hoy, dias };
}

type ConAutor<T> = T & { actualizadoPor: string | null };

export interface DatosAdmin {
  diarios: ConAutor<BorradorEntry>[];
  otros: ConAutor<BorradorOtroEntry>[];
  perfiles: Perfil[];
}

export async function cargarDatosAdmin(rango: Rango): Promise<DatosAdmin> {
  const [diarios, otros, perfiles] = await Promise.all([
    supabase.from(BORRADORES_TABLE).select('*').gte('fecha', rango.desde).lte('fecha', rango.hasta),
    supabase.from(BORRADORES_OTROS_TABLE).select('*').gte('fecha', rango.desde).lte('fecha', rango.hasta),
    supabase.from('perfiles').select('*').order('created_at', { ascending: false }),
  ]);
  const error = diarios.error ?? otros.error ?? perfiles.error;
  if (error) throw error;
  return {
    diarios: (diarios.data as (BorradorRow & { actualizado_por?: string | null })[]).map(r => ({ ...rowToEntry(r), actualizadoPor: r.actualizado_por ?? null })),
    otros: (otros.data as (BorradorOtroRow & { actualizado_por?: string | null })[]).map(r => ({ ...rowToOtroEntry(r), actualizadoPor: r.actualizado_por ?? null })),
    perfiles: perfiles.data as Perfil[],
  };
}

// ---------------------------------------------------------------------------------------
// Cálculos
// ---------------------------------------------------------------------------------------

/** Estado de cada turno del calendario: finalizado / iniciado / sin fotos / faltante (no existe y ya pasó) / en curso (hoy). */
export type EstadoCelda = 'finalizado' | 'iniciado' | 'sin_fotos' | 'faltante' | 'en_curso';

export interface CeldaTurno {
  fecha: string;
  turno: 'dia' | 'noche';
  letra: 'A' | 'B';
  estado: EstadoCelda;
  fotos: { llenas: number; total: number } | null;
}

export interface Kpis {
  esperados: number;
  finalizados: number;
  cumplimiento: number; // 0..1
  atrasados: number; // turnos ya terminados sin finalizar
  fallas: number;
  mantenimientos: number;
  fotos: number;
  usuariosAprobados: number;
  usuariosPendientes: number;
  usuariosActivos: number; // aprobados que entraron en el periodo
}

export interface Barra { etiqueta: string; valor: number; detalle?: string }

export interface Estadisticas {
  kpis: Kpis;
  celdas: CeldaTurno[];
  cumplimientoPorLetra: Barra[];
  fallasPorCarro: Barra[];
  fallasPorTipo: Barra[];
  mantenimientosPorSitio: Barra[];
  actividadPorUsuario: Barra[];
  recientes: { id: string; tipo: string; titulo: string; fecha: string; estado: EstadoBorrador; autor: string; savedAt: string }[];
}

const nombreCarro = (codigo: unknown) => typeof codigo === 'string' && codigo ? codigo.replace(/_/g, ' ') : 'Sin carro';

const ordenarDesc = (mapa: Map<string, number>, max = 10): Barra[] =>
  [...mapa.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([etiqueta, valor]) => ({ etiqueta, valor }));

const sumar = (mapa: Map<string, number>, clave: string, n = 1) => mapa.set(clave, (mapa.get(clave) ?? 0) + n);

export function calcularEstadisticas(datos: DatosAdmin, rango: Rango, ahora = new Date()): Estadisticas {
  const hoy = rango.hasta;
  const horaActual = ahora.getHours();
  const nombrePorId = new Map(datos.perfiles.map(p => [p.id, p.nombre.trim() || p.email]));

  // El informe real de cada turno: si hay más de uno para el mismo día y turno, cuenta el más avanzado.
  const rango_estado: Record<EstadoBorrador, number> = { pendiente: 0, iniciado: 1, finalizado: 2 };
  const porTurno = new Map<string, BorradorEntry>();
  for (const b of datos.diarios) {
    const clave = `${b.fecha}|${b.turno}`;
    const previo = porTurno.get(clave);
    if (!previo || rango_estado[estadoBorrador(b)] > rango_estado[estadoBorrador(previo)]) porTurno.set(clave, b);
  }

  // Un turno "ya terminó" si es de un día anterior, o si es el Día de hoy y ya pasaron las 20:00.
  const terminado = (fecha: string, turno: 'dia' | 'noche') =>
    fecha < hoy ? !(turno === 'noche' && fecha === sumarDias(hoy, -1) && horaActual < 8) : turno === 'dia' && horaActual >= 20;

  const celdas: CeldaTurno[] = [];
  for (const fecha of rango.dias) {
    for (const turno of TURNOS_AUTOMATICOS) {
      const b = porTurno.get(`${fecha}|${turno}`);
      const est = b ? estadoBorrador(b) : null;
      let estado: EstadoCelda;
      if (est === 'finalizado') estado = 'finalizado';
      else if (est === 'iniciado') estado = 'iniciado';
      else if (!terminado(fecha, turno)) estado = 'en_curso';
      else estado = b ? 'sin_fotos' : 'faltante';
      celdas.push({ fecha, turno, letra: letraDeFecha(fecha), estado, fotos: b ? contarFotos(b) : null });
    }
  }

  const esperados = celdas.filter(c => c.estado !== 'en_curso').length;
  const finalizados = celdas.filter(c => c.estado === 'finalizado').length;
  const atrasados = celdas.filter(c => c.estado !== 'en_curso' && c.estado !== 'finalizado').length;

  const porLetra = new Map<string, { esp: number; fin: number }>();
  for (const c of celdas) {
    if (c.estado === 'en_curso') continue;
    const v = porLetra.get(c.letra) ?? { esp: 0, fin: 0 };
    v.esp += 1;
    if (c.estado === 'finalizado') v.fin += 1;
    porLetra.set(c.letra, v);
  }
  // Solo los turnos (A/B) que tuvieron días terminados en el periodo: un 0% de un turno que no trabajó confundiría.
  const cumplimientoPorLetra: Barra[] = ['A', 'B'].flatMap(l => {
    const v = porLetra.get(l);
    if (!v || !v.esp) return [];
    return [{ etiqueta: `Turno ${l}`, valor: Math.round((v.fin / v.esp) * 100), detalle: `${v.fin} de ${v.esp} informes finalizados` }];
  });

  const fallas = datos.otros.filter(o => o.tipo === 'falla');
  const mantenimientos = datos.otros.filter(o => o.tipo === 'mantenimiento');

  const fallasPorCarro = new Map<string, number>();
  const fallasPorTipo = new Map<string, number>();
  for (const f of fallas) {
    const d = f.datos as Record<string, unknown>;
    sumar(fallasPorCarro, nombreCarro(d.carroCodigo));
    sumar(fallasPorTipo, TIPOS_FALLA[String(d.tipoFalla ?? '')] ?? 'Sin tipo');
  }
  const mantenimientosPorSitio = new Map<string, number>();
  for (const m of mantenimientos) {
    const d = m.datos as Record<string, unknown>;
    sumar(mantenimientosPorSitio, typeof d.sitio === 'string' && d.sitio.trim() ? d.sitio.trim() : 'Sin sitio');
  }

  const actividad = new Map<string, number>();
  for (const r of [...datos.diarios, ...datos.otros]) {
    if (r.actualizadoPor) sumar(actividad, nombrePorId.get(r.actualizadoPor) ?? 'Usuario eliminado');
  }

  const fotos = datos.diarios.reduce((n, b) => n + contarFotos(b).llenas, 0)
    + datos.otros.reduce((n, o) => n + contarFotosGenerico(o.datos).llenas, 0);

  const aprobados = datos.perfiles.filter(p => p.estado === 'aprobado');
  const desdeMs = new Date(`${rango.desde}T00:00:00`).getTime();

  const etiquetaTipo: Record<string, string> = { mantenimiento: 'Mantenimiento', falla: 'Falla — Carro', cierre: 'Cierre semanal' };
  const recientes = [
    ...datos.diarios.map(b => ({
      id: b.id, tipo: `Diario · ${b.turno === 'dia' ? 'Día' : 'Noche'}`, titulo: `Turno ${b.letraTurno || letraDeFecha(b.fecha)}`,
      fecha: b.fecha, estado: estadoBorrador(b), autor: b.actualizadoPor ? nombrePorId.get(b.actualizadoPor) ?? '—' : '—', savedAt: b.savedAt,
    })),
    ...datos.otros.map(o => ({
      id: o.id, tipo: etiquetaTipo[o.tipo] ?? o.tipo, titulo: o.titulo, fecha: o.fecha, estado: estadoBorradorGenerico(o.datos),
      autor: o.actualizadoPor ? nombrePorId.get(o.actualizadoPor) ?? '—' : '—', savedAt: o.savedAt,
    })),
  ].sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, 12);

  return {
    kpis: {
      esperados, finalizados, cumplimiento: esperados ? finalizados / esperados : 0, atrasados,
      fallas: fallas.length, mantenimientos: mantenimientos.length, fotos,
      usuariosAprobados: aprobados.length,
      usuariosPendientes: datos.perfiles.filter(p => p.estado === 'pendiente').length,
      usuariosActivos: aprobados.filter(p => p.ultimo_acceso && new Date(p.ultimo_acceso).getTime() >= desdeMs).length,
    },
    celdas,
    cumplimientoPorLetra,
    fallasPorCarro: ordenarDesc(fallasPorCarro),
    fallasPorTipo: ordenarDesc(fallasPorTipo),
    mantenimientosPorSitio: ordenarDesc(mantenimientosPorSitio),
    actividadPorUsuario: ordenarDesc(actividad, 8),
    recientes,
  };
}

// ---------------------------------------------------------------------------------------
// Gestión de usuarios
// ---------------------------------------------------------------------------------------

export async function cambiarEstadoUsuario(id: string, estado: Perfil['estado'], adminId: string) {
  const cambios: Partial<Perfil> = estado === 'aprobado'
    ? { estado, aprobado_por: adminId, aprobado_at: new Date().toISOString() }
    : { estado };
  const { error } = await supabase.from('perfiles').update(cambios).eq('id', id);
  if (error) throw error;
}

export async function cambiarRolAdmin(id: string, esAdmin: boolean) {
  const { error } = await supabase.from('perfiles').update({ es_admin: esAdmin }).eq('id', id);
  if (error) throw error;
}
