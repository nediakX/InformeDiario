// Pestaña "Mantenimiento": la planilla del Excel con todos sus indicadores, editable celda por celda.
// En pantallas angostas cada equipo es una ficha que se abre con un toque. Con "Ver el último reporte de GG"
// se agregan los datos de la Reportabilidad de cada generador (combustible, refrigerante, aceite, temperatura y partidas).
import { useState } from 'react';
import { ChevronDown, Pencil, Wrench } from 'lucide-react';
import { OPCIONES_REFRIGERANTE } from '../../datos/reportesGG';
import { CICLOS_DIAS, HORAS_ENTRE_MANTENIMIENTOS, OPCIONES_STATUS, type IndicadoresMantenimiento } from '../../datos/indicadoresMantenimientoGG';
import { BarraUso, CampoFecha, CampoHoras, Dato, Estado, Estanque, IconoGuardado, NombreEquipo } from './comunes';
import {
  NOMBRE_REFRIGERANTE, claseAceite, claseCombustible, claseRefrigerante, claseTemperatura, claseValor, cuandoLectura, detalleLectura,
  fmtDia, fmtFecha, fmtHoras, fmtHorasConSigno, fmtTemp, nombreRefrigerante, textoDias, textoLectura, textoLecturaCorta, ultimoReporteConDatos,
  type AccionesEquipo, type EquipoCalculado, type EstadoGuardado,
} from './formato';

interface Props {
  equipos: EquipoCalculado[];
  guardados: Record<string, EstadoGuardado>;
  acciones: AccionesEquipo;
  /** Base sin el SQL nuevo: el status no se puede guardar. */
  faltaActualizarBD: boolean;
  /** Agrega los datos del último reporte de GG de cada generador. */
  conReportes: boolean;
  /** Los reportes de GG todavía no llegan. */
  cargandoReportes: boolean;
}

/** Columnas del último reporte de GG (cuando se pide verlo). */
const COLUMNAS_REPORTE = 6;

/** Celdas con el último reporte de GG del generador que trae mediciones. */
function CeldasReporte({ e, cargando }: { e: EquipoCalculado; cargando: boolean }) {
  const r = ultimoReporteConDatos(e.gg);
  if (!r) {
    return <td colSpan={COLUMNAS_REPORTE} className="mgg-c-sin-reporte"><span className="mgg-sub">{cargando ? 'Cargando los reportes de GG…' : 'Sin reportes en los últimos 30 días'}</span></td>;
  }
  return (
    <>
      <td className="mgg-c-reporte mgg-grupo-inicio"><span className="mgg-nowrap">{cuandoLectura(r)}</span>{r.reporta && <span className="mgg-sub">{r.reporta}</span>}</td>
      <td><span className="mgg-combustible"><Estanque nivel={r.combustible} /><span className={claseCombustible(r.combustible)}>{r.combustible ?? '—'}</span></span></td>
      <td className={claseRefrigerante(r.nivelRefrigerante)}>{nombreRefrigerante(r.nivelRefrigerante)}</td>
      <td className={claseAceite(r.nivelAceite)}>{r.nivelAceite ?? '—'}</td>
      <td className={`mgg-num ${claseTemperatura(r.temperatura)}`}>{fmtTemp(r.temperatura)}</td>
      <td className="mgg-num">{r.nroPartidas ?? '—'}</td>
    </>
  );
}

/** Por qué está vencido o próximo (o, si está al día, cuándo llega por horas). */
function motivo(m: IndicadoresMantenimiento): string {
  if (m.estado === 'sin_datos') return 'Faltan datos';
  const porHoras = m.estadoHoras === m.estado;
  const porFecha = m.estadoFecha === m.estado;
  if (m.estado === 'vencido') {
    if (porHoras && porFecha) return 'Horas y fecha';
    if (porHoras) return m.faltanHoras ? `Excedido ${fmtHoras(-m.faltanHoras)} h` : `Cumplió ${HORAS_ENTRE_MANTENIMIENTOS} h`;
    return 'Por fecha';
  }
  if (m.estado === 'proximo') return porHoras ? `Faltan ${fmtHoras(m.faltanHoras)} h` : `Fecha ${textoDias(m.diasParaFecha)}`;
  // Al día: cuándo se llegaría a las 250 h al ritmo de uso, si es antes que la fecha.
  return m.fechaPorHoras && (!m.fechaEstimada || m.fechaPorHoras < m.fechaEstimada) ? `≈ ${fmtDia(m.fechaPorHoras)}` : '';
}

