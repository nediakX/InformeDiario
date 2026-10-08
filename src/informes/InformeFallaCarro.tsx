import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type * as docx from 'docx';
import { saveAs } from 'file-saver';
import { registrarActividad } from '../lib/actividad';
import {
  ArrowLeft, Loader2, AlertTriangle, ListChecks, ShieldCheck, Camera, Plus, Trash2, ClipboardList, Sparkles, Save, X, Copy,
} from 'lucide-react';
import logoPsinet from "../assets/logo_psinet.jpg";
import logoEdificio from "../assets/LogoEdificio.png";
import VisorFoto, { copiarImagenAlPortapapel } from '../componentes/VisorFoto';
import { N_CONTRATO, LINEA_SERVICIO } from '../datos/catalogos';
import { fileToDataUrl, uid } from '../lib/fotos';
import { type BorradorOtroEntry, upsertBorradorOtro, deleteBorradorOtro } from '../datos/borradoresOtros';
import { hoyLocalISO, formatFechaLarga } from '../datos/fechas';
import { BLUE, ORANGE } from '../datos/plantillaWord';
import { configDivision } from '../datos/divisiones';
import { useSesion } from '../auth/sesion';
import { mapaFotosSubidas, aplicarFotosSubidas } from '../lib/storage';
import { cargarDocx, logosInforme, resolverImagenes, bytesDeImagen, precargarGeneracionWord } from '../lib/docxRecursos';

interface InformeFallaCarroProps {
  onBack: () => void;
  /** Borrador ya guardado en la nube que se debe abrir (viene de "Borradores" o de "Continuar" en el Panel). null/undefined = informe nuevo. */
  borradorInicial?: BorradorOtroEntry | null;
}

interface PersonalItem { nombre: string; cargo: string; }
interface FotoSlot { id: string; photo: string | null; caption?: string; }

/** Un bloque del registro fotográfico: puede ser solo una nota (sin fotos), solo fotos con leyenda, o ambas. */
interface RegistroGrupo {
  id: string;
  /** Texto que va en su propio recuadro, ANTES de las fotos (ej: "Horario 07:49 - Origen alarma – Sin Gestión"). Opcional. */
  nota: string;
  /** Hasta 4 fotos, se muestran de a 2 por fila dentro del mismo recuadro. */
  fotos: FotoSlot[];
  /** Leyenda bajo las fotos (una línea por renglón). Opcional. */
  caption: string;
}

// ---------------------------------------------------------------------------------------
// Datos fijos del encabezado / portada — se mantienen en el documento pero ya no se piden
// en el formulario (quedan ocultos, siempre con el mismo valor salvo que se editen aquí).
// ---------------------------------------------------------------------------------------
const N_CONTRATO_FIJO = N_CONTRATO;
const VERSION_FIJA = "1";
const LINEA_SERVICIO_FIJA = LINEA_SERVICIO;
// Revisado / Autorizado por dependen de la división (ver datos/divisiones.ts).

// --- Listado de carros / sitios ---
const carroDisplay = (codigo: string) => `Carro ${codigo.replace(/_/g, " ")}`;

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
  { nombre: "Ricardo Morales Hurtado", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Claudio Abdón Orrego Rojas", cargo: "Técnico Telecomunicaciones" },
  { nombre: "Camilo Andrés Pailapan Hormazabal", cargo: "Supervisor de Operaciones" },
];

