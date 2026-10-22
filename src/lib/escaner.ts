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

// --- Detección de la hoja ---------------------------------------------------------------------
// Se prueban varias formas de encontrar la hoja y se queda con la mejor:
//  1. Por color: la hoja es la zona clara y sin color más grande (funciona muy bien sobre mesas de
//     madera, ropa o fondos oscuros, aunque los bordes estén poco nítidos o la hoja esté curvada).
//  2. Por bordes (Canny) con umbrales que se ajustan a la luz de la foto.
//  3. Por brillo (Otsu), como respaldo.
// En los tres casos las esquinas se calculan cruzando las rectas de los 4 lados (ajustadas con todos
// los puntos de cada lado), así calzan aunque la hoja tenga una punta doblada o las esquinas redondas.

type Candidato = { esquinas: Punto[]; area: number; relleno: number; metodo: number };

/** Puntos de un contorno de OpenCV como arreglo. */
function puntosDe(contorno: Cv): Punto[] {
  const d = contorno.data32S as Int32Array;
  const r: Punto[] = [];
  for (let i = 0; i < d.length; i += 2) r.push({ x: d[i], y: d[i + 1] });
  return r;
}

const areaPoligono = (p: Punto[]) => Math.abs(p.reduce((n, a, i) => { const b = p[(i + 1) % p.length]; return n + a.x * b.y - b.x * a.y; }, 0)) / 2;

/** Recta que mejor pasa por los puntos (centro + dirección, por componentes principales). */
function ajustarRecta(pts: Punto[]): { c: Punto; d: Punto } | null {
  if (pts.length < 2) return null;
  const cx = pts.reduce((n, p) => n + p.x, 0) / pts.length;
  const cy = pts.reduce((n, p) => n + p.y, 0) / pts.length;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - cx, dy = p.y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { c: { x: cx, y: cy }, d: { x: Math.cos(ang), y: Math.sin(ang) } };
}

function cruce(a: { c: Punto; d: Punto }, b: { c: Punto; d: Punto }): Punto | null {
  const det = a.d.x * b.d.y - a.d.y * b.d.x;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.c.x - a.c.x) * b.d.y - (b.c.y - a.c.y) * b.d.x) / det;
  return { x: a.c.x + t * a.d.x, y: a.c.y + t * a.d.y };
}

/** Distancia de p al segmento a–b. */
function distSegmento(p: Punto, a: Punto, b: Punto): number {
  const vx = b.x - a.x, vy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * Cuadrilátero de un contorno: se aproxima a 4 vértices (con tolerancia creciente) y después cada
 * lado se reajusta con los puntos del contorno que caen sobre él; las esquinas son los cruces.
 */
function cuadrilatero(cv: Cv, contorno: Cv): Punto[] | null {
  const casco = new cv.Mat();
  const aprox = new cv.Mat();
  try {
    cv.convexHull(contorno, casco, false, true);
    const perimetro = cv.arcLength(casco, true);
    let vertices: Punto[] | null = null;
    for (let eps = 0.01; eps <= 0.1 && !vertices; eps += 0.01) {
      cv.approxPolyDP(casco, aprox, eps * perimetro, true);
      if (aprox.rows === 4) vertices = puntosDe(aprox);
    }
    const pts = puntosDe(contorno);
    if (!vertices) {
      // Sin 4 vértices claros: los puntos extremos en las 4 diagonales.
      vertices = ordenar(puntosDe(casco));
    }
    vertices = ordenar(vertices);
    // Reajuste de los lados: puntos del contorno cerca de cada lado, sin los extremos (las esquinas
    // pueden estar dobladas o redondeadas).
    const diag = Math.hypot(...[vertices[2].x - vertices[0].x, vertices[2].y - vertices[0].y]);
    const tol = Math.max(3, diag * 0.025);
    const rectas = [0, 1, 2, 3].map(i => {
      const a = vertices![i], b = vertices![(i + 1) % 4];
      const largo = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const lado = pts.filter(p => {
        if (distSegmento(p, a, b) > tol) return false;
        const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / (largo * largo);
        return t > 0.12 && t < 0.88;
      });
      let recta = lado.length >= 6 ? ajustarRecta(lado) : ajustarRecta([a, b]);
      // Segunda pasada: solo los puntos que de verdad están sobre la recta (deja fuera puntas dobladas).
      if (recta && lado.length >= 6) {
        const r0 = recta;
        const cerca = lado.filter(p => Math.abs((p.x - r0.c.x) * r0.d.y - (p.y - r0.c.y) * r0.d.x) < tol / 3);
        if (cerca.length >= Math.max(6, lado.length * 0.4)) recta = ajustarRecta(cerca);
      }
      return recta;
    });
    const esquinas = [0, 1, 2, 3].map(i => cruce(rectas[(i + 3) % 4]!, rectas[i]!));
    if (esquinas.some(e => !e)) return vertices;
    const finales = esquinas as Punto[];
    // Si el reajuste se fue lejos (lados casi paralelos, ruido), se usan los vértices aproximados.
    const lejos = finales.some((e, i) => Math.hypot(e.x - vertices![i].x, e.y - vertices![i].y) > diag * 0.12);
    return ordenar(lejos ? vertices : finales);
  } finally {
    casco.delete(); aprox.delete();
  }
}

/** ¿Tiene forma de hoja? Convexo y con ángulos razonables (vista en perspectiva incluida). */
function esHojaValida(q: Punto[], ancho: number, alto: number): boolean {
  const area = areaPoligono(q);
  if (area < ancho * alto * 0.12 || area > ancho * alto * 0.985) return false;
  let signo = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const v1 = { x: a.x - b.x, y: a.y - b.y }, v2 = { x: c.x - b.x, y: c.y - b.y };
    const cruz = v1.x * v2.y - v1.y * v2.x;
    if (signo && Math.sign(cruz) !== signo) return false;
    signo = Math.sign(cruz);
    const ang = Math.acos(Math.max(-1, Math.min(1, (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y)) || 1)))) * 180 / Math.PI;
    if (ang < 45 || ang > 135) return false;
  }
  // Es el marco de la foto (no la hoja) si 3 o más esquinas están pegadas a las esquinas de la imagen.
  const cerca = Math.max(ancho, alto) * 0.04;
  const marco = [{ x: 0, y: 0 }, { x: ancho, y: 0 }, { x: ancho, y: alto }, { x: 0, y: alto }];
  if (q.filter((p, i) => Math.hypot(p.x - marco[i].x, p.y - marco[i].y) < cerca).length >= 3) return false;
  // Las esquinas pueden salir un poco del cuadro (hoja cortada), pero no mucho.
  const margen = Math.max(ancho, alto) * 0.08;
  return q.every(p => p.x > -margen && p.y > -margen && p.x < ancho + margen && p.y < alto + margen);
}

