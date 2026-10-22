// Genera la presentación de fin de semana (.pptx) sobre la plantilla de DSAL del fin de semana: se conservan
// las láminas fijas (portadas, fotos, cierre) y se reemplazan los textos, la tabla de actividades, el gráfico,
// la tabla de mantenimiento y las cascadas, que se rearman como formas para admitir cualquier cantidad de ítems.
import JSZip from 'jszip';
import plantillaUrl from '../../assets/plantillas/presentacion_fds.pptx?url';
import type { DatosFds } from './modeloFds';
import {
  MESES_MAYUSCULA, MIME_PPTX, NS_A, NS_P, NS_R,
  copiaDe, descendientes, escribir, fijarTexto, fijarUnico, hijos, leer, parrafosDe,
  reemplazarParrafos, tamanoDePlantilla, tamanosPosibles, tieneVinetas, textoDe, textoSeguro, txBodyDe,
  type ResultadoPresentacion,
} from './pptx';

const LAMINA = {
  portada: 1, resumenGeneral: 3, actividades: 5, reportabilidad: 8, om: 9,
  cascadaActividades: 11, difusiones: 13, observaciones: 15, cpe: 17, conclusiones: 19,
} as const;

const EMU = 914400;
const aEmu = (pulgadas: number) => Math.round(pulgadas * EMU);
const DIAS_SEMANA = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
const DIAS_SEMANA_SIN_ACENTO = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const MESES_ABREV_MINUSCULA = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const fechaUtc = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const partesIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d }; };

/** "2026-10-23" -> "VIERNES" */
const nombreDia = (iso: string) => DIAS_SEMANA[fechaUtc(iso).getUTCDay()];
/** "2026-10-23" -> "23 DE OCTUBRE" */
const diaDeMes = (iso: string) => `${partesIso(iso).d} DE ${MESES_MAYUSCULA[partesIso(iso).m - 1]}`;
/** Periodo de la portada: "VIERNES 23 DE OCTUBRE AL DOMINGO 25 DE OCTUBRE DE 2026". */
const periodoDe = (inicio: string, fin: string) =>
  `${nombreDia(inicio)} ${diaDeMes(inicio)} AL ${nombreDia(fin)} ${diaDeMes(fin)} DE ${partesIso(fin).y}`;
