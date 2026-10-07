// Pestaña "En línea": quién está usando la app ahora, en qué pantalla y desde qué dispositivo.
import { useMemo } from 'react';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { etiquetaFaena, type Perfil } from '../auth/sesion';
import { estadoConexion, haceCuanto, type EstadoConexion, type FilaPresencia } from './presencia';
import PuntoConexion from './PuntoConexion';
import { Indicador, TarjetaGrafico } from './graficos';

const ORDEN: Record<EstadoConexion, number> = { en_linea: 0, ausente: 1, desconectado: 2 };

function IconoDispositivo({ dispositivo }: { dispositivo: string | null }) {
  const Icono = dispositivo === 'Celular' ? Smartphone : dispositivo === 'Tablet' ? Tablet : Monitor;
  return dispositivo ? <span className="inline-flex items-center gap-1.5"><Icono size={14} aria-hidden="true" /> {dispositivo}</span> : <>—</>;
}

export default function EnLinea({ perfiles, filas, ahora }: { perfiles: Perfil[]; filas: FilaPresencia[]; ahora: number }) {
  const lista = useMemo(() => {
    const porUsuario = new Map(filas.map(f => [f.usuario_id, f]));
    return perfiles
      .filter(p => p.estado === 'aprobado')
      .map(p => {
        const fila = porUsuario.get(p.id);
        return { perfil: p, fila, estado: estadoConexion(fila, ahora) };
      })
      .sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado]
        || (b.fila?.ultimo_visto ?? '').localeCompare(a.fila?.ultimo_visto ?? '')
        || a.perfil.nombre.localeCompare(b.perfil.nombre));
  }, [perfiles, filas, ahora]);

  const enLinea = lista.filter(x => x.estado === 'en_linea');
  const ausentes = lista.filter(x => x.estado === 'ausente');
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
  const activosHoy = lista.filter(x => x.fila && new Date(x.fila.ultimo_visto) >= hoyInicio).length;

  return (
    <div className="space-y-5">
      <div className="kpi-grid">
        <Indicador etiqueta="En línea ahora" valor={enLinea.length} detalle="Con la app abierta en este momento" />
        <Indicador etiqueta="Ausentes" valor={ausentes.length} detalle="Sin actividad hace 2–15 min" />
        <Indicador etiqueta="Conectados hoy" valor={activosHoy} detalle={`de ${lista.length} usuarios con acceso`} />
      </div>

      <TarjetaGrafico
        titulo="Usuarios conectados"
        subtitulo="Se actualiza solo. La app avisa cada minuto que sigue abierta y en qué pantalla está."
      >
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead>
              <tr><th>Usuario</th><th>Estado</th><th>Pantalla</th><th>Dispositivo</th><th>Conectado desde</th><th>Última actividad</th></tr>
            </thead>
            <tbody>
              {lista.map(({ perfil: p, fila, estado }) => (
                <tr key={p.id} className={estado === 'desconectado' ? 'fila-atenuada' : undefined}>
                  <td>
                    <div className="font-semibold">{p.nombre || p.email}</div>
                    <div className="text-xs text-gray-500">{etiquetaFaena(p.faena)}</div>
                  </td>
                  <td><PuntoConexion estado={estado} /></td>
                  <td>{estado === 'desconectado' ? '—' : fila?.pantalla ?? '—'}</td>
                  <td><IconoDispositivo dispositivo={fila?.dispositivo ?? null} /></td>
                  <td className="whitespace-nowrap">
                    {estado === 'desconectado' || !fila ? '—' : new Date(fila.conectado_desde).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="whitespace-nowrap">{haceCuanto(fila?.ultimo_visto ?? p.ultimo_acceso, ahora)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TarjetaGrafico>
    </div>
  );
}
