// Marca de "finalizado a mano" de los informes guardados en la nube (Informe Diario, Mantención
// preventiva / Mantenimiento de generador y Falla). Un informe finalizado sale de la lista para continuar.
import { supabase, BORRADORES_TABLE, BORRADORES_OTROS_TABLE } from '../lib/supabase';
import { esErrorDeRed } from '../lib/conexion';

/**
 * Finaliza (o reabre) un informe guardado en la nube. Solo cambia su marca de finalizado: el resto del
 * informe no se toca, así un guardado con el formulario abierto no la pisa. Devuelve la hora de
 * finalizado, o null si se reabrió. Necesita conexión (no se encola).
 */
export async function marcarFinalizado(
  tabla: 'borradores' | 'borradores_otros',
  id: string,
  finalizar: boolean,
): Promise<string | null> {
  const finalizadoEn = finalizar ? new Date().toISOString() : null;
  const nombre = tabla === 'borradores' ? BORRADORES_TABLE : BORRADORES_OTROS_TABLE;
  const { data, error } = await supabase.from(nombre).update({ finalizado_en: finalizadoEn }).eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('El informe todavía no está en la nube.');
  return finalizadoEn;
}

/** Texto para avisar cuando no se pudo finalizar o reabrir el informe. */
export function mensajeErrorFinalizar(error: unknown, finalizar: boolean): string {
  const accion = finalizar ? 'finalizar' : 'reabrir';
  if (esErrorDeRed(error)) return `Sin conexión: el informe se puede ${accion} cuando vuelva la señal.`;
  const detalle = (error as { message?: unknown } | null)?.message;
  return `No se pudo ${accion} el informe.${typeof detalle === 'string' && detalle ? ` ${detalle}` : ''}`;
}