const ddmmyyyy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const formatHora12 = (hhmm: string) => {
  if (!hhmm) return "—";
  const [hStr, mStr] = hhmm.split(":");
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${mStr} ${ampm}`;
};

// ---------------------------------------------------------------------------------------
// Fallas comunes — plantillas tomadas de los informes de referencia. Al elegir una y pulsar
// "Autocompletar", se generan la descripción, la notificación, los hallazgos y la solución
// usando el carro, la fecha, las horas y el técnico seleccionados en ese momento.
// ---------------------------------------------------------------------------------------
interface DatosAuto {
  codigo: string; carro: string; fecha: string;
  horaAlarma: string; horaRespuesta: string; horaOperativo: string; tecnico: string;
}
interface TextosGenerados {
  descripcionTexto: string;
  notificacionIntro: string;
  notificacionPuntos: string[];
  notificacionCheckItem: string;
  solucionIntro: string;
  hallazgos: string[];
  accionesSolucion: string[];
  verificacionTexto: string;
  verificacionCheckItem: string;
  // --- Leyendas de los recuadros estándar del registro fotográfico (mismo orden que el informe de referencia) ---
  captionVistaGeneral: string;
  captionOrigenAlarma: string;
  captionAlarmasSitio: string;
  captionAjusteAccion: string;
  captionEvidenciaRestablecida: string;
}

const SOLUCION_INTRO_DEFECTO = "Con el fin de restablecer la gestión remota del sistema, se realizaron las siguientes acciones en terreno:";
const VERIFICACION_TEXTO_DEFECTO = "El personal del NOC confirma la recuperación completa de la gestión del sistema, validando que es posible acceder al panel de monitoreo sin presentar errores.";

// --- Recuadros que son siempre iguales, cualquiera sea el tipo de falla (boilerplate del informe) ---
const notaSolicitudNOC = () =>
  "Se solicita la información del estado de la alarma externa al personal de NOC.\nInformando que el sitio se encuentra sin alarmas críticas.";
const captionART = (carro: string) => `Registro de ART: Atención de Falla ${carro}.`;
const CAPTION_ENTORNO = "Verificación de condiciones de entorno";
const CAPTION_CHARLA = "Charla 5 Minutos";

const FALLAS_COMUNES: { id: string; label: string; build: (d: DatosAuto) => TextosGenerados }[] = [
  {
    id: "sin_gestion_energia",
    label: "Sin Gestión — falla de alimentación / energía",
    build: (d) => ({
      descripcionTexto:
        `A las ${formatHora12(d.horaAlarma)} horas del ${ddmmyyyy(d.fecha)}, el Centro de Operaciones de Red (NOC) informa que el sitio ${d.codigo} – ${d.carro}, presenta una falla de alimentación - Energía, indicando que no es posible acceder remotamente al sistema para monitoreo.\n` +
        `Pese a esta condición, se confirma que el sitio permanece sin transmisión, por lo cual sin conectividad y cobertura LTE.\n` +
        `La falla se clasifica como "Sin Gestión", lo cual impide el acceso al sistema de monitoreo remoto, en tanto implica pérdida de energía.`,
      notificacionIntro: `Centro de operaciones de red (NOC), nos informa que el sitio ${d.codigo} (${d.carro}) presenta una notificación:`,
      notificacionPuntos: [
        `${d.carro}: Sin Gestión. –`,
        `Verificar Fuente de energía.`,
        `Tiempo de origen llamado de falla por NOC.`,
        `Horario ${formatHora12(d.horaAlarma)} – Sitio sin comunicación. -`,
        `Tiempo de respuesta; ${d.tecnico || "—"}.`,
      ],
      notificacionCheckItem: `Horario ${formatHora12(d.horaRespuesta)} – Sitio sin comunicación, verifica fuente de energía.`,
      solucionIntro: SOLUCION_INTRO_DEFECTO,
      hallazgos: [`Se efectuó una inspección física del gabinete de energía, encontrándose en condiciones normales, sin anomalías visibles ni señales de falla eléctrica, tanto en gabinetes eléctricos como en el inversor.`],
      accionesSolucion: [`Se verificó el acceso remoto y la correcta gestión del sistema desde la plataforma de monitoreo central.`],
      verificacionTexto: VERIFICACION_TEXTO_DEFECTO,
      verificacionCheckItem: `Horario en la cual queda al 100 % operativo ${formatHora12(d.horaOperativo)}`,
      captionVistaGeneral: `Vista general del sitio ${d.codigo}.`,
      captionOrigenAlarma: `Horario ${formatHora12(d.horaAlarma)} - Origen alarma – Sin Gestión`,
      captionAlarmasSitio: `Alarmas Sitio sin Gestión`,
      captionAjusteAccion: `Cambia Bancos de Baterías\nComunicación restablecida– ${d.codigo}.${d.carro}`,
      captionEvidenciaRestablecida: `Evidencia de Gestión reestablecida a las ${formatHora12(d.horaOperativo)}`,
    }),
  },
  {
    id: "falla_general_generador",
    label: "Falla General del generador (código de error / baja frecuencia)",
    build: (d) => ({
      descripcionTexto:
        `A las ${formatHora12(d.horaAlarma)} horas del ${ddmmyyyy(d.fecha)}, el Centro de Operaciones de Red (NOC) informa que el sitio ${d.codigo}, presenta una falla general del generador eléctrico - Energía, indicando que se generó una alarma en la base de la estación externa.\n` +
        `La falla se clasifica como "Falla General", lo cual indica que no se podrá realizar una partida automática.`,
      notificacionIntro: `Centro de operaciones de red (NOC), nos informa que el sitio ${d.codigo} presenta una notificación:`,
      notificacionPuntos: [
        `${d.carro}: Caída de servicio. –`,
        `Verificar Fuente de energía.`,
        `Tiempo de origen llamado de falla por NOC.`,
        `Horario ${formatHora12(d.horaAlarma)} – GE Falla General. -`,
        `Tiempo de respuesta; ${d.tecnico || "—"}.`,
      ],
      notificacionCheckItem: `Horario ${formatHora12(d.horaRespuesta)} – Sitio sin comunicación, verifica fuente de energía.`,
      solucionIntro: SOLUCION_INTRO_DEFECTO,
      hallazgos: [`Se efectuó una inspección física del gabinete de energía, encontrándose apagado; se revisa display el cual indicaba código de error. Tras revisar las fallas activas, el sistema indicaba que el generador se encontraba con baja frecuencia, funcionando con RPM bajo el estándar.`],
      accionesSolucion: [
        `Inicio manual del generador.`,
        `Bombeo manual del combustible.`,
        `Se deja en inicio automático del generador.`,
        `Se verificó con especialista de NOC la correcta gestión del sistema desde la plataforma de monitoreo central.`,
      ],
      verificacionTexto: VERIFICACION_TEXTO_DEFECTO,
      verificacionCheckItem: `Horario en la cual queda al 100 % operativo ${formatHora12(d.horaOperativo)}`,
      captionVistaGeneral: `Vista general del sitio ${d.codigo}.`,
      captionOrigenAlarma: `Horario ${formatHora12(d.horaAlarma)} - Origen alarma – GE Falla General`,
      captionAlarmasSitio: `Alarmas Sitio Falla General`,
      captionAjusteAccion: `Inicio manual del generador y bombeo de combustible\nComunicación restablecida– ${d.codigo}.${d.carro}`,
      captionEvidenciaRestablecida: `Evidencia de Gestión reestablecida a las ${formatHora12(d.horaOperativo)}`,
    }),
  },
  {
    id: "disyuntor_sobrecorriente",
    label: "Disyuntor saltado por sobre corriente / batería descargada",
    build: (d) => ({
      descripcionTexto:
        `A las ${formatHora12(d.horaAlarma)} horas del ${ddmmyyyy(d.fecha)}, el Centro de Operaciones de Red (NOC) informa que el sitio ${d.codigo} – ${d.carro}, presenta una falla de alimentación de energía, indicando que no es posible acceder remotamente al sistema para monitoreo.\n` +
        `Pese a esta condición, se confirma que el sitio permanece sin transmisión, por lo cual sin conectividad y cobertura LTE.\n` +
        `La falla se clasifica como "Sin Gestión", lo cual impide el acceso al sistema de monitoreo remoto, en tanto implica pérdida de energía.`,
      notificacionIntro: `Centro de operaciones de red (NOC), nos informa que el sitio ${d.codigo} (${d.carro}) presenta una notificación:`,
      notificacionPuntos: [
        `${d.carro}: Sin Gestión. –`,
        `Verificar Fuente de energía.`,
        `Tiempo de origen llamado de falla por NOC.`,
        `Horario ${formatHora12(d.horaAlarma)} – Sitio sin comunicación. -`,
        `Tiempo de respuesta; ${d.tecnico || "—"} (1° asistencia en terreno).`,
      ],
      notificacionCheckItem: `Horario ${formatHora12(d.horaRespuesta)} – Sitio sin comunicación, verifica fuente de energía y se observa disyuntor general saltado (por sobre corriente).`,
      solucionIntro: SOLUCION_INTRO_DEFECTO,
      hallazgos: [`Se efectuó una inspección física del gabinete de energía, encontrándose en condiciones anormales: falla de carga de baterías 48 DC, falla eléctrica. Se ajusta y realiza puesta en servicio del sitio.`],
      accionesSolucion: [
        `Se dio inicio a la configuración de las salidas de alimentación desde el backplane hacia los artefactos de consumo.`,
        `Se verificó el acceso remoto y la correcta gestión del sistema desde la plataforma de monitoreo central (NOC).`,
      ],
      verificacionTexto: VERIFICACION_TEXTO_DEFECTO,
      verificacionCheckItem: `Recuperación validada a las ${formatHora12(d.horaOperativo)}.`,
      captionVistaGeneral: `Vista general del sitio ${d.codigo}.`,
      captionOrigenAlarma: `Horario ${formatHora12(d.horaAlarma)} - Origen alarma – Sin Gestión`,
      captionAlarmasSitio: `Alarmas Sitio sin Gestión`,
      captionAjusteAccion: `Ajuste Disyuntor Termomagnético Saltado General DC\nComunicación restablecida– ${d.codigo}.${d.carro}`,
      captionEvidenciaRestablecida: `Evidencia de Gestión reestablecida a las ${formatHora12(d.horaOperativo)}`,
    }),
  },
  {
    id: "personalizado",
    label: "Personalizado (dejar en blanco y redactar a mano)",
    build: (d) => ({
      descripcionTexto: `A las ${formatHora12(d.horaAlarma)} horas del ${ddmmyyyy(d.fecha)}, el Centro de Operaciones de Red (NOC) informa que el sitio ${d.codigo} – ${d.carro}, presenta [describir falla].`,
      notificacionIntro: `Centro de operaciones de red (NOC), nos informa que el sitio ${d.codigo} (${d.carro}) presenta una notificación:`,
      notificacionPuntos: [
        `${d.carro}: [tipo de falla]. –`,
        `Verificar Fuente de energía.`,
        `Tiempo de origen llamado de falla por NOC.`,
        `Horario ${formatHora12(d.horaAlarma)} – Sitio sin comunicación. -`,
        `Tiempo de respuesta; ${d.tecnico || "—"}.`,
      ],
      notificacionCheckItem: `Horario ${formatHora12(d.horaRespuesta)} – [detalle de la verificación en terreno].`,
      solucionIntro: SOLUCION_INTRO_DEFECTO,
      hallazgos: [`[Describir hallazgo en terreno]`],
      accionesSolucion: [`[Describir acción realizada]`],
      verificacionTexto: VERIFICACION_TEXTO_DEFECTO,
      verificacionCheckItem: `Horario en la cual queda al 100 % operativo ${formatHora12(d.horaOperativo)}`,
      captionVistaGeneral: `Vista general del sitio ${d.codigo}.`,
      captionOrigenAlarma: `Horario ${formatHora12(d.horaAlarma)} - Origen alarma`,
      captionAlarmasSitio: `Alarmas del sitio ${d.codigo}`,
      captionAjusteAccion: `[Describir acción de terreno]\nComunicación restablecida– ${d.codigo}.${d.carro}`,
      captionEvidenciaRestablecida: `Evidencia de Gestión reestablecida a las ${formatHora12(d.horaOperativo)}`,
    }),
  },
];

const nuevoGrupo = (nota = "", caption = "", nFotos = 1): RegistroGrupo => ({
  id: uid(), nota, caption, fotos: Array.from({ length: nFotos }, () => ({ id: uid(), photo: null })),
});

/** Arma los 8 recuadros estándar del informe (vista general, alarma, ajuste, ART, entorno/charla...) a partir de los textos generados y el carro. */
const construirGruposEstandar = (t: TextosGenerados, carro: string): RegistroGrupo[] => {
  const gEntornoCharla = nuevoGrupo("", "", 2);
  gEntornoCharla.fotos[0].caption = CAPTION_ENTORNO;
  gEntornoCharla.fotos[1].caption = CAPTION_CHARLA;
  return [
    nuevoGrupo("", t.captionVistaGeneral, 1),
    nuevoGrupo("", t.captionOrigenAlarma, 2),
    nuevoGrupo("", t.captionAlarmasSitio, 2),
    nuevoGrupo(notaSolicitudNOC(), "", 0),
    nuevoGrupo("", t.captionAjusteAccion, 2),
    nuevoGrupo("", t.captionEvidenciaRestablecida, 2),
    nuevoGrupo("", captionART(carro), 2),
    gEntornoCharla,
  ];
};

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
  const [horaAlarma, setHoraAlarma] = useState("07:49");
  const [horaRespuesta, setHoraRespuesta] = useState("10:15");
  const [horaOperativo, setHoraOperativo] = useState("11:40");
  const [tecnicoRespuesta, setTecnicoRespuesta] = useState(config.tecnico);
  const [tipoFalla, setTipoFalla] = useState(FALLAS_COMUNES[0].id);

  const datosAutoActuales = (): DatosAuto => ({
    codigo: carroCodigo, carro: carroDisplay(carroCodigo), fecha, horaAlarma, horaRespuesta, horaOperativo, tecnico: tecnicoRespuesta,
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

  // --- C. Registro fotográfico ---
  // Los 8 recuadros estándar del informe de referencia: vista general, origen de la alarma, alarmas
  // del sitio, solicitud al NOC (solo texto), ajuste/acción realizada, evidencia restablecida, ART y
  // entorno + charla de 5 minutos. Solo hay que cargar las fotos de cada informe; el resto ya viene armado.
  const [grupos, setGrupos] = useState<RegistroGrupo[]>(() => construirGruposEstandar(textosIniciales, carroDisplay(carroInicial)));

  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);

  // --- Borrador en la nube (compartido con el equipo, igual que Informe Diario) ---
  const borradorCargadoRef = useRef(false);
  const yaGuardadoEnNubeRef = useRef(false);
  const [currentDraftId, setCurrentDraftId] = useState<string>(() => borradorInicial?.id ?? crypto.randomUUID());
  const [hayBorrador, setHayBorrador] = useState(false);
  const [borradorGuardadoEn, setBorradorGuardadoEn] = useState<string | null>(null);
  const [guardandoBorrador, setGuardandoBorrador] = useState(false);

  // Deja lista la librería del Word y los logos mientras se completa el formulario.
  useEffect(() => { precargarGeneracionWord(); }, []);

  // Al abrir el informe: si viene un borrador guardado (desde el Panel o desde Borradores), se carga.
  useEffect(() => {
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
      if (typeof d.tecnicoRespuesta === 'string') setTecnicoRespuesta(d.tecnicoRespuesta);
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
      yaGuardadoEnNubeRef.current = true;
    }
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
        horaAlarma, horaRespuesta, horaOperativo, tecnicoRespuesta, tipoFalla,
        descripcionTexto, notificacionIntro, notificacionPuntos, notificacionCheckItem,
        solucionIntro, hallazgos, accionesSolucion,
        verificacionTexto, verificacionCheckItem, grupos,
      },
    };
    const tieneFotos = grupos.some(g => g.fotos.some(f => f.photo));
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
    horaAlarma, horaRespuesta, horaOperativo, tecnicoRespuesta, tipoFalla,
    descripcionTexto, notificacionIntro, notificacionPuntos, notificacionCheckItem,
    solucionIntro, hallazgos, accionesSolucion,
    verificacionTexto, verificacionCheckItem, grupos,
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
  const removeListItem = (setter: Dispatch<SetStateAction<string[]>>, i: number) =>
    setter(prev => prev.filter((_, idx) => idx !== i));

  // --- Grupos del registro fotográfico ---
  const addGrupo = () => setGrupos(prev => [...prev, nuevoGrupo()]);
  const removeGrupo = (id: string) => setGrupos(prev => prev.filter(g => g.id !== id));
  const updateGrupo = (id: string, patch: Partial<RegistroGrupo>) =>
    setGrupos(prev => prev.map(g => (g.id === id ? { ...g, ...patch } : g)));
  const addFotoAGrupo = (grupoId: string) =>
    setGrupos(prev => prev.map(g => (g.id === grupoId && g.fotos.length < 4 ? { ...g, fotos: [...g.fotos, { id: uid(), photo: null }] } : g)));
  const removeFotoDeGrupo = (grupoId: string, fotoId: string) =>
    setGrupos(prev => prev.map(g => (g.id === grupoId ? { ...g, fotos: g.fotos.filter(f => f.id !== fotoId) } : g)));
  const asignarFoto = async (grupoId: string, fotoId: string, file: File) => {
    const dataUrl = await fileToDataUrl(file);
    setGrupos(prev => prev.map(g => (g.id === grupoId
      ? { ...g, fotos: g.fotos.map(f => (f.id === fotoId ? { ...f, photo: dataUrl } : f)) }
      : g)));
  };
  const updateFotoCaption = (grupoId: string, fotoId: string, caption: string) =>
    setGrupos(prev => prev.map(g => (g.id === grupoId
      ? { ...g, fotos: g.fotos.map(f => (f.id === fotoId ? { ...f, caption } : f)) }
      : g)));

  // --- Selector de personal (igual que en el Informe Diario: Equipo A / Equipo B) ---
  const [personalParaCreado, setPersonalParaCreado] = useState("");
  const [personalParaTecnico, setPersonalParaTecnico] = useState("");
  const aplicarPersonalCreado = (valor: string) => {
    if (!valor) return;
    const [n, c] = valor.split("|");
    setCreadoNombre(n); setCreadoCargo(c);
    setPersonalParaCreado("");
  };
  const aplicarPersonalTecnico = (valor: string) => {
    if (!valor) return;
    const [n] = valor.split("|");
    setTecnicoRespuesta(n);
    setPersonalParaTecnico("");
  };

  // ---------------------------------------------------------------------------------------
  // Generación del documento Word
  // ---------------------------------------------------------------------------------------
  const generarDocumento = async () => {
    if (!fecha) { showToast("Selecciona la fecha del informe.", true); return; }
    if (!carroCodigo.trim()) { showToast("Selecciona el carro / sitio.", true); return; }

    setIsGenerating(true);
    try {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, ImageRun, WidthType, BorderStyle, AlignmentType,
        HeadingLevel, VerticalAlign, TableLayoutType,
      } = await cargarDocx(); // se descarga una sola vez (y se precarga al abrir el formulario)

      const cellBorders = (color?: string) => {
        const b = { style: BorderStyle.SINGLE, size: 4, color: color || "D9D9D9" };
        return { top: b, bottom: b, left: b, right: b };
      };
      const noBorders = () => {
        const n = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
      };

      // Logos (en caché) y TODAS las fotos se resuelven en paralelo antes de armar el documento;
      // el documento se arma igual que antes, solo que ya no espera cada descarga por separado.
      const [{ logoBytes, logoType, coverBytes, coverType }, imagenes] = await Promise.all([
        logosInforme(),
        resolverImagenes(grupos.flatMap(g => g.fotos.map(f => f.photo))),
      ]);
      const revisadoPor = REVISADO_TEXT_FIJO.split("\n").map(s => s.trim()).filter(Boolean);
      const carroNombre = carroDisplay(carroCodigo);

      const headerCellMargins = { top: 160, bottom: 160, left: 220, right: 220 };

      // --- Encabezado repetido en cada página del cuerpo del informe ---
      const header = new Header({
        children: [
          new Table({
            width: { size: 9360, type: WidthType.DXA },
            layout: TableLayoutType.FIXED,
            columnWidths: [2059, 4493, 2808],
            borders: cellBorders("000000"),
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 2059, type: WidthType.DXA },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 40 }, type: logoType })],
                    })],
                  }),
                  new TableCell({
                    width: { size: 4493, type: WidthType.DXA },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Reporte Falla", size: 18, font: "Arial", bold: true })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: LINEA_SERVICIO_FIJA, size: 14, font: "Arial" })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 2808, type: WidthType.DXA },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: `N° Contrato: ${N_CONTRATO_FIJO}`, size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: `Versión: ${VERSION_FIJA}`, size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Fecha: ${formatFechaLarga(fecha)}`, size: 15, font: "Arial" })] }),
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
        new Paragraph({ children: [new TextRun({ text: "REPORTE DE FALLA", size: 30, font: "Arial", color: "000000" })] }),
        new Paragraph({ children: [new TextRun({ text: carroNombre, bold: true, size: 30, font: "Arial", color: "000000" })] }),
        ...(ubicacion.trim() ? [new Paragraph({ children: [new TextRun({ text: ubicacion, size: 24, font: "Arial", color: "000000" })] })] : []),
        new Paragraph({ children: [new TextRun({ text: formatFechaLarga(fecha), size: 24, font: "Arial", color: "000000" })] }),
      ];

      const cajaFirmas: docx.Paragraph[] = [
        new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Creado por:", size: 20, font: "Arial", bold: true })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: creadoNombre, size: 20, font: "Arial" })] }),
        new Paragraph({ children: [new TextRun({ text: `Cargo: ${creadoCargo}`, size: 20, font: "Arial" })] }),
        new Paragraph({ text: "_______________" }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Revisado por:", size: 20, font: "Arial", bold: true })] }),
        new Paragraph({ text: "" }),
        ...revisadoPor.map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20, font: "Arial" })] })),
        new Paragraph({ text: "_______________" }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Autorizado por:", size: 20, font: "Arial", bold: true })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: AUTORIZADO_NOMBRE_FIJO, size: 20, font: "Arial" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: `Cargo: ${AUTORIZADO_CARGO_FIJO}`, size: 20, font: "Arial" })] }),
      ];

      const coverTable = new Table({
        width: { size: 9360, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [6360, 3000],
        borders: noBorders(),
        rows: [new TableRow({
          children: [
            new TableCell({ width: { size: 6360, type: WidthType.DXA }, borders: noBorders(), children: coverLeftChildren }),
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
              margins: { left: 260, top: 100, bottom: 100, right: 100 },
              children: [
                new Table({
                  width: { size: 2640, type: WidthType.DXA },
                  layout: TableLayoutType.FIXED,
                  columnWidths: [2640],
                  borders: cellBorders("000000"),
                  rows: [new TableRow({ children: [new TableCell({ borders: cellBorders("000000"), margins: { top: 100, bottom: 100, left: 120, right: 120 }, children: cajaFirmas })] })],
                }),
              ],
            }),
          ],
        })],
      });

      // --- Registro fotográfico: bloques con nota opcional + fotos (de a 2) + leyenda opcional ---
      const buildFotoImgCell = async (slot: FotoSlot, widthDxa: number, columnSpan: 1 | 2) => {
        const children: docx.Paragraph[] = [];
        if (slot.photo) {
          const { bytes, type } = imagenes.get(slot.photo) ?? await bytesDeImagen(slot.photo);
          const w = columnSpan === 2 ? 420 : 240;
          const h = columnSpan === 2 ? 260 : 220;
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: w, height: h }, type })] }));
        } else {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin foto cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] }));
        }
        if (slot.caption?.trim()) {
          children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: slot.caption, bold: true, size: 18, font: "Arial" })] }));
        }
        return new TableCell({ width: { size: widthDxa, type: WidthType.DXA }, columnSpan, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children });
      };

      const buildGrupoTable = async (grupo: RegistroGrupo) => {
        const rows: docx.TableRow[] = [];
        const colWidth = 9360;

        if (grupo.nota.trim()) {
          const notaLineas = grupo.nota.split("\n").map(s => s.trim()).filter(Boolean);
          rows.push(new TableRow({
            children: [new TableCell({
              columnSpan: 2, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: notaLineas.map(linea => new Paragraph({ children: [new TextRun({ text: linea, bold: true, font: "Arial", size: 20 })] })),
            })],
          }));
        }

        for (let i = 0; i < grupo.fotos.length; i += 2) {
          const chunk = grupo.fotos.slice(i, i + 2);
          if (chunk.length === 2) {
            const cells = await Promise.all(chunk.map(f => buildFotoImgCell(f, colWidth / 2, 1)));
            rows.push(new TableRow({ children: cells }));
          } else {
            const cell = await buildFotoImgCell(chunk[0], colWidth, 2);
            rows.push(new TableRow({ children: [cell] }));
          }
        }

        if (grupo.caption.trim()) {
          const captionLineas = grupo.caption.split("\n").map(s => s.trim()).filter(Boolean);
          rows.push(new TableRow({
            children: [new TableCell({
              columnSpan: 2, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 120, right: 120 },
              children: captionLineas.map(linea => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: linea, font: "Arial", size: 19 })] })),
            })],
          }));
        }

        if (rows.length === 0) return null;
        return new Table({ width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [4680, 4680], borders: cellBorders(), rows });
      };

      const fotoBlocks: (docx.Paragraph | docx.Table)[] = [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "C. Registro Fotográfico", color: BLUE, size: 26, font: "Arial", bold: true })] }),
        new Paragraph({ text: "" }),
      ];
      for (const grupo of grupos) {
        const tabla = await buildGrupoTable(grupo);
        if (tabla) {
          fotoBlocks.push(tabla);
          fotoBlocks.push(new Paragraph({ text: "" }));
        }
      }

      // --- Cuerpo del informe ---
      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
        sections: [
          { properties: { page: { size: { width: 12240, height: 15840 } } }, children: [coverTable] },
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            headers: { default: header },
            children: [
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "A. Descripción de falla", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...descripcionTexto.split("\n").map(linea => new Paragraph({ children: [new TextRun({ text: linea, font: "Arial" })] })),
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: notificacionIntro, font: "Arial" })] }),
              new Paragraph({ text: "" }),
              ...notificacionPuntos.filter(p => p.trim()).map((p, idx) => new Paragraph({ indent: { left: 400 }, children: [new TextRun({ text: `${idx + 1}) ${p}`, font: "Arial" })] })),
              ...(notificacionCheckItem.trim() ? [new Paragraph({ indent: { left: 800 }, children: [new TextRun({ text: `✓ ${notificacionCheckItem}`, font: "Arial", underline: {} })] })] : []),
              new Paragraph({ text: "" }),

              new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200 }, children: [new TextRun({ text: "B. Solución Implementada", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: solucionIntro, font: "Arial" })] }),
              new Paragraph({ text: "" }),
              ...hallazgos.filter(h => h.trim()).map(h => new Paragraph({ text: h, bullet: { level: 0 } })),
              new Paragraph({ text: "" }),
              new Paragraph({ children: [new TextRun({ text: "Solución", font: "Arial", bold: true })] }),
              new Paragraph({ text: "" }),
              ...accionesSolucion.filter(a => a.trim()).map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
              new Paragraph({ text: "" }),

              new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200 }, children: [new TextRun({ text: "Verificación Final", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: verificacionTexto, font: "Arial" })] }),
              ...(verificacionCheckItem.trim() ? [
                new Paragraph({ text: "" }),
                new Paragraph({ indent: { left: 400 }, children: [new TextRun({ text: `✓ ${verificacionCheckItem}`, font: "Arial", underline: {} })] }),
              ] : []),

              ...fotoBlocks,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const [year, month, day] = fecha.split("-");
      const filename = `Informe_de_falla_${carroCodigo}_${day}-${month}-${year}.docx`;
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
            <div className="md:col-span-2">
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Ubicación (opcional, portada)</label>
              <input type="text" value={ubicacion} onChange={e => setUbicacion(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" placeholder="Se completa sola al elegir el carro" />
            </div>

            <div className="md:col-span-2 pt-1">
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por — seleccionar de la lista (igual que en el Informe Diario)</label>
              <select value={personalParaCreado} onChange={e => { setPersonalParaCreado(e.target.value); aplicarPersonalCreado(e.target.value); }} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white">
                <option value="">-- Seleccionar supervisor / técnico --</option>
                {equiposPersonal.map(eq => (
                  <optgroup key={eq.etiqueta} label={eq.etiqueta}>{eq.personas.map(p => <option key={p.nombre} value={opcionPersonal(p)}>{p.nombre} - {p.cargo}</option>)}</optgroup>
                ))}
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
            <Sparkles size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Autocompletar (falla común, horas y técnico)
          </summary>
          <p className="text-xs text-gray-500 mb-3">
            Elige el tipo de falla y completa las horas y el técnico que atendió: al pulsar "Autocompletar" se redactan automáticamente la descripción, la notificación, los hallazgos, la solución y la verificación, usando el carro, la fecha y las horas de arriba. El texto queda editable después.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="md:col-span-2">
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
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Hora de respuesta / verificación en terreno</label>
              <input type="time" value={horaRespuesta} onChange={e => setHoraRespuesta(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Hora 100% operativo</label>
              <input type="time" value={horaOperativo} onChange={e => setHoraOperativo(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Técnico (1° asistencia / tiempo de respuesta)</label>
              <input type="text" value={tecnicoRespuesta} onChange={e => setTecnicoRespuesta(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Seleccionar técnico de la lista (igual que en el Informe Diario)</label>
              <select value={personalParaTecnico} onChange={e => { setPersonalParaTecnico(e.target.value); aplicarPersonalTecnico(e.target.value); }} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white">
                <option value="">-- Seleccionar supervisor / técnico --</option>
                {equiposPersonal.map(eq => (
                  <optgroup key={eq.etiqueta} label={eq.etiqueta}>{eq.personas.map(p => <option key={p.nombre} value={opcionPersonal(p)}>{p.nombre} - {p.cargo}</option>)}</optgroup>
                ))}
              </select>
            </div>
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
                <button type="button" onClick={() => removeListItem(setNotificacionPuntos, i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
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
                <button type="button" onClick={() => removeListItem(setHallazgos, i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100 self-start"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => addListItem(setHallazgos)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mb-4 flex items-center gap-1"><Plus size={13} /> Agregar hallazgo</button>

          <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Solución — acciones realizadas (viñetas)</label>
          <div className="space-y-2 mb-2">
            {accionesSolucion.map((a, i) => (
              <div key={i} className="flex gap-2">
                <textarea value={a} onChange={e => updateListItem(setAccionesSolucion, i, e.target.value)} rows={2} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeListItem(setAccionesSolucion, i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100 self-start"><Trash2 size={15} /></button>
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
                    <div key={slot.id} className="photo-slot w-[130px] text-center text-[10px] text-gray-500 relative border-2 border-dashed border-gray-300 rounded-md p-1 bg-white">
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
                        onClick={() => slot.photo && setFotoAmpliada(slot.photo)}
                        className={`w-full h-[80px] object-cover rounded mb-1 bg-gray-100 ${slot.photo ? 'cursor-zoom-in' : ''}`}
                      />
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