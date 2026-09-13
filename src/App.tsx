import { useState, useEffect, type ClipboardEvent } from 'react';
import * as docx from 'docx';
import { saveAs } from 'file-saver';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";


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

const DEFAULT_PERSONAL: PersonalItem[] = [
  { nombre: "Max Diaz", cargo: "Supervisor" },
  { nombre: "Patricio Santana", cargo: "Supervisor" },
  { nombre: "Carlos Moll.", cargo: "Técnico Eléctrico." },
  { nombre: "Williams Barraza.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "José Escobar", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Kevin Guerrero", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Vanesa Aguilar", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Nicolas Bahamondes", cargo: "Lider Tecnico" },
  { nombre: "Juan Morata", cargo: "Ingeniero Especialista" },
  { nombre: "Ricardo Riquelme", cargo: "Electromecanico" },
  { nombre: "Claudia Droguett", cargo: "Experta HSE" }
];

const DEFAULT_ACTIVIDADES_DIA: string[] = [
  "Registro de reunión inicio de turno.",
  "Registro de Check List de vehículo liviano.",
  "Vehículo liviano L200 VCTF 84.",
  "Autoevaluación Diaria inicio y termino de turno.",
  "Registro fatiga y somnolencia.",
  "Registro de protección solar.",
  "Registro de Hidratación.",
  "Tareas Administrativas."
];

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
];

const EVIDENCIAS_EXCLUIDAS_DIA = new Set([
  "Tareas Administrativas.",
  "Vehículo liviano L200 VCTF 84.",
]);

const CREADO_POR_OPTIONS: { nombre: string; cargo: string }[] = [
  { nombre: "Max Diaz Cornejo", cargo: "Supervisor" },
  { nombre: "Patricio Santana", cargo: "Supervisor" },
  { nombre: "Nicolas Bahamondes", cargo: "Tecnico Lider" },
];

// Bloque fijo que solo aplica cuando el turno es de NOCHE.
// Va SIEMPRE junto (no es editable por el usuario) y se omite por completo en turno DÍA.
const VERTIV_TITLE = "Verificación de la Gestión en Planta Rectificadora Vertiv";

const VERTIV_CARROS: [string, string][] = [
  ["Carro LTE CMF 01", "Carro LTE CMF 02"],
  ["Carro LTE CMM 03", "Carro LTE CMF 04"],
  ["Carro LTE CMM 05", "Carro LTE CMM 06"],
  ["Carro LTE CMM 07", "Carro LTE CMF 08"],
  ["Carro LTE CMF 09", "Carro LTE CMM 10"],
  ["Carro LTE CMF 11", "Carro MMOO 01"],
];

// Versión plana de los 12 carros (mismo orden), usada para indexar sus fotos individuales.
const VERTIV_CARROS_FLAT: string[] = VERTIV_CARROS.flat();

const VERTIV_ITEMS: string[] = [
  "Estado de Vertiv ICMP (administración remota)",
  "E-Nodos B ICMP Response Time (Latencia).",
  "Voltaje del sistema LTE.",
  "Voltaje de los bancos de baterías.",
  "Monitoreo de la Corriente sistema LTE Dsal.",
  "Monitoreo de la descarga total de los bancos de baterías.",
  "Monitoreo del status de las temperaturas en los gabinetes batería.",
];

// Texto fijo de cierre (última hoja). También solo para turno NOCHE.
const INDICADORES_INTRO =
  "Durante el turno se ejecutó reportabilidad diaria GG de forma parcial en los sitios LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 y MMOO 01, manteniendo validación de continuidad de servicio y estado operacional en los puntos priorizados de la jornada.";

const INDICADORES_BULLETS: string[] = [
  "Se realizó monitoreo general del estado de E-Nodo B, verificando conectividad mediante ICMP y tiempos de respuesta (latencia) como referencia de estabilidad de red y comunicación operacional.",
  "Se efectuó monitoreo general de energía asociado a la continuidad operacional, incluyendo revisión de gestión de planta rectificadora Vertiv, voltaje del sistema LTE, voltaje de bancos de baterías, corriente del sistema, descarga total de bancos y condición térmica de gabinetes de baterías.",
  "Se mantuvo control operacional complementario mediante registro de alcotest, control de fatiga y somnolencia, confección de ART y ejecución de difusiones preventivas, reforzando las condiciones de seguridad y cumplimiento operativo del turno.",
];

const OBS_FINAL_INTRO =
  "No se realiza reportabilidad al sitio 5 debido a que se encuentra replegado, por lo que queda fuera del ciclo de verificación operacional del turno.";

const OBS_FINAL_BULLETS: string[] = [
  "Se mantiene monitoreo general sobre E-Nodo B, sistema de energía y gestión Vertiv, dando continuidad al seguimiento de los parámetros operacionales del sistema LTE.",
];

