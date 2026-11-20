// Registrar un mantenimiento o un cambio de correa recién hecho: horas del horómetro y fecha (con lo que
// marca el último reporte ya escrito). Muestra cómo queda el próximo antes de guardar.
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Cog, Wrench, X } from 'lucide-react';
import { OPCIONES_REFRIGERANTE } from '../../datos/reportesGG';
import { hoyLocalISO, sumarDias } from '../../datos/fechas';
import type { CambiosMantenimientoGG } from '../../datos/mantenimientoGG';
import { HORAS_ENTRE_CAMBIOS_CORREA, HORAS_ENTRE_MANTENIMIENTOS, OPCIONES_STATUS } from '../../datos/indicadoresMantenimientoGG';
import { NOMBRE_REFRIGERANTE, cuandoLectura, fmtFecha, fmtHoras, leerHoras, type EquipoCalculado, type TipoRegistro } from './formato';

interface Props {
  tipo: TipoRegistro;
  equipo: EquipoCalculado;
  /** Base sin el SQL nuevo: no se puede marcar el cambio de correa ni el status. */
  faltaActualizarBD: boolean;
  onCerrar: () => void;
  onGuardar: (cambios: CambiosMantenimientoGG) => void;
}

const CAMPO = 'mgg-campo mgg-campo--grande';

