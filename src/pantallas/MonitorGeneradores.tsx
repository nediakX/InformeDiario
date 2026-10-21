// Panel principal · Monitoreo de generadores (vista compacta de la Reportabilidad de GG):
// estado de cada generador, alertas automáticas y la variación reciente de cada equipo.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Clock3, Fuel } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import { EVENTO_GG, SITIOS_GG, pendientesGG, suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { analizarGeneradores, valorGG, type EstadoGG, type SitioGG } from '../datos/analisisGG';

type Dato = 'temperatura' | 'horometro' | 'combustible';
const DATOS: { valor: Dato; etiqueta: string; unidad: string }[] = [
  { valor: 'temperatura', etiqueta: 'Temp.', unidad: '°C' },
  { valor: 'horometro', etiqueta: 'Horómetro', unidad: 'h' },
  { valor: 'combustible', etiqueta: 'Combustible', unidad: '%' },
];
const DIAS_ANALISIS = 30;
const CLAVE_DETALLE = 'psinet_dash_gg_detalle';
const MAX_ALERTAS = 3;
const ORDEN_ESTADO: Record<EstadoGG, number> = { critico: 0, sin_datos: 1, atencion: 2, ok: 3 };
const DIAS_GRAFICO = 14;

const ESTADO: Record<EstadoGG, { texto: string; Icono: typeof CheckCircle2 }> = {
  ok: { texto: 'Normal', Icono: CheckCircle2 },
  atencion: { texto: 'Atención', Icono: AlertTriangle },
  critico: { texto: 'Crítico', Icono: AlertOctagon },
  sin_datos: { texto: 'Sin reportes', Icono: CircleDashed },
};

const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });

/** Minigráfico de la variación de un dato en los últimos días (una línea, último punto marcado). */
function Minigrafico({ serie, dato, desde }: { serie: ReporteGG[]; dato: Dato; desde: string }) {
  const puntos = serie
    .filter(r => r.fecha >= desde)
    .map(r => ({ t: Date.parse(`${r.fecha}T${r.hora ?? '12:00'}:00`), v: valorGG(r, dato) }))
    .filter((p): p is { t: number; v: number } => p.v !== null && Number.isFinite(p.v));
  if (puntos.length < 2) return <span className="dash-gg-spark dash-gg-spark--vacio">{puntos.length ? 'Un solo reporte' : 'Sin datos'}</span>;
  const t0 = Date.parse(`${desde}T00:00:00`), t1 = Math.max(t0 + DIAS_GRAFICO * 86_400_000, puntos[puntos.length - 1].t);
  const vs = puntos.map(p => p.v);
  let min = Math.min(...vs), max = Math.max(...vs);
  if (dato === 'combustible') { min = 0; max = 100; }
  if (min === max) { min -= 1; max += 1; }
  const x = (t: number) => 2 + ((t - t0) / (t1 - t0 || 1)) * 96;
  const y = (v: number) => 3 + (1 - (v - min) / (max - min)) * 22;
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const u = puntos[puntos.length - 1];
  return (
    <svg className="dash-gg-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(u.t)} cy={y(u.v)} r={2.2} fill="currentColor" />
    </svg>
  );
}

/** Combustible en 4 segmentos (1/4 · 1/2 · 3/4 · Lleno). */
function Estanque({ nivel }: { nivel: string | null }) {
  const llenos = nivel === 'Lleno' ? 4 : nivel === '3/4' ? 3 : nivel === '1/2' ? 2 : nivel === '1/4' ? 1 : 0;
  return (
    <span className="dash-gg-estanque" title={`Combustible: ${nivel ?? 'sin dato'}`} aria-label={`Combustible ${nivel ?? 'sin dato'}`}>
      {[1, 2, 3, 4].map(i => <span key={i} className={i <= llenos ? (llenos === 1 ? 'bajo' : 'lleno') : ''} />)}
    </span>
  );
}

