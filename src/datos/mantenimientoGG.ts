// Tabla de mantenimiento de generadores: una fila por sitio en `mantenimiento_gg`.
import { supabase } from '../lib/supabase';
import type { Division } from './divisiones';

export const TABLA_MANTENIMIENTO_GG = 'mantenimiento_gg';
/** Intervalo entre mantenimientos, en horas (la planilla usa 250). */
export const HORAS_ENTRE_MANTENIMIENTOS = 250;

export interface FilaMantenimientoGG {
  sitio: string;
  nombre: string;
  ultimoHoras: number | null;
  ultimoFecha: string | null;
  horasRegistradas: number | null;
  cicloDias: number;
  refrigerante: string | null;
  orden: number;
}

interface FilaBD {
  sitio: string;
  nombre: string;
  ultimo_horas: number | null;
  ultimo_fecha: string | null;
  horas_registradas: number | null;
  ciclo_dias: number;
  refrigerante: string | null;
  orden: number;
}

const desdeBD = (f: FilaBD): FilaMantenimientoGG => ({
  sitio: f.sitio,
  nombre: f.nombre,
  ultimoHoras: f.ultimo_horas === null ? null : Number(f.ultimo_horas),
  ultimoFecha: f.ultimo_fecha,
  horasRegistradas: f.horas_registradas === null ? null : Number(f.horas_registradas),
  cicloDias: f.ciclo_dias,
  refrigerante: f.refrigerante,
  orden: f.orden,
});

export async function listarMantenimientoGG(division: Division): Promise<FilaMantenimientoGG[]> {
  const { data, error } = await supabase
    .from(TABLA_MANTENIMIENTO_GG)
    .select('sitio, nombre, ultimo_horas, ultimo_fecha, horas_registradas, ciclo_dias, refrigerante, orden')
    .eq('division', division)
    .order('orden', { ascending: true });
  if (error) throw error;
  return (data as FilaBD[]).map(desdeBD);
}

/** Guarda una fila (crea o actualiza el sitio de la división). */
export async function guardarMantenimientoGG(division: Division, f: FilaMantenimientoGG): Promise<void> {
  const { error } = await supabase.from(TABLA_MANTENIMIENTO_GG).upsert({
    division,
    sitio: f.sitio,
    nombre: f.nombre,
    ultimo_horas: f.ultimoHoras,
    ultimo_fecha: f.ultimoFecha,
    horas_registradas: f.horasRegistradas,
    ciclo_dias: f.cicloDias,
    refrigerante: f.refrigerante,
    orden: f.orden,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'division,sitio' });
  if (error) throw error;
}
