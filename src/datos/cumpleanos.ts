// Cumpleaños de hoy: la base de datos entrega solo el nombre de quien cumple años (función cumpleaneros_hoy).
// El turno se deduce del listado de conductores de cada turno de la división.
import { supabase } from '../lib/supabase';
import type { Division } from './divisiones';
import { CONFIG_DIVISION } from './divisiones';
import { letraDeFecha } from './turnos';
import { hoyLocalISO } from './fechas';

export interface Cumpleanero { nombre: string; turno: 'A' | 'B' | null }

const palabras = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ ]/g, ' ').split(/\s+/).filter(p => p.length > 1);

/** Turno según el listado de conductores: todas las palabras del nombre de la lista deben estar en el nombre de la persona. */
export function turnoDeNombre(nombre: string, division: Division): 'A' | 'B' | null {
  const pn = new Set(palabras(nombre));
  const { conductores } = CONFIG_DIVISION[division];
  const encaja = (lista: string[]) => lista.some(c => {
    const pc = palabras(c);
    return pc.length >= 1 && pc.every(p => pn.has(p));
  });
  if (encaja(conductores.A)) return 'A';
  if (encaja(conductores.B)) return 'B';
  return null;
}

/** Cumpleañeros de hoy que corresponden al turno en faena (los que no se pueden ubicar en un turno también aparecen). */
export async function cumpleanerosDelTurnoHoy(division: Division): Promise<Cumpleanero[]> {
  const { data, error } = await supabase.rpc('cumpleaneros_hoy', { p_division: division });
  if (error) throw error;
  const turnoHoy = letraDeFecha(hoyLocalISO());
  return ((data ?? []) as { nombre: string }[])
    .map(p => ({ nombre: p.nombre.replace(/\.$/, '').trim(), turno: turnoDeNombre(p.nombre, division) }))
    .filter(p => p.turno === null || p.turno === turnoHoy);
}
