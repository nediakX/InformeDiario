import CuentaCabecera from '../componentes/CuentaCabecera';
import { useState, useEffect, useRef, type Dispatch, type SetStateAction, type ClipboardEvent } from 'react';
import { saveAs } from 'file-saver';
import { registrarActividad } from '../lib/actividad';
import {
  ArrowLeft, Loader2, Wrench, ClipboardList, Camera, Gauge, ListChecks, Plus, Trash2, Save, X, Copy, Image as ImageIcon, ScanLine, CheckCircle2, RotateCcw,
} from 'lucide-react';
import EscanerDocumento from '../componentes/EscanerDocumento';
import { pareceDocumento } from '../lib/documentosEscaneables';
import logoPsinet from "../assets/logo_psinet.png";
import logoEdificio from "../assets/LogoEdificio.png";
import VisorFoto from '../componentes/VisorFoto';
import { fotoConBloque, type FotoAmpliada } from '../componentes/fotosDelVisor';
import { copiarImagenAlPortapapel } from '../lib/copiarImagen';
import { fileToDataUrl, uid } from '../lib/fotos';
import { type BorradorOtroEntry, upsertBorradorOtro, deleteBorradorOtro, contarFotosGenerico } from '../datos/borradoresOtros';
import { marcarFinalizado, mensajeErrorFinalizar } from '../datos/finalizarInforme';
import BotonAccionesInforme from '../componentes/BotonAccionesInforme';
import { borrandose, registrarDeshacer, reinsertar } from '../lib/deshacer';
import { hoyLocalISO } from '../datos/fechas';
import { configDivision } from '../datos/divisiones';
import { useSesion } from '../auth/sesion';
import { mapaFotosSubidas, aplicarFotosSubidas } from '../lib/storage';
import { precargarGeneracionWord } from '../lib/docxRecursos';
import {
  type ChecklistItem, type FiltroItem, type FotoItem, type ParteItem, type PlanItem,
  DEFAULT_COMPONENTES, DEFAULT_FILTROS, DEFAULT_FOTOS, DEFAULT_PLAN, DEFAULT_REPUESTOS, DEFAULT_TRABAJOS, DEFAULT_VERIFICACIONES,
  VALORES_INICIALES, faltaParaWordMantenimiento, generarWordMantenimiento, nombreArchivoMantenimiento, withIds,
} from './mantenimiento/word';

interface InformeMantenimientoProps {
  onBack: () => void;
  /** Borrador ya guardado en la nube que se debe abrir (viene de "Borradores" o de "Continuar" en el Panel). null/undefined = informe nuevo. */
  borradorInicial?: BorradorOtroEntry | null;
}


/** Sección de la foto anterior que tiene sección (las fotos sin sección siguen con la de antes). */
function seccionAnterior(fotos: FotoItem[], indice: number): string {
  for (let i = indice - 1; i >= 0; i--) {
    const seccion = fotos[i].section;
    if (seccion) return seccion;
  }
  return "__none__";
}

