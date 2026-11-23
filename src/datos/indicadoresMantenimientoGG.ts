// Indicadores de la tabla de mantenimiento de generadores: los mismos cálculos de la planilla Excel
// "Datos GG Generadores", más lo que aporta la Reportabilidad de GG (horas actuales y ritmo de uso).
//
//   Planilla                                              Aquí
//   Próximo Mantenimiento (hrs) = Último + 250            proximoHoras
//   Horas restante para el próximo MTTO = Próximo − Reg.  faltanHoras (negativo = horas pasadas: "status")
//   Horas desde Último Mantenimiento = Reg. − Último      desdeUltimo (sobre 250 = vencido)
//   Fecha Estimada Próximo Mantenimiento = Fecha + días   fechaEstimada (180 o 210 días)
//   Fecha Mantenimiento Por Año = Fecha + 365             fechaAnual
//   Próximo cambio de correa (horas) = Último + 1500      proximoHoras (de la correa)
//
// Las "horas registradas" son la lectura más reciente del horómetro: la del último reporte de GG o la
// que se escribió en la tabla, la que sea más nueva.
import { DIA_MS, isoToUtc, sumarDias } from './fechas';
import type { ReporteGG } from './reportesGG';

/** Horas entre mantenimientos (planilla: "Horas de Mantenimiento" = 250). */
export const HORAS_ENTRE_MANTENIMIENTOS = 250;
/** Horas entre cambios de correa (planilla: próximo cambio = último + 1500). */
export const HORAS_ENTRE_CAMBIOS_CORREA = 1500;
/** Planilla: "Fecha Mantenimiento Por Año" = fecha del último + 365 días. */
export const DIAS_POR_ANO = 365;
/** Se avisa "próximo" cuando faltan estas horas o menos (el 10 % del intervalo). */
export const AVISO_HORAS_MANTENIMIENTO = 25;
export const AVISO_HORAS_CORREA = 150;
/** Se avisa "próximo" cuando la fecha estimada está a estos días o menos. */
export const AVISO_DIAS = 15;
/** Bajo este uso (h/día) no se estima la fecha por horas: el equipo casi no funciona. */
const RITMO_MINIMO = 0.5;

/** Opciones de "Días de mantenimiento" de la planilla. */
export const CICLOS_DIAS = [180, 210] as const;
/** STATUS MMTTO: cuánto se completó del último mantenimiento (la planilla usa 100 %). */
export const OPCIONES_STATUS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0] as const;

export type Vencimiento = 'vencido' | 'proximo' | 'al_dia' | 'sin_datos';
const GRAVEDAD: Record<Vencimiento, number> = { sin_datos: 0, al_dia: 1, proximo: 2, vencido: 3 };
/** El más urgente de dos estados. */
export const masUrgente = (a: Vencimiento, b: Vencimiento): Vencimiento => (GRAVEDAD[b] > GRAVEDAD[a] ? b : a);
/** Orden para listar: vencidos primero, después próximos, al día y sin datos. */
export const ORDEN_VENCIMIENTO: Record<Vencimiento, number> = { vencido: 0, proximo: 1, al_dia: 2, sin_datos: 3 };

/** Lo que usan los cálculos de cada equipo (una fila de la tabla). */
export interface DatosEquipo {
  ultimoHoras: number | null;
  ultimoFecha: string | null;
  cicloDias: number;
  horasRegistradas: number | null;
  horasRegistradasEn: string | null;
  correaHoras: number | null;
  correaFecha: string | null;
}

/** Lectura del horómetro que se usa como "horas registradas". */
export interface LecturaHoras {
  valor: number;
  /** De dónde sale: el último reporte de GG o lo escrito en la tabla. */
  fuente: 'reporte' | 'tabla';
  /** Fecha (AAAA-MM-DD) y hora (HH:MM) locales de la lectura, si se conocen. */
  fecha: string | null;
  hora: string | null;
  /** Quién hizo el reporte (solo si sale de un reporte). */
  reporta: string | null;
}

