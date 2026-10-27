// Genera la presentación del turno (.pptx) a partir de la plantilla de DSAL: se conserva el diseño
// (láminas, colores, tipografías, imágenes, animaciones y marcos de fotos) y solo se reemplazan
// textos, fotos y leyendas.
import JSZip from 'jszip';
import plantillaUrl from '../../assets/plantillas/presentacion_turno.pptx?url';
import { comprimirDataUrl } from '../../lib/fotos';
import type { DatosPresentacion, DiaPresentacion } from './modelo';
import { esDifusion, mencionaSitio } from './criterios';

export const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
export const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
export const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
export const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const LAMINA_PORTADA = 1;
const LAMINA_RESUMEN_DIA = 3;
const LAMINA_RESUMEN_NOCHE = 4;
const LAMINAS_GG = [10, 11];
const LAMINAS_DIFUSIONES = [13, 14, 15, 16, 17, 18, 19];
export const MESES_MAYUSCULA = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const FOTO_LADO = 1400;
const FOTO_CALIDAD = 0.85;

/** Resultado de generar: el archivo y los avisos que conviene revisar antes de presentarlo. */
export interface ResultadoPresentacion {
  blob: Blob;
  avisos: string[];
}

/** "2026-08-26" -> "26/08/2026" */
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
/** "2026-08-26" -> "26 AGOSTO" */
const diaMesMayuscula = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MESES_MAYUSCULA[m - 1]}`; };

/** Meses abreviados en mayúscula, como en el título de la lámina de mantenimiento: "21 OCT 2026". */
const MESES_ABREV = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const fechaCortaMayuscula = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MESES_ABREV[m - 1]} ${y}`; };
/** "2026-10-27" -> "27-10-2026" */
const dmyGuion = (iso: string) => dmy(iso).replace(/\//g, '-');
/** Número de serie de Excel (días desde 1899-12-30), que es como guarda las fechas el gráfico. */
const serieExcel = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); };
/** Suma días a una fecha ISO ("2026-10-21" + 6 -> "2026-10-27"). */
const sumarDias = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// ---------------------------------------------------------------------------------------
// Utilidades de XML (DOM del navegador)
// ---------------------------------------------------------------------------------------

export const leer = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Una lámina de la plantilla no se pudo leer.');
  return doc;
};
export const escribir = (doc: Document) => {
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith('<?xml') ? xml : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
};

/**
 * Quita los caracteres que XML 1.0 no admite (un texto con ellos deja la lámina dañada para PowerPoint).
 * Los pares sustitutos válidos (emojis, letras raras) se conservan.
 */
export const textoSeguro = (texto: string) => {
  let salida = '';
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0x20 && c <= 0xd7ff) || (c >= 0xe000 && c <= 0xfffd)) {
      salida += texto[i];
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const siguiente = texto.charCodeAt(i + 1);
      if (siguiente >= 0xdc00 && siguiente <= 0xdfff) { salida += texto[i] + texto[i + 1]; i++; }
    }
  }
  return salida;
};

export const hijos = (el: Element, ns: string, local: string) =>
  Array.from(el.children).filter(c => c.localName === local && c.namespaceURI === ns);
export const descendientes = (el: Element, ns: string, local: string) => Array.from(el.getElementsByTagNameNS(ns, local));
export const textoDe = (el: Element) => descendientes(el, NS_A, 't').map(t => t.textContent ?? '').join('');
export const parrafosDe = (el: Element) => hijos(el, NS_A, 'p');
export const txBodyDe = (sp: Element) => hijos(sp, NS_P, 'txBody')[0] ?? sp.getElementsByTagNameNS(NS_P, 'txBody')[0];
export const tieneVinetas = (p: Element) => p.getElementsByTagNameNS(NS_A, 'buChar').length > 0;
const tieneNumeracion = (p: Element) => p.getElementsByTagNameNS(NS_A, 'buAutoNum').length > 0;
export const tieneTexto = (p: Element) => descendientes(p, NS_A, 'r').length > 0;

/** Posición y tamaño de una forma de primer nivel (EMU). */
export const marco = (forma: Element) => {
  const xfrm = forma.getElementsByTagNameNS(NS_A, 'xfrm')[0];
  const off = xfrm?.getElementsByTagNameNS(NS_A, 'off')[0];
  const ext = xfrm?.getElementsByTagNameNS(NS_A, 'ext')[0];
  return {
    x: Number(off?.getAttribute('x') ?? 0), y: Number(off?.getAttribute('y') ?? 0),
    w: Number(ext?.getAttribute('cx') ?? 0), h: Number(ext?.getAttribute('cy') ?? 0),
  };
};

/** Cambia el texto de un párrafo conservando el formato del primer fragmento. */
export function fijarTexto(p: Element, texto: string) {
  const runs = hijos(p, NS_A, 'r');
  if (!runs.length) {
    const r = p.ownerDocument.createElementNS(NS_A, 'a:r');
    r.appendChild(p.ownerDocument.createElementNS(NS_A, 'a:t'));
    p.insertBefore(r, hijos(p, NS_A, 'endParaRPr')[0] ?? null);
    runs.push(r);
  }
  for (const hijo of Array.from(p.children)) {
    if (hijo.localName !== 'pPr' && hijo.localName !== 'endParaRPr' && hijo !== runs[0]) p.removeChild(hijo);
  }
  let t = runs[0].getElementsByTagNameNS(NS_A, 't')[0];
  if (!t) {
    t = p.ownerDocument.createElementNS(NS_A, 'a:t');
    runs[0].appendChild(t);
  }
  t.textContent = textoSeguro(texto);
}

export const fijarTamano = (p: Element, sz: number) => {
  for (const r of descendientes(p, NS_A, 'rPr')) r.setAttribute('sz', String(sz));
};

/** Copia de un párrafo de ejemplo con otro texto (y tamaño opcional). */
export function copiaDe(modelo: Element, texto: string, sz?: number) {
  const copia = modelo.cloneNode(true) as Element;
  fijarTexto(copia, texto);
  if (sz) fijarTamano(copia, sz);
  return copia;
}

/** Reemplaza todos los párrafos de una forma de texto por los dados. */
export function reemplazarParrafos(sp: Element, nuevos: Element[]) {
  const cuerpo = txBodyDe(sp);
  for (const p of parrafosDe(cuerpo)) cuerpo.removeChild(p);
  for (const p of nuevos) cuerpo.appendChild(p);
}

/** Deja la forma con un único párrafo de texto (conserva su formato). */
export function fijarUnico(sp: Element, texto: string) {
  const parrafos = parrafosDe(txBodyDe(sp));
  const base = parrafos.find(tieneTexto) ?? parrafos[0];
  reemplazarParrafos(sp, [copiaDe(base, texto)]);
}

export const primerParrafoCon = (sp: Element, pred: (p: Element) => boolean) =>
  parrafosDe(txBodyDe(sp)).find(p => tieneTexto(p) && pred(p));

/** Tamaño real (pt) de una forma de la lámina, con la escala de su grupo si la tiene. */
export function tamanoEnPt(forma: Element): { ancho: number; alto: number } {
  const { w, h } = marco(forma);
  let sx = 1, sy = 1;
  const grupo = forma.parentElement;
  if (grupo?.localName === 'grpSp') {
    const xf = hijos(grupo, NS_P, 'grpSpPr')[0]?.getElementsByTagNameNS(NS_A, 'xfrm')[0];
    const ext = xf?.getElementsByTagNameNS(NS_A, 'ext')[0];
    const chExt = xf?.getElementsByTagNameNS(NS_A, 'chExt')[0];
    const cx = Number(chExt?.getAttribute('cx') ?? 0);
    const cy = Number(chExt?.getAttribute('cy') ?? 0);
    if (cx > 0 && cy > 0) {
      sx = Number(ext?.getAttribute('cx') ?? cx) / cx;
      sy = Number(ext?.getAttribute('cy') ?? cy) / cy;
    }
  }
  return { ancho: (w * sx) / 12700, alto: (h * sy) / 12700 };
}