function Tarjeta({ s, dato, desde, onAbrir }: { s: SitioGG; dato: Dato; desde: string; onAbrir: () => void }) {
  const { texto, Icono } = ESTADO[s.estado];
  const pendienteHoy = s.estado === 'ok' && s.diasSinReporte === 1;
  const u = s.ultimo;
  const valor = u ? valorGG(u, dato) : null;
  const unidad = DATOS.find(d => d.valor === dato)!.unidad;
  return (
    <button type="button" className={`dash-gg-sitio dash-gg-sitio--${s.estado}`} onClick={onAbrir}
      title={s.alertas.map(a => `${a.titulo}: ${a.detalle}`).join('\n') || 'Sin alertas'}>
      <span className="dash-gg-sitio__nombre">{s.sitio.replace(/^LTE_/, '')}</span>
      <span className="dash-gg-sitio__estado">
        {pendienteHoy ? <Clock3 size={12} aria-hidden="true" /> : <Icono size={12} aria-hidden="true" />}
        <span>{s.alertas[0]?.corto ?? (pendienteHoy ? 'Pendiente hoy' : texto)}</span>
      </span>
      <span className="dash-gg-sitio__fila">
        <span className="dash-gg-sitio__valor">{valor != null ? `${dato === 'combustible' && u?.combustible ? u.combustible : fmt(valor)}${dato === 'combustible' ? '' : ` ${unidad}`}` : '—'}</span>
        <Estanque nivel={u?.combustible ?? null} />
      </span>
      <Minigrafico serie={s.serie} dato={dato} desde={desde} />
      <span className="dash-gg-sitio__pie">{u ? `${u.fecha === hoyLocalISO() ? 'Hoy' : `${u.fecha.slice(8, 10)}/${u.fecha.slice(5, 7)}`}${u.hora ? ` ${u.hora}` : ''}` : 'Sin reportes'}{s.alertas.length > 1 ? ` · +${s.alertas.length - 1} alerta${s.alertas.length > 2 ? 's' : ''}` : ''}</span>
    </button>
  );
}

