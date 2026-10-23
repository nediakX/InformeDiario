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

/** Foto que es una hoja del checklist enviada por el Checklist de Camioneta. */
const esHojaChecklist = (foto: string, bloque: EvidenceBlockLike) =>
  foto.includes('/checklist/') || Object.values(bloque.checklistFotos ?? {}).some(l => l.includes(foto));

/** Carpeta de cada camioneta: las hojas se suben a .../checklist/<clave>/<archivo>. */
const claveDeHoja = (foto: string) => /\/checklist\/([^/?#]+)\//.exec(foto)?.[1] ?? null;

/** Hojas del checklist que hay en un bloque: posición de cada foto y camioneta a la que pertenece. */
export function hojasDelChecklist(bloque: EvidenceBlockLike): { indice: number; clave: string }[] {
  const claveDe = new Map<string, string>();
  for (const [clave, fotos] of Object.entries(bloque.checklistFotos ?? {})) for (const foto of fotos) claveDe.set(foto, clave);
  const hojas: { indice: number; clave: string }[] = [];
  bloque.photos.forEach((foto, indice) => {
    const clave = foto ? (claveDe.get(foto) ?? claveDeHoja(foto)) : null;
    if (clave) hojas.push({ indice, clave });
  });
  return hojas;
}

/**
 * Un solo registro de checklist por día: queda el de la camioneta que se envió primero. Las hojas nuevas
 * van al comienzo del bloque, así que la primera enviada es la que queda más atrás.
 */
export function claveDelRegistro(bloque: EvidenceBlockLike): string | null {
  const hojas = hojasDelChecklist(bloque);
  return hojas.length ? hojas[hojas.length - 1].clave : null;
}

/** Quita las hojas de las camionetas que no son el registro del día; las demás fotos se mantienen. */
export function soloUnRegistroChecklist<T extends EvidenceBlockLike>(bloques: T[]): T[] {
  return bloques.map(b => {
    const queda = claveDelRegistro(b);
    const hojas = hojasDelChecklist(b);
    if (!queda || hojas.every(h => h.clave === queda)) return b;
    const photos = b.photos.filter((_, i) => !hojas.some(h => h.indice === i && h.clave !== queda));
    const checklistFotos = Object.fromEntries(Object.entries(b.checklistFotos ?? {}).filter(([clave]) => clave === queda));
    return { ...b, photos, photoCount: photos.length, checklistFotos };
  });
}

/**
 * Pone las hojas del registro de la camioneta `clave` en el bloque: se quitan las que ya había (de esa
 * camioneta o de otra) y las nuevas van donde estaban las anteriores, o al comienzo si no había. Las fotos
 * que la persona subió a mano se mantienen.
 */
export function ponerHojasEnBloque(bloque: EvidenceBlockLike, clave: string, hojas: string[]): EvidenceBlockLike {
  const indicesHojas = new Set(hojasDelChecklist(bloque).map(h => h.indice));
  const manual = (foto: Foto, i: number) => !!foto && !indicesHojas.has(i);
  const llenas = bloque.photos.filter((foto, i): foto is string => manual(foto, i));
  const primera = indicesHojas.size ? Math.min(...indicesHojas) : 0;
  const posicion = bloque.photos.slice(0, primera).filter(manual).length;
  const photos = [...llenas.slice(0, posicion), ...hojas, ...llenas.slice(posicion)];
  return { ...bloque, photos, photoCount: photos.length, checklistFotos: { [clave]: hojas } };
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
    // Hojas del Checklist de Camioneta: las manda el checklist directo a la nube, así que las de la
    // nube son siempre las vigentes (las de aquí pueden ser de un envío anterior).
    const hojasRemotas = par.photos.filter((p): p is string => !!p && esHojaChecklist(p, par));
    if (hojasRemotas.length) {
      const manuales = [...b.photos.filter(p => !(p && esHojaChecklist(p, b))), ...par.photos.filter(p => !(p && esHojaChecklist(p, par)))];
      const sinRepetir = manuales.filter((p, i) => p && manuales.indexOf(p) === i);
      const photos = [...hojasRemotas, ...sinRepetir];
      return { ...b, photos, photoCount: photos.length, checklistFotos: { ...b.checklistFotos, ...par.checklistFotos } };
    }
    const photos = mezclarFotos(b.photos, par.photos);
    return { ...b, photos, photoCount: photos.length };
  });
  // Bloques extra (no de actividades) que creó el otro equipo y aquí no existen.
  for (const o of otros) {
    if (usados.has(o) || o.isActivity || o.isFixed || !o.photos?.some(Boolean)) continue;
    if (mezclados.some(b => b.id === o.id || (o.cuadroVertiv && b.cuadroVertiv))) continue;
    mezclados.push({ ...(o as T) });
  }
  return soloUnRegistroChecklist(mezclados);
}

/** true si las dos versiones tienen las mismas fotos (para no guardar ni redibujar de más). */
export const mismasFotos = (a: EvidenceBlockLike[], b: EvidenceBlockLike[]) =>
  JSON.stringify(a.map(x => x.photos)) === JSON.stringify(b.map(x => x.photos));
