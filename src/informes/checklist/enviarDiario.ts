// Checklist → Informe Diario: al completar el checklist de un día, las 2 hojas del registro se
// guardan como imágenes en la evidencia "Registro de Check List de Vehículo Liviano." del Informe
// Diario (Turno Día) de esa fecha. Hay un solo registro por día: queda el primero que se envió. Si se
// vuelve a enviar la misma camioneta, se reemplazan sus hojas; si es otra, no se guarda salvo que se elija
// reemplazarla (se avisa).
import type { Division } from '../../datos/divisiones';
import { type BorradorEntry, type EvidenceBlockLike, esSemillaSinEditar, fetchBorradores, upsertBorrador } from '../../datos/borradoresDiario';
import { letraDeFecha } from '../../datos/turnos';
import { uploadPhotoIfNeeded } from '../../lib/storage';
import { EVENTO_SINCRONIZADO } from '../../lib/sincronizacion';
import { hojasDocxComoImagenes } from '../../lib/vistaDocx';
import { actividadesSinEvidencia, crearBorradorAutomatico, EVIDENCIAS_EXCLUIDAS_DIA, formatFechaEvidencia } from '../diario/constantes';
import { claveDelRegistro, ponerHojasEnBloque } from '../diario/mezclaFotos';
import { clavePatente } from './catalogo';

export const ACTIVIDAD_CHECKLIST = 'Registro de Check List de Vehículo Liviano.';

/** Ya hay hojas de otra camioneta en el Informe Diario de ese día: solo se guarda el primer registro. */
export class RegistroYaEnDiario extends Error {
  constructor() {
    super('Ya hay un checklist de otra camioneta en el Informe Diario de esta fecha: solo se guarda el primero que se envió.');
    this.name = 'RegistroYaEnDiario';
    Object.setPrototypeOf(this, RegistroYaEnDiario.prototype);
  }
}

/** Bloques de evidencia de un Turno Día recién creado (los mismos que arma el Informe Diario al abrirlo). */
function bloquesDia(entry: BorradorEntry): EvidenceBlockLike[] {
  const sello = Date.now();
  const bloques: EvidenceBlockLike[] = [];
  const sinEvidencia = new Set(actividadesSinEvidencia('dia', entry.division));
  entry.actividades.forEach((titulo, actIndex) => {
    if (EVIDENCIAS_EXCLUIDAS_DIA.has(titulo) || sinEvidencia.has(titulo)) return;
    bloques.push({ id: `act_${sello}__${actIndex}`, title: titulo, photoCount: 1, photos: [null], isActivity: true, actIndex });
  });
  bloques.push({
    id: 'evidence_mantenimiento_gg', title: `Registro de mantenimiento de GG. (${formatFechaEvidencia(entry.fecha)})`,
    photoCount: 1, photos: [null], isActivity: false, isFixed: true,
  });
  return bloques;
}

/** Carpeta donde se suben las hojas del checklist de una camioneta (así se reconocen siempre). */
const carpetaHojas = (idBorrador: string, clave: string) => `borradores/${idBorrador}/checklist/${clave || 'sin_patente'}`;

/**
 * Genera las imágenes de las hojas del checklist (`blob`) y las guarda en el Turno Día de `fecha`.
 */
export async function enviarChecklistAlDiario({ blob, patente, fecha, division, reemplazar = false }: {
  blob: Blob; patente: string; fecha: string; division: Division; reemplazar?: boolean;
}): Promise<void> {
  // Igual que la carpeta de las hojas: una patente vacía se guarda como «sin_patente» (así se reconoce después).
  const clave = clavePatente(patente) || 'sin_patente';
  const imagenes = await hojasDocxComoImagenes(blob, 2);
  if (!imagenes.length) throw new Error('No se pudieron sacar las hojas del checklist.');

  const letra = letraDeFecha(fecha);
  const lista = await fetchBorradores(division);
  const existente = lista.find(b => b.fecha === fecha && b.turno === 'dia' && b.letraTurno === letra && !esSemillaSinEditar(b));
  const base = existente ?? crearBorradorAutomatico(fecha, letra, 'dia', division);

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

  // Un solo registro por día: si ya quedó el de otra camioneta, este no se guarda (y no se suben sus hojas),
  // salvo que la persona elija reemplazarlo: entonces ponerHojasEnBloque quita las hojas anteriores.
  const queda = claveDelRegistro(bloques[i]);
  if (!reemplazar && queda && queda !== clave) throw new RegistroYaEnDiario();

  // Se suben primero para que las fotos del bloque sean las direcciones definitivas (así se reconocen al reemplazarlas).
  const hojas = (await Promise.all(imagenes.map(img => uploadPhotoIfNeeded(img, carpetaHojas(base.id, clave))))).filter((u): u is string => !!u);
  if (!hojas.length) throw new Error('No se pudieron guardar las hojas del checklist.');
  bloques[i] = ponerHojasEnBloque(bloques[i], clave, hojas);

  await upsertBorrador({ ...base, evidenceBlocks: bloques, savedAt: new Date().toISOString() });
  // Las listas de borradores abiertas se vuelven a leer (el panel muestra al tiro el informe con las hojas).
  window.dispatchEvent(new Event(EVENTO_SINCRONIZADO));
}
