// Presentación de fin de semana (viernes a domingo de la semana de turno). Los textos salen de los
// Informes Diarios como borradores; la pantalla permite editarlos antes de generar el .pptx.
import { esSemillaSinEditar, type BorradorEntry, type EvidenceBlockLike } from '../../datos/borradoresDiario';
import type { SemanaTurno } from '../../datos/turnos';
import { nombreDiaSemana, sumarDias } from '../../datos/fechas';
import { resumenDeDia } from './modelo';

/** Una fila de la tabla de actividades (lámina 5). */
export interface FilaActividadFds {
  actividad: string;
  responsable: string;
}

/** Una fila de la tabla de mantenimiento preventivo (lámina 9). */
export interface FilaOmFds {
  sitio: string;
  nombre: string;
  /** Horas al último mantenimiento (null = sin dato). */
  horasUltimo: number | null;
  /** Fecha del último mantenimiento, ISO "2026-09-23" (null = sin dato). */
  fechaUltimo: string | null;
  /** Días hasta el próximo mantenimiento (180 o 210). */
  dias: number;
  /** Horas registradas a la fecha de corte (null = sin dato). */
  horasRegistradas: number | null;
}

export interface DiaFds {
  /** ISO "2026-10-23". */
  fecha: string;
  actividades: FilaActividadFds[];
  /** Difusiones del día (lámina 13, columna del día). */
  difusiones: string[];
}

export interface DatosFds {
  letra: 'A' | 'B';
  /** Viernes y domingo del fin de semana. */
  inicio: string;
  fin: string;
  /** Lámina 3: un punto por tarjeta. */
  resumenGeneral: string[];
  /** Viernes, sábado y domingo, en ese orden. */
  dias: DiaFds[];
  /** Lámina 8: reportabilidad GG por día (0-1; null = sin dato). */
  reportabilidadGG: (number | null)[];
  /** Lámina 9: fecha de corte de las horas registradas (ISO). */
  fechaCorteOm: string;
  om: FilaOmFds[];
  /** Lámina 11: cascada de actividades principales. */
  cascadaActividades: string[];
  /** Lámina 13: controles transversales (lista fija editable). */
  controles: string[];
  /** Lámina 15: observaciones y mejoras. */
  observaciones: string[];
  /** Lámina 17: actividades con CPE (sin el encabezado). */
  cpe: string[];
  /** Lámina 19: conclusiones. */
  conclusiones: string[];
}

/** Controles transversales que salen en la lámina del fin de semana de referencia. */
export const CONTROLES_FDS_PREDETERMINADOS = [
  'Charla inicio de turno',
  'Check list vehículo liviano',
  'Fatiga y somnolencia',
  'Protección solar, hidratación, ART y test alcohol/drogas',
];

/** Sitios de la tabla de mantenimiento (lámina 9) con sus días de mantenimiento de referencia. */
export const OM_SITIOS_PREDETERMINADOS: { sitio: string; nombre: string; dias: number }[] = [
  { sitio: 'O&M_LTE_CMM_03', nombre: 'cerro pepa', dias: 180 },
  { sitio: 'O&M_LTE_CMF_09', nombre: 'Cerro La Ballena', dias: 180 },
  { sitio: 'O&M_MMOO 01', nombre: 'Chancado Primario', dias: 180 },
  { sitio: 'O&M_LTE_CMF_04', nombre: 'Cerro Antenas', dias: 180 },
  { sitio: 'O&M_LTE_CMM_06', nombre: 'Mirador Fase 2', dias: 180 },
  { sitio: 'O&M_LTE_CMM_10', nombre: 'Cerro Pisquero', dias: 180 },
  { sitio: 'O&M_LTE_CMF_02', nombre: 'Truck shop', dias: 210 },
  { sitio: 'O&M_LTE_CMF_08', nombre: 'Ex Garita Rajo Inca', dias: 180 },
  { sitio: 'O&M_LTE_CMM_05', nombre: 'EX Barrio Cívico', dias: 180 },
  { sitio: 'O&M_LTE_CMF_01', nombre: 'Bloquera', dias: 180 },
  { sitio: 'O&M_LTE_CMM_11', nombre: 'ex ventiladores.', dias: 180 },
  { sitio: 'O&M_LTE_CMM_07', nombre: 'Campamento Antiguo', dias: 210 },
];

