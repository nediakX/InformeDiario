// Pestaña "Resumen" del Panel de administración: KPIs y gráficos.
import { formatDiaMes, formatFechaCorta } from '../datos/fechas';
import type { Estadisticas, Rango } from './datos';
import { BarrasHorizontales, CumplimientoHero, GrillaTurnos, Indicador, TarjetaGrafico } from './graficos';

const ESTADO_INFORME = { pendiente: 'Sin fotos', iniciado: 'Iniciado', finalizado: 'Finalizado' } as const;

const fechaHora = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export default function Resumen({ stats, rango, enLinea }: { stats: Estadisticas; rango: Rango; enLinea: number }) {
  const { kpis } = stats;
  const textoRango = `${formatDiaMes(rango.desde)} – ${formatDiaMes(rango.hasta)}`;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-[minmax(260px,1.1fr)_2fr]">
        <CumplimientoHero porcentaje={kpis.cumplimiento} finalizados={kpis.finalizados} esperados={kpis.esperados} />
        <div className="kpi-grid">
          <Indicador
            etiqueta="Informes diarios atrasados"
            valor={kpis.atrasados}
            detalle="Turnos terminados sin finalizar"
            alerta={kpis.atrasados > 0 ? 'Revisar en Borradores' : undefined}
          />
          <Indicador etiqueta="Fallas reportadas" valor={kpis.fallas} detalle={textoRango} />
          <Indicador etiqueta="Mantenimientos" valor={kpis.mantenimientos} detalle={textoRango} />
          <Indicador etiqueta="Fotos de evidencia" valor={kpis.fotos} detalle="Cargadas en el periodo" />
          <Indicador etiqueta="En línea ahora" valor={enLinea} detalle="Ver pestaña En línea" />
          <Indicador etiqueta="Usuarios activos" valor={kpis.usuariosActivos} detalle={`de ${kpis.usuariosAprobados} con acceso`} />
          <Indicador
            etiqueta="Cuentas por aprobar"
            valor={kpis.usuariosPendientes}
            detalle="Solicitudes de registro"
            alerta={kpis.usuariosPendientes > 0 ? 'Ver pestaña Usuarios' : undefined}
          />
        </div>
      </div>

      <TarjetaGrafico titulo="Informes diarios por turno" subtitulo={`Estado de cada informe Día y Noche · ${textoRango}`}>
        <GrillaTurnos celdas={stats.celdas} />
      </TarjetaGrafico>

      <div className="admin-grid-2">
        <TarjetaGrafico titulo="Cumplimiento por turno" subtitulo="% de informes finalizados, solo turnos ya terminados">
          <BarrasHorizontales datos={stats.cumplimientoPorLetra} unidad="%" maximo={100} vacio="Sin turnos terminados en el periodo." />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Actividad por usuario" subtitulo="Informes guardados (última persona que lo editó)">
          <BarrasHorizontales datos={stats.actividadPorUsuario} vacio="Aún no hay informes guardados con usuario en este periodo." />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Fallas por carro" subtitulo="Informes de falla en el periodo">
          <BarrasHorizontales datos={stats.fallasPorCarro} vacio="Sin fallas reportadas en el periodo." />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Fallas por tipo" subtitulo="Clasificación elegida en el informe">
          <BarrasHorizontales datos={stats.fallasPorTipo} vacio="Sin fallas reportadas en el periodo." />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Mantenimientos por sitio" subtitulo="Informes de mantenimiento de generador">
          <BarrasHorizontales datos={stats.mantenimientosPorSitio} vacio="Sin mantenimientos en el periodo." />
        </TarjetaGrafico>
      </div>

      <TarjetaGrafico titulo="Actividad reciente" subtitulo="Últimos informes guardados en el periodo">
        {stats.recientes.length === 0 ? (
          <p className="viz-empty">Sin informes guardados en el periodo.</p>
        ) : (
          <div className="viz-table-wrap">
            <table className="viz-table">
              <thead>
                <tr><th>Tipo</th><th>Informe</th><th>Fecha</th><th>Estado</th><th>Editado por</th><th>Guardado</th></tr>
              </thead>
              <tbody>
                {stats.recientes.map(r => (
                  <tr key={r.id}>
                    <td>{r.tipo}</td>
                    <td className="max-w-[260px] truncate" title={r.titulo}>{r.titulo || '—'}</td>
                    <td>{formatFechaCorta(r.fecha)}</td>
                    <td><span className={`pill pill--${r.estado}`}>{ESTADO_INFORME[r.estado]}</span></td>
                    <td>{r.autor}</td>
                    <td className="whitespace-nowrap">{fechaHora(r.savedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TarjetaGrafico>
    </div>
  );
}
