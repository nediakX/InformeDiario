// Conversión de imágenes (dataURL / URL) a bytes, para insertarlas en los Word.

/** Convierte una imagen (dataURL o URL remota) a bytes, para insertarla en el .docx. */
export async function resolveImageBytes(src: string): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' }> {
  const response = await fetch(src);
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  // Se mira el contenido (no el tipo declarado, que en la nube puede decir JPG): JPG y PNG van tal cual.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, type: 'jpg' };
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { bytes, type: 'png' };
  // WebP, GIF, AVIF…: el Word no los muestra (sale una imagen rota), así que se pasan a JPG.
  const jpg = await aJpg(blob);
  return jpg ? { bytes: jpg, type: 'jpg' } : { bytes, type: blob.type.includes("png") ? "png" : "jpg" };
}

/** Dibuja la imagen en un canvas y la devuelve como JPG (null si el navegador no la puede abrir). */
async function aJpg(blob: Blob): Promise<Uint8Array | null> {
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const salida = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return salida ? new Uint8Array(await salida.arrayBuffer()) : null;
  } catch (error) {
    console.warn("No se pudo pasar la imagen a JPG para el Word:", error);
    return null;
  }
}

export const dataUrlToUint8Array = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