/** Tamaño de letra (centésimas de punto) que trae la plantilla en un párrafo, si lo trae. */
export function tamanoDePlantilla(p: Element | undefined): number | null {
  if (!p) return null;
  const con = [...descendientes(p, NS_A, 'rPr'), ...descendientes(p, NS_A, 'endParaRPr')].find(r => r.getAttribute('sz'));
  const sz = Number(con?.getAttribute('sz'));
  return sz > 0 ? sz : null;
}

/** Tamaños a probar: primero el de la plantilla (así se ve igual) y después cada vez más chicos. */
export function tamanosPosibles(base: number | null, respaldo: number[]): number[] {
  if (!base) return respaldo;
  const lista = [base];
  for (let sz = base - 50; sz >= 500; sz -= 50) lista.push(sz);
  return lista;
}

/** Mayor tamaño de letra (centésimas de punto) con el que los textos caben en la caja. Cálculo aproximado. */
export function tamanoQueCabe(caja: { ancho: number; alto: number }, textos: string[], tamanos: number[]): number {
  for (const sz of tamanos) {
    const pt = sz / 100;
    const porLinea = Math.max(10, (caja.ancho - 20) / (pt * 0.7));
    const lineas = textos.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / porLinea)), 0);
    if (lineas * pt * 1.2 + textos.length * pt * 0.3 <= caja.alto - 8) return sz;
  }
  return tamanos[tamanos.length - 1];
}

/**
 * Mayor tamaño (centésimas de punto) con el que una lista de viñetas cabe en la caja, repartida en una o dos columnas.
 * Null si ni el menor tamaño cabe. Cálculo aproximado: la letra de la plantilla es estrecha (~0,58 em por carácter).
 */
export function tamanoEnColumnas(caja: { ancho: number; alto: number }, textos: string[], tamanos: number[], columnas: 1 | 2): number | null {
  const ESPACIO_ENTRE_COLUMNAS = 18; // pt
  const SANGRIA = 22; // pt: márgenes internos y sangría de la viñeta
  for (const sz of tamanos) {
    const pt = sz / 100;
    const anchoColumna = (caja.ancho - (columnas - 1) * ESPACIO_ENTRE_COLUMNAS) / columnas - SANGRIA;
    const porLinea = Math.max(10, anchoColumna / (pt * 0.58));
    const lineas = textos.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / porLinea)), 0);
    const porColumna = Math.ceil(lineas / columnas) + 1; // margen: el reparto entre columnas no es exacto
    const alto = porColumna * pt * 1.2 + Math.ceil(textos.length / columnas) * pt * 0.2;
    if (alto <= caja.alto - 10) return sz;
  }
  return null;
}

// ---------------------------------------------------------------------------------------
// Animaciones: al quitar una forma se quita también todo lo que la anima
// ---------------------------------------------------------------------------------------

/** Quita un p:par de la animación y, si su grupo queda vacío, también el grupo (sin pasar de la secuencia). */
function quitarNodoDeTiempo(par: Element) {
  let lista: Element | null = par.parentElement;
  par.parentElement?.removeChild(par);
  while (lista && lista.localName === 'childTnLst' && lista.children.length === 0) {
    const nodo = lista.parentElement;   // p:cTn dueño de la lista
    if (!nodo || ['mainSeq', 'tmRoot', 'interactiveSeq'].includes(nodo.getAttribute('nodeType') ?? '')) break;
    const envoltorio = nodo.parentElement; // p:par que envuelve a ese nodo
    if (!envoltorio || envoltorio.localName !== 'par') break;
    lista = envoltorio.parentElement;
    envoltorio.parentElement?.removeChild(envoltorio);
  }
}

/**
 * Quita de la animación de la lámina todo lo que apunta a formas que ya no existen.
 * Si queda una referencia colgando, PowerPoint pide "Reparar el archivo".
 */
function limpiarAnimaciones(doc: Document, quitados: Set<string>) {
  const raiz = doc.documentElement;
  const tiempos = descendientes(raiz, NS_P, 'timing')[0];
  if (!tiempos) return;

  // 1) Efectos cuyo destino se quitó: cada efecto es un p:par que envuelve a un nodo cTn con presetClass.
  const efectos = new Set<Element>();
  for (const destino of descendientes(tiempos, NS_P, 'spTgt')) {
    if (!quitados.has(destino.getAttribute('spid') ?? '')) continue;
    let nodo: Element | null = destino.parentElement;
    while (nodo && !(nodo.localName === 'cTn' && nodo.hasAttribute('presetClass'))) nodo = nodo.parentElement;
    if (!nodo?.parentElement) throw new Error('Una animación de la plantilla no tiene un efecto reconocible.');
    efectos.add(nodo.parentElement);
  }
  for (const par of efectos) quitarNodoDeTiempo(par);

  // 2) Bloques de compilación (bldLst) de las formas quitadas.
  const bloques = descendientes(tiempos, NS_P, 'bldLst')[0];
  if (bloques) {
    for (const b of Array.from(bloques.children)) {
      if (quitados.has(b.getAttribute('spid') ?? '')) bloques.removeChild(b);
    }
    if (bloques.children.length === 0) tiempos.removeChild(bloques);
  }

  // 3) Conectores que se pegaban a una forma quitada.
  for (const ref of [...descendientes(raiz, NS_A, 'stCxn'), ...descendientes(raiz, NS_A, 'endCxn')]) {
    if (quitados.has(ref.getAttribute('id') ?? '')) ref.parentElement?.removeChild(ref);
  }

  // 4) Sin efectos, se quita la animación entera; si quedan, los nodos se numeran de nuevo en orden.
  if (!descendientes(tiempos, NS_P, 'cTn').some(c => c.hasAttribute('presetClass'))) {
    tiempos.parentElement?.removeChild(tiempos);
    return;
  }
  let numero = 1;
  for (const nodo of descendientes(tiempos, NS_P, 'cTn')) nodo.setAttribute('id', String(numero++));
}

// ---------------------------------------------------------------------------------------
// Fotos
// ---------------------------------------------------------------------------------------

interface FotoLista { bytes: Uint8Array; ancho: number; alto: number }

/** Reduce una foto (URL o dataURL) a JPEG para la presentación. null si no se puede leer. */
async function aJpeg(src: string): Promise<FotoLista | null> {
  try {
    const comprimida = await comprimirDataUrl(src, FOTO_LADO, FOTO_CALIDAD);
    const blob = await (await fetch(comprimida)).blob();
    const mapa = await createImageBitmap(blob);
    const escala = Math.min(1, FOTO_LADO / Math.max(mapa.width, mapa.height));
    const ancho = Math.max(1, Math.round(mapa.width * escala));
    const alto = Math.max(1, Math.round(mapa.height * escala));
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(mapa, 0, 0, ancho, alto);
    mapa.close?.();
    const jpg = await new Promise<Blob | null>(resolver => lienzo.toBlob(resolver, 'image/jpeg', FOTO_CALIDAD));
    if (!jpg) return null;
    return { bytes: new Uint8Array(await jpg.arrayBuffer()), ancho, alto };
  } catch (error) {
    console.error('No se pudo preparar una foto para la presentación:', error);
    return null;
  }
}

// ---------------------------------------------------------------------------------------
// Generación
// ---------------------------------------------------------------------------------------

interface Lamina {
  numero: number;
  doc: Document;
  rels: Document;
  relsPath: string;
  contadorFotos: number;
}

interface Contexto {
  zip: JSZip;
  laminas: Map<number, Lamina>;
  fotos: Map<string, Promise<FotoLista | null>>;
}

