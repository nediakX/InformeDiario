// Mi perfil: datos propios del usuario (nombre, RUT, firma) y firmas para los documentos.
// Un usuario no puede editar su fila de perfiles directamente (solo un administrador puede, para
// que nadie se apruebe a sí mismo): los cambios pasan por funciones de la base de datos que solo
// tocan esos campos.
import { supabase } from '../lib/supabase';
import type { Division } from './divisiones';

export interface CambiosPerfil {
  nombre: string;
  rut: string | null;
  /** undefined = no tocar la firma; null = quitarla; texto = nueva firma (PNG en dataURL). */
  firma?: string | null;
}

export async function actualizarMiPerfil(c: CambiosPerfil): Promise<void> {
  const { error } = await supabase.rpc('actualizar_mi_perfil', {
    p_nombre: c.nombre,
    p_rut: c.rut,
    p_firma: c.firma ?? null,
    p_borrar_firma: c.firma === null,
  });
  if (error) throw new Error(mensajeErrorPerfil(error));
}

/** Explica el error de la base de datos en palabras simples (y deja el detalle técnico al final). */
function mensajeErrorPerfil(error: { message: string; code?: string }): string {
  const m = error.message ?? '';
  if (/perfiles_rut_unico|duplicate key/i.test(m)) return 'Ese RUT ya está registrado en otra cuenta.';
  if (/firma demasiado grande/i.test(m)) return 'La imagen de la firma es demasiado grande. Prueba con una foto más pequeña.';
  if (/firma inv[aá]lida/i.test(m)) return 'La firma no se pudo procesar. Vuelve a subir la imagen.';
  // Supabase todavía no tiene la función / columna nueva: falta correr supabase/schema.sql.
  if (error.code === 'PGRST202' || /could not find the function|actualizar_mi_perfil|column .*firma.* does not exist|schema cache/i.test(m)) {
    return 'La base de datos aún no está actualizada para guardar el perfil y la firma. Un administrador debe correr '
      + 'el archivo supabase/schema.sql en Supabase (SQL Editor → pegar → Run) y luego volver a intentar.';
  }
  return `No se pudieron guardar los datos (${m || 'error desconocido'}).`;
}

export async function cambiarContrasena(nueva: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: nueva });
  if (error) {
    if (/should be different|same/i.test(error.message)) throw new Error('La contraseña nueva debe ser distinta de la actual.');
    if (/at least|weak|short/i.test(error.message)) throw new Error('La contraseña es muy corta o débil (mínimo 8 caracteres).');
    throw error;
  }
}

export interface FirmaPersona { nombre: string; firma: string }

/**
 * Firmas de las personas de una división (para ponerlas en el checklist junto a su nombre).
 * Sin conexión se usa la última lista descargada en este dispositivo.
 */
export async function firmasDivision(division: Division): Promise<FirmaPersona[]> {
  const clave = `psinet_firmas_${division}`;
  try {
    const { data, error } = await supabase.rpc('firmas_division', { p_division: division });
    if (error) throw error;
    const lista = ((data ?? []) as FirmaPersona[]).filter(f => f.nombre && f.firma);
    try { localStorage.setItem(clave, JSON.stringify(lista)); } catch { /* sin espacio: no pasa nada */ }
    return lista;
  } catch (error) {
    console.warn('No se pudieron descargar las firmas; se usan las guardadas en el equipo.', error);
    try { return JSON.parse(localStorage.getItem(clave) ?? '[]') as FirmaPersona[]; } catch { return []; }
  }
}
