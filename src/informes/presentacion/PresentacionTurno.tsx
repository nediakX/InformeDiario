import { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheckBig, Circle, Loader2, Presentation } from 'lucide-react';
import logoPsinet from '../../assets/logo_psinet.jpg';
import logoEdificio from '../../assets/LogoEdificio.png';
import { fetchBorradores, subscribeBorradores, type BorradorEntry } from '../../datos/borradoresDiario';
import { formatDiaMes, formatFechaLarga, hoyLocalISO, sumarDias } from '../../datos/fechas';
import { semanaDeFecha } from '../../datos/turnos';
import { useSesion } from '../../auth/sesion';
import { construirPresentacion, nombreArchivoPresentacion } from './modelo';
import { generarPresentacionTurno } from './pptx';

interface PresentacionTurnoProps {
  onBack: () => void;
}

/** Presentación del turno (solo DSAL): arma el .pptx con el formato de las presentaciones de referencia. */
export default function PresentacionTurno({ onBack }: PresentacionTurnoProps) {
  const { division } = useSesion();
  const [borradores, setBorradores] = useState<BorradorEntry[]>([]);
  const [fechaSemana, setFechaSemana] = useState(() => hoyLocalISO());
  // Observaciones de Turno Noche editadas por semana (si no se editan, salen las de los informes).
  const [observacionesEditadas, setObservacionesEditadas] = useState<Record<string, string>>({});
  const [generando, setGenerando] = useState(false);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);

  const semana = useMemo(() => semanaDeFecha(fechaSemana), [fechaSemana]);
  const datos = useMemo(() => construirPresentacion(borradores, semana), [borradores, semana]);
  const textoObservaciones = observacionesEditadas[semana.inicio] ?? datos.observacionesNoche.join('\n');

  useEffect(() => {
    void fetchBorradores(division).then(setBorradores);
    return subscribeBorradores(division, setBorradores);
  }, [division]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const hayInformes = datos.dias.some(d => d.tieneInforme);
  const sinFotoGG = datos.dias.filter(d => d.tieneInforme && !d.fotoGG).length;

  const generar = async () => {
    setGenerando(true);
    try {
      const observaciones = textoObservaciones.split('\n').map(s => s.trim()).filter(Boolean);
      const blob = await generarPresentacionTurno({ ...datos, observacionesNoche: observaciones });
      saveAs(blob, nombreArchivoPresentacion(datos));
      setToast({ text: 'Presentación generada.' });
    } catch (error) {
      console.error(error);
      setToast({ text: 'No se pudo generar la presentación. Revisa la conexión e intenta de nuevo.', isError: true });
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="min-h-screen text-[#222] font-sans pb-24">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Presentación del turno
              </div>
              <div className="site-header__meta text-xs truncate">
                Láminas del turno completo a partir de los Informes Diarios
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-[#0E4660]">
          <ArrowLeft size={16} /> Volver al panel
        </button>

        <section className="panel p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-xs text-[#6B6B6B] font-bold">Semana de turno:</span>
            <div className="inline-flex items-center gap-1 rounded-full border border-[#DCE1E6] bg-white px-1 py-0.5 text-xs text-[#0E4660]">
              <button type="button" aria-label="Semana anterior" onClick={() => setFechaSemana(sumarDias(semana.inicio, -7))} className="p-1 rounded-full hover:bg-[#e3edf3]"><ChevronLeft size={15} /></button>
              <span className="px-1"><strong>Turno {semana.letra}</strong> · {formatDiaMes(semana.inicio)} – {formatDiaMes(semana.fin)}</span>
              <button type="button" aria-label="Semana siguiente" onClick={() => setFechaSemana(sumarDias(semana.inicio, 7))} className="p-1 rounded-full hover:bg-[#e3edf3]"><ChevronRight size={15} /></button>
            </div>
            {semana.inicio !== semanaDeFecha(hoyLocalISO()).inicio && (
              <button type="button" onClick={() => setFechaSemana(hoyLocalISO())} className="text-xs font-bold text-[#0E4660] underline">Volver al turno en curso</button>
            )}
          </div>

          <div className="space-y-2">
            {datos.dias.map(dia => (
              <div key={dia.fecha} className={`flex flex-wrap items-center gap-x-4 gap-y-1 p-3 rounded-md border ${dia.tieneInforme ? 'border-[#0E4660] bg-[#E8F1FB]' : 'border-[#DCE1E6] bg-white'}`}>
                {dia.tieneInforme ? <CircleCheckBig size={18} className="text-[#0E4660] flex-shrink-0" /> : <Circle size={18} className="text-gray-300 flex-shrink-0" />}
                <span className="text-sm font-bold text-[#0E4660] min-w-[150px]">{formatFechaLarga(dia.fecha)}</span>
                {dia.tieneInforme ? (
                  <span className="text-xs text-gray-600">
                    {dia.resumen.length} {dia.resumen.length === 1 ? 'actividad' : 'actividades'} · {dia.difusiones.length} {dia.difusiones.length === 1 ? 'difusión' : 'difusiones'}
                    {dia.fotoGG ? ' · reportabilidad GG con foto' : ' · sin foto de reportabilidad GG'}
                  </span>
                ) : (
                  <span className="text-xs text-gray-500">Sin Informe Diario de Turno Día.</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Se generan: portada, resumen de Turno Día y Turno Noche, reportabilidad GG (foto del registro de cada día) y una lámina de difusiones por día.
            Las actividades de rutina individual (checklist, fatiga, hidratación, protector solar, etc.) no aparecen en el resumen.
          </p>
        </section>

        <section className="panel p-5">
          <label htmlFor="obs-noche" className="block text-sm font-bold text-[#0E4660] mb-1">Observaciones del Turno Noche</label>
          <p className="text-xs text-gray-500 mb-2">Una observación por línea. Vienen de los Informes Diarios de la semana; puedes editarlas antes de generar.</p>
          <textarea
            id="obs-noche"
            value={textoObservaciones}
            onChange={e => setObservacionesEditadas(prev => ({ ...prev, [semana.inicio]: e.target.value }))}
            rows={5}
            className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
          />
        </section>

        <section className="panel p-5">
          {!hayInformes && (
            <p className="text-sm text-gray-500 mb-3">Esta semana de turno no tiene Informes Diarios de Turno Día todavía.</p>
          )}
          {hayInformes && sinFotoGG > 0 && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
              {sinFotoGG === 1 ? 'Un día no tiene' : `${sinFotoGG} días no tienen`} foto del registro de reportabilidad GG; su recuadro quedará marcado como “sin foto” para completarlo a mano.
            </p>
          )}
          <button
            type="button"
            onClick={generar}
            disabled={!hayInformes || generando}
            className="inline-flex items-center gap-2 bg-[#0E4660] text-white px-4 py-2.5 rounded-md text-sm font-bold disabled:opacity-50"
          >
            {generando ? <Loader2 size={16} className="animate-spin" /> : <Presentation size={16} />}
            {generando ? 'Generando presentación…' : 'Generar presentación (.pptx)'}
          </button>
          <p className="text-xs text-gray-500 mt-2">{formatFechaLarga(datos.inicio)} al {formatFechaLarga(datos.fin)}</p>
        </section>
      </main>

      {toast && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toast.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
