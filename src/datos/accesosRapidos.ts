// Accesos rápidos del inicio: mientras la cuenta no elija, son los de su rol; cada cuenta puede
// elegir los suyos (hasta 5, en el orden que quiera) o volver a los del rol cuando quiera.
//
// La elección se guarda en la cuenta (en los datos del usuario de Supabase Auth, así que no necesita
// tablas ni SQL nuevos) y aparece en cualquier equipo donde la persona entre. Va por división: cada una
// tiene sus propias opciones y un administrador puede trabajar en las dos.
//
// Sin señal, el cambio queda en este equipo (se ve al instante) y se sube solo al volver la conexión.
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { esErrorDeRed, hayConexion, suscribirConexion } from '../lib/conexion';
import { esDivision, type Division } from './divisiones';
import { MAX_ACCESOS_RAPIDOS, esIdTarea, type IdTarea } from './roles';

/** Lo elegido en cada división (una división sin elección usa los accesos de su rol). */
type EleccionAccesos = Partial<Record<Division, IdTarea[]>>;
/** Cambios hechos en este equipo que todavía no llegan a la cuenta (null = volver a los del rol). */
type Pendientes = Partial<Record<Division, IdTarea[] | null>>;

export type ResultadoAccesos = 'guardado' | 'pendiente' | 'error';

const CAMPO_CUENTA = 'accesos_rapidos';
const PREFIJO_LOCAL = 'psinet_accesos_rapidos_';

/** Solo opciones conocidas, sin repetir y como máximo 5. */
export function limpiarAccesos(valor: unknown): IdTarea[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter(esIdTarea))].slice(0, MAX_ACCESOS_RAPIDOS);
}

/** Los accesos del rol que la persona puede usar (los primeros 5, en el orden del rol). */
export const accesosDelRol = (delRol: IdTarea[], disponible: (id: IdTarea) => boolean): IdTarea[] =>
  delRol.filter(disponible).slice(0, MAX_ACCESOS_RAPIDOS);

/** Misma lista y en el mismo orden. */
export const mismosAccesos = (a: readonly IdTarea[], b: readonly IdTarea[]) => a.length === b.length && a.every((id, i) => id === b[i]);

function eleccionDeCuenta(user: User | null | undefined): EleccionAccesos {
  const valor: unknown = user?.user_metadata?.[CAMPO_CUENTA];
  const eleccion: EleccionAccesos = {};
  if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
    for (const [division, lista] of Object.entries(valor)) {
      if (esDivision(division) && Array.isArray(lista)) eleccion[division] = limpiarAccesos(lista);
    }
  }
  return eleccion;
}

// --- Cambios de este equipo que esperan subir --------------------------------------------------
const oyentes = new Set<() => void>();
const avisar = () => oyentes.forEach(fn => fn());
const suscribir = (fn: () => void) => { oyentes.add(fn); return () => { oyentes.delete(fn); }; };
/** Lo escrito en esta sesión, por si el almacenamiento del navegador no funciona (modo privado, sin espacio). */
const enMemoria = new Map<string, string | null>();

function leerTexto(userId: string): string | null {
  if (enMemoria.has(userId)) return enMemoria.get(userId) ?? null;
  try { return localStorage.getItem(PREFIJO_LOCAL + userId); } catch { return null; }
}

function leerPendientes(texto: string | null): Pendientes {
  const pendientes: Pendientes = {};
  if (!texto) return pendientes;
  try {
    const valor = JSON.parse(texto) as unknown;
    if (valor && typeof valor === 'object') {
      for (const [division, lista] of Object.entries(valor)) {
        if (esDivision(division)) pendientes[division] = lista === null ? null : limpiarAccesos(lista);
      }
    }
  } catch { /* copia dañada: se ignora */ }
  return pendientes;
}

function escribirPendientes(userId: string, pendientes: Pendientes) {
  const texto = Object.keys(pendientes).length ? JSON.stringify(pendientes) : null;
  enMemoria.set(userId, texto);
  try {
    if (texto) localStorage.setItem(PREFIJO_LOCAL + userId, texto);
    else localStorage.removeItem(PREFIJO_LOCAL + userId);
  } catch { /* sin almacenamiento: queda en memoria mientras la app siga abierta */ }
  avisar();
}