async function abrirLamina(ctx: Contexto, numero: number): Promise<Lamina> {
  const existente = ctx.laminas.get(numero);
  if (existente) return existente;
  const ruta = `ppt/slides/slide${numero}.xml`;
  const relsPath = `ppt/slides/_rels/slide${numero}.xml.rels`;
  const xml = await ctx.zip.file(ruta)!.async('string');
  const relsXml = await ctx.zip.file(relsPath)!.async('string');
  const lamina: Lamina = { numero, doc: leer(xml), rels: leer(relsXml), relsPath, contadorFotos: 0 };
  ctx.laminas.set(numero, lamina);
  return lamina;
}

const arbolDeLamina = (lamina: Lamina) => lamina.doc.getElementsByTagNameNS(NS_P, 'spTree')[0];

/** Asigna una foto a una imagen de la lámina y la recorta para llenar el marco sin deformarla. */
async function ponerFoto(ctx: Contexto, lamina: Lamina, pic: Element, foto: FotoLista) {
  lamina.contadorFotos += 1;
  const nombre = `pres_${lamina.numero}_${lamina.contadorFotos}.jpeg`;
  ctx.zip.file(`ppt/media/${nombre}`, foto.bytes, { createFolders: false });
  const idRel = `rIdPres${lamina.contadorFotos}`;
  const rel = lamina.rels.createElementNS(NS_PR, 'Relationship');
  rel.setAttribute('Id', idRel);
  rel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
  rel.setAttribute('Target', `../media/${nombre}`);
  lamina.rels.documentElement.appendChild(rel);

  const blip = pic.getElementsByTagNameNS(NS_A, 'blip')[0];
  blip.setAttributeNS(NS_R, 'r:embed', idRel);
  const relleno = blip.parentElement!;
  for (const viejo of hijos(relleno, NS_A, 'srcRect')) relleno.removeChild(viejo);

  const { w, h } = marco(pic);
  if (w > 0 && h > 0) {
    const frame = w / h;
    const imagen = foto.ancho / foto.alto;
    let l = 0, r = 0, t = 0, b = 0;
    if (imagen > frame) { l = r = Math.round((1 - frame / imagen) / 2 * 100000); }
    else if (imagen < frame) { t = b = Math.round((1 - imagen / frame) / 2 * 100000); }
    if (l || r || t || b) {
      const recorte = lamina.doc.createElementNS(NS_A, 'a:srcRect');
      if (l) recorte.setAttribute('l', String(l));
      if (t) recorte.setAttribute('t', String(t));
      if (r) recorte.setAttribute('r', String(r));
      if (b) recorte.setAttribute('b', String(b));
      relleno.insertBefore(recorte, blip.nextSibling);
    }
  }
}

/** Quita una imagen sin foto y su animación. Si es la única imagen de su grupo, quita el grupo completo (con su leyenda). */
function quitarImagen(lamina: Lamina, pic: Element) {
  const padre = pic.parentElement!;
  const grupo = padre.localName === 'grpSp' ? padre : null;
  const quitar = grupo && descendientes(grupo, NS_P, 'pic').length === 1 ? grupo : pic;
  const quitados = new Set(descendientes(quitar, NS_P, 'cNvPr').map(c => c.getAttribute('id') ?? ''));
  quitar.parentElement!.removeChild(quitar);
  limpiarAnimaciones(lamina.doc, quitados);
}

/** Leyenda de una imagen: el texto de su mismo grupo (si lo tiene). */
const leyendaDe = (pic: Element): Element | null => {
  const padre = pic.parentElement!;
  if (padre.localName !== 'grpSp') return null;
  return hijos(padre, NS_P, 'sp').find(sp => textoDe(sp).trim() !== '') ?? null;
};

/** Pone el título en la leyenda de una foto; si no cabe en su caja, el texto se achica (como en el resto de la lámina). */
function ajustarLeyenda(leyenda: Element, titulo: string) {
  const parrafo = parrafosDe(txBodyDe(leyenda)).find(tieneTexto) ?? parrafosDe(txBodyDe(leyenda))[0];
  if (!parrafo) return;
  const sz = tamanoQueCabe(tamanoEnPt(leyenda), [titulo], tamanosPosibles(tamanoDePlantilla(parrafo), [1000, 900, 800, 700, 600]));
  fijarUnico(leyenda, titulo);
  for (const p of parrafosDe(txBodyDe(leyenda))) fijarTamano(p, sz);
}

/** Imágenes que reciben una foto: las que usan el marcador de la plantilla (los iconos fijos, como el cono, no). */
const marcosDeFoto = (lamina: Lamina): Element[] => {
  const destinos = new Map<string, string>();
  for (const rel of Array.from(lamina.rels.documentElement.children)) {
    destinos.set(rel.getAttribute('Id') ?? '', rel.getAttribute('Target') ?? '');
  }
  return descendientes(arbolDeLamina(lamina), NS_P, 'pic').filter(pic => {
    const blip = pic.getElementsByTagNameNS(NS_A, 'blip')[0];
    const destino = destinos.get(blip?.getAttributeNS(NS_R, 'embed') ?? '') ?? '';
    return destino.endsWith('marcador.png');
  });
};

const fotoDe = (ctx: Contexto, src: string) => {
  if (!ctx.fotos.has(src)) ctx.fotos.set(src, aJpeg(src));
  return ctx.fotos.get(src)!;
};

// ---- Lámina de portada -----------------------------------------------------------------

function llenarPortada(lamina: Lamina, datos: DatosPresentacion) {
  const sp = descendientes(arbolDeLamina(lamina), NS_P, 'sp').find(s => /REPORTE DE ACTIVIDADES/.test(textoDe(s)));
  if (!sp) return;
  const [titulo, rango] = parrafosDe(txBodyDe(sp));
  fijarTexto(titulo, `REPORTE DE ACTIVIDADES TURNO ${datos.letra} DÍA/NOCHE`);
  if (rango) fijarTexto(rango, `${dmy(datos.inicio)} – ${dmy(datos.fin)}`);
}

// ---- Resumen de Turno Día (una caja por día) --------------------------------------------

function llenarResumenDia(lamina: Lamina, dias: DiaPresentacion[]) {
  const cajas: { etiqueta: Element; cuerpo: Element; fecha: string }[] = [];
  for (const grupo of hijos(arbolDeLamina(lamina), NS_P, 'grpSp')) {
    const formas = descendientes(grupo, NS_P, 'sp');
    const etiqueta = formas.find(sp => /^\d{2}\/\d{2}\/\d{4}$/.test(textoDe(sp).replace(/\s+/g, '')));
    const cuerpo = formas
      .filter(sp => parrafosDe(txBodyDe(sp)).some(tieneVinetas))
      .sort((a, b) => parrafosDe(txBodyDe(b)).length - parrafosDe(txBodyDe(a)).length)[0];
    if (!etiqueta || !cuerpo) continue;
    const [d, m, y] = textoDe(etiqueta).replace(/\s+/g, '').split('/');
    cajas.push({ etiqueta, cuerpo, fecha: `${y}-${m}-${d}` });
  }
  cajas.sort((a, b) => a.fecha.localeCompare(b.fecha));
  cajas.forEach((caja, i) => {
    const dia = dias[i];
    if (!dia) return;
    fijarUnico(caja.etiqueta, dmy(dia.fecha));
    const modelo = primerParrafoCon(caja.cuerpo, tieneVinetas)!;
    const items = dia.tieneInforme
      ? dia.resumen.map(t => t.toUpperCase())
      : ['SIN INFORME DIARIO DE TURNO DÍA.'];
    // Cada caja empieza con el tamaño de la plantilla y se achica solo si el texto no cabe.
    const sz = tamanoQueCabe(tamanoEnPt(caja.cuerpo), items, tamanosPosibles(tamanoDePlantilla(modelo), [900, 800, 700, 650, 600, 550]));
    reemplazarParrafos(caja.cuerpo, items.map(t => copiaDe(modelo, t, sz)));
  });
}

// ---- Resumen de Turno Noche + observaciones --------------------------------------------

/** Alto (pt) del encabezado de fechas, arriba de la caja de actividades de Turno Noche. */
const ALTO_ENCABEZADO_PT = 36;

