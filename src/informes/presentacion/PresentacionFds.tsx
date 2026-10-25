import { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { Circle, CircleCheckBig, Loader2, Presentation, RefreshCw } from 'lucide-react';
import { esSemillaSinEditar, type BorradorEntry } from '../../datos/borradoresDiario';
import { formatFechaLarga, nombreDiaSemana } from '../../datos/fechas';
import { useSesion } from '../../auth/sesion';
import { getDefaultPersonal, getPersonalGuardado, type PersonalItem } from '../diario/constantes';
import type { SemanaTurno } from '../../datos/turnos';
import {
  avisosFds, carrosReportandoDe, construirPresentacionFds, datosFdsDesde, fdsDeSemana, nombreArchivoPresentacionFds, rotuloDiaFds,
  SITIOS_FDS, textosFdsDesde, type DatosAutoFds,
} from './modeloFds';
import { generarPresentacionFds } from './pptxFds';

interface PresentacionFdsProps {
  semana: SemanaTurno;
  borradores: BorradorEntry[];
  /** Lo que se lee de la base: reportes de GG, horómetros y mantenimientos (ver PresentacionTurno). */
  auto: DatosAutoFds;
  /** Mientras se leen los datos de la base: todavía no se puede generar. */
  cargando: boolean;
  /** Si no se pudieron leer los datos de la base (se muestra con un botón para reintentar). */
  errorDatos: string | null;
  onActualizar: () => void;
}

/** Textos del formulario por clave (ver textosFdsDesde en modeloFds). */
type Textos = Record<string, string>;

const TITULO_CAMPO = 'block text-sm font-bold text-[#0E4660] mb-1';
const TITULO_BLOQUE = 'font-display font-bold text-[#0E4660] text-base';
const AREA = 'w-full p-2 border border-[#DCE1E6] rounded-md text-sm';
const numero = new Intl.NumberFormat('es-CL');
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Lista de personal de la presentación (JSON en el formulario); si no se puede leer, lista vacía. */
const leerPersonal = (texto: string): PersonalItem[] => {
  try {
    const lista: unknown = JSON.parse(texto);
    return Array.isArray(lista)
      ? lista.map((p: { nombre?: unknown; cargo?: unknown }) => ({ nombre: String(p.nombre ?? ''), cargo: String(p.cargo ?? '') }))
      : [];
  } catch {
    return [];
  }
};

function Campo({ id, titulo, valor, onChange, filas = 4, tabla = false }: {
  id: string;
  titulo?: string;
  valor: string;
  onChange: (texto: string) => void;
  filas?: number;
  /** Texto en columnas (pegado desde Excel): sin ajuste de línea para que las columnas se vean alineadas. */
  tabla?: boolean;
}) {
  return (
    <div>
      {titulo && <label htmlFor={id} className={TITULO_CAMPO}>{titulo}</label>}
      <textarea
        id={id}
        aria-label={titulo ?? id}
        value={valor}
        onChange={e => onChange(e.target.value)}
        rows={filas}
        wrap={tabla ? 'off' : undefined}
        className={`${AREA} ${tabla ? 'font-mono text-xs whitespace-pre' : ''}`}
      />
    </div>
  );
}

/** Presentación de fin de semana (viernes a domingo de la semana de turno): casi todo sale solo; se corrige lo que haga falta. */
export default function PresentacionFds({ semana, borradores, auto, cargando, errorDatos, onActualizar }: PresentacionFdsProps) {
  const { division } = useSesion();
  const prefill = useMemo(() => textosFdsDesde(construirPresentacionFds(borradores, semana, auto)), [borradores, semana, auto]);
  // Lo que la persona cambió, por semana. Lo que no cambió sigue a los informes y a la base (si cambian, se actualiza).
  const [ediciones, setEdiciones] = useState<Record<string, Textos>>({});
  const edicion = ediciones[semana.inicio];
  const valor = (clave: string) => edicion?.[clave] ?? prefill[clave] ?? '';
  const cambiar = (clave: string, texto: string) =>
    setEdiciones(previas => ({ ...previas, [semana.inicio]: { ...previas[semana.inicio], [clave]: texto } }));

  const datos = datosFdsDesde(valor, semana);
  const avisosPrevios = avisosFds(datos);
  const diasFds = fdsDeSemana(semana).fechas;
  const tieneInforme = (fecha: string) => borradores.some(e => e.fecha === fecha && e.turno === 'dia' && !esSemillaSinEditar(e));
  const hayInformes = diasFds.some(tieneInforme);
  const sitiosCompletos = datos.om.filter(f => f.horasUltimo !== null && f.fechaUltimo !== null && f.horasRegistradas !== null).length;

  // Checklist de carros por día: arranca con lo que dice la base; lo que se marca o desmarca a mano queda guardado.
  const carrosDe = (k: number) => carrosReportandoDe(valor(`carros${k}`));
  const marcarCarro = (k: number, carro: string, marcado: boolean) => {
    const carros = new Set(carrosDe(k));
    if (marcado) carros.add(carro);
    else carros.delete(carro);
    cambiar(`carros${k}`, [...carros].join(','));
  };
  const volverALaBase = () => setEdiciones(previas => {
    const actual: Textos = { ...previas[semana.inicio] };
    diasFds.forEach((_, k) => { delete actual[`carros${k}`]; });
    return { ...previas, [semana.inicio]: actual };
  });

  // Personal de turno: arranca con la lista guardada del turno (la del Informe Diario). Lo que cambies aquí queda solo en este formulario.
  const [seleccionPersonal, setSeleccionPersonal] = useState('');
  const letraElegida = edicion?.personalLetra;
  const letraPersonal: 'A' | 'B' = letraElegida === 'A' || letraElegida === 'B' ? letraElegida : semana.letra;
  const personal: PersonalItem[] = edicion?.personal !== undefined ? leerPersonal(edicion.personal) : getPersonalGuardado(letraPersonal, division);
  const guardarPersonal = (lista: PersonalItem[], letra: 'A' | 'B' = letraPersonal) =>
    setEdiciones(previas => ({ ...previas, [semana.inicio]: { ...previas[semana.inicio], personal: JSON.stringify(lista), personalLetra: letra } }));
  const cambiarTurnoPersonal = (letra: 'A' | 'B') => guardarPersonal(getPersonalGuardado(letra, division), letra);
  const quitarPersonal = (i: number) => guardarPersonal(personal.filter((_, j) => j !== i));
  const agregarPersonal = () => {
    const [letra = '', indice = ''] = seleccionPersonal.split('-');
    const elegido = getDefaultPersonal(letra, division)[Number(indice)];
    if (elegido && !personal.some(q => q.nombre === elegido.nombre)) guardarPersonal([...personal, elegido]);
    setSeleccionPersonal('');
  };

  const [generando, setGenerando] = useState(false);
  // Avisos de la última presentación generada (lo que no cabe, como tarjetas o tablas con demasiado texto).
  const [avisos, setAvisos] = useState<string[]>([]);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const generar = async () => {
    setGenerando(true);
    try {
      const { blob, avisos: nuevosAvisos } = await generarPresentacionFds(datos);
      saveAs(blob, nombreArchivoPresentacionFds(datos));
      setAvisos(nuevosAvisos);
      setToast({ text: nuevosAvisos.length ? 'Presentación generada, revisa los avisos.' : 'Presentación generada.' });
    } catch (error) {
      console.error(error);
      setAvisos([]);
      setToast({ text: 'No se pudo generar la presentación. Revisa los textos e intenta de nuevo.', isError: true });
    } finally {
      setGenerando(false);
    }
  };

  // Lo que falta antes de generar ya aparece arriba: no se repite después.
  const avisosGenerados = avisos.filter(a => !avisosPrevios.includes(a));
  const ocupado = generando || cargando;

  return (
    <div className="space-y-4">
      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-bold text-[#0E4660] text-lg">Turno {semana.letra} · fin de semana</h2>
            <p className="text-sm text-gray-600">{formatFechaLarga(datos.inicio)} al {formatFechaLarga(datos.fin)}</p>
          </div>
          <button
            type="button"
            onClick={generar}
            disabled={ocupado}
            className="inline-flex items-center gap-2 bg-[#0E4660] text-white px-4 py-2.5 rounded-md text-sm font-bold disabled:opacity-50"
          >
            {ocupado ? <Loader2 size={16} className="animate-spin" /> : <Presentation size={16} />}
            {generando ? 'Generando presentación…' : cargando ? 'Leyendo datos…' : 'Generar presentación (.pptx)'}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {diasFds.map(fecha => {
            const informe = tieneInforme(fecha);
            return (
              <div key={fecha} className={`flex items-center gap-2 p-2.5 rounded-md border ${informe ? 'border-[#0E4660] bg-[#E8F1FB]' : 'border-[#DCE1E6] bg-white'}`}>
                {informe ? <CircleCheckBig size={17} className="text-[#0E4660] flex-shrink-0" /> : <Circle size={17} className="text-gray-300 flex-shrink-0" />}
                <span className="text-sm font-bold text-[#0E4660]">{rotuloDiaFds(fecha)}</span>
                <span className="text-xs text-gray-600">{informe ? 'Informe cargado' : 'Sin informe'}</span>
              </div>
            );
          })}
        </div>
        {!hayInformes && (
          <p className="text-sm text-gray-500">Este fin de semana no tiene Informes Diarios de Turno Día todavía: puedes armar la presentación a mano.</p>
        )}

        {cargando && (
          <p className="text-xs text-[#0E4660] flex items-center gap-2">
            <Loader2 size={14} className="animate-spin" /> Leyendo los reportes de GG y los mantenimientos de la base…
          </p>
        )}
        {errorDatos && (
          <div className="text-xs text-red-900 bg-red-50 border border-red-200 rounded-md p-2 flex flex-wrap items-center gap-2">
            <span>{errorDatos}</span>
            <button type="button" onClick={onActualizar} className="font-bold underline">Reintentar</button>
          </div>
        )}
        {!cargando && avisosPrevios.length > 0 && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
            <p className="font-bold mb-1">Antes de presentar:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {avisosPrevios.map((aviso, i) => <li key={i}>{aviso}</li>)}
            </ul>
          </div>
        )}
        {avisosGenerados.length > 0 && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2">
            <p className="font-bold mb-1">Revisa antes de presentar:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {avisosGenerados.map((aviso, i) => <li key={i}>{aviso}</li>)}
            </ul>
          </div>
        )}
      </section>

      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={TITULO_BLOQUE}>Reportabilidad y fecha de corte</h3>
          <button
            type="button"
            onClick={onActualizar}
            disabled={cargando}
            className="inline-flex items-center gap-1 text-xs font-bold text-[#0E4660] underline disabled:opacity-50"
          >
            <RefreshCw size={13} /> Actualizar desde la base
          </button>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={TITULO_CAMPO}>Carros con reporte de GG</p>
            <button type="button" onClick={volverALaBase} className="text-xs font-bold text-[#0E4660] underline">Volver a lo que dice la base</button>
          </div>
          <p className="text-xs text-gray-500">Viene marcado lo que reportó la base cada día. Marca o desmarca a mano lo que corresponda: el porcentaje es lo marcado sobre 12.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-[#0E4660] border-b border-[#DCE1E6]">
                  <th className="py-2 pr-3 font-bold">Carro</th>
                  {diasFds.map(fecha => (
                    <th key={fecha} className="py-2 px-2 font-bold text-center">{nombreDiaSemana(fecha).slice(0, 3)} {fecha.slice(8, 10)}/{fecha.slice(5, 7)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SITIOS_FDS.map(s => (
                  <tr key={s.carro} className="border-b border-[#eef1f4]">
                    <td className="py-1.5 pr-3">
                      <span className="block font-mono text-xs">{s.carro}</span>
                      <span className="block text-xs text-gray-500">{s.nombre}</span>
                    </td>
                    {diasFds.map((fecha, k) => (
                      <td key={fecha} className="px-2 text-center">
                        <label className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center cursor-pointer">
                          <input
                            type="checkbox"
                            aria-label={`${s.carro} ${rotuloDiaFds(fecha)}`}
                            checked={carrosDe(k).includes(s.carro)}
                            onChange={e => marcarCarro(k, s.carro, e.target.checked)}
                            className="h-5 w-5 accent-[#0E4660]"
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold text-[#0E4660]">
                  <td className="py-2 pr-3">Reportabilidad</td>
                  {diasFds.map((fecha, k) => (
                    <td key={fecha} className="px-2 text-center tabular-nums">
                      {Math.round(datos.reportabilidadGG[k] * 100)} %
                      <span className="block text-xs font-normal text-gray-500">{carrosDe(k).length} de 12</span>
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="max-w-xs pt-2">
            <label htmlFor="fds-fecha-corte" className={TITULO_CAMPO}>Fecha de corte de las horas</label>
            <input
              id="fds-fecha-corte"
              type="date"
              value={valor('fechaCorte')}
              onChange={e => cambiar('fechaCorte', e.target.value)}
              className="p-2 border border-[#DCE1E6] rounded-md text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Por defecto, el lunes después del domingo.</p>
          </div>
        </div>
      </section>

      <section className="panel p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={TITULO_BLOQUE}>Personal de turno</h3>
          <span className="text-xs text-gray-600">{personal.length} personas en el Turno {letraPersonal}</span>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          {(['A', 'B'] as const).map(letra => (
            <label key={letra} className="inline-flex items-center gap-2 min-h-[44px]">
              <input type="radio" name="fds-letra-personal" checked={letraPersonal === letra} onChange={() => cambiarTurnoPersonal(letra)} />
              Turno {letra}
            </label>
          ))}
        </div>
        {personal.length > 0 ? (
          <ul className="divide-y divide-[#eef1f4] text-sm">
            {personal.map((p, i) => (
              <li key={`${p.nombre}-${i}`} className="flex items-center justify-between gap-3 py-1.5">
                <span><span className="font-bold">{p.nombre}</span> <span className="text-gray-600">{p.cargo}</span></span>
                <button type="button" onClick={() => quitarPersonal(i)} className="text-xs font-bold text-red-800 underline">Quitar</button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Sin personal en la lista de este turno.</p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Personal para agregar"
            value={seleccionPersonal}
            onChange={e => setSeleccionPersonal(e.target.value)}
            className="flex-1 min-w-0 max-w-md p-2 border border-[#DCE1E6] rounded-md text-sm"
          >
            <option value="">Elige una persona…</option>
            {(['A', 'B'] as const).map(letra => (
              <optgroup key={letra} label={`Turno ${letra}`}>
                {getDefaultPersonal(letra, division).map((p, i) => (
                  <option key={`${letra}-${i}`} value={`${letra}-${i}`}>{p.nombre} · {p.cargo}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={agregarPersonal}
            disabled={!seleccionPersonal}
            className="px-3 py-2 rounded-md text-sm font-bold text-[#0E4660] border border-[#0E4660] disabled:opacity-40"
          >
            Agregar
          </button>
        </div>
        <p className="text-xs text-gray-500">Solo para este formulario: no cambia la lista del Informe Diario y no sale en el .pptx (no hay lámina de personal).</p>
      </section>


      <section className="panel p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={TITULO_BLOQUE}>Mantenimiento preventivo</h3>
          <span className="text-xs text-gray-600">{sitiosCompletos} de {datos.om.length} sitios completos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[#0E4660] border-b border-[#DCE1E6]">
                <th className="py-2 pr-3 font-bold">Sitio</th>
                <th className="py-2 pr-3 font-bold">Nombre</th>
                <th className="py-2 pr-3 font-bold text-right">Horas último</th>
                <th className="py-2 pr-3 font-bold">Fecha último</th>
                <th className="py-2 pr-3 font-bold text-right">Días</th>
                <th className="py-2 font-bold text-right">Horas registradas</th>
              </tr>
            </thead>
            <tbody>
              {datos.om.map((f, i) => {
                const incompleta = f.horasUltimo === null || f.fechaUltimo === null || f.horasRegistradas === null;
                return (
                  <tr key={`${f.sitio}-${i}`} className={`border-b border-[#eef1f4] ${incompleta ? 'bg-amber-50' : ''}`}>
                    <td className="py-1.5 pr-3 font-mono text-xs">{f.sitio}</td>
                    <td className="py-1.5 pr-3">{f.nombre}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{f.horasUltimo === null ? '—' : numero.format(f.horasUltimo)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{f.fechaUltimo ? dmy(f.fechaUltimo) : '—'}</td>
                    <td className="py-1.5 pr-3 text-right">{f.dias}</td>
                    <td className="py-1.5 text-right tabular-nums">{f.horasRegistradas === null ? '—' : numero.format(f.horasRegistradas)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-bold text-[#0E4660]">Corregir o pegar desde Excel</summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-gray-500">
              Una fila por sitio, con las columnas separadas por tabulación: Sitio, Nombre, Horas último, Fecha último, Días, Horas registradas. Fechas: 23/09/2026 o 23-sep-26.
            </p>
            <Campo id="fds-om" titulo="Sitios y horas" valor={valor('om')} onChange={t => cambiar('om', t)} filas={14} tabla />
          </div>
        </details>
      </section>

      <details className="panel p-5">
        <summary className="cursor-pointer font-display font-bold text-[#0E4660] text-base">Textos de las láminas</summary>
        <p className="text-xs text-gray-500 mt-2 mb-4">
          Vienen solos de los Informes Diarios y de la lista fija de controles. Una línea por ítem. En las actividades, el responsable va después de « | » (ej: MANTENIMIENTO PREVENTIVO LTE_CMF_02 | TURNO A).
        </p>
        <div className="space-y-4">
          <Campo id="fds-resumen" titulo="Resumen general (lámina 3)" valor={valor('resumen')} onChange={t => cambiar('resumen', t)} filas={5} />
          {diasFds.map((fecha, k) => (
            <Campo key={`act-${fecha}`} id={`fds-act-${k}`} titulo={`Actividades de trabajo · ${rotuloDiaFds(fecha)} (lámina 5)`} valor={valor(`act${k}`)} onChange={t => cambiar(`act${k}`, t)} filas={3} />
          ))}
          <Campo id="fds-cascada" titulo="Actividades principales (lámina 11)" valor={valor('cascada')} onChange={t => cambiar('cascada', t)} filas={3} />
          {diasFds.map((fecha, k) => (
            <Campo key={`dif-${fecha}`} id={`fds-dif-${k}`} titulo={`Difusiones · ${rotuloDiaFds(fecha)} (lámina 13, un recuadro por día)`} valor={valor(`dif${k}`)} onChange={t => cambiar(`dif${k}`, t)} filas={3} />
          ))}
          <Campo id="fds-controles" titulo="Controles transversales (lámina 13)" valor={valor('controles')} onChange={t => cambiar('controles', t)} filas={4} />
          <Campo id="fds-observaciones" titulo="Observaciones y mejoras (lámina 15)" valor={valor('observaciones')} onChange={t => cambiar('observaciones', t)} filas={4} />
          <Campo id="fds-cpe" titulo="Actividades con CPE (lámina 17)" valor={valor('cpe')} onChange={t => cambiar('cpe', t)} filas={3} />
          <Campo id="fds-conclusiones" titulo="Conclusiones (lámina 19, una línea por recuadro; la primera es fija)" valor={valor('conclusiones')} onChange={t => cambiar('conclusiones', t)} filas={3} />
        </div>
      </details>

      {toast && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toast.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
