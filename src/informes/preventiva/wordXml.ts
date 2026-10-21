// XML del Word de la Mantención Preventiva (sin descargas ni imágenes: se puede probar aparte): se rellena la plantilla del informe de referencia
// ("Reporte_mantencion_preventiva_LTE_CMF_09_11-10-2026"), así la portada, el encabezado, los
// estilos, las listas y las tablas de fotos quedan iguales al original. El cuerpo se arma con los
// mismos párrafos y tablas (copiados del XML original) y cada sección parte en una hoja nueva
// cuando ya no cabe en la actual, igual que en el informe hecho a mano.
import { MESES } from '../../datos/fechas';
import { type DatosPreventiva, type FotoPrev, type PersonaPrev, type FilaBitacora, sinPunto } from './modelo';

// ---------------------------------------------------------------------------------------
// Utilidades de XML
// ---------------------------------------------------------------------------------------

export const escaparXml = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const tx = (t: string) => `<w:t xml:space="preserve">${escaparXml(t)}</w:t>`;

const MINOR = '<w:rFonts w:asciiTheme="minorHAnsi" w:hAnsiTheme="minorHAnsi" w:cstheme="minorHAnsi"/>';
const CALIBRI = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri" w:eastAsia="Calibri"/>';
const runCalibri = (t: string, negrita = false) => `<w:r><w:rPr>${CALIBRI}<w:sz w:val="22"/><w:b w:val="${negrita ? 'on' : 'off'}"/></w:rPr>${tx(t)}</w:r>`;
const runMinor = (t: string, negrita = false) =>
  `<w:r><w:rPr>${MINOR}${negrita ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>${tx(t)}</w:r>`;

// --- Párrafos del cuerpo (mismo XML que el informe de referencia) ---
const ESPACIO = '<w:p><w:pPr><w:pStyle w:val="Textoindependiente"/><w:spacing w:before="7" w:after="1"/></w:pPr></w:p>';
const ESPACIO_CHICO = '<w:p><w:pPr><w:pStyle w:val="Textoindependiente"/><w:spacing w:before="1"/><w:rPr><w:sz w:val="10"/></w:rPr></w:pPr></w:p>';
const PGMAR = '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1000" w:right="980" w:bottom="280" w:left="760" w:header="804" w:footer="0" w:gutter="0"/>';
/** Salto a hoja nueva. El primero (fin de la hoja de texto) además engancha el encabezado PSINet. */
const saltoConEncabezado = () =>
  `<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="567"/></w:tabs><w:spacing w:before="1"/><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr><w:sectPr><w:headerReference w:type="default" r:id="rId10"/>${PGMAR}<w:pgNumType w:start="1"/><w:cols w:space="720"/></w:sectPr></w:pPr></w:p>`;
const SALTO = `<w:p><w:pPr><w:spacing w:line="271" w:lineRule="exact"/><w:jc w:val="center"/><w:rPr><w:sz w:val="24"/></w:rPr><w:sectPr>${PGMAR}<w:cols w:space="720"/></w:sectPr></w:pPr></w:p>`;

const TITULO_DESCRIPCION = '<w:p><w:pPr><w:pStyle w:val="Ttulo1"/><w:ind w:right="2351"/><w:rPr><w:u w:val="none"/></w:rPr></w:pPr><w:r><w:rPr><w:u w:val="thick"/></w:rPr><w:t>Descripción</w:t></w:r></w:p>';

const subtitulo = (t: string) =>
  `<w:p><w:pPr><w:pStyle w:val="Ttulo2"/><w:rPr>${MINOR}<w:b/><w:bCs/><w:color w:val="000000" w:themeColor="text1"/></w:rPr></w:pPr><w:r><w:rPr>${MINOR}<w:b/><w:bCs/><w:color w:val="000000" w:themeColor="text1"/></w:rPr>${tx(t)}</w:r></w:p>`;

const tituloSeccion = (t: string) => {
  const rpr = `${MINOR}<w:b/><w:bCs/><w:color w:val="000000" w:themeColor="text1"/><w:sz w:val="32"/><w:szCs w:val="32"/><w:u w:val="single"/>`;
  return `<w:p><w:pPr><w:pStyle w:val="Ttulo2"/><w:keepNext/><w:jc w:val="center"/><w:rPr>${rpr}</w:rPr></w:pPr><w:r><w:rPr>${rpr}</w:rPr>${tx(t)}</w:r></w:p>`;
};