/** Caja de texto sin relleno ni borde, para escribir encima de otra caja. */
function cajaTransparente(sp: Element) {
  const estilo = hijos(sp, NS_P, 'style')[0];
  if (estilo) sp.removeChild(estilo);
  const spPr = hijos(sp, NS_P, 'spPr')[0];
  if (!spPr) return;
  for (const hijo of Array.from(spPr.children)) {
    if (['noFill', 'solidFill', 'gradFill', 'blipFill', 'pattFill', 'grpFill', 'ln'].includes(hijo.localName)) spPr.removeChild(hijo);
  }
  const relleno = spPr.ownerDocument.createElementNS(NS_A, 'a:noFill');
  const linea = spPr.ownerDocument.createElementNS(NS_A, 'a:ln');
  linea.appendChild(spPr.ownerDocument.createElementNS(NS_A, 'a:noFill'));
  const geometria = Array.from(spPr.children).find(h => h.localName === 'prstGeom' || h.localName === 'custGeom');
  if (geometria) geometria.after(relleno, linea);
  else spPr.append(relleno, linea);
}

/** Encabezado de fechas: una caja sin relleno encima de la parte superior de la caja de actividades. */
function crearEncabezadoFechas(lamina: Lamina, rango: Element, cabecera: Element, texto: string, altoCajaPt: number) {
  const encabezado = rango.cloneNode(true) as Element;
  const nombre = descendientes(encabezado, NS_P, 'cNvPr')[0];
  nombre.setAttribute('id', String(idsNuevos(arbolDeLamina(lamina))()));
  nombre.setAttribute('name', 'Encabezado de fechas');
  cajaTransparente(encabezado);
  reemplazarParrafos(encabezado, [copiaDe(cabecera, texto)]);
  const r = marco(rango);
  fijarRectangulo(xfrmDe(encabezado), { x: r.x, y: r.y, w: r.w, h: (r.h * ALTO_ENCABEZADO_PT) / altoCajaPt });
  rango.parentElement?.insertBefore(encabezado, rango.nextSibling);
}

/** Reparte el texto de una caja en columnas, deja libre arriba el encabezado y quita su ajuste de altura (la caja no crece). */
function fijarColumnas(sp: Element, columnas: 1 | 2) {
  const propiedades = hijos(txBodyDe(sp), NS_A, 'bodyPr')[0];
  if (!propiedades) return;
  propiedades.setAttribute('numCol', String(columnas));
  if (columnas > 1) propiedades.setAttribute('spcCol', String(aEmu(0.25)));
  propiedades.setAttribute('tIns', String(ALTO_ENCABEZADO_PT * 12700));
  for (const ajuste of hijos(propiedades, NS_A, 'spAutoFit')) propiedades.removeChild(ajuste);
}

function llenarResumenNoche(lamina: Lamina, datos: DatosPresentacion) {
  const formas = descendientes(arbolDeLamina(lamina), NS_P, 'sp');
  const rango = formas.find(sp => /\d{2}\/\d{2}\/\d{4}\s*al\s*\d{2}\/\d{2}\/\d{4}/.test(textoDe(sp)));
  if (rango) {
    const cabecera = parrafosDe(txBodyDe(rango))[0];
    const modelo = primerParrafoCon(rango, tieneVinetas);
    const items = datos.resumenNoche.length ? datos.resumenNoche.map(t => t.toUpperCase()) : ['SIN ACTIVIDADES REGISTRADAS EN TURNO NOCHE.'];
    const caja = tamanoEnPt(rango);
    // El encabezado de fechas va en su propia caja, arriba; la lista empieza debajo y puede repartirse en dos columnas.
    const area = { ancho: caja.ancho - 14, alto: caja.alto - ALTO_ENCABEZADO_PT - 4 };
    const tamanos = tamanosPosibles(tamanoDePlantilla(modelo), [1000, 900, 800, 700, 600]);
    // Una columna si el texto cabe con buen tamaño; si no, se reparte en dos columnas (se lee mejor que achicando la letra).
    const unaColumna = tamanoEnColumnas(area, items, tamanos, 1);
    const dosColumnas = tamanoEnColumnas(area, items, tamanos, 2);
    const dos = dosColumnas !== null && (unaColumna === null || dosColumnas > unaColumna);
    const sz = (dos ? dosColumnas : unaColumna) ?? tamanos[tamanos.length - 1];
    crearEncabezadoFechas(lamina, rango, cabecera, `${dmy(datos.inicio)} al ${dmy(datos.fin)}`, caja.alto);
    fijarColumnas(rango, dos ? 2 : 1);
    reemplazarParrafos(rango, modelo ? items.map(t => copiaDe(modelo, t, sz)) : []);
  }
  const obs = formas.find(sp => textoDe(sp).trim().startsWith('OBSERVACIONES'));
  if (obs) {
    const parrafos = parrafosDe(txBodyDe(obs));
    // Encabezado ("OBSERVACIONES:"): todo lo que va antes del primer ítem numerado.
    const primerItem = parrafos.findIndex(p => tieneNumeracion(p) && tieneTexto(p));
    // La plantilla trae párrafos vacíos antes del título: se descartan para que el bloque quede centrado en la caja.
    const cabecera = parrafos.slice(0, primerItem === -1 ? 1 : primerItem).filter(tieneTexto);
    const modelo = primerItem === -1 ? parrafos.find(tieneTexto)! : parrafos[primerItem];
    const items = datos.observacionesNoche.length ? datos.observacionesNoche.map(t => t.toUpperCase()) : ['SIN OBSERVACIONES.'];
    const caja = tamanoEnPt(obs);
    const sz = tamanoQueCabe({ ancho: caja.ancho, alto: caja.alto - 18 }, items, tamanosPosibles(tamanoDePlantilla(modelo), [1050, 900, 800, 700]));
    reemplazarParrafos(obs, [...cabecera, ...items.map(t => copiaDe(modelo, t, sz))]);
  }
}

// ---- Reportabilidad GG (foto por día, del Informe de Turno Noche) -----------------------

async function llenarGG(ctx: Contexto, lamina: Lamina, dias: DiaPresentacion[], inicioDia: number, avisos: string[]) {
  const arbol = arbolDeLamina(lamina);
  const titulos = hijos(arbol, NS_P, 'sp').filter(sp => /REPORTABILIDAD GG/.test(textoDe(sp)));
  const fotos = marcosDeFoto(lamina);
  // Orden de lectura: primero la fila superior de izquierda a derecha.
  const ordenados = titulos
    .map(sp => ({ sp, m: marco(sp) }))
    .sort((a, b) => (a.m.y - b.m.y) || (a.m.x - b.m.x));
  for (let k = 0; k < ordenados.length; k++) {
    const { sp, m } = ordenados[k];
    const dia = dias[inicioDia + k];
    if (!dia) continue;
    fijarUnico(sp, `REPORTABILIDAD GG ${dmy(dia.fecha)}`);
    // Sin foto en el Turno Noche, el recuadro queda con el marcador "SIN FOTO" de la plantilla.
    if (!dia.fotoGG) continue;
    // La foto de la reportabilidad es la que está justo debajo del título y se superpone con su columna.
    const pic = fotos
      .map(p => ({ p, mp: marco(p) }))
      .filter(({ mp }) => mp.y >= m.y && mp.x < m.x + m.w && mp.x + mp.w > m.x)
      .sort((a, b) => (a.mp.y - b.mp.y))[0]?.p;
    if (!pic) { avisos.push(`Reportabilidad GG del ${dmy(dia.fecha)}: no hay recuadro para la foto.`); continue; }
    const foto = await fotoDe(ctx, dia.fotoGG);
    if (foto) await ponerFoto(ctx, lamina, pic, foto);
    else avisos.push(`No se pudo preparar la foto de reportabilidad GG del ${dmy(dia.fecha)}.`);
  }
}

