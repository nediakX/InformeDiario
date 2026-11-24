// Formatos y tipos de la tabla de mantenimiento GG (lo que comparten las pestañas).
import { TEMP_ATENCION, TEMP_CRITICA, esNoRealizada, type SitioGG } from '../../datos/analisisGG';
import type { ReporteGG } from '../../datos/reportesGG';
import type { CambiosMantenimientoGG, FilaMantenimientoGG } from '../../datos/mantenimientoGG';
import { DIAS_MAXIMO, DIAS_MINIMO, HORAS_ENTRE_MANTENIMIENTOS, type IndicadoresCorrea, type IndicadoresMantenimiento, type LecturaHoras, type Vencimiento } from '../../datos/indicadoresMantenimientoGG';
import { formatDiaMes, formatFechaCorta, hoyLocalISO } from '../../datos/fechas';

/** Un equipo con todo lo calculado (lo que muestran las tres pestañas). */
export interface EquipoCalculado {
  fila: FilaMantenimientoGG;
  /** Análisis de su Reportabilidad de GG (null si no hay datos de reportes). */
  gg: SitioGG | null;
  actuales: LecturaHoras | null;
  ritmo: number | null;
  mtto: IndicadoresMantenimiento;
  correa: IndicadoresCorrea;
}

export type EstadoGuardado = 'guardando' | 'guardado' | 'pendiente' | 'falta_bd' | 'falta_bd_dias' | 'error';

export type TipoRegistro = 'mantenimiento' | 'correa';

/** Lo que cada pestaña puede hacer con un equipo. */
export interface AccionesEquipo {
  /** Guarda los campos que cambiaron (se ve al instante y se sube a la nube o queda en cola sin señal). */
  guardar: (sitio: string, cambios: CambiosMantenimientoGG) => void;
  /** Abre el registro de un mantenimiento o cambio de correa recién hecho. */
  registrar: (tipo: TipoRegistro, sitio: string) => void;
}

/** Valores del refrigerante como se muestran (en la base van como en el formulario de Google). */
export const NOMBRE_REFRIGERANTE: Record<string, string> = { Minimo: 'Mínimo', Medio: 'Medio', Alta: 'Alta' };

/** Refrigerante como se muestra ("Minimo" → "Mínimo"); "—" si no hay dato. */
export const nombreRefrigerante = (r: string | null | undefined) => NOMBRE_REFRIGERANTE[r ?? ''] ?? r ?? '—';

/** Colores de los datos de un reporte de GG (rojo: crítico; ámbar: atención). */
export const claseCombustible = (c: string | null) => (c === '1/4' ? 'mgg-valor--vencido' : '');
export const claseRefrigerante = (r: string | null) => (r === 'Minimo' ? 'mgg-valor--proximo' : '');
export const claseAceite = (a: string | null) => (a === 'Bajo' ? 'mgg-valor--vencido' : a === 'Sobre Relleno' ? 'mgg-valor--proximo' : '');
export const claseTemperatura = (t: number | null) => (t === null ? '' : t >= TEMP_CRITICA ? 'mgg-valor--vencido' : t >= TEMP_ATENCION ? 'mgg-valor--proximo' : '');
export const fmtTemp = (t: number | null) => (t === null ? '—' : `${fmtHoras(t)} °C`);

/**
 * Reporte de GG de un día del generador: el último de ese día (uno con mediciones antes que un «no realizada»).
 * null si ese día no reportó.
 */
export function reporteDelDia(s: SitioGG | null, fecha: string): ReporteGG | null {
  const delDia = (s?.serie ?? []).filter(r => r.fecha === fecha);
  return [...delDia].reverse().find(r => !esNoRealizada(r)) ?? delDia[delDia.length - 1] ?? null;
}

/** Estado de los niveles de un reporte: crítico (rojo), por revisar (ámbar), normal o sin reporte. */
export function estadoNiveles(r: ReporteGG | null): Vencimiento {
  if (!r) return 'sin_datos';
  if (esNoRealizada(r)) return 'proximo';
  const clases = [claseCombustible(r.combustible), claseRefrigerante(r.nivelRefrigerante), claseAceite(r.nivelAceite), claseTemperatura(r.temperatura)];
  return clases.includes('mgg-valor--vencido') ? 'vencido' : clases.includes('mgg-valor--proximo') ? 'proximo' : 'al_dia';
}

/** Cómo se llama cada estado en la pestaña Reporte de GG. */
export const TEXTO_NIVELES: Record<Vencimiento, string> = { vencido: 'Crítico', proximo: 'Revisar', al_dia: 'Normal', sin_datos: 'Sin reporte' };

/** Clase de color para un valor según su estado (rojo vencido, ámbar próximo). */
export const claseValor = (e: Vencimiento) => (e === 'vencido' || e === 'proximo' ? `mgg-valor--${e}` : '');

