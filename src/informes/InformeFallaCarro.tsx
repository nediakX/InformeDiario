import CuentaCabecera from '../componentes/CuentaCabecera';
import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { saveAs } from 'file-saver';
import { registrarActividad } from '../lib/actividad';
import {
  ArrowLeft, Loader2, AlertTriangle, ListChecks, ShieldCheck, Camera, Plus, Trash2, ClipboardList, Sparkles, Save, X, Copy, ScanLine, CheckCircle2, RotateCcw,
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
  type DatosAuto, type RegistroGrupo, FALLAS_COMUNES, HORAS_INICIALES, carroDisplay, construirGruposEstandar, formatHora12,
  nuevoGrupo, separarNombres, unirNombres,
} from './falla/modelo';
import { faltaParaWordFalla, generarWordFalla, nombreArchivoFalla } from './falla/word';

interface InformeFallaCarroProps {
  onBack: () => void;
  /** Borrador ya guardado en la nube que se debe abrir (viene de "Borradores" o de "Continuar" en el Panel). null/undefined = informe nuevo. */
  borradorInicial?: BorradorOtroEntry | null;
}

interface PersonalItem { nombre: string; cargo: string; }


// Ubicación física de cada carro (según la división, ver datos/divisiones.ts): al elegir el carro se
// rellena sola la "Ubicación" de la portada. (Ref. El Salvador: O&M_LTE_CMM_03, O&M_LTE_CMF_09, O&M_MMOO 01, etc.)

