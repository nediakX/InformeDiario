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
/** Accesos directos a pantallas (en el orden de "Todas las opciones"). */
export const IDS_TAREA = [
  'checklist', 'gg', 'tablaMantenimiento', 'impresion', 'mapa',
  'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'falla', 'mantenimiento',
  'borradores', 'recuperar', 'admin',
] as const;
export type IdTarea = (typeof IDS_TAREA)[number];
export const esIdTarea = (v: unknown): v is IdTarea => typeof v === 'string' && (IDS_TAREA as readonly string[]).includes(v);

/** Máximo de accesos rápidos en el inicio (los del rol y los que elija cada cuenta). */
export const MAX_ACCESOS_RAPIDOS = 5;

export interface DisenoInicio {
  /** Columna principal: lo que responde la pregunta del rol, en grande. */
  principal: BloqueInicio[];
  /** Columna lateral (debajo en el celular): contexto en versión corta y accesos directos. */
  lateral: BloqueInicio[];
  /** Accesos directos del rol, de más a menos importante. El inicio muestra los primeros 5 que la persona
   *  puede usar, mientras no elija los suyos; el resto queda en "Todas las opciones". */
  accesos: IdTarea[];
}

export const DISENO_INICIO: Record<Rol, DisenoInicio> = {
  tecnico: { principal: ['hoy', 'revisar', 'mapa'], lateral: ['accesos', 'turnoMini', 'generadoresMini'], accesos: ['checklist', 'gg', 'falla', 'borradores'] },
  experto_sso: { principal: ['hoy', 'revisar', 'mapa'], lateral: ['accesos', 'turnoMini', 'generadoresMini'], accesos: ['checklist', 'gg', 'falla', 'borradores'] },
  electrico: { principal: ['hoy', 'revisar', 'mapa'], lateral: ['accesos', 'generadoresMini', 'turnoMini'], accesos: ['falla', 'checklist', 'mantenimiento', 'borradores'] },
  electromecanico: { principal: ['generadores', 'hoy', 'mapa'], lateral: ['accesos', 'turnoMini'], accesos: ['gg', 'tablaMantenimiento', 'mantenimiento', 'checklist', 'borradores'] },
  supervisor: { principal: ['revisar', 'generadores', 'hoy', 'mapa'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'tablaMantenimiento', 'impresion', 'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'borradores'] },
  lider_tecnico: { principal: ['revisar', 'generadores', 'hoy', 'mapa'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'tablaMantenimiento', 'impresion', 'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'borradores'] },
  ingeniero_especialista: { principal: ['revisar', 'generadores', 'hoy', 'mapa'], lateral: ['turnoMini', 'accesos'], accesos: ['gg', 'tablaMantenimiento', 'impresion', 'cierre', 'presentacion', 'presentacionFds', 'preventiva', 'borradores'] },
  jefe: { principal: ['turno', 'revisar', 'hoy', 'mapa'], lateral: ['generadoresMini', 'accesos'], accesos: ['cierre', 'presentacion', 'presentacionFds', 'impresion', 'gg', 'tablaMantenimiento', 'borradores'] },
  contrato: { principal: ['contrato', 'turno', 'mapa'], lateral: ['generadoresMini', 'accesos'], accesos: ['admin', 'cierre', 'presentacion', 'presentacionFds', 'gg', 'tablaMantenimiento', 'borradores'] },
};

/** "Ver todo": el inicio completo, igual para todos, en una columna. */
export const ORDEN_COMPLETO: BloqueInicio[] = ['turno', 'hoy', 'revisar', 'generadores', 'mapa'];

/** Inicio de División Andina: la misma distribución que El Salvador (mismos bloques y en el mismo lugar).
 *  Solo cambian los accesos rápidos de cada rol (Andina usa la mantención preventiva y no tiene presentaciones
 *  ni tabla de mantenimiento); permisos y datos no cambian. Andina trabaja solo el Turno Día. */
const conAccesosAndina = (rol: Rol, accesos: IdTarea[]): DisenoInicio => ({ ...DISENO_INICIO[rol], accesos });
export const DISENO_INICIO_ANDINA: Record<Rol, DisenoInicio> = {
  tecnico: conAccesosAndina('tecnico', ['checklist', 'gg', 'preventiva', 'falla', 'borradores']),
  experto_sso: conAccesosAndina('experto_sso', ['checklist', 'gg', 'impresion', 'falla', 'borradores']),
  electrico: conAccesosAndina('electrico', ['falla', 'mantenimiento', 'checklist', 'borradores']),
  electromecanico: conAccesosAndina('electromecanico', ['gg', 'mantenimiento', 'preventiva', 'checklist', 'borradores']),
  supervisor: conAccesosAndina('supervisor', ['gg', 'cierre', 'impresion', 'preventiva', 'borradores']),
  lider_tecnico: conAccesosAndina('lider_tecnico', ['gg', 'cierre', 'impresion', 'preventiva', 'borradores']),
  ingeniero_especialista: conAccesosAndina('ingeniero_especialista', ['gg', 'cierre', 'impresion', 'preventiva', 'borradores']),
  jefe: conAccesosAndina('jefe', ['cierre', 'impresion', 'checklist', 'gg', 'borradores']),
  contrato: conAccesosAndina('contrato', ['admin', 'cierre', 'impresion', 'gg', 'borradores']),
};
