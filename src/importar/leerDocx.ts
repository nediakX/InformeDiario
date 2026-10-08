// Lectura de un Word (.docx) para "Importar informe": convierte el documento en una lista simple de
// párrafos y tablas (con sus imágenes ya como dataURL), que después cada importador recorre.

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export interface Parrafo {
  tipo: 'p';
  texto: string;
  /** Estilo del párrafo (Heading1, ListParagraph…). */
  estilo: string;
  /** Nivel de título (1, 2…) o 0 si es texto normal. Reconoce "Heading1" y el "Título 1" de Word en español. */
  nivel: number;
  /** Es un ítem de lista con viñeta / numeración. */
  vineta: boolean;
  /** Empieza en una hoja nueva. */
  saltoPagina: boolean;
  /** Imágenes del párrafo (dataURL). */
  imagenes: string[];
}

export interface Celda {
  /** Textos de cada párrafo de la celda (sin los vacíos). */
  textos: string[];
  imagenes: string[];
  /** Tablas dentro de la celda. */
  tablas: Tabla[];
  /** Cuántas columnas ocupa. */
  span: number;
}

export interface Tabla {
  tipo: 'tabla';
  filas: Celda[][];
}

export type Bloque = Parrafo | Tabla;

export interface DocumentoLeido {
  bloques: Bloque[];
  /** Todo el texto del documento (para reconocer el tipo de informe y la división). */
  textoCompleto: string;
  /** XML del documento (para el checklist, que se lee por posición de celdas). */
  xml: Document;
}

const hijos = (el: Element, nombre: string) =>
  Array.from(el.children).filter(c => c.namespaceURI === W && c.localName === nombre);

/** Texto visible de un elemento (respeta tabulaciones y saltos de línea dentro del párrafo). */
export function textoDe(el: Element): string {
  let texto = '';
  const recorrer = (nodo: Element) => {
    for (const hijo of Array.from(nodo.children)) {
      if (hijo.namespaceURI === W) {
        if (hijo.localName === 't') { texto += hijo.textContent ?? ''; continue; }
        if (hijo.localName === 'tab') { texto += ' '; continue; }
        if (hijo.localName === 'br' || hijo.localName === 'cr') { texto += '\n'; continue; }
        if (hijo.localName === 'sym') {
          // ✓ de Webdings (F061) / Wingdings (F0FC) usado en los checklists.
          const c = (hijo.getAttributeNS(W, 'char') ?? hijo.getAttribute('w:char') ?? '').toUpperCase();
          texto += c === 'F061' || c === 'F0FC' ? '✓' : '';
          continue;
        }
        // Las tablas anidadas se leen aparte.
        if (hijo.localName === 'tbl') continue;
      }
      recorrer(hijo);
    }
  };
  recorrer(el);
  return texto;
}

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp',
  webp: 'image/webp', tif: 'image/tiff', tiff: 'image/tiff',
};

