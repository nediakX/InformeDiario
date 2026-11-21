// Detalle de un carro: cada medición banco por banco (resistencia, voltaje, estado y cambio contra la
// medición anterior), cuándo toca la próxima y la tendencia de cada batería.
import { ArrowLeft, CloudOff, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  contarBaterias, estadoBateria, peorEstado, valorEn, type MedicionBaterias,
} from '../../datos/indicadoresBaterias';
import { Conteos, Estado } from './comunes';
import GraficoTendencia from './GraficoTendencia';
import { fmtCambio, fmtFecha, fmtValor, textoProxima } from './formato';
import type { ResumenCarro } from './resumen';

interface Props {
  resumen: ResumenCarro;
  /** Medición que se muestra (null = la más nueva). */
  elegidaId: string | null;
  hoy: string;
  /** Mediciones que aún no suben a la nube. */
  sinSubir: ReadonlySet<string>;
  puedeEliminar: (m: MedicionBaterias) => boolean;
  onElegir: (id: string) => void;
  onVolver: () => void;
  onNueva: () => void;
  onCorregir: (m: MedicionBaterias) => void;
  onEliminar: (m: MedicionBaterias) => void;
}

const turnoCorto = (t: MedicionBaterias['turno']) => (t ? `Turno ${t.slice(-1)}` : '');

