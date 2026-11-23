// Formatos y tipos de la tabla de mantenimiento GG (lo que comparten las tres pestañas).
import { TEMP_ATENCION, TEMP_CRITICA, esNoRealizada, type SitioGG } from '../../datos/analisisGG';
import type { ReporteGG } from '../../datos/reportesGG';
import type { CambiosMantenimientoGG, FilaMantenimientoGG } from '../../datos/mantenimientoGG';
import type { IndicadoresCorrea, IndicadoresMantenimiento, LecturaHoras, Vencimiento } from '../../datos/indicadoresMantenimientoGG';
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

export type EstadoGuardado = 'guardando' | 'guardado' | 'pendiente' | 'falta_bd' | 'error';

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

/** Último reporte de GG con mediciones (los "no realizada" no traen combustible ni niveles). */
export const ultimoReporteConDatos = (s: SitioGG | null): ReporteGG | null =>
  s ? [...s.serie].reverse().find(r => !esNoRealizada(r)) ?? null : null;

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

export const ETIQUETA_ESTADO: Record<Vencimiento, string> = { vencido: 'Vencido', proximo: 'Próximo', al_dia: 'Al día', sin_datos: 'Sin datos' };
