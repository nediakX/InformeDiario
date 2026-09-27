import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type ClipboardEvent } from 'react';
import * as docx from 'docx';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Loader2, Wrench, ClipboardList, Camera, Gauge, ListChecks, Plus, Trash2, Save, X, Copy,
} from 'lucide-react';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import VisorFoto, { copiarImagenAlPortapapel } from './Visorfoto';
import {
  hoyLocalISO, formatFechaLarga, dataUrlToUint8Array, urlToBase64, resolveImageBytes, BLUE, ORANGE,
  type BorradorOtroEntry, upsertBorradorOtro, deleteBorradorOtro,
} from './types';

interface InformeMantenimientoProps {
  onBack: () => void;
  /** Borrador ya guardado en la nube que se debe abrir (viene de "Borradores" o de "Continuar" en el Panel). null/undefined = informe nuevo. */
  borradorInicial?: BorradorOtroEntry | null;
}

interface FotoItem {
  id: string;
  /** Encabezado de grupo (H2) — se muestra solo la primera vez que aparece, igual que en la plantilla. */
  section: string;
  caption: string;
  description: string;
  photo: string | null;
}

interface ParteItem { id: string; parte: string; cantidad: string; detalle: string; }
interface PlanItem { id: string; detalle: string; cantidad: string; parte: string; }
interface ChecklistItem { id: string; label: string; estado: string; observaciones: string; }
interface FiltroItem { id: string; nombre: string; estado: string; tipo: string; observaciones: string; }

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// ---------------------------------------------------------------------------------------
// Datos por defecto — tomados de la estructura del informe de referencia (LTE_CMF_11),
// editables en el formulario antes de generar el documento.
// ---------------------------------------------------------------------------------------

const DEFAULT_TRABAJOS: string[] = [
  "Chequeo de parámetros en GG.",
  "Chequeo de batería en modo stand by, arranque y con carga.",
  "Chequeo de breaker, circuitos eléctricos.",
  "Chequeo de niveles de aceite, refrigerante y combustible.",
  "Se realiza mantenimiento en el generador.",
  "Chequeo de mangueras, fugas, calefactor, conexionado.",
  "Se realiza limpieza de generador y controlador.",
];

const DEFAULT_COMPONENTES: string[] = [
  "Filtro de aire (AF25904)",
  "Filtro de combustible (FS01275)",
  "Filtro de aceite (LF16087)",
];