/** Ítem de lista numerada. numId: 6 = descripción, 18 = administrativas, 19 = planificadas (cada lista parte en 1). */
const itemLista = (t: string, numId: number) => {
  const ind = numId === 6 ? '<w:tabs><w:tab w:val="left" w:pos="142"/></w:tabs><w:ind w:left="426" w:hanging="425"/>' : '<w:spacing w:before="1"/><w:ind w:left="426" w:hanging="450"/>';
  return `<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>${ind}<w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr>${tx(t)}</w:r></w:p>`;
};

/** "1.  Nombre  Cargo" con tabulaciones, todas las personas en un solo párrafo (como el original). */
const listaPersonal = (personas: { nombre: string; cargo: string }[]) => {
  const lineas = personas.map((p, i) => `${i ? '<w:br/>' : ''}${tx(`${i + 1}.`)}<w:tab/>${tx(sinPunto(p.nombre))}<w:tab/>${tx(sinPunto(p.cargo))}`).join('');
  return `<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/><w:tabs><w:tab w:val="left" w:pos="567"/><w:tab w:val="left" w:pos="700"/><w:tab w:val="left" w:pos="3600"/></w:tabs><w:spacing w:before="1"/><w:ind w:left="0" w:firstLine="0"/><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr>${CALIBRI}<w:sz w:val="22"/><w:b w:val="off"/></w:rPr>${lineas}</w:r></w:p>`;
};

// ---------------------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------------------

export interface ImagenWord { rId: string; ancho: number; alto: number }

/** Tamaño (EMU) que ocupa la foto dentro de su casilla, sin deformarla. */
export function encajar(img: { ancho: number; alto: number }, maxAncho: number, maxAlto: number) {
  const escala = Math.min(maxAncho / img.ancho, maxAlto / img.alto);
  return { cx: Math.round(img.ancho * escala), cy: Math.round(img.alto * escala) };
}

