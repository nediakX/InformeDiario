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
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * escala);
  canvas.height = Math.round(img.naturalHeight * escala);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
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
  const escala = Math.min(1, 800 / Math.max(canvas.width, canvas.height));
  const src = cv.imread(canvas);
  const chica = new cv.Mat();
  cv.resize(src, chica, new cv.Size(Math.round(canvas.width * escala), Math.round(canvas.height * escala)), 0, 0, cv.INTER_AREA);
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

/** Endereza la hoja: devuelve un lienzo con solo el documento, visto de frente. */
export async function enderezar(canvas: HTMLCanvasElement, esquinas: Esquinas): Promise<HTMLCanvasElement> {
  const cv = await cargarOpenCv();
  const [tl, tr, br, bl] = esquinas;
  const dist = (a: Punto, b: Punto) => Math.hypot(a.x - b.x, a.y - b.y);
  const ancho = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  const alto = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  const src = cv.imread(canvas);
  const origen = cv.matFromArray(4, 1, cv.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
  const destino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, ancho, 0, ancho, alto, 0, alto]);
  const m = cv.getPerspectiveTransform(origen, destino);
  const salida = new cv.Mat();
  try {
    cv.warpPerspective(src, salida, m, new cv.Size(ancho, alto), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    const lienzo = document.createElement('canvas');
    cv.imshow(lienzo, salida);
    return lienzo;
  } finally {
    [src, origen, destino, m, salida].forEach(x => x.delete());
  }
}

/**
 * Aspecto de escaneo: estima el fondo (papel + sombras) en una copia chica, lo "divide" para dejar
 * el papel blanco parejo y sube el contraste del texto.
 *  - documento: blanco y negro (tonos de gris), como un escáner de oficina.
 *  - color: mismo blanqueo pero conservando colores (timbres, firmas en azul, formularios de color).
 */
export async function aplicarFiltro(canvas: HTMLCanvasElement, filtro: FiltroEscaneo): Promise<HTMLCanvasElement> {
  if (filtro === 'original') return canvas;
  const cv = await cargarOpenCv();
  const src = cv.imread(canvas);
  const base = new cv.Mat();
  const planos = new cv.MatVector();
  const resultado = new cv.MatVector();
  const tamano = new cv.Size(canvas.width, canvas.height);
  const kernel = cv.Mat.ones(7, 7, cv.CV_8U);
  const temporales: Cv[] = [];
  try {
    if (filtro === 'documento') cv.cvtColor(src, base, cv.COLOR_RGBA2GRAY);
    else cv.cvtColor(src, base, cv.COLOR_RGBA2RGB);
    cv.split(base, planos);
    const escala = Math.min(1, 500 / Math.max(canvas.width, canvas.height));
    const chico = new cv.Size(Math.max(1, Math.round(canvas.width * escala)), Math.max(1, Math.round(canvas.height * escala)));
    for (let i = 0; i < planos.size(); i++) {
      const plano = planos.get(i);
      const reducido = new cv.Mat(); const fondo = new cv.Mat(); const fondoGrande = new cv.Mat(); const limpio = new cv.Mat();
      temporales.push(plano, reducido, fondo, fondoGrande, limpio);
      cv.resize(plano, reducido, chico, 0, 0, cv.INTER_AREA);
      cv.dilate(reducido, fondo, kernel);           // borra el texto: queda solo el papel
      cv.medianBlur(fondo, fondo, 21);              // suaviza: sombras y luz despareja
      cv.resize(fondo, fondoGrande, tamano, 0, 0, cv.INTER_LINEAR);
      cv.divide(plano, fondoGrande, limpio, 255);   // papel → blanco parejo
      // Contraste: el gris claro pasa a blanco y el texto se oscurece.
      limpio.convertTo(limpio, -1, filtro === 'documento' ? 1.35 : 1.15, filtro === 'documento' ? -70 : -25);
      resultado.push_back(limpio);
    }
    const unido = new cv.Mat();
    temporales.push(unido);
    cv.merge(resultado, unido);
    const lienzo = document.createElement('canvas');
    cv.imshow(lienzo, unido);
    return lienzo;
  } finally {
    [src, base, planos, resultado, kernel, ...temporales].forEach(x => { try { x.delete(); } catch { /* ya liberado */ } });
  }
}

/** Gira el lienzo 90° a la derecha. */
export function rotar90(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const lienzo = document.createElement('canvas');
  lienzo.width = canvas.height;
  lienzo.height = canvas.width;
  const ctx = lienzo.getContext('2d');
  if (ctx) {
    ctx.translate(lienzo.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(canvas, 0, 0);
  }
  return lienzo;
}

/** JPEG final del documento (máx. 1800 px por lado: se lee bien en el Word sin pesar demasiado). */
export function aJpeg(canvas: HTMLCanvasElement, ladoMaximo = 1800, calidad = 0.85): string {
  const escala = Math.min(1, ladoMaximo / Math.max(canvas.width, canvas.height));
  if (escala === 1) return canvas.toDataURL('image/jpeg', calidad);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(canvas.width * escala);
  lienzo.height = Math.round(canvas.height * escala);
  const ctx = lienzo.getContext('2d');
  if (ctx) { ctx.imageSmoothingQuality = 'high'; ctx.drawImage(canvas, 0, 0, lienzo.width, lienzo.height); }
  return lienzo.toDataURL('image/jpeg', calidad);
}

/**
 * Endereza sola una foto de documento (sin filtro): si encuentra la hoja la recorta y la pone de
 * frente; si no, devuelve la foto tal cual. Se usa al cargar fotos del bloque Vertiv.
 */
export async function enderezarAutomatico(dataUrl: string): Promise<string> {
  try {
    const lienzo = lienzoDesdeImagen(await cargarImagen(dataUrl));
    const esquinas = await detectarHoja(lienzo);
    if (!esquinas) return dataUrl;
    return (await enderezar(lienzo, esquinas)).toDataURL('image/jpeg', 0.92);
  } catch {
    return dataUrl;
  }
}