const formatoHoras = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 });
/** 5410.25 → "5.410,3" */
export const fmtHoras = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : formatoHoras.format(n));
/** Con signo cuando es negativo: −33 */
export const fmtHorasConSigno = (n: number | null) => (n === null ? '—' : n < 0 ? `−${fmtHoras(-n)}` : fmtHoras(n));
/** "2026-03-02" → "02-03-2026" (como la planilla). */
export const fmtFecha = (iso: string | null) => (iso ? formatFechaCorta(iso) : '—');
/** "2026-11-20" → "20 nov" */
export const fmtDia = (iso: string) => formatDiaMes(iso);

/** "en 12 días", "hoy", "hace 3 días" */
export function textoDias(dias: number | null): string {
  if (dias === null) return '';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  if (dias === -1) return 'ayer';
  return dias > 0 ? `en ${dias} días` : `hace ${-dias} días`;
}

/** Por qué está vencido o próximo (o, si está al día, cuándo llega por horas): la línea chica de la columna Estado. */
export function motivoEstado(m: IndicadoresMantenimiento): string {
  if (m.estado === 'sin_datos') return 'Faltan datos';
  const porHoras = m.estadoHoras === m.estado;
  const porFecha = m.estadoFecha === m.estado;
  if (m.estado === 'vencido') {
    if (porHoras && porFecha) return 'Horas y fecha';
    if (porHoras) return m.faltanHoras ? `Excedido ${fmtHoras(-m.faltanHoras)} h` : `Cumplió ${HORAS_ENTRE_MANTENIMIENTOS} h`;
    return 'Por fecha';
  }
  if (m.estado === 'proximo') return porHoras ? `Faltan ${fmtHoras(m.faltanHoras)} h` : `Fecha ${textoDias(m.diasParaFecha)}`;
  // Al día: cuándo se llegaría a las 250 h al ritmo de uso, si es antes que la fecha.
  return m.fechaPorHoras && (!m.fechaEstimada || m.fechaPorHoras < m.fechaEstimada) ? `≈ ${fmtDia(m.fechaPorHoras)}` : '';
}

/** Cuándo fue una lectura: "hoy 09:12", "18 nov 21:40" o "" si no se sabe. */
export function cuandoLectura(l: Pick<LecturaHoras, 'fecha' | 'hora'>): string {
  if (!l.fecha) return '';
  return `${l.fecha === hoyLocalISO() ? 'hoy' : fmtDia(l.fecha)}${l.hora ? ` ${l.hora}` : ''}`;
}

/** Versión corta para la planilla: "Rep. hoy 09:12" o "Escrita 18 nov" (la hora solo si es de hoy). */
export function textoLecturaCorta(l: LecturaHoras | null): string {
  if (!l) return 'Sin lectura';
  const cuando = !l.fecha ? '' : l.fecha === hoyLocalISO() ? `hoy${l.hora ? ` ${l.hora}` : ''}` : fmtDia(l.fecha);
  return `${l.fuente === 'reporte' ? 'Rep.' : 'Escrita'}${cuando ? ` ${cuando}` : ''}`;
}

/** Detalle de la lectura (para el texto al pasar el mouse): "Reporte de hoy 09:12 (Max Diaz)". */
export function detalleLectura(l: LecturaHoras | null): string {
  if (!l) return 'Sin lectura del horómetro';
  const cuando = cuandoLectura(l);
  return `${l.fuente === 'reporte' ? 'Último reporte de GG' : 'Escrita en la tabla'}${cuando ? `: ${cuando}` : ''}${l.reporta ? ` (${l.reporta})` : ''}`;
}

/** De dónde salen las horas actuales: "Reporte · hoy 09:12" o "Escrita · 18 nov". */
export function textoLectura(l: LecturaHoras | null): string {
  if (!l) return 'Sin lectura';
  const cuando = cuandoLectura(l);
  return `${l.fuente === 'reporte' ? 'Reporte' : 'Escrita'}${cuando ? ` · ${cuando}` : ''}`;
}

/**
 * Lee horas escritas a mano: "5410", "5.410" (punto de miles), "5410,5", "1.105,1" o "5410.5".
 * Vacío → null; algo que no es un número válido → NaN.
 */
export function leerHoras(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '');
  if (!t) return null;
  const sinMiles = /^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) ? t.replace(/\./g, '') : t;
  const n = Number(sinMiles.replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : NaN;
}

/** Días entre mantenimientos escritos a mano ("150", "150 d", "150 días"): un entero de 1 a 3650, o null. */
export function leerDias(texto: string): number | null {
  const t = texto.trim().toLowerCase().replace(/\s*(d|d[ií]as?)\.?$/, '').trim();
  if (!/^\d{1,4}$/.test(t)) return null;
  const n = Number(t);
  return n >= DIAS_MINIMO && n <= DIAS_MAXIMO ? n : null;
}

export const ETIQUETA_ESTADO: Record<Vencimiento, string> = { vencido: 'Vencido', proximo: 'Próximo', al_dia: 'Al día', sin_datos: 'Sin datos' };
