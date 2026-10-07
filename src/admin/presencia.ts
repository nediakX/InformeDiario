// Presencia de usuarios para el Panel de administración (tabla "presencia", en tiempo real).
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface FilaPresencia {
  usuario_id: string;
  ultimo_visto: string;
  conectado_desde: string;
  pantalla: string | null;
  dispositivo: string | null;
}

export type EstadoConexion = 'en_linea' | 'ausente' | 'desconectado';

/** En línea: latido hace menos de 2 min. Ausente: entre 2 y 15 min (pestaña en segundo plano, sin señal…). */
export function estadoConexion(fila: FilaPresencia | undefined, ahora: number): EstadoConexion {
  if (!fila) return 'desconectado';
  const hace = ahora - new Date(fila.ultimo_visto).getTime();
  if (hace < 2 * 60_000) return 'en_linea';
  if (hace < 15 * 60_000) return 'ausente';
  return 'desconectado';
}

/** "hace 3 min", "hace 2 h", "hace 4 días". */
export function haceCuanto(iso: string | null | undefined, ahora: number): string {
  if (!iso) return 'nunca';
  const seg = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (seg < 60) return 'hace un momento';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

/** Filas de presencia en vivo + un reloj que avanza cada 20 s para recalcular quién sigue en línea. */
export function usePresenciaAdmin() {
  const [filas, setFilas] = useState<FilaPresencia[]>([]);
  const [ahora, setAhora] = useState(() => Date.now());

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('presencia').select('*');
    if (error) { console.error('No se pudo cargar la presencia:', error); return; }
    setFilas(data as FilaPresencia[]);
    setAhora(Date.now());
  }, []);

  useEffect(() => {
    // Carga inicial (sincroniza con la base de datos, un sistema externo).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    const channel = supabase
      .channel(`presencia-admin-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'presencia' }, payload => {
        const nueva = payload.new as FilaPresencia | undefined;
        if (!nueva?.usuario_id) return;
        setFilas(prev => [...prev.filter(f => f.usuario_id !== nueva.usuario_id), nueva]);
        setAhora(Date.now());
      })
      .subscribe();
    const reloj = setInterval(() => setAhora(Date.now()), 20_000);
    return () => { clearInterval(reloj); void supabase.removeChannel(channel); };
  }, [cargar]);

  return { filas, ahora, recargar: cargar };
}
