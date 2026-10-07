// Personal del turno para la impresión: nombres y cargos salen de la dotación guardada del
// Informe Diario; los RUT se recuerdan en este dispositivo (y, para administradores, se completan
// desde las cuentas registradas cuyo nombre coincide).
import { getPersonalGuardado } from '../informes/diario/constantes';
import { CONFIG_DIVISION, type Division } from '../datos/divisiones';
import type { Persona } from './plantillas';

const CLAVE_RUTS = 'psinet_ruts_personal_v1';

export interface PersonaImpresion extends Persona { incluir: boolean }

/** "Max Diaz." → "Max Diaz" (los nombres del Informe Diario terminan en punto). */
const limpiar = (t: string) => t.trim().replace(/\.+$/, '').trim();

export const normalizarNombre = (t: string) =>
  limpiar(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');

export function leerRutsGuardados(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CLAVE_RUTS) ?? '{}') as Record<string, string>; } catch { return {}; }
}

export function guardarRut(nombre: string, rut: string) {
  try {
    const mapa = leerRutsGuardados();
    mapa[normalizarNombre(nombre)] = rut;
    localStorage.setItem(CLAVE_RUTS, JSON.stringify(mapa));
  } catch { /* sin almacenamiento local */ }
}

/** Busca el RUT de una persona entre cuentas registradas: todas las palabras del nombre corto deben estar en el registrado. */
export function rutDesdeCuentas(nombre: string, cuentas: { nombre: string; rut: string | null }[]): string {
  const palabras = normalizarNombre(nombre).split(' ').filter(p => p.length > 1);
  if (!palabras.length) return '';
  const coincidencias = cuentas.filter(c => {
    const registrado = new Set(normalizarNombre(c.nombre).split(' '));
    return c.rut && palabras.every(p => registrado.has(p));
  });
  return coincidencias.length === 1 ? coincidencias[0].rut ?? '' : '';
}

export function personalDelTurno(
  letra: string,
  cuentas: { nombre: string; rut: string | null }[] = [],
  division: Division = 'el_salvador',
): PersonaImpresion[] {
  const ruts = leerRutsGuardados();
  // Si la división aún no tiene personal guardado para el turno, se parte del personal sugerido de la división.
  const guardado = getPersonalGuardado(letra, division);
  const base = guardado.length || division === 'el_salvador' ? guardado : CONFIG_DIVISION[division].personalSugerido;
  return base.map(p => {
    const nombre = limpiar(p.nombre);
    return {
      nombre,
      cargo: limpiar(p.cargo),
      rut: ruts[normalizarNombre(nombre)] || rutDesdeCuentas(nombre, cuentas),
      incluir: true,
    };
  });
}
