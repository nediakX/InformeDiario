// Promedio por carro de horas y partidas por día, a partir de los reportes de GG del periodo.
// Los horómetros y las partidas son contadores acumulados: el consumo es la diferencia entre reportes
// consecutivos del periodo, dividida entre los días medidos.
import type { ReporteGG } from './reportesGG';

const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const tiempoDe = (r: ReporteGG) => Date.parse(`${r.fecha}T${r.hora ?? '12:00'}:00`);

/**
 * Consumo diario de un contador acumulado en el periodo: suma las diferencias entre reportes consecutivos
 * (sin contar retrocesos, que se revisan como alerta) y divide entre los días medidos.
 * Devuelve null si hay menos de dos lecturas.
 */
export function consumoPorDia(reportes: ReporteGG[], campo: 'horometro' | 'nroPartidas'): number | null {
  const serie = reportes.filter(r => r[campo] != null).sort((a, b) => tiempoDe(a) - tiempoDe(b));
  if (serie.length < 2) return null;
  let total = 0;
  for (let i = 1; i < serie.length; i++) total += Math.max(0, serie[i][campo]! - serie[i - 1][campo]!);
  const dias = Math.max(1, diasEntre(serie[0].fecha, serie[serie.length - 1].fecha));
  return total / dias;
}

export interface FilaPromedioCarro {
  sitio: string;
  reportes: number;
  horasDia: number | null;
  partidasDia: number | null;
}

export interface PromediosCarros {
  filas: FilaPromedioCarro[];
  totalReportes: number;
  /** Promedio de los carros con datos. */
  horasDia: number | null;
  partidasDia: number | null;
}

const promedio = (valores: (number | null)[]) => {
  const v = valores.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

export function promediosPorCarro(reportes: ReporteGG[], sitios: string[]): PromediosCarros {
  const filas = sitios.map(sitio => {
    const delSitio = reportes.filter(r => r.sitio === sitio);
    return {
      sitio,
      reportes: delSitio.length,
      horasDia: consumoPorDia(delSitio, 'horometro'),
      partidasDia: consumoPorDia(delSitio, 'nroPartidas'),
    };
  });
  return {
    filas,
    totalReportes: filas.reduce((a, f) => a + f.reportes, 0),
    horasDia: promedio(filas.map(f => f.horasDia)),
    partidasDia: promedio(filas.map(f => f.partidasDia)),
  };
}