const DEFAULT_FOTOS: Omit<FotoItem, 'id' | 'photo'>[] = [
  { section: "", caption: "Vista del sitio antes del mantenimiento", description: "" },
  { section: "", caption: "Vista del generador antes del mantenimiento", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro ART", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro ART", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro Verificación de Entorno", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro Bloqueo de Energías", description: "" },
  { section: "", caption: "Revisión e inspección de generador", description: "" },
  { section: "Bloqueo de energías y seguridad LOTO", caption: "Bloqueo de energía electromecánico", description: "Se activan paradas de emergencia y se bloquean energías según procedimiento LOTO." },
  { section: "Bloqueo de energías y seguridad LOTO", caption: "Bloqueo de energía supervisor", description: "Se entrega la llave al supervisor y se deja en la caja respectiva." },
  { section: "Sistema de refrigeración del generador", caption: "Vista general del sistema de refrigeración (antes)", description: "Vista general del sistema de refrigeración del motor antes de su mantención." },
  { section: "Sistema de refrigeración del generador", caption: "Vista general del sistema de refrigeración (después)", description: "Vista general del sistema de refrigeración del motor después de su mantención." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Vista general de sistema de admisión de aire", description: "Se revisa estado general de unidad, sellos y estado de estructura." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Filtro de aire (antes)", description: "Vista general antes del cambio de filtro; presenta polución." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Filtro de aire existente", description: "Se aprecia exceso de polución al interior del filtro, por lo que se procede con el cambio de unidad." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Nuevo filtro de aire", description: "Se presenta filtro nuevo, se procede a instalar." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Reemplazo de filtro de aire", description: "Se realiza limpieza en cámara de admisión." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Instalación del filtro nuevo", description: "Una vez limpiada la zona se realiza la instalación del filtro nuevo." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Vista general del conducto de admisión de aire", description: "Una vez instalado el filtro nuevo, se deja en detalle la fecha de instalación." },
  { section: "Filtro y nivel de aceite", caption: "Filtro de aceite (antes)", description: "Vista de filtro antes de su cambio." },
  { section: "Filtro y nivel de aceite", caption: "Reemplazo de filtro de aceite", description: "Se retira filtro de aceite y se drena la zona." },
  { section: "Filtro y nivel de aceite", caption: "Vista sin filtro de aceite (antes)", description: "Una vez retirado el filtro de aceite, se limpia la zona dejándola en condiciones para instalar el filtro nuevo." },
  { section: "Filtro y nivel de aceite", caption: "Vista filtro de aceite (después)", description: "Se realiza instalación de filtro nuevo." },
  { section: "Filtro y nivel de aceite", caption: "Nivel de aceite (antes)", description: "Vista de varilla de aceite antes del cambio; aceite se encontraba sin consistencia." },
  { section: "Filtro y nivel de aceite", caption: "Nivel de aceite (después)", description: "Nivel de aceite después del llenado, dejando un nivel óptimo de trabajo." },
  { section: "Filtro de combustible", caption: "Filtro de combustible (anterior)", description: "Se presenta filtro anterior." },
  { section: "Filtro de combustible", caption: "Nuevo filtro de combustible", description: "Se presenta el nuevo filtro de combustible." },
  { section: "Filtro de combustible", caption: "Filtros instalados (después)", description: "Una vez instalados ambos filtros, se deja constancia de la fecha de instalación." },
  { section: "Filtro de combustible", caption: "Aceite (después)", description: "Después del trasvasije e instalación de filtros, se procede al llenado del sistema." },
  { section: "Power command", caption: "Power command — fase + fase", description: "Se verifican voltajes entre fase y fase, correctos para su operación." },
  { section: "Power command", caption: "Power command — fase + neutro", description: "Se verifican voltajes entre fase y neutro, correctos para la operación." },
  { section: "Limpieza general", caption: "Generador — limpieza general", description: "Se realiza limpieza general del generador y del tablero de control." },
  { section: "Limpieza general", caption: "Calefactor", description: "Se revisa el estado general del calefactor y mangueras, limpieza, verificación de fugas y estado de conexionado." },
];

const DEFAULT_REPUESTOS: Omit<ParteItem, 'id'>[] = [
  { parte: "AF25904", cantidad: "1", detalle: "Filtro de aire" },
  { parte: "LF16087", cantidad: "1", detalle: "Filtro de aceite" },
  { parte: "FS01275", cantidad: "1", detalle: "Filtro de combustible" },
  { parte: "100031-103", cantidad: "7 litros", detalle: "Aceite (15W40)" },
];

const DEFAULT_PLAN: Omit<PlanItem, 'id'>[] = [
  { detalle: "Filtro de combustible", cantidad: "1", parte: "FS01275" },
  { detalle: "Filtro de aceite", cantidad: "1", parte: "LF16087" },
  { detalle: "Filtro de aire", cantidad: "1", parte: "AF25904" },
  { detalle: "Lavado de radiador", cantidad: "1", parte: "—" },
  { detalle: "Limpieza tablero de control", cantidad: "1", parte: "—" },
  { detalle: "Pruebas en vacío y con carga", cantidad: "1", parte: "N/A" },
  { detalle: "Revisión de mangueras", cantidad: "1", parte: "—" },
];

const DEFAULT_VERIFICACIONES: Omit<ChecklistItem, 'id'>[] = [
  { label: "Botón parada de emergencia", estado: "OK", observaciones: "" },
  { label: "Botón reset de alarmas", estado: "OK", observaciones: "" },
  { label: "Funcionamiento de indicadores", estado: "OK", observaciones: "" },
  { label: "Calefactor de agua", estado: "OK", observaciones: "" },
  { label: "Pérdida de combustible", estado: "OK", observaciones: "" },
  { label: "Pérdida de aceite", estado: "OK", observaciones: "" },
  { label: "Pérdida de refrigerante", estado: "OK", observaciones: "" },
  { label: "Pérdida en tubo de escape", estado: "OK", observaciones: "" },
];

const DEFAULT_FILTROS: Omit<FiltroItem, 'id'>[] = [
  { nombre: "FILTRO DE AIRE", estado: "OK", tipo: "AF25904", observaciones: "Filtro nuevo" },
  { nombre: "FILTRO DE ACEITE", estado: "OK", tipo: "LF16087", observaciones: "Filtro nuevo" },
  { nombre: "FILTRO DE COMBUSTIBLE", estado: "OK", tipo: "FS01275", observaciones: "Filtro nuevo" },
];

// --- Listado de carros / sitios (mismo listado que usa el Informe de Falla) ---
const CARRO_OPCIONES: string[] = [
  "LTE_CMF_01", "LTE_CMF_02", "LTE_CMF_04", "LTE_CMF_08", "LTE_CMF_09",
  "LTE_CMM_03", "LTE_CMM_05", "LTE_CMM_06", "LTE_CMM_07", "LTE_CMM_10",
  "LTE_11", "MMOO_01",
];
const SITIO_OPCIONES: string[] = CARRO_OPCIONES.map(c => c.replace(/_/g, " "));

const withIds = <T,>(items: T[]): (T & { id: string })[] => items.map(item => ({ ...item, id: uid() }));

export default function InformeMantenimiento({ onBack, borradorInicial = null }: InformeMantenimientoProps) {
  // --- Datos generales / portada ---
  const [fecha, setFecha] = useState<string>(() => hoyLocalISO());
  const [creadoNombre, setCreadoNombre] = useState("Ricardo Riquelme.");
  const [creadoCargo, setCreadoCargo] = useState("Ingeniero Electromecánico");
  const [revisadoText, setRevisadoText] = useState("Jefe de Turno\nJuan Saavedra\nLuis Fernandez\nSupervisor de Operación");
  const [sitio, setSitio] = useState(SITIO_OPCIONES[0]);
  const [modeloGenerador, setModeloGenerador] = useState("Cummins C17D5");

  // --- Tabla REGISTRO ---
  const [cliente, setCliente] = useState("División El Salvador Codelco");
  const [area, setArea] = useState("Ex ventiladores");
  const [minera, setMinera] = useState("El Salvador Rajo Inca");
  const [tipoServicio, setTipoServicio] = useState("Mantenimiento preventivo Generador");
  const [ejecutante, setEjecutante] = useState("Ricardo Riquelme");

  // --- Descripción ---
  const [descripcionTexto, setDescripcionTexto] = useState(
    "Se realiza un mantenimiento preventivo a grupo electrógeno en el sitio, revisando el estado general del generador. Conjuntamente se ejecuta la limpieza en sistema mecánico y eléctrico, y de funcionamiento en control Power Command."
  );
  const [componentes, setComponentes] = useState<string[]>(DEFAULT_COMPONENTES);
  const [trabajos, setTrabajos] = useState<string[]>(DEFAULT_TRABAJOS);

  // --- Registro fotográfico ---
  const [fotos, setFotos] = useState<FotoItem[]>(() => withIds(DEFAULT_FOTOS).map(f => ({ ...f, photo: null })));
  // Referencia siempre actualizada a "fotos", para que el handler de pegado (Ctrl+V) no use una lista desactualizada.
  const fotosRef = useRef<FotoItem[]>(fotos);
  useEffect(() => { fotosRef.current = fotos; }, [fotos]);

  // --- Programa de mantenimiento ---
  const [horasPlan, setHorasPlan] = useState("1750");
  const [repuestos, setRepuestos] = useState<ParteItem[]>(() => withIds(DEFAULT_REPUESTOS));

  // --- 4.1 Inspección de grupo generador ---
  const [filtros, setFiltros] = useState<FiltroItem[]>(() => withIds(DEFAULT_FILTROS));
  const [horometro, setHorometro] = useState("");
  const [cantidadPartidas, setCantidadPartidas] = useState("");
  const [nivelRefrigerante, setNivelRefrigerante] = useState("ÓPTIMO");
  const [nivelCombustible, setNivelCombustible] = useState("1/2");
  const [nivelAceite, setNivelAceite] = useState("ÓPTIMO");
  const [cantidadBaterias, setCantidadBaterias] = useState("1");
  const [capacidadBateria, setCapacidadBateria] = useState("100 A/H");
  const [voltajeArranque, setVoltajeArranque] = useState("");
  const [voltajeMotorEncendido, setVoltajeMotorEncendido] = useState("");
  const [verificaciones, setVerificaciones] = useState<ChecklistItem[]>(() => withIds(DEFAULT_VERIFICACIONES));

  // --- Conclusión ---
  const [horasProximaMantencion, setHorasProximaMantencion] = useState("");
  const [planPreventivo, setPlanPreventivo] = useState<PlanItem[]>(() => withIds(DEFAULT_PLAN));
  const [fechaProximoMantenimiento, setFechaProximoMantenimiento] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [selectedFotoId, setSelectedFotoId] = useState<string | null>(null);

  // --- Borrador en la nube (compartido con el equipo, igual que Informe Diario) ---
  const borradorCargadoRef = useRef(false);
  const yaGuardadoEnNubeRef = useRef(false);
  const [currentDraftId, setCurrentDraftId] = useState<string>(() => borradorInicial?.id ?? crypto.randomUUID());
  const [hayBorrador, setHayBorrador] = useState(false);
  const [borradorGuardadoEn, setBorradorGuardadoEn] = useState<string | null>(null);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);

  // Al abrir el informe: si viene un borrador guardado (desde el Panel o desde Borradores), se carga.
  useEffect(() => {
    const d = borradorInicial?.datos as Record<string, unknown> | undefined;
    if (d) {
      if (typeof d.fecha === 'string') setFecha(d.fecha);
      if (typeof d.creadoNombre === 'string') setCreadoNombre(d.creadoNombre);
      if (typeof d.creadoCargo === 'string') setCreadoCargo(d.creadoCargo);
      if (typeof d.revisadoText === 'string') setRevisadoText(d.revisadoText);
      if (typeof d.sitio === 'string') setSitio(d.sitio);
      if (typeof d.modeloGenerador === 'string') setModeloGenerador(d.modeloGenerador);
      if (typeof d.cliente === 'string') setCliente(d.cliente);
      if (typeof d.area === 'string') setArea(d.area);
      if (typeof d.minera === 'string') setMinera(d.minera);
      if (typeof d.tipoServicio === 'string') setTipoServicio(d.tipoServicio);
      if (typeof d.ejecutante === 'string') setEjecutante(d.ejecutante);
      if (typeof d.descripcionTexto === 'string') setDescripcionTexto(d.descripcionTexto);
      if (Array.isArray(d.componentes)) setComponentes(d.componentes as string[]);
      if (Array.isArray(d.trabajos)) setTrabajos(d.trabajos as string[]);
      if (Array.isArray(d.fotos)) setFotos(d.fotos as FotoItem[]);
      if (typeof d.horasPlan === 'string') setHorasPlan(d.horasPlan);
      if (Array.isArray(d.repuestos)) setRepuestos(d.repuestos as ParteItem[]);
      if (Array.isArray(d.filtros)) setFiltros(d.filtros as FiltroItem[]);
      if (typeof d.horometro === 'string') setHorometro(d.horometro);
      if (typeof d.cantidadPartidas === 'string') setCantidadPartidas(d.cantidadPartidas);
      if (typeof d.nivelRefrigerante === 'string') setNivelRefrigerante(d.nivelRefrigerante);
      if (typeof d.nivelCombustible === 'string') setNivelCombustible(d.nivelCombustible);
      if (typeof d.nivelAceite === 'string') setNivelAceite(d.nivelAceite);
      if (typeof d.cantidadBaterias === 'string') setCantidadBaterias(d.cantidadBaterias);
      if (typeof d.capacidadBateria === 'string') setCapacidadBateria(d.capacidadBateria);
      if (typeof d.voltajeArranque === 'string') setVoltajeArranque(d.voltajeArranque);
      if (typeof d.voltajeMotorEncendido === 'string') setVoltajeMotorEncendido(d.voltajeMotorEncendido);
      if (Array.isArray(d.verificaciones)) setVerificaciones(d.verificaciones as ChecklistItem[]);
      if (typeof d.horasProximaMantencion === 'string') setHorasProximaMantencion(d.horasProximaMantencion);
      if (Array.isArray(d.planPreventivo)) setPlanPreventivo(d.planPreventivo as PlanItem[]);
      if (typeof d.fechaProximoMantenimiento === 'string') setFechaProximoMantenimiento(d.fechaProximoMantenimiento);
      setHayBorrador(true);
      setBorradorGuardadoEn(borradorInicial?.savedAt ?? null);
      yaGuardadoEnNubeRef.current = true;
    }
    borradorCargadoRef.current = true;
    // Solo se aplica una vez, al abrir el informe con el borrador que corresponda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado en la nube (con un pequeño debounce). Se sube recién cuando el informe tiene al
  // menos una foto (o si ya estaba guardado antes), igual que Informe Diario, para no llenar la
  // base de datos con informes vacíos que nadie llegó a completar.
  useEffect(() => {
    if (!borradorCargadoRef.current) return;
    const entry: BorradorOtroEntry = {
      id: currentDraftId,
      tipo: 'mantenimiento',
      titulo: sitio.trim() ? `${sitio.trim()}${modeloGenerador.trim() ? ` — ${modeloGenerador.trim()}` : ''}` : 'Mantenimiento sin sitio',
      fecha,
      savedAt: new Date().toISOString(),
      datos: {
        fecha, creadoNombre, creadoCargo, revisadoText, sitio, modeloGenerador,
        cliente, area, minera, tipoServicio, ejecutante,
        descripcionTexto, componentes, trabajos, fotos,
        horasPlan, repuestos, filtros, horometro, cantidadPartidas,
        nivelRefrigerante, nivelCombustible, nivelAceite, cantidadBaterias, capacidadBateria,
        voltajeArranque, voltajeMotorEncendido, verificaciones,
        horasProximaMantencion, planPreventivo, fechaProximoMantenimiento,
      },
    };
    const tieneFotos = fotos.some(f => f.photo);
    if (!tieneFotos && !yaGuardadoEnNubeRef.current) return;

    const timeout = setTimeout(() => {
      setGuardandoBorrador(true);
      upsertBorradorOtro(entry)
        .then(guardado => {
          yaGuardadoEnNubeRef.current = true;
          setHayBorrador(true);
          setBorradorGuardadoEn(guardado.savedAt);
        })
        .catch(error => {
          console.error("No se pudo guardar el borrador en la nube:", error);
          showToast("No se pudo sincronizar el borrador con la nube. Revisa tu conexión.", true);
        })
        .finally(() => setGuardandoBorrador(false));
    }, 800);
    return () => clearTimeout(timeout);
  }, [
    currentDraftId, fecha, creadoNombre, creadoCargo, revisadoText, sitio, modeloGenerador,
    cliente, area, minera, tipoServicio, ejecutante,
    descripcionTexto, componentes, trabajos, fotos,
    horasPlan, repuestos, filtros, horometro, cantidadPartidas,
    nivelRefrigerante, nivelCombustible, nivelAceite, cantidadBaterias, capacidadBateria,
    voltajeArranque, voltajeMotorEncendido, verificaciones,
    horasProximaMantencion, planPreventivo, fechaProximoMantenimiento,
  ]);

  const borrarBorrador = () => {
    const idPrevio = currentDraftId;
    const habiaEnNube = yaGuardadoEnNubeRef.current;
    setHayBorrador(false);
    setBorradorGuardadoEn(null);
    yaGuardadoEnNubeRef.current = false;
    setCurrentDraftId(crypto.randomUUID());
    if (habiaEnNube) {
      deleteBorradorOtro(idPrevio).catch(error => {
        console.error("No se pudo eliminar el borrador en la nube:", error);
        showToast("No se pudo eliminar el borrador en la nube.", true);
      });
    }
    showToast("Borrador eliminado.");
  };

  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopiarFoto = async (src: string) => {
    const ok = await copiarImagenAlPortapapel(src);
    showToast(ok ? "Imagen copiada al portapapeles." : "No se pudo copiar la imagen.", !ok);
  };

  // --- Helpers de listas simples (componentes / trabajos) ---
  const updateListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number, value: string) =>
    setter(prev => prev.map((v, idx) => (idx === i ? value : v)));
  const addListItem = (setter: Dispatch<SetStateAction<string[]>>) => setter(prev => [...prev, ""]);
  const removeListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number) =>
    setter(prev => prev.filter((_, idx) => idx !== i));

  // --- Fotos ---
  const updateFoto = (id: string, patch: Partial<FotoItem>) =>
    setFotos(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  const assignFoto = async (id: string, file: File) => updateFoto(id, { photo: await fileToDataUrl(file) });
  const addFoto = () => setFotos(prev => [...prev, { id: uid(), section: "", caption: "", description: "", photo: null }]);
  const removeFoto = (id: string) => setFotos(prev => prev.filter(f => f.id !== id));

  // Tras pegar una foto, selecciona automáticamente la siguiente casilla (o crea una nueva al final
  // si ya no quedan) para poder seguir pegando con Ctrl+V de corrido, sin volver a hacer clic cada vez.
  const avanzarSeleccionFoto = (idActual: string) => {
    const lista = fotosRef.current;
    const idx = lista.findIndex(f => f.id === idActual);
    if (idx === -1) return;
    if (idx + 1 < lista.length) {
      setSelectedFotoId(lista[idx + 1].id);
    } else {
      const nueva: FotoItem = { id: uid(), section: "", caption: "", description: "", photo: null };
      setFotos(prev => [...prev, nueva]);
      setSelectedFotoId(nueva.id);
    }
  };

  // Permite pegar una imagen (Ctrl+V) directamente sobre la casilla seleccionada, igual que en el Informe de Cierre.
  useEffect(() => {
    const handleDocumentPaste = (event: Event) => {
      if (!selectedFotoId) return;
      const clipboardEvent = event as unknown as ClipboardEvent<Document>;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            void assignFoto(selectedFotoId, file);
            avanzarSeleccionFoto(selectedFotoId);
          }
          break;
        }
      }
    };
    document.addEventListener('paste', handleDocumentPaste as unknown as EventListener);
    return () => document.removeEventListener('paste', handleDocumentPaste as unknown as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFotoId]);

  // --- Repuestos / plan preventivo / filtros / verificaciones ---
  const updateRow = <T extends { id: string }>(setter: Dispatch<SetStateAction<T[]>>, id: string, patch: Partial<T>) =>
    setter(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const removeRow = <T extends { id: string }>(setter: Dispatch<SetStateAction<T[]>>, id: string) =>
    setter(prev => prev.filter(r => r.id !== id));

  const addRepuesto = () => setRepuestos(prev => [...prev, { id: uid(), parte: "", cantidad: "", detalle: "" }]);
  const addPlanItem = () => setPlanPreventivo(prev => [...prev, { id: uid(), detalle: "", cantidad: "", parte: "" }]);

  // ---------------------------------------------------------------------------------------
  // Generación del documento Word
  // ---------------------------------------------------------------------------------------
  const generarDocumento = async () => {
    if (!fecha) { showToast("Selecciona la fecha del informe.", true); return; }
    if (!sitio.trim()) { showToast("Indica el nombre del sitio / emplazamiento.", true); return; }

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

      const logoDataUrl = await urlToBase64(logoPsinet);
      const coverDataUrl = await urlToBase64(logoEdificio);
      const logoBytes = dataUrlToUint8Array(logoDataUrl);
      const logoType = logoDataUrl.startsWith("data:image/png") ? "png" : "jpg";
      const coverBytes = dataUrlToUint8Array(coverDataUrl);
      const coverType = coverDataUrl.startsWith("data:image/png") ? "png" : "jpg";
      const revisadoPor = revisadoText.split("\n").map(s => s.trim()).filter(Boolean);

      const headerCellMargins = { top: 160, bottom: 160, left: 220, right: 220 };

      // Encabezado repetido en cada página del cuerpo del informe.
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
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 40 }, type: logoType })],
                    })],
                  }),
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Informe de Mantenimiento de Generador", size: 18, font: "Arial", bold: true })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sitio, size: 16, font: "Arial" })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Fecha:", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatFechaLarga(fecha), size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      // --- Portada ---
      const coverLeftChildren: docx.Paragraph[] = [
        new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 200, height: 66 }, type: logoType })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new ImageRun({ data: coverBytes, transformation: { width: 340, height: 255 }, type: coverType })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "INFORME DE MANTENIMIENTO", size: 52, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DE GENERADOR", size: 52, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sitio, bold: true, size: 36, font: "Arial", color: BLUE })] }),
      ];

      // Fecha / Creado por / Revisado por: columna angosta a la derecha, alineados a la derecha.
      const coverRightChildren: docx.Paragraph[] = [
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatFechaLarga(fecha), size: 20, font: "Arial" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Creado por:", size: 18, font: "Arial", bold: true })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: creadoNombre, size: 18, font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Cargo: ${creadoCargo}`, size: 18, font: "Arial" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Revisado por:", size: 18, font: "Arial", bold: true })] }),
        ...revisadoPor.map(line => new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: line, size: 18, font: "Arial" })] })),
      ];

      const coverTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [7000, 2360],
        borders: noBorders(),
        rows: [new TableRow({
          children: [
            new TableCell({ width: { size: 7000, type: WidthType.DXA }, borders: noBorders(), children: coverLeftChildren }),
            new TableCell({
              width: { size: 2360, type: WidthType.DXA },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
              margins: { left: 300, top: 100, bottom: 100 },
              children: coverRightChildren,
            }),
          ],
        })],
      });

      // --- Tabla REGISTRO ---
      const registroRow = (label: string, value: string) => new TableRow({
        children: [
          new TableCell({
            width: { size: 3200, type: WidthType.DXA },
            borders: cellBorders(),
            shading: { fill: "EEF1F2" },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 20 })] })],
          }),
          new TableCell({
            width: { size: 6160, type: WidthType.DXA },
            borders: cellBorders(),
            children: [new Paragraph({ children: [new TextRun({ text: value || "—", font: "Arial", size: 20 })] })],
          }),
        ],
      });

      const registroTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [3200, 6160],
        borders: cellBorders(),
        rows: [
          new TableRow({ children: [new TableCell({
            columnSpan: 2, borders: cellBorders(), shading: { fill: "0E4660" },
            children: [new Paragraph({ children: [new TextRun({ text: "REGISTRO", bold: true, color: "FFFFFF", font: "Arial", size: 21 })] })],
          })] }),
          registroRow("Cliente", cliente),
          registroRow("Nombre Emplazamiento", sitio),
          registroRow("Área", area),
          registroRow("Minera", minera),
          registroRow("Tipo de servicio", tipoServicio),
          registroRow("Ejecutante", ejecutante),
        ],
      });

      // --- Registro fotográfico: agrupado por "section", de a 2 fotos por fila ---
      const buildFotoCell = async (item: FotoItem, widthDxa: number) => {
        const children: docx.Paragraph[] = [];
        if (item.photo) {
          const { bytes, type } = await resolveImageBytes(item.photo);
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: 260, height: 260 }, type })] }));
        } else {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin foto cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] }));
        }
        children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: item.caption || "—", bold: true, size: 19, font: "Arial" })] }));
        if (item.description.trim()) {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: item.description, size: 18, font: "Arial", italics: true })] }));
        }
        return new TableCell({ width: { size: widthDxa, type: WidthType.DXA }, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children });
      };

      const fotoBlocks: (docx.Paragraph | docx.Table)[] = [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun({ text: `Registro fotográfico del mantenimiento del generador ${modeloGenerador}`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
      ];

      let seccionAnterior = "__none__";
      let primeraSeccion = true;
      for (let i = 0; i < fotos.length; ) {
        const item = fotos[i];
        if (item.section && item.section !== seccionAnterior) {
          // Cada sección nueva (salvo la primera) arranca en página limpia, para que el título
          // no quede separado de sus fotos por un salto de página automático.
          fotoBlocks.push(new Paragraph({
            heading: HeadingLevel.HEADING_2,
            keepNext: true,
            pageBreakBefore: !primeraSeccion,
            spacing: { before: 200 },
            children: [new TextRun({ text: item.section, color: BLUE, size: 22, font: "Arial", bold: true })],
          }));
          primeraSeccion = false;
        }
        seccionAnterior = item.section || seccionAnterior;

        // Agrupa de a 2 mientras compartan la misma sección.
        const pair = [item];
        const next = fotos[i + 1];
        if (next && next.section === item.section) {
          pair.push(next);
        }
        const cells = await Promise.all(pair.map(p => buildFotoCell(p, Math.floor(9360 / pair.length))));
        fotoBlocks.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          columnWidths: pair.map(() => Math.floor(9360 / pair.length)),
          rows: [new TableRow({ cantSplit: false, children: cells })],
        }));
        i += pair.length;
      }

      // --- 4. Programa de mantenimiento ---
      const repuestosTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [3120, 3120, 3120],
        borders: cellBorders(),
        rows: [
          new TableRow({ children: ["N° parte", "Cantidad", "Detalle"].map(h => new TableCell({
            borders: cellBorders(), shading: { fill: "EEF1F2" },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
          })) }),
          ...repuestos.map(r => new TableRow({ children: [r.parte, r.cantidad, r.detalle].map(v => new TableCell({
            borders: cellBorders(),
            children: [new Paragraph({ children: [new TextRun({ text: v || "—", font: "Arial", size: 20 })] })],
          })) })),
        ],
      });

      // --- 4.1 Inspección de grupo Generador ---
      const infoRow = (label: string, value: string) => new TableRow({
        children: [
          new TableCell({ width: { size: 3200, type: WidthType.DXA }, borders: cellBorders(), shading: { fill: "EEF1F2" }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 20 })] })] }),
          new TableCell({ width: { size: 6160, type: WidthType.DXA }, borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: value || "—", font: "Arial", size: 20 })] })] }),
        ],
      });

      const datosNodoTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
        rows: [
          infoRow("Nombre de sitio", sitio),
          infoRow("Nombre ejecutante", ejecutante),
          infoRow("Fecha de inspección", formatFechaLarga(fecha)),
        ],
      });

      const filtrosTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [2500, 1500, 2000, 3360],
        borders: cellBorders(),
        rows: [
          new TableRow({ children: ["Filtro", "Estado", "Tipo / N° parte", "Observaciones"].map(h => new TableCell({
            borders: cellBorders(), shading: { fill: "EEF1F2" },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
          })) }),
          ...filtros.map(f => new TableRow({ children: [f.nombre, f.estado, f.tipo, f.observaciones].map(v => new TableCell({
            borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: v || "—", font: "Arial", size: 20 })] })],
          })) })),
        ],
      });

      const horasNivelesTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
        rows: [
          infoRow("Horómetro", horometro),
          infoRow("Cantidad de partidas", cantidadPartidas),
          infoRow("Nivel de refrigerante", nivelRefrigerante),
          infoRow("Nivel de combustible", nivelCombustible),
          infoRow("Nivel de aceite", nivelAceite),
        ],
      });

      const bateriaTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
        rows: [
          infoRow("Cantidad de baterías", cantidadBaterias),
          infoRow("Capacidad batería A/HR", capacidadBateria),
          infoRow("Voltaje batería (arranque)", voltajeArranque),
          infoRow("Voltaje batería (motor encendido)", voltajeMotorEncendido),
        ],
      });

      const verificacionesTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [4160, 1600, 3600],
        borders: cellBorders(),
        rows: [
          new TableRow({ children: ["Verificación general", "Estado", "Observaciones"].map(h => new TableCell({
            borders: cellBorders(), shading: { fill: "EEF1F2" },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
          })) }),
          ...verificaciones.map(v => new TableRow({ children: [v.label, v.estado, v.observaciones].map(val => new TableCell({
            borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: val || "—", font: "Arial", size: 20 })] })],
          })) })),
        ],
      });

      // --- Conclusión + Plan preventivo ---
      const conclusionTexto =
        `Se desarrolló el plan de mantenimiento preventivo del generador ${modeloGenerador.split(" ")[0] || "—"}, ` +
        `modelo ${modeloGenerador.split(" ").slice(1).join(" ") || modeloGenerador} del sitio ${sitio}, que corresponde a las ${horasPlan || "—"} horas de funcionamiento. ` +
        `En este caso el generador contaba con ${horometro || "—"} horas de trabajo` +
        (horasProximaMantencion ? ` y su próxima mantención se realizará a las ${horasProximaMantencion} horas, de acuerdo con lo indicado por el fabricante.` : ".");

      const planTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [4160, 2600, 2600],
        borders: cellBorders(),
        rows: [
          new TableRow({ children: [new TableCell({
            columnSpan: 3, borders: cellBorders(), shading: { fill: "0E4660" },
            children: [new Paragraph({ children: [new TextRun({ text: `PLAN PREVENTIVO: ${horasPlan || "—"} HRS`, bold: true, color: "FFFFFF", font: "Arial", size: 21 })] })],
          })] }),
          new TableRow({ children: ["Detalle", "Cantidad", "N° parte"].map(h => new TableCell({
            borders: cellBorders(), shading: { fill: "EEF1F2" },
            children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
          })) }),
          ...planPreventivo.map(p => new TableRow({ children: [p.detalle, p.cantidad, p.parte].map(v => new TableCell({
            borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: v || "—", font: "Arial", size: 20 })] })],
          })) })),
        ],
      });

      const proximoTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
        rows: [
          infoRow("Fecha próximo mantenimiento", fechaProximoMantenimiento ? formatFechaLarga(fechaProximoMantenimiento) : "—"),
          infoRow("Horómetro estimado", horasProximaMantencion),
        ],
      });

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
        sections: [
          { properties: { page: { size: { width: 12240, height: 15840 } } }, children: [coverTable] },
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            headers: { default: header },
            children: [
              registroTable,
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Descripción", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: descripcionTexto, font: "Arial" })] }),
              ...(componentes.filter(c => c.trim()).length ? [
                new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Se realiza cambio de los siguientes componentes:", font: "Arial", bold: true })] }),
                ...componentes.filter(c => c.trim()).map(c => new Paragraph({ text: c, bullet: { level: 0 } })),
              ] : []),
              new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Trabajos realizados:", font: "Arial", bold: true })] }),
              ...trabajos.filter(t => t.trim()).map(t => new Paragraph({ text: t, bullet: { level: 0 } })),
              ...fotoBlocks,
              new Paragraph({ text: "", pageBreakBefore: true }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "4. Programa de mantenimiento", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: `Programa de mantenimiento según pauta de ${horasPlan || "—"} horas de funcionamiento.`, font: "Arial" })] }),
              new Paragraph({ text: "" }),
              repuestosTable,
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "4.1 Inspección de grupo Generador", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              datosNodoTable,
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: "Filtros — aceite, refrigerante, combustible", font: "Arial", bold: true })] }),
              filtrosTable,
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: "Inspección de horas y niveles", font: "Arial", bold: true })] }),
              horasNivelesTable,
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: "Batería", font: "Arial", bold: true })] }),
              bateriaTable,
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: "Verificaciones generales", font: "Arial", bold: true })] }),
              verificacionesTable,
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Conclusión", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: conclusionTexto, font: "Arial" })] }),
              new Paragraph({ text: "" }),
              planTable,
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Próximo mantenimiento programado", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              proximoTable,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const [year, month, day] = fecha.split("-");
      const sitioArchivo = sitio.trim().replace(/\s+/g, "_") || "SITIO";
      const filename = `Informe_Mantenimiento_Generador_${sitioArchivo}_${day}-${month}-${year}.docx`;
      saveAs(blob, filename);
      showToast(`Documento generado exitosamente: ${filename}`);
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo.", true);
    } finally {
      setIsGenerating(false);
    }
  };

  // ---------------------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------------------
  const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E";

  let lastSection = "__none__";

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Informe de Mantenimiento de Generador
              </div>
              <div className="site-header__meta text-xs truncate">
                Mismo formato que el informe de referencia (portada, encabezado, registro fotográfico)
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {guardandoBorrador ? (
              <span className="inline-flex items-center gap-1 font-bold text-[#0E4660]">
                <Loader2 size={12} className="animate-spin" /> Guardando borrador en la nube…
              </span>
            ) : hayBorrador ? (
              <>
                <span className="inline-flex items-center gap-1 font-bold text-[#0E4660]">
                  <Save size={12} /> Borrador guardado en la nube
                  {borradorGuardadoEn ? ` · ${new Date(borradorGuardadoEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : ''}
                </span>
                <button type="button" onClick={borrarBorrador} className="inline-flex items-center gap-1 text-gray-500 hover:text-red-700 underline">
                  <X size={12} /> Borrar borrador
                </button>
              </>
            ) : (
              <span>Se guarda como borrador (nube) apenas cargues la primera foto.</span>
            )}
          </div>
        </div>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Wrench size={18} className="panel__summary-icon" strokeWidth={2.2} />
            1. Datos generales
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Sitio / Nombre emplazamiento</label>
              <select value={sitio} onChange={e => setSitio(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white">
                {SITIO_OPCIONES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por — Nombre</label>
              <input type="text" value={creadoNombre} onChange={e => setCreadoNombre(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por — Cargo</label>
              <input type="text" value={creadoCargo} onChange={e => setCreadoCargo(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
          </div>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ClipboardList size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Registro y descripción
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Área</label>
              <input type="text" value={area} onChange={e => setArea(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
          </div>

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Descripción</label>
          <textarea value={descripcionTexto} onChange={e => setDescripcionTexto(e.target.value)} rows={4} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm mb-3" />

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Componentes cambiados</label>
          <div className="space-y-2 mb-2">
            {componentes.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={c} onChange={e => updateListItem(setComponentes, i, e.target.value)} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setComponentes, i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setComponentes)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mb-4 flex items-center gap-1"><Plus size={13} /> Agregar componente</button>

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Trabajos realizados</label>
          <div className="space-y-2 mb-2">
            {trabajos.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={t} onChange={e => updateListItem(setTrabajos, i, e.target.value)} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setTrabajos, i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setTrabajos)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1"><Plus size={13} /> Agregar trabajo (ej: Horómetro, Partidas, T° calefactor)</button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Camera size={18} className="panel__summary-icon" strokeWidth={2.2} />
            3. Registro fotográfico ({fotos.filter(f => f.photo).length}/{fotos.length})
          </summary>
          <p className="text-xs text-gray-500 mb-3">Mismos bloques que el informe de referencia (antes/después, LOTO, refrigeración, filtros, Power Command, etc). Puedes editar el título, la descripción y agregar o quitar fotos. Haz clic en una casilla y pega con Ctrl+V: la selección avanza sola a la siguiente casilla (o crea una nueva al final) para poder seguir pegando fotos de corrido.</p>
          <div className="space-y-3">
            {fotos.map(item => {
              const showSectionHeading = item.section && item.section !== lastSection;
              lastSection = item.section || lastSection;
              return (
                <div key={item.id}>
                  {showSectionHeading && <p className="text-xs font-bold text-[#0E4660] uppercase mt-2 mb-1">{item.section}</p>}
                  <div className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc] flex gap-3 items-start">
                    <div
                      onClick={() => setSelectedFotoId(item.id)}
                      className={`photo-slot w-[110px] min-w-[110px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedFotoId === item.id ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    >
                      {item.photo && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleCopiarFoto(item.photo!); }}
                          className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center z-10"
                          aria-label="Copiar imagen al portapapeles"
                          title="Copiar imagen al portapapeles"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                      <img
                        src={item.photo || placeholderImg}
                        alt=""
                        onClick={e => { if (item.photo) { e.stopPropagation(); setFotoAmpliada(item.photo); } }}
                        className={`w-full h-[80px] object-cover rounded mb-1 bg-gray-100 ${item.photo ? 'cursor-zoom-in' : ''}`}
                      />
                      <input type="file" accept="image/*" onClick={e => e.stopPropagation()} onChange={e => e.target.files?.[0] && assignFoto(item.id, e.target.files[0])} className="text-[9px] w-full" />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <input type="text" value={item.caption} onChange={e => updateFoto(item.id, { caption: e.target.value })} placeholder="Título / leyenda de la foto" className="w-full font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]" />
                      <textarea value={item.description} onChange={e => updateFoto(item.id, { description: e.target.value })} placeholder="Descripción (opcional)" rows={2} className="w-full text-xs p-1.5 border border-[#DCE1E6] rounded" />
                      <input type="text" value={item.section} onChange={e => updateFoto(item.id, { section: e.target.value })} placeholder="Encabezado de grupo (opcional, ej: Sistema de refrigeración)" className="w-full text-[11px] p-1 border border-[#DCE1E6] rounded text-gray-500" />
                    </div>
                    <button type="button" onClick={() => removeFoto(item.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <button type="button" onClick={addFoto} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar foto</button>
        </details>

        <details className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ListChecks size={18} className="panel__summary-icon" strokeWidth={2.2} />
            4. Programa de mantenimiento
          </summary>
          <div className="mb-3">
            <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Horas del plan (ej: 1750)</label>
            <input type="text" value={horasPlan} onChange={e => setHorasPlan(e.target.value)} className="w-40 p-2 border border-[#DCE1E6] rounded-md text-sm" />
          </div>
          <div className="space-y-2">
            {repuestos.map(r => (
              <div key={r.id} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2">
                <input type="text" value={r.parte} onChange={e => updateRow(setRepuestos, r.id, { parte: e.target.value })} placeholder="N° parte" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={r.cantidad} onChange={e => updateRow(setRepuestos, r.id, { cantidad: e.target.value })} placeholder="Cantidad" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={r.detalle} onChange={e => updateRow(setRepuestos, r.id, { detalle: e.target.value })} placeholder="Detalle" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeRow(setRepuestos, r.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addRepuesto} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-2 flex items-center gap-1"><Plus size={13} /> Agregar repuesto</button>
        </details>

        <details className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Gauge size={18} className="panel__summary-icon" strokeWidth={2.2} />
            5. Inspección de grupo Generador
          </summary>

          <p className="text-xs font-bold text-[#0E4660] mb-2">Filtros — aceite, refrigerante, combustible</p>
          <div className="space-y-2 mb-4">
            {filtros.map(f => (
              <div key={f.id} className="grid grid-cols-[1.4fr_0.8fr_1fr_1.4fr] gap-2">
                <input type="text" value={f.nombre} onChange={e => updateRow(setFiltros, f.id, { nombre: e.target.value })} className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={f.estado} onChange={e => updateRow(setFiltros, f.id, { estado: e.target.value })} placeholder="Estado" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={f.tipo} onChange={e => updateRow(setFiltros, f.id, { tipo: e.target.value })} placeholder="Tipo / N° parte" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={f.observaciones} onChange={e => updateRow(setFiltros, f.id, { observaciones: e.target.value })} placeholder="Observaciones" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            ))}
          </div>

          <p className="text-xs font-bold text-[#0E4660] mb-2">Horas, niveles y batería</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Horómetro</label><input type="text" value={horometro} onChange={e => setHorometro(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cantidad de partidas</label><input type="text" value={cantidadPartidas} onChange={e => setCantidadPartidas(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Nivel de refrigerante</label><input type="text" value={nivelRefrigerante} onChange={e => setNivelRefrigerante(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Nivel de combustible</label><input type="text" value={nivelCombustible} onChange={e => setNivelCombustible(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Nivel de aceite</label><input type="text" value={nivelAceite} onChange={e => setNivelAceite(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cantidad de baterías</label><input type="text" value={cantidadBaterias} onChange={e => setCantidadBaterias(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Capacidad batería A/HR</label><input type="text" value={capacidadBateria} onChange={e => setCapacidadBateria(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Voltaje batería (arranque)</label><input type="text" value={voltajeArranque} onChange={e => setVoltajeArranque(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
            <div><label className="block text-xs text-[#6B6B6B] font-bold mb-1">Voltaje batería (motor encendido)</label><input type="text" value={voltajeMotorEncendido} onChange={e => setVoltajeMotorEncendido(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" /></div>
          </div>

          <p className="text-xs font-bold text-[#0E4660] mb-2">Verificaciones generales</p>
          <div className="space-y-2">
            {verificaciones.map(v => (
              <div key={v.id} className="grid grid-cols-[1.6fr_0.8fr_1.6fr] gap-2">
                <input type="text" value={v.label} onChange={e => updateRow(setVerificaciones, v.id, { label: e.target.value })} className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={v.estado} onChange={e => updateRow(setVerificaciones, v.id, { estado: e.target.value })} placeholder="Estado" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={v.observaciones} onChange={e => updateRow(setVerificaciones, v.id, { observaciones: e.target.value })} placeholder="Observaciones" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            ))}
          </div>
        </details>

        <details className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ClipboardList size={18} className="panel__summary-icon" strokeWidth={2.2} />
            6. Conclusión y próximo mantenimiento
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Horas próxima mantención</label>
              <input type="text" value={horasProximaMantencion} onChange={e => setHorasProximaMantencion(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Fecha próximo mantenimiento</label>
              <input type="date" value={fechaProximoMantenimiento} onChange={e => setFechaProximoMantenimiento(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
          </div>
          <p className="text-xs font-bold text-[#0E4660] mb-2">Plan preventivo</p>
          <div className="space-y-2">
            {planPreventivo.map(p => (
              <div key={p.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
                <input type="text" value={p.detalle} onChange={e => updateRow(setPlanPreventivo, p.id, { detalle: e.target.value })} placeholder="Detalle" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={p.cantidad} onChange={e => updateRow(setPlanPreventivo, p.id, { cantidad: e.target.value })} placeholder="Cantidad" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={p.parte} onChange={e => updateRow(setPlanPreventivo, p.id, { parte: e.target.value })} placeholder="N° parte" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeRow(setPlanPreventivo, p.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addPlanItem} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-2 flex items-center gap-1"><Plus size={13} /> Agregar ítem</button>
        </details>

        <div className="action-zone">
          <button
            onClick={() => void generarDocumento()}
            disabled={isGenerating}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (<><Loader2 size={18} className="animate-spin" /> Generando informe...</>) : "Generar Informe de Mantenimiento"}
          </button>
        </div>
      </main>

      {toastMessage && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}

      {fotoAmpliada && <VisorFoto src={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
    </div>
  );
}