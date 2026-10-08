// Importa un Informe Diario desde su Word: portada, personal, actividades, observaciones, evidencia
// fotográfica (con su bloque) y, en Turno Noche, el bloque Vertiv.
import type { Division } from '../datos/divisiones';
import type { BorradorEntry, EvidenceBlockLike } from '../datos/borradoresDiario';
import { idBorradorAutomatico, letraDeFecha } from '../datos/turnos';
import { VERTIV_CARROS_FLAT, VERTIV_ITEMS, VERTIV_TITLE } from '../datos/plantillaWord';
import { crearBorradorAutomatico, DEFAULT_EVIDENCIAS_NOCHE } from '../informes/diario/constantes';
import { fechaDesdeTexto, normalizar, type Bloque, type DocumentoLeido, type Tabla } from './leerDocx';
import { esFilaLeyenda, fotosDeCeldas, prepararFotos } from './comun';

const esTitulo = (b: Bloque, texto: RegExp) => b.tipo === 'p' && texto.test(b.texto);
const esEncabezado = (b: Bloque) => b.tipo === 'p' && b.nivel > 0 && b.texto.length > 0;

/** Lee la columna derecha de la portada: fecha, creado por, revisado por y autorizado por. */
function leerPortada(celdaTextos: string[]) {
  const lineas = celdaTextos.map(t => t.trim()).filter(t => t && !/^_+$/.test(t));
  const indice = (re: RegExp) => lineas.findIndex(l => re.test(l));
  const iCreado = indice(/^creado por/i);
  const iRevisado = indice(/^revisado por/i);
  const iAutorizado = indice(/^autorizado por/i);
  const tramo = (desde: number, hasta: number) => (desde < 0 ? [] : lineas.slice(desde + 1, hasta < 0 ? undefined : hasta));
  const persona = (l: string[]) => {
    const cargo = l.find(x => /^cargo:/i.test(x));
    return { nombre: l.filter(x => !/^cargo:/i.test(x)).join(' ').trim(), cargo: cargo ? cargo.replace(/^cargo:\s*/i, '').trim() : '' };
  };
  const fechaLinea = lineas.slice(0, Math.max(1, iCreado)).join(' ');
  return {
    fecha: fechaDesdeTexto(fechaLinea),
    creado: persona(tramo(iCreado, iRevisado >= 0 ? iRevisado : iAutorizado)),
    revisado: tramo(iRevisado, iAutorizado).join('\n'),
    autorizado: persona(tramo(iAutorizado, -1)),
  };
}

/** Viñetas que siguen a un título (hasta el próximo título o salto de página). */
function vinetasDespuesDe(bloques: Bloque[], titulo: RegExp): string[] {
  const i = bloques.findIndex(b => esTitulo(b, titulo));
  if (i < 0) return [];
  const items: string[] = [];
  for (const b of bloques.slice(i + 1)) {
    if (b.tipo !== 'p' || esEncabezado(b) || b.saltoPagina) break;
    if (b.texto) items.push(b.texto);
  }
  return items;
}

