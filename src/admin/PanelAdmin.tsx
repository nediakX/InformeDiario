// Panel de administración (solo cuentas con rol de administrador):
//  - Resumen: KPIs y estadísticas de informes (cumplimiento, fallas, mantenimientos, actividad).
//  - En línea: quién está usando la app ahora, en qué pantalla y desde qué dispositivo.
//  - Usuarios: aprobar / rechazar cuentas y asignar el rol de administrador.
//  - Actividad: bitácora de sesiones, informes, Word generados y cambios de cuentas.
//  - Sistema: uso de almacenamiento frente al plan de Supabase y limpieza de fotos huérfanas.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, HardDrive, History, Loader2, RefreshCw, Users, Wifi, type LucideIcon } from 'lucide-react';
import logoPsinet from '../assets/logo_psinet.jpg';
import logoEdificio from '../assets/LogoEdificio.png';
import { supabase } from '../lib/supabase';
import { useSesion } from '../auth/sesion';
import { CONFIG_DIVISION } from '../datos/divisiones';
import SelectorDivision from '../componentes/SelectorDivision';
import {
  cargarDatosAdmin, calcularEstadisticas, rangoDePeriodo, PERIODOS,
  type DatosAdmin, type Periodo,
} from './datos';
import Resumen from './Resumen';
import Usuarios from './Usuarios';
import EnLinea from './EnLinea';
import Actividad from './Actividad';
import Sistema from './Sistema';
import { estadoConexion, usePresenciaAdmin } from './presencia';
import type { PestanaAdmin } from '../app/rutas';
import './admin.css';

export default function PanelAdmin({ onBack, pestana, onPestanaChange }: {
  onBack: () => void;
  /** Pestaña activa (viene de la URL: /admin o /admin/usuarios). */
  pestana: PestanaAdmin;
  onPestanaChange: (p: PestanaAdmin) => void;
}) {
  const { pendientesAprobacion, division } = useSesion();
  const setPestana = onPestanaChange;
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  const [datos, setDatos] = useState<DatosAdmin | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const rango = useMemo(() => rangoDePeriodo(periodo), [periodo]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setDatos(await cargarDatosAdmin(rango, division));
    } catch (e) {
      console.error('No se pudieron cargar los datos del panel:', e);
      setError('No se pudieron cargar los datos. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }, [rango, division]);

  // Carga inicial y al cambiar el periodo (cargar() marca "cargando" antes de pedir los datos).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargar(); }, [cargar]);

  // Se actualiza solo cuando alguien guarda un informe o cambia una cuenta.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const refrescar = () => { clearTimeout(timeout); timeout = setTimeout(() => { void cargar(); }, 1500); };
    const channel = supabase
      .channel(`panel-admin-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borradores' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'borradores_otros' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, refrescar)
      .subscribe();
    return () => { clearTimeout(timeout); void supabase.removeChannel(channel); };
  }, [cargar]);

  const stats = useMemo(() => (datos ? calcularEstadisticas(datos, rango) : null), [datos, rango]);

  const presencia = usePresenciaAdmin();
  // Solo cuentas con acceso (igual que la tabla de la pestaña "En línea").
  const aprobados = useMemo(() => new Set((datos?.perfiles ?? []).filter(p => p.estado === 'aprobado').map(p => p.id)), [datos]);
  const enLineaAhora = presencia.filas.filter(f => aprobados.has(f.usuario_id) && estadoConexion(f, presencia.ahora) === 'en_linea').length;

  const pestanas: { valor: PestanaAdmin; etiqueta: string; Icono: LucideIcon; badge?: number; badgeClase?: string }[] = [
    { valor: 'resumen', etiqueta: 'Resumen', Icono: BarChart3 },
    { valor: 'en-linea', etiqueta: 'En línea', Icono: Wifi, badge: enLineaAhora, badgeClase: 'admin-badge--ok' },
    { valor: 'usuarios', etiqueta: 'Usuarios', Icono: Users, badge: pendientesAprobacion },
    { valor: 'actividad', etiqueta: 'Actividad', Icono: History },
    { valor: 'sistema', etiqueta: 'Sistema', Icono: HardDrive },
  ];

  return (
    <div className="admin-root min-h-screen text-[#222] font-sans pb-20">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Panel de administración</div>
              <div className="site-header__meta text-xs truncate">{CONFIG_DIVISION[division].sigla} / Indicadores de informes y gestión de usuarios</div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[1100px] mx-auto p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <SelectorDivision />
          <button type="button" onClick={() => void cargar()} disabled={cargando} className="btn-mini" aria-label="Actualizar datos">
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Actualizar
          </button>
        </div>

        <div className="admin-tabs" role="tablist">
          {pestanas.map(({ valor, etiqueta, Icono, badge, badgeClase }) => (
            <button key={valor} type="button" role="tab" aria-selected={pestana === valor} className="admin-tab" onClick={() => setPestana(valor)}>
              <Icono size={16} /> {etiqueta}
              {badge ? <span className={`admin-badge ${badgeClase ?? ''}`}>{badge}</span> : null}
            </button>
          ))}
        </div>

        {error && <div className="rounded-md border border-[#f1c0c0] bg-[#fbe9e9] text-[#a32626] text-sm px-4 py-3">{error}</div>}

        {pestana === 'resumen' ? (
          <>
            <div className="admin-filters">
              <div className="segmented" role="group" aria-label="Periodo">
                {PERIODOS.map(p => (
                  <button key={p.valor} type="button" aria-pressed={periodo === p.valor} onClick={() => setPeriodo(p.valor)}>{p.etiqueta}</button>
                ))}
              </div>
            </div>
            {stats ? <Resumen stats={stats} rango={rango} enLinea={enLineaAhora} /> : cargando && <Cargando />}
          </>
        ) : pestana === 'en-linea' ? (
          datos ? <EnLinea perfiles={datos.perfiles} filas={presencia.filas} ahora={presencia.ahora} /> : cargando && <Cargando />
        ) : pestana === 'usuarios' ? (
          datos ? <Usuarios perfiles={datos.perfiles} onCambio={cargar} presencia={presencia.filas} ahora={presencia.ahora} /> : cargando && <Cargando />
        ) : pestana === 'actividad' ? (
          datos ? <Actividad perfiles={datos.perfiles} /> : cargando && <Cargando />
        ) : (
          <Sistema />
        )}
      </main>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center">
      <Loader2 size={18} className="animate-spin" /> Cargando datos…
    </div>
  );
}
