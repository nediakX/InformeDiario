// Formatos y textos de la Medición de baterías (los comparten la lista, el detalle y el formulario).
import { formatDiaMes } from '../../datos/fechas';
import type { EstadoBateria, EstadoProxima } from '../../datos/indicadoresBaterias';

const formato = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
/** 3.38 → "3,38" · 13.5 → "13,50" */
export const fmtValor = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : formato.format(n));
/** Para escribir en una casilla: 3.38 → "3,38" (sin ceros de más). */
export const valorACasilla = (n: number | null) => (n === null ? '' : String(Math.round(n * 1000) / 1000).replace('.', ','));
const formato2 = new Intl.NumberFormat('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Cambio contra la medición anterior, con 2 decimales: "+0,42" o "−0,10". */
export const fmtCambio = (d: number) => `${d > 0 ? '+' : '−'}${formato2.format(Math.abs(d))}`;
/** "2026-09-12" → "12 sep 2026" */
export const fmtFecha = (iso: string | null) => (iso ? `${formatDiaMes(iso)} ${iso.slice(0, 4)}` : '—');

export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);

/** "Vencida hace 12 días", "En 8 días", "Hoy" o la fecha. */
export function textoProxima(proxima: string | null, estado: EstadoProxima, hoy: string): string {
  if (!proxima) return 'Sin mediciones';
  const dias = diasEntre(hoy, proxima);
  if (estado === 'vencida') return `Vencida hace ${-dias} día${-dias === 1 ? '' : 's'}`;
  if (dias === 0) return 'Toca hoy';
  if (estado === 'proxima') return `En ${dias} día${dias === 1 ? '' : 's'}`;
  return fmtFecha(proxima);
}

export const ETIQUETA_PROXIMA: Record<EstadoProxima, string> = {
  vencida: 'Vencida', proxima: 'Próxima', al_dia: 'Al día', sin_mediciones: 'Sin mediciones',
};

/** Texto corto para chips y conteos ("2 en falla"). */
export const CONTEO_ESTADO: Record<EstadoBateria, [string, string]> = {
  buen_estado: ['en buen estado', 'en buen estado'],
  advertencia: ['en advertencia', 'en advertencia'],
  falla: ['en falla', 'en falla'],
  sin_medir: ['sin medir', 'sin medir'],
};
