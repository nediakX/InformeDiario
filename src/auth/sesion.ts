// Sesión del usuario y su perfil (estado de aprobación y rol), compartidos con toda la app.
import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Division } from '../datos/divisiones';

export type EstadoCuenta = 'pendiente' | 'aprobado' | 'rechazado';
export type Faena = 'rajo_inca' | 'andina';

export const FAENAS: { valor: Faena; etiqueta: string }[] = [
  { valor: 'rajo_inca', etiqueta: 'División El Salvador' },
  { valor: 'andina', etiqueta: 'División Andina' },
];

export const etiquetaFaena = (faena: string | null | undefined) =>
  FAENAS.find(f => f.valor === faena)?.etiqueta ?? '—';

export interface Perfil {
  id: string;
  email: string;
  nombre: string;
  rut: string | null;
  faena: Faena | null;
  estado: EstadoCuenta;
  es_admin: boolean;
  aprobado_por: string | null;
  aprobado_at: string | null;
  ultimo_acceso: string | null;
  created_at: string;
}

export interface SesionValor {
  session: Session;
  perfil: Perfil;
  esAdmin: boolean;
  /** Cuentas esperando aprobación (solo se calcula para administradores). */
  pendientesAprobacion: number;
  cerrarSesion: () => Promise<void>;
  /** División con la que se está trabajando: la de la cuenta, o la que eligió un administrador. */
  division: Division;
  /** División de la cuenta (según la faena del registro). */
  divisionPropia: Division;
  /** Solo administradores: cambia la división de trabajo (recarga las listas de la app). */
  setDivision: (d: Division) => void;
}

export const SesionContext = createContext<SesionValor | null>(null);

/** Datos de la sesión actual. Solo se usa dentro de la app (después del login), donde siempre existe. */
export function useSesion(): SesionValor {
  const valor = useContext(SesionContext);
  if (!valor) throw new Error('useSesion se usó fuera de <AuthGate>');
  return valor;
}

/** Nombre corto para mostrar: el nombre registrado o, si falta, la parte del correo antes de la @. */
export const nombreVisible = (perfil: Pick<Perfil, 'nombre' | 'email'>) =>
  perfil.nombre.trim() || perfil.email.split('@')[0];

// ---------------------------------------------------------------------------------------
// RUT chileno
// ---------------------------------------------------------------------------------------

const limpiarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();

/** Valida el dígito verificador (módulo 11). */
export function rutValido(rut: string): boolean {
  const limpio = limpiarRut(rut);
  if (limpio.length < 2) return false;
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  if (!/^\d+$/.test(cuerpo) || cuerpo.length < 6) return false;
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return dv === esperado;
}

/** "123456789" → "12.345.678-9" (se aplica mientras se escribe). */
export function formatearRut(rut: string): string {
  const limpio = limpiarRut(rut).slice(0, 9);
  if (limpio.length <= 1) return limpio;
  const cuerpo = limpio.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${limpio.slice(-1)}`;
}
