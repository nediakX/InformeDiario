// "Deshacer" para todo lo que se borra en la app.
//
// Cada vez que se elimina algo (una foto, una actividad, una persona del personal, un borrador
// completo…) se registra aquí cómo volver atrás. La barra flotante (componentes/BarraDeshacer)
// muestra "Se eliminó … · Deshacer" y también responde a Ctrl+Z (fuera de los campos de texto).
//
// Borrados en la nube (un borrador completo): no se ejecutan al instante. Se oculta el borrador y
// el borrado real (`confirmar`) se hace pasados 15 segundos, o al salir de la pantalla / cerrar la
// app. Mientras tanto se puede deshacer sin perder nada (ni siquiera las fotos guardadas en la nube).

import { useSyncExternalStore } from 'react';

export interface AccionDeshacer {
  id: number;
  mensaje: string;
  deshacer: () => void;
  /** Borrado definitivo pendiente (ej: eliminar en la nube). Se ejecuta si no se deshace a tiempo. */
  confirmar?: () => void;
  registradaEn: number;
}

/** Tiempo para deshacer (la barra desaparece y el borrado en la nube se hace definitivo). */
export const ESPERA_DESHACER = 15_000;
const MAXIMO_EN_PILA = 30;

let pila: AccionDeshacer[] = [];
let siguienteId = 1;
const temporizadores = new Map<number, ReturnType<typeof setTimeout>>();
const oyentes = new Set<() => void>();
let ultimoAviso: { texto: string; en: number } | null = null;

const avisar = () => oyentes.forEach(fn => fn());

function quitar(id: number) {
  const t = temporizadores.get(id);
  if (t) clearTimeout(t);
  temporizadores.delete(id);
  pila = pila.filter(a => a.id !== id);
}

function ejecutarConfirmacion(accion: AccionDeshacer) {
  quitar(accion.id);
  try { accion.confirmar?.(); } catch (error) { console.error('No se pudo completar el borrado:', error); }
}

/**
 * Registra algo que se acaba de borrar.
 * @param mensaje Texto corto: "Se eliminó la foto".
 * @param deshacer Cómo volver a dejarlo como estaba.
 * @param confirmar (opcional) Borrado definitivo, que se ejecuta pasados ESPERA_DESHACER ms si no se deshace.
 */
export function registrarDeshacer(mensaje: string, deshacer: () => void, confirmar?: () => void): void {
  const accion: AccionDeshacer = { id: siguienteId++, mensaje, deshacer, confirmar, registradaEn: Date.now() };
  pila = [...pila, accion];
  // Pasados 15 s ya no se puede deshacer: se quita de la pila (y el borrado pendiente se completa).
  temporizadores.set(accion.id, setTimeout(() => {
    if (accion.confirmar) ejecutarConfirmacion(accion); else quitar(accion.id);
    avisar();
  }, ESPERA_DESHACER));
  // Si la pila crece demasiado, lo más antiguo ya no se puede deshacer (y si tenía un borrado pendiente, se hace).
  while (pila.length > MAXIMO_EN_PILA) {
    const vieja = pila[0];
    if (vieja.confirmar) ejecutarConfirmacion(vieja); else quitar(vieja.id);
  }
  ultimoAviso = null;
  avisar();
}

/** Deshace lo último que se borró. Devuelve false si no había nada. */
export function deshacerUltimo(): boolean {
  const accion = pila[pila.length - 1];
  if (!accion) return false;
  quitar(accion.id);
  try {
    accion.deshacer();
    ultimoAviso = { texto: 'Se restauró lo eliminado.', en: Date.now() };
  } catch (error) {
    console.error('No se pudo deshacer:', error);
    ultimoAviso = { texto: 'No se pudo deshacer.', en: Date.now() };
  }
  avisar();
  return true;
}

/**
 * Al salir de una pantalla: los borrados pendientes en la nube se hacen definitivos y se vacía la
 * pila (lo borrado en un formulario que ya no está abierto no se puede restaurar).
 */
export function cerrarDeshacer(): void {
  if (!pila.length && !ultimoAviso) return;
  [...pila].forEach(a => { if (a.confirmar) ejecutarConfirmacion(a); });
  pila.forEach(a => quitar(a.id));
  pila = [];
  ultimoAviso = null;
  avisar();
}

// Al cerrar o recargar la app se completan los borrados pendientes (si no, el borrador reaparecería).
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    [...pila].forEach(a => { if (a.confirmar) ejecutarConfirmacion(a); });
  });
}

interface EstadoDeshacer { ultima: AccionDeshacer | null; cantidad: number; aviso: { texto: string; en: number } | null }
let estadoCache: EstadoDeshacer = { ultima: null, cantidad: 0, aviso: null };

function leerEstado(): EstadoDeshacer {
  const ultima = pila[pila.length - 1] ?? null;
  if (estadoCache.ultima !== ultima || estadoCache.cantidad !== pila.length || estadoCache.aviso !== ultimoAviso) {
    estadoCache = { ultima, cantidad: pila.length, aviso: ultimoAviso };
  }
  return estadoCache;
}

/** Estado actual de la pila, para la barra flotante. */
export function useDeshacer(): EstadoDeshacer {
  return useSyncExternalStore(
    fn => { oyentes.add(fn); return () => { oyentes.delete(fn); }; },
    leerEstado,
    leerEstado,
  );
}

/**
 * Borradores eliminados que todavía esperan su borrado en la nube: las listas que llegan de la nube
 * (o de otro dispositivo) en ese lapso no deben volver a mostrarlos.
 */
export const borrandose = new Set<string>();
export const sinBorrandose = <T extends { id: string },>(lista: T[]): T[] =>
  borrandose.size ? lista.filter(item => !borrandose.has(item.id)) : lista;

/** Inserta `item` en la posición `indice` (o al final si la lista ya es más corta). */
export const reinsertar = <T,>(lista: T[], indice: number, item: T): T[] => {
  const copia = [...lista];
  copia.splice(Math.min(Math.max(0, indice), copia.length), 0, item);
  return copia;
};
