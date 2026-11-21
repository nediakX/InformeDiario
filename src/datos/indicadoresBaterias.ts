// Medición de baterías: el criterio de la planilla "MEDICION BATERIAS DSAL" y los cálculos que muestra la
// pantalla (estado de cada batería, conteos, próxima medición, comparación con la medición anterior y la
// revisión de valores escritos sin la coma decimal).
//
// Criterio de la planilla (hoja BASE DATOS y DASHBOARD), por resistencia interna:
//   hasta 6,00 mΩ → buen estado · hasta 8,00 mΩ → advertencia · más de 8,00 mΩ → falla.
// El voltaje se registra, pero la planilla no lo usa para el estado.
import type { Division } from './divisiones';
import { letraDeFecha } from './turnos';

export const RESISTENCIA_BUEN_ESTADO = 6;
export const RESISTENCIA_ADVERTENCIA = 8;
/** La planilla calcula la próxima medición 3 meses después (EDATE +3). */
export const MESES_ENTRE_MEDICIONES = 3;
/** Días antes de la fecha en que la próxima medición se marca como "próxima". */
export const AVISO_DIAS_MEDICION = 15;
export const BANCOS_POR_DEFECTO = 5;
export const BATERIAS_POR_DEFECTO = 4;
export const MAX_BANCOS = 8;
/** La planilla tiene columnas para 7 baterías por banco. */
export const MAX_BATERIAS = 7;
/** Sobre esto se avisa que la resistencia es muy alta (sin coma, casi siempre falta la coma: 338 en vez de 3,38). */
export const RESISTENCIA_MAXIMA = 30;
/** Más que esto no es una lectura real de una batería de 12 V. */
export const VOLTAJE_MAXIMO = 20;

export type EstadoBateria = 'buen_estado' | 'advertencia' | 'falla' | 'sin_medir';
export const ORDEN_ESTADO: EstadoBateria[] = ['falla', 'advertencia', 'buen_estado', 'sin_medir'];
export const ETIQUETA_ESTADO_BATERIA: Record<EstadoBateria, string> = {
  buen_estado: 'Buen estado', advertencia: 'Advertencia', falla: 'Falla', sin_medir: 'Sin medir',
};

export interface Bateria { resistencia: number | null; voltaje: number | null }
export interface Banco { baterias: Bateria[] }

export interface MedicionBaterias {
  id: string;
  division: Division;
  carro: string;
  /** Día de la medición (AAAA-MM-DD). */
  fecha: string;
  turno: 'TURNO A' | 'TURNO B' | null;
  bancos: Banco[];
  observaciones: string;
  registradoPor: string | null;
  registradoNombre: string;
  actualizadoNombre: string;
  creadoEn: string;
  actualizadoEn: string;
}

export const turnoDeFecha = (fecha: string): 'TURNO A' | 'TURNO B' => (letraDeFecha(fecha) === 'B' ? 'TURNO B' : 'TURNO A');

export function estadoBateria(resistencia: number | null): EstadoBateria {
  if (resistencia === null || !Number.isFinite(resistencia)) return 'sin_medir';
  if (resistencia <= RESISTENCIA_BUEN_ESTADO) return 'buen_estado';
  return resistencia <= RESISTENCIA_ADVERTENCIA ? 'advertencia' : 'falla';
}

export interface ConteoBaterias extends Record<EstadoBateria, number> {
  /** Baterías del carro (medidas o no). */
  total: number;
  /** Baterías con resistencia medida. */
  medidas: number;
}

export function contarBaterias(bancos: Banco[]): ConteoBaterias {
  const c: ConteoBaterias = { buen_estado: 0, advertencia: 0, falla: 0, sin_medir: 0, total: 0, medidas: 0 };
  for (const banco of bancos) {
    for (const b of banco.baterias) {
      const e = estadoBateria(b.resistencia);
      c[e] += 1;
      c.total += 1;
      if (e !== 'sin_medir') c.medidas += 1;
    }
  }
  return c;
}

/** Lo más grave del carro: una batería en falla manda sobre las demás. */
export function peorEstado(c: Pick<ConteoBaterias, EstadoBateria>): EstadoBateria {
  if (c.falla) return 'falla';
  if (c.advertencia) return 'advertencia';
  if (c.buen_estado) return 'buen_estado';
  return 'sin_medir';
}

/** Mismo día N meses después (si el mes es más corto, el último día del mes), como EDATE de Excel. */
export function sumarMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const total = a * 12 + (m - 1) + meses;
  const anio = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

export const proximaMedicion = (fecha: string) => sumarMeses(fecha, MESES_ENTRE_MEDICIONES);

export type EstadoProxima = 'vencida' | 'proxima' | 'al_dia' | 'sin_mediciones';

