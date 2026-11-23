// PDF de un documento escaneado: cada foto es una página A4 (vertical u horizontal, según la foto), con la
// foto entera, centrada y sin deformar. El título del PDF es el nombre del documento.
import { PDFDocument } from 'pdf-lib';
import { resolveImageBytes } from './imagenes';

/** Hoja A4 en puntos (vertical). */
const A4: [number, number] = [595.28, 841.89];
/** Margen alrededor de la foto (~5 mm). */
const MARGEN = 14;

/** Orientación EXIF de un JPG (1 = derecha; 2 a 8 = rotada o espejada). El PDF no la aplica sola. */
export function orientacionJpeg(b: Uint8Array): number {
  if (b[0] !== 0xff || b[1] !== 0xd8) return 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) return 1;
    const marcador = b[i + 1];
    if (marcador === 0xda || marcador === 0xd9) return 1; // empiezan los datos de la imagen: no hay EXIF
    const largo = (b[i + 2] << 8) | b[i + 3];
    const esExif = marcador === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66;
    if (esExif) {
      const tiff = i + 10;
      const le = b[tiff] === 0x49; // "II": little endian
      const u16 = (p: number) => (le ? b[p] | (b[p + 1] << 8) : (b[p] << 8) | b[p + 1]);
      const u32 = (p: number) => (le
        ? (b[p] | (b[p + 1] << 8) | (b[p + 2] << 16) | (b[p + 3] << 24)) >>> 0
        : ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0);
      const ifd = tiff + u32(tiff + 4);
      if (ifd + 2 > b.length) return 1;
      const entradas = u16(ifd);
      for (let k = 0; k < entradas; k++) {
        const e = ifd + 2 + k * 12;
        if (e + 12 > b.length) return 1;
        if (u16(e) === 0x0112) {
          const valor = u16(e + 8);
          return valor >= 1 && valor <= 8 ? valor : 1;
        }
      }
      return 1;
    }
    i += 2 + largo;
  }
  return 1;
}

/** JPG con la orientación aplicada (el navegador la respeta al dibujar la foto). */
async function jpegDerecho(bytes: Uint8Array): Promise<Uint8Array> {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const lienzo = document.createElement('canvas');
    lienzo.width = img.naturalWidth;
    lienzo.height = img.naturalHeight;
    const ctx = lienzo.getContext('2d');
    if (!ctx) return bytes;
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>(listo => lienzo.toBlob(listo, 'image/jpeg', 0.92));
    return blob ? new Uint8Array(await blob.arrayBuffer()) : bytes;
  } catch {
    return bytes;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** PDF (bytes) con una página por foto. */
export async function pdfDeFotos(paginas: string[], datos: { titulo: string; asunto?: string }): Promise<Uint8Array> {
  if (!paginas.length) throw new Error('El documento no tiene fotos.');
  const pdf = await PDFDocument.create();
  for (const src of paginas) {
    const leida = await resolveImageBytes(src);
    const bytes = leida.type === 'jpg' && orientacionJpeg(leida.bytes) > 1 ? await jpegDerecho(leida.bytes) : leida.bytes;
    const imagen = leida.type === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const [ancho, alto] = imagen.width > imagen.height ? [A4[1], A4[0]] : A4;
    const pagina = pdf.addPage([ancho, alto]);
    const escala = Math.min((ancho - 2 * MARGEN) / imagen.width, (alto - 2 * MARGEN) / imagen.height);
    const w = imagen.width * escala;
    const h = imagen.height * escala;
    pagina.drawImage(imagen, { x: (ancho - w) / 2, y: (alto - h) / 2, width: w, height: h });
  }
  const ahora = new Date();
  pdf.setTitle(datos.titulo, { showInWindowTitleBar: true });
  if (datos.asunto) pdf.setSubject(datos.asunto);
  pdf.setAuthor('PSINet');
  pdf.setCreator('PSINet · Informes');
  pdf.setProducer('PSINet · Informes');
  pdf.setLanguage('es-CL');
  pdf.setCreationDate(ahora);
  pdf.setModificationDate(ahora);
  return pdf.save();
}
