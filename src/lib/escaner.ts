// Escáner de documentos: detecta los bordes de la hoja, corrige la perspectiva y deja la imagen
// con aspecto de documento escaneado (fondo blanco parejo, sin sombras, texto nítido).
// Usa OpenCV (se descarga solo la primera vez que se escanea; después queda guardado en el equipo).

export interface Punto { x: number; y: number }
/** Esquinas de la hoja en coordenadas de la imagen: arriba-izq, arriba-der, abajo-der, abajo-izq. */
export type Esquinas = [Punto, Punto, Punto, Punto];
export type FiltroEscaneo = 'documento' | 'color' | 'original';

// OpenCV.js no trae tipos útiles: se usa sin tipar en este archivo.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cv = any;

let cvPromesa: Promise<Cv> | null = null;

/** Carga OpenCV una sola vez (≈ 10 MB la primera vez). */
export function cargarOpenCv(): Promise<Cv> {
  if (!cvPromesa) {
    cvPromesa = (async () => {
      const modulo = await import('@techstark/opencv-js');
      const exportado = (modulo as unknown as { default?: unknown }).default ?? modulo;
      let cv: Cv = await (exportado as Promise<Cv>);
      if (!cv.Mat) {
        // Algunas versiones avisan cuando terminan de inicializarse.
        cv = await new Promise<Cv>(resolve => { cv.onRuntimeInitialized = () => resolve(cv); });
      }
      return cv;
    })();
    cvPromesa.catch(() => { cvPromesa = null; });
  }
  return cvPromesa;
}

export function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo leer la imagen'));
    img.src = src;
  });
}

