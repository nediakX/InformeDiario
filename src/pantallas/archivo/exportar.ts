// Descarga de los documentos del archivo: uno solo en PDF, o varios en un .zip con un PDF por documento
// (cada uno con su nombre).
import { ETIQUETA_ORIGEN, nombreArchivoPdf, nombresSinRepetir, type DocumentoArchivo } from '../../datos/archivoDocumentos';
import { pdfDeFotos } from '../../lib/pdfDocumento';

const asunto = (doc: DocumentoArchivo) => `${ETIQUETA_ORIGEN[doc.origen]} · ${doc.informe} · ${doc.fecha.split('-').reverse().join('-')}`;

/** PDF de un documento, listo para descargar. */
export async function pdfDeDocumento(doc: DocumentoArchivo): Promise<{ blob: Blob; nombre: string }> {
  const bytes = await pdfDeFotos(doc.paginas, { titulo: doc.nombre, asunto: asunto(doc) });
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }), nombre: nombreArchivoPdf(doc) };
}

export interface ResultadoZip {
  blob: Blob;
  /** Documentos que no se pudieron incluir (sin señal, o la foto ya no está en la nube). */
  fallidos: DocumentoArchivo[];
}

/**
 * .zip con un PDF por documento. Se arman de a 3 a la vez; `alAvanzar` cuenta los listos y `cancelado`
 * permite detenerlo (devuelve null).
 */
export async function zipDeDocumentos(
  docs: DocumentoArchivo[],
  alAvanzar: (listos: number, total: number) => void,
  cancelado: () => boolean,
): Promise<ResultadoZip | null> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const nombres = nombresSinRepetir(docs.map(nombreArchivoPdf));
  const fallidos: DocumentoArchivo[] = [];
  let siguiente = 0;
  let listos = 0;
  const trabajar = async () => {
    while (siguiente < docs.length && !cancelado()) {
      const i = siguiente++;
      try {
        const bytes = await pdfDeFotos(docs[i].paginas, { titulo: docs[i].nombre, asunto: asunto(docs[i]) });
        zip.file(nombres[i], bytes, { binary: true });
      } catch (error) {
        console.warn('No se pudo armar el PDF de', docs[i].nombre, error);
        fallidos.push(docs[i]);
      }
      listos += 1;
      alAvanzar(listos, docs.length);
    }
  };
  await Promise.all([trabajar(), trabajar(), trabajar()]);
  if (cancelado()) return null;
  // Sin comprimir: los PDF llevan fotos JPG, que no se achican más (y así es mucho más rápido).
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE', mimeType: 'application/zip' });
  return { blob, fallidos };
}