// ---- Difusiones (una lámina por día) ----------------------------------------------------
// Las fotos de difusión van en cascada a la izquierda y las de ART (actividades) a la derecha; el marco
// del centro ya no se usa. Cada recuadro es una copia del de la plantilla (con su leyenda y su animación
// de clic). Si hay más fotos que recuadros se agregan copias; si aun así no caben, se avisa.
// Todos los recuadros de la lámina tienen el mismo tamaño: el que necesita el lado con más fotos.

const EMU_POR_PULGADA = 914400;
const aEmu = (pulgadas: number) => Math.round(pulgadas * EMU_POR_PULGADA);
/** Un recuadro con el centro a la izquierda de esto (pulgadas) es de difusión; a la derecha de aquello, de ART. */
const CENTRO_IZQUIERDA_MAX = 4.4;
const CENTRO_DERECHA_MIN = 8.9;
/** Ningún recuadro se achica por debajo de esta escala; si con eso no caben, se avisa. */
const ESCALA_MINIMA = 0.55;

type LadoDifusion = 'izquierda' | 'derecha';
interface Paso { x: number; y: number }

interface Cascada {
  /** Desplazamiento de un recuadro al siguiente (pulgadas), medido en las láminas de referencia. */
  paso: Paso;
  /** Desplazamiento más apretado, si con el normal no caben todos. */
  pasoMinimo: Paso;
  /** Hasta dónde puede llegar la cascada (pulgadas). */
  limite: Paso;
}

const CASCADA: Record<LadoDifusion, Cascada> = {
  izquierda: { paso: { x: 0.2, y: 0.34 }, pasoMinimo: { x: 0.16, y: 0.3 }, limite: { x: 3.6, y: 7.15 } },
  derecha: { paso: { x: 0.27, y: 0.32 }, pasoMinimo: { x: 0.25, y: 0.28 }, limite: { x: 13.15, y: 7.15 } },
};

interface Rectangulo { x: number; y: number; w: number; h: number }

/** Recuadro de la plantilla que sirve de modelo para las copias de su lado (se guarda antes de quitar nada). */
interface Prototipo {
  grupo: Element;
  id: string;
  origen: { x: number; y: number };
  base: { w: number; h: number };
  /** Posición absoluta de cada forma del recuadro (leyenda y foto), en su mismo orden. */
  formas: Rectangulo[];
  /** Animación de clic del recuadro; cada recuadro nuevo recibe una copia. null si la plantilla no le ponía animación. */
  clic: Element | null;
}

interface Disposicion { cantidad: number; escala: number; paso: Paso }
interface FotoDeDifusion { lado: LadoDifusion; foto: FotoLista; titulo: string }

const formasDeGrupo = (grupo: Element) =>
  Array.from(grupo.children).filter(c => c.namespaceURI === NS_P && ['sp', 'pic'].includes(c.localName));
const xfrmDe = (forma: Element) => forma.getElementsByTagNameNS(NS_A, 'xfrm')[0];
/** Giro de la forma en grados módulo 180: 90 si está acostada (la barra azul con el nombre), 0 si no. */
const giroDe = (forma: Element) => (Number(xfrmDe(forma).getAttribute('rot') ?? 0) / 60000) % 180;

/** Posición absoluta (EMU) de una forma dentro de su grupo, con la escala del grupo. */
function rectanguloAbsoluto(grupo: Element, forma: Element): Rectangulo {
  const xf = xfrmDe(grupo);
  const valor = (nodo: string, atributo: string) =>
    Number(xf.getElementsByTagNameNS(NS_A, nodo)[0]?.getAttribute(atributo) ?? 0);
  const gx = valor('off', 'x'), gy = valor('off', 'y'), gw = valor('ext', 'cx'), gh = valor('ext', 'cy');
  const cx0 = valor('chOff', 'x'), cy0 = valor('chOff', 'y'), cw = valor('chExt', 'cx'), ch = valor('chExt', 'cy');
  const sx = cw > 0 ? gw / cw : 1;
  const sy = ch > 0 ? gh / ch : 1;
  const local = marco(forma);
  // Una forma acostada (la barra azul con el nombre) gira dentro del grupo: su largo sigue el alto del grupo y su grosor
  // el ancho. Se devuelve el recuadro sin girar, centrado donde queda la forma; a las demás formas no les cambia nada.
  const acostada = giroDe(forma) === 90;
  const w = acostada ? local.w * sy : local.w * sx;
  const h = acostada ? local.h * sx : local.h * sy;
  const centroX = gx + (local.x + local.w / 2 - cx0) * sx;
  const centroY = gy + (local.y + local.h / 2 - cy0) * sy;
  return { x: centroX - w / 2, y: centroY - h / 2, w, h };
}

/** Escribe una posición (EMU) en un xfrm. En un grupo también fija su sistema de coordenadas (sin escala). */
function fijarRectangulo(xf: Element, r: Rectangulo, esGrupo = false) {
  const fijar = (nodo: string, atributos: Record<string, number>) => {
    const el = xf.getElementsByTagNameNS(NS_A, nodo)[0];
    for (const [clave, valor] of Object.entries(atributos)) el.setAttribute(clave, String(Math.round(valor)));
  };
  fijar('off', { x: r.x, y: r.y });
  fijar('ext', { cx: r.w, cy: r.h });
  if (esGrupo) {
    fijar('chOff', { x: r.x, y: r.y });
    fijar('chExt', { cx: r.w, cy: r.h });
  }
}

const esClicPrincipal = (nodo: Element) => {
  const padre = nodo.parentElement;
  return padre?.localName === 'childTnLst' && padre.parentElement?.getAttribute('nodeType') === 'mainSeq';
};

/** Crea la animación de la lámina si no tenía (raíz y secuencia principal, como las de PowerPoint). */
function crearTiempos(doc: Document): Element {
  const raiz = doc.documentElement;
  const nuevo = (nombre: string, atributos: Record<string, string> = {}) => {
    const el = doc.createElementNS(NS_P, nombre);
    for (const [clave, valor] of Object.entries(atributos)) el.setAttribute(clave, valor);
    return el;
  };
  const condicion = (nombre: string, evento: string) => {
    const lista = nuevo(nombre);
    const cond = nuevo('p:cond', { evt: evento, delay: '0' });
    const destino = nuevo('p:tgtEl');
    destino.appendChild(nuevo('p:sldTgt'));
    cond.appendChild(destino);
    lista.appendChild(cond);
    return lista;
  };
  const tiempos = nuevo('p:timing');
  const tnLst = nuevo('p:tnLst');
  const par = nuevo('p:par');
  const raizCtn = nuevo('p:cTn', { id: '1', dur: 'indefinite', restart: 'never', nodeType: 'tmRoot' });
  const listaRaiz = nuevo('p:childTnLst');
  const seq = nuevo('p:seq', { concurrent: '1', nextAc: 'seek' });
  const principal = nuevo('p:cTn', { id: '2', dur: 'indefinite', nodeType: 'mainSeq' });
  principal.appendChild(nuevo('p:childTnLst'));
  seq.appendChild(principal);
  seq.appendChild(condicion('p:prevCondLst', 'onPrev'));
  seq.appendChild(condicion('p:nextCondLst', 'onNext'));
  listaRaiz.appendChild(seq);
  raizCtn.appendChild(listaRaiz);
  par.appendChild(raizCtn);
  tnLst.appendChild(par);
  tiempos.appendChild(tnLst);
  raiz.insertBefore(tiempos, hijos(raiz, NS_P, 'extLst')[0] ?? null);
  return tiempos;
}

/** Lista de clics de la secuencia principal. Con crear=true, crea la animación si la lámina no tenía. */
function listaDeClics(doc: Document, crear: boolean): Element | null {
  let tiempos: Element | undefined = descendientes(doc.documentElement, NS_P, 'timing')[0];
  if (!tiempos) {
    if (!crear) return null;
    tiempos = crearTiempos(doc);
  }
  const principal = descendientes(tiempos, NS_P, 'cTn').find(c => c.getAttribute('nodeType') === 'mainSeq');
  return principal ? (hijos(principal, NS_P, 'childTnLst')[0] ?? null) : null;
}