/** Frase de apertura del resumen (la usa el equipo en todas las presentaciones de fin de semana). */
const FRASE_ESTABLE = 'OPERACIÓN GENERAL ESTABLE DURANTE EL FIN DE SEMANA.';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Actividades que se reparten en las láminas por tema (palabras clave, sin acentos).
const ES_CPE = /\bcpe\b|motoniveladora|wheeldozer|antena/;
const ES_BATERIA = /bateria/;
const ES_MANTENCION = /mantenimiento|mantencion/;
const ES_DIFUSION_FLASH = /flash|difusion|charla|reunion/;
const ES_FALLA = /falla|atencion|fallas/;

const sinRepetidos = (lista: string[]) => {
  const vistos = new Set<string>();
  return lista.filter(t => {
    const clave = sinAcentos(t);
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
};

/** Responsable sugerido para una actividad: los flash y difusiones los da el asesor HSE. */
const responsableDe = (actividad: string) =>
  ES_DIFUSION_FLASH.test(sinAcentos(actividad)) && !ES_MANTENCION.test(sinAcentos(actividad)) ? 'ASESOR HSE' : 'TURNO A';

/** Difusiones del día para la lámina de texto: todas las no rutinarias con título (no solo las que tienen foto). */
const difusionesTextoDe = (entrada: BorradorEntry): string[] =>
  sinRepetidos(
    entrada.evidenceBlocks
      .filter((b: EvidenceBlockLike) => !b.cuadroVertiv && !b.isFixed && !/reportabilidad gg|registro de mantenimiento de gg/.test(sinAcentos(b.title)))
      .map(b => b.title.trim().replace(/^registro art\.?\s*/i, 'ART: ')),
  );

const tituloRealizados = (lista: string[], patron: RegExp) =>
  sinRepetidos(lista.filter(a => patron.test(sinAcentos(a))));

/** Borrador completo de la presentación de fin de semana a partir de los informes de la semana de turno. */
export function construirPresentacionFds(entradas: BorradorEntry[], semana: SemanaTurno): DatosFds {
  const validas = entradas.filter(e => !esSemillaSinEditar(e));
  const buscar = (fecha: string, turno: 'dia' | 'noche') => validas.find(e => e.fecha === fecha && e.turno === turno) ?? null;

  // Viernes, sábado y domingo de la semana de turno (índices 2, 3 y 4 de los 7 días).
  const fechas = semana.dias.slice(2, 5);
  const dias: DiaFds[] = fechas.map(fecha => {
    const dia = buscar(fecha, 'dia');
    const actividades = dia
      ? resumenDeDia(dia).map(a => ({ actividad: a.toUpperCase(), responsable: responsableDe(a) }))
      : [];
    return { fecha, actividades, difusiones: dia ? difusionesTextoDe(dia) : [] };
  });

  const noches = fechas.map(f => buscar(f, 'noche')).filter((e): e is BorradorEntry => Boolean(e));
  const actividadesTodas = sinRepetidos([
    ...dias.flatMap(d => d.actividades.map(a => a.actividad)),
    ...noches.flatMap(n => n.actividades.map(a => a.trim())),
  ]);

  const mantencion = tituloRealizados(actividadesTodas, ES_MANTENCION);
  const baterias = tituloRealizados(actividadesTodas, ES_BATERIA);
  const cpe = tituloRealizados(actividadesTodas, ES_CPE);
  const fallas = tituloRealizados(actividadesTodas, ES_FALLA);

  const resumenGeneral = [FRASE_ESTABLE];
  if (mantencion.length) resumenGeneral.push(`SE EJECUTARON MANTENIMIENTOS PREVENTIVOS: ${mantencion.join('; ')}`);
  if (cpe.length) resumenGeneral.push(`SE EJECUTARON TRABAJOS DE CPE: ${cpe.join('; ')}`);
  if (baterias.length) resumenGeneral.push(`SE REALIZÓ MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS: ${baterias.join('; ')}`);

  const observaciones = sinRepetidos(noches.flatMap(n => n.observaciones.map(o => o.trim())));
  // La reportabilidad GG y las horas de O&M se ingresan a mano: los informes no traen esos números.
  return {
    letra: semana.letra,
    inicio: fechas[0],
    fin: fechas[2],
    resumenGeneral,
    dias,
    reportabilidadGG: [null, null, null],
    fechaCorteOm: sumarDias(fechas[2], 1),
    om: OM_SITIOS_PREDETERMINADOS.map(s => ({ ...s, horasUltimo: null, fechaUltimo: null, horasRegistradas: null })),
    cascadaActividades: [
      ...(mantencion.length ? [`MANTENIMIENTOS PREVENTIVOS EJECUTADOS: ${mantencion.join('; ')}`] : []),
      ...(baterias.length ? [`SE REALIZÓ MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS DE LOS CARROS LTE.`] : []),
      'SE MANTIENE CONTROL DOCUMENTAL EN TERRENO.',
    ],
    controles: [...CONTROLES_FDS_PREDETERMINADOS],
    observaciones,
    cpe,
    conclusiones: [
      'FIN DE SEMANA CON CONTINUIDAD OPERACIONAL Y SIN INCIDENTES OPERACIONALES MAYORES REPORTADOS.',
      ...(fallas.length ? [`SE ATENDIERON FALLAS: ${fallas.join('; ')}`] : []),
    ],
  };
}

/** Nombre del archivo, con el mismo estilo que las presentaciones de referencia del fin de semana. */
export const nombreArchivoPresentacionFds = (datos: Pick<DatosFds, 'letra' | 'inicio' | 'fin'>) => {
  const larga = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
  return `Presentacion_FDS_Turno${datos.letra}_LTE_DSAL_${larga(datos.inicio)}_AL_${larga(datos.fin)}_final.pptx`;
};

// ---------------------------------------------------------------------------------------
// Formulario: los textos que se editan en pantalla y su conversión a los datos de la lámina
// ---------------------------------------------------------------------------------------

/** Rótulo de un día del fin de semana: "VIERNES 23/10". */
export const rotuloDiaFds = (iso: string) => `${nombreDiaSemana(iso).toUpperCase()} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const MESES_ABREV: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, oct: 10, nov: 11, dic: 12 };

/** ISO si la fecha existe en el calendario; null si no. */
const isoValida = (y: number, m: number, d: number): string | null => {
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

/** Fecha escrita como "23/09/2026", "23-09-26", "2026-09-23" o "23-sep-26" (formatos que pega Excel) -> ISO, o null. */
export function parseFechaFds(texto: string): string | null {
  const t = texto.trim().toLowerCase();
  const anio = (s: string) => (s.length === 2 ? 2000 + Number(s) : Number(s));
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$/);
  if (m) return isoValida(anio(m[3]), Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{1,2})[ .-]([a-z]{3,4})\.?[ .-](\d{4}|\d{2})$/);
  if (m && MESES_ABREV[m[2]]) return isoValida(anio(m[3]), MESES_ABREV[m[2]], Number(m[1]));
  return null;
}

/** Número entero con punto de miles o coma decimal ("4.872", "4872,4") -> entero, o null. */
const numeroFds = (texto: string): number | null => {
  const limpio = texto.trim().replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Porcentaje escrito como "75", "75%" o "0,75" -> fracción (0,75), o null. */
export function parsePorcentajeFds(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.replace('%', '').replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return t.includes('%') || n > 1 ? n / 100 : n;
}

/** Filas de mantenimiento (lámina 9): Sitio, Nombre, Horas último, Fecha último, Días, Horas registradas (tabulación o ;). */
export function parseOmFds(texto: string): FilaOmFds[] {
  const filas: FilaOmFds[] = [];
  for (const linea of texto.split(/\r?\n/)) {
    if (!linea.trim()) continue;
    const celdas = (linea.includes('\t') ? linea.split('\t') : linea.split(';')).map(c => c.trim());
    const [sitio = '', nombre = '', horasUltimo = '', fechaUltimo = '', dias = '', horasRegistradas = ''] = celdas;
    if (!sitio || sitio.toLowerCase() === 'sitio') continue;
    filas.push({
      sitio,
      nombre,
      horasUltimo: numeroFds(horasUltimo),
      fechaUltimo: parseFechaFds(fechaUltimo),
      dias: numeroFds(dias) ?? 180,
      horasRegistradas: numeroFds(horasRegistradas),
    });
  }
  return filas;
}

const lineasDe = (texto: string) => texto.split('\n').map(l => l.trim()).filter(Boolean);

/**
 * Datos de la presentación a partir de los textos del formulario. `valor(clave)` devuelve el texto de cada campo
 * (claves: resumen, act0-2, gg0-2, dif0-2, fechaCorte, om, cascada, controles, observaciones, cpe, conclusiones).
 */
export function datosFdsDesde(valor: (clave: string) => string, semana: SemanaTurno): DatosFds {
  const fechas = semana.dias.slice(2, 5);
  return {
    letra: semana.letra,
    inicio: fechas[0],
    fin: fechas[2],
    resumenGeneral: lineasDe(valor('resumen')),
    dias: fechas.map((fecha, k) => ({
      fecha,
      actividades: lineasDe(valor(`act${k}`)).map(linea => {
        const [actividad, ...responsable] = linea.split('|');
        return { actividad: actividad.trim().toUpperCase(), responsable: responsable.join('|').trim() };
      }),
      difusiones: lineasDe(valor(`dif${k}`)),
    })),
    reportabilidadGG: [0, 1, 2].map(k => parsePorcentajeFds(valor(`gg${k}`))),
    fechaCorteOm: parseFechaFds(valor('fechaCorte')) ?? sumarDias(fechas[2], 1),
    om: parseOmFds(valor('om')),
    cascadaActividades: lineasDe(valor('cascada')),
    controles: lineasDe(valor('controles')),
    observaciones: lineasDe(valor('observaciones')),
    cpe: lineasDe(valor('cpe')),
    conclusiones: lineasDe(valor('conclusiones')),
  };
}

/** Textos iniciales del formulario, a partir de los datos armados con los informes. */
export function textosFdsDesde(datos: DatosFds): Record<string, string> {
  const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const textos: Record<string, string> = {
    resumen: datos.resumenGeneral.join('\n'),
    fechaCorte: datos.fechaCorteOm,
    om: [
      'Sitio\tNombre\tHoras último\tFecha último\tDías\tHoras registradas',
      ...datos.om.map(f => [f.sitio, f.nombre, f.horasUltimo ?? '', f.fechaUltimo ? dmy(f.fechaUltimo) : '', f.dias, f.horasRegistradas ?? ''].join('\t')),
    ].join('\n'),
    cascada: datos.cascadaActividades.join('\n'),
    controles: datos.controles.join('\n'),
    observaciones: datos.observaciones.join('\n'),
    cpe: datos.cpe.join('\n'),
    conclusiones: datos.conclusiones.join('\n'),
  };
  datos.dias.forEach((dia, k) => {
    textos[`act${k}`] = dia.actividades.map(a => (a.responsable ? `${a.actividad} | ${a.responsable}` : a.actividad)).join('\n');
    textos[`dif${k}`] = dia.difusiones.join('\n');
  });
  datos.reportabilidadGG.forEach((v, k) => { textos[`gg${k}`] = v === null ? '' : String(Math.round(v * 100)); });
  return textos;
}

/** Avisos antes de generar: lo que la lámina saldría vacío o incompleto. */
export function avisosFds(datos: DatosFds): string[] {
  const avisos: string[] = [];
  datos.dias.forEach((dia, k) => {
    if (datos.reportabilidadGG[k] === null) avisos.push(`Falta la reportabilidad GG del ${rotuloDiaFds(dia.fecha).toLowerCase()}: el gráfico la muestra en 0%.`);
  });
  const incompletos = datos.om.filter(f => f.horasUltimo === null || f.fechaUltimo === null).length;
  if (incompletos) {
    avisos.push(`${incompletos === 1 ? 'Un sitio de mantenimiento no tiene' : `${incompletos} sitios de mantenimiento no tienen`} horas o fecha del último mantenimiento: su fila quedará incompleta.`);
  }
  return avisos;
}