/** Encabezado de día de la tabla: "VIERNES 23/10". */
const diaTabla = (iso: string) => { const { m, d } = partesIso(iso); return `${nombreDia(iso)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`; };
/** Categoría del gráfico: "VIERNES 23" (sin tilde, como en la plantilla). */
const diaGrafico = (iso: string) => `${DIAS_SEMANA_SIN_ACENTO[fechaUtc(iso).getUTCDay()]} ${partesIso(iso).d}`;
/** Fecha corta en minúscula para el mantenimiento: "23-sep-26". */
const fechaOm = (iso: string) => { const { y, m, d } = partesIso(iso); return `${String(d).padStart(2, '0')}-${MESES_ABREV_MINUSCULA[m - 1]}-${String(y).slice(2)}`; };
/** Suma días a una fecha ISO. */
const sumarDiasIso = (iso: string, n: number) => new Date(fechaUtc(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
/** "dd-mm-aaaa" para el encabezado "Horas Registradas al DD MM -AAAA". */
const dmSinGuion = (iso: string) => { const { y, m, d } = partesIso(iso); return `${String(d).padStart(2, '0')} ${String(m).padStart(2, '0')} -${y}`; };

// ---------------------------------------------------------------------------------------
// Utilidades de forma (no están en el generador de turno)
// ---------------------------------------------------------------------------------------

const nombreDe = (el: Element) => el.getElementsByTagNameNS(NS_P, 'cNvPr')[0]?.getAttribute('name') ?? '';
const idMayor = (arbol: Element) => Math.max(0, ...descendientes(arbol, NS_P, 'cNvPr').map(c => Number(c.getAttribute('id')) || 0));
/** Inserta antes del extLst de la lista de formas (si lo hay), para que el XML siga siendo válido. */
const agregarForma = (arbol: Element, forma: Element) => arbol.insertBefore(forma, hijos(arbol, NS_P, 'extLst')[0] ?? null);
const fijarId = (forma: Element, id: number) => {
  for (const c of descendientes(forma, NS_P, 'cNvPr')) c.setAttribute('id', String(id));
};
/** Transformación de una forma (a:xfrm en formas, p:xfrm en marcos como tablas y gráficos). */
const xfrmDe = (el: Element) => el.getElementsByTagNameNS(NS_A, 'xfrm')[0] ?? el.getElementsByTagNameNS(NS_P, 'xfrm')[0];
/** Posición y tamaño (EMU) de una forma o de un marco. */
const medidasDe = (el: Element) => {
  const xf = xfrmDe(el);
  const off = xf.getElementsByTagNameNS(NS_A, 'off')[0];
  const ext = xf.getElementsByTagNameNS(NS_A, 'ext')[0];
  return { x: Number(off.getAttribute('x')), y: Number(off.getAttribute('y')), w: Number(ext.getAttribute('cx')), h: Number(ext.getAttribute('cy')) };
};
/** Posición y tamaño (pulgadas) de una forma o de un marco. */
const fijarXfrm = (forma: Element, x: number, y: number, w: number, h: number) => {
  const xf = xfrmDe(forma);
  const off = xf.getElementsByTagNameNS(NS_A, 'off')[0];
  const ext = xf.getElementsByTagNameNS(NS_A, 'ext')[0];
  off.setAttribute('x', String(aEmu(x)));
  off.setAttribute('y', String(aEmu(y)));
  ext.setAttribute('cx', String(aEmu(w)));
  ext.setAttribute('cy', String(aEmu(h)));
};
/** Cambia el texto de un fragmento (run) conservando su formato. */
const fijarFragmento = (fragmento: Element, texto: string) => {
  let t = descendientes(fragmento, NS_A, 't')[0];
  if (!t) { t = fragmento.ownerDocument.createElementNS(NS_A, 'a:t'); fragmento.appendChild(t); }
  t.textContent = textoSeguro(texto);
};
const fragmentosDe = (p: Element) => hijos(p, NS_A, 'r');

/** Tamaño de todo el texto de un párrafo. Algunas láminas de la plantilla tienen fragmentos sin formato propio (sin
 *  a:rPr): fijarTamano no podía cambiarles el tamaño y se veían más grandes. Esos reciben el formato del final del párrafo. */
function fijarTamanoTodo(p: Element, sz: number) {
  const fin = hijos(p, NS_A, 'endParaRPr')[0];
  for (const r of descendientes(p, NS_A, 'r')) {
    if (hijos(r, NS_A, 'rPr').length) continue;
    const rPr = p.ownerDocument.createElementNS(NS_A, 'a:rPr');
    if (fin) {
      for (const a of Array.from(fin.attributes)) rPr.setAttribute(a.name, a.value);
      for (const h of Array.from(fin.children)) rPr.appendChild(h.cloneNode(true));
    }
    r.insertBefore(rPr, r.firstChild);
  }
  for (const el of [...descendientes(p, NS_A, 'rPr'), ...descendientes(p, NS_A, 'endParaRPr')]) el.setAttribute('sz', String(sz));
}

/** Copia de un párrafo de ejemplo con otro texto y tamaño (ver fijarTamanoTodo). */
const copiaTexto = (modelo: Element, texto: string, sz: number) => {
  const copia = copiaDe(modelo, texto);
  fijarTamanoTodo(copia, sz);
  return copia;
};

// ---- Medida del texto: Arial en negrita (la fuente de la plantilla), medida con el navegador -----

let lienzoMedida: CanvasRenderingContext2D | null | undefined;
/** Ancho (puntos) de un texto en Arial negrita al tamaño dado (puntos). Sin canvas, aproxima 0,6 em por carácter. */
function anchoEnPuntos(texto: string, pt: number): number {
  if (lienzoMedida === undefined) {
    try { lienzoMedida = document.createElement('canvas').getContext('2d'); } catch { lienzoMedida = null; }
  }
  if (!lienzoMedida) return texto.length * pt * 0.6;
  lienzoMedida.font = 'bold 100px Arial';
  return (lienzoMedida.measureText(texto).width * pt) / 100;
}

/** Líneas que ocupa un texto en un ancho (puntos), cortando entre palabras. */
function lineasDe(texto: string, ancho: number, pt: number): number {
  const util = Math.max(1, ancho);
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return 1;
  let lineas = 1;
  let actual = '';
  for (const palabra of palabras) {
    const candidata = actual ? `${actual} ${palabra}` : palabra;
    if (actual && anchoEnPuntos(candidata, pt) > util) {
      lineas++;
      actual = palabra;
    } else {
      actual = candidata;
    }
    // Una palabra más ancha que la caja ocupa varias líneas (códigos o direcciones muy largos).
    const extra = Math.ceil(anchoEnPuntos(palabra, pt) / util) - 1;
    if (extra > 0) lineas += extra;
  }
  return lineas;
}

interface Lamina { numero: number; doc: Document; rels: Document; relsPath: string }
interface Contexto { zip: JSZip; laminas: Map<number, Lamina> }

async function abrirLamina(ctx: Contexto, numero: number): Promise<Lamina> {
  const existente = ctx.laminas.get(numero);
  if (existente) return existente;
  const ruta = `ppt/slides/slide${numero}.xml`;
  const relsPath = `ppt/slides/_rels/slide${numero}.xml.rels`;
  const xml = await ctx.zip.file(ruta)!.async('string');
  const relsXml = await ctx.zip.file(relsPath)!.async('string');
  const lamina: Lamina = { numero, doc: leer(xml), rels: leer(relsXml), relsPath };
  ctx.laminas.set(numero, lamina);
  return lamina;
}

const arbolDe = (lamina: Lamina) => lamina.doc.getElementsByTagNameNS(NS_P, 'spTree')[0];

// ---- Portada (lámina 1) -----------------------------------------------------------------

function llenarPortada(lamina: Lamina, datos: DatosFds) {
  const sp = descendientes(arbolDe(lamina), NS_P, 'sp').find(s => /RESUMEN EJECUTIVO/.test(textoDe(s)));
  if (!sp) throw new Error('La portada de la plantilla de fin de semana no tiene el título esperado.');
  const [titulo, periodo] = parrafosDe(txBodyDe(sp));
  const fragTitulo = fragmentosDe(titulo).find(r => /TURNO [AB]/.test(textoDe(r)));
  if (fragTitulo) fijarFragmento(fragTitulo, textoDe(fragTitulo).replace(/TURNO [AB]/, `TURNO ${datos.letra}`));
  const fragPeriodo = fragmentosDe(periodo).find(r => /^PERIODO:/.test(textoDe(r)));
  if (fragPeriodo) fijarFragmento(fragPeriodo, `PERIODO: ${periodoDe(datos.inicio, datos.fin)}`);
}

// ---- Resumen general (lámina 3): tarjetas apiladas, cada una con su barra de fondo -------

const RESUMEN = {
  x: 4.5, w: 7.32,                 // tarjeta (pulgadas)
  barraX: 4.08, barraW: 8.35,      // barra de fondo
  arriba: 1.95, abajo: 6.9,        // zona disponible
  gapMin: 0.12, gapMax: 0.35,
  tamanos: [1400, 1300, 1240, 1200, 1140, 1100, 1000, 900],
  /** Ancho útil del texto dentro de la tarjeta (descontando los márgenes de la plantilla). */
  textoW: 7.32 - (155448 + 109728) / EMU,
};

/** Altura (pulgadas) de una tarjeta con ese texto (se dibuja en mayúsculas) y tamaño (centésimas de punto). */
function alturaTarjeta(texto: string, sz: number): number {
  const pt = sz / 100;
  const lineas = lineasDe(texto.toUpperCase(), RESUMEN.textoW * 72, pt);
  return lineas * pt * 1.2 / 72 + 0.2;
}

/** Tamaño y posición de cada tarjeta: el mayor tamaño con el que todas caben en la zona. */
function disponerResumen(textos: string[]): { sz: number; cajas: { y: number; h: number }[]; cabe: boolean } {
  const disponible = RESUMEN.abajo - RESUMEN.arriba;
  for (const sz of RESUMEN.tamanos) {
    const alturas = textos.map(t => alturaTarjeta(t, sz));
    const suma = alturas.reduce((a, b) => a + b, 0);
    const huecos = Math.max(0, textos.length - 1);
    if (suma + RESUMEN.gapMin * huecos <= disponible) {
      const gap = huecos ? Math.min(RESUMEN.gapMax, (disponible - suma) / huecos) : 0;
      const usado = suma + gap * huecos;
      let y = RESUMEN.arriba + (disponible - usado) / 2;
      const cajas = alturas.map(h => { const caja = { y, h }; y += h + gap; return caja; });
      return { sz, cajas, cabe: true };
    }
  }
  // Nada cabe: se apilan con el tamaño más chico y se avisa para acortar el texto.
  const sz = RESUMEN.tamanos[RESUMEN.tamanos.length - 1];
  let y = RESUMEN.arriba;
  const cajas = textos.map(t => { const h = alturaTarjeta(t, sz); const caja = { y, h }; y += h + 0.08; return caja; });
  return { sz, cajas, cabe: false };
}

function llenarResumenGeneral(lamina: Lamina, textos: string[], avisos: string[]) {
  const arbol = arbolDe(lamina);
  const existentes = hijos(arbol, NS_P, 'sp').filter(s => nombreDe(s).startsWith('Resumen general - '));
  const barraModelo = existentes.find(s => nombreDe(s).endsWith('barra fondo'));
  const tarjetaModelo = existentes.find(s => nombreDe(s).endsWith('card actualizado'));
  if (!barraModelo || !tarjetaModelo) throw new Error('La lámina de resumen general de la plantilla no tiene sus tarjetas.');
  const barra0 = barraModelo.cloneNode(true) as Element;
  const tarjeta0 = tarjetaModelo.cloneNode(true) as Element;
  for (const s of existentes) arbol.removeChild(s);

  const lista = textos.length ? textos : ['SIN RESUMEN GENERAL REGISTRADO.'];
  const { sz, cajas, cabe } = disponerResumen(lista);
  if (!cabe) avisos.push('El resumen general es muy largo para la lámina: acorta algunos puntos.');

  let siguiente = idMayor(arbol) + 1;
  lista.forEach((texto, i) => {
    const caja = cajas[i];
    const bar = barra0.cloneNode(true) as Element;
    fijarId(bar, siguiente++);
    fijarXfrm(bar, RESUMEN.barraX, caja.y + 0.1, RESUMEN.barraW, Math.max(0.2, caja.h - 0.1));
    agregarForma(arbol, bar);

    const tarjeta = tarjeta0.cloneNode(true) as Element;
    fijarId(tarjeta, siguiente++);
    fijarXfrm(tarjeta, RESUMEN.x, caja.y, RESUMEN.w, caja.h);
    fijarUnico(tarjeta, texto.toUpperCase());
    for (const p of parrafosDe(txBodyDe(tarjeta))) fijarTamanoTodo(p, sz);
    agregarForma(arbol, tarjeta);
  });
}

// ---- Actividades principales (lámina 5): tabla con una fila por actividad y un bloque por día ----

const TABLA_ACT = {
  /** Ancho de la columna de actividades (pulgadas). */
  anchoActividad: 8.02,
  /** Alto máximo de la tabla completa (desde su borde superior hasta la base útil de la lámina). */
  alturaMax: 4.63,
  tamanos: [1400, 1300, 1200, 1100, 1000, 900],
};

/** Alto (pulgadas) de una celda con ese texto, en una columna de ese ancho. Aproximado, con margen. */
function alturaTextoCelda(texto: string, anchoIn: number, sz: number): number {
  const pt = sz / 100;
  const cpl = Math.max(8, Math.floor((anchoIn - 0.2) / (0.55 * pt / 72)));
  const lineas = Math.max(1, Math.ceil(texto.length / cpl));
  return lineas * pt * 1.2 / 72 + 0.14;
}

/** Pone el texto de una celda en un único párrafo (conserva el formato de su primer fragmento). */
function textoCelda(tc: Element, texto: string, sz?: number) {
  const parrafos = descendientes(tc, NS_A, 'p');
  const p = parrafos[0];
  if (!p) return;
  for (const extra of parrafos.slice(1)) extra.parentElement?.removeChild(extra);
  fijarTexto(p, texto);
  if (sz) fijarTamanoTodo(p, sz);
}

/** Celda del día: nombre del día y fecha en dos líneas ("VIERNES" / "23/10"), con el formato de la plantilla. */
function textoCeldaDia(tc: Element, iso: string) {
  const parrafos = descendientes(tc, NS_A, 'p');
  const p = parrafos[0];
  if (!p) return;
  for (const extra of parrafos.slice(1)) extra.parentElement?.removeChild(extra);
  const { m, d } = partesIso(iso);
  fijarTexto(p, nombreDia(iso));
  const primera = fragmentosDe(p)[0];
  const salto = p.ownerDocument.createElementNS(NS_A, 'a:br');
  const rPr = primera.getElementsByTagNameNS(NS_A, 'rPr')[0];
  if (rPr) salto.appendChild(rPr.cloneNode(true));
  const segunda = primera.cloneNode(true) as Element;
  fijarFragmento(segunda, `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`);
  p.insertBefore(salto, primera.nextSibling);
  p.insertBefore(segunda, salto.nextSibling);
}

/** Deja una celda combinada (vMerge) sin texto. */
function vaciarCelda(tc: Element) {
  const parrafos = descendientes(tc, NS_A, 'p');
  for (const extra of parrafos.slice(1)) extra.parentElement?.removeChild(extra);
  if (parrafos[0]) for (const r of fragmentosDe(parrafos[0])) parrafos[0].removeChild(r);
}

/** Agrupa filas consecutivas con el mismo responsable (no vacío) para combinarlas, como en la plantilla. */
function combinarResponsables(valores: string[]): { tipo: 'inicio' | 'continua' | 'sola'; n: number }[] {
  const salida: { tipo: 'inicio' | 'continua' | 'sola'; n: number }[] = valores.map(() => ({ tipo: 'sola', n: 1 }));
  let i = 0;
  while (i < valores.length) {
    let j = i + 1;
    if (valores[i]) while (j < valores.length && valores[j] === valores[i]) j++;
    const n = j - i;
    if (n > 1) {
      salida[i] = { tipo: 'inicio', n };
      for (let k = i + 1; k < j; k++) salida[k] = { tipo: 'continua', n: 0 };
    }
    i = j;
  }
  return salida;
}

function llenarActividades(lamina: Lamina, dias: DatosFds['dias'], avisos: string[]) {
  const arbol = arbolDe(lamina);
  const tabla = descendientes(arbol, NS_A, 'tbl')[0];
  const marcoTabla = descendientes(arbol, NS_P, 'graphicFrame').find(g => descendientes(g, NS_A, 'tbl')[0] === tabla);
  if (!tabla || !marcoTabla) throw new Error('La lámina de actividades de la plantilla no tiene su tabla.');
  const filas = hijos(tabla, NS_A, 'tr');
  const cabecera = filas[0];
  // La plantilla trae 3 filas por día (una lámina de referencia por día, con su color propio).
  const bloques = [0, 1, 2].map(k => filas.slice(1 + 3 * k, 4 + 3 * k));

  const grupos = dias.map(d => ({
    fecha: d.fecha,
    filas: d.actividades.length ? d.actividades : [{ actividad: 'SIN ACTIVIDADES REGISTRADAS.', responsable: '' }],
  }));
  const todas = grupos.flatMap(g => g.filas);
  const altoCabecera = Number(cabecera.getAttribute('h')) / EMU;
  const disponible = TABLA_ACT.alturaMax - altoCabecera;

  // Mayor tamaño de letra con el que todas las filas caben en la altura disponible.
  let sz = TABLA_ACT.tamanos[TABLA_ACT.tamanos.length - 1];
  let alturas: number[] | null = null;
  for (const candidato of TABLA_ACT.tamanos) {
    const a = todas.map(f => alturaTextoCelda(f.actividad, TABLA_ACT.anchoActividad, candidato));
    if (a.reduce((x, y) => x + y, 0) <= disponible) { sz = candidato; alturas = a; break; }
  }
  if (!alturas) {
    alturas = todas.map(f => alturaTextoCelda(f.actividad, TABLA_ACT.anchoActividad, sz));
    avisos.push('La tabla de actividades no cabe completa en la lámina: acorta algunas actividades.');
  }
  // Si sobra altura, las filas se estiran un poco para ocupar la lámina como en la plantilla (máximo 0.2 in por fila).
  const sobra = disponible - alturas.reduce((x, y) => x + y, 0);
  if (sobra > 0) {
    const extra = Math.min(0.2, sobra / alturas.length);
    alturas = alturas.map(a => a + extra);
  }

  const nuevas: Element[] = [];
  let indice = 0;
  grupos.forEach((grupo, k) => {
    const ref = bloques[k] ?? bloques[bloques.length - 1];
    const combinados = combinarResponsables(grupo.filas.map(f => f.responsable.trim()));
    grupo.filas.forEach((fila, i) => {
      const tr = ref[Math.min(i, ref.length - 1)].cloneNode(true) as Element;
      const protoResponsable = hijos(ref[0], NS_A, 'tc')[2].cloneNode(true) as Element;
      tr.replaceChild(protoResponsable, hijos(tr, NS_A, 'tc')[2]);
      const celdas = hijos(tr, NS_A, 'tc');
      // Día: la primera fila lleva el nombre del día combinado; las demás quedan combinadas (vMerge).
      if (i === 0) {
        celdas[0].removeAttribute('vMerge');
        celdas[0].setAttribute('rowSpan', String(grupo.filas.length));
        textoCeldaDia(celdas[0], grupo.fecha);
      } else {
        celdas[0].removeAttribute('rowSpan');
        celdas[0].setAttribute('vMerge', '1');
        vaciarCelda(celdas[0]);
      }
      // Actividad.
      textoCelda(celdas[1], fila.actividad, sz);
      // Responsable: combinado con las filas de igual responsable.
      const combinado = combinados[i];
      if (combinado.tipo === 'continua') {
        celdas[2].removeAttribute('rowSpan');
        celdas[2].setAttribute('vMerge', '1');
        vaciarCelda(celdas[2]);
      } else {
        celdas[2].removeAttribute('vMerge');
        if (combinado.n > 1) celdas[2].setAttribute('rowSpan', String(combinado.n));
        else celdas[2].removeAttribute('rowSpan');
        textoCelda(celdas[2], fila.responsable, sz);
      }
      tr.setAttribute('h', String(aEmu(alturas![indice])));
      indice++;
      nuevas.push(tr);
    });
  });

  for (const tr of filas.slice(1)) tabla.removeChild(tr);
  for (const tr of nuevas) tabla.appendChild(tr);
  const altoTotal = altoCabecera + alturas.reduce((x, y) => x + y, 0);
  const m = medidasDe(marcoTabla);
  fijarXfrm(marcoTabla, m.x / EMU, m.y / EMU, m.w / EMU, altoTotal);
}

// ---- Reportabilidad GG (lámina 8): gráfico de barras por día y su libro incrustado -------

const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';

async function llenarReportabilidad(ctx: Contexto, lamina: Lamina, datos: DatosFds, avisos: string[]) {
  const rel = Array.from(lamina.rels.documentElement.children).find(r => (r.getAttribute('Type') ?? '').endsWith('/chart'));
  const nombreGrafico = (rel?.getAttribute('Target') ?? '').split('/').pop();
  if (!nombreGrafico) throw new Error('La lámina de reportabilidad GG de la plantilla no tiene gráfico.');
  const rutaGrafico = `ppt/charts/${nombreGrafico}`;
  const rutaRelsGrafico = `ppt/charts/_rels/${nombreGrafico}.rels`;
  const doc = leer(await ctx.zip.file(rutaGrafico)!.async('string'));

  const etiquetas = datos.dias.map(d => diaGrafico(d.fecha));
  for (const cat of descendientes(doc.documentElement, NS_C, 'cat')) {
    for (const pt of descendientes(cat, NS_C, 'pt')) {
      const v = descendientes(pt, NS_C, 'v')[0];
      const etiqueta = etiquetas[Number(pt.getAttribute('idx'))];
      if (v && etiqueta) v.textContent = etiqueta;
    }
  }
  const valores = datos.reportabilidadGG.map((v, i) => {
    if (v === null) avisos.push(`Falta la reportabilidad GG del ${datos.dias[i] ? diaGrafico(datos.dias[i].fecha).toLowerCase() : 'día'}: el gráfico la muestra en 0%.`);
    return v ?? 0;
  });
  for (const val of descendientes(doc.documentElement, NS_C, 'val')) {
    for (const pt of descendientes(val, NS_C, 'pt')) {
      const v = descendientes(pt, NS_C, 'v')[0];
      if (v) v.textContent = String(valores[Number(pt.getAttribute('idx'))] ?? 0);
    }
  }
  ctx.zip.file(rutaGrafico, escribir(doc), { createFolders: false });

  // El libro incrustado tiene que coincidir con el gráfico: si no, PowerPoint muestra los datos viejos al editarlo.
  const relsXml = leer(await ctx.zip.file(rutaRelsGrafico)!.async('string'));
  const relLibro = Array.from(relsXml.documentElement.children).find(r => (r.getAttribute('Type') ?? '').endsWith('/package'));
  const rutaLibro = relLibro ? `ppt/${(relLibro.getAttribute('Target') ?? '').replace('../', '')}` : '';
  if (!rutaLibro || !ctx.zip.file(rutaLibro)) throw new Error('El gráfico de reportabilidad GG no tiene su libro de datos.');
  const libro = await JSZip.loadAsync(await ctx.zip.file(rutaLibro)!.async('uint8array'));
  const hoja = leer(await libro.file('xl/worksheets/sheet1.xml')!.async('string'));
  const sst = leer(await libro.file('xl/sharedStrings.xml')!.async('string'));
  const entradas = Array.from(sst.getElementsByTagNameNS(NS_SS, 'si'));
  const celda = (ref: string) => Array.from(hoja.getElementsByTagNameNS(NS_SS, 'c')).find(c => c.getAttribute('r') === ref);
  datos.dias.forEach((_, i) => {
    const filaRef = i + 2;
    const celdaA = celda(`A${filaRef}`);
    const indiceTexto = Number(celdaA?.getElementsByTagNameNS(NS_SS, 'v')[0]?.textContent ?? -1);
    const si = entradas[indiceTexto];
    if (si) {
      const t = descendientes(si, NS_SS, 't')[0];
      if (t) t.textContent = textoSeguro(etiquetas[i]);
    }
    const celdaB = celda(`B${filaRef}`);
    const v = celdaB?.getElementsByTagNameNS(NS_SS, 'v')[0];
    if (v) v.textContent = String(valores[i]);
  });
  libro.file('xl/worksheets/sheet1.xml', escribir(hoja), { createFolders: false });
  libro.file('xl/sharedStrings.xml', escribir(sst), { createFolders: false });
  const bytes = await libro.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  ctx.zip.file(rutaLibro, bytes, { binary: true, createFolders: false });
}
const NS_SS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

// ---- Mantenimiento preventivo (lámina 9): tabla con una fila por sitio ---------------------

const OM = { sumaHoras: 250, reduccionSiHayMasDe12: 200 };

function llenarOm(lamina: Lamina, datos: DatosFds) {
  const arbol = arbolDe(lamina);
  const tabla = descendientes(arbol, NS_A, 'tbl')[0];
  const marcoTabla = descendientes(arbol, NS_P, 'graphicFrame').find(g => descendientes(g, NS_A, 'tbl')[0] === tabla);
  if (!tabla || !marcoTabla) throw new Error('La lámina de mantenimiento de la plantilla no tiene su tabla.');
  const filas = hijos(tabla, NS_A, 'tr');
  const cabecera = filas[0];
  const cuerpo = filas.slice(1);
  // Encabezado de horas registradas con la fecha de corte.
  for (const celda of hijos(cabecera, NS_A, 'tc')) {
    if (/^Horas Registradas/.test(textoDe(celda).trim())) textoCelda(celda, `Horas Registradas al ${dmSinGuion(datos.fechaCorteOm)}`);
  }

  const cantidad = Math.max(1, datos.om.length);
  const reducir = cantidad > 12;
  const altoCabecera = Number(cabecera.getAttribute('h')) / EMU;
  const altoDisponible = medidasDe(marcoTabla).h / EMU - altoCabecera;
  const altoFila = Math.min(Number(cuerpo[0].getAttribute('h')) / EMU, altoDisponible / cantidad);

  const nuevas = (datos.om.length ? datos.om : [{ sitio: '', nombre: '', horasUltimo: null, fechaUltimo: null, dias: 180, horasRegistradas: null }]).map((fila, i) => {
    const tr = cuerpo[i % cuerpo.length].cloneNode(true) as Element;
    const celdas = hijos(tr, NS_A, 'tc');
    const proximo = fila.horasUltimo === null ? '' : String(fila.horasUltimo + OM.sumaHoras);
    const estimada = fila.fechaUltimo ? fechaOm(sumarDiasIso(fila.fechaUltimo, fila.dias)) : '';
    const valores = [
      fila.sitio,
      fila.nombre,
      fila.horasUltimo === null ? '' : String(fila.horasUltimo),
      fila.fechaUltimo ? fechaOm(fila.fechaUltimo) : '',
      proximo,
      String(fila.dias),
      estimada,
      fila.horasRegistradas === null ? '' : String(fila.horasRegistradas),
    ];
    valores.forEach((texto, c) => {
      const celda = celdas[c];
      if (!celda) return;
      textoCelda(celda, texto);
      if (reducir) {
        for (const p of descendientes(celda, NS_A, 'p')) fijarTamanoTodo(p, Math.max(800, (tamanoDePlantilla(p) ?? 1200) - OM.reduccionSiHayMasDe12));
      }
    });
    tr.setAttribute('h', String(aEmu(altoFila)));
    return tr;
  });

  for (const tr of cuerpo) tabla.removeChild(tr);
  for (const tr of nuevas) tabla.appendChild(tr);
  const m = medidasDe(marcoTabla);
  fijarXfrm(marcoTabla, m.x / EMU, m.y / EMU, m.w / EMU, altoCabecera + altoFila * cantidad);
}

// ---- Cascadas (láminas 11, 17 y 19) y observaciones (lámina 15): SmartArt -------------------
// Las cascadas se reconstruyen como formas nativas (mismo diseño que el SmartArt de la plantilla) para
// poder mostrar cualquier cantidad de ítems. La lámina 15 es un SmartArt de un solo nodo: se cambia su texto.

const NS_DSP = 'http://schemas.microsoft.com/office/drawing/2008/diagram';
const NS_DGM = 'http://schemas.openxmlformats.org/drawingml/2006/diagram';
/** Alto de cada caja de la cascada / paso vertical entre cajas (medido en las cascadas de referencia). */
const CASCADA_RAZON = 0.85;
/** Alto de cada flecha / alto de cada caja (también medido en la referencia). */
const FLECHA_RAZON = 0.65;

/** Ruta del archivo de una parte del SmartArt (dibujo o datos) de la lámina, según el tipo de relación. */
function rutaRelacion(lamina: Lamina, fragmento: string): string {
  const rel = Array.from(lamina.rels.documentElement.children).find(r => (r.getAttribute('Type') ?? '').includes(fragmento));
  if (!rel) throw new Error(`La lámina ${lamina.numero} de la plantilla no tiene ${fragmento}.`);
  return 'ppt/' + (rel.getAttribute('Target') ?? '').replace(/^\.\.\//, '');
}

/** Quita de la lámina las relaciones con sus partes de SmartArt (el diagrama ya no se usa). */
function quitarRelacionesDiagrama(lamina: Lamina) {
  for (const rel of Array.from(lamina.rels.documentElement.children)) {
    if ((rel.getAttribute('Type') ?? '').includes('diagram')) lamina.rels.documentElement.removeChild(rel);
  }
}

const prst = (el: Element) => el.getElementsByTagNameNS(NS_A, 'prstGeom')[0]?.getAttribute('prst') ?? '';

/** Copia una forma del dibujo del SmartArt como forma nativa de la lámina (p:sp), sin el id del modelo. */
function aFormaP(lamina: Lamina, sp: Element): Element {
  const serie = new XMLSerializer().serializeToString(sp)
    .replace(/^<dsp:sp\b/, '<p:sp')
    .replace(/<(\/?)dsp:/g, '<$1p:')
    .replace(/\smodelId="[^"]*"/, '');
  const envoltorio = leer(`<raiz xmlns:p="${NS_P}" xmlns:a="${NS_A}" xmlns:r="${NS_R}">${serie}</raiz>`);
  const forma = lamina.doc.importNode(envoltorio.documentElement.firstElementChild!, true) as Element;
  // txXfrm solo existe en los diagramas (posición del texto relativa al diagrama): en una lámina movería el texto.
  for (const hijo of Array.from(forma.children)) if (hijo.localName === 'txXfrm') forma.removeChild(hijo);
  return forma;
}

/** Si los textos (un párrafo cada uno, tal como se dibujan) caben en la caja, con el tamaño dado (caja en puntos). */
function cabeTexto(caja: { ancho: number; alto: number }, textos: string[], sz: number): boolean {
  const pt = sz / 100;
  const lineas = textos.reduce((n, t) => n + lineasDe(t, caja.ancho - 6, pt), 0);
  return lineas * pt * 1.2 + textos.length * pt * 0.3 <= caja.alto - 8;
}

/** Cajas y flechas de una cascada de n ítems dentro del marco (pulgadas, relativas al marco). */
function disponerCascada(n: number, W: number, H: number, wProto: number, hProto: number) {
  const w = Math.min(wProto, W);
  if (n === 1) {
    const h = Math.min(hProto, H);
    return { cajas: [{ x: 0, y: 0, w, h }], flechas: [] as { x: number; y: number; w: number; h: number }[] };
  }
  const paso = H / (n - 1 + CASCADA_RAZON);
  const h = CASCADA_RAZON * paso;
  const pasoX = (W - w) / (n - 1);
  const cajas = Array.from({ length: n }, (_, i) => ({ x: i * pasoX, y: i * paso, w, h }));
  const lado = FLECHA_RAZON * h;
  const flechas = cajas.slice(0, -1).map((a, i) => {
    const b = cajas[i + 1];
    const centroY = (a.y + a.h + b.y) / 2;
    return { x: a.x + a.w - lado, y: centroY - lado / 2, w: lado, h: lado };
  });
  return { cajas, flechas };
}

async function llenarCascada(ctx: Contexto, lamina: Lamina, textos: string[], avisos: string[], etiqueta: string) {
  const arbol = arbolDe(lamina);
  const marcoDiagrama = descendientes(arbol, NS_P, 'graphicFrame')
    .find(g => descendientes(g, NS_A, 'graphicData').some(d => (d.getAttribute('uri') ?? '').includes('/diagram')));
  if (!marcoDiagrama) throw new Error(`La lámina de ${etiqueta} de la plantilla no tiene su diagrama.`);
  const dibujo = leer(await ctx.zip.file(rutaRelacion(lamina, 'diagramDrawing'))!.async('string'));
  const formas = Array.from(dibujo.getElementsByTagNameNS(NS_DSP, 'sp'));
  const protoCaja = formas.find(s => prst(s) === 'roundRect');
  const protoFlecha = formas.find(s => prst(s) === 'downArrow');
  if (!protoCaja) throw new Error(`La cascada de ${etiqueta} no tiene cajas en la plantilla.`);

  const items = textos.length ? textos.map(t => t.toUpperCase()) : ['SIN DATOS REGISTRADOS.'];
  const m = medidasDe(marcoDiagrama);
  const W = m.w / EMU, H = m.h / EMU;
  const pCaja = medidasDe(protoCaja);
  const { cajas, flechas } = disponerCascada(items.length, W, H, pCaja.w / EMU, pCaja.h / EMU);

  // Tamaño común: el mayor con el que todos los textos caben en su caja.
  const modelo = aFormaP(lamina, protoCaja);
  const parrafoModelo = parrafosDe(txBodyDe(modelo))[0];
  const insetPt = (45720 / EMU) * 72;
  const cajaTexto = { ancho: cajas[0].w * 72 - 2 * insetPt, alto: cajas[0].h * 72 - 2 * insetPt };
  const sizes = tamanosPosibles(tamanoDePlantilla(parrafoModelo), [1400, 1200, 1100, 1000, 900, 800]);
  let sz = sizes[sizes.length - 1];
  for (const candidato of sizes) if (items.every(t => cabeTexto(cajaTexto, [t], candidato))) { sz = candidato; break; }
  if (!items.every(t => cabeTexto(cajaTexto, [t], sz))) avisos.push(`Los textos de ${etiqueta} no caben completos en la lámina: acórtalos.`);

  let siguiente = idMayor(arbol) + 1;
  const nuevas: Element[] = [];
  cajas.forEach((c, i) => {
    const forma = i === 0 ? modelo : aFormaP(lamina, protoCaja);
    fijarId(forma, siguiente++);
    fijarXfrm(forma, m.x / EMU + c.x, m.y / EMU + c.y, c.w, c.h);
    reemplazarParrafos(forma, [copiaTexto(parrafoModelo, items[i], sz)]);
    nuevas.push(forma);
  });
  if (protoFlecha) {
    for (const f of flechas) {
      const flecha = aFormaP(lamina, protoFlecha);
      fijarId(flecha, siguiente++);
      fijarXfrm(flecha, m.x / EMU + f.x, m.y / EMU + f.y, f.w, f.h);
      nuevas.push(flecha);
    }
  }
  for (const forma of nuevas) arbol.insertBefore(forma, marcoDiagrama);
  arbol.removeChild(marcoDiagrama);
  quitarRelacionesDiagrama(lamina);
}

/** Reemplaza los párrafos de un contenedor de texto (a:p) por uno por cada ítem, con el mismo formato. */
function reemplazarTextos(contenedor: Element, modelo: Element, items: string[], sz: number) {
  const doc = contenedor.ownerDocument;
  for (const p of hijos(contenedor, NS_A, 'p')) contenedor.removeChild(p);
  for (const t of items) {
    const p = doc.importNode(modelo, true) as Element;
    fijarTexto(p, t);
    fijarTamanoTodo(p, sz);
    contenedor.appendChild(p);
  }
}

async function llenarObservaciones(ctx: Contexto, lamina: Lamina, textos: string[], avisos: string[]) {
  const items = (textos.length ? textos : ['SIN OBSERVACIONES.']).map(t => t.toUpperCase());
  const rutaDibujo = rutaRelacion(lamina, 'diagramDrawing');
  const rutaDatos = rutaRelacion(lamina, 'diagramData');
  const dibujo = leer(await ctx.zip.file(rutaDibujo)!.async('string'));
  const datos = leer(await ctx.zip.file(rutaDatos)!.async('string'));

  // Caja principal del dibujo: el rectángulo redondeado con el texto.
  const caja = Array.from(dibujo.getElementsByTagNameNS(NS_DSP, 'sp'))
    .find(s => prst(s) === 'roundRect' && descendientes(s, NS_A, 't').some(t => (t.textContent ?? '').trim() !== ''));
  if (!caja) throw new Error('La lámina de observaciones de la plantilla no tiene su caja de texto.');
  const txBodyDibujo = caja.getElementsByTagNameNS(NS_DSP, 'txBody')[0];
  const parrafoDibujo = hijos(txBodyDibujo, NS_A, 'p')[0].cloneNode(true) as Element;
  const m = medidasDe(caja);
  const insetPt = (192378 / EMU) * 72;
  const cajaTexto = { ancho: (m.w / EMU) * 72 - 2 * insetPt, alto: (m.h / EMU) * 72 };
  const sizes = tamanosPosibles(tamanoDePlantilla(parrafoDibujo), [1800, 1600, 1400, 1200, 1000, 900]);
  let sz = sizes[sizes.length - 1];
  for (const candidato of sizes) if (cabeTexto(cajaTexto, items, candidato)) { sz = candidato; break; }
  if (!cabeTexto(cajaTexto, items, sz)) avisos.push('Las observaciones no caben completas en la lámina: acórtalas.');
  reemplazarTextos(txBodyDibujo, parrafoDibujo, items, sz);

  // El modelo de datos del mismo SmartArt guarda el texto del nodo: se cambia igual, para que al editarlo no vuelva lo viejo.
  const nodo = Array.from(datos.getElementsByTagNameNS(NS_DGM, 'pt'))
    .find(pt => ['node', ''].includes(pt.getAttribute('type') ?? '') && descendientes(pt, NS_A, 't').some(t => (t.textContent ?? '').trim() !== ''));
  if (!nodo) throw new Error('La lámina de observaciones de la plantilla no tiene su nodo de texto.');
  const tNodo = nodo.getElementsByTagNameNS(NS_DGM, 't')[0];
  const parrafoDatos = hijos(tNodo, NS_A, 'p')[0].cloneNode(true) as Element;
  reemplazarTextos(tNodo, parrafoDatos, items, sz);

  ctx.zip.file(rutaDibujo, escribir(dibujo), { createFolders: false });
  ctx.zip.file(rutaDatos, escribir(datos), { createFolders: false });
}

// ---- Difusiones (lámina 13): cuatro recuadros de texto (un día por recuadro y controles) -----

const TAMANOS_TARJETA = [1100, 1050, 1000, 950, 900, 850, 800];

/** Caja útil de un recuadro de difusiones, en puntos (se descuentan márgenes y la sangría de las viñetas). */
const cajaTarjeta = (tarjeta: Element) => {
  const m = medidasDe(tarjeta);
  return { ancho: (m.w / EMU - 0.12 - 0.19) * 72, alto: (m.h / EMU - 0.11) * 72 };
};

/** Mayor tamaño (de la lista común) con el que el encabezado y las viñetas caben en el recuadro. */
function tamanoTarjeta(tarjeta: Element, encabezado: string, items: string[]): number {
  const textos = [encabezado, '', ...(items.length ? items : ['SIN DIFUSIONES REGISTRADAS.'])];
  const caja = cajaTarjeta(tarjeta);
  return TAMANOS_TARJETA.find(sz => cabeTexto(caja, textos, sz)) ?? TAMANOS_TARJETA[TAMANOS_TARJETA.length - 1];
}

function escribirTarjeta(tarjeta: Element, encabezado: string, items: string[], sz: number) {
  const parrafos = parrafosDe(txBodyDe(tarjeta));
  const modeloEncabezado = parrafos[0];
  const modeloVacio = parrafos[1];
  const modeloVineta = parrafos.find(tieneVinetas);
  if (!modeloEncabezado || !modeloVacio || !modeloVineta) throw new Error('Un recuadro de difusiones de la plantilla no tiene el formato esperado.');
  const lista = items.length ? items : ['SIN DIFUSIONES REGISTRADAS.'];
  const vacio = modeloVacio.cloneNode(true) as Element;
  for (const r of descendientes(vacio, NS_A, 'endParaRPr')) r.setAttribute('sz', String(sz));
  const nuevos: Element[] = [copiaTexto(modeloEncabezado, encabezado, sz), vacio, ...lista.map(t => copiaTexto(modeloVineta, t, sz))];
  reemplazarParrafos(tarjeta, nuevos);
}

function llenarDifusiones(lamina: Lamina, datos: DatosFds, avisos: string[]) {
  const tarjetas = hijos(arbolDe(lamina), NS_P, 'sp')
    .filter(s => nombreDe(s).startsWith('Difusion card'))
    .sort((a, b) => (medidasDe(a).y - medidasDe(b).y) || (medidasDe(a).x - medidasDe(b).x));
  if (tarjetas.length !== 4) throw new Error('La lámina de difusiones de la plantilla no tiene sus cuatro recuadros.');
  // Los cuatro recuadros usan el mismo tamaño: el mayor que cabe en todos.
  const filas = [
    ...datos.dias.map((dia, k) => ({ tarjeta: tarjetas[k], encabezado: diaTabla(dia.fecha), items: dia.difusiones, etiqueta: `difusiones del ${diaTabla(dia.fecha)}` })),
    { tarjeta: tarjetas[3], encabezado: 'CONTROLES TRANSVERSALES', items: datos.controles, etiqueta: 'controles transversales' },
  ];
  const sz = Math.min(...filas.map(f => tamanoTarjeta(f.tarjeta, f.encabezado, f.items)));
  for (const f of filas) {
    escribirTarjeta(f.tarjeta, f.encabezado, f.items, sz);
    const textos = [f.encabezado, '', ...(f.items.length ? f.items : ['SIN DIFUSIONES REGISTRADAS.'])];
    if (!cabeTexto(cajaTarjeta(f.tarjeta), textos, sz)) avisos.push(`Las ${f.etiqueta} no caben completas en su recuadro: acórtalas.`);
  }
}

// ---------------------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------------------

/** Genera la presentación de fin de semana. Devuelve el archivo .pptx listo para descargar y los avisos. */
export async function generarPresentacionFds(datos: DatosFds): Promise<ResultadoPresentacion> {
  const respuesta = await fetch(plantillaUrl);
  if (!respuesta.ok) throw new Error('No se pudo cargar la plantilla de la presentación de fin de semana.');
  const zip = await JSZip.loadAsync(await respuesta.arrayBuffer());
  const ctx: Contexto = { zip, laminas: new Map() };
  const avisos: string[] = [];

  llenarPortada(await abrirLamina(ctx, LAMINA.portada), datos);
  llenarResumenGeneral(await abrirLamina(ctx, LAMINA.resumenGeneral), datos.resumenGeneral, avisos);
  llenarActividades(await abrirLamina(ctx, LAMINA.actividades), datos.dias, avisos);
  await llenarReportabilidad(ctx, await abrirLamina(ctx, LAMINA.reportabilidad), datos, avisos);
  llenarOm(await abrirLamina(ctx, LAMINA.om), datos);
  await llenarCascada(ctx, await abrirLamina(ctx, LAMINA.cascadaActividades), datos.cascadaActividades, avisos, 'actividades principales');
  llenarDifusiones(await abrirLamina(ctx, LAMINA.difusiones), datos, avisos);
  await llenarObservaciones(ctx, await abrirLamina(ctx, LAMINA.observaciones), datos.observaciones, avisos);
  await llenarCascada(
    ctx,
    await abrirLamina(ctx, LAMINA.cpe),
    ['ACTIVIDADES CON CPE:', ...(datos.cpe.length ? datos.cpe : ['SIN ACTIVIDADES CON CPE EN EL FIN DE SEMANA.'])],
    avisos,
    'CPE',
  );
  await llenarCascada(ctx, await abrirLamina(ctx, LAMINA.conclusiones), datos.conclusiones, avisos, 'conclusiones');

  for (const lamina of ctx.laminas.values()) {
    zip.file(`ppt/slides/slide${lamina.numero}.xml`, escribir(lamina.doc), { createFolders: false });
    zip.file(lamina.relsPath, escribir(lamina.rels), { createFolders: false });
  }
  const blob = await zip.generateAsync({ type: 'blob', mimeType: MIME_PPTX, compression: 'DEFLATE' });
  return { blob, avisos };
}
