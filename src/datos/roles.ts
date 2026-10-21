// Rol de cada persona para ordenar su pantalla de inicio (solo cambia QUÉ se ve primero; los
// permisos no cambian). Se toma del cargo en el listado de trabajadores, buscando por el RUT de la
// cuenta (o por el nombre si no tiene RUT). Si no se encuentra, se usa la vista de técnico.
import { TRABAJADORES, buscarTrabajador, rutLimpio } from './trabajadores';
import type { Division } from './divisiones';

export type Rol = 'contrato' | 'jefe' | 'supervisor' | 'electromecanico' | 'electrico' | 'tecnico';

export const ETIQUETA_ROL: Record<Rol, string> = {
  contrato: 'Administración de contrato',
  jefe: 'Jefe de turno',
  supervisor: 'Supervisor',
  electromecanico: 'Electromecánico',
  electrico: 'Técnico eléctrico',
  tecnico: 'Técnico',
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function rolDeCargo(cargo: string): Rol {
  const c = sinTildes(cargo);
  if (/administrador de contrato|gerente|director/.test(c)) return 'contrato';
  if (/jefe de turno/.test(c)) return 'jefe';
  if (/supervisor|lider tecnico|experto sso/.test(c)) return 'supervisor';
  if (/electromecanic/.test(c)) return 'electromecanico';
  if (/electric/.test(c)) return 'electrico';
  return 'tecnico';
}

export function rolDePersona(rut: string | null | undefined, nombre: string, division: Division): { rol: Rol; cargo: string | null } {
  const r = rutLimpio(rut);
  const t = (r && TRABAJADORES[division].find(x => rutLimpio(x.rut) === r)) || buscarTrabajador(nombre, division);
  return t ? { rol: rolDeCargo(t.cargo), cargo: t.cargo } : { rol: 'tecnico', cargo: null };
}

/** Bloques del panel principal. */
export type BloqueInicio = 'contrato' | 'revisar' | 'turno' | 'hoy' | 'generadores' | 'opciones';

/** Orden del inicio para cada rol: arriba lo que responde la pregunta de ese rol. */
export const ORDEN_INICIO: Record<Rol, BloqueInicio[]> = {
  contrato: ['contrato', 'generadores', 'turno', 'opciones', 'hoy'],
  jefe: ['turno', 'revisar', 'generadores', 'hoy', 'opciones'],
  supervisor: ['revisar', 'generadores', 'hoy', 'turno', 'opciones'],
  electromecanico: ['generadores', 'hoy', 'opciones', 'turno'],
  electrico: ['hoy', 'opciones', 'generadores', 'turno'],
  tecnico: ['hoy', 'opciones', 'turno', 'generadores'],
};

/** "Ver todo": el inicio completo, igual para todos. */
export const ORDEN_COMPLETO: BloqueInicio[] = ['turno', 'hoy', 'revisar', 'generadores', 'opciones'];
