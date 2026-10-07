import { useState, useEffect, useRef } from 'react';

import type * as docx from 'docx';
import { saveAs } from 'file-saver';
import { registrarActividad } from '../../lib/actividad';

import logoPsinet from "../../assets/logo_psinet.jpg";
import logoEdificio from "../../assets/LogoEdificio.png";

import { copiarImagenAlPortapapel } from '../../componentes/VisorFoto';
import { N_CONTRATO, LINEA_SERVICIO } from '../../datos/catalogos';
import { comprimirImagen, comprimirDataUrl } from '../../lib/fotos';
import { leerLocal, guardarLocal, borrarLocal } from '../../lib/almacenLocal';

import { type Vista } from '../../app/rutas';

import { type BorradorEntry, upsertBorrador, contarFotos } from '../../datos/borradoresDiario';

import { hoyLocalISO } from '../../datos/fechas';
import { VERTIV_TITLE, VERTIV_CARROS, VERTIV_ITEMS } from '../../datos/plantillaWord';
import { letraDeFecha } from '../../datos/turnos';
import { resolveImageBytes } from '../../lib/imagenes';
import { mapaFotosSubidas, aplicarFotosSubidas } from '../../lib/storage';

import type { Dispatch, SetStateAction, RefObject } from 'react';
import { BLUE, type BorradorLocal, type CvApi, type CvMat, DECORACIONES_MENSUALES, DEFAULT_ACTIVIDADES_DIA, DEFAULT_ACTIVIDADES_NOCHE, DEFAULT_EVIDENCIAS_NOCHE, EVIDENCIAS_CON_TAMANO_FOTOGRAFICO_SOLICITADO, EVIDENCIAS_EXCLUIDAS_DIA, type EvidenceBlock, INDICADORES_BULLETS, INDICADORES_INTRO, MESES, OBS_FINAL_BULLETS, ORANGE, PREFIJO_MANTENCION_CARRO, type PersonalItem, type ScannerTarget, formatFechaEvidencia, getActividadesGuardadas, getCreadorPorDefecto, getDefaultPersonal, getPersonalGuardado, lsKeyActividades, lsKeyBorradorLocal, lsKeyPersonal, urlToBase64, vertivVacio } from './constantes';
import { CONFIG_DIVISION, type Division } from '../../datos/divisiones';
import { useDragReorder } from './useDragReorder';

export interface OpcionesInformeDiario {
  /** Pantalla actual: el autoguardado y la sincronización solo corren mientras se está en el Informe Diario. */
  view: Vista | null;
  setBorradores: Dispatch<SetStateAction<BorradorEntry[]>>;
  borradoresRef: RefObject<BorradorEntry[]>;
  /** División con la que se trabaja: define faena, firmas, personal y si existe el bloque Vertiv. */
  division: Division;
}

/**
 * Estado y lógica del Informe Diario (formulario, fotos, respaldo local, sincronización en la nube
 * y generación del Word). Vive en App —no en la pantalla— para que el informe en curso se conserve
 * al ir y volver de otras pantallas, y para que el Panel/Borradores puedan abrir o descargar informes.
 */