/**
 * Busca la hoja en la imagen. null si no la encuentra.
 * @param ladoMaximo tamaño de la copia en que se busca: 800 para una foto; ~360 en la vista en vivo
 *   de la cámara (se repite varias veces por segundo y tiene que ser liviano).
 */
export async function detectarHoja(canvas: HTMLCanvasElement | HTMLVideoElement, ladoMaximo = 800): Promise<Esquinas | null> {
  const cv = await cargarOpenCv();
  const anchoOrigen = canvas instanceof HTMLVideoElement ? canvas.videoWidth : canvas.width;
  const altoOrigen = canvas instanceof HTMLVideoElement ? canvas.videoHeight : canvas.height;
  if (!anchoOrigen || !altoOrigen) return null;
  // Se trabaja en una copia chica: más rápido y menos ruido (la textura de la mesa se pierde).
  // (Se achica con el lienzo antes de pasarla a OpenCV: en iOS su memoria es muy limitada.)
  const escala = Math.min(1, ladoMaximo / Math.max(anchoOrigen, altoOrigen));
  const reducido = nuevoLienzo(anchoOrigen * escala, altoOrigen * escala);
  const rctx = contexto(reducido);
  rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(canvas, 0, 0, reducido.width, reducido.height);
  const src = cv.imread(reducido);
  liberarLienzo(reducido);
  const W = src.cols, H = src.rows;
  const areaTotal = W * H;
  const lado = Math.max(W, H);
  const impar = (n: number) => Math.max(3, Math.round(n) | 1);

  const mats: Cv[] = [src];
  const mat = () => { const m = new cv.Mat(); mats.push(m); return m; };
  const candidatos: Candidato[] = [];
  const contornos = new cv.MatVector(); const jerarquia = mat();

  /** Revisa los contornos de una máscara binaria y agrega el mejor cuadrilátero. */
  const revisar = (binaria: Cv, modo: number, metodo: number) => {
    cv.findContours(binaria, contornos, jerarquia, modo, cv.CHAIN_APPROX_NONE);
    // Los contornos más grandes primero (la hoja suele ser el más grande con forma de hoja).
    const lista: { i: number; area: number }[] = [];
    for (let i = 0; i < contornos.size(); i++) {
      const c = contornos.get(i);
      const area = Math.abs(cv.contourArea(c));
      if (area > areaTotal * 0.1) lista.push({ i, area });
      c.delete();
    }
    lista.sort((a, b) => b.area - a.area);
    for (const { i, area } of lista.slice(0, 4)) {
      const c = contornos.get(i);
      try {
        const q = cuadrilatero(cv, c);
        if (q && esHojaValida(q, W, H)) {
          const aq = areaPoligono(q);
          candidatos.push({ esquinas: q, area: aq, relleno: Math.min(area, aq) / Math.max(area, aq), metodo });
        }
      } finally { c.delete(); }
    }
  };

  try {
    const rgb = mat(); cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const gris = mat(); cv.cvtColor(rgb, gris, cv.COLOR_RGB2GRAY);

    // 1. Por color: claro y sin color (V alto, S bajo) → "puntaje de papel" = V − S.
    const hsv = mat(); cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    const canales = new cv.MatVector(); cv.split(hsv, canales);
    const s = canales.get(1), v = canales.get(2);
    const papel = mat(); cv.subtract(v, s, papel);
    s.delete(); v.delete(); canales.delete();
    cv.GaussianBlur(papel, papel, new cv.Size(impar(lado / 120), impar(lado / 120)), 0);
    const mascara = mat(); cv.threshold(papel, mascara, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    // Cierra el texto y las líneas impresas (la hoja queda "llena") y borra vetas sueltas de la mesa.
    const kCerrar = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(impar(lado / 40), impar(lado / 40))); mats.push(kCerrar);
    const kAbrir = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(impar(lado / 80), impar(lado / 80))); mats.push(kAbrir);
    cv.morphologyEx(mascara, mascara, cv.MORPH_CLOSE, kCerrar);
    cv.morphologyEx(mascara, mascara, cv.MORPH_OPEN, kAbrir);
    revisar(mascara, cv.RETR_EXTERNAL, 1);

    // 2. Por bordes, con umbrales según el brillo típico de la foto; se dibuja un marco para cerrar
    //    la hoja cuando toca el borde de la foto.
    const suave = mat(); cv.bilateralFilter(gris, suave, 7, 60, 60);
    const mediana = (() => {
      const hist = new Array(256).fill(0);
      const d = suave.data as Uint8Array;
      for (let i = 0; i < d.length; i += 7) hist[d[i]]++;
      const total = hist.reduce((n, x) => n + x, 0);
      let acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total / 2) return i; }
      return 128;
    })();
    const bordes = mat(); cv.Canny(suave, bordes, Math.max(20, 0.5 * mediana), Math.min(255, Math.max(60, 1.3 * mediana)));
    cv.rectangle(bordes, new cv.Point(0, 0), new cv.Point(W - 1, H - 1), new cv.Scalar(255), 1);
    const k3 = cv.Mat.ones(3, 3, cv.CV_8U); mats.push(k3);
    cv.dilate(bordes, bordes, k3);
    revisar(bordes, cv.RETR_LIST, 2);

    // 3. Por brillo (Otsu sobre la imagen en gris).
    const umbral = mat(); cv.threshold(suave, umbral, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(umbral, umbral, cv.MORPH_CLOSE, kCerrar);
    revisar(umbral, cv.RETR_EXTERNAL, 3);
  } finally {
    contornos.delete();
    mats.forEach(m => { try { m.delete(); } catch { /* ya liberado */ } });
  }
  if (!candidatos.length) return null;

  // El mejor: forma más "llena" (contorno parecido al cuadrilátero) y más grande; el método por
  // color gana a igualdad porque es el más estable sobre mesas con textura.
  const puntaje = (c: Candidato) => c.relleno * 2 + (c.area / areaTotal) + (c.metodo === 1 ? 0.15 : 0);
  const mejor = candidatos.reduce((a, b) => (puntaje(b) > puntaje(a) ? b : a));
  const puntos = mejor.esquinas.map(p => ({ x: p.x / escala, y: p.y / escala }));
  // Se entra un poco hacia el centro para no arrastrar el borde de la mesa al recorte; más cuando la
  // detección fue sobre una copia chica (cámara en vivo), que es menos precisa.
  const cx = puntos.reduce((n, p) => n + p.x, 0) / 4;
  const cy = puntos.reduce((n, p) => n + p.y, 0) / 4;
  const k = lado < 500 ? 0.015 : 0.008;
  const ajustadas = puntos.map(p => ({
    x: Math.min(anchoOrigen, Math.max(0, p.x + (cx - p.x) * k)),
    y: Math.min(altoOrigen, Math.max(0, p.y + (cy - p.y) * k)),
  }));
  return ordenar(ajustadas);
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
