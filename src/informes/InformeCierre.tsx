import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import type * as docx from 'docx';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Loader2, FileStack, CalendarRange, ImagePlus, Trash2, CircleCheckBig, Circle,
  Plus, ListTodo, Car, Wrench, Copy,
} from 'lucide-react';
import logoPsinet from "../assets/logo_psinet.jpg";
import logoEdificio from "../assets/LogoEdificio.png";
import VisorFoto, { copiarImagenAlPortapapel } from '../componentes/VisorFoto';
import { N_CONTRATO } from '../datos/catalogos';
import { fileToDataUrl, uid } from '../lib/fotos';
import { type BorradorEntry, fetchBorradores, subscribeBorradores, esSemillaSinEditar } from '../datos/borradoresDiario';
import { type BorradorOtroEntry, fetchBorradoresOtros, upsertBorradorOtro, deleteBorradorOtro, subscribeBorradoresOtros } from '../datos/borradoresOtros';
import { formatFechaLarga, formatFechaPunto } from '../datos/fechas';
import { BLUE, ORANGE } from '../datos/plantillaWord';
import { semanaDeFecha } from '../datos/turnos';
import { dataUrlToUint8Array, resolveImageBytes, urlToBase64 } from '../lib/imagenes';
import { uploadPhotoIfNeeded } from '../lib/storage';

interface InformeCierreProps {
  onBack: () => void;
}

interface SeccionImagenes {
  id: string;
  title: string;
  photos: (string | null)[];
}

interface CamionetaEntry {
  id: string;
  placa: string;
  antes: string | null;
  despues: string | null;
}

const DEFAULT_SECCIONES_IMAGENES: SeccionImagenes[] = [
  { id: 'sec-radios', title: 'Radios de comunicación y Juego de Llaves correspondiente a sitios.', photos: [null, null, null] },
  { id: 'sec-bodega', title: 'Bodega', photos: [null, null, null, null] },
];

// Comentarios adicionales: van siempre al final del informe de cierre (ya no se editan en el formulario).
const COMENTARIOS_FINALES: string[] = [
  'ESTIMADOS QUE TENGAN UN BUEN TURNO ¡ÉXITO!',
  'EXTREMAR LAS MEDIDAS DE SEGURIDAD.',
];

const CREADO_POR_OPTIONS: { nombre: string; cargo: string }[] = [
  { nombre: "Max Diaz Cornejo.", cargo: "Supervisor" },
  { nombre: "Patricio Santana.", cargo: "Supervisor de Operaciones" },
  { nombre: "Nicolas Bahamondes.", cargo: "Tecnico Lider" },
];

// Supervisores del Turno B (mismos que en el Informe Diario).
const CREADO_POR_OPTIONS_B: { nombre: string; cargo: string }[] = [
  { nombre: "Luis Humberto Fernández Ortega", cargo: "Supervisor de Operaciones" },
  { nombre: "Camilo Andrés Pailapan Hormazabal", cargo: "Supervisor de Operaciones" },
];

const CREADO_POR_ALL = [...CREADO_POR_OPTIONS, ...CREADO_POR_OPTIONS_B];

// ---------------------------------------------------------------------------------------
// Sincronización entre dispositivos
// ---------------------------------------------------------------------------------------
// Hay un único "cierre en curso" compartido por todo el equipo (no hay login): se guarda en la
// tabla borradores_otros con tipo 'cierre' y un id fijo. Así, lo que se avanza en el PC aparece en
// el celular (y al revés), en tiempo real. Las fotos se suben al bucket de evidencias.
// La columna id es de tipo uuid, así que el id fijo del cierre compartido debe ser un UUID válido.
const CIERRE_DRAFT_ID = '00000000-0000-4000-8000-00000000c1e2';

interface DatosCierre {
  creadoNombre: string;
  creadoCargo: string;
  selectedIds: string[];
  actividadesPendientes: string[];
  seccionesImagenes: SeccionImagenes[];
  camionetas: CamionetaEntry[];
}

/** Deja los datos (venga de la nube o del estado local) siempre con la misma forma y el mismo orden de claves. */
const normalizarDatosCierre = (raw: unknown): DatosCierre => {
  const d = (raw ?? {}) as Record<string, unknown>;
  const str = (v: unknown, def: string) => (typeof v === 'string' ? v : def);
  const foto = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
  const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

  const secciones: SeccionImagenes[] = Array.isArray(d.seccionesImagenes)
    ? (d.seccionesImagenes as Record<string, unknown>[]).map(s => ({
        id: str(s.id, uid()),
        title: str(s.title, ''),
        photos: Array.isArray(s.photos) ? s.photos.map(foto) : [],
      }))
    : DEFAULT_SECCIONES_IMAGENES;

  const camionetas: CamionetaEntry[] = Array.isArray(d.camionetas)
    ? (d.camionetas as Record<string, unknown>[]).map(c => ({
        id: str(c.id, uid()),
        placa: str(c.placa, ''),
        antes: foto(c.antes),
        despues: foto(c.despues),
      }))
    : [{ id: 'camioneta-inicial', placa: '', antes: null, despues: null }];

  const pendientes = strArr(d.actividadesPendientes);

  return {
    creadoNombre: str(d.creadoNombre, CREADO_POR_OPTIONS[0].nombre),
    creadoCargo: str(d.creadoCargo, CREADO_POR_OPTIONS[0].cargo),
    selectedIds: strArr(d.selectedIds),
    actividadesPendientes: pendientes.length ? pendientes : [''],
    seccionesImagenes: secciones,
    camionetas,
  };
};

