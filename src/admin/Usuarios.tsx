// Pestaña "Usuarios": aprobar o rechazar solicitudes y asignar el rol de administrador.
import { useMemo, useState } from 'react';
import { Check, ShieldCheck, ShieldOff, X, RotateCcw } from 'lucide-react';
import { useSesion, etiquetaFaena, type EstadoCuenta, type Perfil } from '../auth/sesion';
import { cambiarEstadoUsuario, cambiarRolAdmin } from './datos';
import { TarjetaGrafico } from './graficos';

type Filtro = EstadoCuenta | 'todos';

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobado', etiqueta: 'Aprobados' },
  { valor: 'rechazado', etiqueta: 'Rechazados' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };

const fecha = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Usuarios({ perfiles, onCambio }: { perfiles: Perfil[]; onCambio: () => Promise<void> }) {
  const { perfil: yo } = useSesion();
  const hayPendientes = perfiles.some(p => p.estado === 'pendiente');
  const [filtro, setFiltro] = useState<Filtro>(hayPendientes ? 'pendiente' : 'aprobado');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');

  const lista = useMemo(() => perfiles.filter(p => filtro === 'todos' || p.estado === filtro), [perfiles, filtro]);
  const conteo = (f: Filtro) => (f === 'todos' ? perfiles.length : perfiles.filter(p => p.estado === f).length);

  const ejecutar = async (id: string, accion: () => Promise<void>) => {
    setOcupado(id);
    setError('');
    try {
      await accion();
      await onCambio();
    } catch (e) {
      console.error(e);
      setError('No se pudo guardar el cambio. Inténtalo de nuevo.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <TarjetaGrafico
      titulo="Cuentas de usuario"
      subtitulo="Las cuentas nuevas quedan pendientes hasta que un administrador las aprueba."
      acciones={
        <div className="segmented" role="group" aria-label="Filtrar por estado">
          {FILTROS.map(f => (
            <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>
              {f.etiqueta} ({conteo(f.valor)})
            </button>
          ))}
        </div>
      }
    >
      {error && <p className="text-sm text-[#a32626] mb-2">{error}</p>}
      {lista.length === 0 ? (
        <p className="viz-empty">No hay cuentas en esta categoría.</p>
      ) : (
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead>
              <tr><th>Nombre</th><th>RUT</th><th>Faena</th><th>Estado</th><th>Último acceso</th><th>Registro</th><th aria-label="Acciones" /></tr>
            </thead>
            <tbody>
              {lista.map(p => {
                const soyYo = p.id === yo.id;
                const deshabilitado = ocupado === p.id;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-semibold">{p.nombre || '—'} {soyYo && <span className="text-xs text-gray-500">(tú)</span>}</div>
                      <div className="text-xs text-gray-500 break-all">{p.email}</div>
                    </td>
                    <td className="whitespace-nowrap">{p.rut || '—'}</td>
                    <td>{etiquetaFaena(p.faena)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <span className={`pill pill--${p.estado}`}>{ETIQUETA_ESTADO[p.estado]}</span>
                        {p.es_admin && <span className="pill pill--admin"><ShieldCheck size={12} aria-hidden="true" /> Admin</span>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap">{fecha(p.ultimo_acceso)}</td>
                    <td className="whitespace-nowrap">{fecha(p.created_at)}</td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {p.estado !== 'aprobado' && (
                          <button type="button" className="btn-mini btn-mini--ok" disabled={deshabilitado}
                            onClick={() => void ejecutar(p.id, () => cambiarEstadoUsuario(p.id, 'aprobado', yo.id))}>
                            <Check size={13} /> Aprobar
                          </button>
                        )}
                        {p.estado === 'pendiente' && (
                          <button type="button" className="btn-mini btn-mini--danger" disabled={deshabilitado}
                            onClick={() => void ejecutar(p.id, () => cambiarEstadoUsuario(p.id, 'rechazado', yo.id))}>
                            <X size={13} /> Rechazar
                          </button>
                        )}
                        {p.estado === 'aprobado' && !soyYo && (
                          <>
                            <button type="button" className="btn-mini" disabled={deshabilitado}
                              onClick={() => void ejecutar(p.id, () => cambiarRolAdmin(p.id, !p.es_admin))}>
                              {p.es_admin ? <><ShieldOff size={13} /> Quitar admin</> : <><ShieldCheck size={13} /> Hacer admin</>}
                            </button>
                            <button type="button" className="btn-mini btn-mini--danger" disabled={deshabilitado}
                              onClick={() => {
                                if (window.confirm(`¿Quitar el acceso a ${p.nombre || p.email}? No podrá entrar hasta que se vuelva a aprobar.`)) {
                                  void ejecutar(p.id, () => cambiarEstadoUsuario(p.id, 'rechazado', yo.id));
                                }
                              }}>
                              <RotateCcw size={13} /> Quitar acceso
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </TarjetaGrafico>
  );
}
