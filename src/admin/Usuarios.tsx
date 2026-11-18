// Pestaña "Usuarios": aprobar o rechazar solicitudes y asignar el rol de administrador.
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Check, ShieldCheck, ShieldOff, X, RotateCcw } from 'lucide-react';
import { useSesion, FAENAS, type EstadoCuenta, type Faena, type Perfil } from '../auth/sesion';
import { cambiarEstadoUsuario, cambiarFaenaUsuario, cambiarRolAdmin, cambiarRolUsuario, eliminarUsuario } from './datos';
import { ETIQUETA_ROL, ROLES, esRol, rolDelListado } from '../datos/roles';
import { divisionDeFaena } from '../datos/divisiones';
import { TarjetaGrafico } from './graficos';
import { estadoConexion, haceCuanto, type FilaPresencia } from './presencia';
import PuntoConexion from './PuntoConexion';

type Filtro = EstadoCuenta | 'todos';

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobado', etiqueta: 'Aprobados' },
  { valor: 'rechazado', etiqueta: 'Rechazados' },
  { valor: 'todos', etiqueta: 'Todos' },
];

const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };

const iniciales = (nombre: string, email: string) => {
  const base = (nombre || email).replace(/\./g, '').trim().split(/\s+/).filter(Boolean);
  return ((base[0]?.[0] ?? '') + (base.length > 1 ? base[base.length - 1][0] : '')).toUpperCase() || '?';
};