export default function MonitorGeneradores({ onAbrir }: { onAbrir: () => void }) {
  const { division } = useSesion();
  const sitios = SITIOS_GG[division];
  const hoy = hoyLocalISO();
  const desde = sumarDias(hoy, -(DIAS_ANALISIS - 1));
  const [reportes, setReportes] = useState<ReporteGG[] | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const [dato, setDato] = useState<Dato>('temperatura');
  const [verTodas, setVerTodas] = useState(false);
  // El detalle por generador (tarjetas con minigráfico) se abre solo en pantallas grandes; en el
  // celular parte cerrado para no llenar la pantalla. Lo que elija la persona se recuerda.
  const [detalle, setDetalle] = useState<boolean>(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_DETALLE);
      if (guardado) return guardado === '1';
    } catch { /* sin almacenamiento */ }
    return typeof window === 'undefined' || window.innerWidth > 720;
  });
  const alternarDetalle = () => setDetalle(v => {
    try { localStorage.setItem(CLAVE_DETALLE, v ? '0' : '1'); } catch { /* sin almacenamiento */ }
    return !v;
  });

  useEffect(() => {
    let vivo = true;
    todosLosReportesGG({ division, desde, hasta: hoy })
      .then(r => { if (vivo) { setReportes(r); setError(false); } })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [division, desde, hoy, version]);
  useEffect(() => suscribirReportesGG(division, () => setVersion(v => v + 1)), [division]);
  useEffect(() => {
    const alCambiar = () => setVersion(v => v + 1);
    window.addEventListener(EVENTO_GG, alCambiar);
    return () => window.removeEventListener(EVENTO_GG, alCambiar);
  }, []);

  const analisis = useMemo(() => {
    if (!reportes) return null;
    // También cuentan los reportes guardados en este equipo que aún no suben (sin señal).
    const locales = pendientesGG().filter(p => p.division === division && !reportes.some(r => r.id === p.id));
    return analizarGeneradores(sitios, [...reportes, ...locales], hoy);
  }, [reportes, sitios, division, hoy]);

  // Andina u otra división sin reportes aún: no se muestra un monitoreo vacío lleno de alarmas.
  if (!sitios.length || error) return null;
  if (reportes && !reportes.length && division !== 'el_salvador') return null;

  const desdeGrafico = sumarDias(hoy, -(DIAS_GRAFICO - 1));
  // Las faltas de reporte se juntan en una línea por gravedad; las del equipo van una por una.
  const todas = analisis?.alertas ?? [];
  const deReporte = (sev: 'critico' | 'atencion') => todas.filter(a => a.tipo === 'reporte' && a.severidad === sev);
  const filas: { clave: string; severidad: 'critico' | 'atencion'; titulo: ReactNode; detalle: string }[] = [];
  for (const sev of ['critico', 'atencion'] as const) {
    const lista = deReporte(sev);
    if (!lista.length) continue;
    filas.push({
      clave: `reporte-${sev}`, severidad: sev,
      titulo: <>{sev === 'critico' ? 'Sin reporte hace 3 días o más' : 'Sin reporte hace 2 días'} · <strong>{lista.length}</strong> generador{lista.length === 1 ? '' : 'es'}</>,
      detalle: lista.map(a => `${a.sitio.replace(/^LTE_/, '')}${a.fecha ? ` (${a.fecha.slice(8, 10)}/${a.fecha.slice(5, 7)})` : ''}`).join(' · '),
    });
  }
  for (const a of todas.filter(x => x.tipo === 'equipo')) {
    filas.push({ clave: `${a.sitio}-${a.titulo}`, severidad: a.severidad, titulo: <><strong>{a.sitio}</strong> · {a.titulo}</>, detalle: a.detalle });
  }
  filas.sort((x, y) => (x.severidad === y.severidad ? 0 : x.severidad === 'critico' ? -1 : 1));
  const visibles = verTodas ? filas : filas.slice(0, MAX_ALERTAS);
  // Primero los que tienen problemas: en el celular son los que se ven sin deslizar.
  const tarjetas = [...(analisis?.porSitio ?? [])].sort((a, b) => ORDEN_ESTADO[a.estado] - ORDEN_ESTADO[b.estado]);

  return (
    <section className="dash-gg" aria-labelledby="dash-gg-titulo">
      <div className="dash-gg__cabecera">
        <h2 id="dash-gg-titulo" className="font-display">Generadores</h2>
        {analisis && (
          <span className="dash-gg__resumen" aria-label={`${analisis.resumen.ok} normales, ${analisis.resumen.atencion} en atención, ${analisis.resumen.critico} críticos`}>
            <span className="dash-gg-cuenta dash-gg-cuenta--ok" title="Normales"><CheckCircle2 size={13} aria-hidden="true" /><strong>{analisis.resumen.ok}</strong><span className="dash-gg-cuenta__txt">normales</span></span>
            <span className="dash-gg-cuenta dash-gg-cuenta--atencion" title="En atención"><AlertTriangle size={13} aria-hidden="true" /><strong>{analisis.resumen.atencion}</strong><span className="dash-gg-cuenta__txt">atención</span></span>
            <span className="dash-gg-cuenta dash-gg-cuenta--critico" title="Críticos"><AlertOctagon size={13} aria-hidden="true" /><strong>{analisis.resumen.critico}</strong><span className="dash-gg-cuenta__txt">críticos</span></span>
          </span>
        )}
        <button type="button" onClick={onAbrir} className="dash-enlace dash-gg__abrir" aria-label="Abrir Reportabilidad de GG">
          <Fuel size={14} aria-hidden="true" /><span className="dash-gg__abrir-txt">Reportabilidad</span><ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>

      {!analisis ? (
        <div className="dash-gg__caja dash-gg__cargando">Cargando estado de los generadores…</div>
      ) : (
        <div className="dash-gg__caja">
          {filas.length > 0 ? (
            <ul className="dash-gg-alertas" aria-label="Alertas de generadores">
              {visibles.map(f => (
                <li key={f.clave} className={`dash-gg-alerta dash-gg-alerta--${f.severidad}`}>
                  {f.severidad === 'critico' ? <AlertOctagon size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
                  <span className="dash-gg-alerta__texto">
                    <span><span className="sr-only">{f.severidad === 'critico' ? 'Crítico: ' : 'Atención: '}</span>{f.titulo}</span>
                    <span className="dash-gg-alerta__detalle" title={f.detalle}>{f.detalle}</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-gg-sin-alertas"><CheckCircle2 size={15} aria-hidden="true" /> Sin alertas: todos reportados y dentro de lo normal.</p>
          )}

          <div className="dash-gg__acciones">
            {filas.length > MAX_ALERTAS && (
              <button type="button" className="dash-enlace" onClick={() => setVerTodas(v => !v)}>{verTodas ? 'Menos alertas' : `+${filas.length - MAX_ALERTAS} alerta${filas.length - MAX_ALERTAS === 1 ? '' : 's'} más`}</button>
            )}
            <button type="button" className="dash-enlace dash-gg__toggle" aria-expanded={detalle} aria-controls="dash-gg-detalle" onClick={alternarDetalle}>
              {detalle ? 'Ocultar detalle' : `Ver los ${tarjetas.length} generadores`} <ChevronDown size={14} aria-hidden="true" className={detalle ? 'rotate-180' : ''} />
            </button>
          </div>

          {detalle && (
            <div id="dash-gg-detalle" className="dash-gg__detalle">
              <div className="dash-gg__barra">
                <span className="dash-gg__barra-titulo">Últimos {DIAS_GRAFICO} días</span>
                <div className="dash-gg-dato" role="group" aria-label="Dato del gráfico">
                  {DATOS.map(d => <button key={d.valor} type="button" aria-pressed={dato === d.valor} onClick={() => setDato(d.valor)}>{d.etiqueta}</button>)}
                </div>
              </div>
              <div className="dash-gg-sitios">
                {tarjetas.map(s => <Tarjeta key={s.sitio} s={s} dato={dato} desde={desdeGrafico} onAbrir={onAbrir} />)}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
