/** Convierte cualquier imagen (dataURL, blob URL o URL remota) a un Blob PNG, dibujándola en un canvas. */
function imagenAPngBlob(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No se pudo preparar el lienzo')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

/**
 * Copia una imagen directamente al portapapeles del sistema (como imagen, no como texto),
 * lista para pegar con Ctrl+V en otro programa (Word, correo, etc).
 * Se usa desde las miniaturas de foto y desde el visor ampliado.
 */
export async function copiarImagenAlPortapapel(src: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      throw new Error('El navegador no soporta copiar imágenes al portapapeles');
    }
    const blob = await imagenAPngBlob(src);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (err) {
    console.error('No se pudo copiar la imagen al portapapeles:', err);
    return false;
  }
}
