// Presentación de fin de semana (viernes a domingo de la semana de turno). Los textos salen de los
// Informes Diarios como borradores; las horas registradas y el último mantenimiento salen de la base
// (ver datosFds.ts). La reportabilidad GG parte en 100 % cada día. La pantalla permite corregirlo todo
// antes de generar el .pptx.
import { esSemillaSinEditar, type BorradorEntry, type EvidenceBlockLike } from '../../datos/borradoresDiario';
import type { BorradorOtroEntry } from '../../datos/borradoresOtros';
import type { SemanaTurno } from '../../datos/turnos';
import { nombreDiaSemana, sumarDias } from '../../datos/fechas';
import { esPreventiva } from '../preventiva/modelo';

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
  /** Difusiones del día (lámina 13: un recuadro por día). */
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
  /** Lámina 19: la conclusión fija del fin de semana y después una por día, a partir de sus actividades. */
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
  { sitio: 'O&M_LTE_CMF_09', nombre: 'Cerro La Ballena', dias: 210, carro: 'LTE_CMF_09', gg: 'LTE_CMF_09' },
  { sitio: 'O&M_MMOO 01', nombre: 'Chancado Primario', dias: 180, carro: 'MMOO_01', gg: 'LTE_CM_MMOO_01' },
  { sitio: 'O&M_LTE_CMF_04', nombre: 'Cerro Antenas', dias: 210, carro: 'LTE_CMF_04', gg: 'LTE_CMF_04' },
  { sitio: 'O&M_LTE_CMM_06', nombre: 'Mirador Fase 2', dias: 180, carro: 'LTE_CMM_06', gg: 'LTE_CMM_06' },
  { sitio: 'O&M_LTE_CMM_10', nombre: 'Cerro Pisquero', dias: 180, carro: 'LTE_CMM_10', gg: 'LTE_CMM_10' },
  { sitio: 'O&M_LTE_CMF_02', nombre: 'Truck shop', dias: 180, carro: 'LTE_CMF_02', gg: 'LTE_CMF_02' },
  { sitio: 'O&M_LTE_CMF_08', nombre: 'Ex Garita Rajo Inca', dias: 180, carro: 'LTE_CMF_08', gg: 'LTE_CMF_08' },
  { sitio: 'O&M_LTE_CMM_05', nombre: 'EX Barrio Cívico', dias: 180, carro: 'LTE_CMM_05', gg: 'LTE_CMM_05' },
  { sitio: 'O&M_LTE_CMF_01', nombre: 'Bloquera', dias: 180, carro: 'LTE_CMF_01', gg: 'LTE_CMF_01' },
  { sitio: 'O&M_LTE_CMM_11', nombre: 'ex ventiladores.', dias: 180, carro: 'LTE_11', gg: 'LTE_11' },
  { sitio: 'O&M_LTE_CMM_07', nombre: 'Campamento Antiguo', dias: 180, carro: 'LTE_CMM_07', gg: 'LTE_CMM_07' },
];

/** Valores de la tabla de mantenimiento (lámina 9) que se usan cuando la base no tiene el dato del sitio. */
interface OmPredeterminada {
  horasUltimo: number;
  /** ISO. */
  fechaUltimo: string;
  horasRegistradas: number;
}

/** Clave: carro del sitio (SitioFds.carro). Valores de la última tabla de referencia (horas registradas al 21-10-2026). */
const OM_PREDETERMINADA: Partial<Record<string, OmPredeterminada>> = {
  LTE_CMM_03: { horasUltimo: 4872, fechaUltimo: '2026-09-23', horasRegistradas: 5137 },
  LTE_CMF_09: { horasUltimo: 4977, fechaUltimo: '2026-09-24', horasRegistradas: 5257 },
  MMOO_01: { horasUltimo: 228, fechaUltimo: '2025-08-27', horasRegistradas: 403 },
  LTE_CMF_04: { horasUltimo: 4867, fechaUltimo: '2026-09-24', horasRegistradas: 5027 },
  LTE_CMM_06: { horasUltimo: 4682, fechaUltimo: '2026-10-14', horasRegistradas: 4708 },
  LTE_CMM_10: { horasUltimo: 4382, fechaUltimo: '2026-09-02', horasRegistradas: 4664 },
  LTE_CMF_02: { horasUltimo: 2954, fechaUltimo: '2026-08-28', horasRegistradas: 3202 },
  LTE_CMF_08: { horasUltimo: 3080, fechaUltimo: '2026-08-29', horasRegistradas: 3304 },
  LTE_CMM_05: { horasUltimo: 3151, fechaUltimo: '2026-09-03', horasRegistradas: 3211 },
  LTE_CMF_01: { horasUltimo: 3829, fechaUltimo: '2026-09-07', horasRegistradas: 4063 },
  LTE_11: { horasUltimo: 1208, fechaUltimo: '2026-09-02', horasRegistradas: 1317 },
  LTE_CMM_07: { horasUltimo: 2525, fechaUltimo: '2026-08-26', horasRegistradas: 2583 },
};

