// Checklist → Informe Diario: al completar el checklist de un día, las 2 hojas del registro se
// guardan como imágenes en la evidencia "Registro de Check List de Vehículo Liviano." del Informe
// Diario (Turno Día) de esa fecha. Cada camioneta ocupa sus propias fotos en el bloque: si se vuelve
// a enviar, se reemplazan solo las hojas de esa patente.
import type { Division } from '../../datos/divisiones';
import { type BorradorEntry, type EvidenceBlockLike, esSemillaSinEditar, fetchBorradores, upsertBorrador } from '../../datos/borradoresDiario';
import { letraDeFecha } from '../../datos/turnos';
import { uploadPhotoIfNeeded } from '../../lib/storage';
import { EVENTO_SINCRONIZADO } from '../../lib/sincronizacion';
import { hojasDocxComoImagenes } from '../../lib/vistaDocx';
import { crearBorradorAutomatico, EVIDENCIAS_EXCLUIDAS_DIA, formatFechaEvidencia } from '../diario/constantes';
import { clavePatente } from './catalogo';

export const ACTIVIDAD_CHECKLIST = 'Registro de Check List de Vehículo Liviano.';

/** Bloques de evidencia de un Turno Día recién creado (los mismos que arma el Informe Diario al abrirlo). */
function bloquesDia(entry: BorradorEntry): EvidenceBlockLike[] {
  const sello = Date.now();
  const bloques: EvidenceBlockLike[] = [];
  entry.actividades.forEach((titulo, actIndex) => {
    if (EVIDENCIAS_EXCLUIDAS_DIA.has(titulo)) return;
    bloques.push({ id: `act_${sello}__${actIndex}`, title: titulo, photoCount: 1, photos: [null], isActivity: true, actIndex });
  });
  bloques.push({
    id: 'evidence_mantenimiento_gg', title: `Registro de mantenimiento de GG. (${formatFechaEvidencia(entry.fecha)})`,
    photoCount: 1, photos: [null], isActivity: false, isFixed: true,
  });
  return bloques;
}

/** Pone las hojas de una patente en el bloque: reemplaza las que ya había enviado, si no usa los espacios vacíos y luego agrega. */
export function ponerHojasEnBloque(bloque: EvidenceBlockLike, clave: string, hojas: string[]): EvidenceBlockLike {
  const anteriores = new Set(bloque.checklistFotos?.[clave] ?? []);
  const pendientes = [...hojas];
  let photos = bloque.photos.map(p => (p && anteriores.has(p) ? (pendientes.shift() ?? null) : p));
  photos = photos.map(p => (p === null && pendientes.length ? pendientes.shift()! : p));
  photos.push(...pendientes);
  // Si sobró un espacio vacío por haber menos hojas que antes, se quita (siempre queda al menos uno).
  const llenas = photos.filter(Boolean);
  if (llenas.length && photos.length > llenas.length && anteriores.size) photos = llenas;
  return { ...bloque, photos, photoCount: photos.length, checklistFotos: { ...bloque.checklistFotos, [clave]: hojas } };
}

/**
 * Genera las imágenes de las hojas del checklist (`blob`) y las guarda en el Turno Día de `fecha`.
 */
export async function enviarChecklistAlDiario({ blob, patente, fecha, division }: {
  blob: Blob; patente: string; fecha: string; division: Division;
}): Promise<void> {
  const clave = clavePatente(patente);
  const imagenes = await hojasDocxComoImagenes(blob, 2);
  if (!imagenes.length) throw new Error('No se pudieron sacar las hojas del checklist.');

  const letra = letraDeFecha(fecha);
  const lista = await fetchBorradores(division);
  const existente = lista.find(b => b.fecha === fecha && b.turno === 'dia' && b.letraTurno === letra && !esSemillaSinEditar(b));
  const base = existente ?? crearBorradorAutomatico(fecha, letra, 'dia', division);

  // Se suben primero para que las fotos del bloque sean las direcciones definitivas (así se reconocen al reemplazarlas).
  const hojas = (await Promise.all(imagenes.map(img => uploadPhotoIfNeeded(img, `borradores/${base.id}`)))).filter((u): u is string => !!u);

  let bloques = base.evidenceBlocks.length ? [...base.evidenceBlocks] : bloquesDia(base);
  const actIndex = base.actividades.indexOf(ACTIVIDAD_CHECKLIST);
  let i = bloques.findIndex(b => !b.cuadroVertiv && b.title === ACTIVIDAD_CHECKLIST);
  if (i < 0) {
    // La actividad no tiene bloque (o se quitó de la lista): se agrega antes del mantenimiento de GG.
    const nuevo: EvidenceBlockLike = actIndex >= 0
      ? { id: `act_${Date.now()}__${actIndex}`, title: ACTIVIDAD_CHECKLIST, photoCount: 0, photos: [], isActivity: true, actIndex }
      : { id: `evidence_checklist_${Date.now()}`, title: ACTIVIDAD_CHECKLIST, photoCount: 0, photos: [], isActivity: false };
    const fija = bloques.findIndex(b => b.isFixed);
    i = fija >= 0 ? fija : bloques.length;
    bloques = [...bloques.slice(0, i), nuevo, ...bloques.slice(i)];
  }
  bloques[i] = ponerHojasEnBloque(bloques[i], clave, hojas);

  await upsertBorrador({ ...base, evidenceBlocks: bloques, savedAt: new Date().toISOString() });
  // Las listas de borradores abiertas se vuelven a leer (el panel muestra al tiro el informe con las hojas).
  window.dispatchEvent(new Event(EVENTO_SINCRONIZADO));
}
