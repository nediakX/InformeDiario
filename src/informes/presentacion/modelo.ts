// Presentación del turno (DSAL): qué sale en cada lámina, a partir de los Informes Diarios de la semana de turno.
import { esSemillaSinEditar, type BorradorEntry, type EvidenceBlockLike } from '../../datos/borradoresDiario';
import type { SemanaTurno } from '../../datos/turnos';
import { conPorDefecto, consolidarActividades, esMantencion, repiteActividad, sinAcentos } from './criterios';
import type { FilaOmFds } from './modeloFds';

export interface DifusionDia {
  /** Título de la actividad tal como sale en la lámina (ej: "ART: Conducción vehículo liviano."). */
  titulo: string;
  /** Fotos de la actividad (URL o dataURL). */
  fotos: string[];
}

export interface DiaPresentacion {
  fecha: string;
  /** Hay Informe Diario de Turno Día para esa fecha (no es un borrador vacío). */
  tieneInforme: boolean;
  /** Actividades del día para el resumen de Turno Día. */
  resumen: string[];
  /** Difusiones del día: actividades con fotos (ART, flash, reuniones, charlas...). */
  difusiones: DifusionDia[];
  /** Hay Informe Diario de Turno Noche para esa fecha. */
  tieneNoche: boolean;
  /** Foto del registro de reportabilidad GG del Informe de Turno Noche de ese día (null = sin foto). */
  fotoGG: string | null;
}

export interface DatosPresentacion {
  letra: 'A' | 'B';
  inicio: string;
  fin: string;
  /** Un elemento por cada día de la semana de turno, en orden. */
  dias: DiaPresentacion[];
  /** Actividades de Turno Noche: primero las fijas de la referencia y después las demás de la semana (sin repetir). */
  resumenNoche: string[];
  /** Observaciones de Turno Noche (sin repetir ni las actividades ya declaradas). Se pueden editar antes de generar. */
  observacionesNoche: string[];
  /** Actividades de mantención de los Informes Diarios del periodo, tal como se escribieron. Marcan REALIZADO en la lámina 8. */
  mantenciones: string[];
  /**
   * Lámina 21 (estado de mantenimiento de GG): una fila por generador con el dato más nuevo hasta el último día del
   * turno (Tabla de mantenimiento GG, informes de mantenimiento y reportes de GG). Sin filas queda la tabla de la plantilla.
   */
  mantenimientoGG?: FilaOmFds[];
  /**
   * Lámina 30 (fallas y atención de equipos CPE): equipos donde se instaló CPE en el periodo, como se ven en la lámina
   * (ej: "CAEX 140"). Sin ninguno, la lámina queda con "SIN INSTALACIONES".
   */
  instalaciones: string[];
  /** Textos que hablan de una instalación de CPE pero sin número de equipo (para avisar que falta completarlo). */
  instalacionesSinEquipo: string[];
}

// Registros individuales de rutina: no entran al resumen del turno.
const RUTINA_RESUMEN = /check ?list|l200|autoevaluacion|fatiga|alta visibilidad|proteccion solar|hidratacion|tareas administrativas|ropa|registro art/;
// Rutina diaria, monitoreo y bloques que tienen su propia lámina: no son difusiones.
const RUTINA_DIFUSION = /inicio de turno|check ?list|l200|autoevaluacion|fatiga|alta visibilidad|proteccion solar|hidratacion|tareas administrativas|ropa|planificacion|controles? sso|monitoreo|vertiv|verificacion de entorno|reportabilidad|registro de mantenimiento de gg/;

// Actividades fijas de Turno Noche en la lámina 4: salen siempre primero, con la redacción de la referencia.
const ACTIVIDADES_NOCHE_POR_DEFECTO = [
  'Planificación actividades diarias.',
  'Control de fatiga y somnolencia (Encuesta gestión de alerta temprana).',
  'Confección de Análisis de Riesgo del Trabajo (ART).',
  'Se realiza reportabilidad diaria GG. LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 Y MMOO-01.',
  'Monitoreo General status ENODO B.',
  'Monitoreo general status de energía.',
];
// Rutina de Turno Noche que la lámina 4 no muestra (la referencia no la trae).
const RUTINA_NOCHE_LAMINA = /actividades administrativas|tareas administrativas/;

