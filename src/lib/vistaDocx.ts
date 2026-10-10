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
  // Símbolos Webdings (el ✓ del registro): los navegadores no traen esa fuente.
  const WEBDINGS: Record<string, string> = { '': '✓', a: '✓', '': '✗', r: '✗' };
  contenedor.querySelectorAll<HTMLElement>('span').forEach(s => {
    if (!/webdings/i.test(s.style.fontFamily)) return;
    const t = s.textContent ?? '';
    if (WEBDINGS[t]) { s.textContent = WEBDINGS[t]; s.style.fontFamily = 'Segoe UI Symbol, DejaVu Sans, sans-serif'; }
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
