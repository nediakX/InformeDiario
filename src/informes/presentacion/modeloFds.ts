// Presentación de fin de semana (viernes a domingo de la semana de turno). Los textos salen de los
// Informes Diarios como borradores; la reportabilidad GG, las horas registradas y el último
// mantenimiento salen de la base (ver datosFds.ts). La pantalla permite corregirlo todo antes de
// generar el .pptx.
import { esSemillaSinEditar, type BorradorEntry, type EvidenceBlockLike } from '../../datos/borradoresDiario';
import type { BorradorOtroEntry } from '../../datos/borradoresOtros';
import type { SemanaTurno } from '../../datos/turnos';
import { nombreDiaSemana, sumarDias } from '../../datos/fechas';
import { esPreventiva } from '../preventiva/modelo';
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
  /** Difusiones del día (lámina 13: las de los tres días van juntas en un recuadro). */
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
  /** Lámina 8: sitios de GG que reportan cada día (carros, en el orden de SITIOS_FDS). Es el checklist del formulario. */
  carrosReportando: string[][];
  /** Lámina 8: reportabilidad GG por día (0-1): carros marcados sobre el total de sitios de GG. */
  reportabilidadGG: number[];
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
  /** Lámina 19: una conclusión por día, a partir de sus actividades (un recuadro por línea). */
  conclusiones: string[];
}

/** Un sitio de la tabla de mantenimiento preventivo (lámina 9). */
export interface SitioFds {
  /** Etiqueta como aparece en la referencia del fin de semana. */
  sitio: string;
  nombre: string;
  /** Días hasta el próximo mantenimiento (180 o 210). */
  dias: number;
  /** Carro en los informes de mantenimiento de generador (ej: LTE_CMF_09; el MMOO se llama MMOO_01). */
  carro: string;
  /** Sitio en la Reportabilidad de GG (null = no reporta GG). */
  gg: string | null;
}

/**
 * Sitios de la tabla de mantenimiento (lámina 9), en el orden de la referencia. "Ex Ventiladores" es el
 * carro LTE_11 en el catálogo y en los reportes de GG (la fila de la referencia lo nombra CMM_11).
 */
export const SITIOS_FDS: SitioFds[] = [
  { sitio: 'O&M_LTE_CMM_03', nombre: 'cerro pepa', dias: 180, carro: 'LTE_CMM_03', gg: 'LTE_CMM_03' },
  { sitio: 'O&M_LTE_CMF_09', nombre: 'Cerro La Ballena', dias: 180, carro: 'LTE_CMF_09', gg: 'LTE_CMF_09' },
  { sitio: 'O&M_MMOO 01', nombre: 'Chancado Primario', dias: 180, carro: 'MMOO_01', gg: 'LTE_CM_MMOO_01' },
  { sitio: 'O&M_LTE_CMF_04', nombre: 'Cerro Antenas', dias: 180, carro: 'LTE_CMF_04', gg: 'LTE_CMF_04' },
  { sitio: 'O&M_LTE_CMM_06', nombre: 'Mirador Fase 2', dias: 180, carro: 'LTE_CMM_06', gg: 'LTE_CMM_06' },
  { sitio: 'O&M_LTE_CMM_10', nombre: 'Cerro Pisquero', dias: 180, carro: 'LTE_CMM_10', gg: 'LTE_CMM_10' },
  { sitio: 'O&M_LTE_CMF_02', nombre: 'Truck shop', dias: 210, carro: 'LTE_CMF_02', gg: 'LTE_CMF_02' },
  { sitio: 'O&M_LTE_CMF_08', nombre: 'Ex Garita Rajo Inca', dias: 180, carro: 'LTE_CMF_08', gg: 'LTE_CMF_08' },
  { sitio: 'O&M_LTE_CMM_05', nombre: 'EX Barrio Cívico', dias: 180, carro: 'LTE_CMM_05', gg: 'LTE_CMM_05' },
  { sitio: 'O&M_LTE_CMF_01', nombre: 'Bloquera', dias: 180, carro: 'LTE_CMF_01', gg: 'LTE_CMF_01' },
  { sitio: 'O&M_LTE_CMM_11', nombre: 'ex ventiladores.', dias: 180, carro: 'LTE_11', gg: 'LTE_11' },
  { sitio: 'O&M_LTE_CMM_07', nombre: 'Campamento Antiguo', dias: 210, carro: 'LTE_CMM_07', gg: 'LTE_CMM_07' },
];

