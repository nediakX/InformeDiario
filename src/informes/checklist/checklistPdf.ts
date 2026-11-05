// Exporta las hojas del checklist de camioneta (imágenes del Informe Diario) a un PDF, una hoja por página.
import { PDFDocument } from 'pdf-lib';

const esPng = (bytes: Uint8Array) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;

export async function checklistHojasComoPdf(urls: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (const url of urls) {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error('No se pudo descargar una de las hojas del checklist.');
    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    const imagen = esPng(bytes) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    // Página A4 vertical, con la hoja centrada y ajustada sin deformarla.
    const pagina = pdf.addPage([595.28, 841.89]);
    const margen = 24;
    const escala = Math.min((595.28 - margen * 2) / imagen.width, (841.89 - margen * 2) / imagen.height);
    const ancho = imagen.width * escala;
    const alto = imagen.height * escala;
    pagina.drawImage(imagen, { x: (595.28 - ancho) / 2, y: (841.89 - alto) / 2, width: ancho, height: alto });
  }
  return pdf.save();
}
