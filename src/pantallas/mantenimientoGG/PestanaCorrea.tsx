// Pestaña "Cambio de correa": horas y fecha del último cambio, próximo cambio (cada 1.500 h) y cuánto falta,
// con las mismas horas actuales de la pestaña de mantenimiento.
import { useState } from 'react';
import { ChevronDown, Cog, Pencil } from 'lucide-react';
import { HORAS_ENTRE_CAMBIOS_CORREA, type IndicadoresCorrea } from '../../datos/indicadoresMantenimientoGG';
import { BarraUso, CampoFecha, CampoHoras, Dato, Estado, IconoGuardado, NombreEquipo } from './comunes';
import {
  claseValor, detalleLectura, fmtDia, fmtFecha, fmtHoras, fmtHorasConSigno, textoLectura, textoLecturaCorta,
  type AccionesEquipo, type EquipoCalculado, type EstadoGuardado,
} from './formato';

interface Props {
  equipos: EquipoCalculado[];
  guardados: Record<string, EstadoGuardado>;
  acciones: AccionesEquipo;
  /** Base sin el SQL nuevo: la correa no se puede guardar. */
  faltaActualizarBD: boolean;
}

function motivo(c: IndicadoresCorrea): string {
  if (c.estado === 'sin_datos') return 'Faltan datos';
  if (c.estado === 'vencido') return c.faltanHoras ? `Excedido ${fmtHoras(-c.faltanHoras)} h` : `Cumplió ${fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)} h`;
  if (c.estado === 'proximo') return `Faltan ${fmtHoras(c.faltanHoras)} h`;
  return c.fechaPorHoras ? `≈ ${fmtDia(c.fechaPorHoras)}` : '';
}

const textoUso = (c: IndicadoresCorrea) =>
  c.desdeUltimo === null ? 'Sin datos de horas' : `${fmtHoras(c.desdeUltimo)} de ${fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)} h desde el último cambio`;

const AVISO_BD = 'Falta actualizar la base de datos para guardar la correa';

const campoHoras = (e: EquipoCalculado, acciones: AccionesEquipo, deshabilitado: boolean) => deshabilitado
  ? <input className="mgg-campo mgg-campo--num" value={e.fila.correaHoras === null ? '' : fmtHoras(e.fila.correaHoras)} disabled title={AVISO_BD} aria-label={`${e.fila.nombre || e.fila.sitio}: horas del último cambio de correa`} />
  : <CampoHoras valor={e.fila.correaHoras} etiqueta={`${e.fila.nombre || e.fila.sitio}: horas del último cambio de correa`} onGuardar={v => acciones.guardar(e.fila.sitio, { correaHoras: v })} />;
const campoFecha = (e: EquipoCalculado, acciones: AccionesEquipo, deshabilitado: boolean) => deshabilitado
  ? <input type="date" className="mgg-campo" value={e.fila.correaFecha ?? ''} disabled title={AVISO_BD} aria-label={`${e.fila.nombre || e.fila.sitio}: fecha del último cambio de correa`} />
  : <CampoFecha valor={e.fila.correaFecha} etiqueta={`${e.fila.nombre || e.fila.sitio}: fecha del último cambio de correa`} onGuardar={v => acciones.guardar(e.fila.sitio, { correaFecha: v })} />;

