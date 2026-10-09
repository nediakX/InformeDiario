// Informe Diario: tipos, plantillas por defecto (personal, actividades, evidencias) y utilidades.

import decoracionSeptiembre from "../../assets/18sep.png";
import decoracionOctubre from "../../assets/31oct.png";
import decoracionDiciembre from "../../assets/25dec.png";

import { N_CONTRATO, LINEA_SERVICIO } from '../../datos/catalogos';

import { type BorradorEntry, savedAtSemilla } from '../../datos/borradoresDiario';

import { VERTIV_CARROS_FLAT, VERTIV_ITEMS } from '../../datos/plantillaWord';
import { idBorradorAutomatico } from '../../datos/turnos';
import { CONFIG_DIVISION, type Division } from '../../datos/divisiones';

// Tipos de datos
export interface PersonalItem {
  nombre: string;
  cargo: string;
}

export interface EvidenceBlock {
  id: string;
  title: string;
  photoCount: number;
  photos: (string | null)[];
  isActivity: boolean;
  isFixed?: boolean;
  actIndex?: number;
  /** Bloque especial "Cuadro Vertiv" (Turno Día, opcional): va en su propia hoja horizontal. */
  cuadroVertiv?: boolean;
}

export type ScannerTarget =
  | { type: 'evidence'; blockIndex: number; photoIndex: number }
  | { type: 'vertivCarro'; index: number }
  | { type: 'vertivItem'; index: number };

export type CvMat = {
  rows: number;
  cols: number;
  data32S: Int32Array;
  delete: () => void;
};

export type CvApi = {
  Mat: new () => CvMat;
  MatVector: new () => { size: () => number; get: (index: number) => CvMat; delete: () => void };
  Size: new (width: number, height: number) => unknown;
  Scalar: new (...values: number[]) => unknown;
  CV_32FC2: number;
  COLOR_RGBA2GRAY: number;
  THRESH_BINARY: number;
  THRESH_OTSU: number;
  RETR_LIST: number;
  RETR_EXTERNAL: number;
  CHAIN_APPROX_SIMPLE: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  imread: (source: HTMLCanvasElement) => CvMat;
  cvtColor: (...args: unknown[]) => void;
  GaussianBlur: (...args: unknown[]) => void;
  Canny: (...args: unknown[]) => void;
  findContours: (...args: unknown[]) => void;
  threshold: (...args: unknown[]) => void;
  arcLength: (contour: CvMat, closed: boolean) => number;
  approxPolyDP: (...args: unknown[]) => void;
  contourArea: (contour: CvMat) => number;
  matFromArray: (...args: unknown[]) => CvMat;
  getPerspectiveTransform: (...args: unknown[]) => CvMat;
  warpPerspective: (...args: unknown[]) => void;
  imshow: (canvas: HTMLCanvasElement, image: CvMat) => void;
};

