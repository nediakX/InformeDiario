// Utilidades de fotos compartidas por todos los informes.
//
// Las fotos de un celular pesan 4-8 MB (12+ MP). Guardarlas así hace lentos el Word, la subida a
// la nube y la carga de borradores, sin ganar nada en el informe impreso. Por eso toda foto se
// reduce al cargarla: lado mayor de 1600 px y JPEG de calidad 0,8 (≈200-400 KB).

export const FOTO_LADO_MAXIMO = 1600;
export const FOTO_CALIDAD_JPEG = 0.8;

/** Id corto y único para listas internas del formulario. */
export const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const cargarImagen = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("No se pudo leer la imagen"));
  img.src = src;
});

const leerComoDataUrl = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result as string);
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

/**
 * Reduce una imagen (dataURL o URL) a JPEG con el lado mayor ≤ `ladoMaximo`.
 * Los navegadores actuales ya aplican la orientación EXIF al dibujar, así que la foto sale derecha.
 * Si algo falla, devuelve la imagen original para no perder la foto.
 */
export async function comprimirDataUrl(src: string, ladoMaximo = FOTO_LADO_MAXIMO, calidad = FOTO_CALIDAD_JPEG): Promise<string> {
  try {
    const img = await cargarImagen(src);
    const { naturalWidth: w, naturalHeight: h } = img;
    if (!w || !h) return src;
    const escala = Math.min(1, ladoMaximo / Math.max(w, h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;
    // Fondo blanco: un PNG con transparencia quedaría negro al pasarlo a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const resultado = canvas.toDataURL("image/jpeg", calidad);
    // Si la imagen ya era pequeña y el JPEG sale más pesado, se conserva la original.
    return src.startsWith("data:") && resultado.length >= src.length ? src : resultado;
  } catch (error) {
    console.error("No se pudo comprimir la foto; se usa la original:", error);
    return src;
  }
}

/** Lee un archivo de imagen y lo devuelve como dataURL ya comprimido. */
export async function comprimirImagen(file: Blob, ladoMaximo = FOTO_LADO_MAXIMO, calidad = FOTO_CALIDAD_JPEG): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const comprimida = await comprimirDataUrl(url, ladoMaximo, calidad);
    // Si no se pudo comprimir, comprimirDataUrl devuelve la objectURL, que deja de servir al revocarla.
    if (comprimida === url) return await leerComoDataUrl(file);
    // Si la foto ya era liviana y el JPEG nuevo no pesa menos, se conserva la original tal cual.
    const bytesComprimida = Math.floor((comprimida.length - comprimida.indexOf(",") - 1) * 3 / 4);
    return bytesComprimida >= file.size ? await leerComoDataUrl(file) : comprimida;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Reemplazo directo del antiguo `fileToDataUrl`: lee la foto y la comprime. */
export const fileToDataUrl = (file: File): Promise<string> => comprimirImagen(file);
