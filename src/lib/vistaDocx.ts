// Ver un Word (.docx) dentro de la app, como un visor de PDF: cada hoja se dibuja con docx-preview.
// También sirve para sacar una imagen de cada hoja (ej: las 2 hojas del checklist para el Informe Diario).
// Las librerías se descargan solo cuando se usan.

/**
 * Dibuja el documento dentro de `contenedor` (una "hoja" blanca por página).
 * `comoWord`: ajustes extra para que la vista previa se corte igual que en Word (las imágenes del Informe Diario no los usan).
 */
export async function dibujarDocx(blob: Blob, contenedor: HTMLElement, opciones: { comoWord?: boolean } = {}): Promise<HTMLElement[]> {
  const { renderAsync } = await import('docx-preview');
  contenedor.innerHTML = '';
  await renderAsync(blob, contenedor, undefined, {
    className: 'docx',
    inWrapper: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    ignoreWidth: false,
    ignoreHeight: false,
    renderHeaders: true,
    renderFooters: true,
    useBase64URL: true, // imágenes como dataURL: así se pueden copiar a una imagen
    experimental: true,
  });
  const hojas = Array.from(contenedor.querySelectorAll<HTMLElement>('section.docx'));
  ajustarComoWord(contenedor, hojas);
  await aplicarSangriasTablas(blob, hojas).catch(() => undefined);
  if (opciones.comoWord) await aplicarSinSaltoDeLinea(blob, hojas).catch(() => undefined);
  hojas.forEach(separarImagenesDeTablas);
  return hojas;
}

/**
 * Los dibujos "flotantes" (ej: la camioneta en la hoja 2 del checklist) no ocupan lugar: si una tabla
 * que va después quedaría debajo de un dibujo, se baja lo justo para que no se tapen (como en Word).
 */
function separarImagenesDeTablas(hoja: HTMLElement) {
  const cuerpo = hoja.querySelector('article');
  if (!cuerpo) return;
  const flotantes = Array.from(cuerpo.querySelectorAll<HTMLElement>('p > div, p > span > div'))
    .filter(d => d.style.position === 'absolute' && d.querySelector('img'));
  if (!flotantes.length) return;
  const tablas = Array.from(cuerpo.querySelectorAll<HTMLTableElement>(':scope > table, :scope > div > table'));
  for (const tabla of tablas) {
    const arriba = tabla.getBoundingClientRect().top;
    const escala = tabla.getBoundingClientRect().height / (tabla.offsetHeight || 1) || 1;
    let abajo = -Infinity;
    for (const f of flotantes) {
      if (!(f.compareDocumentPosition(tabla) & Node.DOCUMENT_POSITION_FOLLOWING)) continue; // el dibujo va después
      for (const img of Array.from(f.querySelectorAll('img'))) abajo = Math.max(abajo, img.getBoundingClientRect().bottom);
    }
    if (abajo > arriba) {
      const actual = parseFloat(getComputedStyle(tabla).marginTop) || 0;
      tabla.style.marginTop = `${actual + (abajo - arriba) / escala + 6}px`;
    }
  }
}

/** Sangría (w:tblInd, en pt) de cada tabla de un XML de Word, en el orden en que aparecen. */
function sangrias(xml: string): number[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS('*', 'tbl')).map(tbl => {
    const pr = Array.from(tbl.children).find(c => c.localName === 'tblPr');
    const ind = pr && Array.from(pr.children).find(c => c.localName === 'tblInd');
    const w = ind ? Number(ind.getAttribute('w:w') ?? ind.getAttributeNS('*', 'w')) : 0;
    const tipo = ind?.getAttribute('w:type');
    return ind && (!tipo || tipo === 'dxa') && Number.isFinite(w) ? w / 20 : 0;
  });
}

/**
 * El visor no corre las tablas según su sangría (en Word algunas empiezan un poco antes del margen,
 * como la tabla grande del checklist). Se aplica igual que en el documento.
 */
