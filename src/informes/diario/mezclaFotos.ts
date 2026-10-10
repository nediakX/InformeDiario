// Mezcla de fotos entre dos versiones del mismo Informe Diario (ej: dos celulares con el informe
// abierto a la vez). Cada uno puede agregar fotos sin borrar las que subió el otro: lo que en una
// versión está vacío se completa con lo que trae la otra.
import type { EvidenceBlockLike } from '../../datos/borradoresDiario';

type Foto = string | null;

/** Casilla por casilla: se queda la foto propia y, donde no hay, la de la otra versión. */
export function mezclarFotos(propias: Foto[], otras: Foto[]): Foto[] {
  const largo = Math.max(propias.length, otras.length);
  const resultado: Foto[] = [];
  for (let i = 0; i < largo; i++) {
    if (i < propias.length) resultado.push(propias[i] ?? otras[i] ?? null);
    else if (otras[i]) resultado.push(otras[i]); // casillas nuevas que agregó el otro equipo, con foto
  }
  return resultado;
}

/** Bloques de evidencia: se emparejan por id (o por nombre) y se mezclan sus fotos. */
export function mezclarBloques<T extends EvidenceBlockLike>(propios: T[], otros: EvidenceBlockLike[]): T[] {
  const usados = new Set<EvidenceBlockLike>();
  const buscar = (b: T) => {
    const par = otros.find(o => !usados.has(o) && o.id === b.id)
      ?? otros.find(o => !usados.has(o) && !!b.title && o.title === b.title && !!o.isActivity === !!b.isActivity);
    if (par) usados.add(par);
    return par;
  };
  const mezclados = propios.map(b => {
    const par = buscar(b);
    if (!par || !par.photos?.some(Boolean)) return b;
    const photos = mezclarFotos(b.photos, par.photos);
    return { ...b, photos, photoCount: photos.length };
  });
  // Bloques extra (no de actividades) que creó el otro equipo y aquí no existen.
  for (const o of otros) {
    if (usados.has(o) || o.isActivity || o.isFixed || !o.photos?.some(Boolean)) continue;
    if (mezclados.some(b => b.id === o.id || (o.cuadroVertiv && b.cuadroVertiv))) continue;
    mezclados.push({ ...(o as T) });
  }
  return mezclados;
}

/** true si las dos versiones tienen las mismas fotos (para no guardar ni redibujar de más). */
export const mismasFotos = (a: EvidenceBlockLike[], b: EvidenceBlockLike[]) =>
  JSON.stringify(a.map(x => x.photos)) === JSON.stringify(b.map(x => x.photos));
