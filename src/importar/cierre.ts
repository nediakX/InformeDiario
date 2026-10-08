// Importa un Informe de Cierre desde su Word: creado por, actividades pendientes, secciones de
// imágenes y camionetas. (Las actividades de cada día salen de los Informes Diarios: si esos
// también se perdieron, se importan sus propios Word.)
import { uid } from '../lib/fotos';
import { normalizar, type Bloque, type DocumentoLeido, type Tabla } from './leerDocx';
import { fotosDeCeldas, prepararFoto, prepararFotos } from './comun';

export interface DatosCierreImportados {
  creadoNombre: string;
  creadoCargo: string;
  selectedIds: string[];
  actividadesPendientes: string[];
  seccionesImagenes: { id: string; title: string; photos: (string | null)[] }[];
  camionetas: { id: string; placa: string; antes: string | null; despues: string | null }[];
}

const esSeccion = (b: Bloque) => b.tipo === 'p' && b.nivel === 1 && /^\d+\)\s*/.test(b.texto);

export async function importarCierre(doc: DocumentoLeido): Promise<DatosCierreImportados> {
  const { bloques } = doc;
  const portada = bloques.find((b): b is Tabla => b.tipo === 'tabla');
  const derecha = (portada?.filas[0]?.[1]?.textos ?? []).filter(t => !/^_+$/.test(t));
  const iCreado = derecha.findIndex(t => /^creado por/i.test(t));
  const tramoCreado = iCreado >= 0 ? derecha.slice(iCreado + 1) : [];
  const finCreado = tramoCreado.findIndex(t => /^(revisado|autorizado) por/i.test(t));
  const creado = finCreado >= 0 ? tramoCreado.slice(0, finCreado) : tramoCreado;
  const cargo = creado.find(t => /^cargo:/i.test(t));

  const datos: DatosCierreImportados = {
    creadoNombre: creado.filter(t => !/^cargo:/i.test(t)).join(' ').trim(),
    creadoCargo: cargo ? cargo.replace(/^cargo:\s*/i, '').trim() : '',
    selectedIds: [],
    actividadesPendientes: [],
    seccionesImagenes: [],
    camionetas: [],
  };

  // Secciones numeradas "N) Título" y lo que viene después de cada una.
  const inicios = bloques.map((b, i) => (esSeccion(b) ? i : -1)).filter(i => i >= 0);
  for (const [n, inicio] of inicios.entries()) {
    const titulo = (bloques[inicio] as { texto: string }).texto.replace(/^\d+\)\s*/, '').trim();
    const contenido = bloques.slice(inicio + 1, inicios[n + 1] ?? bloques.length);
    const clave = normalizar(titulo);
    if (clave.startsWith('descripcion de actividades') || clave.startsWith('actividades realizadas')) continue;

    if (clave.startsWith('actividades pendientes')) {
      datos.actividadesPendientes = contenido
        .filter(b => b.tipo === 'p' && b.vineta && b.texto)
        .map(b => (b as { texto: string }).texto);
      continue;
    }

    const tablas = contenido.filter((b): b is Tabla => b.tipo === 'tabla');
    if (clave === 'camionetas') {
      for (const t of tablas) {
        // Filas: "ANTES | DESPUES", fotos, patente.
        const filaFotos = t.filas.find(f => f.some(c => c.imagenes.length || c.textos.some(x => /^\(sin/i.test(x))));
        const fotos = filaFotos ? fotosDeCeldas(filaFotos) : [];
        const placa = t.filas[t.filas.length - 1]?.[0]?.textos.join(' ').trim() ?? '';
        datos.camionetas.push({
          id: uid(),
          placa: placa === '—' ? '' : placa,
          antes: fotos[0] ? await prepararFoto(fotos[0]) : null,
          despues: fotos[1] ? await prepararFoto(fotos[1]) : null,
        });
      }
      continue;
    }

    if (clave.startsWith('reportabilidad')) continue;

    // Sección de imágenes (puede ocupar varias tablas / hojas).
    const fotos = fotosDeCeldas(tablas.flatMap(t => t.filas.flat()));
    datos.seccionesImagenes.push({ id: uid(), title: titulo, photos: await prepararFotos(fotos) });
  }

  if (!datos.actividadesPendientes.length) datos.actividadesPendientes = [''];
  if (!datos.camionetas.length) datos.camionetas = [{ id: uid(), placa: '', antes: null, despues: null }];
  return datos;
}