async function aplicarSangriasTablas(blob: Blob, hojas: HTMLElement[]) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(blob);
  const cuerpo = sangrias(await zip.file('word/document.xml')?.async('string') ?? '');
  const nombreEncabezado = Object.keys(zip.files).filter(n => /^word\/header\d+\.xml$/.test(n)).sort()[0];
  const encabezado = nombreEncabezado ? sangrias(await zip.file(nombreEncabezado)!.async('string')) : [];
  const aplicar = (tablas: HTMLTableElement[], lista: number[]) => {
    if (tablas.length !== lista.length) return; // no calzan: mejor no mover nada
    tablas.forEach((t, i) => { if (lista[i]) t.style.marginLeft = `${lista[i]}pt`; });
  };
  aplicar(hojas.flatMap(h => Array.from(h.querySelectorAll<HTMLTableElement>('article table'))), cuerpo);
  hojas.forEach(h => h.querySelectorAll('header').forEach(enc => aplicar(Array.from(enc.querySelectorAll<HTMLTableElement>('table')), encabezado)));
}

/**
 * Las celdas que Word deja "sin saltos de línea" (ej: "Fecha última Mantención:") no se cortan en el documento,
 * pero el visor sí. Se marca cada celda igual que en el XML del Word (se omite si las tablas no calzan).
 */
async function aplicarSinSaltoDeLinea(blob: Blob, hojas: HTMLElement[]) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(blob);
  const xml = await zip.file('word/document.xml')?.async('string') ?? '';
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const hijos = (el: Element, nombre: string) => Array.from(el.children).filter(c => c.localName === nombre);
  const sinSalto = Array.from(doc.getElementsByTagNameNS('*', 'tbl')).map(tbl =>
    hijos(tbl, 'tr').map(tr => hijos(tr, 'tc').map(tc => hijos(tc, 'tcPr').some(pr => hijos(pr, 'noWrap').length > 0))),
  );
  const tablas = hojas.flatMap(h => Array.from(h.querySelectorAll<HTMLTableElement>('article table')));
  if (tablas.length !== sinSalto.length) return; // no calzan: mejor no tocar nada
  tablas.forEach((tabla, i) => {
    const filas = Array.from(tabla.rows);
    if (filas.length !== sinSalto[i].length) return;
    filas.forEach((tr, r) => {
      const celdas = Array.from(tr.cells);
      if (celdas.length !== sinSalto[i][r].length) return;
      celdas.forEach((td, c) => { if (sinSalto[i][r][c]) td.classList.add('sin-salto'); });
    });
  });
  // Solo queda en una línea si el texto cabe en su casilla; si es más largo, Word lo parte igual.
  hojas.forEach(h => h.querySelectorAll<HTMLTableCellElement>('td.sin-salto').forEach(td => {
    const caja = td.getBoundingClientRect();
    const escala = caja.width / (td.offsetWidth || 1) || 1;
    const rango = document.createRange();
    rango.selectNodeContents(td);
    const sale = Array.from(rango.getClientRects()).some(x => x.width > 0 && (x.right > caja.right + escala || x.left < caja.left - escala));
    if (sale) td.classList.remove('sin-salto');
  }));
}

