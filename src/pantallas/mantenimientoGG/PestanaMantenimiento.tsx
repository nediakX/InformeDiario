// Pestaña "Mantenimiento": la planilla del Excel con todos sus indicadores, editable celda por celda.
// En pantallas angostas cada equipo es una ficha que se abre con un toque.
import { useState } from 'react';
import { ChevronDown, Pencil, Wrench } from 'lucide-react';
import { OPCIONES_REFRIGERANTE } from '../../datos/reportesGG';
import { HORAS_ENTRE_MANTENIMIENTOS, OPCIONES_STATUS, type IndicadoresMantenimiento } from '../../datos/indicadoresMantenimientoGG';
import { BarraUso, CampoDias, CampoFecha, CampoHoras, Dato, Estado, IconoGuardado, NombreEquipo } from './comunes';
import {
  NOMBRE_REFRIGERANTE, claseValor, detalleLectura, fmtDia, fmtFecha, fmtHoras, fmtHorasConSigno, motivoEstado as motivo, textoDias, textoLectura, textoLecturaCorta,
  type AccionesEquipo, type EquipoCalculado, type EstadoGuardado,
} from './formato';

interface Props {
  equipos: EquipoCalculado[];
  guardados: Record<string, EstadoGuardado>;
  acciones: AccionesEquipo;
  /** Base sin el SQL nuevo: el status no se puede guardar. */
  faltaActualizarBD: boolean;
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

/** Días entre mantenimientos: se escriben o se eligen de la lista (180 / 210). */
function CampoCiclo({ e, acciones, corto }: { e: EquipoCalculado; acciones: AccionesEquipo; corto?: boolean }) {
  const f = e.fila;
  return (
    <CampoDias valor={f.cicloDias} corto={corto} etiqueta={`${f.nombre || f.sitio}: días entre mantenimientos`}
      onGuardar={v => acciones.guardar(f.sitio, { cicloDias: v })} />
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

function FilaPlanilla({ e, guardado, acciones, faltaActualizarBD }: { e: EquipoCalculado; guardado?: EstadoGuardado; acciones: AccionesEquipo; faltaActualizarBD: boolean }) {
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
      <td className="mgg-c-ciclo"><CampoCiclo e={e} acciones={acciones} corto /></td>
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
    </tr>
  );
}

function Ficha({ e, guardado, acciones, faltaActualizarBD }: { e: EquipoCalculado; guardado?: EstadoGuardado; acciones: AccionesEquipo; faltaActualizarBD: boolean }) {
  const [editar, setEditar] = useState(false);
  const { fila: f, mtto: m, actuales } = e;
  const excedido = m.faltanHoras !== null && m.faltanHoras < 0;
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
              <label><span>Cada</span><CampoCiclo e={e} acciones={acciones} /></label>
              <label><span>Refrigerante</span><SelectRefrigerante e={e} acciones={acciones} /></label>
            </div>
          )}
          {guardado && <IconoGuardado estado={guardado} conTexto />}
        </div>
      </details>
    </li>
  );
}

export default function PestanaMantenimiento({ equipos, guardados, acciones, faltaActualizarBD }: Props) {
  return (
    <>
      <div className="mgg-planilla mgg-planilla--ancha">
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
              </tr>
            </thead>
            <tbody>
              {equipos.map(e => <FilaPlanilla key={e.fila.sitio} e={e} guardado={guardados[e.fila.sitio]} acciones={acciones} faltaActualizarBD={faltaActualizarBD} />)}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mgg-fichas mgg-fichas--ancha" aria-label="Equipos">
        {equipos.map(e => <Ficha key={e.fila.sitio} e={e} guardado={guardados[e.fila.sitio]} acciones={acciones} faltaActualizarBD={faltaActualizarBD} />)}
      </ul>
    </>
  );
}
