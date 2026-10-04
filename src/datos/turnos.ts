import { DIA_MS, isoToUtc, sumarDias } from './fechas';

// ---------------------------------------------------------------------------------------
// Calendario de turnos 7x7 (Turno A / Turno B) e informes automáticos
// ---------------------------------------------------------------------------------------
// El Turno A trabaja 7 días, luego el Turno B otros 7, y se repite (ciclo de 14 días).
// TURNO_ANCLA_A es el primer día de una semana del Turno A. Según el calendario del equipo:
//   Turno A: 23-29 sep, 7-13 oct, 21-27 oct...   Turno B: 30 sep-6 oct, 14-20 oct, 28 oct-3 nov...
export const TURNO_ANCLA_A = "2026-09-23";

export const DIAS_POR_TURNO = 7;

// Qué informes aparecen (como borrador por completar) por cada día del turno.
export const TURNOS_AUTOMATICOS: ('dia' | 'noche')[] = ['dia', 'noche'];

export interface SemanaTurno {
  letra: 'A' | 'B';
  inicio: string; // ISO yyyy-mm-dd
  fin: string;
  dias: string[]; // los 7 días del turno
}

/**
 * Turno de trabajo que está en curso ahora: Día 08:00-20:00 o Noche 20:00-08:00.
 * `fecha` es el día en que empezó el turno: entre las 00:00 y las 08:00 la noche en curso
 * empezó el día anterior, así que su informe pertenece a esa fecha.
 */
export const turnoEnCurso = (ahora: Date = new Date()): { fecha: string; turno: 'dia' | 'noche' } => {
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  const hora = ahora.getHours();
  if (hora >= 8 && hora < 20) return { fecha: hoy, turno: 'dia' };
  if (hora >= 20) return { fecha: hoy, turno: 'noche' };
  return { fecha: sumarDias(hoy, -1), turno: 'noche' };
};

const crearSemana = (letra: 'A' | 'B', inicio: string): SemanaTurno => ({
  letra,
  inicio,
  fin: sumarDias(inicio, DIAS_POR_TURNO - 1),
  dias: Array.from({ length: DIAS_POR_TURNO }, (_, i) => sumarDias(inicio, i)),
});

/** Ciclo de 14 días que contiene la fecha: los 7 días del Turno A seguidos de los 7 días del Turno B. */
export const cicloDeFecha = (iso: string): { A: SemanaTurno; B: SemanaTurno } => {
  const largo = DIAS_POR_TURNO * 2;
  const diff = Math.round((isoToUtc(iso) - isoToUtc(TURNO_ANCLA_A)) / DIA_MS);
  const inicio = sumarDias(TURNO_ANCLA_A, Math.floor(diff / largo) * largo);
  return { A: crearSemana('A', inicio), B: crearSemana('B', sumarDias(inicio, DIAS_POR_TURNO)) };
};

/** Semana de turno (con su letra) a la que pertenece una fecha. */
export const semanaDeFecha = (iso: string): SemanaTurno => {
  const ciclo = cicloDeFecha(iso);
  return iso <= ciclo.A.fin ? ciclo.A : ciclo.B;
};

export const letraDeFecha = (iso: string) => semanaDeFecha(iso).letra;

/** UUID válido y siempre igual para la misma semilla (para que dos dispositivos no dupliquen los borradores automáticos). */
export function uuidDeterministico(seed: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
    .map(n => n.toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const idBorradorAutomatico = (fecha: string, letra: string, turno: 'dia' | 'noche') =>
  uuidDeterministico(`psinet-auto|${fecha}|${letra}|${turno}`);