/** Clic de animación (hijo directo de la secuencia principal) que mueve la forma con ese id, o null. */
function clicDeForma(doc: Document, spid: string): Element | null {
  const tiempos: Element | undefined = descendientes(doc.documentElement, NS_P, 'timing')[0];
  if (!tiempos) return null;
  const destino = descendientes(tiempos, NS_P, 'spTgt').find(t => t.getAttribute('spid') === spid);
  let nodo: Element | null = destino ?? null;
  while (nodo && !esClicPrincipal(nodo)) nodo = nodo.parentElement;
  return nodo;
}

/** Copia de un clic de animación que apunta a otra forma. */
function clonarClic(clic: Element, spidOrigen: string, spidNuevo: string): Element {
  const copia = clic.cloneNode(true) as Element;
  for (const t of descendientes(copia, NS_P, 'spTgt')) {
    if (t.getAttribute('spid') === spidOrigen) t.setAttribute('spid', spidNuevo);
  }
  return copia;
}

/** Numera de nuevo los nodos de la animación (ids únicos y en orden). */
function numerarTiempos(doc: Document) {
  const tiempos: Element | undefined = descendientes(doc.documentElement, NS_P, 'timing')[0];
  if (!tiempos) return;
  let numero = 1;
  for (const nodo of descendientes(tiempos, NS_P, 'cTn')) nodo.setAttribute('id', String(numero++));
}

/** Ids nuevos para las formas de la lámina: mayor id existente + 1, + 2, ... */
function idsNuevos(arbol: Element): () => number {
  let mayor = 0;
  for (const c of descendientes(arbol, NS_P, 'cNvPr')) mayor = Math.max(mayor, Number(c.getAttribute('id')) || 0);
  let siguiente = mayor + 1;
  return () => siguiente++;
}

/** Recuadro de la plantilla que sirve de modelo para su lado: el de más arriba. Se guarda antes de quitar nada. */
function prototipoDe(doc: Document, grupo: Element): Prototipo {
  const m = marco(grupo);
  const id = descendientes(grupo, NS_P, 'cNvPr')[0]?.getAttribute('id') ?? '';
  const clic = clicDeForma(doc, id);
  return {
    grupo,
    id,
    origen: { x: m.x, y: m.y },
    base: { w: m.w, h: m.h },
    formas: formasDeGrupo(grupo).map(f => rectanguloAbsoluto(grupo, f)),
    clic: clic ? (clic.cloneNode(true) as Element) : null,
  };
}

/** Cuántos recuadros caben en la cascada del lado (el mayor número posible), con su escala y su paso. */
function disponerCascada(n: number, modelo: Prototipo, lado: LadoDifusion): Disposicion {
  const cfg = CASCADA[lado];
  for (let m = n; m >= 1; m--) {
    for (const paso of [cfg.paso, cfg.pasoMinimo]) {
      const escala = Math.min(
        1,
        (aEmu(cfg.limite.x) - modelo.origen.x - (m - 1) * aEmu(paso.x)) / modelo.base.w,
        (aEmu(cfg.limite.y) - modelo.origen.y - (m - 1) * aEmu(paso.y)) / modelo.base.h,
      );
      if (escala >= ESCALA_MINIMA) return { cantidad: m, escala, paso };
    }
  }
  return { cantidad: 0, escala: 1, paso: cfg.paso };
}

/** Copia de un recuadro de la plantilla, a escala y en la esquina dadas (el grupo queda sin escala propia). */
function construirRecuadro(modelo: Prototipo, esquina: { x: number; y: number }, escala: number, nuevoId: () => number) {
  const copia = modelo.grupo.cloneNode(true) as Element;
  for (const c of descendientes(copia, NS_P, 'cNvPr')) {
    c.setAttribute('id', String(nuevoId()));
    for (const extra of hijos(c, NS_A, 'extLst')) c.removeChild(extra);
  }
  const idGrupo = descendientes(copia, NS_P, 'cNvPr')[0]?.getAttribute('id') ?? '';
  formasDeGrupo(copia).forEach((forma, i) => {
    const r = modelo.formas[i];
    fijarRectangulo(xfrmDe(forma), {
      x: esquina.x + (r.x - modelo.origen.x) * escala,
      y: esquina.y + (r.y - modelo.origen.y) * escala,
      w: r.w * escala,
      h: r.h * escala,
    });
  });
  fijarRectangulo(xfrmDe(copia), { x: esquina.x, y: esquina.y, w: modelo.base.w * escala, h: modelo.base.h * escala }, true);
  const pic = hijos(copia, NS_P, 'pic')[0];
  return { grupo: copia, idGrupo, pic, leyenda: leyendaDe(pic) };
}

/** Quita los recuadros de la plantilla y pone una cascada por lado, con las fotos y su animación. */
async function colocarDifusiones(ctx: Contexto, lamina: Lamina, fotos: FotoDeDifusion[], fecha: string, avisos: string[]) {
  const doc = lamina.doc;
  const arbol = arbolDeLamina(lamina);
  const marcos = marcosDeFoto(lamina).map(pic => {
    const padre = pic.parentElement as Element;
    const grupo = padre.localName === 'grpSp' ? padre : null;
    return { pic, grupo, forma: grupo ?? pic };
  });
  const ladoDeMarco = (forma: Element): LadoDifusion | 'centro' => {
    const m = marco(forma);
    const centro = (m.x + m.w / 2) / EMU_POR_PULGADA;
    return centro < CENTRO_IZQUIERDA_MAX ? 'izquierda' : centro > CENTRO_DERECHA_MIN ? 'derecha' : 'centro';
  };

  // Modelos: el recuadro más alto de cada lado (antes de quitar nada).
  const modelos: Partial<Record<LadoDifusion, Prototipo>> = {};
  for (const lado of ['izquierda', 'derecha'] as const) {
    const primero = marcos
      .filter(m => m.grupo && ladoDeMarco(m.forma) === lado)
      .sort((a, b) => marco(a.forma).y - marco(b.forma).y)[0];
    if (primero?.grupo) modelos[lado] = prototipoDe(doc, primero.grupo);
  }

  // Tamaño común: el que necesita el lado con más fotos (así todos los recuadros de la lámina quedan iguales).
  const disposicion: Record<LadoDifusion, Disposicion> = {
    izquierda: { cantidad: 0, escala: 1, paso: CASCADA.izquierda.paso },
    derecha: { cantidad: 0, escala: 1, paso: CASCADA.derecha.paso },
  };
  for (const lado of ['izquierda', 'derecha'] as const) {
    const n = fotos.filter(f => f.lado === lado).length;
    const modelo = modelos[lado];
    if (n > 0 && modelo) disposicion[lado] = disponerCascada(n, modelo, lado);
  }
  const conRecuadros = (['izquierda', 'derecha'] as const).filter(l => disposicion[l].cantidad > 0);
  const escala = conRecuadros.length ? Math.min(...conRecuadros.map(l => disposicion[l].escala)) : 1;

  // Dónde van los recuadros nuevos: antes del primer elemento que no es marco (así el orden de capas no cambia).
  const marcosSet = new Set<Element>(marcos.map(m => m.forma));
  let antesDe: Element | null = null;
  if (marcos.length) {
    for (let el = marcos[0].forma.nextElementSibling; el; el = el.nextElementSibling) {
      if (!marcosSet.has(el)) { antesDe = el; break; }
    }
  }
  const finArbol = antesDe ?? hijos(arbol, NS_P, 'extLst')[0] ?? null;

  // Animaciones: los clics nuevos van donde estaban los de los marcos (antes del primer clic que no es de un marco).
  const idsMarcos = new Set(marcos.flatMap(m => descendientes(m.forma, NS_P, 'cNvPr').map(c => c.getAttribute('id') ?? '')));
  const clics = listaDeClics(doc, false);
  let clicAntes: Element | null = null;
  if (clics) {
    let vistoMarco = false;
    for (const clic of hijos(clics, NS_P, 'par')) {
      const esMarco = descendientes(clic, NS_P, 'spTgt').some(t => idsMarcos.has(t.getAttribute('spid') ?? ''));
      if (esMarco) vistoMarco = true;
      else if (vistoMarco) { clicAntes = clic; break; }
    }
  }

  // Se quitan todos los marcos (con su animación).
  for (const m of marcos) quitarImagen(lamina, m.pic);

  // Recuadros nuevos en el orden de la lista de difusiones; la animación sigue ese mismo orden.
  const nuevoId = idsNuevos(arbol);
  const cuenta: Record<LadoDifusion, number> = { izquierda: 0, derecha: 0 };
  const sinModelo: Record<LadoDifusion, number> = { izquierda: 0, derecha: 0 };
  const sinCaber: Record<LadoDifusion, number> = { izquierda: 0, derecha: 0 };
  for (const { lado, foto, titulo } of fotos) {
    const modelo = modelos[lado];
    const i = cuenta[lado]++;
    if (!modelo) { sinModelo[lado]++; continue; }
    if (i >= disposicion[lado].cantidad) { sinCaber[lado]++; continue; }
    const esquina = {
      x: modelo.origen.x + i * aEmu(disposicion[lado].paso.x),
      y: modelo.origen.y + i * aEmu(disposicion[lado].paso.y),
    };
    const recuadro = construirRecuadro(modelo, esquina, escala, nuevoId);
    arbol.insertBefore(recuadro.grupo, finArbol);
    if (modelo.clic) {
      const lista = listaDeClics(doc, true);
      const clic = clonarClic(modelo.clic, modelo.id, recuadro.idGrupo);
      lista?.insertBefore(clic, clicAntes && clicAntes.parentElement === lista ? clicAntes : null);
    }
    if (recuadro.leyenda) ajustarLeyenda(recuadro.leyenda, titulo);
    await ponerFoto(ctx, lamina, recuadro.pic, foto);
  }
  numerarTiempos(doc);

  for (const lado of ['izquierda', 'derecha'] as const) {
    const tipo = lado === 'izquierda' ? 'de difusión' : 'de actividades de trabajo';
    if (sinModelo[lado]) avisos.push(`Difusiones del ${dmy(fecha)}: la lámina no tiene recuadros ${tipo}; ${sinModelo[lado]} foto(s) no se incluyeron.`);
    if (sinCaber[lado]) avisos.push(`Difusiones del ${dmy(fecha)}: ${sinCaber[lado]} foto(s) ${tipo} no caben en la lámina y no se incluyeron.`);
  }
}

