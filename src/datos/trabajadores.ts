// Listado oficial de trabajadores (nombre, RUT y cargo), para completar solos los formularios de
// Impresión Rápida. Fuente: "Listado de Trabajadores junio-26" (División El Salvador).
import type { Division } from './divisiones';

export interface Trabajador {
  /** Nombre tal como aparece en el listado (apellidos primero en la mayoría). */
  nombre: string;
  rut: string;
  cargo: string;
}

const EL_SALVADOR: Trabajador[] = [
  { nombre: 'Aguilar Veloso Vanesa', rut: '16.923.839-1', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Artal Marcelo Gahona', rut: '19.303.405-5', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Arancibia Madariaga Alberto Vital', rut: '7.916.433-K', cargo: 'Técnico Eléctrico' },
  { nombre: 'Contreras Cortes Fernando', rut: '17.015.033-3', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Barraza Gallardo Williams Vicente', rut: '20.946.216-8', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Maximiliano Bahamondez', rut: '19.947.990-3', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Díaz Cornejo Max Andrés', rut: '14.352.176-1', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Droguett Pasten Claudia Andrea', rut: '15.740.863-1', cargo: 'Experto SSO, S y MA' },
  { nombre: 'Escobar San Martín José Luis', rut: '17.472.034-7', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Fernández Ortega Luis Humberto', rut: '17.907.237-8', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Guerrero Espinoza Kevin Felipe', rut: '18.969.233-1', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Gutiérrez Tapia Omar Jesús', rut: '19.144.837-5', cargo: 'Experto SSO, S y MA' },
  { nombre: 'Moll Gallardo Carlos Enrique', rut: '12.667.507-0', cargo: 'Técnico Eléctrico' },
  { nombre: 'Francisco Jara', rut: '14.098.389-6', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Morata Barrios Juan Carlos', rut: '18.924.203-4', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Orrego Rojas Claudio Abdón', rut: '15.051.601-3', cargo: 'Técnico Telecomunicaciones' },
  { nombre: 'Pailapan Hormazabal Camilo Andrés', rut: '17.738.483-6', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Saavedra Valenzuela Juan Carlos', rut: '10.415.558-8', cargo: 'Jefe de Turno' },
  { nombre: 'Santana Ramos Patricio Ernesto', rut: '18.710.681-8', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Riquelme González Ricardo Andrés', rut: '14.170.333-1', cargo: 'Electromecánico' },
  { nombre: 'Orellana Martínez Cesar', rut: '16.518.065-8', cargo: 'Administrador de Contrato' },
  { nombre: 'Votterl German', rut: '21.177.930-6', cargo: 'Gerente' },
];

export const TRABAJADORES: Record<Division, Trabajador[]> = {
  el_salvador: EL_SALVADOR,
  andina: [],
};

const palabras = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-zñ ]/g, ' ').split(/\s+/).filter(p => p.length > 1);

/**
 * Busca a una persona en el listado aunque el nombre esté escrito distinto ("Max Diaz" =
 * "Díaz Cornejo Max Andrés"; "Marcelo Artal Gahona" = "Artal Marcelo Gahona"): todas las palabras del
 * nombre más corto deben estar en el otro (mínimo 2). Si calza con más de una persona, no se elige.
 */
export function buscarTrabajador(nombre: string, division: Division): Trabajador | null {
  const pn = palabras(nombre);
  if (pn.length < 2) return null;
  const candidatos = TRABAJADORES[division].filter(t => {
    const pt = palabras(t.nombre);
    const [corto, largo] = pn.length <= pt.length ? [pn, new Set(pt)] : [pt, new Set(pn)];
    return corto.length >= 2 && corto.every(p => largo.has(p));
  });
  return candidatos.length === 1 ? candidatos[0] : null;
}