export default function InformeCierre({ onBack }: InformeCierreProps) {
  const [borradores, setBorradores] = useState<BorradorEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const preseleccionadoRef = useRef(false);
  const [creadoNombre, setCreadoNombre] = useState(CREADO_POR_OPTIONS[0].nombre);
  const [creadoCargo, setCreadoCargo] = useState(CREADO_POR_OPTIONS[0].cargo);

  // Datos fijos del cierre (ya no se editan en el formulario).
  const faena = 'Minera Rajo Inca';
  const contrato = N_CONTRATO;
  const version = '1';
  const revisadoText = 'Juan Saavedra\nJuan Morata';
  const autorizadoNombre = 'Cesar Orellana';
  const autorizadoCargo = 'ADC';
  // La letra de turno sigue al supervisor elegido en "Creado por".
  const letraTurno = CREADO_POR_OPTIONS_B.some(o => o.nombre === creadoNombre) ? 'B' : 'A';
  const [actividadesPendientes, setActividadesPendientes] = useState<string[]>(['']);
  const [seccionesImagenes, setSeccionesImagenes] = useState<SeccionImagenes[]>(DEFAULT_SECCIONES_IMAGENES);
  const [camionetas, setCamionetas] = useState<CamionetaEntry[]>([{ id: uid(), placa: '', antes: null, despues: null }]);
  const [selectedPhotoSlot, setSelectedPhotoSlot] = useState<{ type: 'seccion' | 'camionetaAntes' | 'camionetaDespues'; id: string; photoIndex?: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  const META_DIAS = 7;

  // Carga los borradores compartidos desde la nube y se suscribe a cambios de otros dispositivos.
  useEffect(() => {
    void fetchBorradores().then(setBorradores);
    return subscribeBorradores(setBorradores);
  }, []);

  // --- Cierre en curso compartido entre dispositivos (PC, celular, etc.) ---
  const [cierreCargado, setCierreCargado] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [errorSync, setErrorSync] = useState(false);
  const [ultimoGuardadoEn, setUltimoGuardadoEn] = useState<string | null>(null);
  const [subiendoFotos, setSubiendoFotos] = useState(0);
  const ultimoSnapshotRef = useRef<string | null>(null); // último contenido que sabemos que está en la nube
  const ultimoSavedAtRef = useRef<string | null>(null);  // para ignorar el "eco" de nuestro propio guardado
  const guardadoPendienteRef = useRef(false);            // hay un guardado programado (debounce)
  const guardandoRef = useRef(false);                    // hay un guardado en curso

  const aplicarDatos = (datos: DatosCierre) => {
    setCreadoNombre(datos.creadoNombre);
    setCreadoCargo(datos.creadoCargo);
    setSelectedIds(datos.selectedIds);
    setActividadesPendientes(datos.actividadesPendientes);
    setSeccionesImagenes(datos.seccionesImagenes);
    setCamionetas(datos.camionetas);
  };

  const limpiarLocal = () => {
    const vacio = normalizarDatosCierre({});
    preseleccionadoRef.current = true; // no volver a preseleccionar días automáticamente
    ultimoSnapshotRef.current = JSON.stringify(vacio);
    ultimoSavedAtRef.current = null;
    setUltimoGuardadoEn(null);
    aplicarDatos(vacio);
  };

  useEffect(() => {
    let cancelado = false;

    void fetchBorradoresOtros('cierre').then(lista => {
      if (cancelado) return;
      const guardado = lista.find(b => b.id === CIERRE_DRAFT_ID);
      if (guardado) {
        const datos = normalizarDatosCierre(guardado.datos);
        if (datos.selectedIds.length) preseleccionadoRef.current = true;
        ultimoSnapshotRef.current = JSON.stringify(datos);
        ultimoSavedAtRef.current = guardado.savedAt;
        setUltimoGuardadoEn(guardado.savedAt);
        aplicarDatos(datos);
      }
      setCierreCargado(true);
    });

    // Cambios hechos desde otro dispositivo: se aplican aquí, salvo que este equipo esté guardando algo propio.
    const desuscribir = subscribeBorradoresOtros('cierre', lista => {
      if (guardadoPendienteRef.current || guardandoRef.current) return;
      const remoto = lista.find(b => b.id === CIERRE_DRAFT_ID);
      if (!remoto) {
        // Otro dispositivo empezó un cierre nuevo (borró el actual).
        if (ultimoSavedAtRef.current) limpiarLocal();
        return;
      }
      if (remoto.savedAt === ultimoSavedAtRef.current) return;
      const datos = normalizarDatosCierre(remoto.datos);
      const snapshot = JSON.stringify(datos);
      if (snapshot === ultimoSnapshotRef.current) return;
      preseleccionadoRef.current = true;
      ultimoSnapshotRef.current = snapshot;
      ultimoSavedAtRef.current = remoto.savedAt;
      setUltimoGuardadoEn(remoto.savedAt);
      aplicarDatos(datos);
    });

    return () => { cancelado = true; desuscribir(); };
    // Solo al abrir el informe; aplicarDatos/limpiarLocal solo usan setters y refs estables.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autoguardado en la nube (debounce). Espera a que terminen de subirse las fotos nuevas.
  useEffect(() => {
    if (!cierreCargado || subiendoFotos > 0) return;
    const snapshot = JSON.stringify(normalizarDatosCierre({
      creadoNombre, creadoCargo, selectedIds, actividadesPendientes, seccionesImagenes, camionetas,
    }));
    if (snapshot === ultimoSnapshotRef.current) return;

    guardadoPendienteRef.current = true;
    const timeout = setTimeout(() => {
      guardadoPendienteRef.current = false;
      guardandoRef.current = true;
      setSincronizando(true);
      const savedAt = new Date().toISOString();
      const entry: BorradorOtroEntry = {
        id: CIERRE_DRAFT_ID,
        tipo: 'cierre',
        titulo: `Informe de Cierre — ${creadoNombre}`,
        fecha: savedAt.slice(0, 10),
        savedAt,
        datos: JSON.parse(snapshot) as Record<string, unknown>,
      };
      upsertBorradorOtro(entry)
        .then(() => {
          ultimoSnapshotRef.current = snapshot;
          ultimoSavedAtRef.current = savedAt;
          setUltimoGuardadoEn(savedAt);
          setErrorSync(false);
        })
        .catch(error => {
          console.error('No se pudo guardar el cierre en la nube:', error);
          setErrorSync(true);
          showToast('No se pudo sincronizar el cierre con la nube. Revisa tu conexión.', true);
        })
        .finally(() => {
          guardandoRef.current = false;
          setSincronizando(false);
        });
    }, 800);
    return () => { clearTimeout(timeout); guardadoPendienteRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cierreCargado, subiendoFotos, creadoNombre, creadoCargo, selectedIds, actividadesPendientes, seccionesImagenes, camionetas]);

  /** Sube una foto recién cargada al bucket y, cuando termina, cambia la copia local por su URL (así no se re-sube en cada guardado). */
  const subirFotoEnSegundoPlano = async (dataUrl: string, reemplazar: (url: string) => void) => {
    setSubiendoFotos(n => n + 1);
    try {
      const url = await uploadPhotoIfNeeded(dataUrl, `cierre/${CIERRE_DRAFT_ID}`);
      if (url && url !== dataUrl) reemplazar(url);
    } catch {
      // Se reintenta sola en el próximo guardado del cierre (que sube las fotos pendientes).
      showToast('No se pudo subir una foto. Se reintentará al guardar.', true);
    } finally {
      setSubiendoFotos(n => n - 1);
    }
  };

  const nuevoCierre = () => {
    if (!window.confirm('¿Empezar un cierre nuevo? Se borrará el cierre en curso (textos y fotos) en todos los dispositivos.')) return;
    limpiarLocal();
    deleteBorradorOtro(CIERRE_DRAFT_ID).catch(error => {
      console.error('No se pudo eliminar el cierre en la nube:', error);
      showToast('No se pudo eliminar el cierre en la nube.', true);
    });
    showToast('Cierre nuevo listo.');
  };

  // Preselecciona automáticamente los días de la semana de turno más reciente (solo la primera vez que llegan datos).
  // El Informe de Cierre es exclusivo de Turno Día; los informes de Turno Noche tienen su propio cierre.
  // Los borradores automáticos que nadie ha abierto todavía ("pendientes") no cuentan.
  useEffect(() => {
    if (preseleccionadoRef.current) return;
    const iniciados = borradores
      .filter(b => b.turno === 'dia' && !esSemillaSinEditar(b))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (iniciados.length === 0) return;
    preseleccionadoRef.current = true;
    const semana = semanaDeFecha(iniciados[iniciados.length - 1].fecha);
    const deLaSemana = iniciados.filter(b => b.fecha >= semana.inicio && b.fecha <= semana.fin);
    setSelectedIds((deLaSemana.length ? deLaSemana : iniciados).slice(-META_DIAS).map(b => b.id));
  }, [borradores]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (text: string, isError?: boolean) => setToastMessage({ text, isError });

  const handleCopiarFoto = async (src: string | null | undefined) => {
    if (!src) return;
    const ok = await copiarImagenAlPortapapel(src);
    showToast(ok ? "Imagen copiada al portapapeles." : "No se pudo copiar la imagen.", !ok);
  };

  // El Informe de Cierre solo consolida Turno Día; Turno Noche queda fuera de esta selección.
  const ordenadosPorFecha = useMemo(
    () => borradores.filter(b => b.turno === 'dia' && !esSemillaSinEditar(b)).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [borradores]
  );

  const diasSeleccionados = useMemo(
    () => ordenadosPorFecha.filter(b => selectedIds.includes(b.id)),
    [ordenadosPorFecha, selectedIds]
  );

  const toggleDia = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= META_DIAS) {
        showToast(`Solo puedes incluir hasta ${META_DIAS} días en el informe de cierre.`, true);
        return prev;
      }
      return [...prev, id];
    });
  };

  const rangoFechas = useMemo(() => {
    if (!diasSeleccionados.length) return null;
    const inicio = diasSeleccionados[0].fecha;
    const fin = diasSeleccionados[diasSeleccionados.length - 1].fecha;
    return { inicio, fin };
  }, [diasSeleccionados]);

  // Evidencia fotográfica para Reportabilidad GG: la foto del "Registro de mantenimiento de GG."
  // del último día incluido. Si ese día no tiene foto, se usa la del día anterior más cercano que sí la tenga.
  const fotoReportabilidad = useMemo(() => {
    for (let i = diasSeleccionados.length - 1; i >= 0; i--) {
      const dia = diasSeleccionados[i];
      const block = dia.evidenceBlocks.find(b => {
        const t = b.title.trim().toLowerCase();
        return t.startsWith('registro de mantenimiento de gg.') || t === 'reportabilidad gg.';
      });
      const photo = block?.photos.find((p): p is string => Boolean(p));
      if (photo) return { src: photo, fecha: dia.fecha, esUltimoDia: i === diasSeleccionados.length - 1 };
    }
    return null;
  }, [diasSeleccionados]);

  const turnoLabel = useMemo(() => {
    const noches = diasSeleccionados.filter(d => d.turno === 'noche').length;
    return noches > diasSeleccionados.length / 2 ? 'Noche' : 'Dia';
  }, [diasSeleccionados]);

  // Solo el personal del último día incluido en el cierre (diasSeleccionados está ordenado por fecha).
  const personalUltimoDia = useMemo(() => {
    const ultimo = diasSeleccionados[diasSeleccionados.length - 1];
    if (!ultimo) return [];
    const vistos = new Set<string>();
    const lista: { nombre: string; cargo: string }[] = [];
    ultimo.personal.forEach(p => {
      const nombre = p.nombre.trim();
      if (!nombre || vistos.has(nombre)) return;
      vistos.add(nombre);
      lista.push({ nombre, cargo: p.cargo });
    });
    return lista;
  }, [diasSeleccionados]);

  const addPendiente = () => setActividadesPendientes(prev => [...prev, '']);
  const updatePendiente = (i: number, value: string) => setActividadesPendientes(prev => prev.map((v, idx) => idx === i ? value : v));
  const removePendiente = (i: number) => setActividadesPendientes(prev => prev.filter((_, idx) => idx !== i));

  const addSeccionImagenes = () => setSeccionesImagenes(prev => [...prev, { id: uid(), title: '', photos: [null] }]);
  const removeSeccionImagenes = (id: string) => setSeccionesImagenes(prev => prev.filter(s => s.id !== id));
  const updateSeccionTitle = (id: string, title: string) => setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  const addFotoASeccion = (id: string) => setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: [...s.photos, null] } : s));
  const removeFotoDeSeccion = (id: string, photoIndex: number) => setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: s.photos.filter((_, i) => i !== photoIndex) } : s));
  const assignFotoSeccion = async (file: File, id: string, photoIndex: number) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: s.photos.map((p, i) => i === photoIndex ? dataUrl : p) } : s));
      void subirFotoEnSegundoPlano(dataUrl, url =>
        setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: s.photos.map(p => p === dataUrl ? url : p) } : s))
      );
    } catch (error) {
      console.error(error);
      showToast("No se pudo cargar la imagen.", true);
    }
  };

  const addCamioneta = () => setCamionetas(prev => [...prev, { id: uid(), placa: '', antes: null, despues: null }]);
  const removeCamioneta = (id: string) => setCamionetas(prev => prev.filter(c => c.id !== id));
  const updateCamionetaPlaca = (id: string, placa: string) => setCamionetas(prev => prev.map(c => c.id === id ? { ...c, placa } : c));
  const assignCamionetaFoto = async (file: File, id: string, cual: 'antes' | 'despues') => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setCamionetas(prev => prev.map(c => c.id === id ? { ...c, [cual]: dataUrl } : c));
      void subirFotoEnSegundoPlano(dataUrl, url =>
        setCamionetas(prev => prev.map(c => c.id === id && c[cual] === dataUrl ? { ...c, [cual]: url } : c))
      );
    } catch (error) {
      console.error(error);
      showToast("No se pudo cargar la imagen.", true);
    }
  };

  useEffect(() => {
    const handleDocumentPaste = (event: Event) => {
      if (!selectedPhotoSlot) return;
      const clipboardEvent = event as unknown as ClipboardEvent<Document>;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (selectedPhotoSlot.type === 'seccion' && selectedPhotoSlot.photoIndex !== undefined) {
              void assignFotoSeccion(file, selectedPhotoSlot.id, selectedPhotoSlot.photoIndex);
            } else if (selectedPhotoSlot.type === 'camionetaAntes') {
              void assignCamionetaFoto(file, selectedPhotoSlot.id, 'antes');
            } else if (selectedPhotoSlot.type === 'camionetaDespues') {
              void assignCamionetaFoto(file, selectedPhotoSlot.id, 'despues');
            }
          }
          break;
        }
      }
    };
    document.addEventListener('paste', handleDocumentPaste as unknown as EventListener);
    return () => document.removeEventListener('paste', handleDocumentPaste as unknown as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhotoSlot]);

  const generarInformeCierre = async () => {
    if (diasSeleccionados.length === 0) {
      showToast("Selecciona al menos un día para generar el informe de cierre.", true);
      return;
    }

    setIsGenerating(true);
    try {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, ImageRun, WidthType, BorderStyle, AlignmentType,
        HeadingLevel, VerticalAlign, TableLayoutType,
      } = await import('docx'); // se descarga solo al generar el Word (la app abre más rápido)

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

      const buildEvidenceImgParagraph = (photo: string | null, width: number, height: number) => {
        if (!photo) {
          return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin evidencia cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] });
        }
        const bytes = dataUrlToUint8Array(photo);
        const type = photo.startsWith("data:image/png") ? "png" : "jpg";
        return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width, height }, type })] });
      };

      const fechaEncabezado = rangoFechas ? formatFechaLarga(rangoFechas.fin) : formatFechaLarga(new Date().toISOString().split("T")[0]);

      // Encabezado repetido en todas las páginas, incluida la portada.
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
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBytes, transformation: { width: 110, height: 36 }, type: logoType })] })],
                  }),
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Reporte", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Reporte de entrega de turno", size: 20, font: "Arial", bold: true })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "N° Contrato:", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contrato, size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versión: " + version, size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fechaEncabezado, size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const rangoSubtitulo = rangoFechas
        ? `SEMANA ${formatFechaPunto(rangoFechas.inicio)} AL ${formatFechaPunto(rangoFechas.fin)}`
        : "";

      const coverChildren: docx.Paragraph[] = [
        new Paragraph({ children: [new ImageRun({ data: coverBytes, transformation: { width: 496, height: 372 }, type: coverType })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `INFORME DE CIERRE DE TURNO ${letraTurno}`, size: 44, font: "Arial", bold: true, color: "1F5C85" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rangoSubtitulo, size: 34, font: "Arial", bold: true, color: "1F5C85" })] }),
      ];

      const coverTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [7000, 2360],
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 7000, type: WidthType.DXA }, borders: noBorders(), children: coverChildren }),
              new TableCell({
                width: { size: 2360, type: WidthType.DXA },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
                margins: { left: 300, top: 100, bottom: 100 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: fechaEncabezado, size: 24, font: "Arial", color: "000000" })] }),
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
              }),
            ],
          }),
        ],
      });

      const descripcionParrafo = rangoFechas
        ? `Este documento detalla las actividades realizadas durante las jornadas entre el ${formatFechaLarga(rangoFechas.inicio)} al ${formatFechaLarga(rangoFechas.fin)}, correspondientes al Turno ${letraTurno} en ${faena}.`
        : `Este documento detalla las actividades realizadas durante el Turno ${letraTurno} en ${faena}.`;

      const personalTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [3900, 5460],
        borders: noBorders(),
        rows: personalUltimoDia.map(p => new TableRow({
          children: [
            new TableCell({ width: { size: 3900, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ text: p.nombre, bullet: { level: 0 } })] }),
            new TableCell({ width: { size: 5460, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ text: p.cargo })] }),
          ],
        })),
      });

      let seccionNum = 1;

      const seccion1: (docx.Paragraph | docx.Table)[] = [
        new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun({ text: `${seccionNum++}) Descripción de actividades realizas en el turno`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: descripcionParrafo, font: "Arial" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: `Personal de turno ${letraTurno} - ${turnoLabel}.`, color: BLUE, size: 24, font: "Arial", bold: true })] }),
        new Paragraph({ text: "" }),
        ...(personalUltimoDia.length
          ? [personalTable]
          : [new Paragraph({ children: [new TextRun({ text: "(Sin personal registrado en el último día)", italics: true, color: "999999", font: "Arial" })] })]),
      ];

      const seccion2: (docx.Paragraph | docx.Table)[] = [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Actividades realizadas en el turno.`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
      ];

      for (const [idx, dia] of diasSeleccionados.entries()) {
        seccion2.push(
          new Paragraph({ text: "", pageBreakBefore: idx > 0 }),
          new Paragraph({ children: [new TextRun({ text: `Fecha:  ${formatFechaLarga(dia.fecha)} (Turno ${dia.turno === 'noche' ? 'Noche' : 'Día'})`, underline: {}, bold: true, size: 26, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Actividades Diarias.", color: BLUE, size: 22, font: "Arial", bold: true })] }),
          ...dia.actividades.filter(a => a.trim()).map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Observaciones.", color: BLUE, size: 22, font: "Arial", bold: true })] }),
          ...dia.observaciones.filter(o => o.trim()).map(o => new Paragraph({ text: o, bullet: { level: 0 } })),
        );

        // El cierre solo lista las actividades y observaciones de cada día; la evidencia
        // fotográfica de los informes diarios (y el bloque Vertiv) no se incluye aquí.
      }


      // Las fotos ya sincronizadas son URLs de la nube: se convierten a dataURL para insertarlas en el .docx.
      const aDataUrl = async (p: string | null) => (p && p.startsWith('http') ? await urlToBase64(p) : p);
      const seccionesResueltas = await Promise.all(seccionesImagenes.map(async s => ({ ...s, photos: await Promise.all(s.photos.map(aDataUrl)) })));
      const camionetasResueltas = await Promise.all(camionetas.map(async c => ({ ...c, antes: await aDataUrl(c.antes), despues: await aDataUrl(c.despues) })));

      const pendientesFiltradas = actividadesPendientes.filter(a => a.trim());
      const seccion3: docx.Paragraph[] = [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Actividades Pendientes.`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
        ...(pendientesFiltradas.length
          ? pendientesFiltradas.map(a => new Paragraph({ text: a, bullet: { level: 0 } }))
          : [new Paragraph({ children: [new TextRun({ text: "Sin actividades pendientes.", italics: true, color: "999999", font: "Arial" })] })]),
      ];

      const seccionesImg: (docx.Paragraph | docx.Table)[] = seccionesResueltas.flatMap(seccion => {
        const usablePhotos = seccion.photos.filter((p): p is string => Boolean(p));
        if (!seccion.title.trim() && usablePhotos.length === 0) return [];
        const rows: docx.TableRow[] = [];
        for (let i = 0; i < usablePhotos.length; i += 2) {
          const pair = usablePhotos.slice(i, i + 2);
          const colWidth = Math.floor(100 / pair.length);
          rows.push(new TableRow({
            children: pair.map(photo => {
              const bytes = dataUrlToUint8Array(photo);
              const type = photo.startsWith("data:image/png") ? "png" : "jpg";
              return new TableCell({
                width: { size: colWidth, type: WidthType.PERCENTAGE },
                borders: cellBorders(),
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: pair.length === 1 ? 500 : 280, height: pair.length === 1 ? 375 : 210 }, type })] })],
              });
            }),
          }));
        }
        return [
          new Paragraph({ text: "", pageBreakBefore: true }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) ${seccion.title || "Imágenes"}`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
          ...(usablePhotos.length ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [4680, 4680], rows })] : [new Paragraph({ children: [new TextRun({ text: "(Sin imágenes cargadas)", italics: true, color: "999999", font: "Arial" })] })]),
        ];
      });

      const camionetasValidas = camionetasResueltas.filter(c => c.placa.trim() || c.antes || c.despues);
      const seccionCamionetas: (docx.Paragraph | docx.Table)[] = camionetasValidas.length ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Camionetas`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
        ...camionetasValidas.flatMap(c => [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [4680, 4680],
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders: cellBorders(), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ANTES", bold: true, font: "Arial" })] })] }),
                  new TableCell({ borders: cellBorders(), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DESPUES", bold: true, font: "Arial" })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [buildEvidenceImgParagraph(c.antes, 280, 210)] }),
                  new TableCell({ borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [buildEvidenceImgParagraph(c.despues, 280, 210)] }),
                ],
              }),
              new TableRow({
                children: [new TableCell({
                  columnSpan: 2,
                  borders: cellBorders(),
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.placa || "—", bold: true, font: "Arial" })] })],
                })],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        ]),
      ] : [];

      const reportabilidadImg: docx.Paragraph[] = [];
      if (fotoReportabilidad) {
        const { bytes, type } = await resolveImageBytes(fotoReportabilidad.src);
        reportabilidadImg.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: 614, height: 246 }, type })] }));
      }
      const fechaReportabilidad = fotoReportabilidad ? formatFechaLarga(fotoReportabilidad.fecha) : fechaEncabezado;

      const seccionReportabilidad: (docx.Paragraph | docx.Table)[] = fotoReportabilidad ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        ...reportabilidadImg,
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Reportabilidad de GG fecha ${fechaReportabilidad}.`, bold: true, font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "REPORTABILIDAD GG", bold: true, color: BLUE, size: 26, font: "Arial" })] }),
      ] : [];

      const comentariosFiltrados = COMENTARIOS_FINALES.filter(c => c.trim());
      const seccionComentarios: docx.Paragraph[] = comentariosFiltrados.length ? [
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Comentarios Adicionales.", color: BLUE, size: 24, font: "Arial", bold: true })] }),
        ...comentariosFiltrados.map(c => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c, bold: true, color: BLUE, font: "Arial" })] })),
      ] : [];

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
        sections: [
          {
            // titlePage: la primera página (portada) usa un encabezado vacío; el resto usa el encabezado normal.
            properties: { titlePage: true, page: { size: { width: 12240, height: 15840 } } },
            headers: { default: header, first: new Header({ children: [new Paragraph({ text: "" })] }) },
            children: [
              coverTable,
              ...seccion1,
              ...seccion2,
              ...seccion3,
              ...seccionesImg,
              ...seccionCamionetas,
              ...seccionReportabilidad,
              ...seccionComentarios,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const nombreArchivo = rangoFechas
        ? `Reporte de cierre semana al ${formatFechaPunto(rangoFechas.inicio)} al ${formatFechaPunto(rangoFechas.fin)} -Turno ${letraTurno}.docx`
        : `Reporte de cierre -Turno ${letraTurno}.docx`;
      saveAs(blob, nombreArchivo);
      showToast(`Documento generado exitosamente: ${nombreArchivo}`);
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo de cierre.", true);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen text-[#222] font-sans pb-24">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Informe de Cierre Semanal
              </div>
              <div className="site-header__meta text-xs truncate">
                Une los 7 días del turno en un solo documento
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <div className="flex items-center gap-2 text-[11px] text-gray-500">
            <span className={errorSync ? 'text-red-700 font-bold' : ''}>
              {!cierreCargado
                ? 'Cargando cierre…'
                : errorSync
                  ? 'Sin sincronizar — revisa tu conexión'
                  : sincronizando || subiendoFotos > 0
                    ? 'Guardando en la nube…'
                    : ultimoGuardadoEn
                      ? `Sincronizado · ${new Date(ultimoGuardadoEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`
                      : 'Se guarda solo en la nube'}
            </span>
            <button type="button" onClick={nuevoCierre} className="btn-outline text-[#0E4660] px-2.5 py-1 rounded-md text-[11px] font-bold hover:bg-[#d5e7f8]">
              Cierre nuevo
            </button>
          </div>
        </div>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <FileStack size={18} className="panel__summary-icon" strokeWidth={2.2} />
            1. Datos generales del cierre
          </summary>
          <div>
            <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por</label>
            <select
              value={creadoNombre}
              onChange={e => {
                const selected = CREADO_POR_ALL.find(option => option.nombre === e.target.value);
                if (selected) { setCreadoNombre(selected.nombre); setCreadoCargo(selected.cargo); }
              }}
              className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
            >
              <optgroup label="Turno A">
                {CREADO_POR_OPTIONS.map(option => (
                  <option key={option.nombre} value={option.nombre}>{option.nombre}</option>
                ))}
              </optgroup>
              <optgroup label="Turno B">
                {CREADO_POR_OPTIONS_B.map(option => (
                  <option key={option.nombre} value={option.nombre}>{option.nombre}</option>
                ))}
              </optgroup>
            </select>
          </div>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <CalendarRange size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Días incluidos — Turno Día ({selectedIds.length}/{META_DIAS})
          </summary>
          <p className="text-xs text-gray-500 mb-3">El Informe de Cierre solo consolida los informes de Turno Día; los de Turno Noche no se muestran aquí.</p>
          {ordenadosPorFecha.length === 0 ? (
            <p className="text-sm text-gray-500">No hay borradores de Turno Día guardados todavía. Genera algunos Informes Diarios primero.</p>
          ) : (
            <div className="space-y-2">
              {ordenadosPorFecha.map(dia => {
                const checked = selectedIds.includes(dia.id);
                return (
                  <button
                    type="button"
                    key={dia.id}
                    onClick={() => toggleDia(dia.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${checked ? 'border-[#0E4660] bg-[#E8F1FB]' : 'border-[#DCE1E6] bg-white hover:bg-gray-50'}`}
                  >
                    {checked ? <CircleCheckBig size={18} className="text-[#0E4660] flex-shrink-0" /> : <Circle size={18} className="text-gray-300 flex-shrink-0" />}
                    <span className="text-sm font-bold text-[#0E4660]">{formatFechaLarga(dia.fecha)}</span>
                    <span className="text-xs text-gray-500">Turno {dia.letraTurno} · Día</span>
                  </button>
                );
              })}
            </div>
          )}
          {ordenadosPorFecha.length < META_DIAS && (
            <p className="text-[11px] text-[#856404] bg-[#FFF3CD] border border-[#FFEEBA] rounded-md px-2 py-1 mt-3">
              Aún no tienes los {META_DIAS} días de Turno Día de la semana guardados como borrador. Puedes generar el cierre igualmente con los días disponibles.
            </p>
          )}
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ListTodo size={18} className="panel__summary-icon" strokeWidth={2.2} />
            3. Actividades pendientes
          </summary>
          <p className="text-xs text-gray-500 mb-3">Tareas que quedan pendientes para el siguiente turno. Se exportan en la sección "Actividades Pendientes", justo después de las actividades diarias. Presiona Enter para agregar otra.</p>
          <div className="space-y-2">
            {actividadesPendientes.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={a} onChange={e => updatePendiente(i, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPendiente(); } }} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" placeholder="Ej: Verificar movimiento de carro LTE_11" />
                <button type="button" onClick={() => removePendiente(i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addPendiente} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-2 flex items-center gap-1"><Plus size={13} /> Agregar pendiente</button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ImagePlus size={18} className="panel__summary-icon" strokeWidth={2.2} />
            4. Secciones de imágenes (Radios, Bodega, etc.)
          </summary>
          <p className="text-xs text-gray-500 mb-3">Agrega las secciones de imágenes que solicita el informe de cierre. Puedes renombrarlas, agregar más fotos o crear nuevas secciones. Soporta pegar con Ctrl+V al hacer clic en una casilla.</p>
          <div className="space-y-4">
            {seccionesImagenes.map(seccion => (
              <div key={seccion.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={seccion.title}
                    onChange={e => updateSeccionTitle(seccion.id, e.target.value)}
                    placeholder="Título de la sección"
                    className="flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]"
                  />
                  <button type="button" onClick={() => removeSeccionImagenes(seccion.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
                </div>
                <div className="overflow-x-auto pb-2">
                  <div className="flex flex-nowrap gap-2.5 items-center min-w-max">
                    {seccion.photos.map((src, pi) => (
                      <div
                        key={pi}
                        onClick={() => setSelectedPhotoSlot({ type: 'seccion', id: seccion.id, photoIndex: pi })}
                        className={`photo-slot w-[130px] min-w-[130px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedPhotoSlot?.type === 'seccion' && selectedPhotoSlot.id === seccion.id && selectedPhotoSlot.photoIndex === pi ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                      >
                        <button type="button" onClick={e => { e.stopPropagation(); removeFotoDeSeccion(seccion.id, pi); }} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700">
                          <Trash2 size={12} />
                        </button>
                        {src && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleCopiarFoto(src); }}
                            className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center z-10"
                            aria-label="Copiar imagen al portapapeles"
                            title="Copiar imagen al portapapeles"
                          >
                            <Copy size={12} />
                          </button>
                        )}
                        <img
                          src={src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"}
                          alt=""
                          onClick={e => { if (src) { e.stopPropagation(); setFotoAmpliada(src); } }}
                          className={`w-[110px] h-[82px] object-cover rounded mx-auto mb-1 bg-gray-100 ${src ? 'cursor-zoom-in' : ''}`}
                        />
                        <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignFotoSeccion(e.target.files[0], seccion.id, pi)} className="text-[9px] w-full" />
                      </div>
                    ))}
                    <button type="button" onClick={() => addFotoASeccion(seccion.id)} className="btn-outline text-[#0E4660] px-2.5 py-1.5 rounded text-xs font-bold hover:bg-[#d5e7f8]">+ Foto</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addSeccionImagenes} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar sección de imágenes</button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Car size={18} className="panel__summary-icon" strokeWidth={2.2} />
            5. Camionetas (antes / después)
          </summary>
          <div className="space-y-3">
            {camionetas.map(c => (
              <div key={c.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input type="text" value={c.placa} onChange={e => updateCamionetaPlaca(c.id, e.target.value)} placeholder="Patente (ej: VCTF84)" className="flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]" />
                  <button type="button" onClick={() => removeCamioneta(c.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['antes', 'despues'] as const).map(cual => (
                    <div
                      key={cual}
                      onClick={() => setSelectedPhotoSlot({ type: cual === 'antes' ? 'camionetaAntes' : 'camionetaDespues', id: c.id })}
                      className={`photo-slot text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedPhotoSlot?.id === c.id && selectedPhotoSlot.type === (cual === 'antes' ? 'camionetaAntes' : 'camionetaDespues') ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    >
                      <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1">{cual}</span>
                      {c[cual] && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleCopiarFoto(c[cual]); }}
                          className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center z-10"
                          aria-label="Copiar imagen al portapapeles"
                          title="Copiar imagen al portapapeles"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                      <img
                        src={c[cual] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='90'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"}
                        alt={cual}
                        onClick={e => { if (c[cual]) { e.stopPropagation(); setFotoAmpliada(c[cual]); } }}
                        className={`w-full h-[90px] object-cover rounded mb-1 bg-gray-100 ${c[cual] ? 'cursor-zoom-in' : ''}`}
                      />
                      <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignCamionetaFoto(e.target.files[0], c.id, cual)} className="text-[9px] w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addCamioneta} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar camioneta</button>
        </details>

        <details className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Wrench size={18} className="panel__summary-icon" strokeWidth={2.2} />
            6. Reportabilidad GG
          </summary>
          <p className="text-xs text-gray-500 mb-3">Solo lleva la evidencia fotográfica del último día.</p>
          <div className="mb-3 p-3 border border-dashed border-[#DCE1E6] rounded-lg bg-[#fafbfc]">
            <p className="text-xs font-bold text-[#6B6B6B] mb-2">Evidencia fotográfica (automática)</p>
            {fotoReportabilidad ? (
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0 group">
                  <img
                    src={fotoReportabilidad.src}
                    alt="Evidencia Reportabilidad GG"
                    onClick={() => setFotoAmpliada(fotoReportabilidad.src)}
                    className="w-[140px] h-[70px] object-cover rounded border border-[#DCE1E6] bg-gray-100 cursor-zoom-in"
                  />
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); handleCopiarFoto(fotoReportabilidad.src); }}
                    className="absolute top-0.5 left-0.5 bg-black/55 group-hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center"
                    aria-label="Copiar imagen al portapapeles"
                    title="Copiar imagen al portapapeles"
                  >
                    <Copy size={12} />
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  Se toma del Registro de mantenimiento de GG del informe del {formatFechaLarga(fotoReportabilidad.fecha)}.
                  {!fotoReportabilidad.esUltimoDia && ' El último día seleccionado no tiene esa foto, por eso se usa la del día anterior más cercano.'}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-[#856404] bg-[#FFF3CD] border border-[#FFEEBA] rounded-md px-2 py-1">
                Ninguno de los días seleccionados tiene foto en "Registro de mantenimiento de GG.". Cárgala en el informe diario del último día y aparecerá aquí.
              </p>
            )}
          </div>
        </details>

        <div className="action-zone">
          <button
            onClick={generarInformeCierre}
            disabled={isGenerating}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (<><Loader2 size={18} className="animate-spin" /> Generando informe de cierre...</>) : "Generar Informe de Cierre"}
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