/** Lienzo con la imagen, achicada si es muy grande (el procesamiento es más rápido y la calidad sobra). */
export function lienzoDesdeImagen(img: HTMLImageElement, ladoMaximo = 2000): HTMLCanvasElement {
  const escala = Math.min(1, ladoMaximo / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = nuevoLienzo(img.naturalWidth * escala, img.naturalHeight * escala);
  contexto(canvas).drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Ordena 4 puntos como arriba-izq, arriba-der, abajo-der, abajo-izq. */
function ordenar(puntos: Punto[]): Esquinas {
  const suma = (p: Punto) => p.x + p.y;
  const resta = (p: Punto) => p.x - p.y;
  const tl = puntos.reduce((a, b) => (suma(a) < suma(b) ? a : b));
  const br = puntos.reduce((a, b) => (suma(a) > suma(b) ? a : b));
  const tr = puntos.reduce((a, b) => (resta(a) > resta(b) ? a : b));
  const bl = puntos.reduce((a, b) => (resta(a) < resta(b) ? a : b));
  return [tl, tr, br, bl];
}

/** Esquinas por defecto cuando no se detecta la hoja: un margen del 5 %. */
export function esquinasPorDefecto(ancho: number, alto: number): Esquinas {
  const mx = ancho * 0.05; const my = alto * 0.05;
  return [{ x: mx, y: my }, { x: ancho - mx, y: my }, { x: ancho - mx, y: alto - my }, { x: mx, y: alto - my }];
}

/** Busca el contorno de la hoja (el cuadrilátero más grande). null si no lo encuentra. */
export async function detectarHoja(canvas: HTMLCanvasElement): Promise<Esquinas | null> {
  const cv = await cargarOpenCv();
  // Se trabaja en una copia chica: más rápido y menos ruido.
  // (Se achica con el lienzo antes de pasarla a OpenCV: en iOS su memoria es muy limitada.)
  const escala = Math.min(1, 800 / Math.max(canvas.width, canvas.height));
  const reducido = nuevoLienzo(canvas.width * escala, canvas.height * escala);
  const rctx = contexto(reducido);
  rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(canvas, 0, 0, reducido.width, reducido.height);
  const src = cv.imread(reducido);
  liberarLienzo(reducido);
  const chica = src.clone();
  const gris = new cv.Mat(); const borroso = new cv.Mat(); const bordes = new cv.Mat(); const umbral = new cv.Mat();
  const contornos = new cv.MatVector(); const jerarquia = new cv.Mat();
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  let mejor: Punto[] | null = null;
  let mejorArea = 0;
  const minimo = chica.cols * chica.rows * 0.12;
  const revisar = (imagen: Cv, modo: number) => {
    cv.findContours(imagen, contornos, jerarquia, modo, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < contornos.size(); i++) {
      const c = contornos.get(i);
      const perimetro = cv.arcLength(c, true);
      const aprox = new cv.Mat();
      cv.approxPolyDP(c, aprox, 0.02 * perimetro, true);
      const area = Math.abs(cv.contourArea(aprox));
      if (aprox.rows === 4 && area > mejorArea && area > minimo && cv.isContourConvex(aprox)) {
        const d = aprox.data32S;
        mejor = [0, 1, 2, 3].map(k => ({ x: d[k * 2] / escala, y: d[k * 2 + 1] / escala }));
        mejorArea = area;
      }
      aprox.delete(); c.delete();
    }
  };
  try {
    cv.cvtColor(chica, gris, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gris, borroso, new cv.Size(5, 5), 0);
    cv.Canny(borroso, bordes, 50, 150);
    cv.dilate(bordes, bordes, kernel); // une bordes cortados
    revisar(bordes, cv.RETR_LIST);
    if (!mejor) {
      cv.threshold(borroso, umbral, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
      revisar(umbral, cv.RETR_EXTERNAL);
    }
  } finally {
    [src, chica, gris, borroso, bordes, umbral, contornos, jerarquia, kernel].forEach(m => m.delete());
  }
  if (!mejor) return null;
  // Se corre cada esquina un poco hacia adentro (1,2 %) para no arrastrar el borde de la mesa al recorte.
  const puntos = mejor as Punto[];
  const cx = puntos.reduce((n, p) => n + p.x, 0) / 4;
  const cy = puntos.reduce((n, p) => n + p.y, 0) / 4;
  return ordenar(puntos.map(p => ({ x: p.x + (cx - p.x) * 0.012, y: p.y + (cy - p.y) * 0.012 })));
}

// --- Utilidades de lienzo ------------------------------------------------------------------------
// En iOS (Safari) hay un tope de memoria para lienzos y para OpenCV (WebAssembly). Por eso el
// enderezado y el filtro se hacen en JavaScript puro, y los lienzos que ya no se usan se liberan.

function contexto(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no entregó memoria para la imagen');
  return ctx;
}

function nuevoLienzo(ancho: number, alto: number): HTMLCanvasElement {
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(1, Math.round(ancho));
  lienzo.height = Math.max(1, Math.round(alto));
  return lienzo;
}

/** Libera la memoria de un lienzo (clave en iOS, donde se acumula hasta fallar). */
export function liberarLienzo(canvas: HTMLCanvasElement | null | undefined) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

/** Resuelve A·x = b (8×8) por eliminación de Gauss con pivoteo. */
function resolver(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((fila, i) => [...fila, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let f = c + 1; f < n; f++) if (Math.abs(m[f][c]) > Math.abs(m[piv][c])) piv = f;
    [m[c], m[piv]] = [m[piv], m[c]];
    if (Math.abs(m[c][c]) < 1e-12) throw new Error('Esquinas inválidas');
    for (let f = 0; f < n; f++) {
      if (f === c) continue;
      const k = m[f][c] / m[c][c];
      for (let j = c; j <= n; j++) m[f][j] -= k * m[c][j];
    }
  }
  return m.map((fila, i) => fila[n] / fila[i]);
}

/** Homografía que lleva los puntos "desde" a los puntos "hacia". */
function homografia(desde: Punto[], hacia: Punto[]): number[] {
  const a: number[][] = []; const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = desde[i]; const { x: u, y: v } = hacia[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  return [...resolver(a, b), 1];
}

/** Endereza la hoja: devuelve un lienzo con solo el documento, visto de frente. */
export async function enderezar(canvas: HTMLCanvasElement, esquinas: Esquinas): Promise<HTMLCanvasElement> {
  const [tl, tr, br, bl] = esquinas;
  const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
  let ancho = Math.max(dist(tl, tr), dist(bl, br));
  let alto = Math.max(dist(tl, bl), dist(tr, br));
  // Tope de tamaño: suficiente para leer bien en el Word y liviano para el teléfono.
  const tope = Math.min(1, 2000 / Math.max(ancho, alto));
  ancho = Math.max(1, Math.round(ancho * tope));
  alto = Math.max(1, Math.round(alto * tope));

  // Se mapea cada píxel del resultado a la foto original (bilineal).
  const h = homografia([{ x: 0, y: 0 }, { x: ancho, y: 0 }, { x: ancho, y: alto }, { x: 0, y: alto }], esquinas);
  const sw = canvas.width; const sh = canvas.height;
  const origen = contexto(canvas).getImageData(0, 0, sw, sh).data;
  const salida = nuevoLienzo(ancho, alto);
  const ctx = contexto(salida);
  const imagen = ctx.createImageData(ancho, alto);
  const d = imagen.data;
  let o = 0;
  for (let v = 0; v < alto; v++) {
    const vy = v + 0.5;
    for (let u = 0; u < ancho; u++) {
      const ux = u + 0.5;
      const w = h[6] * ux + h[7] * vy + 1;
      let x = (h[0] * ux + h[1] * vy + h[2]) / w - 0.5;
      let y = (h[3] * ux + h[4] * vy + h[5]) / w - 0.5;
      if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1;
      if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1;
      const x0 = x | 0; const y0 = y | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0; const y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = x - x0; const fy = y - y0;
      const p00 = (y0 * sw + x0) * 4; const p10 = (y0 * sw + x1) * 4;
      const p01 = (y1 * sw + x0) * 4; const p11 = (y1 * sw + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const arriba = origen[p00 + c] + (origen[p10 + c] - origen[p00 + c]) * fx;
        const abajo = origen[p01 + c] + (origen[p11 + c] - origen[p01 + c]) * fx;
        d[o + c] = arriba + (abajo - arriba) * fy;
      }
      d[o + 3] = 255;
      o += 4;
    }
  }
  ctx.putImageData(imagen, 0, 0);
  return salida;
}

/** Máximo (dilatación) separable con ventana 2r+1, sobre un plano de ancho×alto. */
function maximo(plano: Float32Array, ancho: number, alto: number, r: number): Float32Array {
  const tmp = new Float32Array(plano.length); const out = new Float32Array(plano.length);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let m = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(ancho - 1, x + r); k++) { const val = plano[y * ancho + k]; if (val > m) m = val; }
    tmp[y * ancho + x] = m;
  }
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let m = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(alto - 1, y + r); k++) { const val = tmp[k * ancho + x]; if (val > m) m = val; }
    out[y * ancho + x] = m;
  }
  return out;
}