const BLUE = "156082";
const ORANGE = "ED7D31";
const LS_KEY_PERSONAL = "psinet_personal_v6";
const LS_KEY_ACT_DIA = "psinet_actividades_dia_v6";
const LS_KEY_ACT_NOCHE = "psinet_actividades_noche_v6";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

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
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
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
  const [selectedVertivSlot, setSelectedVertivSlot] = useState<{ type: 'carro' | 'item'; index: number } | null>(null);

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
      setActividades(rawActDia ? JSON.parse(rawActDia) : DEFAULT_ACTIVIDADES_DIA);
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
  }, []);

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
            const existing = prevBlocks.find(block => block.isActivity && block.actIndex === index);
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
        const existing = prevBlocks.find(b => b.actIndex === idx || (b.isActivity && b.title === actText));
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
      localStorage.setItem(LS_KEY_PERSONAL, JSON.stringify(newPersonal));
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
        ? JSON.parse(raw)
        : (newTurno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE);
    } catch {
      nextActividades = newTurno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE;
    }

    setActividades(nextActividades);
    setTurno(newTurno);
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
    if (window.confirm("¿Deseas restaurar la lista de personal por defecto?")) {
      setPersonal(DEFAULT_PERSONAL);
      persistPersonal(DEFAULT_PERSONAL);
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
    reader.onload = () => {
      setEvidenceBlocks(prev => prev.map((b, bi) => {
        if (bi !== blockIndex) return b;
        const newPhotos = [...b.photos];
        newPhotos[photoIndex] = reader.result as string;
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

  const handleClearPhoto = (blockIndex: number, photoIndex: number) => {
    setEvidenceBlocks(prev => prev.map((b, bi) => {
      if (bi !== blockIndex) return b;
      const newPhotos = [...b.photos];
      newPhotos[photoIndex] = null;
      return { ...b, photos: newPhotos };
    }));
  };

  // Handlers de fotos para el bloque fijo Vertiv: una foto por Carro y una por ítem de monitoreo.
  const assignVertivCarroPhoto = (file: File, idx: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setVertivCarroPhotos(prev => {
        const updated = [...prev];
        updated[idx] = reader.result as string;
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
    setSelectedEvidenceSlot({ blockIndex, photoIndex });
    setSelectedVertivSlot(null);
  };

  const handleSelectVertivSlot = (type: 'carro' | 'item', index: number) => {
    setSelectedVertivSlot({ type, index });
    setSelectedEvidenceSlot(null);
  };

  const assignVertivItemPhoto = (file: File, idx: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setVertivItemPhotos(prev => {
        const updated = [...prev];
        updated[idx] = reader.result as string;
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

  // Pegado Global
  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (!selectedEvidenceSlot && !selectedVertivSlot && (activeTag === 'input' || activeTag === 'textarea')) return;

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

    if (selectedEvidenceSlot) {
      const { blockIndex, photoIndex } = selectedEvidenceSlot;
      if (updatedBlocks[blockIndex]?.photos[photoIndex] !== undefined) {
        assignFileToSlot(imageFiles[imgIdx], blockIndex, photoIndex);
        imgIdx++;
        assignEvidenceFrom(blockIndex, photoIndex + 1);
      } else {
        assignEvidenceFrom();
      }
      setSelectedEvidenceSlot(null);
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
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "REPORTE DIARIO", size: 66, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: turno === "dia" ? "TURNO DIA" : "TURNO NOCHE", size: 66, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "De Actividades", bold: true, size: 40, font: "Arial" })] })
      );

      const coverTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders(), children: coverLeftChildren }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
                margins: { left: 300, top: 100, bottom: 100 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: formatFechaPortada(fecha), size: 24, font: "Arial", color: "000000" })] }),
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
      const buildEvidenceImgParagraph = (photo: string | null, width: number, height: number) => {
        if (!photo) {
          return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin evidencia cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] });
        }
        const bytes = dataUrlToUint8Array(photo);
        const type = photo.startsWith("data:image/png") ? "png" : "jpg";
        return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width, height }, type })] });
      };

      const carroTableRows: docx.TableRow[] = [];
      VERTIV_CARROS.forEach(([leftTitle, rightTitle], pairIdx) => {
        const leftPhoto = vertivCarroPhotos[pairIdx * 2] ?? null;
        const rightPhoto = vertivCarroPhotos[pairIdx * 2 + 1] ?? null;

        carroTableRows.push(new TableRow({
          cantSplit: false,
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: cellBorders(),
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [buildEvidenceImgParagraph(leftPhoto, 280, 190)],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: cellBorders(),
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [buildEvidenceImgParagraph(rightPhoto, 280, 190)],
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
      });

      const itemPages: (docx.Paragraph | docx.Table)[] = VERTIV_ITEMS.flatMap((item, idx) => {
        const photo = vertivItemPhotos[idx] ?? null;
        return [
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
                  children: [buildEvidenceImgParagraph(photo, 560, 330)],
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
        ];
      });

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

      const evidenceContent = evidenceBlocks.flatMap(block => {
        const usablePhotos = block.photos.filter((p): p is string => Boolean(p));
        if (usablePhotos.length === 0) return [];

        const colWidth = Math.floor(100 / usablePhotos.length);
        const cells = usablePhotos.map(dataUrl => {
          const bytes = dataUrlToUint8Array(dataUrl);
          const type = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
          return new TableCell({
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            borders: cellBorders(),
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ data: bytes, transformation: { width: 307, height: 456 }, type })],
            })],
          });
        });

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
      });

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
              ...vertivBlock,
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Observaciones.", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...observaciones.filter(o => o.trim()).map(o => new Paragraph({ text: o, bullet: { level: 0 } })),
              ...evidenceContent,
              ...finalPageContent,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const filename = `Reporte_Actividades_Turno${turno === "dia" ? "Dia" : "Noche"}_${fecha}.docx`;
      saveAs(blob, filename);

      showToast(`Documento generado exitosamente: ${filename}`);
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo.", true);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-[#222] font-sans pb-20" onPaste={handlePaste}>
      {/* Header */}
      <header className="bg-[#111] text-white py-3.5 px-5 flex items-center gap-3.5">
        <div className="font-extrabold text-2xl tracking-wide">
          PSI<span className="text-[#FFC72C]">Net</span>
        </div>
        <div className="text-xs text-gray-400">Generador de Reporte Diario de Actividades Dinámico</div>
      </header>

      {/* Main Container */}
      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        {/* Section 1: Datos Generales */}
        <details open className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <summary className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5 cursor-pointer select-none">
            1. Datos generales
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
                    const selected = CREADO_POR_OPTIONS.find(option => option.nombre === e.target.value);
                    if (selected) {
                      setCreadoNombre(selected.nombre);
                      setCreadoCargo(selected.cargo);
                    }
                  }}
                  className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
                >
                  {CREADO_POR_OPTIONS.map(option => (
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
        <details open className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <summary className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5 cursor-pointer select-none">
            2. Personal en Turno
          </summary>
          
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
              <option value="Max Diaz|Supervisor">Max Diaz - Supervisor</option>
              <option value="Patricio Santana|Supervisor">Patricio Santana - Supervisor</option>
              <option value="Carlos Moll.|Técnico Eléctrico.">Carlos Moll. - Técnico Eléctrico.</option>
              <option value="Williams Barraza.|Técnico Telecomunicaciones.">Williams Barraza. - Técnico Telecomunicaciones.</option>
              <option value="José Escobar|Técnico Telecomunicaciones.">José Escobar - Técnico Telecomunicaciones.</option>
              <option value="Kevin Guerrero|Técnico Telecomunicaciones.">Kevin Guerrero - Técnico Telecomunicaciones.</option>
              <option value="Vanesa Aguilar|Técnico Telecomunicaciones.">Vanesa Aguilar - Técnico Telecomunicaciones.</option>
            </select>
            <button onClick={() => {
              if (selectedPersonalSugerido) {
                const [n, c] = selectedPersonalSugerido.split('|');
                handleAddPersonal(n, c);
                setSelectedPersonalSugerido('');
              }
            }} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar persona
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddPersonal()} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar persona en blanco
            </button>
            <button onClick={resetPersonal} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a lista por defecto
            </button>
          </div>
        </details>

        {/* Section 3: Actividades Diarias */}
        <details open className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <summary className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5 cursor-pointer select-none">
            3. Actividades Diarias
          </summary>

          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {actividades.map((act, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[90%] p-1">
                    <input type="text" value={act} onChange={e => handleUpdateActividad(i, e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[10%] p-1 text-right">
                    <button onClick={() => handleRemoveActividad(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
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
              <option value="Reunión de inicio de tfds">Reunión de inicio de tfds</option>
              <option value="Movimiento de carro">Movimiento de carro</option>
              <option value="Mantenimiento">Mantenimiento</option>
            </select>
            <button onClick={() => {
              if (selectedActividadSugerida) {
                handleAddActividad(selectedActividadSugerida);
                setSelectedActividadSugerida('');
              }
            }} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar sugerida
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddActividad('')} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar actividad en blanco
            </button>
            <button onClick={resetActividades} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a actividades por defecto
            </button>
          </div>
        </details>

        {/* Section 3b: Bloque fijo Vertiv (solo Turno Noche) */}
        {turno === 'noche' && (
          <details open className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
            <summary className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5 cursor-pointer select-none">
              Verificación Gestión Vertiv (fijo — solo Turno Noche)
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
                    className={`w-[100px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white flex-shrink-0 cursor-pointer ${selectedVertivSlot?.type === 'carro' && selectedVertivSlot.index === i ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                  >
                    {vertivCarroPhotos[i] && (
                      <button onClick={() => clearVertivCarroPhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3">
                        ×
                      </button>
                    )}
                    <img src={vertivCarroPhotos[i] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"} alt={title} className="w-[92px] h-[70px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                    <input type="file" accept="image/png,image/jpeg" onChange={e => e.target.files?.[0] && assignVertivCarroPhoto(e.target.files[0], i)} className="text-[9px] w-full" />
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
                    className={`w-[100px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white flex-shrink-0 cursor-pointer ${selectedVertivSlot?.type === 'item' && selectedVertivSlot.index === i ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                  >
                    {vertivItemPhotos[i] && (
                      <button onClick={() => clearVertivItemPhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3">
                        ×
                      </button>
                    )}
                    <img src={vertivItemPhotos[i] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"} alt={item} className="w-[92px] h-[70px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                    <input type="file" accept="image/png,image/jpeg" onChange={e => e.target.files?.[0] && assignVertivItemPhoto(e.target.files[0], i)} className="text-[9px] w-full" />
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
        <details open className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <summary className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5 cursor-pointer select-none">
            4. Observaciones
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
          <button onClick={() => setObservaciones([...observaciones, ''])} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar observación
          </button>
          <p className="text-xs text-gray-500 mt-2">Si no hay observaciones, deja la lista vacía.</p>
        </details>

        {/* Section 5: Evidencia Fotográfica */}
        <details open className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <summary className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5 cursor-pointer select-none">
            5. Evidencia fotográfica
          </summary>
          <p className="text-xs text-gray-500 mb-3">
            {turno === 'noche'
              ? <><strong>Plantilla fija de Turno Noche.</strong> Estas seis evidencias se mantienen siempre en este turno.<br /></>
              : <><strong>Sincronizado dinámicamente con la sección de Actividades.</strong><br /></>}
            Soporta <strong>Ctrl + V</strong> para pegar imágenes. Si un bloque no tiene fotos, se omitirá en el documento generado.
          </p>

          <div className="space-y-3">
            {evidenceBlocks.map((block, bi) => (
              <div key={block.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={block.title}
                    readOnly={block.isFixed}
                    onChange={e => {
                      const val = e.target.value;
                      setEvidenceBlocks(prev => prev.map((b, i) => i === bi ? { ...b, title: val } : b));
                    }}
                    className={`flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660] ${block.isFixed ? 'bg-gray-50 cursor-default' : ''}`}
                  />
                  {!block.isActivity && !block.isFixed ? (
                    <button onClick={() => setEvidenceBlocks(evidenceBlocks.filter((_, i) => i !== bi))} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">
                      Quitar bloque
                    </button>
                  ) : block.isActivity ? (
                    <span className="text-[11px] text-gray-400">(Vinc. a Actividad {(block.actIndex ?? 0) + 1})</span>
                  ) : (
                    <span className="text-[11px] text-gray-400">(fijo turno dia)</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5 items-center">
                  {block.photos.map((src, pi) => (
                    <div
                      key={pi}
                      onClick={() => handleSelectEvidenceSlot(bi, pi)}
                      className={`w-[130px] text-center text-[11px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedEvidenceSlot?.blockIndex === bi && selectedEvidenceSlot.photoIndex === pi ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                      title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                    >
                      {src && (
                        <button onClick={() => handleClearPhoto(bi, pi)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3">
                          ×
                        </button>
                      )}
                      <img src={src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='98'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='10'%3EArrastra o pega%3C/text%3E%3C/svg%3E"} alt="Evidencia" className="w-[120px] h-[90px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                      <input type="file" accept="image/png,image/jpeg" onChange={e => e.target.files?.[0] && assignFileToSlot(e.target.files[0], bi, pi)} className="text-[10px] w-full" />
                    </div>
                  ))}
                  <button onClick={() => handleAddPhotoSlot(bi)} className="bg-[#E8F1FB] text-[#0E4660] px-2.5 py-1.5 rounded text-xs font-bold hover:bg-[#d5e7f8]">
                    + Foto
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleAddGenericBlock} className="mt-3 bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar bloque extra de evidencia
          </button>
        </details>

        {/* Action Button */}
        <button
          onClick={generarDocumento}
          disabled={isGenerating}
          className="w-full bg-[#0E4660] text-white py-3.5 px-6 font-bold text-base rounded-lg shadow-sm hover:bg-[#0a3549] disabled:bg-[#9fb3bd] disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? "Generando Word Exacto..." : "Generar documento Word Exacto"}
        </button>

        <p className="text-center text-gray-500 text-xs mt-4">
          El archivo .docx mantendrá fielmente el formato, proporciones, imágenes y portada original de PSINet.
        </p>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}