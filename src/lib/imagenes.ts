// Conversión de imágenes (dataURL / URL) a bytes, para insertarlas en los Word.

/** Convierte una imagen (dataURL o URL remota) a bytes, para insertarla en el .docx. */
export async function resolveImageBytes(src: string): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' }> {
  const response = await fetch(src);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return { bytes: new Uint8Array(buffer), type: blob.type.includes("png") ? "png" : "jpg" };
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