/** Controles transversales que salen en la lámina del fin de semana de referencia. */
export const CONTROLES_FDS_PREDETERMINADOS = [
  'Charla inicio de turno',
  'Check list vehículo liviano',
  'Fatiga y somnolencia',
  'Protección solar, hidratación, ART y test alcohol/drogas',
];

/** Frase de apertura del resumen (la usa el equipo en todas las presentaciones de fin de semana). */
const FRASE_ESTABLE = 'OPERACIÓN GENERAL ESTABLE DURANTE EL FIN DE SEMANA.';

/** Un mantenimiento de generador leído de la base: sitio, fecha y el horómetro tal como se escribió. */
export interface MantenimientoFds {
  sitio: string;
  /** ISO "2026-09-23". */
  fecha: string;
  horometro: string;
  savedAt: string;
}

/** Lo que se lee de la base (no de los informes diarios). */
export interface DatosAutoFds {
  /** Reportes de GG de los tres días del fin de semana (sitio y fecha). */
  reportesFds: { sitio: string; fecha: string }[];
  /** Último horómetro reportado en GG por sitio (clave: sitio de GG), hasta la fecha de corte. */
  horometros: Record<string, { horas: number; fecha: string }>;
  /** Informes de mantenimiento de generador (sin preventiva). */
  mantenimientos: MantenimientoFds[];
}

/** Sin datos de la base (todavía no se leyeron): los campos salen vacíos y se avisa. */
export const SIN_DATOS_FDS: DatosAutoFds = { reportesFds: [], horometros: {}, mantenimientos: [] };

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

/** Viernes, sábado y domingo de la semana de turno, y el lunes de corte de las horas registradas. */
export function fdsDeSemana(semana: SemanaTurno) {
  const fechas = semana.dias.slice(2, 5);
  return { fechas, inicio: fechas[0], fin: fechas[2], corte: sumarDias(fechas[2], 1) };
}

/** Clave comparable de un sitio: "LTE 11", "lte_11" y "LTE-11" son todos "LTE_11". */
export const claveSitio = (texto: string) => texto.trim().replace(/[\s-]+/g, '_').toUpperCase();

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

// ---------------------------------------------------------------------------------------
// Reportabilidad, horas y último mantenimiento (datos que salen de la base)
// ---------------------------------------------------------------------------------------

/**
 * Carros de los sitios de GG que reportaron ese día según la base: el punto de partida del checklist de la
 * presentación (en el orden de SITIOS_FDS).
 */
export function carrosSegunBase(reportes: { sitio: string; fecha: string }[], fecha: string): string[] {
  const reportados = new Set(reportes.filter(r => r.fecha === fecha).map(r => claveSitio(r.sitio)));
  return SITIOS_FDS.filter(s => s.gg !== null && reportados.has(claveSitio(s.gg))).map(s => s.carro);
}

/** Carros marcados en el checklist ("LTE_CMM_03,MMOO_01") -> carros en el orden de SITIOS_FDS. */
export function carrosReportandoDe(texto: string): string[] {
  const marcados = new Set(texto.split(',').map(t => t.trim()));
  return SITIOS_FDS.map(s => s.carro).filter(carro => marcados.has(carro));
}

/** Reportabilidad de GG de un día (0-1): carros marcados sobre el total de sitios de GG (12). */
export const reportabilidadDe = (carros: string[]): number => Number((carros.length / SITIOS_FDS.length).toFixed(4));

/** Horas registradas de un sitio de GG: el último horómetro reportado hasta la fecha de corte (null = sin dato). */
export const horasRegistradasDe = (auto: DatosAutoFds, gg: string | null): number | null =>
  gg === null ? null : (auto.horometros[claveSitio(gg)]?.horas ?? null);