export default function DetalleCarro({ resumen, elegidaId, hoy, sinSubir, puedeEliminar, onElegir, onVolver, onNueva, onCorregir, onEliminar }: Props) {
  const { codigo, sitio, mediciones } = resumen;
  const i = Math.max(0, mediciones.findIndex(m => m.id === elegidaId));
  const m = mediciones[i] ?? null;
  const anterior = mediciones[i + 1] ?? null;
  const conteo = m ? contarBaterias(m.bancos) : null;

  return (
    <section className="bat-detalle" aria-labelledby="bat-detalle-titulo">
      <button type="button" className="bat-enlace bat-detalle__volver" onClick={onVolver}>
        <ArrowLeft size={14} aria-hidden="true" /> Todos los carros
      </button>

      <div className="bat-detalle__cabecera">
        <div className="min-w-0">
          <h2 id="bat-detalle-titulo" className="bat-detalle__titulo">{codigo}</h2>
          {sitio && <p className="bat-detalle__sitio">{sitio}</p>}
        </div>
        <button type="button" className="bat-boton bat-boton--principal" onClick={onNueva}>
          <Plus size={16} aria-hidden="true" /> Nueva medición
        </button>
      </div>

      <p className={`bat-proxima bat-proxima--${resumen.estadoProxima}`}>
        <span>Próxima medición</span>{' '}
        <b>{textoProxima(resumen.proxima, resumen.estadoProxima, hoy)}</b>
        {resumen.proxima && resumen.estadoProxima !== 'al_dia' && <span className="bat-proxima__fecha"> · {fmtFecha(resumen.proxima)}</span>}
      </p>

      {!m || !conteo ? (
        <div className="bat-vacio">
          <p>Este carro todavía no tiene mediciones.</p>
          <button type="button" className="bat-boton" onClick={onNueva}><Plus size={15} aria-hidden="true" /> Registrar la primera</button>
        </div>
      ) : (
        <>
          {mediciones.length > 1 && (
            <div className="bat-mediciones" role="group" aria-label="Mediciones del carro">
              {mediciones.map(x => (
                <button key={x.id} type="button" aria-pressed={x.id === m.id} onClick={() => onElegir(x.id)}>
                  {fmtFecha(x.fecha)}
                  {sinSubir.has(x.id) && <><CloudOff size={12} aria-hidden="true" /><span className="sr-only"> (sin subir)</span></>}
                </button>
              ))}
            </div>
          )}

          <article className="bat-medicion" aria-labelledby="bat-medicion-titulo">
            <header className="bat-medicion__cabecera">
              <div className="min-w-0">
                <h3 id="bat-medicion-titulo" className="bat-medicion__titulo">
                  {i === 0 ? 'Última medición' : 'Medición'} · {fmtFecha(m.fecha)}
                </h3>
                <p className="bat-medicion__meta">
                  {[turnoCorto(m.turno), m.registradoNombre && `Registró ${m.registradoNombre}`, m.actualizadoNombre && `Corrigió ${m.actualizadoNombre}`].filter(Boolean).join(' · ')}
                  {sinSubir.has(m.id) && (
                    <span className="bat-sin-subir"><CloudOff size={12} aria-hidden="true" /> Guardada solo en este equipo: se sube al volver la señal</span>
                  )}
                </p>
              </div>
              <Estado estado={peorEstado(conteo)} />
            </header>

            <Conteos conteo={conteo} />
            {anterior && <p className="bat-medicion__nota">“Cambio”: diferencia de resistencia con la medición del {fmtFecha(anterior.fecha)}.</p>}

            <div className="bat-bancos">
              {m.bancos.map((banco, b) => {
                const conteoBanco = contarBaterias([banco]);
                return (
                  <section key={b} className={`bat-banco bat-banco--${peorEstado(conteoBanco)}`} aria-labelledby={`bat-banco-${b}`}>
                    <h4 id={`bat-banco-${b}`} className="bat-banco__titulo">
                      <span>Banco {b + 1}</span>
                      <Conteos conteo={conteoBanco} soloProblemas />
                    </h4>
                    <table className="bat-tabla-banco">
                      <thead>
                        <tr>
                          <th scope="col"><span className="sr-only">Batería</span></th>
                          <th scope="col" className="bat-num">mΩ</th>
                          <th scope="col" className="bat-num">V</th>
                          <th scope="col">Estado</th>
                          {anterior && <th scope="col" className="bat-num bat-col-cambio" title="Diferencia de resistencia (mΩ) con la medición anterior">Cambio</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {banco.baterias.map((x, j) => {
                          const antes = valorEn(anterior, b, j, 'resistencia');
                          const cambio = x.resistencia !== null && antes !== null ? x.resistencia - antes : null;
                          const textoCambio = cambio === null ? '—' : Math.abs(cambio) < 0.0005 ? '0,00' : fmtCambio(cambio);
                          // Una subida de 1 mΩ o más desde la medición anterior se destaca.
                          const subeMucho = cambio !== null && cambio >= 1;
                          return (
                            <tr key={j} className={`bat-fila--${estadoBateria(x.resistencia)}`}>
                              <th scope="row">B{j + 1}</th>
                              <td className="bat-num">
                                {fmtValor(x.resistencia)}
                                {/* En el celular angosto el cambio va bajo la resistencia (la columna Cambio no cabe). */}
                                {anterior && <small className={`bat-cambio-sub${subeMucho ? ' bat-cambio--alto' : ''}`}><span className="sr-only">cambio </span>{textoCambio}</small>}
                              </td>
                              <td className="bat-num">{fmtValor(x.voltaje)}</td>
                              <td><Estado compacto estado={estadoBateria(x.resistencia)} /></td>
                              {anterior && <td className={`bat-num bat-cambio bat-col-cambio${subeMucho ? ' bat-cambio--alto' : ''}`}>{textoCambio}</td>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>

            {m.observaciones && (
              <p className="bat-medicion__obs"><b>Observaciones:</b> {m.observaciones}</p>
            )}

            <div className="bat-medicion__acciones">
              <button type="button" className="bat-boton" onClick={() => onCorregir(m)}><Pencil size={15} aria-hidden="true" /> Corregir</button>
              {puedeEliminar(m) && (
                <button type="button" className="bat-boton bat-boton--peligro" onClick={() => onEliminar(m)}><Trash2 size={15} aria-hidden="true" /> Eliminar</button>
              )}
            </div>
          </article>

          <section className="bat-tendencia" aria-labelledby="bat-tendencia-titulo">
            <h3 id="bat-tendencia-titulo" className="bat-tendencia__titulo">Tendencia por batería</h3>
            <GraficoTendencia mediciones={mediciones} />
          </section>
        </>
      )}
    </section>
  );
}