/** Quita los repetidos sin distinguir tildes, mayúsculas, puntuación ni espacios de más. */
const sinRepetidos = (lista: string[]) => {
  const vistos = new Set<string>();
  return lista.filter(t => {
    const clave = sinAcentos(t).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!clave || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
};

/** Texto para el resumen: sin el "Registro de" inicial (ej: "Reunión inicio de turno."). */
const tituloResumen = (t: string) => t.trim().replace(/^registro de\s+/i, '');

/** Título para la difusión: "Registro ART X" pasa a "ART: X". */
const tituloDifusion = (t: string) => {
  const s = t.trim();
  const m = s.match(/^registro art\.?\s*/i);
  return m ? `ART: ${s.slice(m[0].length)}` : s;
};

const esFotoGG = (b: EvidenceBlockLike) => {
  const t = sinAcentos(b.title);
  return t.startsWith('registro de mantenimiento de gg') || t.startsWith('reportabilidad gg');
};

/** Resumen de Turno Día: las actividades del día que no son registros de rutina. */
export const resumenDeDia = (entrada: BorradorEntry): string[] =>
  sinRepetidos(entrada.actividades.map(a => a.trim()).filter(a => a && !RUTINA_RESUMEN.test(sinAcentos(a)))).map(tituloResumen);

/** Difusiones del día: bloques de actividad con fotos que no son rutina. */
export const difusionesDeDia = (entrada: BorradorEntry): DifusionDia[] =>
  entrada.evidenceBlocks
    .filter(b => !b.cuadroVertiv && !b.isFixed && !esFotoGG(b) && !RUTINA_DIFUSION.test(sinAcentos(b.title)))
    .map(b => ({ titulo: tituloDifusion(b.title), fotos: b.photos.filter((p): p is string => Boolean(p)) }))
    .filter(d => d.titulo.trim() && d.fotos.length > 0);

/** Primera foto del registro de reportabilidad GG del informe. */
export const fotoGGDe = (entrada: BorradorEntry): string | null => {
  for (const b of entrada.evidenceBlocks) {
    if (!esFotoGG(b)) continue;
    const foto = b.photos.find((p): p is string => Boolean(p));
    if (foto) return foto;
  }
  return null;
};

// ---- Instalaciones de CPE (lámina 30) -------------------------------------------------------------

// Equipo minero donde se instala el CPE, y cómo se nombra en la lámina ("" = solo el número).
const NOMBRE_EQUIPO: [RegExp, string][] = [
  [/^caex$/, 'CAEX'], [/^camion(?:es)?$/, 'CAMIÓN'], [/^palas?$/, 'PALA'], [/^perforadoras?$/, 'PERFORADORA'],
  [/^(?:excavadoras?|exc)$/, 'EXC'], [/^cargador(?:es)?$/, 'CARGADOR'], [/^bulldozers?$/, 'BULLDOZER'],
  [/^motoniveladoras?$/, 'MOTONIVELADORA'], [/^tractor(?:es)?$/, 'TRACTOR'], [/^wheeldozers?$/, 'WHEELDOZER'], [/^aljibes?$/, 'ALJIBE'],
];
const TIPO_EQUIPO = 'caex|camion(?:es)?|palas?|perforadoras?|excavadoras?|exc|cargador(?:es)?|bulldozers?|motoniveladoras?|tractor(?:es)?|wheeldozers?|aljibes?';
// "CAEX 140", "CAEX-140", "camión N° 140 y 142", "CPE 140", "equipo 140/142": la palabra y uno o más números de equipo.
const EQUIPO_CON_NUMERO = new RegExp(`\\b(${TIPO_EQUIPO}|equipos?|cpe)(?![a-z])[\\s.#_-]*(?:(?:n|no|nro|numero)\\s*[°º.]?\\s*)?(\\d{2,5}(?:\\s*(?:,|\\/|&|\\by\\b|\\be\\b)\\s*\\d{2,5})*)`, 'g');
// Instalación (no desinstalación) de CPE o en un equipo minero.
const ES_INSTALACION = /\b(?:re)?instal(?:a|o|e)/;
const ES_DE_CPE = new RegExp(`\\bcpe(?![a-z])|\\b(?:${TIPO_EQUIPO})(?![a-z])`);

/**
 * Equipos con instalación de CPE que aparecen en los textos (actividades, títulos y observaciones de los informes), sin
 * repetir: ["CAEX 140", "CAEX 142"]. Las desinstalaciones y las instalaciones que no son de CPE (gabinetes, baterías,
 * alimentación DC...) no cuentan.
 */
export function instalacionesCpeDe(textos: string[]): string[] {
  const equipos: string[] = [];
  const vistos = new Set<string>();
  for (const texto of textos) {
    const t = sinAcentos(texto);
    if (!ES_INSTALACION.test(t) || !ES_DE_CPE.test(t)) continue;
    for (const m of t.matchAll(EQUIPO_CON_NUMERO)) {
      const nombre = NOMBRE_EQUIPO.find(([re]) => re.test(m[1]))?.[1] ?? '';
      for (const numero of m[2].split(/\s*(?:,|\/|&|\by\b|\be\b)\s*/).filter(Boolean)) {
        const clave = `${nombre}|${Number(numero)}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        equipos.push(nombre ? `${nombre} ${numero}` : numero);
      }
    }
  }
  return equipos;
}

/** Textos que hablan de una instalación de CPE pero no dicen en qué equipo (ej: "Instalacion CPE", tal como en el listado). */
export const instalacionesSinEquipoDe = (textos: string[]): string[] =>
  [...new Set(textos.map(t => t.trim()).filter(t => {
    const n = sinAcentos(t);
    return ES_INSTALACION.test(n) && ES_DE_CPE.test(n) && !n.match(EQUIPO_CON_NUMERO);
  }))];

/** Título del recuadro de la lámina 30: "INSTALACIÓN" (un equipo) o "INSTALACIONES". */
export const tituloInstalaciones = (equipos: string[]) => (equipos.length === 1 ? 'INSTALACIÓN' : 'INSTALACIONES');

/** Equipos como van en la lámina, sin repetir el tipo seguido: ["CAEX 140", "CAEX 142"] -> "CAEX 140 Y 142". */
export function textoInstalaciones(equipos: string[]): string {
  const partes = equipos.map((e, i) => {
    const [, tipo, numero] = e.trim().match(/^(.*\S)\s+(\d+)$/) ?? [];
    const [, tipoAnterior] = i > 0 ? equipos[i - 1].trim().match(/^(.*\S)\s+(\d+)$/) ?? [] : [];
    return tipo && tipoAnterior && tipo.toUpperCase() === tipoAnterior.toUpperCase() ? numero : e.trim().toUpperCase();
  });
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} Y ${partes[partes.length - 1]}` : partes.join('');
}

/** Construye todo lo que necesita la presentación de la semana de turno. */
export function construirPresentacion(entradas: BorradorEntry[], semana: SemanaTurno): DatosPresentacion {
  const validas = entradas.filter(e => !esSemillaSinEditar(e));
  const buscar = (fecha: string, turno: 'dia' | 'noche') => validas.find(e => e.fecha === fecha && e.turno === turno) ?? null;

  const dias: DiaPresentacion[] = semana.dias.map(fecha => {
    const dia = buscar(fecha, 'dia');
    const noche = buscar(fecha, 'noche');
    // La reportabilidad GG sale del Informe de Turno Noche (y su fecha es la de ese turno).
    const foto = noche ? fotoGGDe(noche) : null;
    return {
      fecha,
      tieneInforme: Boolean(dia),
      tieneNoche: Boolean(noche),
      resumen: dia ? resumenDeDia(dia) : [],
      difusiones: dia ? difusionesDeDia(dia) : [],
      fotoGG: foto,
    };
  });

  const noches = semana.dias.map(f => buscar(f, 'noche')).filter((e): e is BorradorEntry => Boolean(e));
  // Mantenciones de todo el periodo (turno día y noche), tal como las escribieron en los informes.
  const delPeriodo = validas.filter(e => semana.dias.includes(e.fecha));
  const mantenciones = sinRepetidos(
    delPeriodo.flatMap(e => [...e.actividades, ...e.evidenceBlocks.map(b => b.title)]).map(t => t.trim()).filter(esMantencion),
  );
  // Actividades declaradas en el periodo: una observación que las repite no sale.
  const declaradas = delPeriodo.flatMap(e => e.actividades.map(a => a.trim())).filter(Boolean);
  const textosDelPeriodo = delPeriodo.flatMap(e => [...e.actividades, ...e.evidenceBlocks.map(b => b.title), ...e.observaciones]);
  // Turno Noche sin la rutina administrativa (la referencia no la trae).
  const actividadesNoche = noches.flatMap(n => n.actividades.map(a => a.trim())).filter(a => a && !RUTINA_NOCHE_LAMINA.test(sinAcentos(a)));
  return {
    letra: semana.letra,
    inicio: semana.inicio,
    fin: semana.fin,
    dias,
    resumenNoche: conPorDefecto(ACTIVIDADES_NOCHE_POR_DEFECTO, sinRepetidos(actividadesNoche)),
    // Sin las que repiten una actividad declarada, y las que dicen lo mismo con otras palabras se unen en una.
    observacionesNoche: consolidarActividades(
      sinRepetidos(noches.flatMap(n => n.observaciones.map(o => o.trim()))).filter(o => !repiteActividad(o, declaradas)),
    ),
    mantenciones,
    // Lámina 30: instalaciones de CPE del periodo (Turno Día y Noche), en actividades, títulos de fotos y observaciones.
    instalaciones: instalacionesCpeDe(textosDelPeriodo),
    instalacionesSinEquipo: instalacionesCpeDe(textosDelPeriodo).length ? [] : instalacionesSinEquipoDe(textosDelPeriodo),
  };
}

/** Nombre del archivo, con el mismo estilo que las presentaciones de referencia. */
export const nombreArchivoPresentacion = (datos: Pick<DatosPresentacion, 'letra' | 'inicio' | 'fin'>) => {
  const corta = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y.slice(2)}`; };
  const larga = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
  return `EJECUTIVA_Presentacion_Turno${datos.letra}_LTE_DSAL_${corta(datos.inicio)}_al_${larga(datos.fin)}.pptx`;
};
