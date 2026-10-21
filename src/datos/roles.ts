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

/** Bloques del panel principal ("Mini" = versión de una línea, para la columna lateral). */
export type BloqueInicio = 'contrato' | 'revisar' | 'turno' | 'turnoMini' | 'hoy' | 'generadores' | 'generadoresMini' | 'accesos';
/** Accesos directos a pantallas. */
export type IdTarea = 'checklist' | 'gg' | 'impresion' | 'cierre' | 'falla' | 'mantenimiento' | 'borradores' | 'recuperar' | 'admin';

export interface DisenoInicio {
  /** Columna principal: lo que responde la pregunta del rol, en grande. */
  principal: BloqueInicio[];
  /** Columna lateral (debajo en el celular): contexto en versión corta y accesos directos. */
  lateral: BloqueInicio[];
  /** Accesos directos del rol (el resto queda en "Todas las opciones"). */
  accesos: IdTarea[];
}

export const DISENO_INICIO: Record<Rol, DisenoInicio> = {
  tecnico: { principal: ['hoy', 'revisar'], lateral: ['accesos', 'turnoMini', 'generadoresMini'], accesos: ['checklist', 'gg', 'falla', 'borradores'] },
  electrico: { principal: ['hoy', 'revisar'], lateral: ['accesos', 'generadoresMini', 'turnoMini'], accesos: ['falla', 'checklist', 'mantenimiento', 'borradores'] },
  electromecanico: { principal: ['generadores', 'hoy'], lateral: ['accesos', 'turnoMini'], accesos: ['gg', 'mantenimiento', 'checklist', 'borradores'] },
  supervisor: { principal: ['revisar', 'generadores', 'hoy'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'impresion', 'cierre', 'borradores'] },
  jefe: { principal: ['turno', 'revisar', 'hoy'], lateral: ['generadoresMini', 'accesos'], accesos: ['cierre', 'impresion', 'gg', 'borradores'] },
  contrato: { principal: ['contrato', 'turno'], lateral: ['generadoresMini', 'accesos'], accesos: ['admin', 'cierre', 'gg', 'borradores'] },
};

/** "Ver todo": el inicio completo, igual para todos, en una columna. */
export const ORDEN_COMPLETO: BloqueInicio[] = ['turno', 'hoy', 'revisar', 'generadores'];
