// Gráficos del Panel de administración, hechos a mano (SVG/HTML, sin librerías extra).
// Reglas: marcas delgadas con extremo redondeado, valores en texto neutro (nunca del color de la
// serie), estados siempre con ícono + texto (nunca solo color) y tooltip al pasar el mouse o tocar.
import { useState, type MouseEvent, type ReactNode } from 'react';
import { CheckCircle2, CircleDashed, Clock3, XCircle, MinusCircle } from 'lucide-react';
import type { Barra, CeldaTurno, EstadoCelda } from './datos';
import { formatDiaMes, nombreDiaSemana } from '../datos/fechas';

// ---------------------------------------------------------------------------------------
// Tooltip compartido
// ---------------------------------------------------------------------------------------

interface TooltipEstado { x: number; y: number; contenido: ReactNode }

function useTooltip() {
  const [tip, setTip] = useState<TooltipEstado | null>(null);
  const mostrar = (e: MouseEvent<Element>, contenido: ReactNode) => {
    const caja = (e.currentTarget as Element).closest('.viz-card')?.getBoundingClientRect();
    if (!caja) return;
    setTip({ x: e.clientX - caja.left, y: e.clientY - caja.top, contenido });
  };
  const ocultar = () => setTip(null);
  const nodo = tip ? (
    <div className="viz-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.contenido}</div>
  ) : null;
  return { mostrar, ocultar, nodo };
}

// ---------------------------------------------------------------------------------------
// Tarjeta contenedora
// ---------------------------------------------------------------------------------------

