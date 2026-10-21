// Panel de administración · Generadores: seguimiento de la Reportabilidad de GG.
// - Cuántos sitios se reportaron cada día (barras, una serie).
// - Evolución de un sitio en el tiempo (línea: horómetro, temperatura, combustible o partidas).
// - Estado actual de cada sitio (último reporte, con aviso si está atrasado).
// Gráficos hechos a mano en SVG, con las mismas reglas del resto del panel: una sola serie en el
// azul de la marca, valores en texto neutro, estados con ícono + texto y tooltip al pasar o tocar.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, XCircle } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import { COMBUSTIBLE_PCT, SITIOS_GG, listarReportesGG, suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { esErrorDeRed } from '../lib/conexion';
import { analizarGeneradores } from '../datos/analisisGG';
import { Indicador, TarjetaGrafico } from './graficos';

type Metrica = 'horometro' | 'temperatura' | 'combustible' | 'nroPartidas';
const METRICAS: { valor: Metrica; etiqueta: string; unidad: string }[] = [
  { valor: 'horometro', etiqueta: 'Horómetro', unidad: 'h' },
  { valor: 'temperatura', etiqueta: 'Temperatura', unidad: '°C' },
  { valor: 'combustible', etiqueta: 'Combustible', unidad: '%' },
  { valor: 'nroPartidas', etiqueta: 'Partidas', unidad: '' },
];
const PERIODOS = [{ dias: 7, etiqueta: '7 días' }, { dias: 30, etiqueta: '30 días' }, { dias: 90, etiqueta: '90 días' }];

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmt = (n: number, dec = 1) => n.toLocaleString('es-CL', { maximumFractionDigits: dec });
const valorDe = (r: ReporteGG, m: Metrica): number | null =>
  m === 'combustible' ? (r.combustible ? COMBUSTIBLE_PCT[r.combustible] ?? null : null) : r[m];
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/** Escala "bonita" para el eje: 4 marcas redondas que cubren [min, max]. */
function marcasEje(min: number, max: number, cantidad = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const paso0 = (max - min) / cantidad;
  const mag = 10 ** Math.floor(Math.log10(paso0));
  const paso = [1, 2, 2.5, 5, 10].map(f => f * mag).find(p => p >= paso0) ?? paso0;
  const desde = Math.floor(min / paso) * paso;
  const marcas: number[] = [];
  for (let v = desde; v <= max + paso * 0.001; v += paso) marcas.push(Number(v.toFixed(6)));
  if (marcas[marcas.length - 1] < max) marcas.push(marcas[marcas.length - 1] + paso);
  return marcas;
}

interface Tip { x: number; y: number; html: React.ReactNode }

/** Ancho real del gráfico en pantalla: así el texto de los ejes se ve siempre del mismo tamaño. */
function useAncho<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(280, Math.round(el.clientWidth)));
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, ancho];
}

/** Barras verticales: sitios reportados por día (máximo = total de sitios). */
function BarrasDias({ dias, total }: { dias: { fecha: string; sitios: string[] }[]; total: number }) {
  const [tip, setTip] = useState<Tip | null>(null);
  const [caja, W] = useAncho<HTMLDivElement>();
  const H = 200, M = { t: 10, r: 8, b: 26, l: 30 };
  const ancho = (W - M.l - M.r) / Math.max(1, dias.length);
  const barra = Math.max(2, Math.min(16, ancho * 0.62));
  const y = (v: number) => M.t + (H - M.t - M.b) * (1 - v / Math.max(1, total));
  const cadaCuanto = Math.ceil(dias.length / Math.max(2, Math.floor(W / 70)));
  const mostrar = (e: PointerEvent, d: { fecha: string; sitios: string[] }) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, html: <><strong>{ddmm(d.fecha)}</strong><br />{d.sitios.length} de {total} sitios</> });
  };
  return (
    <div ref={caja} className="relative" onPointerLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="max-w-full block" role="img" aria-label="Sitios reportados por día">
        {[0, Math.round(total / 2), total].map(v => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">{v}</text>
          </g>
        ))}
        {dias.map((d, i) => {
          const cx = M.l + ancho * i + ancho / 2;
          const alto = y(0) - y(d.sitios.length);
          return (
            <g key={d.fecha} onPointerMove={e => mostrar(e, d)} onPointerDown={e => mostrar(e, d)}>
              <rect x={M.l + ancho * i} y={M.t} width={ancho} height={H - M.t - M.b} fill="transparent" />
              {d.sitios.length > 0 && (
                <path d={`M${cx - barra / 2},${y(0)} v${-(alto - Math.min(4, alto))} q0,${-Math.min(4, alto)} ${Math.min(4, barra / 2)},${-Math.min(4, alto)} h${barra - 2 * Math.min(4, barra / 2)} q${Math.min(4, barra / 2)},0 ${Math.min(4, barra / 2)},${Math.min(4, alto)} v${alto - Math.min(4, alto)} z`}
                  fill={d.sitios.length >= total ? 'var(--series-1)' : 'var(--series-1)'} opacity={d.sitios.length >= total ? 1 : 0.55} />
              )}
              {i % cadaCuanto === 0 && <text x={cx} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{ddmm(d.fecha)}</text>}
            </g>
          );
        })}
        <line x1={M.l} x2={W - M.r} y1={y(0)} y2={y(0)} stroke="var(--baseline)" strokeWidth={1} />
      </svg>
      {tip && <div className="viz-tooltip" style={{ left: tip.x, top: tip.y }} role="tooltip">{tip.html}</div>}
    </div>
  );
}