/** Promedio (desenfoque de caja) separable con ventana 2r+1. */
function caja(plano: Float32Array, ancho: number, alto: number, r: number): Float32Array {
  const tmp = new Float32Array(plano.length); const out = new Float32Array(plano.length);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let s = 0; let n = 0;
    for (let k = Math.max(0, x - r); k <= Math.min(ancho - 1, x + r); k++) { s += plano[y * ancho + k]; n++; }
    tmp[y * ancho + x] = s / n;
  }
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    let s = 0; let n = 0;
    for (let k = Math.max(0, y - r); k <= Math.min(alto - 1, y + r); k++) { s += tmp[k * ancho + x]; n++; }
    out[y * ancho + x] = s / n;
  }
  return out;
}

/**
 * Aspecto de escaneo: estima el fondo (papel + sombras) en una copia chica, lo "divide" para dejar
 * el papel blanco parejo y sube el contraste del texto.
 *  - documento: blanco y negro (tonos de gris), como un escáner de oficina.
 *  - color: mismo blanqueo pero conservando colores (timbres, firmas en azul, formularios de color).
 */
export async function aplicarFiltro(canvas: HTMLCanvasElement, filtro: FiltroEscaneo): Promise<HTMLCanvasElement> {
  if (filtro === 'original') return canvas;
  const ancho = canvas.width; const alto = canvas.height;
  const pixeles = contexto(canvas).getImageData(0, 0, ancho, alto);
  const d = pixeles.data;
  const gris = filtro === 'documento';

  // Copia chica para estimar el fondo del papel.
  const escala = Math.min(1, 500 / Math.max(ancho, alto));
  const cw = Math.max(1, Math.round(ancho * escala)); const ch = Math.max(1, Math.round(alto * escala));
  const chico = nuevoLienzo(cw, ch);
  const cctx = contexto(chico);
  cctx.drawImage(canvas, 0, 0, cw, ch);
  const cd = cctx.getImageData(0, 0, cw, ch).data;
  const canales = gris ? 1 : 3;
  const fondos: Float32Array[] = [];
  for (let c = 0; c < canales; c++) {
    const plano = new Float32Array(cw * ch);
    for (let i = 0; i < cw * ch; i++) {
      const p = i * 4;
      plano[i] = gris ? 0.299 * cd[p] + 0.587 * cd[p + 1] + 0.114 * cd[p + 2] : cd[p + c];
    }
    // Borra el texto (máximo) y suaviza sombras y luz despareja (dos pasadas de caja).
    fondos.push(caja(caja(maximo(plano, cw, ch, 3), cw, ch, 10), cw, ch, 10));
  }
  liberarLienzo(chico);

  const ganancia = gris ? 1.35 : 1.15; const desplazamiento = gris ? -70 : -25;
  const sx = (cw - 1) / Math.max(1, ancho - 1); const sy = (ch - 1) / Math.max(1, alto - 1);
  for (let y = 0; y < alto; y++) {
    const fy = y * sy; const y0 = fy | 0; const y1 = Math.min(ch - 1, y0 + 1); const ty = fy - y0;
    for (let x = 0; x < ancho; x++) {
      const fx = x * sx; const x0 = fx | 0; const x1 = Math.min(cw - 1, x0 + 1); const tx = fx - x0;
      const p = (y * ancho + x) * 4;
      const lum = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      for (let c = 0; c < 3; c++) {
        const f = fondos[gris ? 0 : c];
        const a = f[y0 * cw + x0] + (f[y0 * cw + x1] - f[y0 * cw + x0]) * tx;
        const b = f[y1 * cw + x0] + (f[y1 * cw + x1] - f[y1 * cw + x0]) * tx;
        const fondo = Math.max(1, a + (b - a) * ty);
        const valor = gris ? lum : d[p + c];
        const limpio = Math.min(255, (valor * 255) / fondo);
        d[p + c] = limpio * ganancia + desplazamiento; // Uint8Clamped recorta a 0–255
      }
    }
  }
  const salida = nuevoLienzo(ancho, alto);
  contexto(salida).putImageData(pixeles, 0, 0);
  return salida;
}

