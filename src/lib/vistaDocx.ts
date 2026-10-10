// Ver un Word (.docx) dentro de la app, como un visor de PDF: cada hoja se dibuja con docx-preview.
// También sirve para sacar una imagen de cada hoja (ej: las 2 hojas del checklist para el Informe Diario).
// Las librerías se descargan solo cuando se usan.

/** Dibuja el documento dentro de `contenedor` (una "hoja" blanca por página). */
export async function dibujarDocx(blob: Blob, contenedor: HTMLElement): Promise<HTMLElement[]> {
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
  return hojas;
}

/** Retoques para que la vista se parezca a lo que muestra Word. */
function ajustarComoWord(contenedor: HTMLElement, hojas: HTMLElement[]) {
  // Interlineado "sencillo" de Word (la app usa 1.5 en todo el texto).
  contenedor.style.lineHeight = 'normal';
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