const dos = (n: number) => String(n).padStart(2, '0');
const instanteReporte = (r: ReporteGG) => Date.parse(`${r.fecha}T${r.hora ?? '12:00'}:00`);

/** Último reporte que trae horómetro (los "no realizados" no tienen mediciones). */
export function ultimoConHorometro(reportes: readonly ReporteGG[]): ReporteGG | null {
  let elegido: ReporteGG | null = null;
  for (const r of reportes) {
    if (r.horometro === null || !Number.isFinite(r.horometro)) continue;
    if (!elegido || instanteReporte(r) > instanteReporte(elegido)) elegido = r;
  }
  return elegido;
}

/** Horas actuales del equipo: la lectura más reciente entre el último reporte de GG y lo escrito en la tabla. */
export function horasActuales(f: Pick<DatosEquipo, 'horasRegistradas' | 'horasRegistradasEn'>, reporte: ReporteGG | null): LecturaHoras | null {
  let deTabla: (LecturaHoras & { instante: number }) | null = null;
  if (f.horasRegistradas !== null && Number.isFinite(f.horasRegistradas)) {
    const en = f.horasRegistradasEn ? new Date(f.horasRegistradasEn) : null;
    const valida = !!en && !Number.isNaN(en.getTime());
    deTabla = {
      valor: f.horasRegistradas, fuente: 'tabla', reporta: null,
      fecha: valida ? `${en!.getFullYear()}-${dos(en!.getMonth() + 1)}-${dos(en!.getDate())}` : null,
      hora: valida ? `${dos(en!.getHours())}:${dos(en!.getMinutes())}` : null,
      // Sin fecha (base sin actualizar), cualquier reporte es más nuevo.
      instante: valida ? en!.getTime() : -Infinity,
    };
  }
  const deReporte = reporte && reporte.horometro !== null
    ? { valor: reporte.horometro, fuente: 'reporte' as const, fecha: reporte.fecha, hora: reporte.hora, reporta: reporte.reporta?.trim() || null, instante: instanteReporte(reporte) }
    : null;
  const elegida = !deTabla ? deReporte : !deReporte ? deTabla : deReporte.instante > deTabla.instante ? deReporte : deTabla;
  if (!elegida) return null;
  const { instante, ...lectura } = elegida;
  void instante;
  return lectura;
}

/** Días de una fecha a otra (negativo si `hasta` es anterior). */
export const diasEntre = (desde: string, hasta: string) => Math.round((isoToUtc(hasta) - isoToUtc(desde)) / DIA_MS);

// Semáforo de las tablas de mantenimiento de las presentaciones y del Excel, como en la planilla Datos GG.
export type Semaforo = 'verde' | 'naranjo' | 'rojo';
/** Horas desde el último mantenimiento: hasta 200 h verde, de 201 a 239 h naranjo y desde 240 h rojo. */
export const LIMITES_DESDE_ULTIMO = { verdeHasta: 200, rojoDesde: 240 } as const;
export const semaforoDesdeUltimo = (horas: number): Semaforo =>
  horas >= LIMITES_DESDE_ULTIMO.rojoDesde ? 'rojo' : horas > LIMITES_DESDE_ULTIMO.verdeHasta ? 'naranjo' : 'verde';
/** Fecha estimada del próximo mantenimiento vista desde otra fecha: ya pasó rojo, faltan 15 días o menos naranjo. */
export const semaforoFecha = (fecha: string, desde: string): Semaforo =>
  fecha < desde ? 'rojo' : diasEntre(desde, fecha) <= AVISO_DIAS ? 'naranjo' : 'verde';

const estadoPorHoras = (faltan: number | null, aviso: number): Vencimiento =>
  faltan === null ? 'sin_datos' : faltan <= 0 ? 'vencido' : faltan <= aviso ? 'proximo' : 'al_dia';