/** Controles transversales que salen en la lámina del fin de semana de referencia. */
export const CONTROLES_FDS_PREDETERMINADOS = [
  'Charla inicio de turno',
  'Check list vehículo liviano',
  'Fatiga y somnolencia',
  'Protección solar, hidratación, ART y test alcohol/drogas',
];

/** Lámina 3: frases fijas de apertura del resumen (después van las generadas del resumen de actividades). */
const RESUMEN_FIJO_FDS = [
  'OPERACIÓN GENERAL ESTABLE DURANTE EL FIN DE SEMANA.',
  'SE MANTUVO CONTROL DOCUMENTAL Y SSO: ART, CHECK LIST, FATIGA Y SOMNOLENCIA, TEST ALCOHOL Y DROGAS, PROTECCIÓN SOLAR E HIDRATACIÓN.',
  'SE MANTIENE SEGUIMIENTO A LTE_CMM_05: SE REALIZA REPORTABILIDAD DE CARROS EN TURNO NOCHE.',
];
/** Lámina 15: avance fijo de documentación (después van las mejoras de las actividades). */
const OBSERVACION_FIJA_FDS = '•SE LOGRA REALIZAR AVANCES EN DOCUMENTACIÓN Y RFs.';
/** Lámina 19: conclusión fija del fin de semana (después van las de cada día). */
const CONCLUSION_FIJA_FDS = 'FIN DE SEMANA CON CONTINUIDAD OPERACIONAL Y SIN INCIDENTES OPERACIONALES MAYORES REPORTADOS.';

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
const ES_FALLA = /falla|atencion|fallas/;
/** Difusiones (lámina 13; no son actividades de trabajo): flash, charlas, reuniones y capacitaciones. */
const ES_DIFUSION = /flash|difusion|charla|reunion|capacitacion|induccion|sensibilizacion|entrenamiento/;
/**
 * Rutina y controles SSO: no van en las actividades de trabajo (lámina 5) ni en las difusiones. Son los registros
 * diarios (inicio de turno, checklist, fatiga, alcohol y drogas...) y lo que ya sale en el resumen o en los controles.
 */
const ES_RUTINA = /inicio de turno|autoevaluacion|check ?list|l200|fatiga|somnolencia|alta visibilidad|\bropa\b|proteccion solar|hidratacion|tareas administrativas|actividades administrativas|planificacion|alcohol|drogas|reportabilidad|registro art|^art\b|verificacion de entorno|controles? sso/;
/** Mejoras que se agregan en las actividades diarias (lámina 15). */
const ES_MEJORA = /\bmejora/;
/** Repliegues de carros y difusiones principales (capacitaciones, reunión de tronadura): van en la lámina 11. */
const ES_REPLIEGUE = /repliegue/;
const ES_PRINCIPAL_DIFUSION = /capacitacion|entrenamiento|induccion|tronadura/;

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
  ES_DIFUSION.test(sinAcentos(actividad)) && !ES_MANTENCION.test(sinAcentos(actividad)) ? 'ASESOR HSE' : 'TURNO A';

/** Título de una actividad para las láminas: sin el "Registro de" inicial (ej: "Reunión inicio de turno."). */
const sinRegistroDe = (texto: string) => texto.trim().replace(/^registro de\s+/i, '');

/** Actividades de trabajo de un día (lámina 5): sin la rutina ni las difusiones, que van en la lámina 13. */
const actividadesDeTrabajoDe = (entrada: BorradorEntry): string[] =>
  sinRepetidos(
    entrada.actividades.filter(a => {
      const clave = sinAcentos(a);
      return clave !== '' && !ES_RUTINA.test(clave) && !ES_DIFUSION.test(clave);
    }),
  ).map(sinRegistroDe);

/** Dos títulos se repiten si uno contiene al otro por palabras completas ("CMM 1" no repite a "CMM 11"). */
const relacionados = (a: string, b: string): boolean => {
  const enPalabras = (texto: string) => ` ${sinAcentos(texto).replace(/\s+/g, ' ')} `;
  const x = enPalabras(a);
  const y = enPalabras(b);
  return x.includes(y) || y.includes(x);
};