export const DEFAULT_PERSONAL: PersonalItem[] = [
  { nombre: "Max Diaz.", cargo: "Supervisor de Operaciones" },
  { nombre: "Patricio Santana.", cargo: "Supervisor de Operaciones" },
  { nombre: "Carlos Moll.", cargo: "Técnico Eléctrico." },
  { nombre: "Williams Barraza.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "José Escobar.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Kevin Guerrero.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Vanesa Aguilar.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Nicolas Bahamondes.", cargo: "Líder Técnico" },
  { nombre: "Ricardo Riquelme.", cargo: "Electromecanico" },
  { nombre: "Claudia Droguett.", cargo: "Experta SSO" }
];

export const DEFAULT_PERSONAL_B: PersonalItem[] = [
  { nombre: "Marcelo Artal Gahona", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Alberto Vital Arancibia Madariaga", cargo: "Técnico Eléctrico" },
  { nombre: "Fernando Contreras Cortes", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Maximiliano Bahamondez", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Luis Humberto Fernández Ortega", cargo: "Supervisor de Operaciones" },
  { nombre: "Omar Jesús Gutiérrez Tapia", cargo: "Experto SSO" },
  { nombre: "Francisco Jara Carvajal", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Ricardo Morales Hurtado", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Claudio Abdón Orrego Rojas", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Camilo Andrés Pailapan Hormazabal", cargo: "Supervisor de Operaciones" }
];

/** Dotación por defecto de cada turno (la de la división; El Salvador usa sus listas de siempre). */
export const getDefaultPersonal = (letra: string, division: Division = 'el_salvador'): PersonalItem[] => {
  const porTurno = CONFIG_DIVISION[division].personalPorTurno;
  if (division !== 'el_salvador' && porTurno) return (letra === 'B' ? porTurno.B : porTurno.A).map(p => ({ ...p }));
  return letra === 'B' ? DEFAULT_PERSONAL_B : DEFAULT_PERSONAL;
};

// Lista que usó Andina antes de tener su dotación por turno: si quedó guardada tal cual en un
// equipo, se reemplaza por la dotación del turno.
const ANDINA_LISTA_ANTIGUA = [
  'Cesar Enrique Orellana Martinez', 'Dennis William Gatica Martinez', 'Oscar Fabian Acuña Solis',
  'Guillermo Arturo Soto Alvarado', 'Jose Luis Arévalo Guerra', 'Maikol Peña Gavidia', 'Luciano Salvador Olmos Torres',
];
const esListaAntiguaAndina = (lista: PersonalItem[]) =>
  lista.length === ANDINA_LISTA_ANTIGUA.length && lista.every((p, i) => p.nombre === ANDINA_LISTA_ANTIGUA[i]);

export const DEFAULT_ACTIVIDADES_DIA: string[] = [
  "Registro de Reunión Inicio de Turno.",
  "Registro de Check List de Vehículo Liviano.",
  "Vehículo liviano L200 VCTF 84.",
  "Autoevaluación Diaria Inicio y Termino de Turno.",
  "Registro ART Conducción Vehículo Liviano.",
  "Registro Fatiga y Somnolencia.",
  "Verificación de Ropa Alta Visibilidad.",
  "Registro de Protección Solar.",
  "Registro de Hidratación.",
  "Tareas Administrativas."
];

export const ACTIVIDAD_DIA_PERMANENTE = "Verificación de Ropa Alta Visibilidad";
export const ACTIVIDAD_ART_VEHICULO_LIVIANO = "Registro ART Conducción Vehículo Liviano.";

export const ensureActividadesDiaPermanentes = (items: string[]) => {
  const updated = [...items];
  if (!updated.includes(ACTIVIDAD_ART_VEHICULO_LIVIANO)) {
    const fatigueIndex = updated.indexOf("Registro Fatiga y Somnolencia.");
    updated.splice(fatigueIndex >= 0 ? fatigueIndex : updated.length, 0, ACTIVIDAD_ART_VEHICULO_LIVIANO);
  }
  if (!updated.includes(ACTIVIDAD_DIA_PERMANENTE)) updated.push(ACTIVIDAD_DIA_PERMANENTE);
  return updated;
};

// Plantilla fija de Actividades Diarias exclusiva de Turno Noche (distinta de la de Turno Día).
export const DEFAULT_ACTIVIDADES_NOCHE: string[] = [
  "Planificación actividades diarias.",
  "Control de fatiga y somnolencia (Encuesta gestión de alerta temprana).",
  "Confección de Análisis de Riesgo del Trabajo (ART).",
  "Se realiza reportabilidad diaria GG LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 y MMOO 01.", // El Salvador (ver actividadesNoche)
  "Monitoreo General status ENODO B.",
  "Monitoreo general status de energía.",
  "Actividades administrativas (confección de reportes)."
];

export const DEFAULT_EVIDENCIAS_NOCHE: string[] = [
  "REGISTRO DE CHECK LIST CAMIONETA.",
  "AUTOEVALUACIÓN DIARIA Y CHARLA INICIO DE TURNO.",
  "REGISTRO ART. CONDUCCIÓN Y TRASLADO DE PERSONAL",
  "REGISTRO ART. REPORTABILIDAD DIARIA GG",
  "VERIFICACION DE ENTORNO",
  "CONTROL DE FATIGA Y SOMNOLENCIA",
  "REPORTABILIDAD GG.",
];

export const EVIDENCIAS_EXCLUIDAS_DIA = new Set([
  "Tareas Administrativas.",
  "Vehículo liviano L200 VCTF 84.",
]);

export const EVIDENCIAS_CON_TAMANO_FOTOGRAFICO_SOLICITADO = new Set([
  "registro de protección solar.",
  "registro de hidratación.",
  "verificación de ropa alta visibilidad.",
  "verificación de ropa alta visibilidad",
  "registro de inspección de ropa de alta visibilidad.",
  "inspección de ropa de alta visibilidad.",
  "autoevaluación diaria inicio y termino de turno.",
]);

export const CREADO_POR_OPTIONS: { nombre: string; cargo: string }[] = [
  { nombre: "Max Diaz Cornejo.", cargo: "Supervisor de Operaciones" },
  { nombre: "Patricio Santana.", cargo: "Supervisor de Operaciones" },
  { nombre: "Nicolas Bahamondes.", cargo: "Tecnico Lider" },
];

export const CREADO_POR_OPTIONS_B: { nombre: string; cargo: string }[] = [
  { nombre: "Luis Humberto Fernández Ortega", cargo: "Supervisor de Operaciones" },
  { nombre: "Camilo Andrés Pailapan Hormazabal", cargo: "Supervisor de Operaciones" },
];

export const CREADO_POR_ALL = [...CREADO_POR_OPTIONS, ...CREADO_POR_OPTIONS_B];

// Integrantes sugeridos que no pertenecen a la dotación de un turno específico.
export const PERSONAL_SUGERIDO_OTROS: PersonalItem[] = [
  { nombre: "Juan Saavedra.", cargo: "Jefe de Turno." },
  { nombre: "German Votter.", cargo: "Gerente de Operaciones." },
  { nombre: "Javiera Lira.", cargo: "Directora Legal." },
  { nombre: "Carolina Klenner.", cargo: "Gerenta de Personas." },
  { nombre: "Juan Morata.", cargo: "Ingeniero Especialista." },
  { nombre: "Cesar Orellana.", cargo: "Administrador de Contrato." },

];

// Los carros a los que se les puede hacer mantenimiento preventivo (actividad sugerida "Mantenimiento")
// son los de la división: configDivision(d).carros (datos/divisiones.ts).

// Valor de la actividad sugerida que abre el selector de carro.
export const ACTIVIDAD_SUGERIDA_MANTENCION = "Mantenimiento";
// Prefijo de la actividad que se genera al elegir un carro (es solo del día, no va a la plantilla).
export const PREFIJO_MANTENCION_CARRO = "Mantenimiento preventivo ";

// Bloque fijo que solo aplica cuando el turno es de NOCHE.
// Va SIEMPRE junto (no es editable por el usuario) y se omite por completo en turno DÍA.
// (VERTIV_TITLE, VERTIV_CARROS, VERTIV_CARROS_FLAT y VERTIV_ITEMS viven en types.ts,
// compartidos con el Informe de Cierre.)

// Texto fijo de cierre (última hoja). También solo para turno NOCHE.
export const INDICADORES_INTRO =
  "Durante el turno se ejecutó reportabilidad diaria GG de forma parcial en los sitios LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 y MMOO 01, manteniendo validación de continuidad de servicio y estado operacional en los puntos priorizados de la jornada.";

/** Actividades por defecto de Turno Noche con los sitios de reportabilidad de la división. */
export const actividadesNoche = (division: Division = 'el_salvador'): string[] =>
  division === 'el_salvador' ? DEFAULT_ACTIVIDADES_NOCHE : DEFAULT_ACTIVIDADES_NOCHE.map(adaptarReportabilidad(division));

/** Cambia los sitios de El Salvador por los de la división en los textos de reportabilidad GG. */
const adaptarReportabilidad = (division: Division) => (texto: string) =>
  texto.replace(CONFIG_DIVISION.el_salvador.sitiosReportabilidad, CONFIG_DIVISION[division].sitiosReportabilidad);

/** Texto final del Word de Turno Noche con los sitios de la división. */
export const indicadoresIntro = (division: Division = 'el_salvador') => adaptarReportabilidad(division)(INDICADORES_INTRO);

export const INDICADORES_BULLETS: string[] = [
  "Se realizó monitoreo general del estado de E-Nodo B, verificando conectividad mediante ICMP y tiempos de respuesta (latencia) como referencia de estabilidad de red y comunicación operacional.",
  "Se efectuó monitoreo general de energía asociado a la continuidad operacional, incluyendo revisión de gestión de planta rectificadora Vertiv, voltaje del sistema LTE, voltaje de bancos de baterías, corriente del sistema, descarga total de bancos y condición térmica de gabinetes de baterías.",
  "Se mantuvo control operacional complementario mediante registro de alcotest, control de fatiga y somnolencia, confección de ART y ejecución de difusiones preventivas, reforzando las condiciones de seguridad y cumplimiento operativo del turno.",
];

export const OBS_FINAL_BULLETS: string[] = [
  "Se mantiene monitoreo general sobre E-Nodo B, sistema de energía y gestión Vertiv, dando continuidad al seguimiento de los parámetros operacionales del sistema LTE.",
];

export const BLUE = "156082";
export const ORANGE = "ED7D31";
export const LS_KEY_PERSONAL = "psinet_personal_v6"; // Turno A (clave original, se mantiene)
export const LS_KEY_PERSONAL_B = "psinet_personal_b_v1"; // Turno B
// Cada división guarda lo suyo en el dispositivo (El Salvador conserva las claves originales).
const conSufijo = (clave: string, division: Division) => clave + CONFIG_DIVISION[division].sufijoLocal;
export const lsKeyPersonal = (letra: string, division: Division = 'el_salvador') =>
  conSufijo(letra === 'B' ? LS_KEY_PERSONAL_B : LS_KEY_PERSONAL, division);
export const LS_KEY_ACT_DIA = "psinet_actividades_dia_v6";
export const LS_KEY_ACT_NOCHE = "psinet_actividades_noche_v6";
export const lsKeyActividades = (turno: 'dia' | 'noche', division: Division = 'el_salvador') =>
  conSufijo(turno === 'dia' ? LS_KEY_ACT_DIA : LS_KEY_ACT_NOCHE, division);
export const LS_KEY_DRAFT = "psinet_informe_borrador_v1";
export const lsKeyBorradorLocal = (division: Division = 'el_salvador') => conSufijo(LS_KEY_DRAFT, division);
// Forma del respaldo local del informe en curso (campos del formulario + fotos).
export type BorradorLocal = Partial<Omit<BorradorEntry, 'id' | 'evidenceBlocks'>> & { evidenceBlocks?: EvidenceBlock[] };

// Personal y actividades "vigentes" de cada turno (lo guardado en este dispositivo o, si no hay, los valores por defecto).
export const getPersonalGuardado = (letra: string, division: Division = 'el_salvador'): PersonalItem[] => {
  try {
    const raw = localStorage.getItem(lsKeyPersonal(letra, division));
    if (!raw) return getDefaultPersonal(letra, division);
    const guardado = JSON.parse(raw) as PersonalItem[];
    return division === 'andina' && esListaAntiguaAndina(guardado) ? getDefaultPersonal(letra, division) : guardado;
  } catch {
    return getDefaultPersonal(letra, division);
  }
};

export const getActividadesGuardadas = (turno: 'dia' | 'noche', division: Division = 'el_salvador'): string[] => {
  try {
    const raw = localStorage.getItem(lsKeyActividades(turno, division));
    if (turno === 'dia') return raw ? ensureActividadesDiaPermanentes(JSON.parse(raw)) : DEFAULT_ACTIVIDADES_DIA;
    if (!raw) return actividadesNoche(division);
    const guardadas = JSON.parse(raw) as string[];
    // Otras divisiones: si quedó guardada la reportabilidad con sitios de El Salvador, se corrige.
    return division === 'el_salvador' ? guardadas : guardadas.map(adaptarReportabilidad(division));
  } catch {
    return turno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : actividadesNoche(division);
  }
};

export const getCreadorPorDefecto = (letra: string, division: Division = 'el_salvador') =>
  CONFIG_DIVISION[division].diario.creadorPorDefecto[letra === 'B' ? 'B' : 'A'];

/** Fotos del bloque Vertiv vacías (solo en divisiones que lo tienen). */
export const vertivVacio = (division: Division) => ({
  carros: CONFIG_DIVISION[division].vertiv ? VERTIV_CARROS_FLAT.map(() => null) : [],
  items: CONFIG_DIVISION[division].vertiv ? VERTIV_ITEMS.map(() => null) : [],
});

// Borrador "virtual" de un día del turno: existe solo en pantalla (no en Supabase) hasta que el informe
// tenga al menos una foto. Al abrirlo, el Informe Diario arma las evidencias a partir de las actividades.
export const crearBorradorAutomatico = (fecha: string, letra: 'A' | 'B', turno: 'dia' | 'noche', division: Division = 'el_salvador'): BorradorEntry => {
  const creador = getCreadorPorDefecto(letra, division);
  const config = CONFIG_DIVISION[division];
  const vertiv = vertivVacio(division);
  return {
    id: idBorradorAutomatico(fecha, letra, turno, division),
    turno,
    fecha,
    faena: config.faena,
    letraTurno: letra,
    contrato: N_CONTRATO,
    version: '1.1',
    servicio: LINEA_SERVICIO,
    creadoNombre: creador.nombre,
    creadoCargo: creador.cargo,
    revisadoText: config.diario.revisadoText,
    autorizadoNombre: config.diario.autorizado.nombre,
    autorizadoCargo: config.diario.autorizado.cargo,
    personal: getPersonalGuardado(letra, division),
    actividades: getActividadesGuardadas(turno, division),
    observaciones: [],
    evidenceBlocks: [],
    vertivCarroPhotos: vertiv.carros,
    vertivItemPhotos: vertiv.items,
    savedAt: savedAtSemilla(fecha),
    division,
  };
};

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const DECORACIONES_MENSUALES: Record<number, { source: string; label: string; message: string }> = {
  9: { source: decoracionSeptiembre, label: "Decoración de Fiestas Patrias", message: "¡Feliz 18 de septiembre!" },
  10: { source: decoracionOctubre, label: "Decoración de Halloween", message: "¡Feliz Halloween!" },
  12: { source: decoracionDiciembre, label: "Decoración navideña", message: "¡Feliz Navidad!" },
};

export const formatFechaEvidencia = (iso: string) => {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")} de ${MESES[month - 1]} de ${year}`;
};

// Helper para convertir rutas o URLs a DataURL Base64
export const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
