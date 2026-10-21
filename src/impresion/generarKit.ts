// Arma el "kit de impresión" de la semana de turno: los documentos de faena, uno por persona
// (con nombre, RUT, cargo y fechas ya escritos) más las copias por turno, en dos PDF:
// uno a una cara y otro a doble cara (para no cambiar la configuración a mitad de la impresión).
import { PDFDict, PDFDocument, PDFName, rgb, type PDFEmbeddedPage, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import fuenteNormalUrl from '../assets/fuentes/LiberationSans-Regular.ttf?url';
import fuenteNegritaUrl from '../assets/fuentes/LiberationSans-Bold.ttf?url';

interface Fuentes { normal: PDFFont; negrita: PDFFont }
import { DOCUMENTOS, type CampoTexto, type ContextoSemana, type DocumentoImprimible, type Persona } from './plantillas';

export interface SeleccionDocumento {
  id: string;
  incluir: boolean;
  /** Copias por turno (modo "turno") o copias en blanco adicionales (modo "persona"). */
  extra: number;
}

export interface OpcionesKit {
  semana: ContextoSemana;
  personas: Persona[];
  seleccion: SeleccionDocumento[];
  prellenar: boolean;
  /** "persona": cada trabajador recibe su juego completo junto. "documento": agrupado por tipo. */
  orden: 'persona' | 'documento';
  cargarPdf: (archivo: string) => Promise<ArrayBuffer>;
}

export interface ResultadoKit {
  simple: Uint8Array | null;
  simplePaginas: number;
  doble: Uint8Array | null;
  dobleHojas: number;
  detalle: { documento: string; copias: number }[];
}

/** Quita caracteres que la fuente estándar del PDF no puede escribir (evita que falle la generación). */
function textoSeguro(fuente: PDFFont, texto: string): string {
  try { fuente.encodeText(texto); return texto; } catch {
    return [...texto].filter(c => { try { fuente.encodeText(c); return true; } catch { return false; } }).join('');
  }
}

function escribir(pagina: PDFPage, fuentes: Fuentes, campo: CampoTexto) {
  const fuente = campo.negrita ? fuentes.negrita : fuentes.normal;
  const texto = textoSeguro(fuente, campo.texto.trim());
  if (!texto) return;
  const alto = pagina.getHeight();
  let tamano = campo.tamano ?? 9;
  if (campo.ancho) {
    while (tamano > 5 && fuente.widthOfTextAtSize(texto, tamano) > campo.ancho) tamano -= 0.5;
  }
  if (campo.tapar) {
    const t = campo.tapar;
    pagina.drawRectangle({ x: t.x, y: alto - t.top - t.alto, width: t.ancho, height: t.alto, color: rgb(1, 1, 1) });
  }
  const ancho = fuente.widthOfTextAtSize(texto, tamano);
  pagina.drawText(texto, {
    x: campo.centrado ? campo.x - ancho / 2 : campo.x,
    y: alto - campo.base,
    size: tamano,
    font: fuente,
    color: campo.negrita ? rgb(0, 0, 0) : rgb(0.05, 0.1, 0.25), // azul oscuro: se distingue de lo impreso del formulario
  });
}

interface Copia { doc: DocumentoImprimible; persona: Persona | null }

const leerFuente = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se pudo cargar la letra para el kit de impresión.');
  return r.arrayBuffer();
};

/**
 * Da un nombre único a cada letra incrustada del PDF final. Los formularios de origen traen letras
 * recortadas con el mismo nombre (ej. "BAAAAA+Carlito-Bold" en 4 formularios distintos, cada una con
 * otras letras adentro): en pantalla se ve bien, pero muchas impresoras guardan la letra por su nombre
 * y usan la del primer formulario en todos, así que en papel desaparecen textos (nombres, títulos…).
 */
function nombresDeLetraUnicos(pdf: PDFDocument) {
  let n = 0;
  const etiqueta = () => {
    let k = n++, t = '';
    for (let i = 0; i < 6; i++) { t = String.fromCharCode(65 + (k % 26)) + t; k = Math.floor(k / 26); }
    return t;
  };
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const tipo = obj.get(PDFName.of('Type'));
    if (tipo !== PDFName.of('Font')) continue;
    const base = obj.get(PDFName.of('BaseFont'));
    if (!(base instanceof PDFName)) continue;
    const nombre = base.decodeText();
    const m = /^[A-Z]{6}\+(.+)$/.exec(nombre);
    if (!m) continue;
    const nuevo = PDFName.of(`${etiqueta()}+${m[1]}`);
    obj.set(PDFName.of('BaseFont'), nuevo);
    const desc = obj.lookup(PDFName.of('FontDescriptor'));
    if (desc instanceof PDFDict) desc.set(PDFName.of('FontName'), nuevo);
  }
}