export function TarjetaGrafico({ titulo, subtitulo, acciones, children }: {
  titulo: string;
  subtitulo?: string;
  acciones?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="viz-card">
      <header className="viz-card__header">
        <div>
          <h3 className="viz-card__title">{titulo}</h3>
          {subtitulo && <p className="viz-card__subtitle">{subtitulo}</p>}
        </div>
        {acciones}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------
// Indicadores (stat tiles)
// ---------------------------------------------------------------------------------------

export function Indicador({ etiqueta, valor, detalle, alerta }: {
  etiqueta: string;
  valor: string | number;
  detalle?: string;
  /** Muestra un aviso (con ícono) cuando el valor requiere atención. */
  alerta?: string;
}) {
  return (
    <div className="kpi">
      <div className="kpi__label">{etiqueta}</div>
      <div className="kpi__value">{typeof valor === 'number' ? valor.toLocaleString('es-CL') : valor}</div>
      {detalle && <div className="kpi__detail">{detalle}</div>}
      {alerta && <div className="kpi__alert"><Clock3 size={13} aria-hidden="true" /> {alerta}</div>}
    </div>
  );
}

/** Cifra principal del panel: cumplimiento de informes diarios, con medidor. */
export function CumplimientoHero({ porcentaje, finalizados, esperados }: { porcentaje: number; finalizados: number; esperados: number }) {
  const pct = Math.round(porcentaje * 100);
  const nivel = esperados === 0 ? 'neutro' : pct >= 90 ? 'bueno' : pct >= 70 ? 'atencion' : 'critico';
  const textoNivel = { neutro: 'Sin turnos terminados aún', bueno: 'Al día', atencion: 'Requiere atención', critico: 'Bajo lo esperado' }[nivel];
  const Icono = { neutro: MinusCircle, bueno: CheckCircle2, atencion: Clock3, critico: XCircle }[nivel];
  return (
    <div className="hero">
      <div className="hero__label">Cumplimiento de informes diarios</div>
      <div className="hero__value">{esperados ? `${pct}%` : '—'}</div>
      <div className={`meter meter--${nivel}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Cumplimiento">
        <span style={{ width: `${esperados ? pct : 0}%` }} />
      </div>
      <div className="hero__detail">
        <span className={`estado-chip estado-chip--${nivel}`}><Icono size={13} aria-hidden="true" /> {textoNivel}</span>
        {finalizados} de {esperados} turnos terminados con su informe finalizado
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Barras horizontales (una serie)
// ---------------------------------------------------------------------------------------

export function BarrasHorizontales({ datos, unidad = '', maximo, vacio }: {
  datos: Barra[];
  unidad?: string;
  /** Valor máximo del eje (p. ej. 100 para porcentajes). Por defecto, el mayor valor. */
  maximo?: number;
  vacio: string;
}) {
  const { mostrar, ocultar, nodo } = useTooltip();
  if (!datos.length) return <p className="viz-empty">{vacio}</p>;
  const max = maximo ?? Math.max(...datos.map(d => d.valor), 1);
  return (
    <div className="hbars" onMouseLeave={ocultar}>
      {datos.map(d => {
        const texto = `${d.valor.toLocaleString('es-CL')}${unidad}`;
        return (
          <div
            key={d.etiqueta}
            className="hbars__row"
            onMouseMove={e => mostrar(e, <><strong>{d.etiqueta}</strong><br />{texto}{d.detalle ? <><br />{d.detalle}</> : null}</>)}
            onClick={e => mostrar(e, <><strong>{d.etiqueta}</strong><br />{texto}{d.detalle ? <><br />{d.detalle}</> : null}</>)}
          >
            <span className="hbars__label" title={d.etiqueta}>{d.etiqueta}</span>
            <span className="hbars__track">
              <span className="hbars__bar" style={{ width: `${max ? (d.valor / max) * 100 : 0}%` }} />
              <span className="hbars__value">{texto}</span>
            </span>
          </div>
        );
      })}
      {nodo}
    </div>
  );
}

// ---------------------------------------------------------------------------------------
// Grilla de turnos (estado de cada informe diario, día por día)
// ---------------------------------------------------------------------------------------

const ESTADOS_CELDA: Record<EstadoCelda, { etiqueta: string; Icono: typeof CheckCircle2 }> = {
  finalizado: { etiqueta: 'Finalizado', Icono: CheckCircle2 },
  iniciado: { etiqueta: 'Iniciado (fotos incompletas)', Icono: CircleDashed },
  sin_fotos: { etiqueta: 'Creado sin fotos', Icono: MinusCircle },
  faltante: { etiqueta: 'Faltante', Icono: XCircle },
  en_curso: { etiqueta: 'En curso / por venir', Icono: Clock3 },
};

export function GrillaTurnos({ celdas }: { celdas: CeldaTurno[] }) {
  const { mostrar, ocultar, nodo } = useTooltip();
  const [comoTabla, setComoTabla] = useState(false);
  const fechas = [...new Set(celdas.map(c => c.fecha))];
  const celda = (fecha: string, turno: 'dia' | 'noche') => celdas.find(c => c.fecha === fecha && c.turno === turno);
  const muchas = fechas.length > 31;

  const contenidoTip = (c: CeldaTurno) => (
    <>
      <strong>{nombreDiaSemana(c.fecha)} {formatDiaMes(c.fecha)} · {c.turno === 'dia' ? 'Día' : 'Noche'}</strong><br />
      Turno {c.letra} · {ESTADOS_CELDA[c.estado].etiqueta}
      {c.fotos ? <><br />{c.fotos.llenas} de {c.fotos.total} fotos</> : null}
    </>
  );

  return (
    <div>
      <div className="grid-legend" aria-label="Leyenda">
        {(Object.keys(ESTADOS_CELDA) as EstadoCelda[]).map(e => {
          const { etiqueta, Icono } = ESTADOS_CELDA[e];
          return (
            <span key={e} className="grid-legend__item">
              <span className={`grid-legend__swatch celda--${e}`}><Icono size={10} aria-hidden="true" /></span>
              {etiqueta}
            </span>
          );
        })}
        <button type="button" className="viz-link" onClick={() => setComoTabla(t => !t)}>
          {comoTabla ? 'Ver como gráfico' : 'Ver como tabla'}
        </button>
      </div>

      {comoTabla ? (
        <div className="viz-table-wrap">
          <table className="viz-table">
            <thead><tr><th>Fecha</th><th>Turno</th><th>Día</th><th>Noche</th></tr></thead>
            <tbody>
              {[...fechas].reverse().map(f => {
                const d = celda(f, 'dia');
                const n = celda(f, 'noche');
                return (
                  <tr key={f}>
                    <td>{nombreDiaSemana(f)} {formatDiaMes(f)}</td>
                    <td>{d?.letra}</td>
                    <td>{d ? ESTADOS_CELDA[d.estado].etiqueta : '—'}{d?.fotos ? ` (${d.fotos.llenas}/${d.fotos.total})` : ''}</td>
                    <td>{n ? ESTADOS_CELDA[n.estado].etiqueta : '—'}{n?.fotos ? ` (${n.fotos.llenas}/${n.fotos.total})` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="turnos-grid-scroll" onMouseLeave={ocultar}>
          <div className="turnos-grid" style={{ gridTemplateColumns: `48px repeat(${fechas.length}, minmax(${muchas ? 10 : 18}px, 1fr))` }}>
            <span />
            {fechas.map((f, i) => (
              <span key={f} className="turnos-grid__date">
                {(!muchas || i % 7 === 0 || i === fechas.length - 1) ? formatDiaMes(f) : ''}
              </span>
            ))}
            {(['dia', 'noche'] as const).map(turno => (
              <div key={turno} style={{ display: 'contents' }}>
                <span className="turnos-grid__row-label">{turno === 'dia' ? 'Día' : 'Noche'}</span>
                {fechas.map(f => {
                  const c = celda(f, turno);
                  if (!c) return <span key={f} />;
                  const { Icono } = ESTADOS_CELDA[c.estado];
                  return (
                    <span
                      key={f}
                      className={`turnos-grid__cell celda--${c.estado}`}
                      aria-label={`${formatDiaMes(f)} ${turno === 'dia' ? 'Día' : 'Noche'}: ${ESTADOS_CELDA[c.estado].etiqueta}`}
                      onMouseMove={e => mostrar(e, contenidoTip(c))}
                      onClick={e => mostrar(e, contenidoTip(c))}
                    >
                      {!muchas && <Icono size={11} aria-hidden="true" />}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {nodo}
        </div>
      )}
    </div>
  );
}
