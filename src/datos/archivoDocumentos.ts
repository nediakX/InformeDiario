// Archivo de documentos: los documentos en papel (ART, registros, charlas, checklists, permisos…) que se
// escanearon o fotografiaron en los informes de una división, para buscarlos y bajarlos en PDF con su nombre.
// Solo documentos: las fotos del trabajo (equipos, antenas, filtros, bloqueos, vistas del sitio…) no entran.
//
// Las fotos no guardan si salieron del escáner: es documento la casilla cuyo nombre es el de un documento
// (ver esDocumentoEnPapel), las casillas de Documentación de la mantención preventiva y las hojas del Checklist
// de camioneta.
//
// Un documento son las fotos de una misma casilla o bloque del informe (cada foto es una página del PDF).
import type { BorradorEntry } from './borradoresDiario';
import type { BorradorOtroEntry } from './borradoresOtros';
import { esPreventiva } from '../informes/preventiva/modelo';

export type OrigenDocumento = 'diario' | 'mantenimiento' | 'preventiva' | 'falla' | 'cierre';

export const ORIGENES: OrigenDocumento[] = ['diario', 'mantenimiento', 'preventiva', 'falla', 'cierre'];

export const ETIQUETA_ORIGEN: Record<OrigenDocumento, string> = {
  diario: 'Informe Diario',
  mantenimiento: 'Mantenimiento de generador',
  preventiva: 'Mantención preventiva',
  falla: 'Informe de falla',
  cierre: 'Informe de cierre',
};

/** Lo que va antes del nombre del informe en el nombre del PDF ("Mantenimiento GG LTE_CMF_11"). */
const PREFIJO_ARCHIVO: Record<OrigenDocumento, string> = {
  diario: '', mantenimiento: 'Mantenimiento GG', preventiva: 'Preventiva', falla: 'Falla', cierre: 'Informe de cierre',
};

export interface DocumentoArchivo {
  /** Único en la lista. */
  id: string;
  /** Nombre del documento (el de la casilla o el bloque del informe). */
  nombre: string;
  /** Sección del informe en que está (ej: "Registro fotográfico SSO"); vacío si no tiene. */
  seccion: string;
  /** Fotos del documento, en orden: cada una es una página del PDF (enlace de la nube o foto aún sin subir). */
  paginas: string[];
  /** Fecha del informe (AAAA-MM-DD). */
  fecha: string;
  origen: OrigenDocumento;
  /** Informe del que sale, en corto: "Turno Día A", "LTE_CMF_11", "Carro LTE 05"… */
  informe: string;
  informeId: string;
}

// Palabras de un documento en papel. Se buscan solo en el nombre de la casilla o del bloque: la sección y la
// descripción hablan del trabajo ("Inspección visual de torre y antenas", "según procedimiento LOTO") y no dicen
// si la foto es de un documento.
const PALABRAS_DOCUMENTO = [
  'art', 'ast', 'pts', 'permisos?', 'charlas?', 'check ?lists?', 'formularios?', 'actas?', 'autorizaci[oó]n(?:es)?',
  'certificados?', 'encuestas?', 'autoevaluaci[oó]n', 'declaraci[oó]n', 'bit[aá]coras?', 'licencias?', 'planillas?',
  'documentos?', 'documentaci[oó]n', 'orden(?:es)? de trabajo', 'ot', 'instructivos?', 'pautas?', 'hojas? de', 'libros? de',
  'listas? de (?:verificaci[oó]n|asistencia)', 'verificaci[oó]n de [^.]*?entorno', 'fatiga', 'alta visibilidad',
  'inspecci[oó]n de radios', 'alcohol', 'difusi[oó]n', 'capacitaci[oó]n', 'inducci[oó]n',
  // "Registro ART", "Registro de Reunión…" sí; "Registro fotográfico" y "Registro de mantenimiento de GG" son fotos.
  'registros?(?!\\s+(?:fotogr|de\\s+(?:mantenimiento|mantenci)))',
].join('|');
const ES_DOCUMENTO = new RegExp(`\\b(?:${PALABRAS_DOCUMENTO})\\b`, 'i');
const EMPIEZA_COMO_DOCUMENTO = new RegExp(`^\\s*(?:${PALABRAS_DOCUMENTO})\\b`, 'i');

/** ¿El nombre es el de un documento en papel? ("Registro ART", "Charla 5 Minutos", "Check list de…"). */
export const esDocumentoEnPapel = (nombre: string) => ES_DOCUMENTO.test(nombre.normalize('NFC'));
/** Para casillas sin nombre: la descripción empieza como un documento ("ART de actividad realizada."). */
const empiezaComoDocumento = (descripcion: string) => EMPIEZA_COMO_DOCUMENTO.test(descripcion.normalize('NFC'));

