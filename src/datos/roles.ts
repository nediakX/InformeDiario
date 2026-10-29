// Rol de cada persona para ordenar su pantalla de inicio (solo cambia QUÉ se ve primero; los
// permisos no cambian). Se toma del cargo en el listado de trabajadores, buscando por el RUT de la
// cuenta (o por el nombre si no tiene RUT). Si no se encuentra, se usa la vista de técnico.
import { TRABAJADORES, buscarTrabajador, rutLimpio } from './trabajadores';
import type { Division } from './divisiones';

export type Rol = 'contrato' | 'jefe' | 'supervisor' | 'lider_tecnico' | 'ingeniero_especialista' | 'experto_sso' | 'electromecanico' | 'electrico' | 'tecnico';

export const ETIQUETA_ROL: Record<Rol, string> = {
  contrato: 'Administración de contrato',
  jefe: 'Jefe de turno',
  supervisor: 'Supervisor',
  lider_tecnico: 'Líder Técnico',
  ingeniero_especialista: 'Ingeniero Especialista',
  electromecanico: 'Electromecánico',
  electrico: 'Técnico eléctrico',
  tecnico: 'Técnico',
  experto_sso: 'Experto SSO',
};

/** Nombre corto para el selector de vista del inicio. */
export const ETIQUETA_CORTA_ROL: Record<Rol, string> = {
  contrato: 'Contrato', jefe: 'Jefe de turno', supervisor: 'Supervisor', lider_tecnico: 'Líder técnico', ingeniero_especialista: 'Ing. especialista', electromecanico: 'Electromecánico', electrico: 'Eléctrico', tecnico: 'Técnico', experto_sso: 'Experto SSO',
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function rolDeCargo(cargo: string): Rol {
  const c = sinTildes(cargo);
  if (/administrador de contrato|gerente|director/.test(c)) return 'contrato';
  if (/jefe de turno/.test(c)) return 'jefe';
  if (/supervisor/.test(c)) return 'supervisor';
  if (/experto sso/.test(c)) return 'experto_sso';
  if (/lider tecnico/.test(c)) return 'lider_tecnico';
  if (/ingeniero especialista/.test(c)) return 'ingeniero_especialista';
  if (/electromecanic/.test(c)) return 'electromecanico';
  if (/electric/.test(c)) return 'electrico';
  return 'tecnico';
}

export const ROLES: Rol[] = ['tecnico', 'electrico', 'electromecanico', 'supervisor', 'lider_tecnico', 'ingeniero_especialista', 'jefe', 'contrato'];
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
export type BloqueInicio = 'contrato' | 'revisar' | 'turno' | 'turnoMini' | 'hoy' | 'generadores' | 'generadoresMini' | 'mapa' | 'accesos';
/** Accesos directos a pantallas. */
export type IdTarea = 'checklist' | 'gg' | 'impresion' | 'cierre' | 'presentacion' | 'presentacionFds' | 'falla' | 'mantenimiento' | 'preventiva' | 'mapa' | 'borradores' | 'recuperar' | 'admin';

export interface DisenoInicio {
  /** Columna principal: lo que responde la pregunta del rol, en grande. */
  principal: BloqueInicio[];
  /** Columna lateral (debajo en el celular): contexto en versión corta y accesos directos. */
  lateral: BloqueInicio[];
  /** Accesos directos del rol (el resto queda en "Todas las opciones"). */
  accesos: IdTarea[];
}

export const DISENO_INICIO: Record<Rol, DisenoInicio> = {
  tecnico: { principal: ['hoy', 'revisar', 'mapa'], lateral: ['accesos', 'turnoMini', 'generadoresMini'], accesos: ['checklist', 'gg', 'falla', 'borradores'] },
  experto_sso: { principal: ['hoy', 'revisar', 'mapa'], lateral: ['accesos', 'turnoMini', 'generadoresMini'], accesos: ['checklist', 'gg', 'falla', 'borradores'] },
  electrico: { principal: ['hoy', 'revisar', 'mapa'], lateral: ['accesos', 'generadoresMini', 'turnoMini'], accesos: ['falla', 'checklist', 'mantenimiento', 'borradores'] },
  electromecanico: { principal: ['generadores', 'hoy', 'mapa'], lateral: ['accesos', 'turnoMini'], accesos: ['gg', 'mantenimiento', 'checklist', 'borradores'] },
  supervisor: { principal: ['revisar', 'generadores', 'hoy', 'mapa'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'impresion', 'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'borradores'] },
  lider_tecnico: { principal: ['revisar', 'generadores', 'hoy', 'mapa'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'impresion', 'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'borradores'] },
  ingeniero_especialista: { principal: ['revisar', 'generadores', 'hoy', 'mapa'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'impresion', 'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'borradores'] },
  jefe: { principal: ['turno', 'revisar', 'hoy', 'mapa'], lateral: ['generadoresMini', 'accesos'], accesos: ['cierre', 'presentacion', 'presentacionFds', 'impresion', 'gg', 'borradores'] },
  contrato: { principal: ['contrato', 'turno', 'mapa'], lateral: ['generadoresMini', 'accesos'], accesos: ['admin', 'cierre', 'presentacion', 'presentacionFds', 'gg', 'borradores'] },
};

/** "Ver todo": el inicio completo, igual para todos, en una columna. */
export const ORDEN_COMPLETO: BloqueInicio[] = ['turno', 'hoy', 'revisar', 'generadores', 'mapa'];

/** Inicio de División Andina: su propia composición. Tiene el monitor de generadores y la Reportabilidad de GG
 *  con sus propios carros, igual que El Salvador. No tiene mapa y trabaja solo el Turno Día. Solo cambian el
 *  orden y los accesos: permisos y datos no cambian. */
export const DISENO_INICIO_ANDINA: Record<Rol, DisenoInicio> = {
  tecnico: { principal: ['hoy', 'revisar'], lateral: ['turnoMini', 'generadoresMini', 'accesos'], accesos: ['checklist', 'gg', 'preventiva', 'falla', 'borradores'] },
  experto_sso: { principal: ['hoy', 'revisar'], lateral: ['turnoMini', 'generadoresMini', 'accesos'], accesos: ['checklist', 'gg', 'impresion', 'falla', 'borradores'] },
  electrico: { principal: ['hoy', 'revisar'], lateral: ['generadoresMini', 'turnoMini', 'accesos'], accesos: ['falla', 'mantenimiento', 'checklist', 'borradores'] },
  electromecanico: { principal: ['generadores', 'hoy', 'revisar'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'mantenimiento', 'preventiva', 'checklist', 'borradores'] },
  supervisor: { principal: ['revisar', 'generadores', 'hoy'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'cierre', 'impresion', 'preventiva', 'borradores'] },
  lider_tecnico: { principal: ['revisar', 'generadores', 'hoy'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'cierre', 'impresion', 'preventiva', 'borradores'] },
  ingeniero_especialista: { principal: ['revisar', 'generadores', 'hoy'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'cierre', 'impresion', 'preventiva', 'borradores'] },
  jefe: { principal: ['turno', 'revisar', 'hoy'], lateral: ['generadoresMini', 'accesos'], accesos: ['cierre', 'impresion', 'checklist', 'gg', 'borradores'] },
  contrato: { principal: ['contrato', 'turno'], lateral: ['generadoresMini', 'accesos'], accesos: ['admin', 'cierre', 'impresion', 'gg', 'borradores'] },
};

/** "Ver todo" en Andina: el inicio completo, sin mapa. */
export const ORDEN_COMPLETO_ANDINA: BloqueInicio[] = ['turno', 'hoy', 'revisar', 'generadores'];
