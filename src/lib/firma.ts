// Firma del usuario (Mi perfil): se limpia la imagen que sube (foto o escaneo de la firma) para que
// en el Word se vea como firmada a mano sobre el papel: fondo transparente, sin bordes sobrantes,
// y en un tamaño liviano.

const cargar = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('No se pudo leer la imagen de la firma.'));
  img.src = src;
});

const leerArchivo = (archivo: File): Promise<string> => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result));
  lector.onerror = () => reject(new Error('No se pudo leer el archivo.'));
  lector.readAsDataURL(archivo);
});

/**
 * Convierte la imagen de una firma en un PNG con fondo transparente, recortado al trazo.
 * - El papel (blanco o grisáceo) se vuelve transparente; el trazo conserva su color (azul, negro…).
 * - Se recorta el espacio vacío alrededor y se deja como máximo en 600 × 240 px.
 */
export async function procesarFirma(archivo: File): Promise<string> {
  if (!archivo.type.startsWith('image/')) throw new Error('Elige una imagen (PNG o JPG) con tu firma.');
  const img = await cargar(await leerArchivo(archivo));
  // Se trabaja en un tamaño razonable (fotos de celular muy grandes).
  const escala = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const lienzo = document.createElement('canvas');
  lienzo.width = w; lienzo.height = h;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('El navegador no pudo procesar la imagen.');
  ctx.drawImage(img, 0, 0, w, h);
  const datos = ctx.getImageData(0, 0, w, h);
  const d = datos.data;

  // Brillo del papel: el percentil 90 de la imagen (la firma ocupa poco de la hoja).
  const brillos: number[] = [];
  for (let i = 0; i < d.length; i += 16) brillos.push(d[i + 3] < 20 ? 255 : 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  brillos.sort((a, b) => a - b);
  const papel = Math.max(150, brillos[Math.floor(brillos.length * 0.9)] ?? 255);
  const umbral = papel - 45; // lo que sea casi tan claro como el papel, se vuelve transparente

  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      if (d[p + 3] < 20) { d[p + 3] = 0; continue; }
      const brillo = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      if (brillo >= umbral) { d[p + 3] = 0; continue; }
      // Bordes suaves: los tonos intermedios quedan semitransparentes.
      const opacidad = Math.min(1, (umbral - brillo) / 60);
      d[p + 3] = Math.round(d[p + 3] * opacidad);
      if (d[p + 3] > 30) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) throw new Error('No se encontró la firma en la imagen. Prueba con una foto más clara, sobre papel blanco.');
  ctx.putImageData(datos, 0, 0);

  const margen = 6;
  minX = Math.max(0, minX - margen); minY = Math.max(0, minY - margen);
  maxX = Math.min(w - 1, maxX + margen); maxY = Math.min(h - 1, maxY + margen);
  const anchoRecorte = maxX - minX + 1;
  const altoRecorte = maxY - minY + 1;
  const final = Math.min(1, 600 / anchoRecorte, 240 / altoRecorte);
  const salida = document.createElement('canvas');
  salida.width = Math.max(1, Math.round(anchoRecorte * final));
  salida.height = Math.max(1, Math.round(altoRecorte * final));
  const sctx = salida.getContext('2d');
  if (!sctx) throw new Error('El navegador no pudo procesar la imagen.');
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(lienzo, minX, minY, anchoRecorte, altoRecorte, 0, 0, salida.width, salida.height);
  const url = salida.toDataURL('image/png');
  lienzo.width = 0; lienzo.height = 0;
  salida.width = 0; salida.height = 0;
  return url;
}

/** Compara nombres sin importar mayúsculas, tildes ni apellidos de más ("Patricio Santana" = "Patricio Santana Ramos"). */
export function mismaPersona(a: string, b: string): boolean {
  const palabras = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ ]/g, ' ').split(/\s+/).filter(Boolean);
  const pa = palabras(a);
  const pb = palabras(b);
  // Con un solo nombre no basta ("Juan" no es necesariamente "Juan Morata"): se piden al menos 2 palabras.
  if (Math.min(pa.length, pb.length) < 2) return false;
  const sa = new Set(pa); const sb = new Set(pb);
  return pa.every(p => sb.has(p)) || pb.every(p => sa.has(p));
}
