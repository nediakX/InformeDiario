import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { saveAs } from 'file-saver';
import { Circle, CircleCheckBig, Loader2, Presentation } from 'lucide-react';
import { esSemillaSinEditar, type BorradorEntry } from '../../datos/borradoresDiario';
import { formatFechaLarga } from '../../datos/fechas';
import type { SemanaTurno } from '../../datos/turnos';
import {
  avisosFds, construirPresentacionFds, datosFdsDesde, nombreArchivoPresentacionFds, rotuloDiaFds, textosFdsDesde,
} from './modeloFds';
import { generarPresentacionFds } from './pptxFds';

interface PresentacionFdsProps {
  semana: SemanaTurno;
  borradores: BorradorEntry[];
}

/** Textos del formulario por clave (ver textosFdsDesde en modeloFds). */
type Textos = Record<string, string>;

const TITULO_CAMPO = 'block text-sm font-bold text-[#0E4660] mb-1';
const AREA = 'w-full p-2 border border-[#DCE1E6] rounded-md text-sm';

function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <section className="panel p-5 space-y-4">
      <div>
        <h2 className="font-display font-bold text-[#0E4660] text-base">{titulo}</h2>
        {ayuda && <p className="text-xs text-gray-500 mt-1">{ayuda}</p>}
      </div>
      {children}
    </section>
  );
}

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