export function estadoProxima(proxima: string | null, hoy: string): EstadoProxima {
  if (!proxima) return 'sin_mediciones';
  if (proxima < hoy) return 'vencida';
  const dias = Math.round((Date.parse(`${proxima}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
  return dias <= AVISO_DIAS_MEDICION ? 'proxima' : 'al_dia';
}

/** Bancos vacíos con la cantidad de baterías de cada uno. */
export const bancosVacios = (baterias: number[]): Banco[] =>
  baterias.map(n => ({ baterias: Array.from({ length: n }, () => ({ resistencia: null, voltaje: null })) }));

/** Cuántas baterías tiene cada banco (para empezar una medición nueva igual que la anterior del carro). */
export const estructuraDe = (bancos: Banco[]): number[] => bancos.map(b => b.baterias.length);

export const estructuraPorDefecto = (): number[] => Array.from({ length: BANCOS_POR_DEFECTO }, () => BATERIAS_POR_DEFECTO);

/** Mediciones de un carro, de la más nueva a la más antigua. */
export const medicionesDelCarro = (mediciones: MedicionBaterias[], carro: string) =>
  mediciones.filter(m => m.carro === carro).sort(masNuevaPrimero);

export const masNuevaPrimero = (a: MedicionBaterias, b: MedicionBaterias) =>
  b.fecha.localeCompare(a.fecha) || b.creadoEn.localeCompare(a.creadoEn);

/** La medición anterior a `m` del mismo carro (para comparar). */
export function medicionAnterior(mediciones: MedicionBaterias[], m: MedicionBaterias): MedicionBaterias | null {
  const lista = medicionesDelCarro(mediciones, m.carro);
  const i = lista.findIndex(x => x.id === m.id);
  return i >= 0 ? lista[i + 1] ?? null : null;
}

export const valorEn = (m: MedicionBaterias | null, banco: number, bateria: number, campo: keyof Bateria): number | null =>
  m?.bancos[banco]?.baterias[bateria]?.[campo] ?? null;

// --- Valores escritos a mano ---------------------------------------------------------------------

/** "3,38", "3.38" o "12,9" → número. Vacío → null; algo que no es número → NaN. */
export function leerValor(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/** Lo escrito en una casilla: el número y si se escribió con coma (o punto) decimal. */
export interface LecturaCasilla { valor: number | null; conComa: boolean }
export const leerCasilla = (texto: string): LecturaCasilla => ({ valor: leerValor(texto), conComa: /[.,]/.test(texto) });

export interface RevisionValor {
  /** El valor no se puede guardar así. */
  error?: string;
  /** Se puede guardar, pero conviene mirarlo (no bloquea). */
  aviso?: string;
  /** Lo que probablemente se quiso escribir (se corrió o faltó la coma). */
  sugerencia?: number;
}

/** Corre la coma hasta que el valor quede en un rango real (338 → 3,38; 1410 → 14,10). */
function correrComa(valor: number, divisores: number[], minimo: number, maximo: number): number | undefined {
  for (const divisor of divisores) {
    const v = Math.round((valor / divisor) * 1000) / 1000;
    if (v >= minimo && v <= maximo) return v;
  }
  return undefined;
}
const textoNumero = (n: number) => String(n).replace('.', ',');

/**
 * Resistencia interna (mΩ). Una batería mala puede pasar de 30 mΩ (en la planilla hay 36,72): escrita con
 * coma se respeta. Sin coma, 100 o más casi siempre es la coma que faltó (338 → 3,38) y no se guarda así;
 * entre 31 y 99 solo se avisa (puede ser 3,5 o una batería de 35 mΩ).
 * `conComa`: si se escribió con decimales (los valores ya guardados cuentan como escritos con coma).
 */
export function revisarResistencia(r: number | null, conComa = true): RevisionValor {
  if (r === null) return {};
  if (Number.isNaN(r)) return { error: 'Escribe un número (ej. 3,38).' };
  if (r <= 0) return { error: 'Debe ser mayor que 0. Si no se midió, déjala vacía.' };
  if (!conComa && r >= 100) {
    return {
      error: `Sin coma, ${textoNumero(r)} mΩ no parece una lectura real (si lo es, escríbelo con coma: ${textoNumero(r)},0).`,
      sugerencia: correrComa(r, [100, 1000, 10], 1, RESISTENCIA_MAXIMA),
    };
  }
  if (!conComa && r > RESISTENCIA_MAXIMA) {
    return { aviso: `¿Falta la coma? Si de verdad es ${textoNumero(r)} mΩ, déjalo así.`, sugerencia: correrComa(r, [10], 1, RESISTENCIA_MAXIMA) };
  }
  if (r > RESISTENCIA_MAXIMA) return { aviso: 'Muy alta: revisa que esté bien escrita.' };
  if (r < 1) return { aviso: 'Muy baja: revisa la coma.', sugerencia: correrComa(r * 1000, [100, 1000], 1, RESISTENCIA_MAXIMA) };
  return {};
}

/** Voltaje (V) de una batería de 12 V: más de 20 no es una lectura real; con coma y bajo 8, puede que se haya corrido la coma (1,282 → 12,82). */
export function revisarVoltaje(v: number | null, conComa = true): RevisionValor {
  if (v === null) return {};
  if (Number.isNaN(v)) return { error: 'Escribe un número (ej. 13,52).' };
  if (v <= 0) return { error: 'Debe ser mayor que 0. Si no se midió, déjalo vacío.' };
  if (v > VOLTAJE_MAXIMO) return { error: `Más de ${VOLTAJE_MAXIMO} V no es una lectura real.`, sugerencia: correrComa(v, [10, 100, 1000, 10000], 8, VOLTAJE_MAXIMO) };
  if (conComa && v < 8 && v * 10 >= 8 && v * 10 <= VOLTAJE_MAXIMO) return { aviso: 'Muy bajo: ¿se corrió la coma?', sugerencia: Math.round(v * 10 * 1000) / 1000 };
  return {};
}