export default function DialogoRegistro({ tipo, equipo, faltaActualizarBD, onCerrar, onGuardar }: Props) {
  const f = equipo.fila;
  const hoy = hoyLocalISO();
  const esMtto = tipo === 'mantenimiento';
  const idTitulo = useId();
  const primerCampo = useRef<HTMLInputElement>(null);
  const [horas, setHoras] = useState(equipo.actuales ? fmtHoras(equipo.actuales.valor) : '');
  const [fecha, setFecha] = useState(hoy);
  const [status, setStatus] = useState(100);
  const [refrigerante, setRefrigerante] = useState(f.refrigerante ?? '');
  const [conCorrea, setConCorrea] = useState(false);
  const [intento, setIntento] = useState(false);

  // Al abrir: el foco en las horas (seleccionadas, para escribir encima). Esc cierra.
  const cerrarRef = useRef(onCerrar);
  useEffect(() => { cerrarRef.current = onCerrar; });
  useEffect(() => {
    primerCampo.current?.focus();
    primerCampo.current?.select();
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  const valor = leerHoras(horas);
  const horasOk = valor !== null && !Number.isNaN(valor);
  const fechaOk = /^(19|20)\d\d-\d\d-\d\d$/.test(fecha) && fecha <= hoy;
  const anterior = esMtto ? f.ultimoHoras : f.correaHoras;
  const menorQueAnterior = horasOk && anterior !== null && valor! < anterior;
  const correa = equipo.correa;

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setIntento(true);
    if (!horasOk || !fechaOk) return;
    const h = valor!;
    const cambios: CambiosMantenimientoGG = esMtto
      ? { ultimoHoras: h, ultimoFecha: fecha, refrigerante: refrigerante || null, ...(faltaActualizarBD ? {} : { statusPct: status }), ...(conCorrea && !faltaActualizarBD ? { correaHoras: h, correaFecha: fecha } : {}) }
      : { correaHoras: h, correaFecha: fecha };
    // La lectura del horómetro al hacer el trabajo pasa a ser la más nueva (si no es menor que la que ya hay).
    if (!equipo.actuales || h >= equipo.actuales.valor) Object.assign(cambios, { horasRegistradas: h, horasRegistradasEn: new Date().toISOString() });
    onGuardar(cambios);
  };

  const proximo = horasOk ? valor! + (esMtto ? HORAS_ENTRE_MANTENIMIENTOS : HORAS_ENTRE_CAMBIOS_CORREA) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={onCerrar}>
      <form role="dialog" aria-modal="true" aria-labelledby={idTitulo} onSubmit={guardar} noValidate
        className="modal-anim mgg-dialogo w-full max-w-md bg-white rounded-xl shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mgg-dialogo__cabecera">
          <span className="mgg-dialogo__icono" aria-hidden="true">{esMtto ? <Wrench size={18} /> : <Cog size={18} />}</span>
          <div className="min-w-0">
            <h2 id={idTitulo} className="mgg-dialogo__titulo">{esMtto ? 'Registrar mantenimiento' : 'Registrar cambio de correa'}</h2>
            <p className="mgg-dialogo__equipo">{f.nombre || f.sitio} · {f.sitio}</p>
          </div>
          <button type="button" className="mgg-icono-boton" onClick={onCerrar} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="mgg-dialogo__cuerpo">
          <label className="mgg-dialogo__campo">
            <span>Horas del horómetro</span>
            <input ref={primerCampo} type="text" inputMode="decimal" autoComplete="off" className={`${CAMPO} mgg-campo--num`}
              value={horas} onChange={e => setHoras(e.target.value)} aria-invalid={intento && !horasOk ? true : undefined} />
            <small>
              {!equipo.actuales ? 'Sin lectura reciente del horómetro.'
                : `${equipo.actuales.fuente === 'reporte' ? 'Último reporte' : 'Última lectura escrita'}${cuandoLectura(equipo.actuales) ? ` (${cuandoLectura(equipo.actuales)})` : ''}: ${fmtHoras(equipo.actuales.valor)} h`}
            </small>
            {intento && !horasOk && <small className="mgg-valor--vencido">Escribe las horas que marca el horómetro.</small>}
            {menorQueAnterior && <small className="mgg-valor--proximo">Es menor que el {esMtto ? 'último mantenimiento' : 'último cambio'} ({fmtHoras(anterior)} h). Revisa el número.</small>}
          </label>

          <label className="mgg-dialogo__campo">
            <span>{esMtto ? 'Fecha del mantenimiento' : 'Fecha del cambio'}</span>
            <input type="date" className={CAMPO} value={fecha} max={hoy} onChange={e => setFecha(e.target.value)} aria-invalid={intento && !fechaOk ? true : undefined} />
            {intento && !fechaOk && <small className="mgg-valor--vencido">Elige una fecha de hoy o anterior.</small>}
          </label>

          {esMtto && (
            <div className="mgg-dialogo__fila">
              <label className="mgg-dialogo__campo">
                <span>Status</span>
                <select className={CAMPO} value={status} onChange={e => setStatus(Number(e.target.value))} disabled={faltaActualizarBD}
                  title={faltaActualizarBD ? 'Falta actualizar la base de datos para guardar el status' : undefined}>
                  {OPCIONES_STATUS.map(p => <option key={p} value={p}>{p} %</option>)}
                </select>
              </label>
              <label className="mgg-dialogo__campo">
                <span>Refrigerante</span>
                <select className={CAMPO} value={refrigerante} onChange={e => setRefrigerante(e.target.value)}>
                  <option value="">—</option>
                  {OPCIONES_REFRIGERANTE.map(o => <option key={o} value={o}>{NOMBRE_REFRIGERANTE[o] ?? o}</option>)}
                </select>
              </label>
            </div>
          )}

          {esMtto && !faltaActualizarBD && (
            <label className="mgg-dialogo__check">
              <input type="checkbox" checked={conCorrea} onChange={e => setConCorrea(e.target.checked)} />
              <span>
                También se cambió la correa
                {correa.desdeUltimo !== null && (
                  <small className={correa.estado === 'vencido' ? 'mgg-valor--vencido' : correa.estado === 'proximo' ? 'mgg-valor--proximo' : ''}>
                    La correa lleva {fmtHoras(correa.desdeUltimo)} h (se cambia cada {fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)} h).
                  </small>
                )}
              </span>
            </label>
          )}

          <p className="mgg-dialogo__resultado" aria-live="polite">
            {proximo === null ? 'Escribe las horas para ver cómo queda.' : esMtto
              ? <>Próximo mantenimiento a las <b>{fmtHoras(proximo)} h</b>{fechaOk && <> o el <b>{fmtFecha(sumarDias(fecha, f.cicloDias))}</b> (cada {f.cicloDias} días), lo que ocurra primero</>}.{conCorrea && <> Próximo cambio de correa a las <b>{fmtHoras(valor! + HORAS_ENTRE_CAMBIOS_CORREA)} h</b>.</>}</>
              : <>Próximo cambio de correa a las <b>{fmtHoras(proximo)} h</b>.</>}
          </p>
        </div>

        <div className="mgg-dialogo__acciones">
          <button type="button" className="mgg-boton" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="mgg-boton mgg-boton--principal">Guardar</button>
        </div>
      </form>
    </div>
  );
}
