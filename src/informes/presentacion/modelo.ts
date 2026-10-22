// Presentación del turno (DSAL): qué sale en cada lámina, a partir de los Informes Diarios de la semana de turno.
import { esSemillaSinEditar, type BorradorEntry, type EvidenceBlockLike } from '../../datos/borradoresDiario';
import type { SemanaTurno } from '../../datos/turnos';

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
  /** Actividades de Turno Noche de toda la semana (sin repetir). */
  resumenNoche: string[];
  /** Observaciones de Turno Noche (sin repetir). Se pueden editar antes de generar. */
  observacionesNoche: string[];
}

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Registros individuales de rutina: no entran al resumen del turno.
const RUTINA_RESUMEN = /check ?list|l200|autoevaluacion|fatiga|alta visibilidad|proteccion solar|hidratacion|tareas administrativas|ropa|registro art/;
// Rutina diaria, monitoreo y bloques que tienen su propia lámina: no son difusiones.
const RUTINA_DIFUSION = /inicio de turno|check ?list|l200|autoevaluacion|fatiga|alta visibilidad|proteccion solar|hidratacion|tareas administrativas|ropa|planificacion|controles? sso|monitoreo|vertiv|verificacion de entorno|reportabilidad|registro de mantenimiento de gg/;

const sinRepetidos = (lista: string[]) => {
  const vistos = new Set<string>();
  return lista.filter(t => {
    const clave = sinAcentos(t);
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
  return {
    letra: semana.letra,
    inicio: semana.inicio,
    fin: semana.fin,
    dias,
    resumenNoche: sinRepetidos(noches.flatMap(n => n.actividades.map(a => a.trim()))),
    observacionesNoche: sinRepetidos(noches.flatMap(n => n.observaciones.map(o => o.trim()))),
  };
}

/** Nombre del archivo, con el mismo estilo que las presentaciones de referencia. */
export const nombreArchivoPresentacion = (datos: Pick<DatosPresentacion, 'letra' | 'inicio' | 'fin'>) => {
  const corta = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y.slice(2)}`; };
  const larga = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
  return `EJECUTIVA_Presentacion_Turno${datos.letra}_LTE_DSAL_${corta(datos.inicio)}_al_${larga(datos.fin)}.pptx`;
};