if (typeof window !== 'undefined') {
  // Cambiados en otra pestaña: se vuelven a leer del almacenamiento.
  window.addEventListener('storage', e => {
    if (!e.key?.startsWith(PREFIJO_LOCAL)) return;
    enMemoria.delete(e.key.slice(PREFIJO_LOCAL.length));
    avisar();
  });
}

// --- Subida a la cuenta -------------------------------------------------------------------------
// De a una y en orden: si se guarda dos veces seguidas (o se deshace), en la cuenta queda lo último.
let cola: Promise<unknown> = Promise.resolve();

/** Sube a la cuenta lo que quedó pendiente en este equipo. */
export function sincronizarAccesosRapidos(userId: string): Promise<ResultadoAccesos> {
  const tarea = cola.then(() => subir(userId));
  cola = tarea.catch(() => undefined);
  return tarea;
}

async function subir(userId: string): Promise<ResultadoAccesos> {
  const texto = leerTexto(userId);
  const pendientes = leerPendientes(texto);
  const divisiones = Object.keys(pendientes) as Division[];
  if (!divisiones.length) return 'guardado';
  if (!hayConexion()) return 'pendiente';
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.id !== userId) return 'pendiente';
    // Sobre lo que ya tiene la cuenta (las otras divisiones no se tocan).
    const eleccion = eleccionDeCuenta(user);
    for (const division of divisiones) {
      const lista = pendientes[division];
      if (lista) eleccion[division] = lista;
      else delete eleccion[division];
    }
    const { error } = await supabase.auth.updateUser({ data: { [CAMPO_CUENTA]: Object.keys(eleccion).length ? eleccion : null } });
    if (error) throw error;
  } catch (error) {
    if (esErrorDeRed(error)) return 'pendiente';
    console.warn('No se pudieron guardar los accesos rápidos en la cuenta (quedan en este equipo):', error);
    return 'error';
  }
  // Subido: sale de la cola lo que se subió (si mientras tanto se cambió otra vez, eso sube en la próxima).
  const ahora = leerPendientes(leerTexto(userId));
  for (const division of divisiones) {
    if (JSON.stringify(ahora[division]) === JSON.stringify(pendientes[division])) delete ahora[division];
  }
  escribirPendientes(userId, ahora);
  return 'guardado';
}

/** Guarda los accesos rápidos de la cuenta en una división (null = volver a los de su rol). */
export function guardarAccesosRapidos(userId: string, division: Division, ids: IdTarea[] | null): Promise<ResultadoAccesos> {
  const pendientes = leerPendientes(leerTexto(userId));
  pendientes[division] = ids === null ? null : limpiarAccesos(ids);
  escribirPendientes(userId, pendientes);
  return sincronizarAccesosRapidos(userId);
}

/**
 * Accesos rápidos que eligió la cuenta en esta división, o null si no ha elegido (van los de su rol).
 * `sinSubir`: hay cambios hechos en este equipo que todavía no llegan a la cuenta.
 */
export function useAccesosElegidos(user: User, division: Division): { elegidos: IdTarea[] | null; sinSubir: boolean } {
  const texto = useSyncExternalStore(suscribir, () => leerTexto(user.id), () => null);
  const pendientes = useMemo(() => leerPendientes(texto), [texto]);
  const cuenta = useMemo(() => eleccionDeCuenta(user), [user]);

  // Lo que quedó sin subir se sube al abrir el inicio, al volver la señal y cada vez que se renueva la sesión.
  useEffect(() => {
    void sincronizarAccesosRapidos(user.id);
    return suscribirConexion(() => { if (hayConexion()) void sincronizarAccesosRapidos(user.id); });
  }, [user]);

  const elegidos = division in pendientes ? pendientes[division] ?? null : cuenta[division] ?? null;
  return { elegidos, sinSubir: Object.keys(pendientes).length > 0 };
}