export function useInformeDiario({ view, setBorradores, borradoresRef, division }: OpcionesInformeDiario) {
  const config = CONFIG_DIVISION[division];
  // Estados de datos generales
  const [turno, setTurno] = useState<'dia' | 'noche'>('dia');

  const [fecha, setFecha] = useState<string>(() => hoyLocalISO());

  const [faena, setFaena] = useState<string>(config.faena);

  const [letraTurno, setLetraTurno] = useState<string>('A');

  const [contrato, setContrato] = useState<string>(N_CONTRATO);

  const [version, setVersion] = useState<string>('1.1');

  const [servicio, setServicio] = useState<string>(LINEA_SERVICIO);

  const [creadoNombre, setCreadoNombre] = useState<string>(config.diario.creadorPorDefecto.A.nombre);

  const [creadoCargo, setCreadoCargo] = useState<string>(config.diario.creadorPorDefecto.A.cargo);

  const [revisadoText, setRevisadoText] = useState<string>(config.diario.revisadoText);

  const [autorizadoNombre, setAutorizadoNombre] = useState<string>(config.diario.autorizado.nombre);

  const [autorizadoCargo, setAutorizadoCargo] = useState<string>(config.diario.autorizado.cargo);

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
  const [vertivCarroPhotos, setVertivCarroPhotos] = useState<(string | null)[]>(() => vertivVacio(division).carros);

  const [vertivItemPhotos, setVertivItemPhotos] = useState<(string | null)[]>(() => vertivVacio(division).items);
  

  // UI States
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const [selectedPersonalSugerido, setSelectedPersonalSugerido] = useState<string>('');

  const [selectedActividadSugerida, setSelectedActividadSugerida] = useState<string>('');

  const [mantencionModalOpen, setMantencionModalOpen] = useState(false);

  const [carroMantencion, setCarroMantencion] = useState<string>('');

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

  // Borrador guardado en este dispositivo al abrir la app (se lee de IndexedDB de forma asíncrona).
  const draftLocalRef = useRef<BorradorLocal | null>(null);

  const avisoRespaldoRef = useRef(false);

  const [currentDraftId, setCurrentDraftId] = useState<string>(() => crypto.randomUUID());

  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  // Carga inicial y conversión de imágenes por defecto
  useEffect(() => {
    setPersonal(getPersonalGuardado('A', division));

    // El turno inicial es 'dia', así que cargamos su plantilla de actividades correspondiente.
    setActividades(getActividadesGuardadas('dia', division));

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
    void leerLocal<BorradorLocal>(lsKeyBorradorLocal(division)).then(draft => {
      draftLocalRef.current = draft;
      // Si ya se abrió un informe por enlace directo (/informe-diario/:id), no se pregunta por el respaldo local.
      if (draftDecisionMadeRef.current) return;
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
    }).catch(error => {
      console.error("No se pudo comprobar el contenido del borrador:", error);
      draftDecisionMadeRef.current = true;
    });
  }, [division]);

  const continueDraft = () => {
    try {
      const draft = draftLocalRef.current;
      if (!draft) return startNewReport();
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

  function startNewReport(turnoElegido?: 'dia' | 'noche') {
    draftLocalRef.current = null;
    void borrarLocal(lsKeyBorradorLocal(division));
    // El informe nuevo parte con la fecha de hoy y el turno de trabajo (A o B) que corresponde según el calendario 7x7.
    // Día o Noche no se deduce de la hora: si la persona lo eligió (Panel / Borradores) se usa ese; si no, se mantiene el turno que ya tenía seleccionado.
    const fechaTurno = hoyLocalISO();
    const turnoInicial: 'dia' | 'noche' = turnoElegido ?? turno;
    const letraHoy = letraDeFecha(fechaTurno);
    const creador = getCreadorPorDefecto(letraHoy, division);
    setTurno(turnoInicial);
    setFecha(fechaTurno);
    setFaena(config.faena);
    setLetraTurno(letraHoy);
    setContrato(N_CONTRATO);
    setVersion('1.1');
    setServicio(LINEA_SERVICIO);
    setCreadoNombre(creador.nombre);
    setCreadoCargo(creador.cargo);
    setRevisadoText(config.diario.revisadoText);
    setAutorizadoNombre(config.diario.autorizado.nombre);
    setAutorizadoCargo(config.diario.autorizado.cargo);
    setPersonal(getPersonalGuardado(letraHoy, division));
    setActividades(getActividadesGuardadas(turnoInicial, division));
    setObservaciones([]);
    setEvidenceBlocks([]);
    setVertivCarroPhotos(vertivVacio(division).carros);
    setVertivItemPhotos(vertivVacio(division).items);
    draftDecisionMadeRef.current = true;
    setDraftPromptOpen(false);
  }

  useEffect(() => {
    // Solo autoguardamos mientras el usuario está efectivamente en la pantalla
    // de "Generar Informe Diario"; si no, esto se dispara con datos por defecto
    // apenas se abre la app (aunque el usuario esté en el Dashboard) y termina
    // creando un borrador nuevo en cada recarga.
    if (view !== 'diario' || !draftDecisionMadeRef.current || !personal.length || !actividades.length) return;

    // Respaldo en este dispositivo (IndexedDB): si se cae la señal antes de subir a la nube, el informe no se pierde.
    const timeout = setTimeout(() => {
      void guardarLocal(lsKeyBorradorLocal(division), {
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
      }).then(ok => {
        if (!ok && !avisoRespaldoRef.current) {
          avisoRespaldoRef.current = true;
          showToast("No se pudo guardar el respaldo local en este dispositivo.", true);
        }
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [
    division,
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

  // Guardado pendiente (dentro del debounce) que se puede ejecutar al instante, p. ej. al volver a Borradores.
  const flushSyncRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    flushSyncRef.current = null;
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
      division,
    };

    // Se guarda en Supabase recién cuando el informe tiene al menos una foto (o si ya estaba guardado, para no dejarlo desactualizado).
    const yaEstaEnLaNube = borradoresRef.current.some(b => b.id === currentDraftId);
    if (contarFotos(entry).llenas === 0 && !yaEstaEnLaNube) return;

    const mezclar = (prev: BorradorEntry[], item: BorradorEntry) => {
      const idx = prev.findIndex(b => b.id === item.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = item; return next; }
      return [...prev, item];
    };

    // Si falla (sin señal), se reintenta cada 20 s mientras no haya cambios nuevos; el aviso se muestra una sola vez.
    let fallos = 0;
    let cancelado = false; // hubo cambios nuevos: este guardado quedó viejo y no debe reintentarse
    const guardarEnNube = () => {
      upsertBorrador(entry)
        .then(saved => {
          if (fallos > 0) showToast("Informe sincronizado con la nube.");
          setBorradores(prev => mezclar(prev, saved));
          // Las fotos recién subidas pasan a ser URL en el formulario: así el próximo autoguardado no las vuelve a subir.
          const subidas = mapaFotosSubidas(entry, saved);
          if (subidas.size) {
            setEvidenceBlocks(prev => aplicarFotosSubidas(prev, subidas));
            setVertivCarroPhotos(prev => aplicarFotosSubidas(prev, subidas));
            setVertivItemPhotos(prev => aplicarFotosSubidas(prev, subidas));
          }
        })
        .catch(error => {
          console.error("No se pudo sincronizar el borrador con la nube:", error);
          if (fallos === 0) showToast("Sin conexión: el informe quedó guardado en este dispositivo y se subirá al volver la señal.", true);
          fallos += 1;
          if (!cancelado) syncTimeoutRef.current = setTimeout(guardarEnNube, 20_000);
        });
    };

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      flushSyncRef.current = null;
      guardarEnNube();
    }, 800);

    // Si el usuario sale del informe antes de que pase el debounce, el cambio no se pierde: se guarda de inmediato
    // y la lista de Borradores se actualiza al instante (mientras terminan de subirse las fotos).
    flushSyncRef.current = () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      flushSyncRef.current = null;
      setBorradores(prev => mezclar(prev, entry));
      guardarEnNube();
    };

    return () => {
      cancelado = true;
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [
    division,
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
    setBorradores,
    borradoresRef,
  ]);

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

  const handleCopiarFoto = async (src: string | null | undefined) => {
    if (!src) return;
    const ok = await copiarImagenAlPortapapel(src);
    showToast(ok ? "Imagen copiada al portapapeles." : "No se pudo copiar la imagen.", !ok);
  };

  const persistPersonal = (newPersonal: PersonalItem[]) => {
    try {
      localStorage.setItem(lsKeyPersonal(letraTurno, division), JSON.stringify(newPersonal));
    } catch (e) { console.error(e); }
  };

  // Guarda la lista de actividades bajo la clave del turno indicado (por defecto, el turno actual).
  // Las mantenciones por carro son solo de este informe, por eso no se guardan en la plantilla permanente.
  const persistActividades = (newActividades: string[], forTurno: 'dia' | 'noche' = turno) => {
    try {
      const key = lsKeyActividades(forTurno, division);
      const plantilla = newActividades.filter(a => !a.startsWith(PREFIJO_MANTENCION_CARRO));
      localStorage.setItem(key, JSON.stringify(plantilla));
    } catch (e) { console.error(e); }
  };

  // Cambia entre Turno A y Turno B: carga la lista de personal guardada de ese turno
  // (o la lista por defecto si aún no se ha editado). Las ediciones ya se guardan al instante por letra.
  const handleLetraTurnoChange = (nuevaLetra: string) => {
    if (nuevaLetra === letraTurno) return;

    let nextPersonal: PersonalItem[];
    try {
      const raw = localStorage.getItem(lsKeyPersonal(nuevaLetra, division));
      nextPersonal = raw ? JSON.parse(raw) : getDefaultPersonal(nuevaLetra, division);
    } catch {
      nextPersonal = getDefaultPersonal(nuevaLetra, division);
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
      const defaults = getDefaultPersonal(letraTurno, division);
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

  // Reordenar arrastrando: Personal y Actividades se guardan solos (persistPersonal/persistActividades) al soltar.
  const personalDrag = useDragReorder(personal, setPersonal, persistPersonal);

  const actividadesDrag = useDragReorder(actividades, setActividades, persistActividades);

  const resetActividades = () => {
    const defaults = turno === 'dia' ? DEFAULT_ACTIVIDADES_DIA : DEFAULT_ACTIVIDADES_NOCHE;
    const label = turno === 'dia' ? 'Turno Día' : 'Turno Noche';
    if (window.confirm(`¿Deseas restaurar la lista de actividades por defecto de ${label}?`)) {
      setActividades(defaults);
      persistActividades(defaults);
      showToast("Lista de actividades restaurada.");
    }
  };

  const cerrarModalMantencion = () => {
    setMantencionModalOpen(false);
    setCarroMantencion('');
  };

  // Agrega la mantención del carro elegido solo a este informe (sin tocar la plantilla permanente).
  const confirmarMantencionCarro = () => {
    if (!carroMantencion) return;
    setActividades(prev => [...prev, `${PREFIJO_MANTENCION_CARRO}${carroMantencion}`]);
    setSelectedActividadSugerida('');
    cerrarModalMantencion();
  };

  // Handlers Evidencias
  const assignFileToSlot = (file: File, blockIndex: number, photoIndex: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    void comprimirImagen(file).then(sourceImage => {
      setEvidenceBlocks(prev => prev.map((b, bi) => {
        if (bi !== blockIndex) return b;
        const newPhotos = [...b.photos];
        newPhotos[photoIndex] = sourceImage;
        return { ...b, photos: newPhotos };
      }));
    });
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
    void comprimirImagen(file).then(async comprimida => {
      const scannedImage = await scanDocumentPerspective(comprimida);
      setVertivCarroPhotos(prev => {
        const updated = [...prev];
        updated[idx] = scannedImage;
        return updated;
      });
    });
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
    void comprimirImagen(file).then(async comprimida => {
      const scannedImage = await scanDocumentPerspective(comprimida);
      setVertivItemPhotos(prev => {
        const updated = [...prev];
        updated[idx] = scannedImage;
        return updated;
      });
    });
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
    const scannedImage = await scanDocumentPerspective(await comprimirDataUrl(canvas.toDataURL('image/jpeg', 0.92)));
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

  // Datos del informe que está abierto en el formulario (para generar el Word sin pasar un borrador).
  const informeActual: BorradorEntry = {
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
    savedAt: '',
    division,
  };

  // Generador Word en React. Sin argumento genera el informe abierto en el formulario;
  // con un borrador guardado (p. ej. desde la lista de Borradores) genera ese informe.
  // Devuelve true si el archivo se descargó.
  const generarDocumento = async (datos?: BorradorEntry): Promise<boolean> => {
    // Estos datos "tapan" a los del formulario dentro de esta función.
    const informe = datos ?? informeActual;
    const {
      turno, fecha, faena, letraTurno, contrato, version, servicio,
      creadoNombre, creadoCargo, revisadoText, autorizadoNombre, autorizadoCargo,
      personal, actividades, observaciones, vertivCarroPhotos, vertivItemPhotos,
    } = informe;
    const evidenceBlocks = informe.evidenceBlocks as EvidenceBlock[];

    if (!fecha) {
      alert("Selecciona la fecha del turno.");
      return false;
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

      const vertivBlock: (docx.Paragraph | docx.Table)[] = turno === 'noche' && CONFIG_DIVISION[informe.division].vertiv ? [
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
      void registrarActividad('word_generado', filename, informe.id);

      showToast(`Documento generado exitosamente: ${filename}`);
      return true;
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo.", true);
      return false;
    } finally {
      setIsGenerating(false);
    }
  };

  // Carga en el formulario un borrador existente (de otro día) para revisarlo o continuarlo.
  const cargarBorrador = (entrySeleccionada: BorradorEntry) => {
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
  };

  const mesDeFecha = fecha ? Number(fecha.split("-")[1]) : 0;
  const decoracionMensual = DECORACIONES_MENSUALES[mesDeFecha];

  return {
    division,
    config,
    actividades,
    actividadesDrag,
    assignEvidenceFromClipboard,
    assignFileToSlot,
    assignVertivCarroPhoto,
    assignVertivItemPhoto,
    autorizadoCargo,
    autorizadoNombre,
    avisoRespaldoRef,
    captureDocument,
    cargarBorrador,
    carroMantencion,
    cerrarModalMantencion,
    clearSelectedEvidenceSlot,
    clearVertivCarroPhoto,
    clearVertivItemPhoto,
    closeDocumentScanner,
    confirmRemovePhotoSlot,
    confirmScannedDocument,
    confirmarMantencionCarro,
    continueDraft,
    contrato,
    coverDataUrl,
    creadoCargo,
    creadoNombre,
    currentDraftId,
    dataUrlToUint8Array,
    decoracionMensual,
    draftDecisionMadeRef,
    draftLocalRef,
    draftPromptOpen,
    evidenceBlocks,
    faena,
    fecha,
    flushSyncRef,
    formatFechaLarga,
    formatFechaPortada,
    fotoAmpliada,
    generarDocumento,
    genericCounter,
    handleAddActividad,
    handleAddGenericBlock,
    handleAddPersonal,
    handleAddPhotoSlot,
    handleCopiarFoto,
    handleLetraTurnoChange,
    handlePaste,
    handleRemoveActividad,
    handleRemovePersonal,
    handleRemovePhotoSlot,
    handleSelectEvidenceSlot,
    handleSelectVertivSlot,
    handleUpdateActividad,
    handleUpdatePersonal,
    informeActual,
    isGenerating,
    letraTurno,
    logoDataUrl,
    mantencionModalOpen,
    mesDeFecha,
    observaciones,
    openDocumentScanner,
    orientEvidencePhoto,
    persistActividades,
    persistPersonal,
    personal,
    personalDrag,
    photoRemovalRequest,
    requestRemovePhotoSlot,
    resetActividades,
    resetPersonal,
    revisadoText,
    scanDocumentPerspective,
    scannerCanvasRef,
    scannerMessage,
    scannerPreview,
    scannerStreamRef,
    scannerTarget,
    scannerVideoRef,
    selectedActividadSugerida,
    selectedEvidenceSlot,
    selectedEvidenceSlotRef,
    selectedPersonalSugerido,
    selectedVertivSlot,
    servicio,
    setActividades,
    setAutorizadoCargo,
    setAutorizadoNombre,
    setCarroMantencion,
    setContrato,
    setCoverDataUrl,
    setCreadoCargo,
    setCreadoNombre,
    setCurrentDraftId,
    setDraftPromptOpen,
    setEvidenceBlocks,
    setFaena,
    setFecha,
    setFotoAmpliada,
    setGenericCounter,
    setIsGenerating,
    setLetraTurno,
    setLogoDataUrl,
    setMantencionModalOpen,
    setObservaciones,
    setPersonal,
    setPhotoRemovalRequest,
    setRevisadoText,
    setScannerMessage,
    setScannerPreview,
    setScannerTarget,
    setSelectedActividadSugerida,
    setSelectedEvidenceSlot,
    setSelectedPersonalSugerido,
    setSelectedVertivSlot,
    setServicio,
    setToastMessage,
    setTurno,
    setVersion,
    setVertivCarroPhotos,
    setVertivItemPhotos,
    showToast,
    startNewReport,
    stopScannerCamera,
    syncTimeoutRef,
    toastMessage,
    turno,
    version,
    vertivCarroPhotos,
    vertivItemPhotos,
  };
}

export type InformeDiarioEstado = ReturnType<typeof useInformeDiario>;
