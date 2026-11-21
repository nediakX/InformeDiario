// Informe de Falla — Carro: tipos, textos fijos y plantillas de las fallas comunes (los usan el
// formulario y el Word).
import { N_CONTRATO, LINEA_SERVICIO } from '../../datos/catalogos';
import { uid } from '../../lib/fotos';

export interface FotoSlot { id: string; photo: string | null; caption?: string; }

/** Un bloque del registro fotográfico: puede ser solo una nota (sin fotos), solo fotos con leyenda, o ambas. */
export interface RegistroGrupo {
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
export const N_CONTRATO_FIJO = N_CONTRATO;
export const VERSION_FIJA = "1";
export const LINEA_SERVICIO_FIJA = LINEA_SERVICIO;
// Revisado / Autorizado por dependen de la división (ver datos/divisiones.ts).

// --- Listado de carros / sitios ---
export const carroDisplay = (codigo: string) => `Carro ${codigo.replace(/_/g, " ")}`;

/** Horas con que empieza un informe nuevo. */
export const HORAS_INICIALES = { alarma: "07:49", respuesta: "10:15", operativo: "11:40" };

export const ddmmyyyy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
export const formatHora12 = (hhmm: string) => {
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
export interface DatosAuto {
  codigo: string; carro: string; fecha: string;
  horaAlarma: string; horaRespuesta: string; horaOperativo: string;
}
export interface TextosGenerados {
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

export const SOLUCION_INTRO_DEFECTO = "Con el fin de restablecer la gestión remota del sistema, se realizaron las siguientes acciones en terreno:";
export const VERIFICACION_TEXTO_DEFECTO = "El personal del NOC confirma la recuperación completa de la gestión del sistema, validando que es posible acceder al panel de monitoreo sin presentar errores.";

// --- Recuadros que son siempre iguales, cualquiera sea el tipo de falla (boilerplate del informe) ---
export const notaSolicitudNOC = () =>
  "Se solicita la información del estado de la alarma externa al personal de NOC.\nInformando que el sitio se encuentra sin alarmas críticas.";
export const captionART = (carro: string) => `Registro de ART: Atención de Falla ${carro}.`;
export const CAPTION_ENTORNO = "Verificación de condiciones de entorno";
export const CAPTION_CHARLA = "Charla 5 Minutos";

export const FALLAS_COMUNES: { id: string; label: string; build: (d: DatosAuto) => TextosGenerados }[] = [
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
        `Tiempo de respuesta; ${formatHora12(d.horaRespuesta)}.`,
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
        `Tiempo de respuesta; ${formatHora12(d.horaRespuesta)}.`,
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
        `Tiempo de respuesta; ${formatHora12(d.horaRespuesta)} (1° asistencia en terreno).`,
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
        `Tiempo de respuesta; ${formatHora12(d.horaRespuesta)}.`,
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

export const nuevoGrupo = (nota = "", caption = "", nFotos = 1): RegistroGrupo => ({
  id: uid(), nota, caption, fotos: Array.from({ length: nFotos }, () => ({ id: uid(), photo: null })),
});

/** Arma los 8 recuadros estándar del informe (vista general, alarma, ajuste, ART, entorno/charla...) a partir de los textos generados y el carro. */
export const construirGruposEstandar = (t: TextosGenerados, carro: string): RegistroGrupo[] => {
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

/** ["Max Diaz", "Carlos Moll", "José Escobar"] → "Max Diaz, Carlos Moll y José Escobar". */
export const unirNombres = (nombres: string[]) => {
  const lista = nombres.map(n => n.trim().replace(/\.+$/, '')).filter(Boolean);
  if (lista.length <= 1) return nombres.find(n => n.trim())?.trim() ?? '';
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
};
/** Inverso de unirNombres (para informes guardados antes, con un solo texto). */
export const separarNombres = (texto: string) => {
  const partes = texto.split(/\s*,\s*|\s+y\s+/).map(t => t.trim()).filter(Boolean);
  return partes.length ? partes : [texto];
};