/** Línea de una serie en el tiempo, con línea guía y tooltip del punto más cercano. */
function LineaTiempo({ puntos, unidad, vacio }: { puntos: { t: number; v: number; r: ReporteGG }[]; unidad: string; vacio: string }) {
  const [activo, setActivo] = useState<number | null>(null);
  const [caja, W] = useAncho<HTMLDivElement>();
  const H = 220, M = { t: 12, r: 12, b: 26, l: 46 };
  return <div ref={caja} className="relative">{puntos.length === 0 ? <p className="viz-empty">{vacio}</p> : <Linea puntos={puntos} unidad={unidad} W={W} H={H} M={M} activo={activo} setActivo={setActivo} />}</div>;
}

function Linea({ puntos, unidad, W, H, M, activo, setActivo }: {
  puntos: { t: number; v: number; r: ReporteGG }[]; unidad: string; W: number; H: number;
  M: { t: number; r: number; b: number; l: number }; activo: number | null; setActivo: (i: number | null) => void;
}) {
  const t0 = puntos[0].t, t1 = puntos[puntos.length - 1].t === t0 ? t0 + 86_400_000 : puntos[puntos.length - 1].t;
  const valores = puntos.map(p => p.v);
  const marcas = marcasEje(Math.min(...valores), Math.max(...valores));
  const vmin = marcas[0], vmax = marcas[marcas.length - 1];
  const x = (t: number) => M.l + ((t - t0) / (t1 - t0)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - vmin) / (vmax - vmin || 1)) * (H - M.t - M.b);
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const fechas = [puntos[0], puntos[Math.floor(puntos.length / 2)], puntos[puntos.length - 1]];
  const mover = (e: PointerEvent<SVGSVGElement>) => {
    const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let mejor = 0;
    puntos.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(puntos[mejor].t) - px)) mejor = i; });
    setActivo(mejor);
  };
  const p = activo !== null ? puntos[activo] : null;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="max-w-full touch-none block" role="img" aria-label="Evolución en el tiempo"
        onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setActivo(null)}>
        {marcas.map(v => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={M.l - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">{fmt(v, 0)}</text>
          </g>
        ))}
        {fechas.map((f, i) => (
          <text key={i} x={x(f.t)} y={H - 8} fontSize={11} fill="var(--text-muted)" textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>{ddmm(f.r.fecha)}</text>
        ))}
        <path d={d} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {puntos.length <= 60 && puntos.map((pt, i) => <circle key={i} cx={x(pt.t)} cy={y(pt.v)} r={2.5} fill="var(--series-1)" />)}
        {p && (
          <g>
            <line x1={x(p.t)} x2={x(p.t)} y1={M.t} y2={H - M.b} stroke="var(--baseline)" strokeWidth={1} />
            <circle cx={x(p.t)} cy={y(p.v)} r={5} fill="var(--series-1)" stroke="#fff" strokeWidth={2} />
          </g>
        )}
      </svg>
      {p && (
        <div className="viz-tooltip" role="tooltip" style={{ left: x(p.t), top: y(p.v) }}>
          <strong>{ddmm(p.r.fecha)}{p.r.hora ? ` ${p.r.hora}` : ''}</strong><br />
          {fmt(p.v)}{unidad ? ` ${unidad}` : ''}{p.r.combustible && unidad === '%' ? ` (${p.r.combustible})` : ''}<br />
          {p.r.reporta}
        </div>
      )}
    </>
  );
}