/** Informes de mantenimiento de generador, de la lista de borradores (los preventivos no traen horómetro). */
export function mantenimientosGeneradorDe(entradas: BorradorOtroEntry[]): MantenimientoFds[] {
  return entradas
    .filter(e => !esPreventiva(e.datos))
    .map(e => {
      const { sitio, fecha, horometro } = e.datos;
      return {
        sitio: typeof sitio === 'string' ? sitio : '',
        fecha: typeof fecha === 'string' && fecha ? fecha : e.fecha,
        horometro: typeof horometro === 'string' ? horometro : '',
        savedAt: e.savedAt,
      };
    })
    .filter(m => m.sitio.trim() !== '' && m.fecha !== '');
}

/** Último mantenimiento de generador del carro hasta la fecha de corte: horas (horómetro) y fecha. */
export function ultimoMantenimientoDe(mantenimientos: MantenimientoFds[], carro: string, corte: string): { horas: number | null; fecha: string | null } {
  const clave = claveSitio(carro);
  const ultimo = mantenimientos
    .filter(m => claveSitio(m.sitio) === clave && m.fecha <= corte)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.savedAt.localeCompare(a.savedAt))[0];
  return ultimo ? { horas: numeroFds(ultimo.horometro), fecha: ultimo.fecha } : { horas: null, fecha: null };
}

/** Une palabras en una lista con comas y "Y": "A, B Y C". */
const unirConY = (lista: string[]) => (lista.length <= 1 ? lista.join('') : `${lista.slice(0, -1).join(', ')} Y ${lista[lista.length - 1]}`);

/**
 * Conclusión de un día (lámina 19, un recuadro por día), a partir de sus actividades: qué se ejecutó y la continuidad.
 * Si el día no tiene actividades, lo dice (se corrige en el formulario).
 */
function conclusionDelDia(dia: DiaFds): string {
  const rotulo = rotuloDiaFds(dia.fecha);
  const nombres = dia.actividades.map(a => sinAcentos(a.actividad));
  if (!nombres.length) return `${rotulo}: SIN ACTIVIDADES REGISTRADAS EN EL INFORME DIARIO.`;
  const hechos: string[] = [];
  if (nombres.some(a => ES_MANTENCION.test(a))) hechos.push('MANTENIMIENTOS PREVENTIVOS');
  if (nombres.some(a => ES_BATERIA.test(a))) hechos.push('MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS');
  if (nombres.some(a => ES_CPE.test(a))) hechos.push('TRABAJOS DE CPE');
  if (nombres.some(a => ES_FALLA.test(a))) hechos.push('ATENCIÓN DE FALLAS');
  if (dia.difusiones.length) hechos.push('DIFUSIONES');
  const detalle = hechos.length ? unirConY(hechos) : `${nombres.length} ${nombres.length === 1 ? 'ACTIVIDAD' : 'ACTIVIDADES'} DE OPERACIÓN Y MANTENCIÓN`;
  return `${rotulo}: SE EJECUTARON ${detalle}; CONTINUIDAD OPERACIONAL.`;
}

// ---------------------------------------------------------------------------------------
// Borrador completo a partir de los informes y de los datos de la base
// ---------------------------------------------------------------------------------------

