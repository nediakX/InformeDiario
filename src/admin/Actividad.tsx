// Pestaña "Actividad": bitácora de lo que pasa en la app (quién, qué y cuándo), con filtros y CSV.
import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Perfil } from '../auth/sesion';
import { TarjetaGrafico } from './graficos';

interface FilaActividad {
  id: number;
  usuario_id: string | null;
  tipo: string;
  detalle: string;
  referencia: string | null;
  creado_at: string;
}

const TIPOS: Record<string, { etiqueta: string; grupo: 'sesion' | 'informes' | 'cuentas' | 'sistema' }> = {
  inicio_sesion: { etiqueta: 'Inició sesión', grupo: 'sesion' },
  cierre_sesion: { etiqueta: 'Cerró sesión', grupo: 'sesion' },
  informe_creado: { etiqueta: 'Creó un informe', grupo: 'informes' },
  informe_eliminado: { etiqueta: 'Eliminó un informe', grupo: 'informes' },
  word_generado: { etiqueta: 'Generó un Word', grupo: 'informes' },
  impresion_generada: { etiqueta: 'Preparó impresión', grupo: 'informes' },
  cuenta_registrada: { etiqueta: 'Se registró', grupo: 'cuentas' },
  cuenta_aprobado: { etiqueta: 'Aprobó una cuenta', grupo: 'cuentas' },
  cuenta_rechazado: { etiqueta: 'Quitó / rechazó acceso', grupo: 'cuentas' },
  cuenta_pendiente: { etiqueta: 'Dejó una cuenta pendiente', grupo: 'cuentas' },
  admin_otorgado: { etiqueta: 'Dio rol de administrador', grupo: 'cuentas' },
  admin_quitado: { etiqueta: 'Quitó rol de administrador', grupo: 'cuentas' },
  division_cambiada: { etiqueta: 'Cambió la división de una cuenta', grupo: 'cuentas' },
  fotos_limpiadas: { etiqueta: 'Limpió fotos huérfanas', grupo: 'sistema' },
};

const GRUPOS = [
  { valor: '', etiqueta: 'Todo' },
  { valor: 'sesion', etiqueta: 'Sesiones' },
  { valor: 'informes', etiqueta: 'Informes' },
  { valor: 'cuentas', etiqueta: 'Cuentas' },
  { valor: 'sistema', etiqueta: 'Sistema' },
];

const LIMITE = 500;

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-CL', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

function descargarCsv(filas: { fecha: string; usuario: string; accion: string; detalle: string }[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const contenido = ['Fecha;Usuario;Acción;Detalle', ...filas.map(f => [f.fecha, f.usuario, f.accion, f.detalle].map(esc).join(';'))].join('\r\n');
  // BOM para que Excel abra bien los acentos.
  const blob = new Blob(['﻿' + contenido], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `actividad_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Actividad({ perfiles }: { perfiles: Perfil[] }) {
  const [filas, setFilas] = useState<FilaActividad[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [usuario, setUsuario] = useState('');
  const [grupo, setGrupo] = useState('');
  const [texto, setTexto] = useState('');

  useEffect(() => {
    let vigente = true;
    void supabase.from('actividad').select('*').order('creado_at', { ascending: false }).limit(LIMITE)
      .then(({ data, error: err }) => {
        if (!vigente) return;
        if (err) { console.error(err); setError('No se pudo cargar la actividad.'); }
        else setFilas(data as FilaActividad[]);
        setCargando(false);
      });
    // Los eventos nuevos aparecen arriba en tiempo real.
    const channel = supabase
      .channel(`actividad-admin-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'actividad' }, payload => {
        setFilas(prev => [payload.new as FilaActividad, ...prev].slice(0, LIMITE));
      })
      .subscribe();
    return () => { vigente = false; void supabase.removeChannel(channel); };
  }, []);

  const nombre = useMemo(() => {
    const mapa = new Map(perfiles.map(p => [p.id, p.nombre || p.email]));
    return (id: string | null) => (id ? mapa.get(id) ?? 'Usuario eliminado' : 'Sistema');
  }, [perfiles]);

  const visibles = useMemo(() => {
    const t = texto.trim().toLowerCase();
    return filas.filter(f =>
      (!usuario || f.usuario_id === usuario)
      && (!grupo || TIPOS[f.tipo]?.grupo === grupo)
      && (!t || `${f.detalle} ${nombre(f.usuario_id)} ${TIPOS[f.tipo]?.etiqueta ?? f.tipo}`.toLowerCase().includes(t)));
  }, [filas, usuario, grupo, texto, nombre]);

  const exportar = () => descargarCsv(visibles.map(f => ({
    fecha: fechaHora(f.creado_at), usuario: nombre(f.usuario_id), accion: TIPOS[f.tipo]?.etiqueta ?? f.tipo, detalle: f.detalle,
  })));

  return (
    <TarjetaGrafico
      titulo="Registro de actividad"
      subtitulo={`Últimos ${LIMITE} eventos: sesiones, informes creados/eliminados, Word generados y cambios de cuentas.`}
      acciones={
        <button type="button" className="btn-mini" onClick={exportar} disabled={!visibles.length}>
          <Download size={13} /> Exportar CSV
        </button>
      }
    >
      <div className="admin-filters mb-3">
        <div className="segmented" role="group" aria-label="Tipo de evento">
          {GRUPOS.map(g => (
            <button key={g.valor} type="button" aria-pressed={grupo === g.valor} onClick={() => setGrupo(g.valor)}>{g.etiqueta}</button>
          ))}
        </div>
        <select className="filtro-select" value={usuario} onChange={e => setUsuario(e.target.value)} aria-label="Filtrar por usuario">
          <option value="">Todos los usuarios</option>
          {perfiles.map(p => <option key={p.id} value={p.id}>{p.nombre || p.email}</option>)}
        </select>
        <label className="filtro-busqueda">
          <Search size={14} aria-hidden="true" />
          <input type="search" placeholder="Buscar…" value={texto} onChange={e => setTexto(e.target.value)} />
        </label>
      </div>

      {error && <p className="text-sm text-[#a32626] mb-2">{error}</p>}
      {cargando ? (
        <p className="viz-empty">Cargando…</p>
      ) : visibles.length === 0 ? (
        <p className="viz-empty">No hay eventos con estos filtros.</p>
      ) : (
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {visibles.map(f => (
                <tr key={f.id}>
                  <td className="whitespace-nowrap">{fechaHora(f.creado_at)}</td>
                  <td>{nombre(f.usuario_id)}</td>
                  <td><span className={`pill pill--evento-${TIPOS[f.tipo]?.grupo ?? 'sistema'}`}>{TIPOS[f.tipo]?.etiqueta ?? f.tipo}</span></td>
                  <td className="max-w-[340px] truncate" title={f.detalle}>{f.detalle || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TarjetaGrafico>
  );
}
