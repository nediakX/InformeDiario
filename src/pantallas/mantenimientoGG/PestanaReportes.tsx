// Pestaña "Reportabilidad": el último reporte de GG de cada generador (horómetro, uso diario, partidas,
// combustible, niveles y temperatura), sus alertas y los últimos reportes, para el electromecánico.
import { Fragment, useState } from 'react';
import { ChevronDown, ExternalLink, History } from 'lucide-react';
import { TEMP_ATENCION, TEMP_CRITICA, esNoRealizada, type EstadoGG, type SitioGG } from '../../datos/analisisGG';
import type { ReporteGG } from '../../datos/reportesGG';
import type { Vencimiento } from '../../datos/indicadoresMantenimientoGG';
import { hoyLocalISO } from '../../datos/fechas';
import { Dato, Estado, NombreEquipo } from './comunes';
import { NOMBRE_REFRIGERANTE, cuandoLectura, fmtHoras, type EquipoCalculado } from './formato';

interface Props {
  equipos: EquipoCalculado[];
  /** Los reportes todavía no llegan. */
  cargando: boolean;
  error: boolean;
}

const COLOR: Record<EstadoGG, Vencimiento> = { critico: 'vencido', atencion: 'proximo', ok: 'al_dia', sin_datos: 'sin_datos' };
const TEXTO: Record<EstadoGG, string> = { critico: 'Crítico', atencion: 'Atención', ok: 'Normal', sin_datos: 'Sin reportes' };
const ULTIMOS = 10;

const estadoGG = (s: SitioGG | null) => {
  if (!s) return { color: 'sin_datos' as Vencimiento, texto: 'Sin reportes' };
  if (s.estado === 'ok' && s.diasSinReporte === 1) return { color: 'al_dia' as Vencimiento, texto: 'Pendiente hoy' };
  return { color: COLOR[s.estado], texto: TEXTO[s.estado] };
};

const claseCombustible = (c: string | null) => (c === '1/4' ? 'mgg-valor--vencido' : '');
const claseRefrigerante = (r: string | null) => (r === 'Minimo' ? 'mgg-valor--proximo' : '');
const claseAceite = (a: string | null) => (a === 'Bajo' ? 'mgg-valor--vencido' : a === 'Sobre Relleno' ? 'mgg-valor--proximo' : '');
const claseTemperatura = (t: number | null) => (t === null ? '' : t >= TEMP_CRITICA ? 'mgg-valor--vencido' : t >= TEMP_ATENCION ? 'mgg-valor--proximo' : '');
const fmtTemp = (t: number | null) => (t === null ? '—' : `${fmtHoras(t)} °C`);
const fmtUso = (r: number | null) => (r === null ? '—' : `${fmtHoras(Math.round(r * 10) / 10)} h/día`);
const cuando = (r: ReporteGG) => cuandoLectura({ fecha: r.fecha, hora: r.hora });

/** Combustible en 4 segmentos (1/4 · 1/2 · 3/4 · Lleno). */
function Estanque({ nivel }: { nivel: string | null }) {
  const llenos = nivel === 'Lleno' ? 4 : nivel === '3/4' ? 3 : nivel === '1/2' ? 2 : nivel === '1/4' ? 1 : 0;
  return (
    <span className="mgg-estanque" aria-hidden="true">
      {[1, 2, 3, 4].map(i => <span key={i} className={i <= llenos ? (llenos === 1 ? 'bajo' : 'lleno') : ''} />)}
    </span>
  );
}

function Alertas({ s }: { s: SitioGG | null }) {
  if (!s || !s.alertas.length) return <span className="mgg-sub">Sin alertas</span>;
  return (
    <span className="mgg-alertas">
      {s.alertas.slice(0, 2).map(a => (
        <span key={a.titulo} className={`mgg-alerta mgg-alerta--${a.severidad}`} title={`${a.titulo}: ${a.detalle}`}>{a.corto}</span>
      ))}
      {s.alertas.length > 2 && <span className="mgg-sub" title={s.alertas.slice(2).map(a => a.titulo).join(' · ')}>+{s.alertas.length - 2}</span>}
    </span>
  );
}

