// Controla el acceso a la app: sin sesión → login/registro; cuenta no aprobada → pantalla de
// estado; cuenta aprobada → la app. Las políticas de la base de datos aplican la misma regla, así
// que aunque alguien saltara esta pantalla no podría leer ni modificar informes.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import Acceso from './Acceso';
import EstadoCuenta from './EstadoCuenta';
import NuevaContrasena from './NuevaContrasena';
import { SesionContext, type Perfil, type SesionValor } from './sesion';
import './auth.css';

function Cargando({ texto }: { texto: string }) {
  return (
    <div className="auth-loading" role="status">
      <span className="auth-spinner" /> {texto}
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sesionCargada, setSesionCargada] = useState(false);
  // Perfil junto con el id del usuario al que pertenece: si cambia la sesión, el perfil anterior
  // deja de valer solo (sin tener que limpiarlo a mano).
  const [perfilDe, setPerfilDe] = useState<{ userId: string; perfil: Perfil | null } | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const [pendientes, setPendientes] = useState(0);

  const userId = session?.user.id ?? null;
  const perfilCargado = Boolean(userId && perfilDe?.userId === userId);
  const perfil = perfilCargado ? perfilDe!.perfil : null;

  // Sesión guardada en el dispositivo + cambios (login, logout, renovación del token, recuperación).
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSesionCargada(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nueva) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperando(true);
      setSession(nueva);
      setSesionCargada(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const cargarPerfil = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
    if (error) console.error('No se pudo cargar el perfil:', error);
    setPerfilDe({ userId: id, perfil: (data as Perfil | null) ?? null });
  }, []);

  // Perfil del usuario (estado y rol), y aviso en tiempo real cuando un administrador lo aprueba.
  useEffect(() => {
    if (!userId) return;
    // Pedir el perfil a la base de datos es sincronizar con un sistema externo.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargarPerfil(userId);
    void supabase.rpc('registrar_acceso');
    const channel = supabase
      .channel(`perfil-${userId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles', filter: `id=eq.${userId}` }, () => {
        void cargarPerfil(userId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId, cargarPerfil]);

  const esAdmin = Boolean(perfil && perfil.estado === 'aprobado' && perfil.es_admin);

  // Administradores: cuántas cuentas esperan aprobación (para el aviso del panel).
  useEffect(() => {
    if (!esAdmin) return;
    const contar = () => {
      void supabase.from('perfiles').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente')
        .then(({ count }) => setPendientes(count ?? 0));
    };
    contar();
    const channel = supabase
      .channel(`perfiles-admin-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, contar)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [esAdmin]);

  const pendientesAprobacion = esAdmin ? pendientes : 0;

  const cerrarSesion = useCallback(async () => {
    await supabase.auth.signOut();
    setPerfilDe(null);
  }, []);

  const valor = useMemo<SesionValor | null>(() => (
    session && perfil ? { session, perfil, esAdmin, pendientesAprobacion, cerrarSesion } : null
  ), [session, perfil, esAdmin, pendientesAprobacion, cerrarSesion]);

  if (!sesionCargada) return <Cargando texto="CARGANDO…" />;
  if (recuperando && session) return <NuevaContrasena onListo={() => setRecuperando(false)} />;
  if (!session) return <Acceso />;
  if (!perfilCargado) return <Cargando texto="VERIFICANDO CUENTA…" />;
  if (!perfil || perfil.estado !== 'aprobado' || !valor) {
    return <EstadoCuenta perfil={perfil} onRevisar={() => cargarPerfil(session.user.id)} onCerrarSesion={cerrarSesion} />;
  }

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}
