// Controla el acceso a la app: sin sesión → login/registro; cuenta no aprobada → pantalla de
// estado; cuenta aprobada → la app. Las políticas de la base de datos aplican la misma regla, así
// que aunque alguien saltara esta pantalla no podría leer ni modificar informes.
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import Acceso from './Acceso';
import EstadoCuenta from './EstadoCuenta';
import NuevaContrasena from './NuevaContrasena';
import { SesionContext, type Perfil, type SesionValor } from './sesion';
import { divisionDeFaena, esDivision, type Division } from '../datos/divisiones';
import { registrarActividad } from '../lib/actividad';
import { marcarSalida } from '../lib/presencia';
import { esErrorDeRed, hayConexion, suscribirConexion } from '../lib/conexion';
import IndicadorConexion from '../componentes/IndicadorConexion';
import BarraDeshacer from '../componentes/BarraDeshacer';
import './auth.css';

// --- Modo sin conexión ----------------------------------------------------------------------
// Sin señal, Supabase no puede renovar la sesión y la entrega vacía, aunque sigue guardada en el
// dispositivo; y el perfil (estado, rol, división) no se puede consultar. Para que quien ya entró
// pueda seguir trabajando, se usa la sesión guardada y la última copia del perfil. Al volver la
// señal, Supabase renueva la sesión sola y el perfil se vuelve a consultar.
const CLAVE_PERFIL_LOCAL = 'psinet_perfil_local';

function sesionGuardada(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const clave = localStorage.key(i);
      if (!clave || !/^sb-.+-auth-token$/.test(clave)) continue;
      const valor = JSON.parse(localStorage.getItem(clave) ?? 'null') as (Session & { currentSession?: Session }) | null;
      const sesion = valor?.currentSession ?? valor;
      if (sesion?.user?.id && sesion.refresh_token) return sesion;
    }
  } catch { /* sin acceso al almacenamiento */ }
  return null;
}

function perfilGuardado(userId: string): Perfil | null {
  try {
    const valor = JSON.parse(localStorage.getItem(CLAVE_PERFIL_LOCAL) ?? 'null') as Perfil | null;
    return valor?.id === userId ? valor : null;
  } catch { return null; }
}

function guardarPerfilLocal(perfil: Perfil | null) {
  try {
    if (perfil) localStorage.setItem(CLAVE_PERFIL_LOCAL, JSON.stringify(perfil));
    else localStorage.removeItem(CLAVE_PERFIL_LOCAL);
  } catch { /* sin acceso al almacenamiento */ }
}

/** Sin conexión, una sesión vacía no significa "sesión cerrada": se usa la guardada en el dispositivo. */
const sesionEfectiva = (sesion: Session | null) => sesion ?? (hayConexion() ? null : sesionGuardada());

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
      setSession(sesionEfectiva(data.session));
      setSesionCargada(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nueva) => {
      if (event === 'PASSWORD_RECOVERY') setRecuperando(true);
      // Un cierre de sesión pedido por la persona siempre se respeta; lo demás, sin señal, usa la sesión guardada.
      setSession(event === 'SIGNED_OUT' ? nueva : sesionEfectiva(nueva));
      setSesionCargada(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const cargarPerfil = useCallback(async (id: string) => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle();
    if (error) {
      // Sin conexión (o con la sesión aún sin renovar) se trabaja con la última copia del perfil.
      if (!esErrorDeRed(error)) console.error('No se pudo cargar el perfil:', error);
      setPerfilDe({ userId: id, perfil: perfilGuardado(id) });
      return;
    }
    guardarPerfilLocal((data as Perfil | null) ?? null);
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
    // Al volver la señal se consulta de nuevo el perfil (por si cambió el estado, el rol o la división).
    const dejarDeEscuchar = suscribirConexion(() => { if (hayConexion()) void cargarPerfil(userId); });
    return () => { dejarDeEscuchar(); void supabase.removeChannel(channel); };
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
    await Promise.all([registrarActividad('cierre_sesion', 'Cerró sesión'), marcarSalida()]);
    // Sin conexión se cierra solo en este dispositivo (cerrar en el servidor necesita señal).
    await supabase.auth.signOut(hayConexion() ? undefined : { scope: 'local' });
    guardarPerfilLocal(null);
    setPerfilDe(null);
    setSession(null);
  }, []);

  // División de trabajo: la de la cuenta; un administrador puede elegir la otra (se recuerda en el dispositivo).
  const CLAVE_DIVISION = 'psinet_division_admin';
  const divisionPropia: Division = divisionDeFaena(perfil?.faena);
  const [divisionAdmin, setDivisionAdmin] = useState<Division | null>(() => {
    try { const v = localStorage.getItem(CLAVE_DIVISION); return esDivision(v) ? v : null; } catch { return null; }
  });
  const division: Division = esAdmin && divisionAdmin ? divisionAdmin : divisionPropia;
  const setDivision = useCallback((d: Division) => {
    setDivisionAdmin(d);
    try { localStorage.setItem(CLAVE_DIVISION, d); } catch { /* sin almacenamiento local */ }
  }, []);

  const recargarPerfil = useCallback(async () => {
    if (userId) await cargarPerfil(userId);
  }, [userId, cargarPerfil]);

  const valor = useMemo<SesionValor | null>(() => (
    session && perfil ? { session, perfil, esAdmin, pendientesAprobacion, cerrarSesion, division, divisionPropia, setDivision, recargarPerfil } : null
  ), [session, perfil, esAdmin, pendientesAprobacion, cerrarSesion, division, divisionPropia, setDivision, recargarPerfil]);

  if (!sesionCargada) return <Cargando texto="CARGANDO…" />;
  if (recuperando && session) return <NuevaContrasena onListo={() => setRecuperando(false)} />;
  if (!session) return <Acceso />;
  if (!perfilCargado) return <Cargando texto="VERIFICANDO CUENTA…" />;
  if (!perfil || perfil.estado !== 'aprobado' || !valor) {
    return <EstadoCuenta perfil={perfil} onRevisar={() => cargarPerfil(session.user.id)} onCerrarSesion={cerrarSesion} />;
  }

  // Al cambiar de división la app se monta de nuevo: listas, formularios y suscripciones parten
  // limpios con los datos de la división elegida.
  return (
    <SesionContext.Provider value={valor}>
      <IndicadorConexion />
      <Fragment key={division}>{children}</Fragment>
      <BarraDeshacer />
    </SesionContext.Provider>
  );
}