const textoUso = (m: IndicadoresMantenimiento) =>
  m.desdeUltimo === null ? 'Sin datos de horas' : `${fmtHoras(m.desdeUltimo)} de ${HORAS_ENTRE_MANTENIMIENTOS} h desde el último mantenimiento`;

function SelectStatus({ e, acciones, deshabilitado }: { e: EquipoCalculado; acciones: AccionesEquipo; deshabilitado: boolean }) {
  const f = e.fila;
  const opciones: number[] = OPCIONES_STATUS.includes(f.statusPct as typeof OPCIONES_STATUS[number]) ? [...OPCIONES_STATUS] : [f.statusPct, ...OPCIONES_STATUS];
  return (
    <select className="mgg-campo" value={f.statusPct} disabled={deshabilitado}
      aria-label={`${f.nombre || f.sitio}: status del último mantenimiento`}
      title={deshabilitado ? 'Falta actualizar la base de datos para guardar el status' : 'STATUS MMTTO: cuánto se completó del último mantenimiento'}
      onChange={ev => acciones.guardar(f.sitio, { statusPct: Number(ev.target.value) })}>
      {opciones.map(p => <option key={p} value={p}>{p} %</option>)}
    </select>
  );
}

function SelectCiclo({ e, acciones, corto }: { e: EquipoCalculado; acciones: AccionesEquipo; corto?: boolean }) {
  const f = e.fila;
  return (
    <select className="mgg-campo" value={f.cicloDias} aria-label={`${f.nombre || f.sitio}: días entre mantenimientos`}
      onChange={ev => acciones.guardar(f.sitio, { cicloDias: Number(ev.target.value) })}>
      {CICLOS_DIAS.map(d => <option key={d} value={d}>{d} {corto ? 'd' : 'días'}</option>)}
    </select>
  );
}

function SelectRefrigerante({ e, acciones }: { e: EquipoCalculado; acciones: AccionesEquipo }) {
  const f = e.fila;
  return (
    <select className="mgg-campo" value={f.refrigerante ?? ''} aria-label={`${f.nombre || f.sitio}: nivel de refrigerante`}
      onChange={ev => acciones.guardar(f.sitio, { refrigerante: ev.target.value || null })}>
      <option value="">—</option>
      {OPCIONES_REFRIGERANTE.map(o => <option key={o} value={o}>{NOMBRE_REFRIGERANTE[o] ?? o}</option>)}
    </select>
  );
}

const campoUltimasHoras = (e: EquipoCalculado, acciones: AccionesEquipo) => (
  <CampoHoras valor={e.fila.ultimoHoras} etiqueta={`${e.fila.nombre || e.fila.sitio}: horas del último mantenimiento`}
    onGuardar={v => acciones.guardar(e.fila.sitio, { ultimoHoras: v })} />
);
const campoFecha = (e: EquipoCalculado, acciones: AccionesEquipo) => (
  <CampoFecha valor={e.fila.ultimoFecha} etiqueta={`${e.fila.nombre || e.fila.sitio}: fecha del último mantenimiento`}
    onGuardar={v => acciones.guardar(e.fila.sitio, { ultimoFecha: v })} />
);
/** Escribir las horas actuales deja esa lectura como la más nueva (hasta que llegue otro reporte). */
const campoHorasActuales = (e: EquipoCalculado, acciones: AccionesEquipo) => (
  <CampoHoras valor={e.actuales?.valor ?? null} etiqueta={`${e.fila.nombre || e.fila.sitio}: horas actuales del horómetro`}
    onGuardar={v => acciones.guardar(e.fila.sitio, { horasRegistradas: v, horasRegistradasEn: new Date().toISOString() })} />
);

interface PropsEquipo {
  e: EquipoCalculado; guardado?: EstadoGuardado; acciones: AccionesEquipo; faltaActualizarBD: boolean; conReportes: boolean; cargandoReportes: boolean;
}

