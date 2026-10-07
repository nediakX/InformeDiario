// Arma el "kit de impresión" de la semana de turno: los documentos de faena, uno por persona
// (con nombre, RUT, cargo y fechas ya escritos) más las copias por turno, en dos PDF:
// uno a una cara y otro a doble cara (para no cambiar la configuración a mitad de la impresión).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
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

function escribir(pagina: PDFPage, fuente: PDFFont, campo: CampoTexto) {
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
    color: rgb(0.05, 0.1, 0.25), // azul oscuro: se distingue de lo impreso del formulario
  });
}

interface Copia { doc: DocumentoImprimible; persona: Persona | null }

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

  const simple = await PDFDocument.create();
  const doble = await PDFDocument.create();
  const fuenteSimple = await simple.embedFont(StandardFonts.Helvetica);
  const fuenteDoble = await doble.embedFont(StandardFonts.Helvetica);

  for (const copia of copias) {
    const destino = copia.doc.dobleCara ? doble : simple;
    const fuente = copia.doc.dobleCara ? fuenteDoble : fuenteSimple;
    const origen = fuentes.get(copia.doc.id)!;
    // Doble cara: cada copia empieza en el frente de una hoja nueva.
    if (copia.doc.dobleCara && destino.getPageCount() % 2 !== 0) destino.addPage();
    const paginas = await destino.copyPages(origen, origen.getPageIndices());
    paginas.forEach(p => destino.addPage(p));
    if (copia.doc.dobleCara && paginas.length % 2 !== 0) destino.addPage();

    if (op.prellenar) {
      const campos = [
        ...(copia.doc.camposSemana?.(op.semana) ?? []),
        ...(copia.persona && copia.doc.camposPersona ? copia.doc.camposPersona(copia.persona, op.semana) : []),
      ];
      for (const campo of campos) escribir(paginas[campo.pagina ?? 0], fuente, campo);
    }
  }

  const detalle = elegidos
    .map(({ doc }) => ({ documento: doc.nombre, copias: copias.filter(c => c.doc.id === doc.id).length }))
    .filter(d => d.copias > 0);

  return {
    simple: simple.getPageCount() ? await simple.save() : null,
    simplePaginas: simple.getPageCount(),
    doble: doble.getPageCount() ? await doble.save() : null,
    dobleHojas: Math.ceil(doble.getPageCount() / 2),
    detalle,
  };
}
