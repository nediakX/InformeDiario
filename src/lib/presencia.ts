// "Latido" de presencia: mientras la app está abierta, cada minuto avisa que el usuario sigue
// conectado y en qué pantalla está. El Panel de administración lo usa para "Usuarios en línea".
import { useEffect } from 'react';
import { supabase } from './supabase';

const INTERVALO_MS = 60_000;

export function tipoDispositivo(): string {
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return 'Tablet';
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'Celular';
  return 'Computador';
}

function latido(pantalla: string) {
  void supabase.rpc('latido', { p_pantalla: pantalla, p_dispositivo: tipoDispositivo() }).then(({ error }) => {
    if (error) console.warn('No se pudo registrar la presencia:', error.message);
  });
}

/** Envía la presencia al abrir, al cambiar de pantalla, al volver a la pestaña y cada minuto. */
export function usePresencia(pantalla: string) {
  useEffect(() => {
    latido(pantalla);
    const intervalo = setInterval(() => {
      if (document.visibilityState === 'visible') latido(pantalla);
    }, INTERVALO_MS);
    const alVolver = () => { if (document.visibilityState === 'visible') latido(pantalla); };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [pantalla]);
}

/** Al cerrar sesión: deja de aparecer "en línea" de inmediato. */
export async function marcarSalida(): Promise<void> {
  try { await supabase.rpc('salir'); } catch { /* sin conexión: dejará de verse en línea en 2 minutos */ }
}