/** Difusiones de un día (lámina 13): de sus actividades y de sus evidencias (sin las fijas, el Cuadro Vertiv ni las que repiten una actividad). */
const difusionesDe = (entrada: BorradorEntry | null): string[] => {
  if (!entrada) return [];
  const titulos = [
    ...entrada.actividades.map(t => t.trim()),
    ...entrada.evidenceBlocks
      .filter((b: EvidenceBlockLike) => !b.cuadroVertiv && !b.isFixed)
      .map(b => b.title.trim())
      .filter(t => !entrada.actividades.some(a => relacionados(a, t))),
  ];
  return sinRepetidos(
    titulos.filter(t => {
      const clave = sinAcentos(t);
      return clave !== '' && !ES_RUTINA.test(clave) && ES_DIFUSION.test(clave);
    }),
  );
};

/** Mejoras que se agregaron en las actividades diarias (lámina 15), como viñetas. */
const mejorasDe = (entradas: (BorradorEntry | null)[]): string[] =>
  sinRepetidos(entradas.flatMap(e => (e ? e.actividades : [])).filter(a => ES_MEJORA.test(sinAcentos(a)))).map(
    a => `•${sinRegistroDe(a)}`,
  );

const tituloRealizados = (lista: string[], patron: RegExp) =>
  sinRepetidos(lista.filter(a => patron.test(sinAcentos(a))));

/**
 * Lo que se lee de los informes de la semana para las láminas por tema: primero las actividades, sin
 * rutina; después los títulos de las evidencias, salvo los que repiten una actividad (ej: "CAPACITACIÓN DE RIT (FOTOS)").
 */
const lecturaDeSemana = (entradas: (BorradorEntry | null)[]): string[] => {
  const limpio = (texto: string) => sinRegistroDe(texto).toUpperCase();
  const util = (texto: string) => texto !== '' && !ES_RUTINA.test(sinAcentos(texto));
  const actividades = sinRepetidos(entradas.flatMap(e => (e ? e.actividades : [])).map(limpio).filter(util));
  const evidencias = sinRepetidos(
    entradas
      .flatMap(e => (e ? e.evidenceBlocks.filter(b => !b.cuadroVertiv && !b.isFixed).map(b => b.title) : []))
      .map(limpio)
      .filter(util),
  );
  const repiteActividad = (evidencia: string) => actividades.some(a => relacionados(a, evidencia));
  return [...actividades, ...evidencias.filter(e => !repiteActividad(e))];
};

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

// ---------------------------------------------------------------------------------------
// Reportabilidad por defecto, horas y último mantenimiento (estos dos últimos salen de la base)
// ---------------------------------------------------------------------------------------