/** Últimos reportes del generador (el más reciente arriba). */
function Historial({ s }: { s: SitioGG }) {
  const lista = [...s.serie].reverse().slice(0, ULTIMOS);
  if (!lista.length) return <p className="mgg-sub">Sin reportes en los últimos 30 días.</p>;
  return (
    <div className="mgg-historial-envoltura">
      <table className="mgg-historial">
        <caption className="sr-only">Últimos reportes de {s.sitio}</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th><th scope="col">Reporta</th><th scope="col" className="mgg-num">Horómetro</th>
            <th scope="col" className="mgg-num">Partidas</th><th scope="col">Comb.</th><th scope="col">Refrig.</th>
            <th scope="col">Aceite</th><th scope="col" className="mgg-num">Temp.</th><th scope="col">Observación</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(r => esNoRealizada(r) ? (
            <tr key={r.id}>
              <td className="mgg-nowrap">{cuando(r)}</td><td>{r.reporta || '—'}</td>
              <td colSpan={7}><span className="mgg-valor--proximo">No realizada</span>{r.observaciones ? ` · ${r.observaciones}` : ''}</td>
            </tr>
          ) : (
            <tr key={r.id}>
              <td className="mgg-nowrap">{cuando(r)}</td>
              <td>{r.reporta || '—'}</td>
              <td className="mgg-num">{fmtHoras(r.horometro)}</td>
              <td className="mgg-num">{r.nroPartidas ?? '—'}</td>
              <td className={claseCombustible(r.combustible)}>{r.combustible ?? '—'}</td>
              <td className={claseRefrigerante(r.nivelRefrigerante)}>{NOMBRE_REFRIGERANTE[r.nivelRefrigerante ?? ''] ?? r.nivelRefrigerante ?? '—'}</td>
              <td className={claseAceite(r.nivelAceite)}>{r.nivelAceite ?? '—'}</td>
              <td className={`mgg-num ${claseTemperatura(r.temperatura)}`}>{fmtTemp(r.temperatura)}</td>
              <td className="mgg-historial__obs">{r.observaciones || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FilaPlanilla({ e }: { e: EquipoCalculado }) {
  const [abierta, setAbierta] = useState(false);
  const s = e.gg;
  const u = s?.ultimo ?? null;
  const noRealizada = !!u && u.fecha === hoyLocalISO() && esNoRealizada(u);
  const est = estadoGG(s);
  const id = `mgg-historial-${e.fila.sitio}`;
  return (
    <Fragment>
      <tr className={`mgg-fila--${est.color}`}>
        <th scope="row" className="mgg-col-equipo"><NombreEquipo nombre={e.fila.nombre} sitio={e.fila.sitio} /></th>
        <td>
          {u ? <><span className="mgg-nowrap">{cuando(u)}</span><span className="mgg-sub">{[u.reporta, u.turno].filter(Boolean).join(' · ')}</span></> : <span className="mgg-sub">Sin reportes en 30 días</span>}
        </td>
        <td className="mgg-num">{noRealizada ? <span className="mgg-valor--proximo">No realizada</span> : u?.horometro != null ? `${fmtHoras(u.horometro)} h` : '—'}</td>
        <td className="mgg-num">{fmtUso(e.ritmo)}</td>
        <td className="mgg-num">{u?.nroPartidas ?? '—'}</td>
        <td><span className="mgg-combustible"><Estanque nivel={u?.combustible ?? null} /><span className={claseCombustible(u?.combustible ?? null)}>{u?.combustible ?? '—'}</span></span></td>
        <td className={claseRefrigerante(u?.nivelRefrigerante ?? null)}>{NOMBRE_REFRIGERANTE[u?.nivelRefrigerante ?? ''] ?? u?.nivelRefrigerante ?? '—'}</td>
        <td className={claseAceite(u?.nivelAceite ?? null)}>{u?.nivelAceite ?? '—'}</td>
        <td className={`mgg-num ${claseTemperatura(u?.temperatura ?? null)}`}>{fmtTemp(u?.temperatura ?? null)}</td>
        <td className="mgg-c-estado"><Estado estado={est.color} texto={est.texto} /><Alertas s={s} /></td>
        <td className="mgg-c-accion">
          <button type="button" className="mgg-icono-boton" aria-expanded={abierta} aria-controls={id} disabled={!s?.serie.length}
            onClick={() => setAbierta(v => !v)} title={abierta ? 'Ocultar los últimos reportes' : 'Ver los últimos reportes'}
            aria-label={`${abierta ? 'Ocultar' : 'Ver'} los últimos reportes de ${e.fila.nombre || e.fila.sitio}`}>
            <History size={16} aria-hidden="true" />
          </button>
        </td>
      </tr>
      {abierta && s && (
        <tr className="mgg-subfila" id={id}>
          <td colSpan={11}><Historial s={s} /></td>
        </tr>
      )}
    </Fragment>
  );
}

function Ficha({ e }: { e: EquipoCalculado }) {
  const s = e.gg;
  const u = s?.ultimo ?? null;
  const noRealizada = !!u && u.fecha === hoyLocalISO() && esNoRealizada(u);
  const est = estadoGG(s);
  return (
    <li className={`mgg-ficha mgg-fila--${est.color}`}>
      <details>
        <summary className="mgg-ficha__resumen">
          <NombreEquipo nombre={e.fila.nombre} sitio={e.fila.sitio} />
          <span className="mgg-ficha__estado"><Estado estado={est.color} texto={est.texto} /><ChevronDown size={16} className="mgg-ficha__flecha" aria-hidden="true" /></span>
          <span className="mgg-ficha__cifras">
            <span>Horómetro <b>{noRealizada ? 'No realizada' : u?.horometro != null ? `${fmtHoras(u.horometro)} h` : '—'}</b></span>
            <span>{u ? cuando(u) : 'Sin reportes'}</span>
          </span>
          {s && s.alertas.length > 0 && <Alertas s={s} />}
        </summary>
        <div className="mgg-ficha__cuerpo">
          <dl className="mgg-datos">
            <Dato etiqueta="Último reporte" valor={u ? cuando(u) : '—'} sub={u ? [u.reporta, u.turno].filter(Boolean).join(' · ') : undefined} />
            <Dato etiqueta="Uso diario" valor={fmtUso(e.ritmo)} sub="según los reportes" />
            <Dato etiqueta="Partidas" valor={u?.nroPartidas ?? '—'} />
            <Dato etiqueta="Combustible" valor={<span className="mgg-combustible"><Estanque nivel={u?.combustible ?? null} />{u?.combustible ?? '—'}</span>} clase={claseCombustible(u?.combustible ?? null)} />
            <Dato etiqueta="Refrigerante" valor={NOMBRE_REFRIGERANTE[u?.nivelRefrigerante ?? ''] ?? u?.nivelRefrigerante ?? '—'} clase={claseRefrigerante(u?.nivelRefrigerante ?? null)} />
            <Dato etiqueta="Aceite" valor={u?.nivelAceite ?? '—'} clase={claseAceite(u?.nivelAceite ?? null)} />
            <Dato etiqueta="Temperatura" valor={fmtTemp(u?.temperatura ?? null)} clase={claseTemperatura(u?.temperatura ?? null)} />
            {u?.observaciones && <Dato etiqueta="Observación" valor={u.observaciones} />}
          </dl>
          {s && s.alertas.length > 0 && (
            <ul className="mgg-lista-alertas">
              {s.alertas.map(a => <li key={a.titulo} className={`mgg-alerta-linea mgg-alerta-linea--${a.severidad}`}><b>{a.titulo}</b> {a.detalle}</li>)}
            </ul>
          )}
          {s && s.serie.length > 0 && (
            <details className="mgg-ficha__historial">
              <summary><History size={14} aria-hidden="true" /> Últimos reportes</summary>
              <ul className="mgg-reportes">
                {[...s.serie].reverse().slice(0, ULTIMOS).map(r => (
                  <li key={r.id}>
                    <span className="mgg-reportes__cuando">{cuando(r)}<small>{r.reporta}</small></span>
                    {esNoRealizada(r)
                      ? <span className="mgg-valor--proximo">No realizada{r.observaciones ? ` · ${r.observaciones}` : ''}</span>
                      : <span className="mgg-reportes__datos">
                          <b>{fmtHoras(r.horometro)} h</b>
                          <span className={claseCombustible(r.combustible)}>{r.combustible ?? '—'}</span>
                          <span className={claseTemperatura(r.temperatura)}>{fmtTemp(r.temperatura)}</span>
                          {/* Los niveles solo cuando no están bien (para no llenar la lista). */}
                          {r.nivelAceite && r.nivelAceite !== 'Optimo' && <span className={claseAceite(r.nivelAceite)}>Aceite {r.nivelAceite.toLowerCase()}</span>}
                          {r.nivelRefrigerante === 'Minimo' && <span className={claseRefrigerante(r.nivelRefrigerante)}>Refrig. mínimo</span>}
                        </span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </details>
    </li>
  );
}

export default function PestanaReportes({ equipos, cargando, error }: Props) {
  if (error) return <p className="mgg-aviso mgg-aviso--error">No se pudieron cargar los reportes de GG. Revisa la conexión y vuelve a entrar.</p>;
  if (cargando) return <p className="mgg-aviso">Cargando los reportes de GG…</p>;
  return (
    <>
      <div className="mgg-planilla">
        <div className="mgg-tabla-envoltura">
          <table className="mgg-tabla mgg-tabla--reportes">
            <thead>
              <tr>
                <th scope="col" className="mgg-col-equipo">Equipo</th>
                <th scope="col">Último reporte</th>
                <th scope="col" className="mgg-num">Horómetro</th>
                <th scope="col" className="mgg-num" title="Horas de uso por día, según los reportes de los últimos 30 días">Uso diario</th>
                <th scope="col" className="mgg-num">Partidas</th>
                <th scope="col">Combustible</th>
                <th scope="col">Refrigerante</th>
                <th scope="col">Aceite</th>
                <th scope="col" className="mgg-num">Temp.</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="sr-only">Últimos reportes</span></th>
              </tr>
            </thead>
            <tbody>
              {equipos.map(e => <FilaPlanilla key={e.fila.sitio} e={e} />)}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mgg-fichas" aria-label="Equipos">
        {equipos.map(e => <Ficha key={e.fila.sitio} e={e} />)}
      </ul>
      <p className="mgg-pie">
        <button type="button" className="mgg-enlace" onClick={() => window.dispatchEvent(new CustomEvent('psinet:ir', { detail: 'reportabilidad-gg' }))}>
          <ExternalLink size={14} aria-hidden="true" /> Abrir la Reportabilidad de GG completa
        </button>
      </p>
    </>
  );
}