function FilaPlanilla({ e, guardado, acciones, faltaActualizarBD, conReportes, cargandoReportes }: PropsEquipo) {
  const { fila: f, mtto: m } = e;
  const nombre = f.nombre || f.sitio;
  return (
    <tr className={`mgg-fila--${m.estado}`}>
      <th scope="row" className="mgg-col-equipo"><NombreEquipo nombre={f.nombre} sitio={f.sitio} guardado={guardado} /></th>
      <td className="mgg-c-horas">{campoUltimasHoras(e, acciones)}</td>
      <td className="mgg-c-fecha">{campoFecha(e, acciones)}</td>
      <td className="mgg-c-status"><SelectStatus e={e} acciones={acciones} deshabilitado={faltaActualizarBD} /></td>
      <td className="mgg-c-horas">
        {campoHorasActuales(e, acciones)}
        <span className="mgg-fuente" title={detalleLectura(e.actuales)}>{textoLecturaCorta(e.actuales)}</span>
      </td>
      <td className="mgg-num mgg-c-desde">
        <span className={claseValor(m.estadoHoras)}>{fmtHoras(m.desdeUltimo)}</span>
        <BarraUso usadas={m.desdeUltimo} total={HORAS_ENTRE_MANTENIMIENTOS} estado={m.estadoHoras} etiqueta={textoUso(m)} />
      </td>
      <td className="mgg-num">{fmtHoras(m.proximoHoras)}</td>
      <td className="mgg-num"><span className={`mgg-fuerte ${claseValor(m.estadoHoras)}`}>{fmtHorasConSigno(m.faltanHoras)}</span></td>
      <td className="mgg-c-ciclo"><SelectCiclo e={e} acciones={acciones} corto /></td>
      <td className="mgg-c-fechacalc">
        <span className={claseValor(m.estadoFecha)}>{fmtFecha(m.fechaEstimada)}</span>
        <span className="mgg-sub">{textoDias(m.diasParaFecha)}</span>
      </td>
      <td className="mgg-c-fechacalc">
        <span className={m.diasParaAnual !== null && m.diasParaAnual < 0 ? 'mgg-valor--vencido' : ''}>{fmtFecha(m.fechaAnual)}</span>
      </td>
      <td className="mgg-c-refri"><SelectRefrigerante e={e} acciones={acciones} /></td>
      <td className="mgg-c-estado" title={m.fechaPorHoras && m.estado === 'al_dia' ? `Al ritmo de uso de los reportes (${fmtHoras(e.ritmo)} h por día) llega a las ${fmtHoras(m.proximoHoras)} h cerca del ${fmtFecha(m.fechaPorHoras)}` : undefined}>
        <Estado estado={m.estado} />
        <span className="mgg-sub">{motivo(m)}</span>
      </td>
      <td className="mgg-c-accion">
        <button type="button" className="mgg-icono-boton" onClick={() => acciones.registrar('mantenimiento', f.sitio)}
          title="Registrar mantenimiento realizado" aria-label={`Registrar mantenimiento realizado de ${nombre}`}>
          <Wrench size={16} aria-hidden="true" />
        </button>
      </td>
      {conReportes && <CeldasReporte e={e} cargando={cargandoReportes} />}
    </tr>
  );
}