/** Reportabilidad de GG de cada día del fin de semana, por defecto: 100 % (0-1). El formulario la deja así y se puede cambiar. */
const REPORTABILIDAD_GG_PREDETERMINADA = 1;

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
  if (!nombres.length && !dia.difusiones.length) return `${rotulo}: SIN ACTIVIDADES DE TRABAJO REGISTRADAS EN EL INFORME DIARIO.`;
  const hechos: string[] = [];
  if (nombres.some(a => ES_MANTENCION.test(a))) hechos.push('MANTENIMIENTOS PREVENTIVOS');
  if (nombres.some(a => ES_BATERIA.test(a))) hechos.push('MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS');
  if (nombres.some(a => ES_CPE.test(a) && !ES_MANTENCION.test(a))) hechos.push('TRABAJOS DE CPE');
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
  const diurnos = fechas.map(fecha => buscar(fecha, 'dia'));
  const dias: DiaFds[] = fechas.map((fecha, k) => {
    const dia = diurnos[k];
    return {
      fecha,
      actividades: dia ? actividadesDeTrabajoDe(dia).map(a => ({ actividad: a.toUpperCase(), responsable: responsableDe(a) })) : [],
      difusiones: difusionesDe(dia),
    };
  });

  const noches = fechas.map(f => buscar(f, 'noche')).filter((e): e is BorradorEntry => Boolean(e));
  // Lo que se lee de los informes de la semana: actividades y evidencias del turno de día, como en las láminas por día.
  const lectura = lecturaDeSemana(diurnos);

  const mantencion = tituloRealizados(lectura, ES_MANTENCION);
  const baterias = tituloRealizados(lectura, ES_BATERIA);
  // Un mantenimiento que nombra una antena (ej: Cerro Antenas) no es un trabajo de CPE.
  const cpe = tituloRealizados(lectura, ES_CPE).filter(a => !ES_MANTENCION.test(sinAcentos(a)));
  const fallas = tituloRealizados(lectura, ES_FALLA);
  const repliegues = tituloRealizados(lectura, ES_REPLIEGUE);
  const principales = tituloRealizados(lectura, ES_PRINCIPAL_DIFUSION);

  // Lámina 3: las frases fijas y después lo que sale del resumen de actividades de los informes.
  const resumenGeneral = [...RESUMEN_FIJO_FDS];
  if (mantencion.length) resumenGeneral.push(`SE EJECUTARON MANTENIMIENTOS PREVENTIVOS: ${mantencion.join('; ')}`);
  if (cpe.length) resumenGeneral.push(`SE EJECUTARON TRABAJOS DE CPE: ${cpe.join('; ')}`);
  if (fallas.length) resumenGeneral.push(`SE ATENDIERON FALLAS: ${fallas.join('; ')}`);
  if (baterias.length) resumenGeneral.push(`SE REALIZÓ MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS: ${baterias.join('; ')}`);

  return {
    letra: semana.letra,
    inicio,
    fin,
    resumenGeneral,
    dias,
    reportabilidadGG: fechas.map(() => REPORTABILIDAD_GG_PREDETERMINADA),
    fechaCorteOm: corte,
    om: SITIOS_FDS.map(s => {
      const ultimo = ultimoMantenimientoDe(auto.mantenimientos, s.carro, corte);
      // La base manda; lo que no tiene se completa con la tabla de referencia.
      const predeterminada = OM_PREDETERMINADA[s.carro];
      return {
        sitio: s.sitio,
        nombre: s.nombre,
        horasUltimo: ultimo.horas ?? predeterminada?.horasUltimo ?? null,
        fechaUltimo: ultimo.fecha ?? predeterminada?.fechaUltimo ?? null,
        dias: s.dias,
        horasRegistradas: horasRegistradasDe(auto, s.gg) ?? predeterminada?.horasRegistradas ?? null,
      };
    }),
    // Lámina 11: lo más importante de la semana, en líneas cortas (las familias del resumen, y después los repliegues
    // y las capacitaciones o reuniones principales, una línea por actividad).
    cascadaActividades: [
      ...(mantencion.length ? [`MANTENIMIENTOS PREVENTIVOS EJECUTADOS: ${mantencion.join('; ')}`] : []),
      ...(cpe.length ? [`TRABAJOS DE CPE: ${cpe.join('; ')}`] : []),
      ...(fallas.length ? [`ATENCIÓN DE FALLAS: ${fallas.join('; ')}`] : []),
      ...(baterias.length ? ['SE REALIZÓ MEDICIÓN Y VALIDACIÓN DE BANCO DE BATERÍAS DE LOS CARROS LTE.'] : []),
      ...repliegues,
      ...principales,
    ],
    controles: [...CONTROLES_FDS_PREDETERMINADOS],
    observaciones: [OBSERVACION_FIJA_FDS, ...mejorasDe([...diurnos, ...noches])],
    cpe,
    conclusiones: [CONCLUSION_FIJA_FDS, ...dias.map(conclusionDelDia)],
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
    reportabilidadGG: [0, 1, 2].map(k => parsePorcentajeFds(valor(`gg${k}`))),
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
  datos.reportabilidadGG.forEach((v, k) => { textos[`gg${k}`] = v === null ? '' : String(Math.round(v * 100)); });
  return textos;
}

/** Avisos antes de generar: lo que la lámina saldría vacío o incompleto. */
export function avisosFds(datos: DatosFds): string[] {
  const avisos: string[] = [];
  datos.dias.forEach((dia, k) => {
    if (datos.reportabilidadGG[k] === null) avisos.push(`Falta la reportabilidad GG del ${rotuloDiaFds(dia.fecha).toLowerCase()}: el gráfico la muestra en 0%.`);
  });
  const sinUltimo = datos.om.filter(f => f.horasUltimo === null || f.fechaUltimo === null).map(f => f.nombre);
  if (sinUltimo.length) avisos.push(`Sin horas o fecha del último mantenimiento: ${sinUltimo.join(', ')}. Su fila quedará incompleta.`);
  const sinHoras = datos.om.filter(f => f.horasRegistradas === null).map(f => f.nombre);
  if (sinHoras.length) avisos.push(`Sin horas registradas hasta la fecha de corte: ${sinHoras.join(', ')}.`);
  datos.dias.forEach(dia => {
    if (!dia.actividades.length) avisos.push(`No hay actividades de trabajo registradas el ${rotuloDiaFds(dia.fecha).toLowerCase()}: su conclusión (lámina 19) queda sin datos.`);
  });
  return avisos;
}