const texto = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');
const primeraLinea = (v: unknown): string => texto(typeof v === 'string' ? v.split(/\r?\n/)[0] : '');
const esFoto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '' && !v.startsWith('data:image/svg');
const sinRepetir = (lista: string[]) => [...new Set(lista)];
const comoLista = (v: unknown): Record<string, unknown>[] =>
  (Array.isArray(v) ? v : []).filter((x): x is Record<string, unknown> => !!x && typeof x === 'object');

/** Nombre limpio: sin espacios de más ni el punto final, con mayúscula inicial. */
export function limpiarNombre(t: string): string {
  const limpio = t.replace(/\s+/g, ' ').trim().replace(/[\s.:;,]+$/, '');
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : '';
}

/** Junta las fotos por documento (mismo nombre y sección), en el orden en que aparecen. Las que no son documentos no entran. */
class Recolector {
  private grupos = new Map<string, DocumentoArchivo>();
  private base: Pick<DocumentoArchivo, 'fecha' | 'origen' | 'informe' | 'informeId'>;
  constructor(base: Pick<DocumentoArchivo, 'fecha' | 'origen' | 'informe' | 'informeId'>) { this.base = base; }

  agregar(nombre: string, fotos: string[], esDocumento: boolean, seccion = '', clave = '') {
    const paginas = fotos.filter(esFoto);
    if (!esDocumento || !paginas.length) return;
    const nombreLimpio = limpiarNombre(nombre) || 'Documento';
    const llave = `${clave}|${seccion}|${nombreLimpio}`;
    const existente = this.grupos.get(llave);
    if (existente) {
      existente.paginas = sinRepetir([...existente.paginas, ...paginas]);
      return;
    }
    this.grupos.set(llave, {
      ...this.base, id: `${this.base.origen}:${this.base.informeId}:${this.grupos.size}`,
      nombre: nombreLimpio, seccion: limpiarNombre(seccion), paginas: sinRepetir(paginas),
    });
  }

  lista(): DocumentoArchivo[] { return [...this.grupos.values()]; }
}

function deDiario(b: BorradorEntry): DocumentoArchivo[] {
  const r = new Recolector({ fecha: b.fecha, origen: 'diario', informe: `Turno ${b.turno === 'noche' ? 'Noche' : 'Día'} ${b.letraTurno ?? ''}`.trim(), informeId: b.id });
  for (const bloque of b.evidenceBlocks ?? []) {
    const fotos = sinRepetir((bloque.photos ?? []).filter(esFoto));
    // Hojas del Checklist de camioneta: un documento por camioneta.
    const delChecklist = new Set<string>();
    for (const [patente, hojas] of Object.entries(bloque.checklistFotos ?? {})) {
      const paginas = (hojas ?? []).filter(h => fotos.includes(h));
      paginas.forEach(h => delChecklist.add(h));
      r.agregar(`Checklist de camioneta ${patente}`, paginas, true, '', 'checklist');
    }
    const otrasDelChecklist = fotos.filter(f => !delChecklist.has(f) && f.includes('/checklist/'));
    r.agregar('Checklist de camioneta', otrasDelChecklist, true, '', 'checklist');
    const titulo = bloque.title ?? '';
    r.agregar(titulo, fotos.filter(f => !delChecklist.has(f) && !f.includes('/checklist/')), esDocumentoEnPapel(titulo));
  }
  return r.lista();
}

/** Lo que va antes de " — " en el título de la lista ("LTE_CMF_11 — Cummins" → "LTE_CMF_11"). */
const antesDelGuion = (t: string) => texto(t.split(' — ')[0]);

function deMantenimiento(e: BorradorOtroEntry): DocumentoArchivo[] {
  const d = e.datos;
  const sitio = texto(d.sitio) || antesDelGuion(e.titulo) || 'Sin sitio';
  const r = new Recolector({ fecha: e.fecha, origen: 'mantenimiento', informe: sitio, informeId: e.id });
  for (const item of comoLista(d.fotos)) {
    const leyenda = texto(item.caption);
    const seccion = texto(item.section);
    const esDoc = leyenda ? esDocumentoEnPapel(leyenda) : empiezaComoDocumento(texto(item.description));
    r.agregar(leyenda || seccion, [item.photo as string], esDoc, seccion);
  }
  return r.lista();
}

function dePreventiva(e: BorradorOtroEntry): DocumentoArchivo[] {
  const d = e.datos;
  const sitio = texto(d.sitio) || texto(e.titulo.split('·')[1]) || 'Sin sitio';
  const r = new Recolector({ fecha: e.fecha, origen: 'preventiva', informe: sitio, informeId: e.id });
  for (const s of comoLista(d.secciones)) {
    if (s.activa === false) continue;
    const tituloSeccion = texto(s.titulo);
    for (const f of comoLista(s.fotos)) {
      const titulo = texto(f.titulo);
      const descripcion = texto(f.descripcion);
      // Las casillas de la sección Documentación (formato documento) y las que se nombraron como documento.
      const esDoc = f.formato === 'doc' || s.clave === 'documentacion'
        || (titulo ? esDocumentoEnPapel(titulo) : empiezaComoDocumento(descripcion));
      r.agregar(titulo || descripcion || tituloSeccion, [f.photo as string], esDoc, tituloSeccion, texto(s.id));
    }
  }
  return r.lista();
}