/** Fecha aproximada en que se cumplen las horas que faltan, al ritmo de uso de los reportes. */
function fechaAlRitmo(faltan: number | null, ritmo: number | null, hoy: string): string | null {
  if (faltan === null || faltan <= 0 || ritmo === null || ritmo < RITMO_MINIMO) return null;
  return sumarDias(hoy, Math.ceil(faltan / ritmo));
}

export interface IndicadoresMantenimiento {
  proximoHoras: number | null;
  /** Horas que faltan para el próximo mantenimiento (negativo: horas pasadas). */
  faltanHoras: number | null;
  desdeUltimo: number | null;
  fechaEstimada: string | null;
  fechaAnual: string | null;
  /** Días hasta la fecha estimada (negativo: ya pasó). */
  diasParaFecha: number | null;
  diasParaAnual: number | null;
  /** Cuándo se cumplirían las 250 h al ritmo de uso de los reportes (aprox.). */
  fechaPorHoras: string | null;
  estadoHoras: Vencimiento;
  estadoFecha: Vencimiento;
  /** Lo que ocurra primero: por horas o por fecha. */
  estado: Vencimiento;
}

export function indicadoresMantenimiento(f: DatosEquipo, actuales: LecturaHoras | null, hoy: string, ritmo: number | null): IndicadoresMantenimiento {
  const proximoHoras = f.ultimoHoras === null ? null : f.ultimoHoras + HORAS_ENTRE_MANTENIMIENTOS;
  const faltanHoras = proximoHoras === null || !actuales ? null : proximoHoras - actuales.valor;
  const desdeUltimo = f.ultimoHoras === null || !actuales ? null : actuales.valor - f.ultimoHoras;
  const fechaEstimada = f.ultimoFecha ? sumarDias(f.ultimoFecha, f.cicloDias) : null;
  const fechaAnual = f.ultimoFecha ? sumarDias(f.ultimoFecha, DIAS_POR_ANO) : null;
  const diasParaFecha = fechaEstimada ? diasEntre(hoy, fechaEstimada) : null;
  const diasParaAnual = fechaAnual ? diasEntre(hoy, fechaAnual) : null;
  const estadoHoras = estadoPorHoras(faltanHoras, AVISO_HORAS_MANTENIMIENTO);
  const estadoFecha: Vencimiento = diasParaFecha === null ? 'sin_datos' : diasParaFecha < 0 ? 'vencido' : diasParaFecha <= AVISO_DIAS ? 'proximo' : 'al_dia';
  return {
    proximoHoras, faltanHoras, desdeUltimo, fechaEstimada, fechaAnual, diasParaFecha, diasParaAnual,
    fechaPorHoras: fechaAlRitmo(faltanHoras, ritmo, hoy),
    estadoHoras, estadoFecha, estado: masUrgente(estadoHoras, estadoFecha),
  };
}

export interface IndicadoresCorrea {
  proximoHoras: number | null;
  faltanHoras: number | null;
  desdeUltimo: number | null;
  fechaPorHoras: string | null;
  estado: Vencimiento;
}

export function indicadoresCorrea(f: DatosEquipo, actuales: LecturaHoras | null, hoy: string, ritmo: number | null): IndicadoresCorrea {
  const proximoHoras = f.correaHoras === null ? null : f.correaHoras + HORAS_ENTRE_CAMBIOS_CORREA;
  const faltanHoras = proximoHoras === null || !actuales ? null : proximoHoras - actuales.valor;
  const desdeUltimo = f.correaHoras === null || !actuales ? null : actuales.valor - f.correaHoras;
  return { proximoHoras, faltanHoras, desdeUltimo, fechaPorHoras: fechaAlRitmo(faltanHoras, ritmo, hoy), estado: estadoPorHoras(faltanHoras, AVISO_HORAS_CORREA) };
}

/** Cuántos equipos hay en cada estado. */
export function contarEstados(estados: readonly Vencimiento[]): Record<Vencimiento, number> {
  const n: Record<Vencimiento, number> = { vencido: 0, proximo: 0, al_dia: 0, sin_datos: 0 };
  for (const e of estados) n[e] += 1;
  return n;
}