/** Presentación de fin de semana (viernes a domingo de la semana de turno): textos prellenados desde los informes. */
export default function PresentacionFds({ semana, borradores }: PresentacionFdsProps) {
  const prefill = useMemo(() => textosFdsDesde(construirPresentacionFds(borradores, semana)), [borradores, semana]);
  // Lo que la persona cambió, por semana. Lo que no cambió sigue a los informes (si llegan más, se actualiza).
  const [ediciones, setEdiciones] = useState<Record<string, Textos>>({});
  const edicion = ediciones[semana.inicio];
  const valor = (clave: string) => edicion?.[clave] ?? prefill[clave] ?? '';
  const cambiar = (clave: string, texto: string) =>
    setEdiciones(previas => ({ ...previas, [semana.inicio]: { ...previas[semana.inicio], [clave]: texto } }));

  const datos = datosFdsDesde(valor, semana);
  const avisosPrevios = avisosFds(datos);
  const diasFds = semana.dias.slice(2, 5);
  const tieneInforme = (fecha: string) => borradores.some(e => e.fecha === fecha && e.turno === 'dia' && !esSemillaSinEditar(e));
  const hayInformes = diasFds.some(tieneInforme);

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

  // La falta de reportabilidad GG ya aparece arriba, antes de generar: no se repite después.
  const avisosGenerados = avisos.filter(a => !a.startsWith('Falta la reportabilidad GG') && !avisosPrevios.includes(a));

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <div className="space-y-2">
          {diasFds.map(fecha => {
            const informe = tieneInforme(fecha);
            return (
              <div key={fecha} className={`flex flex-wrap items-center gap-x-4 gap-y-1 p-3 rounded-md border ${informe ? 'border-[#0E4660] bg-[#E8F1FB]' : 'border-[#DCE1E6] bg-white'}`}>
                {informe ? <CircleCheckBig size={18} className="text-[#0E4660] flex-shrink-0" /> : <Circle size={18} className="text-gray-300 flex-shrink-0" />}
                <span className="text-sm font-bold text-[#0E4660] min-w-[150px]">{formatFechaLarga(fecha)}</span>
                <span className="text-xs text-gray-600">
                  {informe ? 'Informe de Turno Día cargado: los textos vienen de ahí.' : 'Sin Informe de Turno Día: el día sale sin actividades.'}
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Los textos vienen de los Informes Diarios de la semana y se pueden editar antes de generar. La reportabilidad GG, las horas de mantenimiento y la fecha de corte se ingresan a mano.
        </p>
      </section>

      <Seccion titulo="Resumen general" ayuda="Lámina 3 · Una tarjeta por línea.">
        <Campo id="fds-resumen" valor={valor('resumen')} onChange={t => cambiar('resumen', t)} filas={6} />
      </Seccion>

      <Seccion
        titulo="Actividades destacadas"
        ayuda="Lámina 5 · Una actividad por línea. El responsable va después de « | » (ej: MANTENIMIENTO PREVENTIVO LTE_CMF_02 | TURNO A)."
      >
        {diasFds.map((fecha, k) => (
          <Campo key={fecha} id={`fds-act-${k}`} titulo={rotuloDiaFds(fecha)} valor={valor(`act${k}`)} onChange={t => cambiar(`act${k}`, t)} filas={4} />
        ))}
      </Seccion>

      <Seccion titulo="Reportabilidad GG" ayuda="Lámina 8 · Porcentaje de reportabilidad de generadores por día (ej: 75). Vacío = sin dato.">
        <div className="grid gap-3 sm:grid-cols-3">
          {diasFds.map((fecha, k) => (
            <div key={fecha}>
              <label htmlFor={`fds-gg-${k}`} className={TITULO_CAMPO}>{rotuloDiaFds(fecha)}</label>
              <div className="flex items-center gap-2">
                <input
                  id={`fds-gg-${k}`}
                  type="text"
                  inputMode="decimal"
                  value={valor(`gg${k}`)}
                  onChange={e => cambiar(`gg${k}`, e.target.value)}
                  placeholder="ej: 75"
                  className="w-28 p-2 border border-[#DCE1E6] rounded-md text-sm"
                />
                <span className="text-sm text-gray-600">%</span>
              </div>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion
        titulo="Mantenimiento preventivo"
        ayuda="Lámina 9 · Una fila por sitio. Puedes pegar desde Excel con las columnas separadas por tabulación: Sitio, Nombre, Horas último, Fecha último, Días, Horas registradas. Fechas: 23/09/2026 o 23-sep-26."
      >
        <div>
          <label htmlFor="fds-fecha-corte" className={TITULO_CAMPO}>Fecha de corte de las horas registradas</label>
          <input
            id="fds-fecha-corte"
            type="date"
            value={valor('fechaCorte')}
            onChange={e => cambiar('fechaCorte', e.target.value)}
            className="p-2 border border-[#DCE1E6] rounded-md text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Por defecto, el lunes después del domingo.</p>
        </div>
        <Campo id="fds-om" titulo="Sitios y horas" valor={valor('om')} onChange={t => cambiar('om', t)} filas={14} tabla />
      </Seccion>

      <Seccion titulo="Cascada de actividades principales" ayuda="Lámina 11 · Una actividad por línea, en el orden de la cascada.">
        <Campo id="fds-cascada" valor={valor('cascada')} onChange={t => cambiar('cascada', t)} filas={4} />
      </Seccion>

      <Seccion titulo="Difusiones y seguridad" ayuda="Lámina 13 · Una difusión por línea, por día. Los controles transversales son una lista fija que puedes cambiar.">
        {diasFds.map((fecha, k) => (
          <Campo key={fecha} id={`fds-dif-${k}`} titulo={rotuloDiaFds(fecha)} valor={valor(`dif${k}`)} onChange={t => cambiar(`dif${k}`, t)} filas={4} />
        ))}
        <Campo id="fds-controles" titulo="Controles transversales" valor={valor('controles')} onChange={t => cambiar('controles', t)} filas={4} />
      </Seccion>

      <Seccion titulo="Observaciones y mejoras" ayuda="Lámina 15 · Una observación por línea.">
        <Campo id="fds-observaciones" valor={valor('observaciones')} onChange={t => cambiar('observaciones', t)} filas={5} />
      </Seccion>

      <Seccion titulo="Actividades con CPE" ayuda="Lámina 17 · Una actividad por línea, sin el encabezado.">
        <Campo id="fds-cpe" valor={valor('cpe')} onChange={t => cambiar('cpe', t)} filas={4} />
      </Seccion>

      <Seccion titulo="Conclusiones" ayuda="Lámina 19 · Una conclusión por línea.">
        <Campo id="fds-conclusiones" valor={valor('conclusiones')} onChange={t => cambiar('conclusiones', t)} filas={4} />
      </Seccion>

      <section className="panel p-5">
        {!hayInformes && (
          <p className="text-sm text-gray-500 mb-3">Este fin de semana no tiene Informes Diarios de Turno Día todavía: puedes armar la presentación a mano.</p>
        )}
        {avisosPrevios.length > 0 && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
            <p className="font-bold mb-1">Antes de presentar:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {avisosPrevios.map((aviso, i) => <li key={i}>{aviso}</li>)}
            </ul>
          </div>
        )}
        <button
          type="button"
          onClick={generar}
          disabled={generando}
          className="inline-flex items-center gap-2 bg-[#0E4660] text-white px-4 py-2.5 rounded-md text-sm font-bold disabled:opacity-50"
        >
          {generando ? <Loader2 size={16} className="animate-spin" /> : <Presentation size={16} />}
          {generando ? 'Generando presentación…' : 'Generar presentación de fin de semana (.pptx)'}
        </button>
        <p className="text-xs text-gray-500 mt-2">{formatFechaLarga(datos.inicio)} al {formatFechaLarga(datos.fin)}</p>
        {avisosGenerados.length > 0 && (
          <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 mt-3">
            <p className="font-bold mb-1">Revisa antes de presentar:</p>
            <ul className="list-disc pl-4 space-y-0.5">
              {avisosGenerados.map((aviso, i) => <li key={i}>{aviso}</li>)}
            </ul>
          </div>
        )}
      </section>

      {toast && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toast.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
