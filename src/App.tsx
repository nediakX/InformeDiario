import { useState, useEffect, useRef } from 'react';
import * as docx from 'docx';
import { saveAs } from 'file-saver';
import { ChevronDown, ChevronUp, Trash2, ClipboardList, Users, ListChecks, BatteryCharging, MessageSquare, Camera, Loader2, ArrowLeft, Plus } from 'lucide-react';
import './App.css';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import decoracionSeptiembre from "./assets/18sep.png";
import decoracionOctubre from "./assets/31oct.png";
import decoracionDiciembre from "./assets/25dec.png";
import Dashboard from './Dashboard';
import Borradores from './Borradores';
import InformeCierre from './InformeCierre';
import {
  type BorradorEntry, fetchBorradores, subscribeBorradores, upsertBorrador, deleteBorrador, resolveImageBytes,
  VERTIV_TITLE, VERTIV_CARROS, VERTIV_CARROS_FLAT, VERTIV_ITEMS,
  hoyLocalISO, cicloDeFecha, letraDeFecha, TURNOS_AUTOMATICOS, idBorradorAutomatico, savedAtSemilla, sembrarBorradores, esBorradorPendiente,
} from './types';


// Tipos de datos
interface PersonalItem {
  nombre: string;
  cargo: string;
}

interface EvidenceBlock {
  id: string;
  title: string;
  photoCount: number;
  photos: (string | null)[];
  isActivity: boolean;
  isFixed?: boolean;
  actIndex?: number;
}

type ScannerTarget =
  | { type: 'evidence'; blockIndex: number; photoIndex: number }
  | { type: 'vertivCarro'; index: number }
  | { type: 'vertivItem'; index: number };

type CvMat = {
  rows: number;
  cols: number;
  data32S: Int32Array;
  delete: () => void;
};

