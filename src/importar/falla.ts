// Importa un Informe de Falla — Carro desde su Word.
import { configDivision, type Division } from '../datos/divisiones';
import { uid } from '../lib/fotos';
import { fechaDesdeTexto, normalizar, type Bloque, type Celda, type DocumentoLeido, type Tabla } from './leerDocx';
import { prepararFoto } from './comun';

type P = Extract<Bloque, { tipo: 'p' }>;
const esH1 = (b: Bloque): boolean => b.tipo === 'p' && b.nivel === 1;

/** "07:49 AM" → "07:49"; "1:05 PM" → "13:05". */
function hora24(texto: string | undefined): string {
  const m = texto?.match(/(\d{1,2}):(\d{2})\s*([AP])\.?\s*M/i);
  if (!m) return '';
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === 'P') h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** Textos de todas las tablas anidadas de una celda. */
const textosAnidados = (c: Celda | undefined): string[] =>
  (c?.tablas ?? []).flatMap(t => t.filas.flat().flatMap(x => [...x.textos, ...textosAnidados(x)]));

export async function importarFalla(doc: DocumentoLeido, division: Division): Promise<{ titulo: string; fecha: string; datos: Record<string, unknown> }> {
  const { bloques } = doc;
  const portada = bloques.find((b): b is Tabla => b.tipo === 'tabla');
  const izq = portada?.filas[0]?.[0]?.textos ?? [];
  const der = [...(portada?.filas[0]?.[1]?.textos ?? []), ...textosAnidados(portada?.filas[0]?.[1])].filter(t => !/^_+$/.test(t));

  // Portada izquierda: "REPORTE DE FALLA", "Carro …", ubicación, fecha.
  const iTitulo = izq.findIndex(t => /reporte de falla/i.test(t));
  const [carroTexto = '', ubicacion = '', fechaTexto = ''] = izq.slice(iTitulo + 1);
  const fecha = fechaDesdeTexto(fechaTexto) || fechaDesdeTexto(doc.textoCompleto);
  if (!fecha) throw new Error('No se pudo leer la fecha del informe.');
  const { carros } = configDivision(division);
  const carroCodigo = carros.find(c => normalizar(`Carro ${c.replace(/_/g, ' ')}`) === normalizar(carroTexto))
    ?? carros.find(c => normalizar(carroTexto).includes(normalizar(c.replace(/_/g, ' '))))
    ?? carros[0];

  const iCreado = der.findIndex(t => /^creado por/i.test(t));
  const finCreado = der.findIndex((t, i) => i > iCreado && /^(revisado|autorizado) por/i.test(t));
  const creado = iCreado >= 0 ? der.slice(iCreado + 1, finCreado >= 0 ? finCreado : undefined) : [];
  const cargo = creado.find(t => /^cargo:/i.test(t));

  // Secciones de texto.
  const seccion = (titulo: RegExp): P[] => {
    const i = bloques.findIndex(b => esH1(b) && b.tipo === 'p' && titulo.test(b.texto));
    if (i < 0) return [];
    const out: P[] = [];
    for (const b of bloques.slice(i + 1)) {
      if (b.tipo !== 'p' || esH1(b) || b.saltoPagina) break;
      if (b.texto) out.push(b);
    }
    return out;
  };
  const a = seccion(/^A\.\s*Descripci/i);
  const iPrimerPunto = a.findIndex(p => /^\d+\)\s/.test(p.texto));
  const notificacionIntro = iPrimerPunto > 0 ? a[iPrimerPunto - 1].texto : '';
  const descripcion = a.slice(0, iPrimerPunto > 0 ? iPrimerPunto - 1 : a.length).filter(p => !p.texto.startsWith('✓'));
  const notificacionPuntos = a.filter(p => /^\d+\)\s/.test(p.texto)).map(p => p.texto.replace(/^\d+\)\s*/, ''));
  const notificacionCheckItem = a.find(p => p.texto.startsWith('✓'))?.texto.replace(/^✓\s*/, '') ?? '';

  const b = seccion(/^B\.\s*Soluci/i);
  const iSolucion = b.findIndex(p => /^Soluci[oó]n$/i.test(p.texto));
  const solucionIntro = b.find(p => !p.vineta)?.texto ?? '';
  const hallazgos = b.slice(0, iSolucion >= 0 ? iSolucion : b.length).filter(p => p.vineta).map(p => p.texto);
  const accionesSolucion = iSolucion >= 0 ? b.slice(iSolucion + 1).filter(p => p.vineta).map(p => p.texto) : [];

  const v = seccion(/^Verificaci[oó]n Final/i);
  const verificacionTexto = v.find(p => !p.texto.startsWith('✓'))?.texto ?? '';
  const verificacionCheckItem = v.find(p => p.texto.startsWith('✓'))?.texto.replace(/^✓\s*/, '') ?? '';

  // Registro fotográfico: cada tabla es un grupo [nota] + filas de fotos + [leyenda].
  const iC = bloques.findIndex(x => esH1(x) && x.tipo === 'p' && /^C\.\s*Registro Fotogr/i.test(x.texto));
  const grupos: { id: string; nota: string; caption: string; fotos: { id: string; photo: string | null; caption?: string }[] }[] = [];
  if (iC >= 0) {
    for (const t of bloques.slice(iC + 1).filter((x): x is Tabla => x.tipo === 'tabla')) {
      let nota = '';
      let caption = '';
      const fotos: { id: string; photo: string | null; caption?: string }[] = [];
      for (const fila of t.filas) {
        const conFoto = fila.some(c => c.imagenes.length || c.textos.some(x => /^\(sin foto/i.test(x)));
        if (!conFoto) {
          const texto = fila.map(c => c.textos.join('\n')).join('\n').trim();
          if (fotos.length === 0 && !caption) nota = nota ? `${nota}\n${texto}` : texto;
          else caption = caption ? `${caption}\n${texto}` : texto;
          continue;
        }
        for (const c of fila) {
          const leyenda = c.textos.filter(x => !/^\(sin foto/i.test(x)).join(' ').trim();
          fotos.push({ id: uid(), photo: c.imagenes[0] ? await prepararFoto(c.imagenes[0]) : null, ...(leyenda ? { caption: leyenda } : {}) });
        }
      }
      grupos.push({ id: uid(), nota, caption, fotos });
    }
  }

  const textoA = a.map(p => p.texto).join('\n');
  const datos: Record<string, unknown> = {
    fecha,
    carroCodigo,
    ubicacion,
    creadoNombre: creado.filter(t => !/^cargo:/i.test(t)).join(' ').trim(),
    creadoCargo: cargo ? cargo.replace(/^cargo:\s*/i, '').trim() : '',
    horaAlarma: hora24(textoA.match(/A las\s+(\d{1,2}:\d{2}\s*[AP]\.?\s*M)/i)?.[1]),
    horaRespuesta: hora24(notificacionCheckItem),
    horaOperativo: hora24(verificacionCheckItem),
    tecnicoRespuesta: notificacionPuntos.find(p => /^Tiempo de respuesta/i.test(p))?.replace(/^Tiempo de respuesta;?\s*/i, '').replace(/\.+$/, '.') ?? '',
    descripcionTexto: descripcion.map(p => p.texto).join('\n'),
    notificacionIntro,
    notificacionPuntos,
    notificacionCheckItem,
    solucionIntro,
    hallazgos,
    accionesSolucion,
    verificacionTexto,
    verificacionCheckItem,
    grupos,
  };
  for (const [k, val] of Object.entries(datos)) if (val === '' || (Array.isArray(val) && val.length === 0)) delete datos[k];
  const titulo = `Carro ${carroCodigo.replace(/_/g, ' ')}`;
  return { titulo, fecha, datos };
}
