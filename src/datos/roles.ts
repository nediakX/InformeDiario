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

/** Nombre corto para el selector de vista del inicio. */
export const ETIQUETA_CORTA_ROL: Record<Rol, string> = {
  contrato: 'Contrato', jefe: 'Jefe de turno', supervisor: 'Supervisor', electromecanico: 'Electromecánico', electrico: 'Eléctrico', tecnico: 'Técnico',
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

export const ROLES: Rol[] = ['tecnico', 'electrico', 'electromecanico', 'supervisor', 'jefe', 'contrato'];
export const esRol = (v: unknown): v is Rol => typeof v === 'string' && (ROLES as string[]).includes(v);

/** Rol según el listado de trabajadores (sin contar el que asigne un administrador). */
export function rolDelListado(rut: string | null | undefined, nombre: string, division: Division): { rol: Rol; cargo: string | null } {
  const r = rutLimpio(rut);
  const t = (r && TRABAJADORES[division].find(x => rutLimpio(x.rut) === r)) || buscarTrabajador(nombre, division);
  return t ? { rol: rolDeCargo(t.cargo), cargo: t.cargo } : { rol: 'tecnico', cargo: null };
}

/** Rol con que trabaja la persona: el asignado por un administrador o, si no hay, el del listado. */
export function rolDePersona(perfil: { rut: string | null; rol?: string | null }, nombre: string, division: Division): { rol: Rol; asignado: boolean } {
  if (esRol(perfil.rol)) return { rol: perfil.rol, asignado: true };
  return { rol: rolDelListado(perfil.rut, nombre, division).rol, asignado: false };
}

/** Puede corregir y borrar reportes de GG (igual que la función es_supervisor() de la base de datos). */
export function esSupervisorGG(perfil: { rut: string | null; rol?: string | null }, _division: Division, esSupervisorListado: boolean): boolean {
  if (esRol(perfil.rol)) return perfil.rol === 'supervisor' || perfil.rol === 'jefe';
  return esSupervisorListado;
}

/** Bloques del panel principal ("Mini" = versión de una línea, para la columna lateral). */
export type BloqueInicio = 'contrato' | 'revisar' | 'turno' | 'turnoMini' | 'hoy' | 'generadores' | 'generadoresMini' | 'accesos';
/** Accesos directos a pantallas. */
export type IdTarea = 'checklist' | 'gg' | 'impresion' | 'cierre' | 'falla' | 'mantenimiento' | 'preventiva' | 'mapa' | 'borradores' | 'recuperar' | 'admin';

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
  supervisor: { principal: ['revisar', 'generadores', 'hoy'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'impresion', 'cierre', 'preventiva', 'borradores'] },
  jefe: { principal: ['turno', 'revisar', 'hoy'], lateral: ['generadoresMini', 'accesos'], accesos: ['cierre', 'impresion', 'gg', 'borradores'] },
  contrato: { principal: ['contrato', 'turno'], lateral: ['generadoresMini', 'accesos'], accesos: ['admin', 'cierre', 'gg', 'borradores'] },
};

/** "Ver todo": el inicio completo, igual para todos, en una columna. */
export const ORDEN_COMPLETO: BloqueInicio[] = ['turno', 'hoy', 'revisar', 'generadores'];