type CvApi = {
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

const DEFAULT_PERSONAL: PersonalItem[] = [
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

const DEFAULT_PERSONAL_B: PersonalItem[] = [
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

const getDefaultPersonal = (letra: string): PersonalItem[] =>
  letra === 'B' ? DEFAULT_PERSONAL_B : DEFAULT_PERSONAL;

const DEFAULT_ACTIVIDADES_DIA: string[] = [
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

const ACTIVIDAD_DIA_PERMANENTE = "Verificación de Ropa Alta Visibilidad";
const ACTIVIDAD_ART_VEHICULO_LIVIANO = "Registro ART Conducción Vehículo Liviano.";

const ensureActividadesDiaPermanentes = (items: string[]) => {
  const updated = [...items];
  if (!updated.includes(ACTIVIDAD_ART_VEHICULO_LIVIANO)) {
    const fatigueIndex = updated.indexOf("Registro Fatiga y Somnolencia.");
    updated.splice(fatigueIndex >= 0 ? fatigueIndex : updated.length, 0, ACTIVIDAD_ART_VEHICULO_LIVIANO);
  }
  if (!updated.includes(ACTIVIDAD_DIA_PERMANENTE)) updated.push(ACTIVIDAD_DIA_PERMANENTE);
  return updated;
};

// Plantilla fija de Actividades Diarias exclusiva de Turno Noche (distinta de la de Turno Día).
const DEFAULT_ACTIVIDADES_NOCHE: string[] = [
  "Planificación actividades diarias.",
  "Control de fatiga y somnolencia (Encuesta gestión de alerta temprana).",
  "Confección de Análisis de Riesgo del Trabajo (ART).",
  "Se realiza reportabilidad diaria GG LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 y MMOO 01.",
  "Monitoreo General status ENODO B.",
  "Monitoreo general status de energía.",
  "Actividades administrativas (confección de reportes)."
];

const DEFAULT_EVIDENCIAS_NOCHE: string[] = [
  "REGISTRO DE CHECK LIST CAMIONETA.",
  "AUTOEVALUACIÓN DIARIA Y CHARLA INICIO DE TURNO.",
  "REGISTRO ART. CONDUCCIÓN Y TRASLADO DE PERSONAL",
  "REGISTRO ART. REPORTABILIDAD DIARIA GG",
  "VERIFICACION DE ENTORNO",
  "CONTROL DE FATIGA Y SOMNOLENCIA",
  "REPORTABILIDAD GG.",
];

const EVIDENCIAS_EXCLUIDAS_DIA = new Set([
  "Tareas Administrativas.",
  "Vehículo liviano L200 VCTF 84.",
]);

const EVIDENCIAS_CON_TAMANO_FOTOGRAFICO_SOLICITADO = new Set([
  "registro de protección solar.",
  "registro de hidratación.",
  "verificación de ropa alta visibilidad.",
  "verificación de ropa alta visibilidad",
  "registro de inspección de ropa de alta visibilidad.",
  "inspección de ropa de alta visibilidad.",
  "autoevaluación diaria inicio y termino de turno.",
]);

const CREADO_POR_OPTIONS: { nombre: string; cargo: string }[] = [
  { nombre: "Max Diaz Cornejo.", cargo: "Supervisor de Operaciones" },
  { nombre: "Patricio Santana.", cargo: "Supervisor de Operaciones" },
  { nombre: "Nicolas Bahamondes.", cargo: "Tecnico Lider" },
];

const CREADO_POR_OPTIONS_B: { nombre: string; cargo: string }[] = [
  { nombre: "Luis Humberto Fernández Ortega", cargo: "Supervisor de Operaciones" },
  { nombre: "Camilo Andrés Pailapan Hormazabal", cargo: "Supervisor de Operaciones" },
];

const CREADO_POR_ALL = [...CREADO_POR_OPTIONS, ...CREADO_POR_OPTIONS_B];

// Integrantes sugeridos que no pertenecen a la dotación de un turno específico.
const PERSONAL_SUGERIDO_OTROS: PersonalItem[] = [
  { nombre: "Juan Saavedra.", cargo: "Jefe de Turno." },
  { nombre: "German Votter.", cargo: "Gerente de Operaciones." },
  { nombre: "Javiera Lira.", cargo: "Directora Legal." },
  { nombre: "Carolina Klenner.", cargo: "Gerenta de Personas." },
  { nombre: "Juan Morata.", cargo: "Ingeniero Especialista." },

];

// Bloque fijo que solo aplica cuando el turno es de NOCHE.
// Va SIEMPRE junto (no es editable por el usuario) y se omite por completo en turno DÍA.
// (VERTIV_TITLE, VERTIV_CARROS, VERTIV_CARROS_FLAT y VERTIV_ITEMS viven en types.ts,
// compartidos con el Informe de Cierre.)


// Texto fijo de cierre (última hoja). También solo para turno NOCHE.
const INDICADORES_INTRO =
  "Durante el turno se ejecutó reportabilidad diaria GG de forma parcial en los sitios LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 y MMOO 01, manteniendo validación de continuidad de servicio y estado operacional en los puntos priorizados de la jornada.";

const INDICADORES_BULLETS: string[] = [
  "Se realizó monitoreo general del estado de E-Nodo B, verificando conectividad mediante ICMP y tiempos de respuesta (latencia) como referencia de estabilidad de red y comunicación operacional.",
  "Se efectuó monitoreo general de energía asociado a la continuidad operacional, incluyendo revisión de gestión de planta rectificadora Vertiv, voltaje del sistema LTE, voltaje de bancos de baterías, corriente del sistema, descarga total de bancos y condición térmica de gabinetes de baterías.",
  "Se mantuvo control operacional complementario mediante registro de alcotest, control de fatiga y somnolencia, confección de ART y ejecución de difusiones preventivas, reforzando las condiciones de seguridad y cumplimiento operativo del turno.",
];

const OBS_FINAL_BULLETS: string[] = [
  "Se mantiene monitoreo general sobre E-Nodo B, sistema de energía y gestión Vertiv, dando continuidad al seguimiento de los parámetros operacionales del sistema LTE.",
];

const BLUE = "156082";
const ORANGE = "ED7D31";
const LS_KEY_PERSONAL = "psinet_personal_v6"; // Turno A (clave original, se mantiene)
const LS_KEY_PERSONAL_B = "psinet_personal_b_v1"; // Turno B
const lsKeyPersonal = (letra: string) => (letra === 'B' ? LS_KEY_PERSONAL_B : LS_KEY_PERSONAL);
const LS_KEY_ACT_DIA = "psinet_actividades_dia_v6";
const LS_KEY_ACT_NOCHE = "psinet_actividades_noche_v6";
const LS_KEY_DRAFT = "psinet_informe_borrador_v1";
const LS_KEY_AUTO_CICLO = "psinet_auto_ciclo_v1";

// Personal y actividades "vigentes" de cada turno (lo guardado en este dispositivo o, si no hay, los valores por defecto).
const getPersonalGuardado = (letra: string): PersonalItem[] => {
  try {
    const raw = localStorage.getItem(lsKeyPersonal(letra));
    return raw ? JSON.parse(raw) : getDefaultPersonal(letra);
  } catch {
    return getDefaultPersonal(letra);
  }
};

const getActividadesGuardadas = (turno: 'dia' | 'noche'): string[] => {
  try {
    const raw = localStorage.getItem(turno === 'dia' ? LS_KEY_ACT_DIA : LS_KEY_ACT_NOCHE);
    if (turno === 'dia') return raw ? ensureActividadesDiaPermanentes(JSON.parse(raw)) : DEFAULT_ACTIVIDADES_DIA;
    return raw ? JSON.parse(raw) : DEFAULT_ACTIVIDADES_NOCHE;
  } catch {
    return turno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE;
  }
};

const getCreadorPorDefecto = (letra: string) =>
  letra === 'B' ? CREADO_POR_OPTIONS_B[0] : { nombre: 'Max Diaz Cornejo', cargo: 'Supervisor' };

// Borrador "vacío" que se crea solo para cada día del turno. Al abrirlo, el Informe Diario arma
// las evidencias fotográficas a partir de las actividades, igual que en un informe nuevo.
const crearBorradorAutomatico = (fecha: string, letra: 'A' | 'B', turno: 'dia' | 'noche'): BorradorEntry => {
  const creador = getCreadorPorDefecto(letra);
  return {
    id: idBorradorAutomatico(fecha, letra, turno),
    turno,
    fecha,
    faena: 'Minera Rajo Inca',
    letraTurno: letra,
    contrato: '4600027858',
    version: '1.1',
    servicio: 'SERVICIO DE IMPLEMENTACIÓN Y CONTINUIDAD OPERACIONAL DE RED INALAMBRICA LTE-DSAL',
    creadoNombre: creador.nombre,
    creadoCargo: creador.cargo,
    revisadoText: 'Juan Morata\nJuan Saavedra',
    autorizadoNombre: 'Cesar Orellana',
    autorizadoCargo: 'ADC',
    personal: getPersonalGuardado(letra),
    actividades: getActividadesGuardadas(turno),
    observaciones: [],
    evidenceBlocks: [],
    vertivCarroPhotos: VERTIV_CARROS_FLAT.map(() => null),
    vertivItemPhotos: VERTIV_ITEMS.map(() => null),
    savedAt: savedAtSemilla(fecha),
  };
};

// Toma el ciclo de turnos de hoy (los 7 días del Turno A + los 7 días del Turno B) y crea en la nube
// los borradores que aún no existan. Corre una vez por ciclo en cada dispositivo (así, si alguien
// elimina uno a propósito, no reaparece) y nunca pisa un borrador ya creado.
const sembrarInformesDelCiclo = async (): Promise<boolean> => {
  const ciclo = cicloDeFecha(hoyLocalISO());
  const marcaKey = `${LS_KEY_AUTO_CICLO}_${ciclo.A.inicio}_${TURNOS_AUTOMATICOS.join('-')}`;
  if (localStorage.getItem(marcaKey)) return false;

  const existentes = await fetchBorradores();
  const claves = new Set(existentes.map(e => `${e.fecha}|${e.letraTurno}|${e.turno}`));
  const nuevos: BorradorEntry[] = [];
  [ciclo.A, ciclo.B].forEach(semana => {
    semana.dias.forEach(fecha => {
      TURNOS_AUTOMATICOS.forEach(turno => {
        if (!claves.has(`${fecha}|${semana.letra}|${turno}`)) nuevos.push(crearBorradorAutomatico(fecha, semana.letra, turno));
      });
    });
  });

  await sembrarBorradores(nuevos);
  localStorage.setItem(marcaKey, '1');
  return nuevos.length > 0;
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const DECORACIONES_MENSUALES: Record<number, { source: string; label: string; message: string }> = {
  9: { source: decoracionSeptiembre, label: "Decoración de Fiestas Patrias", message: "¡Feliz 18 de septiembre!" },
  10: { source: decoracionOctubre, label: "Decoración de Halloween", message: "¡Feliz Halloween!" },
  12: { source: decoracionDiciembre, label: "Decoración navideña", message: "¡Feliz Navidad!" },
};

const formatFechaEvidencia = (iso: string) => {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return `${String(day).padStart(2, "0")} de ${MESES[month - 1]} de ${year}`;
};

// Helper para convertir rutas o URLs a DataURL Base64
const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function App() {
  // Estados de datos generales
  const [turno, setTurno] = useState<'dia' | 'noche'>('dia');
  const [fecha, setFecha] = useState<string>(hoyLocalISO());
  const [faena, setFaena] = useState<string>('Minera Rajo Inca');
  const [letraTurno, setLetraTurno] = useState<string>('A');
  const [contrato, setContrato] = useState<string>('4600027858');
  const [version, setVersion] = useState<string>('1.1');
  const [servicio, setServicio] = useState<string>('SERVICIO DE IMPLEMENTACIÓN Y CONTINUIDAD OPERACIONAL DE RED INALAMBRICA LTE-DSAL');
  const [creadoNombre, setCreadoNombre] = useState<string>('Max Diaz Cornejo');
  const [creadoCargo, setCreadoCargo] = useState<string>('Supervisor');
  const [revisadoText, setRevisadoText] = useState<string>('Juan Morata\nJuan Saavedra');
  const [autorizadoNombre, setAutorizadoNombre] = useState<string>('Cesar Orellana');
  const [autorizadoCargo, setAutorizadoCargo] = useState<string>('ADC');

  // Imagen / Logos
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  // Listados principales
  const [personal, setPersonal] = useState<PersonalItem[]>([]);
  const [actividades, setActividades] = useState<string[]>([]);
  const [observaciones, setObservaciones] = useState<string[]>([]);
  const [evidenceBlocks, setEvidenceBlocks] = useState<EvidenceBlock[]>([]);
  // Evidencia fotográfica del bloque fijo "Verificación de la Gestión en Planta Rectificadora Vertiv" (solo Turno Noche).
  // Cada Carro y cada ítem de monitoreo tiene su propia foto, igual que en la plantilla de referencia.
  const [vertivCarroPhotos, setVertivCarroPhotos] = useState<(string | null)[]>(() => VERTIV_CARROS_FLAT.map(() => null));
  const [vertivItemPhotos, setVertivItemPhotos] = useState<(string | null)[]>(() => VERTIV_ITEMS.map(() => null));
  
  // UI States
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [selectedPersonalSugerido, setSelectedPersonalSugerido] = useState<string>('');
  const [selectedActividadSugerida, setSelectedActividadSugerida] = useState<string>('');
  const [genericCounter, setGenericCounter] = useState<number>(0);
  const [selectedEvidenceSlot, setSelectedEvidenceSlot] = useState<{ blockIndex: number; photoIndex: number } | null>(null);
  const selectedEvidenceSlotRef = useRef<{ blockIndex: number; photoIndex: number } | null>(null);
  const [selectedVertivSlot, setSelectedVertivSlot] = useState<{ type: 'carro' | 'item'; index: number } | null>(null);
  const [scannerTarget, setScannerTarget] = useState<ScannerTarget | null>(null);
  const [scannerPreview, setScannerPreview] = useState<string | null>(null);
  const [scannerMessage, setScannerMessage] = useState('Apunta al documento completo y captura la imagen.');
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerCanvasRef = useRef<HTMLCanvasElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const [draftPromptOpen, setDraftPromptOpen] = useState(false);
  const [photoRemovalRequest, setPhotoRemovalRequest] = useState<{ blockIndex: number; photoIndex: number } | null>(null);
  const draftDecisionMadeRef = useRef(false);

  // Navegación del panel: menú principal, generador diario, borradores guardados e informe de cierre semanal.
  const [view, setView] = useState<'dashboard' | 'diario' | 'borradores' | 'cierre'>('dashboard');
  const [borradores, setBorradores] = useState<BorradorEntry[]>([]);
  const [currentDraftId, setCurrentDraftId] = useState<string>(() => crypto.randomUUID());

  // Carga los borradores compartidos desde la nube y se suscribe a cambios de otros dispositivos.
  useEffect(() => {
    void fetchBorradores().then(setBorradores);
    return subscribeBorradores(setBorradores);
  }, []);

  // Crea automáticamente los informes que le corresponde hacer a cada turno (7 días del A + 7 días del B).
  useEffect(() => {
    sembrarInformesDelCiclo()
      .then(huboNuevos => { if (huboNuevos) void fetchBorradores().then(setBorradores); })
      .catch(error => console.error("No se pudieron generar los informes automáticos del turno:", error));
  }, []);

  // Carga inicial y conversión de imágenes por defecto
  useEffect(() => {
    try {
      const rawPersonal = localStorage.getItem(LS_KEY_PERSONAL);
      setPersonal(rawPersonal ? JSON.parse(rawPersonal) : DEFAULT_PERSONAL);
    } catch {
      setPersonal(DEFAULT_PERSONAL);
    }

    // El turno inicial es 'dia', así que cargamos su plantilla de actividades correspondiente.
    try {
      const rawActDia = localStorage.getItem(LS_KEY_ACT_DIA);
      setActividades(rawActDia ? ensureActividadesDiaPermanentes(JSON.parse(rawActDia)) : DEFAULT_ACTIVIDADES_DIA);
    } catch {
      setActividades(DEFAULT_ACTIVIDADES_DIA);
    }

    // Cargar o inicializar Logo y Portada predeterminados
    const initImages = async () => {
      try {
        const storedLogo = localStorage.getItem("psinet_logo_v2");
        if (storedLogo) {
          setLogoDataUrl(storedLogo);
        } else {
          const logoBase64 = await urlToBase64(logoPsinet);
          setLogoDataUrl(logoBase64);
        }

        const storedCover = localStorage.getItem("psinet_cover_v2");
        if (storedCover) {
          setCoverDataUrl(storedCover);
        } else {
          const coverBase64 = await urlToBase64(logoEdificio);
          setCoverDataUrl(coverBase64);
        }
      } catch (err) {
        console.error("Error al cargar las imágenes de marca:", err);
      }
    };

    initImages();
    try {
      const rawDraft = localStorage.getItem(LS_KEY_DRAFT);
      const draft = rawDraft ? JSON.parse(rawDraft) : null;
      const hasEvidenceImages = Boolean(
        draft?.evidenceBlocks?.some((block: EvidenceBlock) => block.photos?.some(Boolean))
        || draft?.vertivCarroPhotos?.some(Boolean)
        || draft?.vertivItemPhotos?.some(Boolean)
      );
      if (hasEvidenceImages) {
        setDraftPromptOpen(true);
      } else {
        draftDecisionMadeRef.current = true;
      }
    } catch (error) {
      console.error("No se pudo comprobar el contenido del borrador:", error);
      draftDecisionMadeRef.current = true;
    }
  }, []);

  const continueDraft = () => {
    try {
      const rawDraft = localStorage.getItem(LS_KEY_DRAFT);
      if (!rawDraft) return startNewReport();
      const draft = JSON.parse(rawDraft);
      if (draft.turno === 'dia' || draft.turno === 'noche') setTurno(draft.turno);
      if (typeof draft.fecha === 'string') setFecha(draft.fecha);
      if (typeof draft.faena === 'string') setFaena(draft.faena);
      if (typeof draft.letraTurno === 'string') setLetraTurno(draft.letraTurno);
      if (typeof draft.contrato === 'string') setContrato(draft.contrato);
      if (typeof draft.version === 'string') setVersion(draft.version);
      if (typeof draft.servicio === 'string') setServicio(draft.servicio);
      if (typeof draft.creadoNombre === 'string') setCreadoNombre(draft.creadoNombre);
      if (typeof draft.creadoCargo === 'string') setCreadoCargo(draft.creadoCargo);
      if (typeof draft.revisadoText === 'string') setRevisadoText(draft.revisadoText);
      if (typeof draft.autorizadoNombre === 'string') setAutorizadoNombre(draft.autorizadoNombre);
      if (typeof draft.autorizadoCargo === 'string') setAutorizadoCargo(draft.autorizadoCargo);
      if (Array.isArray(draft.personal)) setPersonal(draft.personal);
      if (Array.isArray(draft.actividades)) setActividades(draft.actividades);
      if (Array.isArray(draft.observaciones)) setObservaciones(draft.observaciones);
      if (Array.isArray(draft.evidenceBlocks)) setEvidenceBlocks(draft.evidenceBlocks);
      if (Array.isArray(draft.vertivCarroPhotos)) setVertivCarroPhotos(draft.vertivCarroPhotos);
      if (Array.isArray(draft.vertivItemPhotos)) setVertivItemPhotos(draft.vertivItemPhotos);
    } catch (error) {
      console.error("No se pudo restaurar el borrador:", error);
    }
    draftDecisionMadeRef.current = true;
    setDraftPromptOpen(false);
  };

  function startNewReport() {
    localStorage.removeItem(LS_KEY_DRAFT);
    // El informe nuevo parte con el turno (A o B) que corresponde hoy según el calendario 7x7.
    const hoy = hoyLocalISO();
    const letraHoy = letraDeFecha(hoy);
    const creador = getCreadorPorDefecto(letraHoy);
    setTurno('dia');
    setFecha(hoy);
    setFaena('Minera Rajo Inca');
    setLetraTurno(letraHoy);
    setContrato('4600027858');
    setVersion('1.1');
    setServicio('SERVICIO DE IMPLEMENTACIÓN Y CONTINUIDAD OPERACIONAL DE RED INALAMBRICA LTE-DSAL');
    setCreadoNombre(creador.nombre);
    setCreadoCargo(creador.cargo);
    setRevisadoText('Juan Morata\nJuan Saavedra');
    setAutorizadoNombre('Cesar Orellana');
    setAutorizadoCargo('ADC');
    setPersonal(getPersonalGuardado(letraHoy));
    setActividades(DEFAULT_ACTIVIDADES_DIA);
    setObservaciones([]);
    setEvidenceBlocks([]);
    setVertivCarroPhotos(VERTIV_CARROS_FLAT.map(() => null));
    setVertivItemPhotos(VERTIV_ITEMS.map(() => null));
    draftDecisionMadeRef.current = true;
    setDraftPromptOpen(false);
  }

  useEffect(() => {
    // Solo autoguardamos mientras el usuario está efectivamente en la pantalla
    // de "Generar Informe Diario"; si no, esto se dispara con datos por defecto
    // apenas se abre la app (aunque el usuario esté en el Dashboard) y termina
    // creando un borrador nuevo en cada recarga.
    if (view !== 'diario' || !draftDecisionMadeRef.current || !personal.length || !actividades.length) return;

    try {
      localStorage.setItem(LS_KEY_DRAFT, JSON.stringify({
        turno,
        fecha,
        faena,
        letraTurno,
        contrato,
        version,
        servicio,
        creadoNombre,
        creadoCargo,
        revisadoText,
        autorizadoNombre,
        autorizadoCargo,
        personal,
        actividades,
        observaciones,
        evidenceBlocks,
        vertivCarroPhotos,
        vertivItemPhotos,
        savedAt: new Date().toISOString(),
      }));
    } catch (error) {
      console.error("No se pudo guardar el borrador:", error);
    }
  }, [
    turno,
    fecha,
    faena,
    letraTurno,
    contrato,
    version,
    servicio,
    creadoNombre,
    creadoCargo,
    revisadoText,
    autorizadoNombre,
    autorizadoCargo,
    personal,
    actividades,
    observaciones,
    evidenceBlocks,
    vertivCarroPhotos,
    vertivItemPhotos,
    view,
  ]);

  // Guarda/actualiza el borrador actual en la nube (compartido con todos los dispositivos), con un pequeño debounce.
  // Igual que arriba: solo mientras el usuario está en la pantalla de Informe Diario,
  // para no crear/subir un borrador nuevo apenas se abre la app.
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (view !== 'diario' || !draftDecisionMadeRef.current || !personal.length || !actividades.length) return;

    const entry: BorradorEntry = {
      id: currentDraftId,
      turno,
      fecha,
      faena,
      letraTurno,
      contrato,
      version,
      servicio,
      creadoNombre,
      creadoCargo,
      revisadoText,
      autorizadoNombre,
      autorizadoCargo,
      personal,
      actividades,
      observaciones,
      evidenceBlocks,
      vertivCarroPhotos,
      vertivItemPhotos,
      savedAt: new Date().toISOString(),
    };

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      upsertBorrador(entry)
        .then(saved => setBorradores(prev => {
          const idx = prev.findIndex(b => b.id === saved.id);
          if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
          return [...prev, saved];
        }))
        .catch(error => {
          console.error("No se pudo sincronizar el borrador con la nube:", error);
          showToast("No se pudo sincronizar con la nube. Revisa tu conexión.", true);
        });
    }, 800);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [
    currentDraftId,
    turno,
    fecha,
    faena,
    letraTurno,
    contrato,
    version,
    servicio,
    creadoNombre,
    creadoCargo,
    revisadoText,
    autorizadoNombre,
    autorizadoCargo,
    personal,
    actividades,
    observaciones,
    evidenceBlocks,
    vertivCarroPhotos,
    vertivItemPhotos,
    view,
  ]);

  // Navegación: entra a "Generar Informe Diario" comenzando desde cero, con un nuevo borrador.
  const goToNewInforme = () => {
    startNewReport();
    setCurrentDraftId(crypto.randomUUID());
    setView('diario');
  };

  // Navegación: abre un borrador existente (de otro día) para revisarlo o continuarlo.
  const openBorradorEntry = (entrySeleccionada: BorradorEntry) => {
    setTurno(entrySeleccionada.turno);
    setFecha(entrySeleccionada.fecha);
    setFaena(entrySeleccionada.faena);
    setLetraTurno(entrySeleccionada.letraTurno);
    setContrato(entrySeleccionada.contrato);
    setVersion(entrySeleccionada.version);
    setServicio(entrySeleccionada.servicio);
    setCreadoNombre(entrySeleccionada.creadoNombre);
    setCreadoCargo(entrySeleccionada.creadoCargo);
    setRevisadoText(entrySeleccionada.revisadoText);
    setAutorizadoNombre(entrySeleccionada.autorizadoNombre);
    setAutorizadoCargo(entrySeleccionada.autorizadoCargo);
    setPersonal(entrySeleccionada.personal);
    setActividades(entrySeleccionada.actividades);
    setObservaciones(entrySeleccionada.observaciones);
    setEvidenceBlocks(entrySeleccionada.evidenceBlocks as EvidenceBlock[]);
    setVertivCarroPhotos(entrySeleccionada.vertivCarroPhotos);
    setVertivItemPhotos(entrySeleccionada.vertivItemPhotos);
    setCurrentDraftId(entrySeleccionada.id);
    draftDecisionMadeRef.current = true;
    setDraftPromptOpen(false);
    setView('diario');
  };

  // "Generar Informe Diario": si ya existe el informe de hoy para el turno que corresponde (creado
  // automáticamente o a mano), lo abre; si no, parte uno nuevo.
  const goToInformeDeHoy = () => {
    const hoy = hoyLocalISO();
    const letraHoy = letraDeFecha(hoy);
    const deHoy = borradores
      .filter(b => b.fecha === hoy && b.letraTurno === letraHoy)
      .sort((a, b) => (a.turno === b.turno ? 0 : a.turno === 'dia' ? -1 : 1));
    if (deHoy.length) openBorradorEntry(deHoy[0]);
    else goToNewInforme();
  };

  const handleDeleteBorrador = (id: string) => {
    setBorradores(prev => prev.filter(b => b.id !== id));
    deleteBorrador(id).catch(error => {
      console.error("No se pudo eliminar el borrador en la nube:", error);
      showToast("No se pudo eliminar el borrador en la nube.", true);
    });
  };


  // En turno Noche la evidencia fotográfica usa una plantilla fija independiente.
  useEffect(() => {
    setEvidenceBlocks(prevBlocks => {
      const mantenimientoTitle = `Registro de mantenimiento de GG. (${formatFechaEvidencia(fecha)})`;
      const existingMantenimiento = prevBlocks.find(block => block.isFixed && block.title.startsWith("Registro de mantenimiento de GG."));
      const mantenimientoBlock: EvidenceBlock = existingMantenimiento
        ? { ...existingMantenimiento, title: mantenimientoTitle }
        : {
            id: "evidence_mantenimiento_gg",
            title: mantenimientoTitle,
            photoCount: 1,
            photos: [null],
            isActivity: false,
            isFixed: true,
          };

      if (turno === 'noche') {
        const fixedBlocks = DEFAULT_EVIDENCIAS_NOCHE.map((title, index) => {
          const existing = prevBlocks.find(block => block.isFixed && block.title === title);
          return existing ?? {
            id: `evidence_noche_${index}`,
            title,
            photoCount: 1,
            photos: [null],
            isActivity: false,
            isFixed: true,
          };
        });

        const extraActivityBlocks = actividades
          .map((actText, index) => ({ actText, index }))
          .filter(({ actText }) => actText.trim() && !DEFAULT_ACTIVIDADES_NOCHE.includes(actText))
          .map(({ actText, index }) => {
            const existing = prevBlocks.find(block => block.isActivity && block.title === actText)
              ?? prevBlocks.find(block => block.isActivity && block.actIndex === index);
            return existing
              ? { ...existing, title: actText, actIndex: index }
              : {
                  id: `act_noche_${Date.now()}__${index}`,
                  title: actText,
                  photoCount: 1,
                  photos: [null],
                  isActivity: true,
                  actIndex: index,
                };
          });

        return [...fixedBlocks, ...extraActivityBlocks];
      }

      const newBlocks: EvidenceBlock[] = [];
      actividades.forEach((actText, idx) => {
        if (EVIDENCIAS_EXCLUIDAS_DIA.has(actText)) return;
        const existing = prevBlocks.find(b => b.isActivity && b.title === actText)
          ?? prevBlocks.find(b => b.isActivity && b.actIndex === idx);
        if (existing) {
          newBlocks.push({ ...existing, title: actText, actIndex: idx });
        } else {
          newBlocks.push({
            id: `act_${Date.now()}__${idx}`,
            title: actText,
            photoCount: 1,
            photos: [null],
            isActivity: true,
            actIndex: idx
          });
        }
      });

      prevBlocks.filter(b => !b.isActivity && !b.isFixed).forEach(b => newBlocks.push(b));
      newBlocks.push(mantenimientoBlock);
      return newBlocks;
    });
  }, [actividades, fecha, turno]);

  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const persistPersonal = (newPersonal: PersonalItem[]) => {
    try {
      localStorage.setItem(lsKeyPersonal(letraTurno), JSON.stringify(newPersonal));
    } catch (e) { console.error(e); }
  };

  // Guarda la lista de actividades bajo la clave del turno indicado (por defecto, el turno actual)
  const persistActividades = (newActividades: string[], forTurno: 'dia' | 'noche' = turno) => {
    try {
      const key = forTurno === 'dia' ? LS_KEY_ACT_DIA : LS_KEY_ACT_NOCHE;
      localStorage.setItem(key, JSON.stringify(newActividades));
    } catch (e) { console.error(e); }
  };

  // Cambia de turno guardando la plantilla de actividades actual y cargando la del nuevo turno.
  // Día y Noche mantienen listas de Actividades Diarias independientes y permanentes.
  const handleTurnoChange = (newTurno: 'dia' | 'noche') => {
    if (newTurno === turno) return;
    persistActividades(actividades, turno);

    let nextActividades: string[];
    try {
      const key = newTurno === 'dia' ? LS_KEY_ACT_DIA : LS_KEY_ACT_NOCHE;
      const raw = localStorage.getItem(key);
      nextActividades = raw
        ? (newTurno === 'dia' ? ensureActividadesDiaPermanentes(JSON.parse(raw)) : JSON.parse(raw))
        : (newTurno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE);
    } catch {
      nextActividades = newTurno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE;
    }

    setActividades(nextActividades);
    setTurno(newTurno);
  };

  // Cambia entre Turno A y Turno B: carga la lista de personal guardada de ese turno
  // (o la lista por defecto si aún no se ha editado). Las ediciones ya se guardan al instante por letra.
  const handleLetraTurnoChange = (nuevaLetra: string) => {
    if (nuevaLetra === letraTurno) return;

    let nextPersonal: PersonalItem[];
    try {
      const raw = localStorage.getItem(lsKeyPersonal(nuevaLetra));
      nextPersonal = raw ? JSON.parse(raw) : getDefaultPersonal(nuevaLetra);
    } catch {
      nextPersonal = getDefaultPersonal(nuevaLetra);
    }
    setPersonal(nextPersonal);
    setLetraTurno(nuevaLetra);
  };

  // Handlers para Personal
  const handleAddPersonal = (nombre = '', cargo = '') => {
    const updated = [...personal, { nombre, cargo }];
    setPersonal(updated);
    persistPersonal(updated);
  };

  const handleRemovePersonal = (index: number) => {
    const updated = personal.filter((_, i) => i !== index);
    setPersonal(updated);
    persistPersonal(updated);
  };

  const handleUpdatePersonal = (index: number, field: 'nombre' | 'cargo', value: string) => {
    const updated = personal.map((item, i) => i === index ? { ...item, [field]: value } : item);
    setPersonal(updated);
    persistPersonal(updated);
  };

  const resetPersonal = () => {
    if (window.confirm(`¿Deseas restaurar la lista de personal por defecto del Turno ${letraTurno}?`)) {
      const defaults = getDefaultPersonal(letraTurno);
      setPersonal(defaults);
      persistPersonal(defaults);
      showToast("Lista de personal restaurada.");
    }
  };

  // Handlers para Actividades (la plantilla es independiente y permanente por turno: Día y Noche no se mezclan)
  const handleAddActividad = (text: string) => {
    const updated = [...actividades, text];
    setActividades(updated);
    persistActividades(updated);
  };

  const handleUpdateActividad = (index: number, value: string) => {
    const updated = actividades.map((act, i) => i === index ? value : act);
    setActividades(updated);
    persistActividades(updated);
  };

  const handleRemoveActividad = (index: number) => {
    const updated = actividades.filter((_, i) => i !== index);
    setActividades(updated);
    persistActividades(updated);
  };

  const handleMoveActividad = (index: number, direction: -1 | 1) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= actividades.length) return;

    const updated = [...actividades];
    [updated[index], updated[targetIndex]] = [updated[targetIndex], updated[index]];
    setActividades(updated);
    persistActividades(updated);
  };

  const resetActividades = () => {
    const defaults = turno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE;
    const label = turno === 'dia' ? 'Turno Día' : 'Turno Noche';
    if (window.confirm(`¿Deseas restaurar la lista de actividades por defecto de ${label}?`)) {
      setActividades(defaults);
      persistActividades(defaults);
      showToast("Lista de actividades restaurada.");
    }
  };

  // Handlers Evidencias
  const assignFileToSlot = (file: File, blockIndex: number, photoIndex: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const sourceImage = reader.result as string;
      setEvidenceBlocks(prev => prev.map((b, bi) => {
        if (bi !== blockIndex) return b;
        const newPhotos = [...b.photos];
        newPhotos[photoIndex] = sourceImage;
        return { ...b, photos: newPhotos };
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddPhotoSlot = (blockIndex: number) => {
    setEvidenceBlocks(prev => prev.map((b, i) => i === blockIndex ? {
      ...b,
      photoCount: b.photoCount + 1,
      photos: [...b.photos, null]
    } : b));
  };

  const handleRemovePhotoSlot = (blockIndex: number, photoIndex: number) => {
    setEvidenceBlocks(prev => prev.flatMap((block, bi) => {
      if (bi !== blockIndex) return [block];

      const photos = block.photos.filter((_, pi) => pi !== photoIndex);
      if (photos.length === 0) return [];
      return [{ ...block, photoCount: photos.length, photos }];
    }));
  };

  const requestRemovePhotoSlot = (blockIndex: number, photoIndex: number) => {
    const block = evidenceBlocks[blockIndex];
    if (block?.photos.length === 1) {
      setPhotoRemovalRequest({ blockIndex, photoIndex });
      return;
    }
    handleRemovePhotoSlot(blockIndex, photoIndex);
  };

  const confirmRemovePhotoSlot = () => {
    if (!photoRemovalRequest) return;
    handleRemovePhotoSlot(photoRemovalRequest.blockIndex, photoRemovalRequest.photoIndex);
    setPhotoRemovalRequest(null);
  };

  // Handlers de fotos para el bloque fijo Vertiv: una foto por Carro y una por ítem de monitoreo.
  const assignVertivCarroPhoto = (file: File, idx: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const scannedImage = await scanDocumentPerspective(reader.result as string);
      setVertivCarroPhotos(prev => {
        const updated = [...prev];
        updated[idx] = scannedImage;
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const clearVertivCarroPhoto = (idx: number) => {
    setVertivCarroPhotos(prev => {
      const updated = [...prev];
      updated[idx] = null;
      return updated;
    });
  };

  const handleSelectEvidenceSlot = (blockIndex: number, photoIndex: number) => {
    const slot = { blockIndex, photoIndex };
    selectedEvidenceSlotRef.current = slot;
    setSelectedEvidenceSlot(slot);
    setSelectedVertivSlot(null);
  };

  const clearSelectedEvidenceSlot = () => {
    selectedEvidenceSlotRef.current = null;
    setSelectedEvidenceSlot(null);
  };

  const handleSelectVertivSlot = (type: 'carro' | 'item', index: number) => {
    selectedEvidenceSlotRef.current = null;
    setSelectedVertivSlot({ type, index });
    setSelectedEvidenceSlot(null);
  };

  const assignEvidenceFromClipboard = (file: File, slot: { blockIndex: number; photoIndex: number }) => {
    assignFileToSlot(file, slot.blockIndex, slot.photoIndex);
  };

  const handlePaste = (e: { clipboardData: DataTransfer | null; preventDefault: () => void }) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    const activeEvidenceSlot = selectedEvidenceSlotRef.current;
    if (!activeEvidenceSlot && !selectedVertivSlot && (activeTag === 'input' || activeTag === 'textarea')) return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    let imgIdx = 0;
    const updatedBlocks = [...evidenceBlocks];

    const assignEvidenceFrom = (startBlockIndex = 0, startPhotoIndex = 0) => {
      for (let bi = startBlockIndex; bi < updatedBlocks.length && imgIdx < imageFiles.length; bi++) {
        const firstPhotoIndex = bi === startBlockIndex ? startPhotoIndex : 0;
        for (let pi = firstPhotoIndex; pi < updatedBlocks[bi].photoCount && imgIdx < imageFiles.length; pi++) {
          if (!updatedBlocks[bi].photos[pi]) {
            assignFileToSlot(imageFiles[imgIdx], bi, pi);
            imgIdx++;
          }
        }
      }
    };

    const assignVertivFrom = (type: 'carro' | 'item', index: number) => {
      if (type === 'carro') {
        for (let pi = index; pi < vertivCarroPhotos.length && imgIdx < imageFiles.length; pi++) {
          if (!vertivCarroPhotos[pi]) {
            assignVertivCarroPhoto(imageFiles[imgIdx], pi);
            imgIdx++;
          }
        }
        for (let pi = 0; pi < vertivItemPhotos.length && imgIdx < imageFiles.length; pi++) {
          if (!vertivItemPhotos[pi]) {
            assignVertivItemPhoto(imageFiles[imgIdx], pi);
            imgIdx++;
          }
        }
      } else {
        for (let pi = index; pi < vertivItemPhotos.length && imgIdx < imageFiles.length; pi++) {
          if (!vertivItemPhotos[pi]) {
            assignVertivItemPhoto(imageFiles[imgIdx], pi);
            imgIdx++;
          }
        }
      }
    };

    if (activeEvidenceSlot) {
      assignEvidenceFromClipboard(imageFiles[imgIdx], activeEvidenceSlot);
      imgIdx++;
      assignEvidenceFrom(activeEvidenceSlot.blockIndex, activeEvidenceSlot.photoIndex + 1);
      clearSelectedEvidenceSlot();
    } else if (selectedVertivSlot) {
      const { type, index } = selectedVertivSlot;
      assignVertivFrom(type, index);

      if (type === 'carro') {
        setSelectedVertivSlot(
          index + 1 < vertivCarroPhotos.length
            ? { type: 'carro', index: index + 1 }
            : { type: 'item', index: 0 }
        );
      } else if (index + 1 < vertivItemPhotos.length) {
        setSelectedVertivSlot({ type: 'item', index: index + 1 });
      } else {
        setSelectedVertivSlot(null);
      }
    } else {
      assignEvidenceFrom();
      if (turno === 'noche' && imgIdx < imageFiles.length) {
        assignVertivFrom('carro', 0);
      }
    }

    if (imgIdx < imageFiles.length) {
      showToast("Imagen pegada desde el portapapeles.");
    }
  };

  useEffect(() => {
    const handleDocumentPaste = (event: globalThis.ClipboardEvent) => {
      handlePaste(event);
    };

    document.addEventListener('paste', handleDocumentPaste);
    return () => document.removeEventListener('paste', handleDocumentPaste);
  });

  const assignVertivItemPhoto = (file: File, idx: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const scannedImage = await scanDocumentPerspective(reader.result as string);
      setVertivItemPhotos(prev => {
        const updated = [...prev];
        updated[idx] = scannedImage;
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const clearVertivItemPhoto = (idx: number) => {
    setVertivItemPhotos(prev => {
      const updated = [...prev];
      updated[idx] = null;
      return updated;
    });
  };

  const stopScannerCamera = () => {
    scannerStreamRef.current?.getTracks().forEach(track => track.stop());
    scannerStreamRef.current = null;
  };

  useEffect(() => {
    if (!scannerTarget) {
      stopScannerCamera();
      return;
    }

    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setScannerMessage('Este navegador no permite usar la cámara.');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        scannerStreamRef.current = stream;
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream;
          void scannerVideoRef.current.play();
        }
      })
      .catch(() => setScannerMessage('No se pudo abrir la cámara. Revisa los permisos del navegador.'));

    return () => {
      cancelled = true;
      stopScannerCamera();
    };
  }, [scannerTarget]);

  const openDocumentScanner = (target: ScannerTarget) => {
    setScannerTarget(target);
    setScannerPreview(null);
    setScannerMessage('Apunta al documento completo y captura la imagen.');
  };

  const closeDocumentScanner = () => {
    stopScannerCamera();
    setScannerTarget(null);
    setScannerPreview(null);
  };

  const scanDocumentPerspective = async (sourceDataUrl: string) => {
    try {
      const image = new Image();
      image.src = sourceDataUrl;
      await image.decode();

      const sourceCanvas = document.createElement('canvas');
      sourceCanvas.width = image.naturalWidth;
      sourceCanvas.height = image.naturalHeight;
      sourceCanvas.getContext('2d')?.drawImage(image, 0, 0);

      const cvModule = await import('@techstark/opencv-js');
      const exportedOpenCv = (cvModule as unknown as { default?: unknown }).default ?? cvModule;
      const cv = await (exportedOpenCv as Promise<CvApi>);
      if (!cv.Mat || !cv.imread) return sourceDataUrl;

      const source = cv.imread(sourceCanvas);
      const gray = new cv.Mat();
      const blurred = new cv.Mat();
      const edges = new cv.Mat();
      const thresholded = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
      cv.Canny(blurred, edges, 75, 200);
      let best: CvMat | null = null;
      let bestArea = 0;
      const inspectContours = (image: CvMat, mode: number) => {
        cv.findContours(image, contours, hierarchy, mode, cv.CHAIN_APPROX_SIMPLE);
        for (let index = 0; index < contours.size(); index += 1) {
          const contour = contours.get(index);
          const perimeter = cv.arcLength(contour, true);
          const approximation = new cv.Mat();
          cv.approxPolyDP(contour, approximation, 0.02 * perimeter, true);
          const area = Math.abs(cv.contourArea(approximation));
          if (approximation.rows === 4 && area > bestArea && area > source.cols * source.rows * 0.08) {
            best?.delete();
            best = approximation;
            bestArea = area;
          } else {
            approximation.delete();
          }
          contour.delete();
        }
      };

      inspectContours(edges, cv.RETR_LIST);
      if (!best) {
        cv.threshold(gray, thresholded, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
        inspectContours(thresholded, cv.RETR_EXTERNAL);
      }

      if (!best) {
        source.delete(); gray.delete(); blurred.delete(); edges.delete(); thresholded.delete(); contours.delete(); hierarchy.delete();
        return sourceDataUrl;
      }

      const selectedContour = best as CvMat;
      const points = Array.from(selectedContour.data32S) as number[];
      const corners: { x: number; y: number }[] = [
        { x: points[0], y: points[1] },
        { x: points[2], y: points[3] },
        { x: points[4], y: points[5] },
        { x: points[6], y: points[7] },
      ];
      const topLeft = corners.reduce((a, b) => a.x + a.y < b.x + b.y ? a : b);
      const bottomRight = corners.reduce((a, b) => a.x + a.y > b.x + b.y ? a : b);
      const topRight = corners.reduce((a, b) => a.x - a.y > b.x - b.y ? a : b);
      const bottomLeft = corners.reduce((a, b) => a.x - a.y < b.x - b.y ? a : b);
      const width = Math.max(Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y), Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y));
      const height = Math.max(Math.hypot(topRight.x - bottomRight.x, topRight.y - bottomRight.y), Math.hypot(topLeft.x - bottomLeft.x, topLeft.y - bottomLeft.y));
      const destination = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);
      const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [topLeft.x, topLeft.y, topRight.x, topRight.y, bottomRight.x, bottomRight.y, bottomLeft.x, bottomLeft.y]);
      const transform = cv.getPerspectiveTransform(sourcePoints, destination);
      const warped = new cv.Mat();
      cv.warpPerspective(source, warped, transform, new cv.Size(width, height));
      cv.imshow(sourceCanvas, warped);
      const result = sourceCanvas.toDataURL('image/jpeg', 0.92);

      selectedContour.delete(); source.delete(); gray.delete(); blurred.delete(); edges.delete(); thresholded.delete(); contours.delete(); hierarchy.delete();
      destination.delete(); sourcePoints.delete(); transform.delete(); warped.delete();
      return result;
    } catch {
      return sourceDataUrl;
    }
  };

  const captureDocument = async () => {
    const video = scannerVideoRef.current;
    const canvas = scannerCanvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setScannerMessage('Detectando bordes y corrigiendo perspectiva...');
    const scannedImage = await scanDocumentPerspective(canvas.toDataURL('image/jpeg', 0.92));
    setScannerPreview(scannedImage);
    setScannerMessage('Revisa la captura. Puedes confirmarla o tomar otra.');
  };

  const confirmScannedDocument = () => {
    if (!scannerTarget || !scannerPreview) return;
    if (scannerTarget.type === 'evidence') {
      setEvidenceBlocks(prev => prev.map((block, blockIndex) => {
        if (blockIndex !== scannerTarget.blockIndex) return block;
        const photos = [...block.photos];
        photos[scannerTarget.photoIndex] = scannerPreview;
        return { ...block, photos };
      }));
    } else if (scannerTarget.type === 'vertivCarro') {
      setVertivCarroPhotos(prev => prev.map((photo, index) => index === scannerTarget.index ? scannerPreview : photo));
    } else {
      setVertivItemPhotos(prev => prev.map((photo, index) => index === scannerTarget.index ? scannerPreview : photo));
    }
    closeDocumentScanner();
  };

  const handleAddGenericBlock = () => {
    const count = genericCounter + 1;
    setGenericCounter(count);
    setEvidenceBlocks(prev => [
      ...prev,
      {
        id: `extra_${Date.now()}_${count}`,
        title: `Evidencia adicional ${count}`,
        photoCount: 1,
        photos: [null],
        isActivity: false
      }
    ]);
  };

  // Funciones de formato
  const formatFechaLarga = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} del ${y}`;
  };

  const formatFechaPortada = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} de ${MESES[m - 1]} ${y}`;
  };

  const dataUrlToUint8Array = (dataUrl: string) => {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  const orientEvidencePhoto = (dataUrl: string, rotation: -90 | 90 | 180): Promise<string> => {

    return new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const isPortrait = (rotation === -90 || rotation === 90) && image.naturalWidth < image.naturalHeight;
        canvas.width = isPortrait ? image.naturalHeight : image.naturalWidth;
        canvas.height = isPortrait ? image.naturalWidth : image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) {
          resolve(dataUrl);
          return;
        }

        if (rotation === 180) {
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate(Math.PI);
          context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        } else if (isPortrait) {
          context.translate(canvas.width / 2, canvas.height / 2);
          context.rotate(rotation === -90 ? -Math.PI / 2 : Math.PI / 2);
          context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
        } else {
          context.drawImage(image, 0, 0);
        }
        resolve(canvas.toDataURL('image/png'));
      };
      image.onerror = () => resolve(dataUrl);
      image.src = dataUrl;
    });
  };

  // Generador Word en React
  const generarDocumento = async () => {
    if (!fecha) {
      alert("Selecciona la fecha del turno.");
      return;
    }

    setIsGenerating(true);

    try {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, ImageRun, WidthType, BorderStyle, AlignmentType,
        HeadingLevel, VerticalAlign, TableLayoutType,
      } = docx;

      const cellBorders = (color?: string) => {
        const b = { style: BorderStyle.SINGLE, size: 4, color: color || "D9D9D9" };
        return { top: b, bottom: b, left: b, right: b };
      };
      
      const noBorders = () => {
        const n = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
      };

      const logoBytes = logoDataUrl ? dataUrlToUint8Array(logoDataUrl) : null;
      const logoType = logoDataUrl?.startsWith("data:image/png") ? "png" : "jpg";
      const coverBytes = coverDataUrl ? dataUrlToUint8Array(coverDataUrl) : null;
      const coverType = coverDataUrl?.startsWith("data:image/png") ? "png" : "jpg";
      const revisadoPor = revisadoText.split("\n").map(s => s.trim()).filter(Boolean);

      const headerCellMargins = { top: 160, bottom: 160, left: 220, right: 220 };

      const header = new Header({
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [2059, 4493, 2808],
            borders: cellBorders("000000"),
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 22, type: WidthType.PERCENTAGE },
                    rowSpan: 3,
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: logoBytes
                        ? [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 40 }, type: logoType })]
                        : [new TextRun({ text: "PSINet", bold: true, size: 24, font: "Arial" })],
                    })],
                  }),
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Reporte Diario", size: 20, font: "Arial", bold: true })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "N° Contrato:", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contrato, size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    rowSpan: 2,
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 280 }, children: [new TextRun({ text: servicio, size: 15, bold: true, font: "Arial" })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versión:  " + version, size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Fecha: " + formatFechaPortada(fecha), size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const coverLeftChildren: docx.Paragraph[] = [
        new Paragraph({
          children: logoBytes
            ? [new ImageRun({ data: logoBytes, transformation: { width: 200, height: 66 }, type: logoType })]
            : [new TextRun({ text: "PSINet", bold: true, size: 42, font: "Arial" })],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
      ];

      if (coverBytes) {
        coverLeftChildren.push(new Paragraph({
          children: [new ImageRun({ data: coverBytes, transformation: { width: 496, height: 372 }, type: coverType })],
        }));
      }

      coverLeftChildren.push(
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "REPORTE DIARIO", size: 66, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: turno === "dia" ? "TURNO DIA" : "TURNO NOCHE", size: 66, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "De Actividades", bold: true, size: 40, font: "Arial" })] })
      );

      const coverTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [7000, 2360],
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 7000, type: WidthType.DXA }, borders: noBorders(), children: coverLeftChildren }),
              new TableCell({
                width: { size: 2360, type: WidthType.DXA },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
                margins: { left: 300, top: 100, bottom: 100 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: formatFechaPortada(fecha), size: 40, font: "Arial", color: "000000" })] }),
                  new Paragraph({ children: [new TextRun({ text: "_______________________", size: 12, color: "CCCCCC" })] }),
                  new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: "Creado por:", size: 24, font: "Arial", color: "333333" })] }),
                  new Paragraph({ children: [new TextRun({ text: creadoNombre, size: 24, font: "Arial", bold: true })] }),
                  new Paragraph({ children: [new TextRun({ text: "Cargo: " + creadoCargo, size: 24, font: "Arial" })] }),
                  new Paragraph({ children: [new TextRun({ text: "_______________________", size: 12, color: "CCCCCC" })] }),
                  new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: "Revisado por:", size: 24, font: "Arial", color: "333333" })] }),
                  ...(revisadoPor.length ? revisadoPor.map(n => new Paragraph({ children: [new TextRun({ text: n, size: 24, font: "Arial", bold: true })] })) : [new Paragraph({ children: [new TextRun({ text: "—", size: 24, font: "Arial" })] })]),
                  new Paragraph({ children: [new TextRun({ text: "_______________________", size: 12, color: "CCCCCC" })] }),
                  new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: "Autorizado por:", size: 24, font: "Arial", color: "333333" })] }),
                  new Paragraph({ children: [new TextRun({ text: autorizadoNombre, size: 24, font: "Arial", bold: true })] }),
                  new Paragraph({ children: [new TextRun({ text: "Cargo: " + autorizadoCargo, size: 24, font: "Arial" })] }),
                ],
              })
            ]
          })
        ],
      });

      const descripcionParrafo = `Este documento detalla las actividades realizadas durante la jornada del ${formatFechaLarga(fecha)}, correspondientes al Turno ${letraTurno} en ${faena}.`;

      // Bloque fijo "Verificación de la Gestión en Planta Rectificadora Vertiv".
      // Solo se incluye si el turno es de NOCHE; en turno DÍA se omite por completo.
      // Formato igual a la plantilla de referencia:
      //  - Los 12 Carros van de a pares en una tabla continua: fila con las 2 imágenes, fila con las 2 leyendas.
      //  - Cada ítem de monitoreo va en su propia hoja: una imagen grande y, debajo, su leyenda en azul y negrita.
      const buildEvidenceImgParagraph = async (photo: string | null, width: number, height: number) => {
        if (!photo) {
          return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin evidencia cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] });
        }
        const { bytes, type } = await resolveImageBytes(photo);
        return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width, height }, type })] });
      };

      const carroTableRows: docx.TableRow[] = [];
      for (const [pairIdx, [leftTitle, rightTitle]] of VERTIV_CARROS.entries()) {
        const leftPhoto = vertivCarroPhotos[pairIdx * 2] ?? null;
        const rightPhoto = vertivCarroPhotos[pairIdx * 2 + 1] ?? null;

        carroTableRows.push(new TableRow({
          cantSplit: false,
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: cellBorders(),
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [await buildEvidenceImgParagraph(leftPhoto, 280, 190)],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: cellBorders(),
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [await buildEvidenceImgParagraph(rightPhoto, 280, 190)],
            }),
          ],
        }));

        carroTableRows.push(new TableRow({
          cantSplit: false,
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: cellBorders(),
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: leftTitle, bold: true, size: 22, font: "Arial" })] })],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: cellBorders(),
              margins: { top: 60, bottom: 60, left: 80, right: 80 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rightTitle, bold: true, size: 22, font: "Arial" })] })],
            }),
          ],
        }));
      }

      const itemPages: (docx.Paragraph | docx.Table)[] = [];
      for (const [idx, item] of VERTIV_ITEMS.entries()) {
        const photo = vertivItemPhotos[idx] ?? null;
        itemPages.push(
          new Paragraph({ text: "", pageBreakBefore: true }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [9360],
            rows: [
              new TableRow({
                cantSplit: false,
                children: [new TableCell({
                  borders: cellBorders(),
                  margins: { top: 120, bottom: 120, left: 120, right: 120 },
                  children: [await buildEvidenceImgParagraph(photo, 560, 330)],
                })],
              }),
              new TableRow({
                cantSplit: false,
                children: [new TableCell({
                  borders: cellBorders(),
                  margins: { top: 100, bottom: 100, left: 120, right: 120 },
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: item, bold: true, size: 26, color: BLUE, font: "Arial" })] })],
                })],
              }),
            ],
          }),
        );
      }

      const vertivBlock: (docx.Paragraph | docx.Table)[] = turno === 'noche' ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({
          keepNext: true,
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: VERTIV_TITLE, color: BLUE, size: 26, font: "Arial", bold: true })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          columnWidths: [4680, 4680],
          rows: carroTableRows,
        }),
        ...itemPages,
      ] : [];

      const evidenceContent = (await Promise.all(evidenceBlocks.map(async block => {
        const usablePhotos = block.photos.filter((p): p is string => Boolean(p));
        if (usablePhotos.length === 0) return [];

        const colWidth = Math.floor(100 / usablePhotos.length);
        const isMantenimiento = block.title.startsWith("Registro de mantenimiento de GG.");
        const hasRequestedPhotoSize = EVIDENCIAS_CON_TAMANO_FOTOGRAFICO_SOLICITADO.has(block.title.trim().toLocaleLowerCase());
        const normalizedTitle = block.title.trim().toLocaleLowerCase();
        const isNightSelfEvaluation = turno === 'noche' && normalizedTitle === "autoevaluación diaria y charla inicio de turno.";
        const isNightReportability = turno === 'noche' && normalizedTitle === "reportabilidad gg.";
        const imageWidth = isMantenimiento
          ? 614
          : isNightSelfEvaluation
            ? 206
            : isNightReportability
              ? 623
              : hasRequestedPhotoSize
                ? 618
                : 307;
        const imageHeight = isMantenimiento
          ? 246
          : isNightSelfEvaluation
            ? 306
            : isNightReportability
              ? 167
              : hasRequestedPhotoSize
                ? 432
                : 456;
        const orientedPhotos = hasRequestedPhotoSize
          ? await Promise.all(usablePhotos.map(dataUrl => orientEvidencePhoto(dataUrl, -90)))
          : usablePhotos;
        const cells = await Promise.all(orientedPhotos.map(async dataUrl => {
          const { bytes, type } = await resolveImageBytes(dataUrl);
          return new TableCell({
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            borders: cellBorders(),
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ data: bytes, transformation: { width: imageWidth, height: imageHeight }, type })],
            })],
          });
        }));

        const captionRow = new TableRow({
          children: [new TableCell({
            columnSpan: usablePhotos.length,
            borders: cellBorders(),
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: block.title, bold: true, size: 20, font: "Arial" })] })],
          })],
        });

        const evidenceColumnWidth = Math.floor(9360 / usablePhotos.length);

        return [
          new Paragraph({ text: "", pageBreakBefore: true }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: usablePhotos.map(() => evidenceColumnWidth),
            rows: [new TableRow({ children: cells }), captionRow],
          }),
        ];
      }))).flat();

      // Última hoja: "Indicadores Técnicos Relevantes" + "Observaciones" de cierre.
      // Igual que el bloque Vertiv, es texto fijo y solo aplica en turno NOCHE.
      const finalPageContent: docx.Paragraph[] = turno === 'noche' ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "Indicadores Técnicos Relevantes:", color: BLUE, size: 26, font: "Arial", bold: true })],
        }),
        new Paragraph({ children: [new TextRun({ text: INDICADORES_INTRO, font: "Arial" })] }),
        ...INDICADORES_BULLETS.map(b => new Paragraph({ text: b, bullet: { level: 0 } })),
        ...OBS_FINAL_BULLETS.map(b => new Paragraph({ text: b, bullet: { level: 0 } })),
        new Paragraph({ text: "" }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: "OBSERVACIONES", color: BLUE, size: 26, font: "Arial", bold: true })],
        }),
      ] : [];

      const personalTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [3900, 5460],
        borders: noBorders(),
        rows: personal
          .filter(p => p.nombre.trim())
          .map(p => new TableRow({
            children: [
              new TableCell({
                width: { size: 3900, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ text: p.nombre, bullet: { level: 0 } })],
              }),
              new TableCell({
                width: { size: 5460, type: WidthType.DXA },
                borders: noBorders(),
                children: [new Paragraph({ text: p.cargo })],
              }),
            ],
          })),
      });

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
        sections: [
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            children: [coverTable],
          },
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            headers: { default: header },
            children: [
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Descripción", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: descripcionParrafo, font: "Arial" })] }),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `Personal en Turno ${letraTurno}`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
              personalTable,
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Actividades Diarias.", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...actividades.filter(a => a.trim()).map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Observaciones.", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...observaciones.filter(o => o.trim()).map(o => new Paragraph({ text: o, bullet: { level: 0 } })),
              ...evidenceContent,
              ...vertivBlock,
              ...finalPageContent,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const [year, month, day] = fecha.split("-");
      const fechaArchivo = `${day}-${month}-${year}`;
      const filename = `Reporte_Actividades_Turno${turno === "dia" ? "Dia" : "Noche"}_${fechaArchivo}.docx`;
      saveAs(blob, filename);

      showToast(`Documento generado exitosamente: ${filename}`);
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo.", true);
    } finally {
      setIsGenerating(false);
    }
  };

  const mesDeFecha = fecha ? Number(fecha.split("-")[1]) : 0;
  const decoracionMensual = DECORACIONES_MENSUALES[mesDeFecha];

  if (view === 'dashboard') {
    return (
      <Dashboard
        borradorCount={borradores.filter(b => !esBorradorPendiente(b)).length}
        onNavigate={next => {
          if (next === 'diario') goToInformeDeHoy();
          else setView(next);
        }}
      />
    );
  }

  if (view === 'borradores') {
    return (
      <Borradores
        borradores={borradores}
        onOpen={openBorradorEntry}
        onDelete={handleDeleteBorrador}
        onBack={() => setView('dashboard')}
        onNew={goToNewInforme}
      />
    );
  }

  if (view === 'cierre') {
    return <InformeCierre onBack={() => setView('dashboard')} />;
  }

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      {/* Header */}
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Reporte diario de actividades
              </div>
              <div className="site-header__meta text-xs truncate">
                DSAL / Turno {letraTurno} · 2026
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      {decoracionMensual && (
        <div className="seasonal-decoration" aria-label={decoracionMensual.message}>
          <img src={decoracionMensual.source} alt={decoracionMensual.label} />
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={() => setView('dashboard')} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <button type="button" onClick={goToNewInforme} className="bg-[#0E4660] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#0a3549] flex items-center gap-1.5">
            <Plus size={14} /> Nuevo informe
          </button>
        </div>

        {/* Section 1: Datos Generales */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ClipboardList size={18} className="panel__summary-icon" strokeWidth={2.2} />
            1. Datos generales
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Tipo de turno</label>
                <div className="flex gap-4 items-center mt-2">
                  <label className="text-sm flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="turno" checked={turno === 'dia'} onChange={() => handleTurnoChange('dia')} /> Turno Día
                  </label>
                  <label className="text-sm flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="turno" checked={turno === 'noche'} onChange={() => handleTurnoChange('noche')} /> Turno Noche
                  </label>
                </div>
                {turno === 'noche' && (
                  <p className="text-[11px] text-[#0E4660] bg-[#E8F1FB] border border-[#cfe1f5] rounded-md px-2 py-1 mt-2">
                    Turno Noche: la plantilla de "Actividades Diarias" cambia a la lista fija de noche, y se agregará automáticamente el bloque "Verificación de la Gestión en Planta Rectificadora Vertiv" junto con la hoja final de Indicadores Técnicos / Observaciones.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Fecha del turno</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por (Supervisor a cargo)</label>
                <select
                  value={creadoNombre}
                  onChange={e => {
                    const selected = CREADO_POR_ALL.find(option => option.nombre === e.target.value);
                    if (selected) {
                      setCreadoNombre(selected.nombre);
                      setCreadoCargo(selected.cargo);
                    }
                  }}
                  className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
                >
                  {CREADO_POR_ALL.map(option => (
                    <option key={option.nombre} value={option.nombre}>{option.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cargo</label>
                <input type="text" value={creadoCargo} readOnly className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-gray-50" />
              </div>
            </div>
          </div>
        </details>

        {/* Section 2: Personal en Turno */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Users size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Personal en Turno
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 p-2 rounded-md bg-[#E8F1FB] border border-[#cfe1f5]">
            <span className="text-xs text-[#0E4660] font-bold">Personal predeterminado:</span>
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="letraTurno" checked={letraTurno === 'A'} onChange={() => handleLetraTurnoChange('A')} /> Turno A
            </label>
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="letraTurno" checked={letraTurno === 'B'} onChange={() => handleLetraTurnoChange('B')} /> Turno B
            </label>
            <span className="text-[11px] text-gray-500">Mostrando {personal.length} personas del Turno {letraTurno}</span>
          </div>

          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {personal.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[45%] p-1">
                    <input type="text" value={p.nombre} onChange={e => handleUpdatePersonal(i, 'nombre', e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[45%] p-1">
                    <input type="text" value={p.cargo} onChange={e => handleUpdatePersonal(i, 'cargo', e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[10%] p-1 text-right">
                    <button onClick={() => handleRemovePersonal(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            <select value={selectedPersonalSugerido} onChange={e => setSelectedPersonalSugerido(e.target.value)} className="flex-1 min-w-[220px] p-2 border border-[#DCE1E6] rounded-md text-sm">
              <option value="">-- Seleccionar integrante del equipo --</option>
              <optgroup label={`Turno ${letraTurno}`}>
                {getDefaultPersonal(letraTurno).map(p => (
                  <option key={p.nombre} value={`${p.nombre}|${p.cargo}`}>{p.nombre} - {p.cargo}</option>
                ))}
              </optgroup>
              <optgroup label="Otros">
                {PERSONAL_SUGERIDO_OTROS.map(p => (
                  <option key={p.nombre} value={`${p.nombre}|${p.cargo}`}>{p.nombre} - {p.cargo}</option>
                ))}
              </optgroup>
            </select>
            <button onClick={() => {
              if (selectedPersonalSugerido) {
                const [n, c] = selectedPersonalSugerido.split('|');
                handleAddPersonal(n, c);
                setSelectedPersonalSugerido('');
              }
            }} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar persona
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddPersonal()} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar persona en blanco
            </button>
            <button onClick={resetPersonal} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a lista por defecto
            </button>
          </div>
        </details>

        {/* Section 3: Actividades Diarias */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ListChecks size={18} className="panel__summary-icon" strokeWidth={2.2} />
            3. Actividades Diarias
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>

          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {actividades.map((act, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[82%] p-1">
                    <input type="text" value={act} onChange={e => handleUpdateActividad(i, e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[18%] p-1 text-right whitespace-nowrap">
                    <button type="button" onClick={() => handleMoveActividad(i, -1)} disabled={i === 0} title="Subir actividad" aria-label="Subir actividad" className="p-1.5 mr-1 rounded text-[#0E4660] hover:bg-[#E8F1FB] disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronUp size={16} />
                    </button>
                    <button type="button" onClick={() => handleMoveActividad(i, 1)} disabled={i === actividades.length - 1} title="Bajar actividad" aria-label="Bajar actividad" className="p-1.5 mr-1 rounded text-[#0E4660] hover:bg-[#E8F1FB] disabled:opacity-30 disabled:cursor-not-allowed">
                      <ChevronDown size={16} />
                    </button>
                    <button type="button" onClick={() => handleRemoveActividad(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            <select value={selectedActividadSugerida} onChange={e => setSelectedActividadSugerida(e.target.value)} className="flex-1 min-w-[220px] p-2 border border-[#DCE1E6] rounded-md text-sm">
              <option value="">-- Seleccionar actividad extra sugerida --</option>
              <option value="Reunión de tronadura">Reunión de tronadura</option>
              <option value="Test de alcohol y drogas">Test de alcohol y drogas</option>
              <option value="Reunión de inicio de TDFS">Reunión de inicio de TDFS</option>
              <option value="Movimiento de carro">Movimiento de carro</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Reunion de cierre TDFS">Reunion de cierre TDFS</option>
              <option value="Checklist de de carros LTE">Checklist de de carros LTE</option>
              <option value="Orden y Limpieza de Bodega">Orden y Limpieza de Bodega</option>
              

            </select>
            <button onClick={() => {
              if (selectedActividadSugerida) {
                handleAddActividad(selectedActividadSugerida);
                setSelectedActividadSugerida('');
              }
            }} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar sugerida
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddActividad('')} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar actividad en blanco
            </button>
            <button onClick={resetActividades} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a actividades por defecto
            </button>
          </div>
        </details>

        {/* Section 3b: Bloque fijo Vertiv (solo Turno Noche) */}
        {turno === 'noche' && (
          <details open className="panel p-5">
            <summary className="panel__summary font-display font-bold text-lg">
              <BatteryCharging size={18} className="panel__summary-icon" strokeWidth={2.2} />
              Verificación Gestión Vertiv (fijo — solo Turno Noche)
              <ChevronDown size={16} className="panel__summary-chevron" />
            </summary>
            <p className="text-xs text-gray-500 mb-3">
              Los títulos de este bloque son fijos y no editables. Solo debes cargar la captura/foto de evidencia de cada Carro y de cada ítem de monitoreo; se incluirán automáticamente en el documento con el mismo formato de la plantilla (imagen + leyenda). Solo aparece en <strong>Turno Noche</strong>.
            </p>

            <p className="text-xs text-[#6B6B6B] font-bold mb-2 mt-4">Evidencia por Carro (van de a pares, imagen y leyenda debajo)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {VERTIV_CARROS_FLAT.map((title, i) => (
                <div key={i} className="border border-dashed border-[#DCE1E6] rounded-lg p-2 bg-[#fafbfc] flex items-center gap-2.5">
                  <div
                    onClick={() => handleSelectVertivSlot('carro', i)}
                    className={`photo-slot w-[100px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white flex-shrink-0 cursor-pointer ${selectedVertivSlot?.type === 'carro' && selectedVertivSlot.index === i ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                  >
                    {vertivCarroPhotos[i] && (
                      <button onClick={() => clearVertivCarroPhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3">
                        ×
                      </button>
                    )}
                    <img src={vertivCarroPhotos[i] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"} alt={title} className="w-[92px] h-[70px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                    <button type="button" onClick={() => openDocumentScanner({ type: 'vertivCarro', index: i })} className="w-full bg-[#0E4660] text-white rounded px-1 py-1 mb-1 text-[9px] font-bold">Escanear documento</button>
                    <span className="block text-[9px] text-gray-500">Imagen, cámara o app de escaneo:</span>
                    <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignVertivCarroPhoto(e.target.files[0], i)} className="text-[9px] w-full" />
                  </div>
                  <span className="text-sm font-bold text-[#0E4660]">{title}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#6B6B6B] font-bold mb-2">Evidencia por ítem de monitoreo (cada uno va en su propia hoja del documento)</p>
            <div className="space-y-2.5">
              {VERTIV_ITEMS.map((item, i) => (
                <div key={i} className="border border-dashed border-[#DCE1E6] rounded-lg p-2 bg-[#fafbfc] flex items-center gap-2.5">
                  <div
                    onClick={() => handleSelectVertivSlot('item', i)}
                    className={`photo-slot w-[100px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white flex-shrink-0 cursor-pointer ${selectedVertivSlot?.type === 'item' && selectedVertivSlot.index === i ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                  >
                    {vertivItemPhotos[i] && (
                      <button onClick={() => clearVertivItemPhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3">
                        ×
                      </button>
                    )}
                    <img src={vertivItemPhotos[i] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"} alt={item} className="w-[92px] h-[70px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                    <button type="button" onClick={() => openDocumentScanner({ type: 'vertivItem', index: i })} className="w-full bg-[#0E4660] text-white rounded px-1 py-1 mb-1 text-[9px] font-bold">Escanear documento</button>
                    <span className="block text-[9px] text-gray-500">Imagen, cámara o app de escaneo:</span>
                    <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignVertivItemPhoto(e.target.files[0], i)} className="text-[9px] w-full" />
                  </div>
                  <span className="text-sm text-[#333]">{item}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Además, se agregará automáticamente una hoja final con <strong>Indicadores Técnicos Relevantes</strong> y <strong>Observaciones</strong> de cierre.
            </p>
          </details>
        )}

        {/* Section 4: Observaciones */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <MessageSquare size={18} className="panel__summary-icon" strokeWidth={2.2} />
            4. Observaciones
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>
          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {observaciones.map((obs, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[90%] p-1">
                    <input type="text" value={obs} onChange={e => {
                      const updated = [...observaciones];
                      updated[i] = e.target.value;
                      setObservaciones(updated);
                    }} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[10%] p-1 text-right">
                    <button onClick={() => setObservaciones(observaciones.filter((_, idx) => idx !== i))} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setObservaciones([...observaciones, ''])} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar observación
          </button>
          <p className="text-xs text-gray-500 mt-2">Si no hay observaciones, deja la lista vacía.</p>
        </details>

        {/* Section 5: Evidencia Fotográfica */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Camera size={18} className="panel__summary-icon" strokeWidth={2.2} />
            5. Evidencia fotográfica
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>
          <p className="text-xs text-gray-500 mb-3">
            {turno === 'noche'
              ? <><strong>Bloques fijos de Turno Noche.</strong> Esta plantilla incluye siempre las evidencias nocturnas, incluida REPORTABILIDAD GG.<br /></>
              : <><strong>Bloques de Turno Día.</strong> Se sincronizan dinámicamente con la sección de Actividades y no incluyen los bloques exclusivos de Noche.<br /></>}
            En Android y iPhone puedes usar la cámara del dispositivo para fotografiar o escanear el documento, o seleccionar una imagen de la galería. También soporta <strong>Ctrl + V</strong> en computador. Si un bloque no tiene fotos, se omitirá en el documento generado.
          </p>

          <div className="space-y-3">
            {evidenceBlocks.map((block, bi) => (
              <div key={block.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={block.title}
                    onChange={e => {
                      const val = e.target.value;
                      setEvidenceBlocks(prev => prev.map((b, i) => i === bi ? { ...b, title: val } : b));
                    }}
                    className="flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]"
                  />
                  {block.isActivity ? (
                    <span className="text-[11px] text-gray-400">
                      ({turno === 'dia' ? 'fijo turno día' : `Vinc. a Actividad ${(block.actIndex ?? 0) + 1}`})
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">(fijo turno {turno === 'noche' ? 'noche' : 'día'})</span>
                  )}
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex flex-nowrap gap-2.5 items-center min-w-max">
                    {block.photos.map((src, pi) => (
                    <div
                      key={pi}
                      onClick={() => handleSelectEvidenceSlot(bi, pi)}
                      className={`photo-slot w-[180px] min-w-[180px] text-center text-[11px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedEvidenceSlot?.blockIndex === bi && selectedEvidenceSlot.photoIndex === pi ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                      title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                    >
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          requestRemovePhotoSlot(bi, pi);
                        }}
                        title="Eliminar esta casilla de foto"
                        aria-label="Eliminar esta casilla de foto"
                        className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700"
                      >
                        <Trash2 size={12} />
                      </button>
                      <img src={src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='98'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='10'%3EArrastra o pega%3C/text%3E%3C/svg%3E"} alt="Evidencia" className="w-[120px] h-[90px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                      <button type="button" onClick={() => openDocumentScanner({ type: 'evidence', blockIndex: bi, photoIndex: pi })} className="w-full bg-[#0E4660] text-white rounded px-1.5 py-1 mb-1 text-[10px] font-bold">Escanear documento</button>
                      <span className="block text-[10px] text-gray-500">Imagen, cámara o app de escaneo:</span>
                      <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignFileToSlot(e.target.files[0], bi, pi)} className="text-[10px] w-full min-w-[168px]" />
                    </div>
                    ))}
                    <button type="button" onClick={() => handleAddPhotoSlot(bi)} className="btn-outline text-[#0E4660] px-2.5 py-1.5 rounded text-xs font-bold hover:bg-[#d5e7f8]">
                      + Foto
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleAddGenericBlock} className="mt-3 btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar bloque extra de evidencia
          </button>
        </details>

        {/* Action Button */}
        <div className="action-zone">
          <button
            onClick={generarDocumento}
            disabled={isGenerating}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generando Word Exacto...
              </>
            ) : "Generar documento Word"}
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-4">
          El archivo .docx mantendrá fielmente el formato, proporciones, imágenes y portada original de PSINet.
        </p>
      </main>

      <div className="fixed bottom-1 left-1/2 -translate-x-1/2 text-[#F4F6F8] text-[10px] italic cursor-text whitespace-nowrap z-10 select-text">
        creado con amor &lt;3
      </div>

      {draftPromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-[#0E4660]">Borrador encontrado</h2>
            <p className="text-sm text-gray-600">
              Encontramos contenido guardado de una sesión anterior. ¿Quieres continuar con ese borrador o comenzar un informe nuevo?
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={continueDraft} className="flex-1 bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold hover:bg-[#0a3549]">
                Continuar borrador
              </button>
              <button type="button" onClick={startNewReport} className="flex-1 border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Empezar de nuevo
              </button>
            </div>
          </div>
        </div>
      )}

      {photoRemovalRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="photo-removal-title">
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
            <h2 id="photo-removal-title" className="text-lg font-bold text-[#0E4660]">Eliminar bloque completo</h2>
            <p className="text-sm text-gray-600">
              Este bloque solo tiene una casilla. Si la eliminas, también se borrará el bloque completo y no solo la imagen.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPhotoRemovalRequest(null)} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmRemovePhotoSlot} className="bg-red-700 text-white rounded-md px-3 py-2 text-sm font-bold hover:bg-red-800">
                Eliminar bloque
              </button>
            </div>
          </div>
        </div>
      )}

      {scannerTarget && (
        <div className="fixed inset-0 z-50 bg-black/90 p-4 flex items-center justify-center">
          <div className="modal-anim w-full max-w-lg bg-white rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#0E4660]">Escanear documento</h2>
              <button type="button" onClick={closeDocumentScanner} className="text-gray-500 text-xl leading-none" aria-label="Cerrar escáner">×</button>
            </div>
            <p className="text-xs text-gray-600">{scannerMessage}</p>
            {scannerPreview ? (
              <img src={scannerPreview} alt="Vista previa del documento escaneado" className="w-full max-h-[55vh] object-contain rounded border border-gray-200 bg-gray-100" />
            ) : (
              <video ref={scannerVideoRef} autoPlay muted playsInline className="w-full max-h-[55vh] object-contain rounded bg-black" />
            )}
            <canvas ref={scannerCanvasRef} className="hidden" />
            <div className="flex gap-2">
              {scannerPreview ? (
                <>
                  <button type="button" onClick={() => setScannerPreview(null)} className="flex-1 border border-[#DCE1E6] rounded-md px-3 py-2 text-sm">Tomar otra</button>
                  <button type="button" onClick={confirmScannedDocument} className="flex-1 bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold">Usar documento</button>
                </>
              ) : (
                <button type="button" onClick={() => void captureDocument()} className="w-full bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold">Capturar y escanear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}