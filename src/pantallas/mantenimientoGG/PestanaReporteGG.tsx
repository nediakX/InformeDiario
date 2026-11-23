// Pestaña "Reporte de GG": el reporte de GG de un día (el último de cada generador ese día) con los datos de
// la Reportabilidad: combustible, refrigerante, aceite, temperatura, horómetro y partidas. El día se elige
// arriba, en la barra de la pestaña (por defecto, el más reciente con reportes).
import { ChevronDown } from 'lucide-react';
import { esNoRealizada } from '../../datos/analisisGG';
import type { ReporteGG } from '../../datos/reportesGG';
import { Dato, Estado, Estanque, NombreEquipo } from './comunes';
import {
  TEXTO_NIVELES, claseAceite, claseCombustible, claseRefrigerante, claseTemperatura, estadoNiveles, fmtHoras, fmtTemp,
  nombreRefrigerante, reporteDelDia, type EquipoCalculado,
} from './formato';

interface Props {
  equipos: EquipoCalculado[];
  /** Día del reporte (AAAA-MM-DD). */
  fecha: string;
  /** Los reportes todavía no llegan. */
  cargando: boolean;
  error: boolean;
}

const quienReporta = (r: ReporteGG) => [r.reporta?.trim(), r.turno?.trim()].filter(Boolean).join(' · ');
const textoEstado = (r: ReporteGG | null) => (r && esNoRealizada(r) ? 'No realizada' : TEXTO_NIVELES[estadoNiveles(r)]);
const fmtHorometro = (r: ReporteGG) => (r.horometro === null ? '—' : `${fmtHoras(r.horometro)} h`);

function Combustible({ r }: { r: ReporteGG }) {
  return <span className="mgg-combustible"><Estanque nivel={r.combustible} /><span className={claseCombustible(r.combustible)}>{r.combustible ?? '—'}</span></span>;
}

function FilaPlanilla({ e, fecha }: { e: EquipoCalculado; fecha: string }) {
  const r = reporteDelDia(e.gg, fecha);
  const estado = estadoNiveles(r);
  const celdaEstado = <td className="mgg-c-estado"><Estado estado={estado} texto={textoEstado(r)} /></td>;
  if (!r) {
    return (
      <tr className={`mgg-fila--${estado}`}>
        <th scope="row" className="mgg-col-equipo"><NombreEquipo nombre={e.fila.nombre} sitio={e.fila.sitio} /></th>
        <td colSpan={7}><span className="mgg-sub">Sin reporte este día</span></td>
        {celdaEstado}
        <td />
      </tr>
    );
  }
  const cuando = <td><span className="mgg-nowrap">{r.hora ?? '—'}</span>{quienReporta(r) && <span className="mgg-sub">{quienReporta(r)}</span>}</td>;
  return (
    <tr className={`mgg-fila--${estado}`}>
      <th scope="row" className="mgg-col-equipo"><NombreEquipo nombre={e.fila.nombre} sitio={e.fila.sitio} /></th>
      {cuando}
      {esNoRealizada(r) ? (
        <td colSpan={6}><span className="mgg-valor--proximo">No realizada</span></td>
      ) : (
        <>
          <td><Combustible r={r} /></td>
          <td className={claseRefrigerante(r.nivelRefrigerante)}>{nombreRefrigerante(r.nivelRefrigerante)}</td>
          <td className={claseAceite(r.nivelAceite)}>{r.nivelAceite ?? '—'}</td>
          <td className={`mgg-num ${claseTemperatura(r.temperatura)}`}>{fmtTemp(r.temperatura)}</td>
          <td className="mgg-num">{fmtHorometro(r)}</td>
          <td className="mgg-num">{r.nroPartidas ?? '—'}</td>
        </>
      )}
      {celdaEstado}
      <td className="mgg-c-obs">{r.observaciones || ''}</td>
    </tr>
  );
}