function Ficha({ e, guardado, acciones, faltaActualizarBD, conReportes, cargandoReportes }: PropsEquipo) {
  const [editar, setEditar] = useState(false);
  const { fila: f, mtto: m, actuales } = e;
  const excedido = m.faltanHoras !== null && m.faltanHoras < 0;
  const r = conReportes ? ultimoReporteConDatos(e.gg) : null;
  return (
    <li className={`mgg-ficha mgg-fila--${m.estado}`}>
      <details>
        <summary className="mgg-ficha__resumen">
          <NombreEquipo nombre={f.nombre} sitio={f.sitio} guardado={guardado} />
          <span className="mgg-ficha__estado"><Estado estado={m.estado} /><ChevronDown size={16} className="mgg-ficha__flecha" aria-hidden="true" /></span>
          <span className="mgg-ficha__cifras">
            <span>{excedido ? 'Excedido' : 'Faltan'} <b className={claseValor(m.estadoHoras)}>{m.faltanHoras === null ? '—' : `${fmtHoras(Math.abs(m.faltanHoras))} h`}</b></span>
            <span>Fecha <b className={claseValor(m.estadoFecha)}>{fmtFecha(m.fechaEstimada)}</b></span>
          </span>
          <BarraUso usadas={m.desdeUltimo} total={HORAS_ENTRE_MANTENIMIENTOS} estado={m.estadoHoras} etiqueta={textoUso(m)} />
          {conReportes && (
            <span className="mgg-ficha__reporte">
              {r ? (
                <>
                  <span className="mgg-combustible">Comb. <Estanque nivel={r.combustible} /><b className={claseCombustible(r.combustible)}>{r.combustible ?? '—'}</b></span>
                  <span>Refrig. <b className={claseRefrigerante(r.nivelRefrigerante)}>{nombreRefrigerante(r.nivelRefrigerante)}</b></span>
                  <span>Aceite <b className={claseAceite(r.nivelAceite)}>{r.nivelAceite ?? '—'}</b></span>
                  <span>Temp. <b className={claseTemperatura(r.temperatura)}>{fmtTemp(r.temperatura)}</b></span>
                </>
              ) : <span>{cargandoReportes ? 'Cargando los reportes de GG…' : 'Sin reportes de GG en los últimos 30 días'}</span>}
            </span>
          )}
        </summary>
        <div className="mgg-ficha__cuerpo">
          <dl className="mgg-datos">
            <Dato etiqueta="Último mantenimiento" valor={`${fmtHoras(f.ultimoHoras)} h`} sub={fmtFecha(f.ultimoFecha)} />
            <Dato etiqueta="Próximo mantenimiento" valor={`${fmtHoras(m.proximoHoras)} h`} sub={m.fechaPorHoras ? `≈ ${fmtDia(m.fechaPorHoras)} al ritmo actual` : undefined} />
            <Dato etiqueta="Horas actuales" valor={`${fmtHoras(actuales?.valor)} h`} sub={textoLectura(actuales)} />
            <Dato etiqueta="Desde el último" valor={`${fmtHoras(m.desdeUltimo)} h`} clase={claseValor(m.estadoHoras)} sub={`de ${HORAS_ENTRE_MANTENIMIENTOS} h`} />
            <Dato etiqueta="Próximo por fecha" valor={fmtFecha(m.fechaEstimada)} clase={claseValor(m.estadoFecha)} sub={[textoDias(m.diasParaFecha), `cada ${f.cicloDias} días`].filter(Boolean).join(' · ')} />
            <Dato etiqueta="Fecha anual" valor={fmtFecha(m.fechaAnual)} clase={m.diasParaAnual !== null && m.diasParaAnual < 0 ? 'mgg-valor--vencido' : ''} sub={textoDias(m.diasParaAnual)} />
            <Dato etiqueta="Status" valor={`${f.statusPct} %`} />
            <Dato etiqueta="Refrigerante" valor={NOMBRE_REFRIGERANTE[f.refrigerante ?? ''] ?? '—'} />
          </dl>
          {conReportes && r && (
            <div className="mgg-ficha__seccion">
              <h3>Último reporte de GG</h3>
              <dl className="mgg-datos">
                <Dato etiqueta="Reporte" valor={cuandoLectura(r) || '—'} sub={[r.reporta, r.turno].filter(Boolean).join(' · ') || undefined} />
                <Dato etiqueta="Combustible" valor={<span className="mgg-combustible"><Estanque nivel={r.combustible} />{r.combustible ?? '—'}</span>} clase={claseCombustible(r.combustible)} />
                <Dato etiqueta="Refrigerante" valor={nombreRefrigerante(r.nivelRefrigerante)} clase={claseRefrigerante(r.nivelRefrigerante)} />
                <Dato etiqueta="Aceite" valor={r.nivelAceite ?? '—'} clase={claseAceite(r.nivelAceite)} />
                <Dato etiqueta="Temperatura" valor={fmtTemp(r.temperatura)} clase={claseTemperatura(r.temperatura)} />
                <Dato etiqueta="Partidas" valor={r.nroPartidas ?? '—'} />
                <Dato etiqueta="Horómetro" valor={r.horometro === null ? '—' : `${fmtHoras(r.horometro)} h`} />
                {r.observaciones && <Dato etiqueta="Observación" valor={r.observaciones} />}
              </dl>
            </div>
          )}
          <div className="mgg-ficha__acciones">
            <button type="button" className="mgg-boton mgg-boton--principal" onClick={() => acciones.registrar('mantenimiento', f.sitio)}>
              <Wrench size={15} aria-hidden="true" /> Registrar mantenimiento
            </button>
            <button type="button" className="mgg-boton" aria-expanded={editar} onClick={() => setEditar(v => !v)}>
              <Pencil size={14} aria-hidden="true" /> {editar ? 'Listo' : 'Editar datos'}
            </button>
          </div>
          {editar && (
            <div className="mgg-editar">
              <label><span>Horas del último</span>{campoUltimasHoras(e, acciones)}</label>
              <label><span>Fecha del último</span>{campoFecha(e, acciones)}</label>
              <label><span>Horas actuales</span>{campoHorasActuales(e, acciones)}</label>
              <label><span>Status</span><SelectStatus e={e} acciones={acciones} deshabilitado={faltaActualizarBD} /></label>
              <label><span>Cada</span><SelectCiclo e={e} acciones={acciones} /></label>
              <label><span>Refrigerante</span><SelectRefrigerante e={e} acciones={acciones} /></label>
            </div>
          )}
          {guardado && <IconoGuardado estado={guardado} conTexto />}
        </div>
      </details>
    </li>
  );
}

