// Genera la presentación del turno (.pptx) a partir de la plantilla de DSAL: se conserva el diseño
// (láminas, colores, tipografías, marcos de fotos) y solo se reemplazan textos, fotos y leyendas.
import JSZip from 'jszip';
import plantillaUrl from '../../assets/plantillas/presentacion_turno.pptx?url';
import { comprimirDataUrl } from '../../lib/fotos';
import type { DatosPresentacion, DiaPresentacion } from './modelo';

const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PR = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MIME_PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

const LAMINA_PORTADA = 1;
const LAMINA_RESUMEN_DIA = 3;
const LAMINA_RESUMEN_NOCHE = 4;
const LAMINAS_GG = [10, 11];
const LAMINAS_DIFUSIONES = [13, 14, 15, 16, 17, 18, 19];
const MESES_MAYUSCULA = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const FOTO_LADO = 1400;
const FOTO_CALIDAD = 0.85;

/** "2026-08-26" -> "26/08/2026" */
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
/** "2026-08-26" -> "26 AGOSTO" */
const diaMesMayuscula = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${String(d).padStart(2, '0')} ${MESES_MAYUSCULA[m - 1]}`; };

// ---------------------------------------------------------------------------------------
// Utilidades de XML (DOM del navegador)
// ---------------------------------------------------------------------------------------

const leer = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml');
const escribir = (doc: Document) => {
  const xml = new XMLSerializer().serializeToString(doc);
  return xml.startsWith('<?xml') ? xml : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
};

const hijos = (el: Element, ns: string, local: string) =>
  Array.from(el.children).filter(c => c.localName === local && c.namespaceURI === ns);
const descendientes = (el: Element, ns: string, local: string) => Array.from(el.getElementsByTagNameNS(ns, local));
const textoDe = (el: Element) => descendientes(el, NS_A, 't').map(t => t.textContent ?? '').join('');
const parrafosDe = (el: Element) => hijos(el, NS_A, 'p');
const txBodyDe = (sp: Element) => hijos(sp, NS_P, 'txBody')[0] ?? sp.getElementsByTagNameNS(NS_P, 'txBody')[0];
const tieneVinetas = (p: Element) => p.getElementsByTagNameNS(NS_A, 'buChar').length > 0;
const tieneNumeracion = (p: Element) => p.getElementsByTagNameNS(NS_A, 'buAutoNum').length > 0;
const tieneTexto = (p: Element) => descendientes(p, NS_A, 'r').length > 0;

/** Posición y tamaño de una forma de primer nivel (EMU). */
const marco = (forma: Element) => {
  const xfrm = forma.getElementsByTagNameNS(NS_A, 'xfrm')[0];
  const off = xfrm?.getElementsByTagNameNS(NS_A, 'off')[0];
  const ext = xfrm?.getElementsByTagNameNS(NS_A, 'ext')[0];
  return {
    x: Number(off?.getAttribute('x') ?? 0), y: Number(off?.getAttribute('y') ?? 0),
    w: Number(ext?.getAttribute('cx') ?? 0), h: Number(ext?.getAttribute('cy') ?? 0),
  };
};

/** Cambia el texto de un párrafo conservando el formato del primer fragmento. */
function fijarTexto(p: Element, texto: string) {
  const runs = hijos(p, NS_A, 'r');
  if (!runs.length) {
    const r = p.ownerDocument.createElementNS(NS_A, 'a:r');
    const t = p.ownerDocument.createElementNS(NS_A, 'a:t');
    r.appendChild(t);
    p.appendChild(r);
    runs.push(r);
  }
  for (const hijo of Array.from(p.children)) {
    if (hijo.localName !== 'pPr' && hijo.localName !== 'endParaRPr' && hijo !== runs[0]) p.removeChild(hijo);
  }
  const t = runs[0].getElementsByTagNameNS(NS_A, 't')[0];
  t.textContent = texto;
}

const fijarTamano = (p: Element, sz: number) => {
  for (const r of descendientes(p, NS_A, 'rPr')) r.setAttribute('sz', String(sz));
};

/** Copia de un párrafo de ejemplo con otro texto (y tamaño opcional). */
function copiaDe(modelo: Element, texto: string, sz?: number) {
  const copia = modelo.cloneNode(true) as Element;
  fijarTexto(copia, texto);
  if (sz) fijarTamano(copia, sz);
  return copia;
}

/** Reemplaza todos los párrafos de una forma de texto por los dados. */
function reemplazarParrafos(sp: Element, nuevos: Element[]) {
  const cuerpo = txBodyDe(sp);
  for (const p of parrafosDe(cuerpo)) cuerpo.removeChild(p);
  for (const p of nuevos) cuerpo.appendChild(p);
}

/** Deja la forma con un único párrafo de texto (conserva su formato). */
function fijarUnico(sp: Element, texto: string) {
  const parrafos = parrafosDe(txBodyDe(sp));
  const base = parrafos.find(tieneTexto) ?? parrafos[0];
  reemplazarParrafos(sp, [copiaDe(base, texto)]);
}

const primerParrafoCon = (sp: Element, pred: (p: Element) => boolean) =>
  parrafosDe(txBodyDe(sp)).find(p => tieneTexto(p) && pred(p));

/** Tamaño real (pt) de una forma de la lámina, con la escala de su grupo si la tiene. */
function tamanoEnPt(forma: Element): { ancho: number; alto: number } {
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

/** Mayor tamaño de letra (centésimas de punto) con el que los textos caben en la caja. Cálculo aproximado. */
function tamanoQueCabe(caja: { ancho: number; alto: number }, textos: string[], tamanos: number[]): number {
  for (const sz of tamanos) {
    const pt = sz / 100;
    const porLinea = Math.max(10, (caja.ancho - 20) / (pt * 0.66));
    const lineas = textos.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / porLinea)), 0);
    if (lineas * pt * 1.2 + textos.length * pt * 0.3 <= caja.alto - 8) return sz;
  }
  return tamanos[tamanos.length - 1];
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
  ctx.zip.file(`ppt/media/${nombre}`, foto.bytes);
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

/** Quita una imagen sin foto. Si es la única imagen de su grupo, quita el grupo completo (con su leyenda). */
function quitarImagen(pic: Element) {
  const padre = pic.parentElement!;
  const grupo = padre.localName === 'grpSp' ? padre : null;
  if (grupo) {
    const otrasImagenes = descendientes(grupo, NS_P, 'pic').filter(p => p !== pic);
    if (otrasImagenes.length === 0) {
      grupo.parentElement!.removeChild(grupo);
      return;
    }
  }
  padre.removeChild(pic);
}

/** Leyenda de una imagen: el texto de su mismo grupo (si lo tiene). */
const leyendaDe = (pic: Element): Element | null => {
  const padre = pic.parentElement!;
  if (padre.localName !== 'grpSp') return null;
  return hijos(padre, NS_P, 'sp').find(sp => textoDe(sp).trim() !== '') ?? null;
};

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
    // Cada caja tiene su tamaño: el texto se achica hasta que quepa.
    const sz = tamanoQueCabe(tamanoEnPt(caja.cuerpo), items, [900, 800, 700, 650, 600, 550]);
    reemplazarParrafos(caja.cuerpo, items.map(t => copiaDe(modelo, t, sz)));
  });
}

// ---- Resumen de Turno Noche + observaciones --------------------------------------------

function llenarResumenNoche(lamina: Lamina, datos: DatosPresentacion) {
  const formas = descendientes(arbolDeLamina(lamina), NS_P, 'sp');
  const rango = formas.find(sp => /\d{2}\/\d{2}\/\d{4}\s*al\s*\d{2}\/\d{2}\/\d{4}/.test(textoDe(sp)));
  if (rango) {
    const cabecera = parrafosDe(txBodyDe(rango))[0];
    const modelo = primerParrafoCon(rango, tieneVinetas);
    const items = datos.resumenNoche.length ? datos.resumenNoche.map(t => t.toUpperCase()) : ['SIN ACTIVIDADES REGISTRADAS EN TURNO NOCHE.'];
    const caja = tamanoEnPt(rango);
    // Se descuenta la línea de fechas (encabezado) para calcular el tamaño de las actividades.
    const sz = tamanoQueCabe({ ancho: caja.ancho, alto: caja.alto - 36 }, items, [1000, 900, 800, 700, 650]);
    const nuevos = [copiaDe(cabecera, `${dmy(datos.inicio)} al ${dmy(datos.fin)}`)];
    if (modelo) nuevos.push(...items.map(t => copiaDe(modelo, t, sz)));
    reemplazarParrafos(rango, nuevos);
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
    const sz = tamanoQueCabe({ ancho: caja.ancho, alto: caja.alto - 18 }, items, [1050, 900, 800, 700]);
    reemplazarParrafos(obs, [...cabecera, ...items.map(t => copiaDe(modelo, t, sz))]);
  }
}

// ---- Reportabilidad GG (foto por día) ---------------------------------------------------

async function llenarGG(ctx: Contexto, lamina: Lamina, dias: DiaPresentacion[], inicioDia: number) {
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
    // La foto de la reportabilidad es la que está justo debajo del título y se superpone con su columna.
    const pic = fotos
      .map(p => ({ p, mp: marco(p) }))
      .filter(({ mp }) => mp.y >= m.y && mp.x < m.x + m.w && mp.x + mp.w > m.x)
      .sort((a, b) => (a.mp.y - b.mp.y))[0]?.p;
    if (!pic || !dia.fotoGG) continue;
    const foto = await fotoDe(ctx, dia.fotoGG);
    if (foto) await ponerFoto(ctx, lamina, pic, foto);
  }
}

// ---- Difusiones (una lámina por día) ----------------------------------------------------

async function llenarDifusiones(ctx: Contexto, lamina: Lamina, dia: DiaPresentacion) {
  const arbol = arbolDeLamina(lamina);
  const titulo = hijos(arbol, NS_P, 'sp').find(sp => textoDe(sp).trim().startsWith('DIFUSIONES'))
    ?? descendientes(arbol, NS_P, 'sp').find(sp => textoDe(sp).trim().startsWith('DIFUSIONES'));
  if (titulo) {
    const parrafos = parrafosDe(txBodyDe(titulo));
    if (parrafos.length > 1) fijarTexto(parrafos[1], diaMesMayuscula(dia.fecha));
  }

  // Lista de difusiones (viñetas).
  const cuerpo = descendientes(arbol, NS_P, 'sp')
    .filter(sp => parrafosDe(txBodyDe(sp)).some(tieneVinetas))
    .sort((a, b) => parrafosDe(txBodyDe(b)).length - parrafosDe(txBodyDe(a)).length)[0];
  if (cuerpo) {
    const modelo = primerParrafoCon(cuerpo, tieneVinetas)!;
    const items = dia.difusiones.length ? dia.difusiones.map(d => d.titulo.toUpperCase()) : ['SIN DIFUSIONES REGISTRADAS.'];
    const sz = items.length <= 4 ? 1600 : items.length <= 6 ? 1400 : 1200;
    reemplazarParrafos(cuerpo, items.map(t => copiaDe(modelo, t, sz)));
  }

  // Fotos: en orden de aparición en la lámina, cada una con el título de su actividad.
  const pendientes = dia.difusiones.flatMap(d => d.fotos.map(src => ({ src, titulo: d.titulo })));
  const imagenes = marcosDeFoto(lamina);
  const sobrantes: Element[] = [];
  for (let i = 0; i < imagenes.length; i++) {
    const pic = imagenes[i];
    const entrada = pendientes[i];
    if (!entrada) { sobrantes.push(pic); continue; }
    const leyenda = leyendaDe(pic);
    if (leyenda) fijarUnico(leyenda, entrada.titulo.toUpperCase());
    const foto = await fotoDe(ctx, entrada.src);
    if (foto) await ponerFoto(ctx, lamina, pic, foto);
    else sobrantes.push(pic);
  }
  for (const pic of sobrantes) {
    if (pic.parentNode) quitarImagen(pic);
  }
}

// ---------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------

/** Genera la presentación del turno. Devuelve el archivo .pptx listo para descargar. */
export async function generarPresentacionTurno(datos: DatosPresentacion): Promise<Blob> {
  const respuesta = await fetch(plantillaUrl);
  if (!respuesta.ok) throw new Error('No se pudo cargar la plantilla de la presentación.');
  const zip = await JSZip.loadAsync(await respuesta.arrayBuffer());
  const ctx: Contexto = { zip, laminas: new Map(), fotos: new Map() };

  llenarPortada(await abrirLamina(ctx, LAMINA_PORTADA), datos);
  llenarResumenDia(await abrirLamina(ctx, LAMINA_RESUMEN_DIA), datos.dias);
  llenarResumenNoche(await abrirLamina(ctx, LAMINA_RESUMEN_NOCHE), datos);

  let inicioGG = 0;
  for (const numero of LAMINAS_GG) {
    const lamina = await abrirLamina(ctx, numero);
    await llenarGG(ctx, lamina, datos.dias, inicioGG);
    inicioGG += hijos(arbolDeLamina(lamina), NS_P, 'sp').filter(sp => /REPORTABILIDAD GG/.test(textoDe(sp))).length;
  }

  for (let i = 0; i < LAMINAS_DIFUSIONES.length; i++) {
    const dia = datos.dias[i];
    if (!dia) break;
    await llenarDifusiones(ctx, await abrirLamina(ctx, LAMINAS_DIFUSIONES[i]), dia);
  }

  for (const lamina of ctx.laminas.values()) {
    zip.file(`ppt/slides/slide${lamina.numero}.xml`, escribir(lamina.doc));
    zip.file(lamina.relsPath, escribir(lamina.rels));
  }
  return zip.generateAsync({ type: 'blob', mimeType: MIME_PPTX, compression: 'DEFLATE' });
}