function Ficha({ e, fecha }: { e: EquipoCalculado; fecha: string }) {
  const r = reporteDelDia(e.gg, fecha);
  const estado = estadoNiveles(r);
  const conDatos = !!r && !esNoRealizada(r);
  return (
    <li className={`mgg-ficha mgg-fila--${estado}`}>
      <details>
        <summary className="mgg-ficha__resumen">
          <NombreEquipo nombre={e.fila.nombre} sitio={e.fila.sitio} />
          <span className="mgg-ficha__estado"><Estado estado={estado} texto={textoEstado(r)} /><ChevronDown size={16} className="mgg-ficha__flecha" aria-hidden="true" /></span>
          <span className="mgg-ficha__reporte">
            {r && conDatos ? (
              <>
                <span className="mgg-combustible">Comb. <Estanque nivel={r.combustible} /><b className={claseCombustible(r.combustible)}>{r.combustible ?? '—'}</b></span>
                <span>Refrig. <b className={claseRefrigerante(r.nivelRefrigerante)}>{nombreRefrigerante(r.nivelRefrigerante)}</b></span>
                <span>Aceite <b className={claseAceite(r.nivelAceite)}>{r.nivelAceite ?? '—'}</b></span>
                <span>Temp. <b className={claseTemperatura(r.temperatura)}>{fmtTemp(r.temperatura)}</b></span>
              </>
            ) : <span>{r ? 'Revisión no realizada' : 'Sin reporte este día'}</span>}
          </span>
        </summary>
        <div className="mgg-ficha__cuerpo">
          {r ? (
            <dl className="mgg-datos">
              <Dato etiqueta="Hora" valor={r.hora ?? '—'} sub={quienReporta(r) || undefined} />
              {conDatos && (
                <>
                  <Dato etiqueta="Horómetro" valor={fmtHorometro(r)} />
                  <Dato etiqueta="Combustible" valor={<Combustible r={r} />} />
                  <Dato etiqueta="Refrigerante" valor={nombreRefrigerante(r.nivelRefrigerante)} clase={claseRefrigerante(r.nivelRefrigerante)} />
                  <Dato etiqueta="Aceite" valor={r.nivelAceite ?? '—'} clase={claseAceite(r.nivelAceite)} />
                  <Dato etiqueta="Temperatura" valor={fmtTemp(r.temperatura)} clase={claseTemperatura(r.temperatura)} />
                  <Dato etiqueta="Partidas" valor={r.nroPartidas ?? '—'} />
                </>
              )}
              {r.observaciones && <Dato etiqueta="Observación" valor={r.observaciones} />}
            </dl>
          ) : <p className="mgg-sub">Este generador no tiene reporte de GG ese día.</p>}
        </div>
      </details>
    </li>
  );
}

export default function PestanaReporteGG({ equipos, fecha, cargando, error }: Props) {
  if (error) return <p className="mgg-aviso mgg-aviso--error">No se pudieron cargar los reportes de GG. Revisa la conexión y vuelve a entrar.</p>;
  if (cargando) return <p className="mgg-aviso">Cargando los reportes de GG…</p>;
  return (
    <>
      <div className="mgg-planilla">
        <div className="mgg-tabla-envoltura">
          <table className="mgg-tabla mgg-tabla--reporte">
            <thead>
              <tr>
                <th scope="col" className="mgg-col-equipo">Equipo</th>
                <th scope="col">Hora · reporta</th>
                <th scope="col">Combustible</th>
                <th scope="col">Refrigerante</th>
                <th scope="col">Aceite</th>
                <th scope="col" className="mgg-num">Temp.</th>
                <th scope="col" className="mgg-num">Horómetro</th>
                <th scope="col" className="mgg-num">Partidas</th>
                <th scope="col">Estado</th>
                <th scope="col">Observación</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map(e => <FilaPlanilla key={e.fila.sitio} e={e} fecha={fecha} />)}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mgg-fichas" aria-label="Equipos">
        {equipos.map(e => <Ficha key={e.fila.sitio} e={e} fecha={fecha} />)}
      </ul>
    </>
  );
}