/** Borrador completo de la presentación de fin de semana a partir de los informes de la semana de turno. */
export function construirPresentacionFds(entradas: BorradorEntry[], semana: SemanaTurno, auto: DatosAutoFds = SIN_DATOS_FDS): DatosFds {
  const validas = entradas.filter(e => !esSemillaSinEditar(e));
  const buscar = (fecha: string, turno: 'dia' | 'noche') => validas.find(e => e.fecha === fecha && e.turno === turno) ?? null;

  const { fechas, inicio, fin, corte } = fdsDeSemana(semana);
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

  const resumenGeneral = [FRASE_ESTABLE];
  if (mantencion.length) resumenGeneral.push(`SE EJECUTARON MANTENIMIENTOS PREVENTIVOS: ${mantencion.join('; ')}`);
  if (cpe.length) resumenGeneral.push(`SE EJECUTARON TRABAJOS DE CPE: ${cpe.join('; ')}`);
  if (baterias.length) resumenGeneral.push(`SE REALIZÓ MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS: ${baterias.join('; ')}`);

  const observaciones = sinRepetidos(noches.flatMap(n => n.observaciones.map(o => o.trim())));
  const carrosPorDia = fechas.map(fecha => carrosSegunBase(auto.reportesFds, fecha));
  return {
    letra: semana.letra,
    inicio,
    fin,
    resumenGeneral,
    dias,
    carrosReportando: carrosPorDia,
    reportabilidadGG: carrosPorDia.map(reportabilidadDe),
    fechaCorteOm: corte,
    om: SITIOS_FDS.map(s => {
      const ultimo = ultimoMantenimientoDe(auto.mantenimientos, s.carro, corte);
      return {
        sitio: s.sitio,
        nombre: s.nombre,
        horasUltimo: ultimo.horas,
        fechaUltimo: ultimo.fecha,
        dias: s.dias,
        horasRegistradas: horasRegistradasDe(auto, s.gg),
      };
    }),
    cascadaActividades: [
      ...(mantencion.length ? [`MANTENIMIENTOS PREVENTIVOS EJECUTADOS: ${mantencion.join('; ')}`] : []),
      ...(baterias.length ? [`SE REALIZÓ MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS DE LOS CARROS LTE.`] : []),
      'SE MANTIENE CONTROL DOCUMENTAL EN TERRENO.',
    ],
    controles: [...CONTROLES_FDS_PREDETERMINADOS],
    observaciones,
    cpe,
    conclusiones: dias.map(conclusionDelDia),
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

/**
 * Datos de la presentación a partir de los textos del formulario. `valor(clave)` devuelve el texto de cada campo
 * (claves: resumen, act0-2, gg0-2, dif0-2, fechaCorte, om, cascada, controles, observaciones, cpe, conclusiones).
 */
export function datosFdsDesde(valor: (clave: string) => string, semana: SemanaTurno): DatosFds {
  const { fechas, inicio, fin, corte } = fdsDeSemana(semana);
  const carrosPorDia = fechas.map((_, k) => carrosReportandoDe(valor(`carros${k}`)));
  return {
    letra: semana.letra,
    inicio,
    fin,
    resumenGeneral: lineasDe(valor('resumen')),
    dias: fechas.map((fecha, k) => ({
      fecha,
      actividades: lineasDe(valor(`act${k}`)).map(linea => {
        const [actividad, ...responsable] = linea.split('|');
        return { actividad: actividad.trim().toUpperCase(), responsable: responsable.join('|').trim() };
      }),
      difusiones: lineasDe(valor(`dif${k}`)),
    })),
    carrosReportando: carrosPorDia,
    reportabilidadGG: carrosPorDia.map(reportabilidadDe),
    fechaCorteOm: parseFechaFds(valor('fechaCorte')) ?? corte,
    om: parseOmFds(valor('om')),
    cascadaActividades: lineasDe(valor('cascada')),
    controles: lineasDe(valor('controles')),
    observaciones: lineasDe(valor('observaciones')),
    cpe: lineasDe(valor('cpe')),
    conclusiones: lineasDe(valor('conclusiones')),
  };
}

/** Textos iniciales del formulario, a partir de los datos armados con los informes y la base. */
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
  datos.carrosReportando.forEach((carros, k) => { textos[`carros${k}`] = carros.join(','); });
  return textos;
}

/** Avisos antes de generar: lo que la lámina saldría vacío o incompleto. */
export function avisosFds(datos: DatosFds): string[] {
  const avisos: string[] = [];
  datos.dias.forEach((dia, k) => {
    if (datos.carrosReportando[k].length === 0) avisos.push(`Ningún carro marcado en la reportabilidad GG del ${rotuloDiaFds(dia.fecha).toLowerCase()}: el gráfico lo muestra en 0%.`);
  });
  const sinUltimo = datos.om.filter(f => f.horasUltimo === null || f.fechaUltimo === null).map(f => f.nombre);
  if (sinUltimo.length) avisos.push(`Sin horas o fecha del último mantenimiento: ${sinUltimo.join(', ')}. Su fila quedará incompleta.`);
  const sinHoras = datos.om.filter(f => f.horasRegistradas === null).map(f => f.nombre);
  if (sinHoras.length) avisos.push(`Sin horas registradas hasta la fecha de corte: ${sinHoras.join(', ')}.`);
  datos.dias.forEach(dia => {
    if (!dia.actividades.length) avisos.push(`No hay actividades registradas el ${rotuloDiaFds(dia.fecha).toLowerCase()}: su conclusión (lámina 19) queda sin datos.`);
  });
  return avisos;
}