let docPrId = 1000;
const dibujo = (img: ImagenWord, maxAncho: number, maxAlto: number) => {
  const { cx, cy } = encajar(img, maxAncho, maxAlto);
  const id = docPrId++;
  return `<w:r><w:drawing><wp:inline distT="0" distR="0" distB="0" distL="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Drawing ${id}" descr="foto_${id}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture ${id}" descr="foto_${id}"/><pic:cNvPicPr><a:picLocks noChangeAspect="true"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="${img.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
};

const BORDES = '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tblBorders>';
const LOOK = '<w:tblLook w:val="01E0" w:firstRow="1" w:lastRow="1" w:firstColumn="1" w:lastColumn="1" w:noHBand="0" w:noVBand="0"/>';
const tablaAncha = (columnas: number, filas: string) =>
  `<w:tbl><w:tblPr><w:tblStyle w:val="TableNormal"/><w:tblW w:w="5000" w:type="pct"/>${BORDES}${LOOK}</w:tblPr><w:tblGrid>${columnas === 2 ? '<w:gridCol w:w="5245"/><w:gridCol w:w="5245"/>' : '<w:gridCol w:w="10490"/>'}</w:tblGrid>${filas}</w:tbl>`;
const fila = (alto: number, celdas: string) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${alto}"/></w:trPr>${celdas}</w:tr>`;
const celda = (ancho: string, contenido: string, centrada = false) =>
  `<w:tc><w:tcPr><w:tcW ${ancho}/>${centrada ? '<w:vAlign w:val="center"/>' : ''}</w:tcPr>${contenido}</w:tc>`;
const PCT_MITAD = 'w:w="2500" w:type="pct"';
const PCT_TODO = 'w:w="5000" w:type="pct"';
// "Mantener con el siguiente" en la fila de la foto: la leyenda nunca queda sola en la hoja siguiente.
const parrafoFoto = (dib: string) =>
  `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:keepNext/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="20"/></w:rPr></w:pPr>${dib}</w:p>`;
const PARRAFO_VACIO_CELDA = '<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:keepNext/><w:jc w:val="center"/></w:pPr></w:p>';

/** "Descripción: …" (y la medición en negrita, si la casilla la lleva). */
const leyenda = (f: FotoPrev, centrada: boolean) => {
  const jc = centrada && f.valor === undefined ? '<w:jc w:val="center"/>' : '';
  const titulo = f.titulo.trim()
    ? `<w:p><w:pPr><w:pStyle w:val="Textoindependiente"/><w:spacing w:before="1"/><w:jc w:val="center"/><w:rPr>${MINOR}<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>${runMinor(f.titulo.trim(), true)}</w:p>`
    : '';
  const desc = f.descripcion.trim()
    ? `<w:p><w:pPr><w:pStyle w:val="Textoindependiente"/><w:spacing w:before="1"/>${jc}<w:rPr>${MINOR}<w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>${runMinor('Descripción: ', true)}${runMinor(f.descripcion.trim())}</w:p>`
    : '';
  const valor = f.valor?.trim()
    ? `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="18" w:line="220" w:lineRule="auto"/><w:rPr><w:sz w:val="24"/></w:rPr></w:pPr>${runCalibri(f.valor.trim(), true)}</w:p>`
    : '';
  return titulo + desc + valor || PARRAFO_VACIO_CELDA;
};

/** Leyenda de las capturas de consola: título en negrita y, debajo, el detalle (ej: "Enlace a carro CMM-06."). */
const leyendaConsola = (f: FotoPrev) => {
  const titulo = `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:line="267" w:lineRule="exact"/><w:jc w:val="center"/><w:rPr>${MINOR}<w:b/><w:bCs/></w:rPr></w:pPr><w:r><w:rPr>${MINOR}<w:b/><w:bCs/></w:rPr>${tx(f.titulo.trim())}</w:r></w:p>`;
  const detalle = f.descripcion.trim()
    ? `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:line="228" w:lineRule="exact"/><w:jc w:val="center"/></w:pPr>${runCalibri(f.descripcion.trim())}</w:p>`
    : '';
  return (f.titulo.trim() ? titulo : '') + detalle || PARRAFO_VACIO_CELDA;
};

// Medidas de cada tipo de casilla (EMU para la foto, twips para el alto de fila), tomadas del original.
const CAJA = {
  par: { w: 3337560, h: 2503170, fila: 4422 },
  doc: { w: 3154680, h: 4069080, fila: 5443 },
  solo: { w: 3520440, h: 2640330, fila: 4422 },
  grande: { w: 5791200, h: 4343400, fila: 7434 },
  consola: { w: 6172200, h: 3520440, fila: 4989 },
};
const EMU_POR_TWIP = 635;

/** Alto aproximado (twips) de una leyenda de `largo` caracteres en una celda de `porLinea` caracteres. */
const altoLeyenda = (f: FotoPrev, porLinea: number) => {
  const texto = `${f.titulo} ${f.descripcion ? `Descripción: ${f.descripcion}` : ''}`.trim();
  const lineas = Math.max(1, Math.ceil(texto.length / porLinea)) + (f.titulo.trim() && f.descripcion.trim() ? 1 : 0) + (f.valor?.trim() ? 1 : 0);
  return 120 + lineas * 270;
};

export interface Bloque { xml: string; alto: number }

function tablaPar(a: FotoPrev, b: FotoPrev, img: Map<string, ImagenWord>, caja: typeof CAJA.par): Bloque {
  const celdaFoto = (f: FotoPrev) => celda(PCT_MITAD, f.photo && img.get(f.photo) ? parrafoFoto(dibujo(img.get(f.photo)!, caja.w, caja.h)) : PARRAFO_VACIO_CELDA, true);
  const altoFotos = Math.max(...[a, b].map(f => (f.photo && img.get(f.photo) ? encajar(img.get(f.photo)!, caja.w, caja.h).cy / EMU_POR_TWIP + 60 : 0)));
  const altoLey = Math.max(altoLeyenda(a, 60), altoLeyenda(b, 60));
  return {
    xml: tablaAncha(2, fila(caja.fila, celdaFoto(a) + celdaFoto(b)) + fila(298, celda(PCT_MITAD, leyenda(a, true)) + celda(PCT_MITAD, leyenda(b, true)))),
    alto: Math.max(caja.fila, altoFotos) + altoLey,
  };
}

function tablaSola(f: FotoPrev, img: Map<string, ImagenWord>): Bloque {
  const caja = CAJA.solo;
  const i = f.photo ? img.get(f.photo) : undefined;
  const xml = `<w:tbl><w:tblPr><w:tblStyle w:val="TableNormal"/><w:tblW w:w="0" w:type="auto"/><w:tblInd w:w="2281" w:type="dxa"/>${BORDES}<w:tblLayout w:type="fixed"/>${LOOK}</w:tblPr><w:tblGrid><w:gridCol w:w="5737"/></w:tblGrid>`
    + fila(caja.fila, celda('w:w="5737" w:type="dxa"', i ? parrafoFoto(dibujo(i, caja.w, caja.h)) : PARRAFO_VACIO_CELDA, true))
    + fila(484, celda('w:w="5737" w:type="dxa"', leyenda(f, false)))
    + '</w:tbl>';
  return { xml, alto: Math.max(caja.fila, i ? encajar(i, caja.w, caja.h).cy / EMU_POR_TWIP + 60 : 0) + altoLeyenda(f, 65) };
}

function tablaGrande(f: FotoPrev, img: Map<string, ImagenWord>): Bloque {
  const consola = f.formato === 'consola';
  const caja = consola ? CAJA.consola : CAJA.grande;
  const i = f.photo ? img.get(f.photo) : undefined;
  const xml = tablaAncha(1,
    fila(caja.fila, celda(PCT_TODO, i ? parrafoFoto(dibujo(i, caja.w, caja.h)) : PARRAFO_VACIO_CELDA, true))
    + fila(consola ? 317 : 342, celda(PCT_TODO, consola ? leyendaConsola(f) : leyenda(f, true), consola)));
  return { xml, alto: Math.max(caja.fila, i ? encajar(i, caja.w, caja.h).cy / EMU_POR_TWIP + 60 : 0) + altoLeyenda(f, 120) };
}

/** Tablas de una sección: las fotos "par"/"doc" van de a dos; la última impar, sola y centrada. */
export function bloquesDeFotos(fotos: FotoPrev[], img: Map<string, ImagenWord>): Bloque[] {
  const bloques: Bloque[] = [];
  let pendientes: FotoPrev[] = [];
  const vaciar = () => {
    for (let i = 0; i < pendientes.length; i += 2) {
      const [a, b] = [pendientes[i], pendientes[i + 1]];
      bloques.push(b ? tablaPar(a, b, img, a.formato === 'doc' || b.formato === 'doc' ? CAJA.doc : CAJA.par) : tablaSola(a, img));
    }
    pendientes = [];
  };
  for (const f of fotos) {
    if (f.formato === 'grande' || f.formato === 'consola') { vaciar(); bloques.push(tablaGrande(f, img)); }
    else pendientes.push(f);
  }
  vaciar();
  return bloques;
}

// ---------------------------------------------------------------------------------------
// Bitácora
// ---------------------------------------------------------------------------------------

const ANCHOS_BITACORA = ['742', '2026', '878', '1354'];
const celdaBitacora = (i: number, contenido: string, centrada = false, encabezado = false) =>
  `<w:tc><w:tcPr><w:tcW w:w="${ANCHOS_BITACORA[i]}" w:type="pct"/>${encabezado ? '<w:shd w:val="clear" w:color="auto" w:fill="9CC2E2"/>' : ''}${centrada ? '<w:vAlign w:val="center"/>' : ''}</w:tcPr>${contenido}</w:tc>`;
const encabezadoBitacora = (t: string) =>
  `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:tabs><w:tab w:val="left" w:pos="855"/></w:tabs><w:spacing w:line="230" w:lineRule="exact"/><w:ind w:left="116" w:right="100"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Arial"/><w:b/><w:sz w:val="20"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial"/><w:b/><w:sz w:val="20"/></w:rPr>${tx(t)}</w:r></w:p>`;
const horaBitacora = (t: string) =>
  `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:spacing w:before="1"/><w:ind w:left="30"/><w:jc w:val="center"/><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr>${tx(t)}</w:r></w:p>`;
const actividadBitacora = (t: string) =>
  `<w:p><w:pPr><w:pStyle w:val="TableParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr><w:tabs><w:tab w:val="left" w:pos="1025"/></w:tabs><w:ind w:left="175" w:right="102" w:hanging="90"/><w:jc w:val="both"/><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr>${tx(t)}</w:r></w:p>`;
const personalBitacora = (nombres: string[]) =>
  `<w:p><w:pPr><w:pStyle w:val="Prrafodelista"/><w:spacing w:line="229" w:lineRule="exact"/><w:ind w:left="0" w:firstLine="0"/><w:rPr>${MINOR}<w:szCs w:val="24"/></w:rPr></w:pPr><w:r><w:rPr>${CALIBRI}<w:sz w:val="22"/><w:b w:val="off"/></w:rPr>${nombres.map((n, i) => `${i ? '<w:br/>' : ''}${tx(`- ${sinPunto(n)}`)}`).join('')}</w:r></w:p>`;

export function personalDeFila(f: FilaBitacora, personal: PersonaPrev[]): string[] {
  if (f.modoPersonal === 'manual') return f.personalManual.split('\n').map(s => s.trim()).filter(Boolean);
  const lista = f.modoPersonal === 'ejecutantes' ? personal.filter(p => p.ejecutante) : personal;
  return lista.map(p => p.nombre).filter(n => n.trim());
}

function tablaBitacora(filas: FilaBitacora[], personal: PersonaPrev[]): Bloque {
  const bordes = BORDES.replace(/000000/g, '565656');
  const cab = `<w:tr><w:trPr><w:trHeight w:val="460"/><w:tblHeader/></w:trPr>${['Hora Inicio', 'Descripción de la Actividad', 'Hora de Término', 'Personal'].map((t, i) => celdaBitacora(i, encabezadoBitacora(t), true, true)).join('')}</w:tr>`;
  let alto = 460;
  const cuerpo = filas.map(f => {
    const acts = f.actividades.map(a => a.trim()).filter(Boolean);
    const nombres = personalDeFila(f, personal);
    // Columna angosta (~36 caracteres por línea, justificado): se estima de más para no partir la fila.
    alto += Math.max(acts.reduce((n, a) => n + Math.ceil((a.length + 4) / 34) * 275, 0), nombres.length * 250, 1284) + 120;
    return `<w:tr><w:trPr><w:trHeight w:val="1284"/></w:trPr>${celdaBitacora(0, horaBitacora(f.inicio), true)}${celdaBitacora(1, acts.length ? acts.map(actividadBitacora).join('') : PARRAFO_VACIO_CELDA)}${celdaBitacora(2, horaBitacora(f.termino), true)}${celdaBitacora(3, nombres.length ? personalBitacora(nombres) : PARRAFO_VACIO_CELDA)}</w:tr>`;
  }).join('');
  return {
    xml: `<w:tbl><w:tblPr><w:tblStyle w:val="TableNormal"/><w:tblW w:w="5000" w:type="pct"/>${bordes}<w:tblLayout w:type="fixed"/>${LOOK}</w:tblPr><w:tblGrid><w:gridCol w:w="1556"/><w:gridCol w:w="4251"/><w:gridCol w:w="1842"/><w:gridCol w:w="2841"/></w:tblGrid>${cab}${cuerpo}</w:tbl>`,
    alto,
  };
}

// ---------------------------------------------------------------------------------------
// Cuerpo completo
// ---------------------------------------------------------------------------------------

/**
 * Alto útil de una hoja (twips), descontando márgenes y el encabezado PSINet. Se deja ~10% de holgura
 * porque Word, LibreOffice y los visores miden distinto el texto: así ninguna tabla se corta entre hojas.
 */
export const ALTO_HOJA = 12300;
const ALTO_TITULO = 1000;
const ALTO_ESPACIO = 300;

/** dd/mm/aa (como aparece en la descripción del informe de referencia). */
const ddmmaa = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; };