/** Gira el lienzo 90° a la derecha. */
export function rotar90(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const lienzo = nuevoLienzo(canvas.height, canvas.width);
  const ctx = contexto(lienzo);
  ctx.translate(lienzo.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);
  return lienzo;
}

/** JPEG final del documento (máx. 1800 px por lado: se lee bien en el Word sin pesar demasiado). */
export function aJpeg(canvas: HTMLCanvasElement, ladoMaximo = 1800, calidad = 0.85): string {
  const escala = Math.min(1, ladoMaximo / Math.max(canvas.width, canvas.height));
  if (escala === 1) return canvas.toDataURL('image/jpeg', calidad);
  const lienzo = nuevoLienzo(canvas.width * escala, canvas.height * escala);
  const ctx = contexto(lienzo);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, lienzo.width, lienzo.height);
  const url = lienzo.toDataURL('image/jpeg', calidad);
  liberarLienzo(lienzo);
  return url;
}

/**
 * Endereza sola una foto de documento (sin filtro): si encuentra la hoja la recorta y la pone de
 * frente; si no, devuelve la foto tal cual. Se usa al cargar fotos del bloque Vertiv.
 */
export async function enderezarAutomatico(dataUrl: string): Promise<string> {
  try {
    const lienzo = lienzoDesdeImagen(await cargarImagen(dataUrl));
    const esquinas = await detectarHoja(lienzo);
    if (!esquinas) { liberarLienzo(lienzo); return dataUrl; }
    const recto = await enderezar(lienzo, esquinas);
    liberarLienzo(lienzo);
    const url = recto.toDataURL('image/jpeg', 0.92);
    liberarLienzo(recto);
    return url;
  } catch {
    return dataUrl;
  }
}