export default function InformeMantenimiento({ onBack, borradorInicial = null }: InformeMantenimientoProps) {
  const { division } = useSesion();
  const config = configDivision(division).mantenimiento;
  // Listado de carros / sitios de la división (el mismo que usa el Informe de Falla). Al elegir el
  // sitio se rellena sola el campo "Área" del REGISTRO con su ubicación, si se conoce.
  const { carros, ubicacionPorCarro } = configDivision(division);
  const SITIO_OPCIONES: string[] = carros.map(c => c.replace(/_/g, " "));
  const ubicacionDeSitio = (sitio: string) => ubicacionPorCarro[sitio.trim().replace(/\s+/g, "_")] ?? "";
  const sitioInicial = SITIO_OPCIONES[0];

  // --- Datos generales / portada ---
  const [fecha, setFecha] = useState<string>(() => hoyLocalISO());
  const [creadoNombre, setCreadoNombre] = useState(config.creado.nombre);
  const [creadoCargo, setCreadoCargo] = useState(config.creado.cargo);
  const [revisadoText, setRevisadoText] = useState(config.revisadoText);
  const [sitio, setSitio] = useState(sitioInicial);
  const [modeloGenerador, setModeloGenerador] = useState(VALORES_INICIALES.modeloGenerador);

  // --- Tabla REGISTRO ---
  const [cliente, setCliente] = useState(config.cliente);
  const [area, setArea] = useState(() => ubicacionDeSitio(sitioInicial));
  const [minera, setMinera] = useState(config.minera);
  const [tipoServicio, setTipoServicio] = useState(VALORES_INICIALES.tipoServicio);
  const [ejecutante, setEjecutante] = useState(config.ejecutante);

  // --- Descripción ---
  const [descripcionTexto, setDescripcionTexto] = useState(VALORES_INICIALES.descripcionTexto);
  const [componentes, setComponentes] = useState<string[]>(DEFAULT_COMPONENTES);
  const [trabajos, setTrabajos] = useState<string[]>(DEFAULT_TRABAJOS);

  // --- Registro fotográfico ---
  const [fotos, setFotos] = useState<FotoItem[]>(() => withIds(DEFAULT_FOTOS).map(f => ({ ...f, photo: null })));
  // Referencia siempre actualizada a "fotos", para que el handler de pegado (Ctrl+V) no use una lista desactualizada.
  const fotosRef = useRef<FotoItem[]>(fotos);
  useEffect(() => { fotosRef.current = fotos; }, [fotos]);

  // --- Programa de mantenimiento ---
  const [horasPlan, setHorasPlan] = useState(VALORES_INICIALES.horasPlan);
  const [repuestos, setRepuestos] = useState<ParteItem[]>(() => withIds(DEFAULT_REPUESTOS));

  // --- 4.1 Inspección de grupo generador ---
  const [filtros, setFiltros] = useState<FiltroItem[]>(() => withIds(DEFAULT_FILTROS));
  const [horometro, setHorometro] = useState("");
  const [cantidadPartidas, setCantidadPartidas] = useState("");
  const [nivelRefrigerante, setNivelRefrigerante] = useState(VALORES_INICIALES.nivelRefrigerante);
  const [nivelCombustible, setNivelCombustible] = useState(VALORES_INICIALES.nivelCombustible);
  const [nivelAceite, setNivelAceite] = useState(VALORES_INICIALES.nivelAceite);
  const [cantidadBaterias, setCantidadBaterias] = useState(VALORES_INICIALES.cantidadBaterias);
  const [capacidadBateria, setCapacidadBateria] = useState(VALORES_INICIALES.capacidadBateria);
  const [voltajeArranque, setVoltajeArranque] = useState("");
  const [voltajeMotorEncendido, setVoltajeMotorEncendido] = useState("");
  const [verificaciones, setVerificaciones] = useState<ChecklistItem[]>(() => withIds(DEFAULT_VERIFICACIONES));

  // --- Conclusión ---
  const [horasProximaMantencion, setHorasProximaMantencion] = useState("");
  const [planPreventivo, setPlanPreventivo] = useState<PlanItem[]>(() => withIds(DEFAULT_PLAN));
  const [fechaProximoMantenimiento, setFechaProximoMantenimiento] = useState("");

  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };
  const [fotoAmpliada, setFotoAmpliada] = useState<FotoAmpliada | null>(null);
  // Casilla para la que se abrió el escáner de documentos (ART, bloqueo/LOTO, permisos…).
  const [escanearFotoId, setEscanearFotoId] = useState<string | null>(null);
  const [selectedFotoId, setSelectedFotoId] = useState<string | null>(null);

  // --- Borrador en la nube (compartido con el equipo, igual que Informe Diario) ---
  const borradorCargadoRef = useRef(false);
  const yaGuardadoEnNubeRef = useRef(false);
  // Tras "Borrar borrador" no se vuelve a guardar solo hasta que se edite algo (si no, se guardaría al tiro una copia).
  const pausarAutoguardadoRef = useRef(false);
  const [currentDraftId, setCurrentDraftId] = useState<string>(() => borradorInicial?.id ?? crypto.randomUUID());
  const [hayBorrador, setHayBorrador] = useState(false);
  const [borradorGuardadoEn, setBorradorGuardadoEn] = useState<string | null>(null);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);
  // Finalizado a mano (lo guarda la nube). La marca va ligada al borrador abierto: uno nuevo empieza sin marca.
  const [finalizadoDe, setFinalizadoDe] = useState<{ id: string; en: string | null }>(() => ({ id: borradorInicial?.id ?? '', en: borradorInicial?.finalizadoEn ?? null }));
  const finalizadoEn = finalizadoDe.id === currentDraftId ? finalizadoDe.en : null;
  const fotosCompletas = (() => { const c = contarFotosGenerico({ fotos }); return c.total > 0 && c.llenas >= c.total; })();

  // Deja lista la librería del Word y los logos mientras se completa el formulario.
  useEffect(() => { precargarGeneracionWord(); }, []);

  // Al abrir el informe: si viene un borrador guardado (desde el Panel o desde Borradores), se carga.
  // Se aplica una sola vez al renderizar (no en un efecto), así el formulario arranca ya con esos datos.
  const [borradorAplicado, setBorradorAplicado] = useState(false);
  if (!borradorAplicado) {
    setBorradorAplicado(true);
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
    }
  }

  useEffect(() => {
    // Si el informe viene con un borrador guardado, el autoguardado ya sabe que existe en la nube.
    if (borradorInicial?.datos) yaGuardadoEnNubeRef.current = true;
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
      division,
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
    if (pausarAutoguardadoRef.current) { pausarAutoguardadoRef.current = false; return; }
    if (!tieneFotos && !yaGuardadoEnNubeRef.current) return;

    const timeout = setTimeout(() => {
      setGuardandoBorrador(true);
      upsertBorradorOtro(entry)
        .then(guardado => {
          // Las fotos recién subidas pasan a ser URL en el formulario: así el próximo autoguardado no las vuelve a subir.
          const subidas = mapaFotosSubidas(entry.datos, guardado.datos);
          if (subidas.size) setFotos(prev => aplicarFotosSubidas(prev, subidas));
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
    division, currentDraftId, fecha, creadoNombre, creadoCargo, revisadoText, sitio, modeloGenerador,
    cliente, area, minera, tipoServicio, ejecutante,
    descripcionTexto, componentes, trabajos, fotos,
    horasPlan, repuestos, filtros, horometro, cantidadPartidas,
    nivelRefrigerante, nivelCombustible, nivelAceite, cantidadBaterias, capacidadBateria,
    voltajeArranque, voltajeMotorEncendido, verificaciones,
    horasProximaMantencion, planPreventivo, fechaProximoMantenimiento,
  ]);

  // Finaliza (o reabre) el informe a mano: la nube guarda la marca y el formulario sigue igual.
  const alternarFinalizado = async () => {
    const finalizar = finalizadoEn === null;
    try {
      const en = await marcarFinalizado('borradores_otros', currentDraftId, finalizar);
      setFinalizadoDe({ id: currentDraftId, en });
      showToast(finalizar ? 'Informe finalizado: ya no aparece en la lista para continuar.' : 'Informe reabierto.');
    } catch (error) {
      showToast(mensajeErrorFinalizar(error, finalizar), true);
    }
  };

  const borrarBorrador = () => {
    const idPrevio = currentDraftId;
    const habiaEnNube = yaGuardadoEnNubeRef.current;
    setHayBorrador(false);
    setBorradorGuardadoEn(null);
    yaGuardadoEnNubeRef.current = false;
    const guardadoEnPrevio = borradorGuardadoEn;
    pausarAutoguardadoRef.current = true;
    setCurrentDraftId(crypto.randomUUID());
    if (habiaEnNube) borrandose.add(idPrevio);
    // El borrado en la nube espera unos segundos: mientras, se puede deshacer (ver lib/deshacer).
    registrarDeshacer("Se eliminó el borrador", () => {
      borrandose.delete(idPrevio);
      setCurrentDraftId(idPrevio);
      yaGuardadoEnNubeRef.current = habiaEnNube;
      setHayBorrador(habiaEnNube);
      setBorradorGuardadoEn(guardadoEnPrevio);
    }, () => {
      if (!habiaEnNube) return;
      deleteBorradorOtro(idPrevio)
        .catch(error => {
          console.error("No se pudo eliminar el borrador en la nube:", error);
          showToast("No se pudo eliminar el borrador en la nube.", true);
        })
        .finally(() => borrandose.delete(idPrevio));
    });
  };

  const handleCopiarFoto = async (src: string) => {
    const ok = await copiarImagenAlPortapapel(src);
    showToast(ok ? "Imagen copiada al portapapeles." : "No se pudo copiar la imagen.", !ok);
  };

  // --- Helpers de listas simples (componentes / trabajos) ---
  const updateListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number, value: string) =>
    setter(prev => prev.map((v, idx) => (idx === i ? value : v)));
  const addListItem = (setter: Dispatch<SetStateAction<string[]>>) => setter(prev => [...prev, ""]);
  const removeListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number, lista: string[]) => {
    const quitado = lista[i];
    setter(prev => prev.filter((_, idx) => idx !== i));
    if (quitado !== undefined) registrarDeshacer(`Se quitó «${quitado.trim().slice(0, 40) || 'una línea vacía'}»`, () => setter(prev => reinsertar(prev, i, quitado)));
  };

  // --- Fotos ---
  const updateFoto = (id: string, patch: Partial<FotoItem>) =>
    setFotos(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  const assignFoto = async (id: string, file: File) => updateFoto(id, { photo: await fileToDataUrl(file) });
  const addFoto = () => setFotos(prev => [...prev, { id: uid(), section: "", caption: "", description: "", photo: null }]);
  const removeFoto = (id: string) => {
    const indice = fotos.findIndex(f => f.id === id);
    const quitada = fotos[indice];
    setFotos(prev => prev.filter(f => f.id !== id));
    if (quitada) registrarDeshacer(`Se eliminó la foto «${quitada.caption || 'sin leyenda'}»`, () => setFotos(prev => prev.some(f => f.id === id) ? prev : reinsertar(prev, indice, quitada)));
  };

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
  const removeRow = <T extends { id: string }>(setter: Dispatch<SetStateAction<T[]>>, id: string, lista: T[]) => {
    const indice = lista.findIndex(r => r.id === id);
    const quitada = lista[indice];
    setter(prev => prev.filter(r => r.id !== id));
    if (quitada) registrarDeshacer('Se quitó una fila de la tabla', () => setter(prev => prev.some(r => r.id === id) ? prev : reinsertar(prev, indice, quitada)));
  };

  const addRepuesto = () => setRepuestos(prev => [...prev, { id: uid(), parte: "", cantidad: "", detalle: "" }]);
  const addPlanItem = () => setPlanPreventivo(prev => [...prev, { id: uid(), detalle: "", cantidad: "", parte: "" }]);

  // ---------------------------------------------------------------------------------------
  // Generación del documento Word
  // ---------------------------------------------------------------------------------------
  const generarDocumento = async () => {
    const falta = faltaParaWordMantenimiento({ fecha, sitio });
    if (falta) { showToast(falta, true); return; }

    setIsGenerating(true);
    try {
      const blob = await generarWordMantenimiento({
        fecha, creadoNombre, creadoCargo, revisadoText, sitio, modeloGenerador,
        cliente, area, minera, tipoServicio, ejecutante,
        descripcionTexto, componentes, trabajos, fotos,
        horasPlan, repuestos, filtros, horometro, cantidadPartidas,
        nivelRefrigerante, nivelCombustible, nivelAceite, cantidadBaterias, capacidadBateria,
        voltajeArranque, voltajeMotorEncendido, verificaciones,
        horasProximaMantencion, planPreventivo, fechaProximoMantenimiento,
      });
      const filename = nombreArchivoMantenimiento({ fecha, sitio });
      saveAs(blob, filename);
      void registrarActividad('word_generado', filename, currentDraftId);
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
          <CuentaCabecera />
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
                {finalizadoEn ? (
                  <>
                    <span className="inline-flex items-center gap-1 font-bold text-green-700"><CheckCircle2 size={12} /> Finalizado</span>
                    <button type="button" onClick={() => void alternarFinalizado()} className="inline-flex items-center gap-1 text-gray-500 hover:text-[#0E4660] underline">
                      <RotateCcw size={12} /> Reabrir
                    </button>
                  </>
                ) : fotosCompletas ? (
                  <span className="inline-flex items-center gap-1 font-bold text-green-700"><CheckCircle2 size={12} /> Finalizado</span>
                ) : (
                  <button type="button" onClick={() => void alternarFinalizado()} className="inline-flex items-center gap-1 font-bold text-green-700 hover:text-green-800 underline">
                    <CheckCircle2 size={12} /> Finalizar informe
                  </button>
                )}
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
              <select
                value={sitio}
                onChange={e => {
                  const nuevoSitio = e.target.value;
                  setSitio(nuevoSitio);
                  // Al cambiar de sitio se selecciona automáticamente su ubicación en "Área" (sigue siendo editable).
                  const nuevaUbicacion = ubicacionDeSitio(nuevoSitio);
                  if (nuevaUbicacion) setArea(nuevaUbicacion);
                }}
                className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white"
              >
                {SITIO_OPCIONES.map(s => {
                    const u = ubicacionDeSitio(s);
                    return <option key={s} value={s}>{u && u.toLowerCase() !== s.toLowerCase() ? `${s} — ${u}` : s}</option>;
                  })}
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
                <button type="button" onClick={() => removeListItem(setComponentes, i, componentes)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setComponentes)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mb-4 flex items-center gap-1"><Plus size={13} /> Agregar componente</button>

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Trabajos realizados</label>
          <div className="space-y-2 mb-2">
            {trabajos.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={t} onChange={e => updateListItem(setTrabajos, i, e.target.value)} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setTrabajos, i, trabajos)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
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
            {fotos.map((item, indice) => {
              const showSectionHeading = item.section && item.section !== seccionAnterior(fotos, indice);
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
                        onClick={e => { if (item.photo) { e.stopPropagation(); setFotoAmpliada(fotoConBloque(fotos.map(f => f.photo), indice, 'Registro fotográfico', fotos.map(f => f.caption || f.section))); } }}
                        className={`w-full h-[80px] object-cover rounded mb-1 bg-gray-100 ${item.photo ? 'cursor-zoom-in' : ''}`}
                      />
                      <input type="file" accept="image/*" capture="environment" onClick={e => e.stopPropagation()} onChange={e => e.target.files?.[0] && assignFoto(item.id, e.target.files[0])} className="hidden" id={`foto-camara-${item.id}`} />
                      <input type="file" accept="image/*" onClick={e => e.stopPropagation()} onChange={e => e.target.files?.[0] && assignFoto(item.id, e.target.files[0])} className="hidden" id={`foto-galeria-${item.id}`} />
                      <div className="flex gap-1 mt-1" onClick={e => e.stopPropagation()}>
                        <label htmlFor={`foto-camara-${item.id}`} className="flex-1 flex items-center justify-center gap-0.5 bg-[#0E4660] hover:bg-[#0a3549] text-white rounded py-1 cursor-pointer" title="Tomar foto">
                          <Camera size={12} />
                        </label>
                        <label htmlFor={`foto-galeria-${item.id}`} className="flex-1 flex items-center justify-center gap-0.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded py-1 cursor-pointer" title="Elegir de galería">
                          <ImageIcon size={12} />
                        </label>
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); setEscanearFotoId(item.id); }}
                        className={`w-full mt-1 flex items-center justify-center gap-1 rounded py-1 text-[10px] font-bold ${pareceDocumento(item.caption, item.section, item.description) ? 'bg-[#ED7D31] text-white' : 'bg-[#e3edf3] text-[#0E4660]'}`}
                        title="Escanear un documento en papel (ART, bloqueo/LOTO, permiso…): se recorta y endereza solo">
                        <ScanLine size={12} aria-hidden="true" /> Escanear
                      </button>
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
              <div key={r.id} className="grid grid-cols-[0.9fr_0.7fr_auto] sm:grid-cols-[1fr_1fr_2fr_auto] gap-2 [&>input]:min-w-0">
                <input type="text" value={r.parte} onChange={e => updateRow(setRepuestos, r.id, { parte: e.target.value })} placeholder="N° parte" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={r.cantidad} onChange={e => updateRow(setRepuestos, r.id, { cantidad: e.target.value })} placeholder="Cantidad" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={r.detalle} onChange={e => updateRow(setRepuestos, r.id, { detalle: e.target.value })} placeholder="Detalle" className="p-2 border border-[#DCE1E6] rounded-md text-sm col-span-2 sm:col-span-1 order-last sm:order-none" />
                <button type="button" onClick={() => removeRow(setRepuestos, r.id, repuestos)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
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
              <div key={f.id} className="grid grid-cols-2 sm:grid-cols-[1.4fr_0.8fr_1fr_1.4fr] gap-2 [&>input]:min-w-0 pb-2 sm:pb-0 border-b sm:border-0 border-[#eef1f2]">
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
              <div key={v.id} className="grid grid-cols-[1fr_5rem] sm:grid-cols-[1.6fr_0.8fr_1.6fr] gap-2 [&>input]:min-w-0 pb-2 sm:pb-0 border-b sm:border-0 border-[#eef1f2]">
                <input type="text" value={v.label} onChange={e => updateRow(setVerificaciones, v.id, { label: e.target.value })} className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={v.estado} onChange={e => updateRow(setVerificaciones, v.id, { estado: e.target.value })} placeholder="Estado" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={v.observaciones} onChange={e => updateRow(setVerificaciones, v.id, { observaciones: e.target.value })} placeholder="Observaciones" className="p-2 border border-[#DCE1E6] rounded-md text-sm col-span-2 sm:col-span-1" />
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
              <div key={p.id} className="grid grid-cols-[1fr_1fr_auto] sm:grid-cols-[2fr_1fr_1fr_auto] gap-2 [&>input]:min-w-0">
                <input type="text" value={p.detalle} onChange={e => updateRow(setPlanPreventivo, p.id, { detalle: e.target.value })} placeholder="Detalle" className="p-2 border border-[#DCE1E6] rounded-md text-sm col-span-3 sm:col-span-1" />
                <input type="text" value={p.cantidad} onChange={e => updateRow(setPlanPreventivo, p.id, { cantidad: e.target.value })} placeholder="Cantidad" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <input type="text" value={p.parte} onChange={e => updateRow(setPlanPreventivo, p.id, { parte: e.target.value })} placeholder="N° parte" className="p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeRow(setPlanPreventivo, p.id, planPreventivo)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
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
        <div className="h-24" aria-hidden="true" />
      </main>

      <BotonAccionesInforme
        onExportar={() => void generarDocumento()}
        exportando={isGenerating}
        finalizado={Boolean(finalizadoEn) || fotosCompletas}
        finalizadoAMano={Boolean(finalizadoEn)}
        enNube={hayBorrador}
        onAlternarFinalizado={() => void alternarFinalizado()}
      />

      {toastMessage && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}

      {fotoAmpliada && <VisorFoto {...fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}

      {escanearFotoId && (
        <EscanerDocumento
          onCancelar={() => setEscanearFotoId(null)}
          onUsar={documento => { updateFoto(escanearFotoId, { photo: documento }); setEscanearFotoId(null); }}
        />
      )}
    </div>
  );
}