/**
 * Arma el XML del cuerpo (todo lo que va después de la portada). `img` relaciona cada foto con su
 * imagen ya agregada al documento. Las secciones parten en hoja nueva cuando no caben en lo que
 * queda de la hoja actual (si la sección entera cabe en una hoja nueva), como en el original.
 */
export function armarCuerpo(d: DatosPreventiva, img: Map<string, ImagenWord>): string {
  docPrId = 1000;
  const partes: string[] = [];
  const personal = d.personal.filter(p => p.nombre.trim());
  const ejecutantes = personal.filter(p => p.ejecutante);

  // --- Hoja de texto ---
  partes.push(ESPACIO_CHICO, TITULO_DESCRIPCION, ESPACIO);
  partes.push(`<w:p><w:pPr><w:jc w:val="both"/><w:rPr>${MINOR}</w:rPr></w:pPr>${runCalibri('El presente documento certifica la realización de mantenimiento preventivo en el sitio ')}${runCalibri(d.sitio.trim())}${runCalibri(', con fecha ')}${runCalibri(ddmmaa(d.fecha))}${runCalibri(' en donde se realizaron las siguientes actividades con el equipo de trabajo:')}</w:p>`);
  partes.push(ESPACIO);
  for (const a of d.actividades.map(x => x.trim()).filter(Boolean)) partes.push(itemLista(a, 6));
  partes.push(ESPACIO);
  if (d.cierreDescripcion.trim()) {
    partes.push(`<w:p><w:pPr><w:pStyle w:val="Textoindependiente"/><w:spacing w:before="1"/><w:ind w:left="120"/><w:rPr>${MINOR}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:pPr>${runMinor(d.cierreDescripcion.trim())}</w:p>`, ESPACIO);
  }
  partes.push(subtitulo('Personal en Turno.'), listaPersonal(personal), ESPACIO);
  partes.push(subtitulo('Actividades Administrativas.'));
  for (const a of d.administrativas.map(x => x.trim()).filter(Boolean)) partes.push(itemLista(a, 18));
  partes.push(ESPACIO, subtitulo('Actividades Planificadas'));
  for (const a of d.planificadas.map(x => x.trim()).filter(Boolean)) partes.push(itemLista(a, 19));
  partes.push(ESPACIO, subtitulo('Personal Ejecutante del Mantenimiento Preventivo'), listaPersonal(ejecutantes));
  partes.push(saltoConEncabezado());

  // --- Secciones con fotos (cada una con sus tablas), paginadas ---
  let usado = 0;
  const nuevaHoja = () => { partes.push(SALTO); usado = 0; };
  const secciones = d.secciones.filter(s => s.activa && s.fotos.some(f => f.photo));
  secciones.forEach((s, idx) => {
    const fotos = s.fotos.filter(f => f.photo);
    const bloques = bloquesDeFotos(fotos, img);
    const altoTitulo = s.mostrarTitulo ? ALTO_TITULO : ALTO_ESPACIO;
    const total = altoTitulo + bloques.reduce((n, b) => n + b.alto + ALTO_ESPACIO, 0);
    // Como en el original: cada sección parte en hoja nueva, salvo que quepa entera en lo que queda.
    if (usado > 0 && total > ALTO_HOJA - usado) nuevaHoja();
    if (s.mostrarTitulo) partes.push(ESPACIO, tituloSeccion(s.titulo), ESPACIO);
    else partes.push(ESPACIO);
    usado += altoTitulo;
    bloques.forEach((b, i) => {
      if (i > 0) {
        if (usado + ALTO_ESPACIO + b.alto > ALTO_HOJA) nuevaHoja();
        else { partes.push(ESPACIO); usado += ALTO_ESPACIO; }
      }
      partes.push(b.xml);
      usado += b.alto;
    });
    if (s.clave === 'vista' && idx < secciones.length - 1) nuevaHoja();
  });

  // --- Bitácora ---
  const filas = d.bitacora.filter(f => f.inicio.trim() || f.termino.trim() || f.actividades.some(a => a.trim()));
  if (filas.length) {
    const tabla = tablaBitacora(filas, personal);
    if (usado > 0 && usado + ALTO_TITULO + tabla.alto > ALTO_HOJA) nuevaHoja();
    partes.push(ESPACIO, tituloSeccion('Bitácora de las actividades de mantenimiento preventivo.'), ESPACIO, tabla.xml);
  }
  partes.push('<w:p/>');
  return partes.join('');
}

// ---------------------------------------------------------------------------------------
// Portada y documento
// ---------------------------------------------------------------------------------------

export const parrafoRevisor = (nombre: string) =>
  `<w:p><w:pPr><w:spacing w:line="362" w:lineRule="auto"/><w:ind w:left="158" w:right="138"/><w:rPr><w:rFonts w:ascii="Trebuchet MS"/><w:sz w:val="28"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Trebuchet MS" w:hAnsi="Trebuchet MS" w:cs="Trebuchet MS" w:eastAsia="Trebuchet MS"/><w:sz w:val="24"/><w:b w:val="off"/></w:rPr>${tx(nombre)}</w:r></w:p>`;

/** dd/mm/aaaa */
export const ddmmaaaa = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
/** "11 octubre 2026" (encabezado de cada hoja). */
export const fechaEncabezado = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]} ${y}`; };

