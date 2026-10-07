// Genera el Word del Checklist de Camioneta rellenando la plantilla oficial
// (GSSO-LTE-R-LV-DSAL-29): no se rearma el documento, solo se escriben los datos en sus celdas,
// así el formato, logos, dibujos de la camioneta y textos quedan idénticos al registro original.
import plantillaUrl from '../../assets/plantillas/checklist_camioneta.docx?url';
import { DIAS_CHECKLIST, TODOS_LOS_ITEMS, fechasChecklist, type DatosChecklist, type Marca } from './catalogo';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** dd/mm/aaaa (vacío si no hay fecha). */
const fechaCorta = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export async function generarChecklistWord(datos: DatosChecklist): Promise<Blob> {
  const [{ default: JSZip }, respuesta] = await Promise.all([import('jszip'), fetch(plantillaUrl)]);
  if (!respuesta.ok) throw new Error('No se pudo cargar la plantilla del checklist.');
  const zip = await JSZip.loadAsync(await respuesta.arrayBuffer());
  const archivo = zip.file('word/document.xml');
  if (!archivo) throw new Error('La plantilla del checklist está dañada.');
  const doc = new DOMParser().parseFromString(await archivo.async('string'), 'application/xml');

  const hijos = (el: Element, nombre: string) =>
    Array.from(el.children).filter(c => c.namespaceURI === W && c.localName === nombre);
  const nuevo = (nombre: string) => doc.createElementNS(W, `w:${nombre}`);
  const body = doc.getElementsByTagNameNS(W, 'body')[0];
  const tablas = hijos(body, 'tbl');

  const celda = (tabla: number, fila: number, col: number): Element => {
    const tr = hijos(tablas[tabla], 'tr')[fila];
    const tc = tr ? hijos(tr, 'tc')[col] : undefined;
    if (!tc) throw new Error(`La plantilla no tiene la celda ${tabla}/${fila}/${col}.`);
    return tc;
  };

  const primerParrafo = (tc: Element): Element => {
    let p = hijos(tc, 'p')[0];
    if (!p) { p = nuevo('p'); tc.appendChild(p); }
    return p;
  };

  /** Formato de letra del texto que ya había en el párrafo (o el de su marca de párrafo). */
  const formatoBase = (p: Element): Element => {
    const run = hijos(p, 'r')[0];
    const rPr = run ? hijos(run, 'rPr')[0] : undefined;
    if (rPr) return rPr.cloneNode(true) as Element;
    const pPr = hijos(p, 'pPr')[0];
    const marca = pPr ? hijos(pPr, 'rPr')[0] : undefined;
    return marca ? marca.cloneNode(true) as Element : nuevo('rPr');
  };

  const negrita = (rPr: Element) => {
    if (hijos(rPr, 'b').length) return;
    const fuentes = hijos(rPr, 'rFonts')[0];
    rPr.insertBefore(nuevo('b'), fuentes ? fuentes.nextSibling : rPr.firstChild);
  };

  /** Tamaño de letra en medios puntos (sz / szCs), respetando el orden de propiedades de Word. */
  const tamano = (rPr: Element, medios: number) => {
    for (const nombre of ['sz', 'szCs']) {
      let el = hijos(rPr, nombre)[0];
      if (!el) {
        el = nuevo(nombre);
        const despues = hijos(rPr, nombre === 'sz' ? 'szCs' : 'highlight')[0] ?? hijos(rPr, 'u')[0] ?? hijos(rPr, 'lang')[0];
        rPr.insertBefore(el, despues ?? null);
      }
      el.setAttributeNS(W, 'w:val', String(medios));
    }
  };

  /** Quita los márgenes laterales de una celda angosta (para que "SI" / "NO" no se partan). */
  const sinMargenes = (tc: Element) => {
    let tcPr = hijos(tc, 'tcPr')[0];
    if (!tcPr) { tcPr = nuevo('tcPr'); tc.insertBefore(tcPr, tc.firstChild); }
    if (hijos(tcPr, 'tcMar').length) return;
    const tcMar = nuevo('tcMar');
    for (const lado of ['left', 'right']) {
      const m = nuevo(lado);
      m.setAttributeNS(W, 'w:w', '0');
      m.setAttributeNS(W, 'w:type', 'dxa');
      tcMar.appendChild(m);
    }
    const despues = ['textDirection', 'tcFitText', 'vAlign', 'hideMark'].map(n => hijos(tcPr, n)[0]).find(Boolean);
    tcPr.insertBefore(tcMar, despues ?? null);
  };

  const centrar = (p: Element) => {
    let pPr = hijos(p, 'pPr')[0];
    if (!pPr) { pPr = nuevo('pPr'); p.insertBefore(pPr, p.firstChild); }
    let jc = hijos(pPr, 'jc')[0];
    if (!jc) {
      jc = nuevo('jc');
      const marca = hijos(pPr, 'rPr')[0];
      pPr.insertBefore(jc, marca ?? null);
    }
    jc.setAttributeNS(W, 'w:val', 'center');
  };

  const run = (rPr: Element, contenido: Element) => {
    const r = nuevo('r');
    r.appendChild(rPr);
    r.appendChild(contenido);
    return r;
  };

  const texto = (valor: string) => {
    const t = nuevo('t');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.textContent = valor;
    return t;
  };

  /** Reemplaza el contenido del primer párrafo de la celda, con el mismo formato de letra. */
  const escribir = (tc: Element, valor: string, opciones: { centrado?: boolean; tamano?: number; angosta?: boolean } = {}) => {
    if (!valor) return;
    if (opciones.angosta) sinMargenes(tc);
    const p = primerParrafo(tc);
    const rPr = formatoBase(p);
    if (opciones.tamano) tamano(rPr, opciones.tamano);
    for (const hijo of Array.from(p.children)) if (hijo.localName !== 'pPr') p.removeChild(hijo);
    if (opciones.centrado) centrar(p);
    p.appendChild(run(rPr, texto(valor)));
  };

  /** ✓ (símbolo Webdings, el mismo de las instrucciones del registro) o X. */
  const marcar = (tc: Element, marca: Marca) => {
    if (!marca) return;
    const p = primerParrafo(tc);
    const rPr = formatoBase(p);
    negrita(rPr);
    centrar(p);
    if (marca === 'ok') {
      const sym = nuevo('sym');
      sym.setAttributeNS(W, 'w:font', 'Webdings');
      sym.setAttributeNS(W, 'w:char', 'F061');
      p.appendChild(run(rPr, sym));
    } else {
      p.appendChild(run(rPr, texto('X')));
    }
  };

  /** Escribe la respuesta sobre la línea "_____" de un texto (las demás líneas se quitan). */
  const sobreLinea = (contenedor: Element, valor: string) => {
    if (!valor) return;
    let hecho = false;
    for (const t of Array.from(contenedor.getElementsByTagNameNS(W, 't'))) {
      const actual = t.textContent ?? '';
      if (!actual.includes('_')) continue;
      t.textContent = hecho ? actual.replace(/_+/g, '') : actual.replace(/_+/, ` ${valor} `).replace(/_+/g, '');
      t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      hecho = true;
    }
  };

  const fechas = fechasChecklist(datos.semanaInicio);

  // Encabezado: conductor y semana (desde / hasta).
  escribir(celda(0, 0, 1), datos.conductor);
  escribir(celda(0, 1, 2), fechaCorta(fechas[0]), { centrado: true });
  escribir(celda(0, 1, 4), fechaCorta(fechas[DIAS_CHECKLIST - 1]), { centrado: true });

  // Datos de la camioneta y de los documentos.
  escribir(celda(1, 1, 10), datos.marca);
  escribir(celda(1, 2, 10), datos.modelo);
  escribir(celda(1, 3, 10), datos.anio);
  escribir(celda(1, 4, 10), datos.patente.toUpperCase());
  escribir(celda(1, 5, 10), fechaCorta(datos.fechaUltimaMantencion), { centrado: true });
  escribir(celda(1, 6, 10), datos.kmProximaMantencion);
  escribir(celda(1, 7, 1), fechaCorta(datos.fechaControlLicencia), { centrado: true });
  escribir(celda(1, 7, 3), datos.kmInicio);
  escribir(celda(1, 8, 1), fechaCorta(datos.fechaExtintor), { centrado: true });
  escribir(celda(1, 8, 3), datos.kmFin);

  // ✓ / X de cada ítem y día.
  for (const item of TODOS_LOS_ITEMS) {
    const marcas = datos.marcas[item.id] ?? [];
    for (let dia = 0; dia < DIAS_CHECKLIST; dia++) marcar(celda(item.tabla, item.fila, item.col + dia), marcas[dia] ?? '');
  }

  // Aptitudes físicas y psicológicas (SI / NO por día).
  for (let dia = 0; dia < DIAS_CHECKLIST; dia++) {
    // Letra de 7 pt: "SI" / "NO" caben en la celda angosta sin partirse.
    escribir(celda(4, 2, 1 + dia), datos.aptitudes.alcohol[dia], { centrado: true, tamano: 14, angosta: true });
    escribir(celda(4, 2, 10 + dia), datos.aptitudes.medicamento[dia], { centrado: true, tamano: 14, angosta: true });
    escribir(celda(4, 3, 1 + dia), datos.aptitudes.aptitud[dia], { centrado: true, tamano: 14, angosta: true });
  }
  sobreLinea(celda(4, 3, 9), datos.medicamentoCual);
  sobreLinea(celda(4, 5, 0), datos.dpf);
  sobreLinea(celda(4, 6, 0), datos.limpiezaFiltro);

  // Firma y nombre del conductor de cada día.
  for (let dia = 0; dia < DIAS_CHECKLIST; dia++) escribir(celda(5, 1, 1 + dia), datos.firmas[dia], { centrado: true, tamano: 16 });

  // Observaciones: sobre la primera línea "____" que sigue al título.
  if (datos.observaciones.trim()) {
    const parrafos = hijos(body, 'p');
    const titulo = parrafos.findIndex(p => (p.textContent ?? '').includes('OBSERVACIONES'));
    const linea = parrafos.slice(titulo + 1).find(p => /_{5,}/.test(p.textContent ?? ''));
    if (linea) {
      const rPr = formatoBase(linea);
      for (const hijo of Array.from(linea.children)) if (hijo.localName !== 'pPr') linea.removeChild(hijo);
      datos.observaciones.trim().split('\n').forEach((renglon, i) => {
        if (i > 0) linea.appendChild(run(rPr.cloneNode(true) as Element, nuevo('br')));
        linea.appendChild(run(rPr.cloneNode(true) as Element, texto(renglon)));
      });
    }
  }

  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
  });
}

export const nombreArchivoChecklist = (datos: DatosChecklist) => {
  const [a, m, d] = fechasChecklist(datos.semanaInicio)[0].split('-');
  const patente = datos.patente.toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CAMIONETA';
  return `GSSO-LTE-R-LV-DSAL-29_Checklist_Camioneta_${patente}_${d}-${m}-${a}.docx`;
};