const fecha = (iso: string | null) => {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  return d.toLocaleString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function Usuarios({ perfiles, onCambio, presencia, ahora }: {
  perfiles: Perfil[];
  onCambio: () => Promise<void>;
  presencia: FilaPresencia[];
  ahora: number;
}) {
  const { perfil: yo } = useSesion();
  const hayPendientes = perfiles.some(p => p.estado === 'pendiente');
  const [filtro, setFiltro] = useState<Filtro>(hayPendientes ? 'pendiente' : 'aprobado');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const presenciaPorUsuario = useMemo(() => new Map(presencia.map(f => [f.usuario_id, f])), [presencia]);
  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const orden = { pendiente: 0, aprobado: 1, rechazado: 2 } as const;
    return perfiles
      .filter(p => (filtro === 'todos' || p.estado === filtro)
        && (!q || `${p.nombre} ${p.email} ${p.rut ?? ''}`.toLowerCase().includes(q)))
      .sort((a, b) => orden[a.estado] - orden[b.estado] || (a.nombre || a.email).localeCompare(b.nombre || b.email, 'es'));
  }, [perfiles, filtro, busqueda]);
  const conteo = (f: Filtro) => (f === 'todos' ? perfiles.length : perfiles.filter(p => p.estado === f).length);
  const resumen = useMemo(() => {
    const aprobados = perfiles.filter(p => p.estado === 'aprobado');
    return {
      aprobados: aprobados.length,
      pendientes: perfiles.filter(p => p.estado === 'pendiente').length,
      admins: aprobados.filter(p => p.es_admin).length,
      enLinea: aprobados.filter(p => estadoConexion(presenciaPorUsuario.get(p.id), ahora) === 'en_linea').length,
    };
  }, [perfiles, presenciaPorUsuario, ahora]);
  const vacio = filtro === 'pendiente'
    ? 'No hay solicitudes pendientes. Cuando alguien se registre, aparecerá aquí.'
    : filtro === 'rechazado' ? 'No hay cuentas rechazadas.' : 'No hay cuentas en esta categoría.';

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
      <label className="filtro-busqueda mb-3">
        <Search size={14} aria-hidden="true" />
        <input type="search" placeholder="Buscar por nombre, correo o RUT…" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
      </label>
      <div className="usuarios-resumen" aria-label="Resumen de cuentas">
        <span><b>{resumen.aprobados}</b> aprobados</span>
        <span className={resumen.pendientes ? 'usuarios-resumen__alerta' : ''}><b>{resumen.pendientes}</b> pendientes</span>
        <span><b>{resumen.admins}</b> administradores</span>
        <span><b>{resumen.enLinea}</b> en línea ahora</span>
      </div>
      {error && <p className="text-sm text-[#a32626] mb-2">{error}</p>}
      <p className="usuarios-conteo">Mostrando {lista.length} de {perfiles.length} cuentas</p>
      {lista.length === 0 ? (
        <p className="viz-empty">{busqueda ? 'Ninguna cuenta coincide con la búsqueda.' : vacio}</p>
      ) : (
        <div className="viz-table-wrap">
          <table className="viz-table viz-table--tarjetas">
            <thead>
              <tr><th>Nombre</th><th>División</th><th>Rol</th><th>Estado</th><th>Conexión</th><th>Último acceso</th><th aria-label="Acciones" /></tr>
            </thead>
            <tbody>
              {lista.map(p => {
                const soyYo = p.id === yo.id;
                const deshabilitado = ocupado === p.id;
                return (
                  <tr key={p.id} className={p.estado === 'pendiente' ? 'usuario-fila--pendiente' : undefined}>
                    <td className="celda-titulo">
                      <div className="usuario-nombre">
                        <span className="usuario-avatar" aria-hidden="true">{iniciales(p.nombre, p.email)}</span>
                        <div>
                          <div className="font-semibold">{p.nombre || '—'} {soyYo && <span className="text-xs text-gray-500">(tú)</span>}</div>
                          <div className="text-xs text-gray-500 break-all">{p.email}</div>
                          <div className="text-xs text-gray-500">RUT {p.rut || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="División">
                      <select
                        aria-label={`División de ${p.nombre || p.email}`}
                        className="select-division"
                        value={p.faena ?? ''}
                        disabled={deshabilitado}
                        onChange={e => {
                          const faena = e.target.value as Faena;
                          const etiqueta = FAENAS.find(f => f.valor === faena)?.etiqueta ?? faena;
                          if (window.confirm(`¿Mover a ${p.nombre || p.email} a ${etiqueta}? Desde ahora verá y creará los informes de esa división.`)) {
                            void ejecutar(p.id, () => cambiarFaenaUsuario(p.id, faena));
                          }
                        }}
                      >
                        {!p.faena && <option value="" disabled>Sin división</option>}
                        {FAENAS.map(f => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}
                      </select>
                    </td>
                    <td data-label="Rol">
                      {(() => {
                        const auto = rolDelListado(p.rut, p.nombre, divisionDeFaena(p.faena));
                        return (
                          <select
                            aria-label={`Rol de ${p.nombre || p.email}`}
                            className="select-division"
                            value={esRol(p.rol) ? p.rol : ''}
                            disabled={deshabilitado}
                            title="Ordena su pantalla de inicio. Supervisor y Jefe de turno además corrigen reportes de GG."
                            style={{ maxWidth: 180 }}
                            onChange={e => {
                              const rol = e.target.value || null;
                              void ejecutar(p.id, () => cambiarRolUsuario(p.id, rol));
                            }}
                          >
                            <option value="" title={auto.cargo ? `Según el listado: ${auto.cargo}` : 'No está en el listado de trabajadores'}>Auto: {ETIQUETA_ROL[auto.rol]}</option>
                            {ROLES.map(r => <option key={r} value={r}>{ETIQUETA_ROL[r]}</option>)}
                          </select>
                        );
                      })()}
                    </td>
                    <td data-label="Estado">
                      <div className="flex flex-wrap gap-1">
                        <span className={`pill pill--${p.estado}`}>{ETIQUETA_ESTADO[p.estado]}</span>
                        {p.es_admin && <span className="pill pill--admin"><ShieldCheck size={12} aria-hidden="true" /> Admin</span>}
                      </div>
                    </td>
                    <td data-label="Conexión">{p.estado === 'aprobado' ? <PuntoConexion estado={estadoConexion(presenciaPorUsuario.get(p.id), ahora)} /> : '—'}</td>
                    <td className="whitespace-nowrap" data-label="Último acceso" title={fecha(p.ultimo_acceso)}>{p.ultimo_acceso ? haceCuanto(p.ultimo_acceso, ahora) : 'Nunca'}</td>
                                        <td className="celda-acciones">
                      <div className="usuarios-acciones flex justify-end gap-1.5">
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
                        {!soyYo && (
                          <button type="button" className="btn-mini btn-mini--danger" disabled={deshabilitado}
                            onClick={() => {
                              const nombre = p.nombre || p.email;
                              if (window.confirm(`¿Eliminar la cuenta de ${nombre}? Se borra su acceso y su perfil. Esta acción no se puede deshacer.`)) {
                                void ejecutar(p.id, () => eliminarUsuario(p.id));
                              }
                            }}>
                            <X size={13} /> Eliminar
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