/** Retoques para que la vista se parezca a lo que muestra Word. */
function ajustarComoWord(contenedor: HTMLElement, hojas: HTMLElement[]) {
  // Interlineado "sencillo" de Word (la app usa 1.5 en todo el texto).
  contenedor.style.lineHeight = 'normal';
  // Letra por defecto de Word (10 pt) para el texto que no indica tamaño (la app usa 16 px).
  contenedor.style.fontSize = '10pt';
  // Tablas con el ancho exacto de sus columnas (como Word): el texto se corta en líneas igual que en
  // el documento y la tabla no se sale de la hoja.
  contenedor.querySelectorAll<HTMLTableElement>('table').forEach(tabla => {
    const cols = Array.from(tabla.querySelectorAll<HTMLElement>(':scope > colgroup > col'));
    const anchos = cols.map(c => parseFloat(c.style.width)).filter(n => n > 0);
    if (!anchos.length || anchos.length !== cols.length) return;
    tabla.style.tableLayout = 'fixed';
    tabla.style.width = `${anchos.reduce((a, b) => a + b, 0)}pt`;
  });
  // Hoja tamaño real (carta, oficio…): el mismo formato del documento.
  hojas.forEach(hoja => {
    const minimo = hoja.style.minHeight;
    if (!minimo) return;
    hoja.style.height = minimo;
    hoja.style.overflow = 'hidden';
    // Encabezado, contenido y pie no se achican para caber (la hoja es "flex" en columna).
    Array.from(hoja.children).forEach(h => { (h as HTMLElement).style.flexShrink = '0'; });
  });
  // Las imágenes ancladas van dentro de un recuadro de ancho 0: el "max-width: 100%" de la app las ocultaba.
  contenedor.querySelectorAll('img').forEach(img => { img.style.maxWidth = 'none'; });
  // Imágenes "flotantes" (logo, dibujos de la camioneta): se ubican desde el borde del párrafo, como en
  // Word, y no según la alineación del texto (centrado las corría hacia el lado).
  contenedor.querySelectorAll<HTMLElement>('p > div, p > span > div').forEach(caja => {
    const st = caja.style;
    if (st.width !== '0px' || st.height !== '0px' || st.position !== 'relative') return;
    const p = caja.closest('p');
    if (!p) return;
    p.style.position = 'relative';
    st.position = 'absolute';
  });
  // Imágenes recortadas en Word (ej: la camioneta de frente / de atrás, que son la mitad de una foto):
  // se muestra solo la parte elegida, en su lugar y tamaño.
  contenedor.querySelectorAll<HTMLImageElement>('img').forEach(img => {
    const st = img.style;
    const clip = /rect\(\s*([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)%\s+([-\d.]+)%\s*\)/.exec(st.clipPath);
    const escala = /scale\(\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/.exec(st.transform);
    const caja = img.parentElement;
    if (!clip || !escala || !caja) return;
    const ancho = parseFloat(st.width); const alto = parseFloat(st.height);
    const sx = parseFloat(escala[1]); const sy = parseFloat(escala[2]);
    const arriba = Math.max(0, parseFloat(clip[1]) / 100); const izquierda = Math.max(0, parseFloat(clip[4]) / 100);
    Object.assign(st, {
      clipPath: 'none', transform: 'none', left: '0', top: '0', maxWidth: 'none',
      width: `${ancho * sx}pt`, height: `${alto * sy}pt`, marginLeft: `${-izquierda * ancho * sx}pt`, marginTop: `${-arriba * alto * sy}pt`,
    });
    Object.assign(caja.style, { width: `${ancho}pt`, height: `${alto}pt`, overflow: 'hidden' });
  });
  // Alto de cada línea según la letra del texto (no la letra por defecto de la página, más grande).
  contenedor.querySelectorAll<HTMLElement>('p').forEach(p => {
    let menor = Infinity;
    p.querySelectorAll('span').forEach(s => {
      if (!s.textContent) return;
      const t = parseFloat(getComputedStyle(s).fontSize);
      if (t && t < menor) menor = t;
    });
    if (menor !== Infinity) p.style.fontSize = `${menor}px`;
  });
  // Párrafos vacíos dentro de una tabla: Word les da el alto de la letra de la fila, no uno mayor.
  contenedor.querySelectorAll<HTMLElement>('td p').forEach(p => {
    if (p.style.fontSize || p.textContent) return;
    const fila = p.closest('tr');
    const tamanos = Array.from(fila?.querySelectorAll<HTMLElement>('p') ?? []).map(x => parseFloat(x.style.fontSize)).filter(n => n > 0);
    if (tamanos.length) p.style.fontSize = `${Math.min(...tamanos)}px`;
  });
  // Símbolos Webdings (el ✓ del registro): los navegadores no traen esa fuente.
  const WEBDINGS: Record<string, string> = { '': '✓', a: '✓', '': '✗', r: '✗' };
  contenedor.querySelectorAll<HTMLElement>('span').forEach(s => {
    if (!/webdings/i.test(s.style.fontFamily)) return;
    const t = s.textContent ?? '';
    if (WEBDINGS[t]) { s.textContent = WEBDINGS[t]; s.style.fontFamily = 'Segoe UI Symbol, DejaVu Sans, sans-serif'; }
  });
  // Checklist de camioneta: los símbolos de la leyenda (Raya = línea, Picadura = círculo con X) son
  // formas de Word que el visor no dibuja; se ponen junto a su etiqueta, como en el documento.
  const SIMBOLOS: Record<string, { w: string; h: string; dibujo: string }> = {
    'Raya:': { w: '19.5pt', h: '2.25pt', dibujo: '<rect x="0" y="0" width="20" height="20" fill="#000"/>' },
    'Picadura:': { w: '8.75pt', h: '10pt', dibujo: '<ellipse cx="10" cy="10" rx="9.3" ry="9.3" fill="#fff" stroke="#000" stroke-width="1.6" vector-effect="non-scaling-stroke"/><path d="M3.4 3.4 16.6 16.6M3.4 16.6 16.6 3.4" stroke="#000" stroke-width="1.6" vector-effect="non-scaling-stroke"/>' },
  };
  contenedor.querySelectorAll<HTMLElement>('p').forEach(p => {
    const t = p.textContent ?? '';
    if (!t.includes('Raya:') || !t.includes('Picadura:') || p.dataset.leyenda) return;
    p.dataset.leyenda = '1';
    const textos: Text[] = [];
    const caminante = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    for (let n = caminante.nextNode(); n; n = caminante.nextNode()) textos.push(n as Text);
    while (textos.length) {
      const nodo = textos.shift()!;
      for (const [etiqueta, sim] of Object.entries(SIMBOLOS)) {
        const pos = nodo.textContent?.indexOf(etiqueta) ?? -1;
        if (pos < 0) continue;
        const resto = nodo.splitText(pos + etiqueta.length);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 20 20');
        svg.setAttribute('preserveAspectRatio', 'none');
        Object.assign(svg.style, { display: 'inline-block', width: sim.w, height: sim.h, margin: '0 4pt 0 8pt', verticalAlign: 'middle', overflow: 'visible' });
        svg.innerHTML = sim.dibujo;
        resto.parentNode?.insertBefore(svg, resto);
        textos.unshift(resto); // el resto del texto puede traer la otra etiqueta
        break;
      }
    }
  });
  // "Página X de Y" del encabezado: el número real de cada hoja.
  hojas.forEach((hoja, i) => {
    hoja.querySelectorAll('header').forEach(enc => {
      enc.querySelectorAll('p').forEach(p => {
        if (!/P[aá]gina:?\s*\d+\s*de\s*\d+/i.test(p.textContent ?? '')) return;
        const numeros: Text[] = [];
        const caminante = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = caminante.nextNode(); n; n = caminante.nextNode()) if (/^\s*\d+\s*$/.test(n.textContent ?? '')) numeros.push(n as Text);
        if (numeros.length >= 2) {
          numeros[0].textContent = String(i + 1);
          numeros[numeros.length - 1].textContent = String(hojas.length);
        }
      });
    });
  });
}

/**
 * Imagen JPEG de cada hoja del documento (dataURL). Se dibuja fuera de la vista y se "fotografía"
 * cada hoja a buena resolución.
 */
export async function hojasDocxComoImagenes(blob: Blob, escala = 2): Promise<string[]> {
  const { toJpeg } = await import('html-to-image');
  const contenedor = document.createElement('div');
  contenedor.setAttribute('aria-hidden', 'true');
  Object.assign(contenedor.style, { position: 'fixed', left: '-10000px', top: '0', width: '1200px', background: '#fff', zIndex: '-1' });
  document.body.appendChild(contenedor);
  try {
    const hojas = await dibujarDocx(blob, contenedor);
    // Espera a que las imágenes del documento (logos, dibujos de la camioneta, firmas) terminen de cargar.
    await Promise.all(Array.from(contenedor.querySelectorAll('img')).map(img => (img.complete ? Promise.resolve() : new Promise(r => { img.onload = img.onerror = () => r(null); }))));
    const imagenes: string[] = [];
    for (const hoja of hojas) {
      imagenes.push(await toJpeg(hoja, { quality: 0.9, pixelRatio: escala, skipFonts: true, backgroundColor: '#ffffff', style: { margin: '0', boxShadow: 'none' } }));
    }
    return imagenes;
  } finally {
    contenedor.remove();
  }
}
