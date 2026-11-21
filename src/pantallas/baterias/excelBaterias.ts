// Excel de la Medición de baterías, con las mismas columnas de la planilla:
//  - "Registro Baterías": una fila por banco de cada medición (resistencia y voltaje de cada batería).
//  - "Resumen": el estado de cada carro según su última medición y cuándo toca la próxima.
import { MESES } from '../../datos/fechas';
import {
  ETIQUETA_ESTADO_BATERIA, contarBaterias, masNuevaPrimero, peorEstado, type MedicionBaterias,
} from '../../datos/indicadoresBaterias';
import type { ColumnaExcel, HojaExcel, ValorExcel } from '../../lib/excel';
import { ETIQUETA_PROXIMA } from './formato';
import type { ResumenCarro } from './resumen';

export function hojasBaterias(resumen: ResumenCarro[]): HojaExcel[] {
  const sitioDe = new Map(resumen.map(r => [r.codigo, r.sitio]));
  const todas = resumen.flatMap(r => r.mediciones).sort((a, b) => masNuevaPrimero(a, b) || a.carro.localeCompare(b.carro));
  // Columnas para la batería que más tenga un banco (al menos 4, como la planilla).
  const maxBaterias = Math.max(4, ...todas.flatMap(m => m.bancos.map(b => b.baterias.length)));

  const columnasBaterias: ColumnaExcel[] = Array.from({ length: maxBaterias }, (_, j) => [
    { titulo: `R. INTERNA mΩ B${j + 1}`, tipo: 'numero' as const, ancho: 11 },
    { titulo: `VOLTAJE Volts B${j + 1}`, tipo: 'numero' as const, ancho: 11 },
  ]).flat();

  const fila = (m: MedicionBaterias, i: number): ValorExcel[] => {
    const banco = m.bancos[i];
    const [anio, mes] = m.fecha.split('-').map(Number);
    const valores = Array.from({ length: maxBaterias }, (_, j) => {
      const b = banco.baterias[j];
      return [b?.resistencia ?? null, b?.voltaje ?? null];
    }).flat();
    const conteo = contarBaterias([banco]);
    return [
      m.fecha, MESES[mes - 1], anio, m.turno ?? '', m.carro, sitioDe.get(m.carro) ?? '', `BANCO ${i + 1}`,
      ...valores,
      conteo.medidas ? ETIQUETA_ESTADO_BATERIA[peorEstado(conteo)] : 'Sin medir',
      m.registradoNombre, m.actualizadoNombre, m.observaciones,
    ];
  };

  const registro: HojaExcel = {
    nombre: 'Registro Baterías',
    columnas: [
      { titulo: 'FECHA', tipo: 'fecha', ancho: 12 }, { titulo: 'MES', tipo: 'texto', ancho: 11 }, { titulo: 'AÑO', tipo: 'numero', ancho: 7 },
      { titulo: 'TURNO', tipo: 'texto', ancho: 10 }, { titulo: 'CARRO', tipo: 'texto', ancho: 13 }, { titulo: 'SITIO', tipo: 'texto', ancho: 20 },
      { titulo: 'BANCO', tipo: 'texto', ancho: 9 },
      ...columnasBaterias,
      { titulo: 'ESTADO DEL BANCO', tipo: 'texto', ancho: 13 }, { titulo: 'REGISTRÓ', tipo: 'texto', ancho: 20 },
      { titulo: 'CORRIGIÓ', tipo: 'texto', ancho: 20 }, { titulo: 'OBSERVACIONES', tipo: 'texto', ancho: 40 },
    ],
    filas: todas.flatMap(m => m.bancos.map((_, i) => fila(m, i))),
  };

  const resumenHoja: HojaExcel = {
    nombre: 'Resumen',
    columnas: [
      { titulo: 'CARRO', tipo: 'texto', ancho: 13 }, { titulo: 'SITIO', tipo: 'texto', ancho: 20 },
      { titulo: 'ÚLTIMA MEDICIÓN', tipo: 'fecha', ancho: 13 }, { titulo: 'TURNO', tipo: 'texto', ancho: 10 },
      { titulo: 'MEDICIONES', tipo: 'numero', ancho: 11 }, { titulo: 'BATERÍAS MEDIDAS', tipo: 'numero', ancho: 11 },
      { titulo: 'BUEN ESTADO', tipo: 'numero', ancho: 10 }, { titulo: 'ADVERTENCIA', tipo: 'numero', ancho: 11 },
      { titulo: 'FALLA', tipo: 'numero', ancho: 8 }, { titulo: 'ESTADO DEL CARRO', tipo: 'texto', ancho: 13 },
      { titulo: 'PRÓXIMA MEDICIÓN', tipo: 'fecha', ancho: 13 }, { titulo: 'SITUACIÓN', tipo: 'texto', ancho: 14 },
    ],
    filas: resumen.map(r => [
      r.codigo, r.sitio, r.ultima?.fecha ?? null, r.ultima?.turno ?? '', r.mediciones.length, r.conteo?.medidas ?? null,
      r.conteo?.buen_estado ?? null, r.conteo?.advertencia ?? null, r.conteo?.falla ?? null,
      r.ultima ? ETIQUETA_ESTADO_BATERIA[r.estado] : 'Sin mediciones', r.proxima, ETIQUETA_PROXIMA[r.estadoProxima],
    ]),
  };

  return [resumenHoja, registro];
}
