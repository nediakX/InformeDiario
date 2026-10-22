// Lectura de la base para la presentación de fin de semana: los reportes de GG de los tres días y el
// último horómetro de cada sitio hasta el lunes de corte. (Los mantenimientos llegan ya leídos de la
// lista de Mantenimiento de la app.)
import type { Division } from '../../datos/divisiones';
import { listarReportesGG, todosLosReportesGG } from '../../datos/reportesGG';
import type { SemanaTurno } from '../../datos/turnos';
import { SITIOS_FDS, claveSitio, fdsDeSemana, type DatosAutoFds } from './modeloFds';

/** Reportes de GG del fin de semana y último horómetro de cada sitio de GG hasta la fecha de corte. */
export async function leerReportesFds(division: Division, semana: SemanaTurno): Promise<Pick<DatosAutoFds, 'reportesFds' | 'horometros'>> {
  const { inicio, fin, corte } = fdsDeSemana(semana);
  const sitiosGG = SITIOS_FDS.flatMap(s => (s.gg ? [s.gg] : []));
  const [reportes, ultimosPorSitio] = await Promise.all([
    todosLosReportesGG({ division, desde: inicio, hasta: fin }),
    // Los más recientes primero: el primero con horómetro es la última lectura del sitio.
    Promise.all(sitiosGG.map(sitio => listarReportesGG({ division, sitio, hasta: corte }, 0, 10))),
  ]);
  const horometros: DatosAutoFds['horometros'] = {};
  sitiosGG.forEach((sitio, i) => {
    const ultimo = ultimosPorSitio[i].find(r => r.horometro !== null);
    if (ultimo && ultimo.horometro !== null) {
      horometros[claveSitio(sitio)] = { horas: Math.round(ultimo.horometro), fecha: ultimo.fecha };
    }
  });
  return { reportesFds: reportes.map(r => ({ sitio: r.sitio, fecha: r.fecha })), horometros };
}