async function llenarDifusiones(ctx: Contexto, lamina: Lamina, dia: DiaPresentacion, avisos: string[]) {
  const arbol = arbolDeLamina(lamina);
  const titulo = hijos(arbol, NS_P, 'sp').find(sp => textoDe(sp).trim().startsWith('DIFUSIONES'))
    ?? descendientes(arbol, NS_P, 'sp').find(sp => textoDe(sp).trim().startsWith('DIFUSIONES'));
  if (titulo) {
    const parrafos = parrafosDe(txBodyDe(titulo));
    if (parrafos.length > 1) fijarTexto(parrafos[1], diaMesMayuscula(dia.fecha));
  }

  // Lista de difusiones (viñetas): empieza con el tamaño de la plantilla y se achica si no cabe.
  const cuerpo = descendientes(arbol, NS_P, 'sp')
    .filter(sp => parrafosDe(txBodyDe(sp)).some(tieneVinetas))
    .sort((a, b) => parrafosDe(txBodyDe(b)).length - parrafosDe(txBodyDe(a)).length)[0];
  if (cuerpo) {
    const modelo = primerParrafoCon(cuerpo, tieneVinetas)!;
    const items = dia.difusiones.length ? dia.difusiones.map(d => d.titulo.toUpperCase()) : ['SIN DIFUSIONES REGISTRADAS.'];
    const sz = tamanoQueCabe(tamanoEnPt(cuerpo), items, tamanosPosibles(tamanoDePlantilla(modelo), [1600, 1400, 1200, 1000, 900]));
    reemplazarParrafos(cuerpo, items.map(t => copiaDe(modelo, t, sz)));
  }

  // Fotos en el orden de la lista: las de ART (actividades) a la derecha; las de difusión, a la izquierda.
  const fotos: FotoDeDifusion[] = [];
  for (const difusion of dia.difusiones) {
    const lado: LadoDifusion = esDifusion(difusion.titulo) ? 'izquierda' : 'derecha';
    // Solo la portada: la primera foto de cada difusión o actividad.
    const [portada] = difusion.fotos;
    if (!portada) continue;
    const foto = await fotoDe(ctx, portada);
    if (foto) fotos.push({ lado, foto, titulo: difusion.titulo.toUpperCase() });
    else avisos.push(`No se pudo preparar la foto de "${difusion.titulo}" (${dmy(dia.fecha)}).`);
  }
  await colocarDifusiones(ctx, lamina, fotos, dia.fecha, avisos);
}

// ---- Fechas de corte y de periodo en láminas fijas ---------------------------------------
// Solo cambian las fechas de encabezado: el periodo del turno, "Hasta la fecha", la fecha de corte
// de la tabla de GG, el sello de la lámina de avances y los días del gráfico semanal.
// Las cifras de las tablas son datos: no se tocan. Las fechas planificadas de mantenciones (lámina 8) sí se corren a la semana del turno.

/** Cambia solo el fragmento (run) que cumple el patrón, conservando su formato; los demás fragmentos del párrafo no se tocan. */
function fijarFragmento(p: Element, patron: RegExp, texto: string): boolean {
  const fragmento = hijos(p, NS_A, 'r').find(r => patron.test(textoDe(r)));
  const t = fragmento ? descendientes(fragmento, NS_A, 't')[0] : undefined;
  if (t) t.textContent = textoSeguro(texto);
  return Boolean(t);
}

/** Semana de la plantilla en que están fechadas las mantenciones (lámina 8: del 26 AGO al 01 SEP 2026). */
const PLAN_PLANTILLA_INICIO = '2026-08-26';

/**
 * Corre las fechas planificadas de la tabla de mantenciones a la semana del turno, conservando el día relativo
 * de cada una (la plantilla trae el plan de una semana completa). Una fecha anterior al inicio de ese plan
 * es del mes siguiente (ej: "01-08" en un plan que termina el 01 SEP).
 */
function fijarFechasPlanificadas(lamina: Lamina, inicio: string) {
  const tabla = descendientes(arbolDeLamina(lamina), NS_A, 'tbl')[0];
  const filas = tabla ? hijos(tabla, NS_A, 'tr') : [];
  const columna = filas.length
    ? hijos(filas[0], NS_A, 'tc').findIndex(c => textoDe(c).toUpperCase().includes('FECHA PLANIFICADA'))
    : -1;
  if (columna < 0) return;
  for (const fila of filas.slice(1)) {
    const celda = hijos(fila, NS_A, 'tc')[columna];
    const p = celda ? descendientes(celda, NS_A, 'p')[0] : undefined;
    const coincide = /^(\d{2})-(\d{2})-(\d{4})$/.exec(celda ? textoDe(celda).trim() : '');
    if (!p || !coincide) continue;
    const [, d, m, y] = coincide;
    let fecha = `${y}-${m}-${d}`;
    if (fecha < PLAN_PLANTILLA_INICIO) {
      // Date.UTC recibe el mes en base 0: pasar el mes tal cual lo deja en el mes siguiente.
      fecha = new Date(Date.UTC(Number(y), Number(m), Number(d))).toISOString().slice(0, 10);
    }
    const dias = Math.round((Date.parse(fecha) - Date.parse(PLAN_PLANTILLA_INICIO)) / 86400000);
    fijarTexto(p, dmyGuion(sumarDias(inicio, dias)));
  }
}