// --- Personal sugerido — mismo listado que usa el Informe Diario (supervisores, técnicos, líder técnico) ---
const PERSONAL_EQUIPO_A: PersonalItem[] = [
  { nombre: "Max Diaz.", cargo: "Supervisor de Operaciones" },
  { nombre: "Patricio Santana.", cargo: "Supervisor de Operaciones" },
  { nombre: "Carlos Moll.", cargo: "Técnico Eléctrico." },
  { nombre: "Williams Barraza.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "José Escobar.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Kevin Guerrero.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Vanesa Aguilar.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Nicolas Bahamondes.", cargo: "Líder Técnico" },
  { nombre: "Ricardo Riquelme.", cargo: "Electromecanico" },
  { nombre: "Claudia Droguett.", cargo: "Experta SSO" },
];
const PERSONAL_EQUIPO_B: PersonalItem[] = [
  { nombre: "Marcelo Artal Gahona", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Alberto Vital Arancibia Madariaga", cargo: "Técnico Eléctrico" },
  { nombre: "Fernando Contreras Cortes", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Maximiliano Bahamondez", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Luis Humberto Fernández Ortega", cargo: "Supervisor de Operaciones" },
  { nombre: "Omar Jesús Gutiérrez Tapia", cargo: "Experto SSO" },
  { nombre: "Francisco Jara Carvajal", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Claudio Abdón Orrego Rojas", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Camilo Andrés Pailapan Hormazabal", cargo: "Supervisor de Operaciones" },
];



export default function InformeFallaCarro({ onBack, borradorInicial = null }: InformeFallaCarroProps) {
  const { division } = useSesion();
  const config = configDivision(division).falla;
  const REVISADO_TEXT_FIJO = config.revisadoText;
  const AUTORIZADO_NOMBRE_FIJO = config.autorizado.nombre;
  const AUTORIZADO_CARGO_FIJO = config.autorizado.cargo;
  const { carros: CARRO_OPCIONES, ubicacionPorCarro } = configDivision(division);
  const ubicacionDeCarro = (codigo: string) => ubicacionPorCarro[codigo] ?? "";
  const etiquetaCarro = (c: string) => {
    const u = ubicacionDeCarro(c);
    return u && u.toLowerCase() !== c.replace(/_/g, ' ').toLowerCase() ? `${c} — ${u}` : c;
  };
  const carroInicial = CARRO_OPCIONES[0];
  const equiposPersonal = config.equipos.length
    ? config.equipos
    : [{ etiqueta: 'Equipo A', personas: PERSONAL_EQUIPO_A }, { etiqueta: 'Equipo B', personas: PERSONAL_EQUIPO_B }];

  // --- Datos generales / portada / encabezado ---
  const [fecha, setFecha] = useState<string>(() => hoyLocalISO());
  const [carroCodigo, setCarroCodigo] = useState<string>(carroInicial);
  const [ubicacion, setUbicacion] = useState(() => ubicacionDeCarro(carroInicial));
  const [creadoNombre, setCreadoNombre] = useState(config.creado.nombre);
  const [creadoCargo, setCreadoCargo] = useState(config.creado.cargo);

  // --- Automatización: horas, técnico y tipo de falla común ---
  const [horaAlarma, setHoraAlarma] = useState(HORAS_INICIALES.alarma);
  const [horaRespuesta, setHoraRespuesta] = useState(HORAS_INICIALES.respuesta);
  const [horaOperativo, setHoraOperativo] = useState(HORAS_INICIALES.operativo);
  // Personas que participaron en la atención (1° asistencia / tiempo de respuesta). En los textos
  // se escriben juntas: "Max Diaz, Carlos Moll y José Escobar".
  const [tecnicos, setTecnicos] = useState<string[]>([config.tecnico]);
  const tecnicoRespuesta = unirNombres(tecnicos);
  const [tipoFalla, setTipoFalla] = useState(FALLAS_COMUNES[0].id);

  const datosAutoActuales = (): DatosAuto => ({
    codigo: carroCodigo, carro: carroDisplay(carroCodigo), fecha, horaAlarma, horaRespuesta, horaOperativo,
  });

  const textosIniciales = FALLAS_COMUNES[0].build(datosAutoActuales());

  // --- A. Descripción de falla ---
  const [descripcionTexto, setDescripcionTexto] = useState(textosIniciales.descripcionTexto);
  const [notificacionIntro, setNotificacionIntro] = useState(textosIniciales.notificacionIntro);
  const [notificacionPuntos, setNotificacionPuntos] = useState<string[]>(textosIniciales.notificacionPuntos);
  const [notificacionCheckItem, setNotificacionCheckItem] = useState(textosIniciales.notificacionCheckItem);

  // --- B. Solución Implementada ---
  const [solucionIntro, setSolucionIntro] = useState(textosIniciales.solucionIntro);
  const [hallazgos, setHallazgos] = useState<string[]>(textosIniciales.hallazgos);
  const [accionesSolucion, setAccionesSolucion] = useState<string[]>(textosIniciales.accionesSolucion);

  // --- Verificación Final ---
  const [verificacionTexto, setVerificacionTexto] = useState(textosIniciales.verificacionTexto);
  const [verificacionCheckItem, setVerificacionCheckItem] = useState(textosIniciales.verificacionCheckItem);

  // Al cambiar la hora de respuesta, el "Tiempo de respuesta; …" de la notificación se actualiza solo.
  const horaRespuestaTexto = formatHora12(horaRespuesta);
  const [horaEnTextos, setHoraEnTextos] = useState(horaRespuestaTexto);
  if (horaEnTextos !== horaRespuestaTexto) {
    const anterior = horaEnTextos;
    setHoraEnTextos(horaRespuestaTexto);
    if (anterior.trim()) {
      const reemplazar = (t: string) => t.split(`respuesta; ${anterior}`).join(`respuesta; ${horaRespuestaTexto}`);
      setNotificacionPuntos(prev => prev.map(reemplazar));
    }
  }

  // --- C. Registro fotográfico ---
  // Los 8 recuadros estándar del informe de referencia: vista general, origen de la alarma, alarmas
  // del sitio, solicitud al NOC (solo texto), ajuste/acción realizada, evidencia restablecida, ART y
  // entorno + charla de 5 minutos. Solo hay que cargar las fotos de cada informe; el resto ya viene armado.
  const [grupos, setGrupos] = useState<RegistroGrupo[]>(() => construirGruposEstandar(textosIniciales, carroDisplay(carroInicial)));

  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 3500);
  };
  const [fotoAmpliada, setFotoAmpliada] = useState<FotoAmpliada | null>(null);
  // Casilla para la que se abrió el escáner de documentos (ART, bloqueo, permisos…).
  const [escanearEn, setEscanearEn] = useState<{ grupoId: string; fotoId: string } | null>(null);

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
  const fotosCompletas = (() => { const c = contarFotosGenerico({ grupos }); return c.total > 0 && c.llenas >= c.total; })();

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
      if (typeof d.carroCodigo === 'string') setCarroCodigo(d.carroCodigo);
      if (typeof d.ubicacion === 'string') setUbicacion(d.ubicacion);
      if (typeof d.creadoNombre === 'string') setCreadoNombre(d.creadoNombre);
      if (typeof d.creadoCargo === 'string') setCreadoCargo(d.creadoCargo);
      if (typeof d.horaAlarma === 'string') setHoraAlarma(d.horaAlarma);
      if (typeof d.horaRespuesta === 'string') setHoraRespuesta(d.horaRespuesta);
      if (typeof d.horaOperativo === 'string') setHoraOperativo(d.horaOperativo);
      if (Array.isArray(d.tecnicos)) setTecnicos((d.tecnicos as unknown[]).filter((t): t is string => typeof t === 'string'));
      else if (typeof d.tecnicoRespuesta === 'string') setTecnicos(separarNombres(d.tecnicoRespuesta));
      if (typeof d.tipoFalla === 'string') setTipoFalla(d.tipoFalla);
      if (typeof d.descripcionTexto === 'string') setDescripcionTexto(d.descripcionTexto);
      if (typeof d.notificacionIntro === 'string') setNotificacionIntro(d.notificacionIntro);
      if (Array.isArray(d.notificacionPuntos)) setNotificacionPuntos(d.notificacionPuntos as string[]);
      if (typeof d.notificacionCheckItem === 'string') setNotificacionCheckItem(d.notificacionCheckItem);
      if (typeof d.solucionIntro === 'string') setSolucionIntro(d.solucionIntro);
      if (Array.isArray(d.hallazgos)) setHallazgos(d.hallazgos as string[]);
      if (Array.isArray(d.accionesSolucion)) setAccionesSolucion(d.accionesSolucion as string[]);
      if (typeof d.verificacionTexto === 'string') setVerificacionTexto(d.verificacionTexto);
      if (typeof d.verificacionCheckItem === 'string') setVerificacionCheckItem(d.verificacionCheckItem);
      if (Array.isArray(d.grupos)) setGrupos(d.grupos as RegistroGrupo[]);
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
  // menos una foto (o si ya estaba guardado antes), igual que Informe Diario.
  useEffect(() => {
    if (!borradorCargadoRef.current) return;
    const fallaLabel = FALLAS_COMUNES.find(f => f.id === tipoFalla)?.label ?? '';
    const entry: BorradorOtroEntry = {
      id: currentDraftId,
      tipo: 'falla',
      division,
      titulo: `${carroDisplay(carroCodigo)}${fallaLabel ? ` — ${fallaLabel}` : ''}`,
      fecha,
      savedAt: new Date().toISOString(),
      datos: {
        fecha, carroCodigo, ubicacion, creadoNombre, creadoCargo,
        horaAlarma, horaRespuesta, horaOperativo, tecnicoRespuesta, tecnicos, tipoFalla,
        descripcionTexto, notificacionIntro, notificacionPuntos, notificacionCheckItem,
        solucionIntro, hallazgos, accionesSolucion,
        verificacionTexto, verificacionCheckItem, grupos,
      },
    };
    const tieneFotos = grupos.some(g => g.fotos.some(f => f.photo));
    if (pausarAutoguardadoRef.current) { pausarAutoguardadoRef.current = false; return; }
    if (!tieneFotos && !yaGuardadoEnNubeRef.current) return;

    const timeout = setTimeout(() => {
      setGuardandoBorrador(true);
      upsertBorradorOtro(entry)
        .then(guardado => {
          // Las fotos recién subidas pasan a ser URL en el formulario: así el próximo autoguardado no las vuelve a subir.
          const subidas = mapaFotosSubidas(entry.datos, guardado.datos);
          if (subidas.size) setGrupos(prev => aplicarFotosSubidas(prev, subidas));
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
    division, currentDraftId, fecha, carroCodigo, ubicacion, creadoNombre, creadoCargo,
    horaAlarma, horaRespuesta, horaOperativo, tecnicoRespuesta, tecnicos, tipoFalla,
    descripcionTexto, notificacionIntro, notificacionPuntos, notificacionCheckItem,
    solucionIntro, hallazgos, accionesSolucion,
    verificacionTexto, verificacionCheckItem, grupos,
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

  // --- Autocompletar textos a partir del carro / fecha / horas / técnico / tipo de falla ---
  // Reconstruye los textos y las leyendas de los 8 recuadros estándar. Las fotos ya cargadas no se tocan;
  // solo se conservan en el mismo orden si el número de bloques no cambió (uso normal).
  const autocompletarTextos = () => {
    const preset = FALLAS_COMUNES.find(f => f.id === tipoFalla) ?? FALLAS_COMUNES[0];
    const t = preset.build(datosAutoActuales());
    setDescripcionTexto(t.descripcionTexto);
    setNotificacionIntro(t.notificacionIntro);
    setNotificacionPuntos(t.notificacionPuntos);
    setNotificacionCheckItem(t.notificacionCheckItem);
    setSolucionIntro(t.solucionIntro);
    setHallazgos(t.hallazgos);
    setAccionesSolucion(t.accionesSolucion);
    setVerificacionTexto(t.verificacionTexto);
    setVerificacionCheckItem(t.verificacionCheckItem);
    const gruposNuevos = construirGruposEstandar(t, carroDisplay(carroCodigo));
    setGrupos(prev => gruposNuevos.map((g, i) => (prev[i] ? { ...g, fotos: g.fotos.map((f, fi) => ({ ...f, photo: prev[i].fotos[fi]?.photo ?? null })) } : g)));
    showToast("Textos y leyendas autocompletados con el carro, fecha, horas y técnico seleccionados. Las fotos ya cargadas se mantienen.");
  };

  // --- Helpers de listas simples (notificación / hallazgos / acciones) ---
  const updateListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number, value: string) =>
    setter(prev => prev.map((v, idx) => (idx === i ? value : v)));
  const addListItem = (setter: Dispatch<SetStateAction<string[]>>) => setter(prev => [...prev, ""]);
  const removeListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number, lista: string[]) => {
    const quitado = lista[i];
    setter(prev => prev.filter((_, idx) => idx !== i));
    if (quitado !== undefined) registrarDeshacer(`Se quitó «${quitado.trim().slice(0, 40) || 'una línea vacía'}»`, () => setter(prev => reinsertar(prev, i, quitado)));
  };

  // --- Grupos del registro fotográfico ---
  const addGrupo = () => setGrupos(prev => [...prev, nuevoGrupo()]);
  const removeGrupo = (id: string) => {
    const indice = grupos.findIndex(g => g.id === id);
    const quitado = grupos[indice];
    setGrupos(prev => prev.filter(g => g.id !== id));
    if (quitado) registrarDeshacer('Se eliminó un bloque del registro fotográfico', () => setGrupos(prev => prev.some(g => g.id === id) ? prev : reinsertar(prev, indice, quitado)));
  };
  const updateGrupo = (id: string, patch: Partial<RegistroGrupo>) =>
    setGrupos(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)));
  const addFotoAGrupo = (grupoId: string) =>
    setGrupos(prev => prev.map(g => (g.id === grupoId && g.fotos.length < 4 ? { ...g, fotos: [...g.fotos, { id: uid(), photo: null }] } : g)));
  const removeFotoDeGrupo = (grupoId: string, fotoId: string) => {
    const grupo = grupos.find(g => g.id === grupoId);
    const indice = grupo?.fotos.findIndex(f => f.id === fotoId) ?? -1;
    const quitada = grupo?.fotos[indice];
    setGrupos(prev => prev.map(g => (g.id === grupoId ? { ...g, fotos: g.fotos.filter(f => f.id !== fotoId) } : g)));
    if (quitada) registrarDeshacer(quitada.photo ? 'Se eliminó una foto' : 'Se quitó un espacio de foto', () => setGrupos(prev => prev.map(g => (
      g.id === grupoId && !g.fotos.some(f => f.id === fotoId) ? { ...g, fotos: reinsertar(g.fotos, indice, quitada) } : g))));
  };
  const asignarFoto = async (grupoId: string, fotoId: string, file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setGrupos(prev => prev.map(g => (g.id === grupoId
      ? { ...g, fotos: g.fotos.map(f => (f.id === fotoId ? { ...f, photo: dataUrl } : f)) }
      : g)));
  };
  // --- Pegar fotos con Ctrl+V (igual que en el Informe Diario y Mantenimiento) ---
  // Se pega en la casilla seleccionada (clic sobre ella) o, si no hay ninguna, en la primera vacía.
  // Después queda seleccionada la siguiente, para pegar varias seguidas.
  const [fotoSeleccionada, setFotoSeleccionada] = useState<{ grupoId: string; fotoId: string } | null>(null);
  const gruposRef = useRef(grupos);
  useEffect(() => { gruposRef.current = grupos; }, [grupos]);
  const seleccionRef = useRef(fotoSeleccionada);
  useEffect(() => { seleccionRef.current = fotoSeleccionada; }, [fotoSeleccionada]);
  useEffect(() => {
    const alPegar = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      const archivo = item?.getAsFile();
      if (!archivo) return; // texto: se pega normal en el campo donde se esté escribiendo
      const lista = gruposRef.current;
      let destino = seleccionRef.current;
      if (destino && !lista.some(g => g.id === destino!.grupoId && g.fotos.some(f => f.id === destino!.fotoId))) destino = null;
      const elegida = !!destino; // la persona hizo clic en una casilla
      if (!destino) {
        const g = lista.find(gr => gr.fotos.some(f => !f.photo));
        const f = g?.fotos.find(x => !x.photo);
        if (g && f) destino = { grupoId: g.id, fotoId: f.id };
      }
      if (!destino) return;
      event.preventDefault();
      void asignarFoto(destino.grupoId, destino.fotoId, archivo);
      // Siguiente casilla del mismo bloque (o una nueva, hasta 4 por bloque).
      const grupo = lista.find(g => g.id === destino!.grupoId)!;
      const i = grupo.fotos.findIndex(f => f.id === destino!.fotoId);
      const siguiente = grupo.fotos[i + 1];
      if (siguiente) setFotoSeleccionada({ grupoId: grupo.id, fotoId: siguiente.id });
      else if (elegida && grupo.fotos.length < 4) {
        const nueva = { id: uid(), photo: null };
        setGrupos(prev => prev.map(g => (g.id === grupo.id && g.fotos.length < 4 ? { ...g, fotos: [...g.fotos, nueva] } : g)));
        setFotoSeleccionada({ grupoId: grupo.id, fotoId: nueva.id });
      } else setFotoSeleccionada(null);
    };
    document.addEventListener('paste', alPegar);
    return () => document.removeEventListener('paste', alPegar);
  }, []);

  const updateFotoCaption = (grupoId: string, fotoId: string, caption: string) =>
    setGrupos(prev => prev.map(g => (g.id === grupoId
      ? { ...g, fotos: g.fotos.map(f => (f.id === fotoId ? { ...f, caption } : f)) }
      : g)));

  // --- Selector de personal (igual que en el Informe Diario: Equipo A / Equipo B) ---
  // "Creado por" en un solo desplegable: si la persona está en la lista se elige ahí; "Otra persona"
  // abre los campos de nombre y cargo para escribirlos a mano.
  const [creadoAMano, setCreadoAMano] = useState(false);
  const mismoTexto = (a: string, b: string) => a.trim().replace(/\.$/, '').toLowerCase() === b.trim().replace(/\.$/, '').toLowerCase();
  const creadoEnLista = equiposPersonal.flatMap(eq => eq.personas)
    .find(p => mismoTexto(p.nombre, creadoNombre) && mismoTexto(p.cargo, creadoCargo));
  const valorCreado = creadoAMano ? '__otro' : creadoEnLista ? `${creadoEnLista.nombre}|${creadoEnLista.cargo}` : creadoNombre.trim() ? '__actual' : '';
  const elegirCreado = (valor: string) => {
    if (valor === '__otro') { setCreadoAMano(true); return; }
    setCreadoAMano(false);
    if (!valor || valor === '__actual') return;
    const [n, c] = valor.split("|");
    setCreadoNombre(n); setCreadoCargo(c);
  };
  const cambiarTecnico = (i: number, valor: string) => setTecnicos(prev => prev.map((t, k) => (k === i ? valor : t)));
  const agregarTecnico = () => setTecnicos(prev => [...prev, ""]);
  const quitarTecnico = (i: number) => {
    const quitado = tecnicos[i];
    setTecnicos(prev => (prev.length > 1 ? prev.filter((_, k) => k !== i) : [""]));
    if (quitado?.trim()) registrarDeshacer(`Se quitó a ${quitado.trim()} de los participantes`, () => setTecnicos(prev => (prev.length === 1 && !prev[0].trim() ? [quitado] : reinsertar(prev, i, quitado))));
  };

  // ---------------------------------------------------------------------------------------
  // Generación del documento Word
  // ---------------------------------------------------------------------------------------
  const generarDocumento = async () => {
    const falta = faltaParaWordFalla({ fecha, carroCodigo });
    if (falta) { showToast(falta, true); return; }

    setIsGenerating(true);
    try {
      const blob = await generarWordFalla({
        fecha, carroCodigo, ubicacion, creadoNombre, creadoCargo,
        descripcionTexto, notificacionIntro, notificacionPuntos, notificacionCheckItem,
        solucionIntro, hallazgos, accionesSolucion, verificacionTexto, verificacionCheckItem, grupos,
        revisadoText: REVISADO_TEXT_FIJO, autorizadoNombre: AUTORIZADO_NOMBRE_FIJO, autorizadoCargo: AUTORIZADO_CARGO_FIJO,
      });
      const filename = nombreArchivoFalla({ fecha, carroCodigo });
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

  const opcionPersonal = (p: PersonalItem) => `${p.nombre}|${p.cargo}`;

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
                Informe de Falla — Carro
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
            <ClipboardList size={18} className="panel__summary-icon" strokeWidth={2.2} />
            1. Datos generales
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Fecha</label>
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Carro / Sitio</label>
              <select
                value={carroCodigo}
                onChange={e => {
                  const codigo = e.target.value;
                  setCarroCodigo(codigo);
                  // Al cambiar de carro se selecciona automáticamente su ubicación (sigue siendo editable).
                  const nuevaUbicacion = ubicacionDeCarro(codigo);
                  if (nuevaUbicacion) setUbicacion(nuevaUbicacion);
                }}
                className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white"
              >
                {CARRO_OPCIONES.map(c => <option key={c} value={c}>{etiquetaCarro(c)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Ubicación (portada)</label>
              <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" placeholder="Se completa sola al elegir el carro" />
            </div>
            <div>
              <label htmlFor="falla-creado" className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por</label>
              <select id="falla-creado" value={valorCreado} onChange={e => elegirCreado(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white">
                {!creadoNombre.trim() && <option value="">-- Seleccionar supervisor / técnico --</option>}
                {!creadoEnLista && creadoNombre.trim() && <option value="__actual">{creadoNombre}{creadoCargo ? ` — ${creadoCargo}` : ''}</option>}
                {equiposPersonal.map(eq => (
                  <optgroup key={eq.etiqueta} label={eq.etiqueta}>{eq.personas.map(p => <option key={p.nombre} value={opcionPersonal(p)}>{p.nombre} — {p.cargo}</option>)}</optgroup>
                ))}
                <option value="__otro">✎ Otra persona / editar nombre o cargo…</option>
              </select>
            </div>
            {creadoAMano && (
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2 p-2 rounded-md bg-[#f4f8fb] border border-[#DCE1E6]">
                <input type="text" value={creadoNombre} onChange={e => setCreadoNombre(e.target.value)} placeholder="Nombre" aria-label="Creado por — Nombre" autoFocus className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white" />
                <div className="flex gap-2">
                  <input type="text" value={creadoCargo} onChange={e => setCreadoCargo(e.target.value)} placeholder="Cargo" aria-label="Creado por — Cargo" className="flex-1 min-w-0 p-2 border border-[#DCE1E6] rounded-md text-sm bg-white" />
                  <button type="button" onClick={() => setCreadoAMano(false)} className="btn-outline text-[#0E4660] px-3 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">Listo</button>
                </div>
              </div>
            )}
          </div>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Sparkles size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Autocompletar (falla común, horas y técnico)
          </summary>
          <p className="text-xs text-gray-500 mb-3">
            Elige el tipo de falla y completa las horas y el técnico que atendió: al pulsar "Autocompletar" se redactan automáticamente la descripción, la notificación, los hallazgos, la solución y la verificación, usando el carro, la fecha y las horas de arriba. El texto queda editable después.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="sm:col-span-3">
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Tipo de falla común</label>
              <select value={tipoFalla} onChange={e => setTipoFalla(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white">
                {FALLAS_COMUNES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Hora de la alarma (NOC)</label>
              <input type="time" value={horaAlarma} onChange={e => setHoraAlarma(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Hora de respuesta (terreno)</label>
              <input type="time" value={horaRespuesta} onChange={e => setHoraRespuesta(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Hora 100% operativo</label>
              <input type="time" value={horaOperativo} onChange={e => setHoraOperativo(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Participantes (1° asistencia / tiempo de respuesta) — elige de la lista o escribe el nombre</label>
              <div className="space-y-2">
                {tecnicos.map((t, i) => (
                  <div key={i} className="flex gap-2">
                    <input type="text" value={t} onChange={e => cambiarTecnico(i, e.target.value)} placeholder={`Participante ${i + 1}`} list="falla-personal"
                      aria-label={`Participante ${i + 1}`} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                    {(tecnicos.length > 1 || t.trim()) && (
                      <button type="button" onClick={() => quitarTecnico(i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100" aria-label={`Quitar participante ${i + 1}`}><Trash2 size={15} /></button>
                    )}
                  </div>
                ))}
              </div>
              <button type="button" onClick={agregarTecnico} className="mt-2 btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
                <Plus size={14} /> Agregar participante
              </button>
              {tecnicos.filter(x => x.trim()).length > 1 && (
                <p className="text-[11px] text-gray-500 mt-1">En el informe: «{tecnicoRespuesta}».</p>
              )}
            </div>
            <datalist id="falla-personal">
              {equiposPersonal.flatMap(eq => eq.personas).map((p, k) => <option key={k} value={p.nombre.replace(/\.$/, '')}>{p.cargo}</option>)}
            </datalist>
          </div>
          <button type="button" onClick={autocompletarTextos} className="btn-outline text-[#0E4660] px-3 py-2 rounded-md text-sm font-bold hover:bg-[#d5e7f8] flex items-center gap-2">
            <Sparkles size={15} /> Autocompletar textos con estos datos
          </button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <AlertTriangle size={18} className="panel__summary-icon" strokeWidth={2.2} />
            3. A. Descripción de falla
          </summary>
          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Descripción (una línea = un párrafo)</label>
          <textarea value={descripcionTexto} onChange={e => setDescripcionTexto(e.target.value)} rows={5} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm mb-3" />

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Frase de introducción a la notificación</label>
          <input type="text" value={notificacionIntro} onChange={e => setNotificacionIntro(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm mb-3" />

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Puntos de la notificación (lista numerada)</label>
          <div className="space-y-2 mb-2">
            {notificacionPuntos.map((p, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={p} onChange={e => updateListItem(setNotificacionPuntos, i, e.target.value)} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setNotificacionPuntos, i, notificacionPuntos)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setNotificacionPuntos)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mb-4 flex items-center gap-1"><Plus size={13} /> Agregar punto</button>

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Ítem con check (✓) bajo la lista, opcional</label>
          <input type="text" value={notificacionCheckItem} onChange={e => setNotificacionCheckItem(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ListChecks size={18} className="panel__summary-icon" strokeWidth={2.2} />
            4. B. Solución Implementada
          </summary>
          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Introducción</label>
          <textarea value={solucionIntro} onChange={e => setSolucionIntro(e.target.value)} rows={2} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm mb-3" />

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Hallazgos en terreno (viñetas)</label>
          <div className="space-y-2 mb-2">
            {hallazgos.map((h, i) => (
              <div key={i} className="flex gap-2">
                <textarea value={h} onChange={e => updateListItem(setHallazgos, i, e.target.value)} rows={2} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setHallazgos, i, hallazgos)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100 self-start"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setHallazgos)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mb-4 flex items-center gap-1"><Plus size={13} /> Agregar hallazgo</button>

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Solución — acciones realizadas (viñetas)</label>
          <div className="space-y-2 mb-2">
            {accionesSolucion.map((a, i) => (
              <div key={i} className="flex gap-2">
                <textarea value={a} onChange={e => updateListItem(setAccionesSolucion, i, e.target.value)} rows={2} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setAccionesSolucion, i, accionesSolucion)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100 self-start"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setAccionesSolucion)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1"><Plus size={13} /> Agregar acción</button>
        </details>

        <details className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ShieldCheck size={18} className="panel__summary-icon" strokeWidth={2.2} />
            5. Verificación Final
          </summary>
          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Texto de verificación</label>
          <textarea value={verificacionTexto} onChange={e => setVerificacionTexto(e.target.value)} rows={3} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm mb-3" />
          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Ítem con check (✓), ej: horario 100% operativo</label>
          <input type="text" value={verificacionCheckItem} onChange={e => setVerificacionCheckItem(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Camera size={18} className="panel__summary-icon" strokeWidth={2.2} />
            6. C. Registro fotográfico ({grupos.reduce((n, g) => n + g.fotos.filter(f => f.photo).length, 0)} fotos)
          </summary>
          <p className="text-xs text-gray-500 mb-3">
            Ya vienen armados los 8 recuadros estándar del informe de referencia, en orden: vista general, origen de la alarma, alarmas del sitio, solicitud al NOC (solo texto), ajuste/acción realizada, evidencia de gestión restablecida, Registro ART y Verificación de entorno + Charla 5 minutos. Solo debes subir las fotos de cada bloque; al pulsar "Autocompletar" (arriba) las leyendas se actualizan solas y las fotos ya cargadas se mantienen. Cada foto puede llevar además su propia leyenda individual (como en el bloque de ART / entorno). Puedes agregar, quitar o reordenar bloques si tu informe lo necesita.
          </p>
          <div className="space-y-4">
            {grupos.map((grupo, gi) => (
              <div key={grupo.id} className="border border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#0E4660] uppercase">Bloque {gi + 1}</span>
                  <button type="button" onClick={() => removeGrupo(grupo.id)} className="bg-red-50 text-red-700 p-1.5 rounded-md hover:bg-red-100"><Trash2 size={14} /></button>
                </div>

                <label className="block text-[11px] text-[#6B6B6B] font-bold mb-1">Nota antes de las fotos (opcional)</label>
                <textarea value={grupo.nota} onChange={e => updateGrupo(grupo.id, { nota: e.target.value })} rows={2} className="w-full text-xs p-1.5 border border-[#DCE1E6] rounded mb-3" placeholder='Ej: "Horario 07:49 - Origen alarma – Sin Gestión"' />

                <label className="block text-[11px] text-[#6B6B6B] font-bold mb-1">Fotos ({grupo.fotos.length}/4)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {grupo.fotos.map(slot => (
                    <div
                      key={slot.id}
                      onClick={() => setFotoSeleccionada({ grupoId: grupo.id, fotoId: slot.id })}
                      title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                      className={`photo-slot w-[130px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${fotoSeleccionada?.fotoId === slot.id ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    >
                      {slot.photo && (
                        <button
                          type="button"
                          onClick={() => handleCopiarFoto(slot.photo!)}
                          className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center z-10"
                          aria-label="Copiar imagen al portapapeles"
                          title="Copiar imagen al portapapeles"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                      <img
                        src={slot.photo || placeholderImg}
                        alt=""
                        onClick={e => { if (slot.photo) { e.stopPropagation(); setFotoAmpliada(fotoConBloque(grupo.fotos.map(f => f.photo), grupo.fotos.indexOf(slot), `Bloque ${gi + 1}`, grupo.fotos.map(f => f.caption))); } }}
                        className={`w-full h-[80px] object-cover rounded mb-1 bg-gray-100 ${slot.photo ? 'cursor-zoom-in' : ''}`}
                      />
                      <button type="button" onClick={e => { e.stopPropagation(); setEscanearEn({ grupoId: grupo.id, fotoId: slot.id }); }}
                        className={`w-full flex items-center justify-center gap-1 rounded px-1 py-1 mb-1 text-[10px] font-bold ${pareceDocumento(grupo.nota, grupo.caption, slot.caption) ? 'bg-[#0E4660] text-white' : 'bg-[#e3edf3] text-[#0E4660]'}`}
                        title="Escanear un documento en papel (ART, bloqueo, permiso…): se recorta y endereza solo">
                        <ScanLine size={12} aria-hidden="true" /> Escanear
                      </button>
                      <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && asignarFoto(grupo.id, slot.id, e.target.files[0])} className="text-[9px] w-full mb-1" />
                      <input type="text" value={slot.caption ?? ""} onChange={e => updateFotoCaption(grupo.id, slot.id, e.target.value)} placeholder="Leyenda de esta foto (opcional)" className="w-full text-[9px] p-1 border border-[#DCE1E6] rounded" />
                      <button type="button" onClick={() => removeFotoDeGrupo(grupo.id, slot.id)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px]">×</button>
                    </div>
                  ))}
                  {grupo.fotos.length < 4 && (
                    <button type="button" onClick={() => addFotoAGrupo(grupo.id)} className="w-[110px] h-[104px] border-2 border-dashed border-[#DCE1E6] rounded-md text-xs text-[#0E4660] font-bold hover:bg-[#f0f6fb] flex items-center justify-center gap-1">
                      <Plus size={14} /> Foto
                    </button>
                  )}
                </div>

                <label className="block text-[11px] text-[#6B6B6B] font-bold mb-1">Leyenda debajo de las fotos (opcional, una línea por renglón)</label>
                <textarea value={grupo.caption} onChange={e => updateGrupo(grupo.id, { caption: e.target.value })} rows={2} className="w-full text-xs p-1.5 border border-[#DCE1E6] rounded" placeholder="Ej: Vista general del sitio." />
              </div>
            ))}
          </div>
          <button type="button" onClick={addGrupo} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar bloque</button>
        </details>

        <div className="action-zone">
          <button
            onClick={() => void generarDocumento()}
            disabled={isGenerating}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (<><Loader2 size={18} className="animate-spin" /> Generando informe...</>) : "Generar Informe de Falla"}
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

      {escanearEn && (
        <EscanerDocumento
          onCancelar={() => setEscanearEn(null)}
          onUsar={documento => {
            const destino = escanearEn;
            setGrupos(prev => prev.map(g => (g.id === destino.grupoId
              ? { ...g, fotos: g.fotos.map(f => (f.id === destino.fotoId ? { ...f, photo: documento } : f)) }
              : g)));
            setEscanearEn(null);
          }}
        />
      )}
    </div>
  );
}