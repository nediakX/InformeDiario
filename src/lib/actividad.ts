// Registro de actividad (bitácora del Panel de administración).
// Cada usuario aprobado registra sus propios eventos; la base de datos rechaza los demás.
// Nunca interrumpe a quien usa la app: si falla, solo queda en la consola.
import { supabase } from './supabase';

export type TipoActividad =
  | 'inicio_sesion' | 'cierre_sesion' | 'word_generado' | 'fotos_limpiadas' | 'impresion_generada'
  // Estos los registra la base de datos sola (triggers):
  | 'informe_creado' | 'informe_eliminado' | 'cuenta_registrada'
  | 'cuenta_aprobado' | 'cuenta_rechazado' | 'cuenta_pendiente' | 'admin_otorgado' | 'admin_quitado' | 'division_cambiada';

export async function registrarActividad(tipo: TipoActividad, detalle = '', referencia?: string): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const usuarioId = data.session?.user.id;
    if (!usuarioId) return;
    const { error } = await supabase.from('actividad').insert({ usuario_id: usuarioId, tipo, detalle, referencia: referencia ?? null });
    if (error) console.warn('No se pudo registrar la actividad:', error.message);
  } catch (error) {
    console.warn('No se pudo registrar la actividad:', error);
  }
}
