// Mezcla de los textos de un Informe Diario abierto en dos equipos (ej: el supervisor corrige el personal
// mientras otro celular tiene el mismo informe abierto). Se compara cada campo con la última versión que
// los dos compartían (la "base"): lo que cambió el otro equipo y aquí no se tocó se toma; lo que se cambió
// aquí se mantiene. En las listas (personal, actividades, observaciones) se suman los cambios de los dos.
// Sin esto, el autoguardado de un equipo devolvía a la nube su versión vieja y los dos equipos se
// quedaban guardando uno encima del otro.
import type { BorradorEntry } from '../../datos/borradoresDiario';

export const CAMPOS_TEXTO = [
  'faena', 'letraTurno', 'contrato', 'version', 'servicio', 'creadoNombre', 'creadoCargo',
  'revisadoText', 'autorizadoNombre', 'autorizadoCargo', 'personal', 'actividades', 'observaciones',
] as const;

export type CampoTexto = typeof CAMPOS_TEXTO[number];
export type TextosInforme = Pick<BorradorEntry, CampoTexto>;

export const textosDe = (b: TextosInforme): TextosInforme =>
  Object.fromEntries(CAMPOS_TEXTO.map(c => [c, b[c]])) as unknown as TextosInforme;

/** JSON con las claves ordenadas: la nube puede devolver los objetos con las claves en otro orden. */
export const jsonEstable = (valor: unknown): string => JSON.stringify(valor, (_clave, v: unknown) => (
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    : v
));

export const mismoValor = (a: unknown, b: unknown) => a === b || jsonEstable(a) === jsonEstable(b);

/**
 * Lista de aquí con los cambios que hizo el otro equipo desde la base: lo que agregó entra después del
 * elemento que lo antecede en su lista (o al comienzo) y lo que quitó se quita. Así, si cada uno cambia
 * una persona o una actividad distinta, quedan los dos cambios.
 */
export function mezclarLista<T>(local: T[], base: T[], remoto: T[]): T[] {
  const clave = (x: T) => jsonEstable(x);
  const contar = (lista: T[]) => {
    const m = new Map<string, number>();
    for (const x of lista) m.set(clave(x), (m.get(clave(x)) ?? 0) + 1);
    return m;
  };
  const enBase = contar(base);
  const enRemoto = contar(remoto);
  const resultado = [...local];
  for (const [k, nBase] of enBase) {
    let quitar = nBase - (enRemoto.get(k) ?? 0);
    for (let i = resultado.length - 1; i >= 0 && quitar > 0; i--) {
      if (clave(resultado[i]) === k) { resultado.splice(i, 1); quitar -= 1; }
    }
  }
  const porAgregar = new Map<string, number>();
  for (const [k, nRemoto] of enRemoto) {
    const n = nRemoto - (enBase.get(k) ?? 0);
    if (n > 0) porAgregar.set(k, n);
  }
  remoto.forEach((x, i) => {
    const k = clave(x);
    const n = porAgregar.get(k) ?? 0;
    if (n <= 0) return;
    porAgregar.set(k, n - 1);
    let posicion = 0;
    for (let j = i - 1; j >= 0; j--) {
      const anterior = clave(remoto[j]);
      const p = resultado.findIndex(y => clave(y) === anterior);
      if (p >= 0) { posicion = p + 1; break; }
    }
    resultado.splice(posicion, 0, x);
  });
  return resultado;
}

/** Valor de un campo después de mezclar la versión de otro equipo (sin base, queda el de aquí). */
export function campoMezclado<K extends CampoTexto>(campo: K, local: TextosInforme[K], base: TextosInforme | null, remoto: TextosInforme): TextosInforme[K] {
  if (!base) return local;
  const deBase = base[campo];
  const deRemoto = remoto[campo];
  if (mismoValor(deRemoto, deBase) || mismoValor(local, deRemoto)) return local; // el otro no lo cambió, o ya está igual
  if (mismoValor(local, deBase)) return deRemoto;                              // solo lo cambió el otro
  // Los dos lo cambiaron: en las listas se suman los cambios; en los textos sueltos queda el de aquí.
  if (Array.isArray(local) && Array.isArray(deBase) && Array.isArray(deRemoto)) {
    const lista = mezclarLista(local as unknown[], deBase as unknown[], deRemoto as unknown[]);
    return mismoValor(lista, local) ? local : lista as TextosInforme[K];
  }
  return local;
}

export function mezclarTextos<T extends TextosInforme>(local: T, base: TextosInforme | null, remoto: TextosInforme): T {
  if (!base) return local;
  const resultado = { ...local };
  for (const campo of CAMPOS_TEXTO) (resultado as Record<CampoTexto, unknown>)[campo] = campoMezclado(campo, local[campo], base, remoto);
  return resultado;
}

/** Contenido del informe que se guarda en la nube (sin la hora de guardado ni las marcas que cambian aparte). */
const contenido = (b: BorradorEntry) => jsonEstable({
  ...textosDe(b), turno: b.turno, fecha: b.fecha, division: b.division,
  evidenceBlocks: b.evidenceBlocks, vertivCarroPhotos: b.vertivCarroPhotos, vertivItemPhotos: b.vertivItemPhotos,
});

/** true si el informe de aquí es igual a la versión de la nube (no hay nada propio que guardar). */
export const mismoContenido = (a: BorradorEntry, b: BorradorEntry | null) => Boolean(b) && contenido(a) === contenido(b as BorradorEntry);
