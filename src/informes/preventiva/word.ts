// Word de la Mantención Preventiva: se rellena la plantilla del informe de referencia
// ("Reporte_mantencion_preventiva_LTE_CMF_09_11-10-2026"), así la portada, el encabezado, los
// estilos, las listas y las tablas de fotos quedan iguales al original (el XML está en wordXml.ts).
// La portada es siempre la misma imagen de los reportes originales (viene en la plantilla).
import plantillaUrl from '../../assets/plantillas/mantencion_preventiva.docx?url';
import { medirImagen } from '../../lib/ajusteImagenes';
import { bytesDeImagen } from '../../lib/docxRecursos';
import type { DatosPreventiva } from './modelo';
import { type ImagenWord, armarCuerpo, ddmmaaaa, fechaEncabezado, parrafoRevisor, tx } from './wordXml';

/** Genera el Word con el formato del informe de referencia. */
export async function generarPreventivaWord(d: DatosPreventiva): Promise<Blob> {
  const [{ default: JSZip }, respuesta] = await Promise.all([import('jszip'), fetch(plantillaUrl)]);
  if (!respuesta.ok) throw new Error('No se pudo cargar la plantilla de la mantención preventiva.');
  const zip = await JSZip.loadAsync(await respuesta.arrayBuffer());
  const docXml = await zip.file('word/document.xml')?.async('string');
  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const headerXml = await zip.file('word/header1.xml')?.async('string');
  if (!docXml || !relsXml || !headerXml) throw new Error('La plantilla de la mantención preventiva está dañada.');

  // Fotos: cada imagen distinta se agrega una sola vez al documento.
  const fuentes = [...new Set(d.secciones.filter(s => s.activa).flatMap(s => s.fotos.map(f => f.photo)).filter((p): p is string => !!p))];
  const img = new Map<string, ImagenWord>();
  const rels: string[] = [];
  await Promise.all(fuentes.map(async (src, i) => {
    const [{ bytes, type }, medida] = await Promise.all([bytesDeImagen(src), medirImagen(src)]);
    const ext = type === 'png' ? 'png' : 'jpeg';
    const rId = `rIdFoto${i + 1}`;
    zip.file(`word/media/foto${i + 1}.${ext}`, bytes);
    rels[i] = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/foto${i + 1}.${ext}"/>`;
    img.set(src, { rId, ancho: medida.ancho, alto: medida.alto });
  }));

  const revisores = d.revisados.map(r => r.trim()).filter(Boolean);
  const reemplazos: Record<string, string> = {
    SITIO: d.sitio.trim(), SECTOR: d.sector.trim(), COORDENADAS: d.coordenadas.trim(), FECHA: ddmmaaaa(d.fecha),
    CREADO: d.creadoNombre.trim(), CARGO_CREADO: d.creadoCargo.trim(),
    AUTORIZADO: d.autorizadoNombre.trim(), CARGO_AUTORIZADO: d.autorizadoCargo.trim(),
  };
  let doc = docXml;
  for (const [clave, valor] of Object.entries(reemplazos)) doc = doc.split(`<w:t>{{${clave}}}</w:t>`).join(tx(valor));
  doc = doc.replace('<w:p><w:r><w:t>{{REVISADOS}}</w:t></w:r></w:p>', revisores.map(parrafoRevisor).join(''));
  doc = doc.replace('<w:p><w:r><w:t>{{CUERPO}}</w:t></w:r></w:p>', armarCuerpo(d, img));
  zip.file('word/document.xml', doc);
  zip.file('word/_rels/document.xml.rels', relsXml.replace('</Relationships>', `${rels.join('')}</Relationships>`));
  zip.file('word/header1.xml', headerXml.replace('<w:t>{{FECHA_HEADER}}</w:t>', tx(fechaEncabezado(d.fecha))));

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', compression: 'DEFLATE' });
}

export const nombreArchivoPreventiva = (d: Pick<DatosPreventiva, 'sitio' | 'fecha'>) => {
  const [y, m, dd] = d.fecha.split('-');
  return `Reporte_mantencion_preventiva_${d.sitio.trim().replace(/\s+/g, '_') || 'SITIO'}_${dd}-${m}-${y}.docx`;
};
