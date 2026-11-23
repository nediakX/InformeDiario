// Lectura de la base para las presentaciones: los reportes de GG del fin de semana y el último horómetro de
// cada sitio hasta la fecha de corte. (Los mantenimientos llegan ya leídos de la lista de Mantenimiento de la
// app, y la Tabla de mantenimiento GG, de su propia pantalla.)
import type { Division } from '../../datos/divisiones';
import { listarReportesGG, todosLosReportesGG } from '../../datos/reportesGG';
import { esNoRealizada } from '../../datos/analisisGG';
import type { SemanaTurno } from '../../datos/turnos';
import { SITIOS_FDS, claveSitio, fdsDeSemana, type DatosAutoFds } from './modeloFds';

const sitiosDeLaPresentacion = () => SITIOS_FDS.flatMap(s => (s.gg ? [s.gg] : []));

/** Último horómetro reportado en GG de cada sitio hasta la fecha de corte (incluida). */
export async function leerHorometros(division: Division, corte: string, sitios: string[] = sitiosDeLaPresentacion()): Promise<DatosAutoFds['horometros']> {
  // Los más recientes primero: el primero con horómetro es la última lectura del sitio.
  const ultimosPorSitio = await Promise.all(sitios.map(sitio => listarReportesGG({ division, sitio, hasta: corte }, 0, 10)));
  const horometros: DatosAutoFds['horometros'] = {};
  sitios.forEach((sitio, i) => {
    const ultimo = ultimosPorSitio[i].find(r => r.horometro !== null && Number.isFinite(r.horometro));
    if (ultimo && ultimo.horometro !== null) {
      horometros[claveSitio(sitio)] = { horas: Math.round(ultimo.horometro), fecha: ultimo.fecha, hora: ultimo.hora };
    }
  });
  return horometros;
}

/** Reportes de GG del fin de semana y último horómetro de cada sitio de GG hasta la fecha de corte (por defecto, el lunes). */
export async function leerReportesFds(
  division: Division,
  semana: SemanaTurno,
  sitios: string[] = sitiosDeLaPresentacion(),
  corte: string = fdsDeSemana(semana).corte,
): Promise<Pick<DatosAutoFds, 'reportesFds' | 'horometros'>> {
  const { inicio, fin } = fdsDeSemana(semana);
  const [reportes, horometros] = await Promise.all([
    todosLosReportesGG({ division, desde: inicio, hasta: fin }),
    leerHorometros(division, corte, sitios),
  ]);
  // Una reportabilidad "no realizada" no cuenta como carro reportado (si no, la lámina marcaría 100 %).
  const realizados = reportes.filter(r => !esNoRealizada(r));
  return { reportesFds: realizados.map(r => ({ sitio: r.sitio, fecha: r.fecha })), horometros };
}
