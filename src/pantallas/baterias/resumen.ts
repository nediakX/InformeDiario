// Estado de cada carro según su última medición (lo usan la lista de carros, el detalle y el Excel).
import {
  contarBaterias, estadoProxima, medicionesDelCarro, peorEstado, proximaMedicion,
  type ConteoBaterias, type EstadoBateria, type EstadoProxima, type MedicionBaterias,
} from '../../datos/indicadoresBaterias';

export interface CarroBaterias { codigo: string; sitio: string }

/** Orden de la planilla: por número de carro (LTE_CMF_01, LTE_CMF_02, LTE_CMM_03…), los MMOO al final. */
const numeroCarro = (codigo: string) => {
  const n = Number(/(\d+)\s*$/.exec(codigo)?.[1] ?? Number.POSITIVE_INFINITY);
  return /^MMOO/i.test(codigo) ? 1000 + n : n;
};
export const ordenarCarros = <T extends CarroBaterias>(carros: T[]): T[] =>
  carros.map((c, i) => ({ c, i })).sort((a, b) => numeroCarro(a.c.codigo) - numeroCarro(b.c.codigo) || a.i - b.i).map(x => x.c);

export interface ResumenCarro extends CarroBaterias {
  /** Mediciones del carro, de la más nueva a la más antigua. */
  mediciones: MedicionBaterias[];
  ultima: MedicionBaterias | null;
  /** Conteo de la última medición. */
  conteo: ConteoBaterias | null;
  /** Lo más grave de la última medición. */
  estado: EstadoBateria;
  /** Próxima medición (3 meses después de la última). */
  proxima: string | null;
  estadoProxima: EstadoProxima;
}

/** Un resumen por carro de la división, más los carros que tengan mediciones y ya no estén en la lista. */
export function resumirCarros(carros: CarroBaterias[], mediciones: MedicionBaterias[], hoy: string): ResumenCarro[] {
  const conocidos = new Set(carros.map(c => c.codigo));
  const otros = [...new Set(mediciones.map(m => m.carro))].filter(c => !conocidos.has(c)).sort();
  return [...carros, ...otros.map(codigo => ({ codigo, sitio: '' }))].map(c => {
    const lista = medicionesDelCarro(mediciones, c.codigo);
    const ultima = lista[0] ?? null;
    const conteo = ultima ? contarBaterias(ultima.bancos) : null;
    const proxima = ultima ? proximaMedicion(ultima.fecha) : null;
    return {
      ...c, mediciones: lista, ultima, conteo, estado: conteo ? peorEstado(conteo) : 'sin_medir',
      proxima, estadoProxima: estadoProxima(proxima, hoy),
    };
  });
}

export type FiltroCarros = 'falla' | 'advertencia' | 'por_medir' | 'proxima';

export const cumpleFiltro = (r: ResumenCarro, f: FiltroCarros): boolean => {
  if (f === 'falla') return !!r.conteo?.falla;
  if (f === 'advertencia') return !!r.conteo?.advertencia;
  if (f === 'por_medir') return r.estadoProxima === 'vencida' || r.estadoProxima === 'sin_mediciones';
  return r.estadoProxima === 'proxima';
};