export async function importarDiario(doc: DocumentoLeido, division: Division): Promise<BorradorEntry> {
  const { bloques } = doc;
  const portada = bloques.find((b): b is Tabla => b.tipo === 'tabla');
  if (!portada) throw new Error('No se encontró la portada del informe.');
  const celdas = portada.filas[0] ?? [];
  const textoIzq = normalizar(celdas[0]?.textos.join(' ') ?? '');
  const turno: 'dia' | 'noche' = textoIzq.includes('noche') ? 'noche' : 'dia';
  const datosPortada = leerPortada(celdas[1]?.textos ?? []);

  const descripcion = bloques.find(b => b.tipo === 'p' && /^Este documento detalla/i.test(b.texto));
  const fecha = datosPortada.fecha || fechaDesdeTexto(descripcion?.tipo === 'p' ? descripcion.texto : '');
  if (!fecha) throw new Error('No se pudo leer la fecha del informe.');
  const tituloPersonal = bloques.find(b => esTitulo(b, /^Personal en Turno/i));
  const letraTexto = (tituloPersonal?.tipo === 'p' ? tituloPersonal.texto : '').match(/Turno\s+([AB])\b/i)?.[1]
    ?? (descripcion?.tipo === 'p' ? descripcion.texto.match(/Turno\s+([AB])\b/i)?.[1] : undefined);
  const letra = (letraTexto?.toUpperCase() as 'A' | 'B' | undefined) ?? letraDeFecha(fecha);

  // Personal: la tabla que sigue al título "Personal en Turno …".
  const iPersonal = tituloPersonal ? bloques.indexOf(tituloPersonal) : -1;
  const tablaPersonal = iPersonal >= 0 ? bloques.slice(iPersonal + 1).find((b): b is Tabla => b.tipo === 'tabla') : undefined;
  const personal = (tablaPersonal?.filas ?? [])
    .map(f => ({ nombre: f[0]?.textos.join(' ').trim() ?? '', cargo: f[1]?.textos.join(' ').trim() ?? '' }))
    .filter(p => p.nombre || p.cargo);

  const actividades = vinetasDespuesDe(bloques, /^Actividades Diarias/i);
  const iObs = bloques.findIndex(b => esTitulo(b, /^Observaciones\.?$/i) && b.tipo === 'p' && b.texto !== 'OBSERVACIONES');
  const observaciones: string[] = [];
  if (iObs >= 0) {
    for (const b of bloques.slice(iObs + 1)) {
      if (b.tipo !== 'p' || esEncabezado(b) || b.saltoPagina) break;
      if (b.texto) observaciones.push(b.texto);
    }
  }

  // --- Evidencia fotográfica ------------------------------------------------------------------
  // Cada bloque es una tabla: filas con fotos y, al final, una fila con la leyenda (título del
  // bloque). Un mismo bloque puede ocupar varias hojas (varias tablas seguidas con la misma leyenda).
  const base = crearBorradorAutomatico(fecha, letra, turno, division);
  const vertivCarroPhotos = [...base.vertivCarroPhotos];
  const vertivItemPhotos = [...base.vertivItemPhotos];
  const bloquesFotos: { title: string; photos: (string | null)[] }[] = [];
  const inicioEvidencia = Math.max(iObs, bloques.findIndex(b => esTitulo(b, /^Actividades Diarias/i)));
  let enVertiv = false;
  for (const b of bloques.slice(inicioEvidencia + 1)) {
    if (b.tipo === 'p') {
      if (b.texto === VERTIV_TITLE) enVertiv = true;
      continue;
    }
    if (b === portada || b === tablaPersonal) continue;
    const filas = b.filas;
    // Bloque Vertiv por carro: filas de fotos y filas con el nombre de cada carro, de a pares.
    const nombresCarros = filas.flat().map(c => c.textos.join(' ').trim()).filter(t => VERTIV_CARROS_FLAT.includes(t));
    if (enVertiv && nombresCarros.length >= 2) {
      for (let r = 0; r + 1 < filas.length; r += 2) {
        const fotos = fotosDeCeldas(filas[r]);
        filas[r + 1].forEach((celda, k) => {
          const idx = VERTIV_CARROS_FLAT.indexOf(celda.textos.join(' ').trim());
          if (idx >= 0 && vertivCarroPhotos.length > idx) vertivCarroPhotos[idx] = fotos[k] ?? null;
        });
      }
      continue;
    }
    const ultima = filas[filas.length - 1];
    if (!ultima || !esFilaLeyenda(ultima)) continue;
    const title = ultima[0].textos.join(' ').trim();
    const photos = fotosDeCeldas(filas.slice(0, -1).flat());
    const iItem = VERTIV_ITEMS.indexOf(title);
    if (iItem >= 0 && vertivItemPhotos.length > iItem) { vertivItemPhotos[iItem] = photos[0] ?? null; continue; }
    const anterior = bloquesFotos[bloquesFotos.length - 1];
    if (anterior && anterior.title === title) anterior.photos.push(...photos);
    else bloquesFotos.push({ title, photos });
  }

  // Cada bloque se reconoce como el de su actividad, uno fijo (Noche / mantención GG) o uno extra.
  const evidenceBlocks: EvidenceBlockLike[] = [];
  for (const [n, bloque] of bloquesFotos.entries()) {
    const photos = await prepararFotos(bloque.photos);
    const comun = { photos, photoCount: photos.length };
    const fijoNoche = turno === 'noche' ? DEFAULT_EVIDENCIAS_NOCHE.find(t => normalizar(t) === normalizar(bloque.title)) : undefined;
    const actIndex = actividades.findIndex(a => normalizar(a) === normalizar(bloque.title));
    if (fijoNoche) {
      evidenceBlocks.push({ id: `evidence_noche_${DEFAULT_EVIDENCIAS_NOCHE.indexOf(fijoNoche)}`, title: fijoNoche, isActivity: false, isFixed: true, ...comun });
    } else if (/^Registro de mantenimiento de GG\./i.test(bloque.title)) {
      evidenceBlocks.push({ id: 'evidence_mantenimiento_gg', title: bloque.title, isActivity: false, isFixed: true, ...comun });
    } else if (actIndex >= 0) {
      evidenceBlocks.push({ id: `act_importado_${n}__${actIndex}`, title: actividades[actIndex], isActivity: true, actIndex, ...comun });
    } else {
      evidenceBlocks.push({ id: `extra_importado_${n}`, title: bloque.title, isActivity: false, ...comun });
    }
  }

  return {
    ...base,
    id: idBorradorAutomatico(fecha, letra, turno, division),
    creadoNombre: datosPortada.creado.nombre || base.creadoNombre,
    creadoCargo: datosPortada.creado.cargo || base.creadoCargo,
    revisadoText: datosPortada.revisado || base.revisadoText,
    autorizadoNombre: datosPortada.autorizado.nombre || base.autorizadoNombre,
    autorizadoCargo: datosPortada.autorizado.cargo || base.autorizadoCargo,
    personal: personal.length ? personal : base.personal,
    actividades: actividades.length ? actividades : base.actividades,
    observaciones,
    evidenceBlocks,
    vertivCarroPhotos: await prepararFotos(vertivCarroPhotos),
    vertivItemPhotos: await prepararFotos(vertivItemPhotos),
    savedAt: new Date().toISOString(),
    division,
  };
}