export async function generarKit(op: OpcionesKit): Promise<ResultadoKit> {
  const elegidos = DOCUMENTOS
    .map(doc => ({ doc, sel: op.seleccion.find(s => s.id === doc.id) }))
    .filter((x): x is { doc: DocumentoImprimible; sel: SeleccionDocumento } => Boolean(x.sel?.incluir));

  // Lista ordenada de copias a imprimir.
  const porPersona: Copia[] = [];
  const sueltas: Copia[] = [];
  const personasDocs = elegidos.filter(e => e.doc.modo === 'persona');
  if (op.orden === 'persona') {
    for (const persona of op.personas) for (const { doc } of personasDocs) porPersona.push({ doc, persona });
  } else {
    for (const { doc } of personasDocs) for (const persona of op.personas) porPersona.push({ doc, persona });
  }
  for (const { doc, sel } of elegidos) {
    for (let i = 0; i < Math.max(0, sel.extra); i++) sueltas.push({ doc, persona: null });
  }
  const copias = [...porPersona, ...sueltas];

  const fuentes = new Map<string, PDFDocument>();
  for (const { doc } of elegidos) {
    if (!copias.some(c => c.doc.id === doc.id)) continue;
    fuentes.set(doc.id, await PDFDocument.load(await op.cargarPdf(doc.archivo)));
  }

  const [ttfNormal, ttfNegrita] = await Promise.all([leerFuente(fuenteNormalUrl), leerFuente(fuenteNegritaUrl)]);
  const crear = async () => {
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    // Letra incrustada (no la Helvetica "del sistema"): así la impresora no tiene que reemplazarla.
    const letras: Fuentes = { normal: await pdf.embedFont(ttfNormal, { subset: true }), negrita: await pdf.embedFont(ttfNegrita, { subset: true }) };
    return { pdf, letras, paginas: new Map<string, PDFEmbeddedPage[]>() };
  };
  const simple = await crear();
  const doble = await crear();

  for (const copia of copias) {
    const destino = copia.doc.dobleCara ? doble : simple;
    const origen = fuentes.get(copia.doc.id)!;
    // Cada formulario se incrusta UNA vez y sus copias lo reutilizan (mismas letras e imágenes):
    // el archivo pesa mucho menos y la impresora no recibe la misma letra repetida decenas de veces.
    let incrustadas = destino.paginas.get(copia.doc.id);
    if (!incrustadas) {
      incrustadas = await destino.pdf.embedPages(origen.getPages());
      destino.paginas.set(copia.doc.id, incrustadas);
    }
    // Doble cara: cada copia empieza en el frente de una hoja nueva.
    if (copia.doc.dobleCara && destino.pdf.getPageCount() % 2 !== 0) destino.pdf.addPage();
    const paginas = incrustadas.map((emb, i) => {
      const { width, height } = origen.getPage(i).getSize();
      const pagina = destino.pdf.addPage([width, height]);
      pagina.drawPage(emb, { x: 0, y: 0, width, height });
      return pagina;
    });
    if (copia.doc.dobleCara && paginas.length % 2 !== 0) destino.pdf.addPage();

    for (const campo of copia.doc.correcciones ?? []) escribir(paginas[campo.pagina ?? 0], destino.letras, campo);
    if (op.prellenar) {
      const campos = [
        ...(copia.doc.camposSemana?.(op.semana) ?? []),
        ...(copia.persona && copia.doc.camposPersona ? copia.doc.camposPersona(copia.persona, op.semana) : []),
      ];
      for (const campo of campos) escribir(paginas[campo.pagina ?? 0], destino.letras, campo);
    }
  }

  const guardar = async (d: typeof simple) => {
    if (!d.pdf.getPageCount()) return null;
    const bytes = await d.pdf.save(); // incrusta (recorta) las letras propias
    const final = await PDFDocument.load(bytes);
    nombresDeLetraUnicos(final);
    return final.save();
  };

  const detalle = elegidos
    .map(({ doc }) => ({ documento: doc.nombre, copias: copias.filter(c => c.doc.id === doc.id).length }))
    .filter(d => d.copias > 0);

  return {
    simple: await guardar(simple),
    simplePaginas: simple.pdf.getPageCount(),
    doble: await guardar(doble),
    dobleHojas: Math.ceil(doble.pdf.getPageCount() / 2),
    detalle,
  };
}