export default function PestanaMantenimiento({ equipos, guardados, acciones, faltaActualizarBD, conReportes, cargandoReportes }: Props) {
  const extra = { faltaActualizarBD, conReportes, cargandoReportes };
  return (
    <>
      <div className={`mgg-planilla mgg-planilla--ancha${conReportes ? ' mgg-planilla--con-reportes' : ''}`}>
        <div className="mgg-tabla-envoltura">
          <table className="mgg-tabla mgg-tabla--mtto">
            <thead>
              <tr className="mgg-tabla__grupos">
                <th rowSpan={2} scope="col" className="mgg-col-equipo">Equipo</th>
                <th colSpan={3} scope="colgroup">Último mantenimiento</th>
                <th colSpan={4} scope="colgroup">Horas · cada {HORAS_ENTRE_MANTENIMIENTOS} h</th>
                <th colSpan={3} scope="colgroup">Fechas</th>
                <th rowSpan={2} scope="col">Refrigerante</th>
                <th rowSpan={2} scope="col">Estado</th>
                <th rowSpan={2} scope="col"><span className="sr-only">Registrar</span></th>
                {conReportes && <th colSpan={COLUMNAS_REPORTE} scope="colgroup" className="mgg-grupo-inicio">Último reporte de GG</th>}
              </tr>
              <tr>
                <th scope="col" className="mgg-num">Horas</th>
                <th scope="col">Fecha</th>
                <th scope="col" title="STATUS MMTTO: cuánto se completó del último mantenimiento">Status</th>
                <th scope="col" className="mgg-num" title="Horas registradas: la lectura más reciente del horómetro (último reporte de GG o la escrita aquí)">Actuales</th>
                <th scope="col" className="mgg-num" title="Horas desde el último mantenimiento = actuales − último">Desde el último</th>
                <th scope="col" className="mgg-num" title={`Próximo mantenimiento (horas) = último + ${HORAS_ENTRE_MANTENIMIENTOS}`}>Próximo</th>
                <th scope="col" className="mgg-num" title="Horas restantes para el próximo mantenimiento = próximo − actuales (negativo: horas pasadas)">Faltan</th>
                <th scope="col" title="Días de mantenimiento">Cada</th>
                <th scope="col" title="Fecha estimada del próximo mantenimiento = fecha del último + días">Próximo</th>
                <th scope="col" title="Fecha de mantenimiento por año = fecha del último + 365 días">Anual</th>
                {conReportes && (
                  <>
                    <th scope="col" className="mgg-grupo-inicio" title="Último reporte de GG con mediciones (los «no realizada» no las traen)">Fecha</th>
                    <th scope="col">Combustible</th>
                    <th scope="col">Refrigerante</th>
                    <th scope="col">Aceite</th>
                    <th scope="col" className="mgg-num">Temp.</th>
                    <th scope="col" className="mgg-num">Partidas</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {equipos.map(e => <FilaPlanilla key={e.fila.sitio} e={e} guardado={guardados[e.fila.sitio]} acciones={acciones} {...extra} />)}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mgg-fichas mgg-fichas--ancha" aria-label="Equipos">
        {equipos.map(e => <Ficha key={e.fila.sitio} e={e} guardado={guardados[e.fila.sitio]} acciones={acciones} {...extra} />)}
      </ul>
    </>
  );
}
