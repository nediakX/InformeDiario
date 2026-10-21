// Pestaña "Actividades" del panel de administración: qué actividades se hicieron en el periodo,
// cuántas veces, cuáles se repiten y cuáles son de rutina. Los nombres escritos distinto que son
// la misma actividad se cuentan juntos (y se muestran como variantes).
import { useMemo, useState } from 'react';
import { Copy, Layers, Repeat, Search } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { formatDiaMes } from '../datos/fechas';
import type { DatosAdmin, Rango } from './datos';
import { calcularMetricasActividades, type TipoActividad } from './metricasActividades';
import { BarrasHorizontales, Indicador, TarjetaGrafico } from './graficos';

const TIPOS: Record<TipoActividad, { etiqueta: string; clase: string }> = {
  rutinaria: { etiqueta: 'Rutinaria', clase: 'estado-chip--neutro' },
  repetida: { etiqueta: 'Repetida', clase: 'estado-chip--atencion' },
  unica: { etiqueta: 'Única', clase: 'estado-chip--bueno' },
};
type Filtro = 'operativas' | 'repetida' | 'rutinaria' | 'todas';
const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'operativas', etiqueta: 'Operativas' },
  { valor: 'repetida', etiqueta: 'Repetidas' },
  { valor: 'rutinaria', etiqueta: 'Rutinarias' },
  { valor: 'todas', etiqueta: 'Todas' },
];
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });

export default function ActividadesInformes({ datos, rango }: { datos: DatosAdmin; rango: Rango }) {
  const { division } = useSesion();
  const m = useMemo(() => calcularMetricasActividades(datos.diarios, division), [datos, division]);
  const [filtro, setFiltro] = useState<Filtro>('operativas');
  const [busqueda, setBusqueda] = useState('');
  const textoRango = `${formatDiaMes(rango.desde)} – ${formatDiaMes(rango.hasta)}`;

  const q = busqueda.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const visibles = m.grupos.filter(g => {
    if (filtro === 'operativas' && g.tipo === 'rutinaria') return false;
    if ((filtro === 'repetida' || filtro === 'rutinaria') && g.tipo !== filtro) return false;
    if (!q) return true;
    return [g.nombre, ...g.variantes.map(v => v.texto)].some(t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q));
  });

  if (!m.informes) return <p className="viz-empty py-10 text-center">No hay informes diarios editados en el periodo ({textoRango}).</p>;

  return (
    <div className="space-y-5">
      <div className="kpi-grid">
        <Indicador etiqueta="Actividades registradas" valor={m.registradas} detalle={`en ${m.informes} informes · ${fmt(m.promedioPorInforme)} por informe`} />
        <Indicador etiqueta="Actividades distintas" valor={m.distintas} detalle={`${m.rutinarias.grupos} rutinarias · ${m.distintas - m.rutinarias.grupos} operativas`} />
        <Indicador etiqueta="Operativas realizadas" valor={m.registradas - m.rutinarias.veces} detalle={`${fmt(m.operativasPorInforme)} por informe (sin contar las de rutina)`} />
        <Indicador etiqueta="Repetidas" valor={m.repetidas.grupos} detalle={`${m.repetidas.veces} veces en total · ${m.unicas} únicas`}
          alerta={m.repetidas.grupos ? 'Ver lista abajo' : undefined} />
        <Indicador etiqueta="Nombres unificados" valor={m.unificadas} detalle="Escritos distinto, misma actividad" />
        <Indicador etiqueta="Duplicadas en un informe" valor={m.duplicadasEnInforme} detalle="La misma actividad 2 veces en un informe"
          alerta={m.duplicadasEnInforme ? 'Revisar' : undefined} />
      </div>

      <div className="admin-grid-2">
        <TarjetaGrafico titulo="Actividades operativas por categoría" subtitulo={`Veces realizadas, sin las de rutina · ${textoRango}`}>
          <BarrasHorizontales datos={m.porCategoria} vacio="Solo hubo actividades de rutina en el periodo." />
        </TarjetaGrafico>
        <TarjetaGrafico titulo="Actividades que más se repiten" subtitulo="No son de rutina y se hicieron en 2 o más informes">
          <BarrasHorizontales datos={m.topRepetidas} vacio="Ninguna actividad operativa se repitió en el periodo." />
        </TarjetaGrafico>
      </div>

      <TarjetaGrafico titulo="Detalle de actividades" subtitulo="Cada fila junta las formas en que se escribió la misma actividad"
        acciones={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar actividad"
                aria-label="Buscar actividad" className="border border-[#DCE1E6] rounded-md text-sm py-1.5 pl-7 pr-2 w-[180px]" />
            </label>
            <div className="segmented" role="group" aria-label="Qué actividades ver">
              {FILTROS.map(f => <button key={f.valor} type="button" aria-pressed={filtro === f.valor} onClick={() => setFiltro(f.valor)}>{f.etiqueta}</button>)}
            </div>
          </div>
        }>
        {visibles.length === 0 ? (
          <p className="viz-empty">No hay actividades con este filtro.</p>
        ) : (
          <div className="viz-table-wrap">
            <table className="viz-table">
              <thead>
                <tr><th>Actividad</th><th className="ocultar-movil">Categoría</th><th>Tipo</th><th className="num">Veces</th><th className="num ocultar-movil">Día / Noche</th><th className="ocultar-movil">Fechas</th></tr>
              </thead>
              <tbody>
                {visibles.map(g => (
                  <tr key={g.nombre}>
                    <td className="max-w-[360px]">
                      <span className="font-semibold">{g.nombre}</span>
                      <span className="solo-movil text-[11px] text-gray-500">{g.categoria} · {g.primera === g.ultima ? ddmm(g.primera) : `${ddmm(g.primera)} – ${ddmm(g.ultima)}`}</span>
                      {g.variantes.length > 0 && (
                        <span className="block text-[11px] text-gray-500 mt-0.5" title={g.variantes.map(v => `${v.texto} (${v.veces})`).join('\n')}>
                          <Layers size={11} className="inline mr-1" aria-hidden="true" />
                          También escrita como: {g.variantes.slice(0, 3).map(v => `«${v.texto}»`).join(', ')}{g.variantes.length > 3 ? ` y ${g.variantes.length - 3} más` : ''}
                        </span>
                      )}
                      {g.duplicadaEnInforme > 0 && (
                        <span className="block text-[11px] text-[#7a5b00] mt-0.5"><Copy size={11} className="inline mr-1" aria-hidden="true" />Duplicada {g.duplicadaEnInforme} {g.duplicadaEnInforme === 1 ? 'vez' : 'veces'} dentro de un mismo informe</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap ocultar-movil">{g.categoria}</td>
                    <td><span className={`estado-chip ${TIPOS[g.tipo].clase}`}>{g.tipo === 'repetida' && <Repeat size={12} aria-hidden="true" />} {TIPOS[g.tipo].etiqueta}</span></td>
                    <td className="num">{g.veces}</td>
                    <td className="num whitespace-nowrap ocultar-movil">{g.dia} / {g.noche}</td>
                    <td className="whitespace-nowrap ocultar-movil">{g.primera === g.ultima ? ddmm(g.primera) : `${ddmm(g.primera)} – ${ddmm(g.ultima)}`}</td>
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