function deFalla(e: BorradorOtroEntry): DocumentoArchivo[] {
  const d = e.datos;
  const r = new Recolector({ fecha: e.fecha, origen: 'falla', informe: antesDelGuion(e.titulo) || 'Carro', informeId: e.id });
  for (const g of comoLista(d.grupos)) {
    const leyenda = primeraLinea(g.caption);
    const nota = primeraLinea(g.nota);
    for (const slot of comoLista(g.fotos)) {
      const nombre = texto(slot.caption) || leyenda || nota;
      r.agregar(nombre, [slot.photo as string], esDocumentoEnPapel(nombre), '', texto(g.id));
    }
  }
  return r.lista();
}

function deCierre(e: BorradorOtroEntry): DocumentoArchivo[] {
  const d = e.datos;
  const r = new Recolector({ fecha: e.fecha, origen: 'cierre', informe: 'Semana', informeId: e.id });
  for (const s of comoLista(d.seccionesImagenes)) {
    const titulo = texto(s.title);
    r.agregar(titulo, (Array.isArray(s.photos) ? s.photos : []) as string[], esDocumentoEnPapel(titulo), '', texto(s.id));
  }
  return r.lista();
}

const ORDEN_ORIGEN: Record<OrigenDocumento, number> = { diario: 0, mantenimiento: 1, preventiva: 2, falla: 3, cierre: 4 };

/** Todos los documentos de los informes, del más nuevo al más antiguo. */
export function documentosDeInformes(fuentes: {
  diarios: BorradorEntry[]; mantenimientos: BorradorOtroEntry[]; fallas: BorradorOtroEntry[]; cierres?: BorradorOtroEntry[];
}): DocumentoArchivo[] {
  const docs: DocumentoArchivo[] = [
    ...fuentes.diarios.flatMap(deDiario),
    ...fuentes.mantenimientos.flatMap(e => (esPreventiva(e.datos) ? dePreventiva(e) : deMantenimiento(e))),
    ...fuentes.fallas.flatMap(deFalla),
    ...(fuentes.cierres ?? []).flatMap(deCierre),
  ];
  const posicion = new Map(docs.map((d, i) => [d.id, i]));
  return docs.sort((a, b) =>
    b.fecha.localeCompare(a.fecha)
    || ORDEN_ORIGEN[a.origen] - ORDEN_ORIGEN[b.origen]
    || a.informe.localeCompare(b.informe, 'es')
    || posicion.get(a.id)! - posicion.get(b.id)!);
}

/** Sin tildes y en minúsculas (para buscar). */
export const normalizarBusqueda = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** true si el documento tiene todas las palabras buscadas (en su nombre, sección, informe o tipo de informe). */
export function coincideBusqueda(doc: DocumentoArchivo, busqueda: string): boolean {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  if (!palabras.length) return true;
  const enTexto = normalizarBusqueda([doc.nombre, doc.seccion, doc.informe, ETIQUETA_ORIGEN[doc.origen]].join(' ')).replace(/_/g, ' ');
  return palabras.every(p => enTexto.includes(p.replace(/_/g, ' ')));
}

const dmy = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return a && m && d ? `${d}-${m}-${a}` : iso;
};

/** Saca los caracteres que no van en un nombre de archivo (Windows, Android, iPhone). */
const paraArchivo = (t: string) => Array.from(t, c => (c.charCodeAt(0) < 32 ? ' ' : c)).join('')
  .replace(/\s*:\s*/g, ' - ').replace(/[\\/*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().replace(/[.\s]+$/, '');

/** Nombre del PDF: "Registro ART Conducción Vehículo Liviano - Turno Día A - 22-11-2026.pdf". */
export function nombreArchivoPdf(doc: DocumentoArchivo): string {
  const informe = [PREFIJO_ARCHIVO[doc.origen], doc.origen === 'cierre' ? '' : doc.informe].filter(Boolean).join(' ');
  const resto = ` - ${paraArchivo(informe)} - ${dmy(doc.fecha)}`;
  // Nombres muy largos se acortan (Windows no abre rutas muy largas); el informe y la fecha se conservan.
  const nombre = paraArchivo(doc.nombre).slice(0, Math.max(30, 140 - resto.length)).trim();
  return `${nombre}${resto}.pdf`;
}

/** Nombres sin repetir (dentro de un .zip): al segundo igual se le agrega " (2)", y así. */
export function nombresSinRepetir(nombres: string[]): string[] {
  const usados = new Set<string>();
  return nombres.map(nombre => {
    let candidato = nombre;
    for (let n = 2; usados.has(candidato.toLowerCase()); n++) candidato = nombre.replace(/\.pdf$/i, ` (${n}).pdf`);
    usados.add(candidato.toLowerCase());
    return candidato;
  });
}