type EstadoSitio = 'al_dia' | 'ayer' | 'atrasado' | 'sin_datos';
const ESTADO: Record<EstadoSitio, { texto: (d: number) => string; clase: string; Icono: typeof CheckCircle2 }> = {
  al_dia: { texto: () => 'Reportado hoy', clase: 'estado-chip--bueno', Icono: CheckCircle2 },
  ayer: { texto: () => 'Último: ayer', clase: 'estado-chip--atencion', Icono: Clock3 },
  atrasado: { texto: d => `Hace ${d} días`, clase: 'estado-chip--critico', Icono: AlertTriangle },
  sin_datos: { texto: () => 'Sin reportes', clase: 'estado-chip--neutro', Icono: XCircle },
};

export default function Generadores() {
  const { division } = useSesion();
  const sitios = SITIOS_GG[division];
  const hoy = hoyLocalISO();
  const [dias, setDias] = useState(30);
  const [sitio, setSitio] = useState(sitios[0] ?? '');
  const [metrica, setMetrica] = useState<Metrica>('horometro');
  const [reportes, setReportes] = useState<ReporteGG[] | null>(null);
  const [ultimos, setUltimos] = useState<Map<string, ReporteGG | null> | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);

  const desde = sumarDias(hoy, -(dias - 1));
  useEffect(() => {
    let vivo = true;
    todosLosReportesGG({ division, desde, hasta: hoy })
      .then(r => { if (vivo) { setReportes(r); setError(''); } })
      .catch(e => { if (vivo) setError(esErrorDeRed(e) ? 'Sin conexión: no se pudieron cargar los reportes de GG.' : 'No se pudieron cargar los reportes de GG (¿se creó la tabla reportes_gg en Supabase?).'); });
    Promise.all(sitios.map(s => listarReportesGG({ division, sitio: s }, 0, 1).then(r => [s, r[0] ?? null] as const)))
      .then(pares => { if (vivo) setUltimos(new Map(pares)); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [division, desde, hoy, sitios, version]);
  useEffect(() => suscribirReportesGG(division, () => setVersion(v => v + 1)), [division]);

  const porDia = useMemo(() => {
    const lista: { fecha: string; sitios: string[] }[] = [];
    for (let i = 0; i < dias; i++) {
      const fecha = sumarDias(desde, i);
      lista.push({ fecha, sitios: [...new Set((reportes ?? []).filter(r => r.fecha === fecha).map(r => r.sitio))] });
    }
    return lista;
  }, [reportes, dias, desde]);

  const puntos = useMemo(() => (reportes ?? [])
    .filter(r => r.sitio === sitio)
    .map(r => ({ r, v: valorDe(r, metrica), t: Date.parse(`${r.fecha}T${r.hora ?? '12:00'}:00`) }))
    .filter((p): p is { r: ReporteGG; v: number; t: number } => p.v !== null && Number.isFinite(p.v))
    .sort((a, b) => a.t - b.t), [reportes, sitio, metrica]);

  const hoyReportados = porDia[porDia.length - 1]?.sitios.length ?? 0;
  const estados = sitios.map(s => {
    const u = ultimos?.get(s) ?? null;
    const d = u ? diasEntre(u.fecha, hoy) : Infinity;
    const estado: EstadoSitio = !u ? 'sin_datos' : d <= 0 ? 'al_dia' : d === 1 ? 'ayer' : 'atrasado';
    return { sitio: s, u, d, estado };
  });
  const atrasados = estados.filter(e => e.estado === 'atrasado' || e.estado === 'sin_datos').length;
  // Alertas automáticas (mismas reglas que el panel principal), con los reportes del periodo.
  const analisis = analizarGeneradores(sitios, reportes ?? [], hoy);
  const alertasDe = new Map(analisis.porSitio.map(p => [p.sitio, p.alertas.filter(a => a.tipo === 'equipo')]));
  const alertasEquipo = analisis.alertas.filter(a => a.tipo === 'equipo');
  const met = METRICAS.find(m => m.valor === metrica)!;
  const diasCompletos = porDia.filter(d => d.sitios.length >= sitios.length).length;

  if (error) return <div className="rounded-md border border-[#f1c0c0] bg-[#fbe9e9] text-[#a32626] text-sm px-4 py-3">{error}</div>;
  if (!reportes) return <div className="flex items-center gap-2 text-sm text-gray-500 py-10 justify-center"><Loader2 size={18} className="animate-spin" /> Cargando reportes de GG…</div>;

  return (
    <div className="space-y-5">
      <div className="admin-filters">
        <div className="segmented" role="group" aria-label="Periodo">
          {PERIODOS.map(p => <button key={p.dias} type="button" aria-pressed={dias === p.dias} onClick={() => setDias(p.dias)}>{p.etiqueta}</button>)}
        </div>
      </div>

      <div className="kpi-grid">
        <Indicador etiqueta="Sitios reportados hoy" valor={`${hoyReportados} de ${sitios.length}`}
          alerta={hoyReportados < sitios.length ? `Faltan ${sitios.length - hoyReportados}` : undefined} />
        <Indicador etiqueta="Reportes en el periodo" valor={reportes.length} detalle={`últimos ${dias} días`} />
        <Indicador etiqueta="Días con todos los sitios" valor={`${diasCompletos} de ${dias}`} />
        <Indicador etiqueta="Sitios atrasados" valor={atrasados} detalle="2 días o más sin reporte"
          alerta={atrasados ? 'Revisar' : undefined} />
        <Indicador etiqueta="Alertas de equipos" valor={alertasEquipo.length}
          detalle={`${alertasEquipo.filter(a => a.severidad === 'critico').length} críticas`}
          alerta={alertasEquipo.length ? 'Ver detalle abajo' : undefined} />
      </div>

      <TarjetaGrafico titulo="Alertas automáticas" subtitulo="Último reporte de cada generador: combustible, aceite, refrigerante, temperatura, horómetro y partidas">
        {alertasEquipo.length === 0 ? (
          <p className="viz-empty">Sin anomalías en los últimos reportes.</p>
        ) : (
          <ul className="space-y-1.5">
            {alertasEquipo.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className={`estado-chip ${a.severidad === 'critico' ? 'estado-chip--critico' : 'estado-chip--atencion'}`}>
                  <AlertTriangle size={13} aria-hidden="true" /> {a.severidad === 'critico' ? 'Crítico' : 'Atención'}
                </span>
                <strong>{a.sitio}</strong> {a.titulo}
                <span className="text-gray-500 text-xs">{a.detalle}{a.fecha ? ` · ${ddmm(a.fecha)}` : ''}</span>
              </li>
            ))}
          </ul>
        )}
      </TarjetaGrafico>

      <TarjetaGrafico titulo="Sitios reportados por día" subtitulo={`De ${sitios.length} sitios · barra completa = todos reportados`}>
        <BarrasDias dias={porDia} total={sitios.length} />
      </TarjetaGrafico>

      <TarjetaGrafico titulo={`${met.etiqueta} · ${sitio}`} subtitulo={`Cada punto es un reporte · últimos ${dias} días`}
        acciones={
          <div className="flex flex-wrap gap-2">
            <select value={sitio} onChange={e => setSitio(e.target.value)} aria-label="Sitio" className="border border-[#DCE1E6] rounded-md text-sm p-1.5 bg-white">
              {sitios.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="segmented" role="group" aria-label="Dato">
              {METRICAS.map(m => <button key={m.valor} type="button" aria-pressed={metrica === m.valor} onClick={() => setMetrica(m.valor)}>{m.etiqueta}</button>)}
            </div>
          </div>
        }>
        <LineaTiempo puntos={puntos} unidad={met.unidad} vacio={`${sitio} no tiene reportes con ${met.etiqueta.toLowerCase()} en este periodo.`} />
      </TarjetaGrafico>

      <TarjetaGrafico titulo="Estado de cada sitio" subtitulo="Último reporte de cada generador">
        <div className="viz-table-wrap">
          <table className="viz-table viz-table--tarjetas">
            <thead>
              <tr><th>Sitio</th><th>Estado</th><th>Alertas</th><th>Último reporte</th><th>Combustible</th><th className="num">Horómetro</th><th className="num">Temp.</th><th>Aceite</th><th>Refrigerante</th></tr>
            </thead>
            <tbody>
              {estados.map(({ sitio: s, u, d, estado }) => {
                const { texto, clase, Icono } = ESTADO[estado];
                return (
                  <tr key={s}>
                    <td><strong>{s}</strong></td>
                    <td><span className={`estado-chip ${clase}`}><Icono size={13} aria-hidden="true" /> {texto(d)}</span></td>
                    <td className="text-xs">{(alertasDe.get(s) ?? []).map(a => a.corto).join(' · ') || '—'}</td>
                    <td>{u ? `${ddmm(u.fecha)}${u.hora ? ` ${u.hora}` : ''} · ${u.reporta}` : '—'}</td>
                    <td>{u?.combustible ?? '—'}</td>
                    <td className="num">{u?.horometro != null ? fmt(u.horometro) : '—'}</td>
                    <td className="num">{u?.temperatura != null ? `${fmt(u.temperatura)} °C` : '—'}</td>
                    <td>{u?.nivelAceite ?? '—'}</td>
                    <td>{u?.nivelRefrigerante ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </TarjetaGrafico>
    </div>
  );
}