/** Color del texto de un formato (rPr): reemplaza el relleno de la letra por un color sólido. */
function colorDeTexto(rPr: Element, hex: string) {
  const relleno = hijos(rPr, NS_A, 'solidFill')[0];
  if (!relleno) return;
  for (const hijo of Array.from(relleno.children)) relleno.removeChild(hijo);
  const color = rPr.ownerDocument.createElementNS(NS_A, 'a:srgbClr');
  color.setAttribute('val', hex);
  relleno.appendChild(color);
}

/** Lámina 8: ESTADO pasa a REALIZADO (verde) cuando un Informe Diario del periodo registra la mantención del sitio. */
function fijarEstadosMantenciones(lamina: Lamina, mantenciones: string[]) {
  const tabla = descendientes(arbolDeLamina(lamina), NS_A, 'tbl')[0];
  const filas = tabla ? hijos(tabla, NS_A, 'tr') : [];
  if (filas.length < 2) return;
  const titulos = hijos(filas[0], NS_A, 'tc').map(c => textoDe(c).trim().toUpperCase());
  const colSitio = titulos.indexOf('SITIO');
  const colEstado = titulos.indexOf('ESTADO');
  if (colSitio < 0 || colEstado < 0) return;
  for (const fila of filas.slice(1)) {
    const celdas = hijos(fila, NS_A, 'tc');
    const sitio = celdas[colSitio] ? textoDe(celdas[colSitio]).trim() : '';
    const p = celdas[colEstado] ? descendientes(celdas[colEstado], NS_A, 'p')[0] : undefined;
    if (!p || !sitio) continue;
    const realizado = mantenciones.some(t => mencionaSitio(t, sitio));
    fijarTexto(p, realizado ? 'REALIZADO' : 'NO REALIZADO');
    if (realizado) for (const rPr of descendientes(p, NS_A, 'rPr')) colorDeTexto(rPr, '92D050');
  }
}

async function fijarFechasDeCorte(ctx: Contexto, datos: DatosPresentacion) {
  const fin = datos.fin;
  const textosDe = (lamina: Lamina) => descendientes(arbolDeLamina(lamina), NS_P, 'sp');

  // Lámina 8: "Detalle de Mantenimientos" con el periodo entre paréntesis y las fechas planificadas de la tabla.
  const laminaMantenciones = await abrirLamina(ctx, 8);
  fijarFechasPlanificadas(laminaMantenciones, datos.inicio);
  fijarEstadosMantenciones(laminaMantenciones, datos.mantenciones);
  for (const sp of textosDe(laminaMantenciones)) {
    const tx = txBodyDe(sp);
    if (!tx) continue;
    for (const p of parrafosDe(tx)) {
      const patronPeriodo = /\(\d{1,2} [A-Z]{3} \d{4} AL \d{1,2} [A-Z]{3} \d{4}\)/;
      if (patronPeriodo.test(textoDe(p))) {
        const texto = `(${fechaCortaMayuscula(datos.inicio)} AL ${fechaCortaMayuscula(fin)})`;
        if (!fijarFragmento(p, patronPeriodo, texto)) fijarTexto(p, texto);
      }
    }
  }

  // Láminas 20 y 21: "Hasta la fecha dd-mm-aaaa".
  for (const numero of [20, 21]) {
    for (const sp of textosDe(await abrirLamina(ctx, numero))) {
      const tx = txBodyDe(sp);
      if (!tx) continue;
      for (const p of parrafosDe(tx)) {
        if (/^Hasta la fecha \d{2}-\d{2}-\d{4}$/.test(textoDe(p).trim())) fijarTexto(p, `Hasta la fecha ${dmyGuion(fin)}`);
      }
    }
  }

  // Lámina 21: fecha de corte del encabezado de la tabla de GG ("08-06-2026").
  const tabla = descendientes(arbolDeLamina(await abrirLamina(ctx, 21)), NS_A, 'tbl')[0];
  const encabezado = tabla ? hijos(tabla, NS_A, 'tr')[0] : undefined;
  for (const celda of encabezado ? hijos(encabezado, NS_A, 'tc') : []) {
    if (/^\d{2}-\d{2}-\d{4}$/.test(textoDe(celda).replace(/\u200B/g, '').trim())) {
      const p = descendientes(celda, NS_A, 'p')[0];
      if (p) fijarTexto(p, dmyGuion(fin));
    }
  }

  // Lámina 23: sello de fecha "08/10/2025".
  for (const sp of textosDe(await abrirLamina(ctx, 23))) {
    const tx = txBodyDe(sp);
    if (!tx) continue;
    for (const p of parrafosDe(tx)) {
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(textoDe(p).trim())) fijarTexto(p, dmy(fin));
    }
  }

  // Lámina 24: gráfico semanal. Sus categorías son fechas: se ponen los días del periodo, en orden.
  const grafico = await abrirLamina(ctx, 24);
  const relGrafico = Array.from(grafico.rels.documentElement.children)
    .find(r => (r.getAttribute('Type') ?? '').endsWith('/chart'));
  const nombreGrafico = (relGrafico?.getAttribute('Target') ?? '').split('/').pop();
  const rutaGrafico = nombreGrafico ? `ppt/charts/${nombreGrafico}` : '';
  const archivoGrafico = rutaGrafico ? ctx.zip.file(rutaGrafico) : null;
  if (archivoGrafico) {
    const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
    const doc = leer(await archivoGrafico.async('string'));
    for (const cat of descendientes(doc.documentElement, NS_C, 'cat')) {
      const numerico = descendientes(cat, NS_C, 'numCache').length > 0;
      for (const pt of descendientes(cat, NS_C, 'pt')) {
        const v = descendientes(pt, NS_C, 'v')[0];
        if (!v) continue;
        const dia = sumarDias(datos.inicio, Number(pt.getAttribute('idx')));
        v.textContent = numerico ? String(serieExcel(dia)) : dmy(dia);
      }
    }
    ctx.zip.file(rutaGrafico, escribir(doc), { createFolders: false });
  }
}

// ---------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------

/** Genera la presentación del turno. Devuelve el archivo .pptx listo para descargar y los avisos. */
export async function generarPresentacionTurno(datos: DatosPresentacion): Promise<ResultadoPresentacion> {
  const respuesta = await fetch(plantillaUrl);
  if (!respuesta.ok) throw new Error('No se pudo cargar la plantilla de la presentación.');
  const zip = await JSZip.loadAsync(await respuesta.arrayBuffer());
  const ctx: Contexto = { zip, laminas: new Map(), fotos: new Map() };
  const avisos: string[] = [];

  llenarPortada(await abrirLamina(ctx, LAMINA_PORTADA), datos);
  llenarResumenDia(await abrirLamina(ctx, LAMINA_RESUMEN_DIA), datos.dias);
  llenarResumenNoche(await abrirLamina(ctx, LAMINA_RESUMEN_NOCHE), datos);

  let inicioGG = 0;
  for (const numero of LAMINAS_GG) {
    const lamina = await abrirLamina(ctx, numero);
    await llenarGG(ctx, lamina, datos.dias, inicioGG, avisos);
    inicioGG += hijos(arbolDeLamina(lamina), NS_P, 'sp').filter(sp => /REPORTABILIDAD GG/.test(textoDe(sp))).length;
  }

  for (let i = 0; i < LAMINAS_DIFUSIONES.length; i++) {
    const dia = datos.dias[i];
    if (!dia) break;
    await llenarDifusiones(ctx, await abrirLamina(ctx, LAMINAS_DIFUSIONES[i]), dia, avisos);
  }

  await fijarFechasDeCorte(ctx, datos);

  for (const lamina of ctx.laminas.values()) {
    zip.file(`ppt/slides/slide${lamina.numero}.xml`, escribir(lamina.doc), { createFolders: false });
    zip.file(lamina.relsPath, escribir(lamina.rels), { createFolders: false });
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME_PPTX, compression: 'DEFLATE' });
  return { blob, avisos };
}