export async function leerDocx(archivo: Blob): Promise<DocumentoLeido> {
  const { default: JSZip } = await import('jszip');
  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(await archivo.arrayBuffer());
  } catch {
    throw new Error('El archivo no es un Word (.docx) válido.');
  }
  const docXml = zip.file('word/document.xml');
  if (!docXml) throw new Error('El archivo no es un Word (.docx) válido.');
  const xml = new DOMParser().parseFromString(await docXml.async('string'), 'application/xml');

  // Relaciones: id → archivo de imagen dentro del .docx.
  const rutas = new Map<string, string>();
  const relsXml = zip.file('word/_rels/document.xml.rels');
  if (relsXml) {
    const rels = new DOMParser().parseFromString(await relsXml.async('string'), 'application/xml');
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      const destino = rel.getAttribute('Target') ?? '';
      if (!/image/i.test(rel.getAttribute('Type') ?? '')) continue;
      rutas.set(rel.getAttribute('Id') ?? '', destino.startsWith('/') ? destino.slice(1) : `word/${destino}`);
    }
  }
  const cache = new Map<string, Promise<string | null>>();
  const imagen = (rid: string): Promise<string | null> => {
    if (!cache.has(rid)) {
      cache.set(rid, (async () => {
        const ruta = rutas.get(rid);
        const f = ruta ? zip.file(ruta.replace(/\/\.\//g, '/')) : null;
        if (!f || !ruta) return null;
        const ext = ruta.split('.').pop()?.toLowerCase() ?? '';
        const mime = MIME[ext];
        if (!mime) return null; // EMF/WMF y otros formatos que el navegador no muestra
        return `data:${mime};base64,${await f.async('base64')}`;
      })());
    }
    return cache.get(rid) as Promise<string | null>;
  };

  /** Imágenes dentro de un elemento (sin entrar a tablas anidadas). */
  const imagenesDe = async (el: Element): Promise<string[]> => {
    const ids: string[] = [];
    const recorrer = (nodo: Element) => {
      for (const hijo of Array.from(nodo.children)) {
        if (hijo.namespaceURI === W && hijo.localName === 'tbl') continue;
        if (hijo.localName === 'blip') {
          const id = hijo.getAttributeNS(R, 'embed');
          if (id) ids.push(id);
        } else if (hijo.localName === 'imagedata') {
          const id = hijo.getAttributeNS(R, 'id');
          if (id) ids.push(id);
        }
        recorrer(hijo);
      }
    };
    recorrer(el);
    return (await Promise.all(ids.map(imagen))).filter((x): x is string => Boolean(x));
  };

  const leerParrafo = async (p: Element): Promise<Parrafo> => {
    const pPr = hijos(p, 'pPr')[0];
    const estilo = pPr ? hijos(pPr, 'pStyle')[0]?.getAttributeNS(W, 'val') ?? '' : '';
    const titulo = estilo.match(/^(?:heading|t\w{0,3}tulo|titre|berschrift)\s*(\d)$/i);
    return {
      tipo: 'p',
      texto: textoDe(p).trim(),
      estilo,
      nivel: titulo ? Number(titulo[1]) : 0,
      vineta: Boolean(pPr && hijos(pPr, 'numPr').length) || /^List/i.test(estilo),
      saltoPagina: Boolean(pPr && hijos(pPr, 'pageBreakBefore').length)
        || Array.from(p.getElementsByTagNameNS(W, 'br')).some(br => br.getAttributeNS(W, 'type') === 'page'),
      imagenes: await imagenesDe(p),
    };
  };

  const leerTabla = async (tbl: Element): Promise<Tabla> => {
    const filas: Celda[][] = [];
    for (const tr of hijos(tbl, 'tr')) {
      const celdas: Celda[] = [];
      for (const tc of hijos(tr, 'tc')) {
        const tcPr = hijos(tc, 'tcPr')[0];
        const span = Number(tcPr ? hijos(tcPr, 'gridSpan')[0]?.getAttributeNS(W, 'val') ?? 1 : 1) || 1;
        const textos: string[] = [];
        const tablas: Tabla[] = [];
        for (const hijo of Array.from(tc.children)) {
          if (hijo.namespaceURI !== W) continue;
          if (hijo.localName === 'p') { const t = textoDe(hijo).trim(); if (t) textos.push(t); }
          if (hijo.localName === 'tbl') tablas.push(await leerTabla(hijo));
        }
        celdas.push({ textos, imagenes: await imagenesDe(tc), tablas, span });
      }
      filas.push(celdas);
    }
    return { tipo: 'tabla', filas };
  };

  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  const bloques: Bloque[] = [];
  const recorrerCuerpo = async (contenedor: Element) => {
    for (const el of Array.from(contenedor.children)) {
      if (el.namespaceURI !== W) continue;
      if (el.localName === 'p') bloques.push(await leerParrafo(el));
      else if (el.localName === 'tbl') bloques.push(await leerTabla(el));
      else if (el.localName === 'sdt') {
        // Controles de contenido (Word los agrega a veces al editar): se lee lo de adentro.
        const contenido = hijos(el, 'sdtContent')[0];
        if (contenido) await recorrerCuerpo(contenido);
      }
    }
  };
  if (body) await recorrerCuerpo(body);

  return { bloques, textoCompleto: body ? textoDe(body) + ' ' + Array.from(body.getElementsByTagNameNS(W, 'tbl')).map(textoDe).join(' ') : '', xml };
}

// --- Utilidades para los importadores ---------------------------------------------------------

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "7 de octubre 2026", "08 de octubre del 2026", "07/10/2026", "07.10.2026" → "2026-10-07" (o '' si no hay fecha). */
export function fechaDesdeTexto(texto: string): string {
  const larga = texto.toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(?:de\s+|del\s+)?(\d{4})/);
  if (larga) {
    const mes = MESES.indexOf(larga[2].replace('setiembre', 'septiembre'));
    if (mes >= 0) return `${larga[3]}-${String(mes + 1).padStart(2, '0')}-${larga[1].padStart(2, '0')}`;
  }
  const corta = texto.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (corta) return `${corta[3]}-${corta[2].padStart(2, '0')}-${corta[1].padStart(2, '0')}`;
  return '';
}

/** Celda/valor "—" (vacío en el Word) → ''. */
export const sinGuion = (v: string | undefined) => {
  const t = (v ?? '').trim();
  return t === '—' || t === '-' ? '' : t;
};

/** Normaliza para comparar textos (sin tildes, minúsculas, espacios simples). */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Una celda que solo dice "(Sin evidencia cargada)" / "(Sin foto cargada)". */
export const esSinFoto = (t: string) => /^\(sin (evidencia|foto|imagen)/i.test(t.trim());

/** Texto de todas las celdas de una tabla (para buscar). */
export const textoTabla = (t: Tabla) => t.filas.flat().map(c => c.textos.join(' ')).join(' ');