function FilaPlanilla({ e, guardado, acciones, faltaActualizarBD }: { e: EquipoCalculado; guardado?: EstadoGuardado; acciones: AccionesEquipo; faltaActualizarBD: boolean }) {
  const { fila: f, correa: c } = e;
  return (
    <tr className={`mgg-fila--${c.estado}`}>
      <th scope="row" className="mgg-col-equipo"><NombreEquipo nombre={f.nombre} sitio={f.sitio} guardado={guardado} /></th>
      <td className="mgg-c-horas">{campoHoras(e, acciones, faltaActualizarBD)}</td>
      <td className="mgg-c-fecha">{campoFecha(e, acciones, faltaActualizarBD)}</td>
      <td className="mgg-num">
        {fmtHoras(e.actuales?.valor)}
        <span className="mgg-fuente" title={detalleLectura(e.actuales)}>{textoLecturaCorta(e.actuales)}</span>
      </td>
      <td className="mgg-num">
        <span className={claseValor(c.estado)}>{fmtHoras(c.desdeUltimo)}</span>
        <BarraUso usadas={c.desdeUltimo} total={HORAS_ENTRE_CAMBIOS_CORREA} estado={c.estado} etiqueta={textoUso(c)} />
      </td>
      <td className="mgg-num">{fmtHoras(c.proximoHoras)}</td>
      <td className="mgg-num"><span className={`mgg-fuerte ${claseValor(c.estado)}`}>{fmtHorasConSigno(c.faltanHoras)}</span></td>
      <td className="mgg-c-estado" title={c.fechaPorHoras && c.estado === 'al_dia' ? `Al ritmo de uso de los reportes llega a las ${fmtHoras(c.proximoHoras)} h cerca del ${fmtFecha(c.fechaPorHoras)}` : undefined}>
        <Estado estado={c.estado} />
        <span className="mgg-sub">{motivo(c)}</span>
      </td>
      <td className="mgg-c-accion">
        <button type="button" className="mgg-icono-boton" onClick={() => acciones.registrar('correa', f.sitio)} disabled={faltaActualizarBD}
          title={faltaActualizarBD ? AVISO_BD : 'Registrar cambio de correa'} aria-label={`Registrar cambio de correa de ${f.nombre || f.sitio}`}>
          <Cog size={16} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function Ficha({ e, guardado, acciones, faltaActualizarBD }: { e: EquipoCalculado; guardado?: EstadoGuardado; acciones: AccionesEquipo; faltaActualizarBD: boolean }) {
  const [editar, setEditar] = useState(false);
  const { fila: f, correa: c } = e;
  const excedido = c.faltanHoras !== null && c.faltanHoras < 0;
  return (
    <li className={`mgg-ficha mgg-fila--${c.estado}`}>
      <details>
        <summary className="mgg-ficha__resumen">
          <NombreEquipo nombre={f.nombre} sitio={f.sitio} guardado={guardado} />
          <span className="mgg-ficha__estado"><Estado estado={c.estado} /><ChevronDown size={16} className="mgg-ficha__flecha" aria-hidden="true" /></span>
          <span className="mgg-ficha__cifras">
            <span>{excedido ? 'Excedido' : 'Faltan'} <b className={claseValor(c.estado)}>{c.faltanHoras === null ? '—' : `${fmtHoras(Math.abs(c.faltanHoras))} h`}</b></span>
            <span>Próximo <b>{c.proximoHoras === null ? '—' : `${fmtHoras(c.proximoHoras)} h`}</b></span>
          </span>
          <BarraUso usadas={c.desdeUltimo} total={HORAS_ENTRE_CAMBIOS_CORREA} estado={c.estado} etiqueta={textoUso(c)} />
        </summary>
        <div className="mgg-ficha__cuerpo">
          <dl className="mgg-datos">
            <Dato etiqueta="Último cambio" valor={`${fmtHoras(f.correaHoras)} h`} sub={fmtFecha(f.correaFecha)} />
            <Dato etiqueta="Próximo cambio" valor={`${fmtHoras(c.proximoHoras)} h`} sub={c.fechaPorHoras ? `≈ ${fmtDia(c.fechaPorHoras)} al ritmo actual` : undefined} />
            <Dato etiqueta="Horas actuales" valor={`${fmtHoras(e.actuales?.valor)} h`} sub={textoLectura(e.actuales)} />
            <Dato etiqueta="Desde el cambio" valor={`${fmtHoras(c.desdeUltimo)} h`} clase={claseValor(c.estado)} sub={`de ${fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)} h`} />
          </dl>
          <div className="mgg-ficha__acciones">
            <button type="button" className="mgg-boton mgg-boton--principal" disabled={faltaActualizarBD} title={faltaActualizarBD ? AVISO_BD : undefined}
              onClick={() => acciones.registrar('correa', f.sitio)}>
              <Cog size={15} aria-hidden="true" /> Registrar cambio
            </button>
            <button type="button" className="mgg-boton" aria-expanded={editar} onClick={() => setEditar(v => !v)}>
              <Pencil size={14} aria-hidden="true" /> {editar ? 'Listo' : 'Editar datos'}
            </button>
          </div>
          {editar && (
            <div className="mgg-editar">
              <label><span>Horas del último cambio</span>{campoHoras(e, acciones, faltaActualizarBD)}</label>
              <label><span>Fecha del último cambio</span>{campoFecha(e, acciones, faltaActualizarBD)}</label>
            </div>
          )}
          {guardado && <IconoGuardado estado={guardado} conTexto />}
        </div>
      </details>
    </li>
  );
}

export default function PestanaCorrea({ equipos, guardados, acciones, faltaActualizarBD }: Props) {
  return (
    <>
      <div className="mgg-planilla">
        <div className="mgg-tabla-envoltura">
          <table className="mgg-tabla mgg-tabla--correa">
            <thead>
              <tr className="mgg-tabla__grupos">
                <th rowSpan={2} scope="col" className="mgg-col-equipo">Equipo</th>
                <th colSpan={2} scope="colgroup">Último cambio de correa</th>
                <th colSpan={4} scope="colgroup">Horas · cambio cada {fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)} h</th>
                <th rowSpan={2} scope="col">Estado</th>
                <th rowSpan={2} scope="col"><span className="sr-only">Registrar</span></th>
              </tr>
              <tr>
                <th scope="col" className="mgg-num">Horas</th>
                <th scope="col">Fecha</th>
                <th scope="col" className="mgg-num" title="Las mismas horas actuales de la pestaña Mantenimiento">Actuales</th>
                <th scope="col" className="mgg-num" title="Horas desde el último cambio = actuales − horas del último cambio">Desde el cambio</th>
                <th scope="col" className="mgg-num" title={`Próximo cambio de correa (horas) = último + ${HORAS_ENTRE_CAMBIOS_CORREA}`}>Próximo</th>
                <th scope="col" className="mgg-num" title="Horas que faltan para el próximo cambio (negativo: horas pasadas)">Faltan</th>
              </tr>
            </thead>
            <tbody>
              {equipos.map(e => <FilaPlanilla key={e.fila.sitio} e={e} guardado={guardados[e.fila.sitio]} acciones={acciones} faltaActualizarBD={faltaActualizarBD} />)}
            </tbody>
          </table>
        </div>
      </div>
      <ul className="mgg-fichas" aria-label="Equipos">
        {equipos.map(e => <Ficha key={e.fila.sitio} e={e} guardado={guardados[e.fila.sitio]} acciones={acciones} faltaActualizarBD={faltaActualizarBD} />)}
      </ul>
    </>
  );
}
