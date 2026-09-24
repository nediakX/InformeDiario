import { useEffect, useState } from 'react';
import { FileText, FileStack, FolderOpen, ArrowRight, CalendarDays, Bell, FilePlus, Sun, Moon } from 'lucide-react';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import {
  type BorradorEntry,
  hoyLocalISO, semanaDeFecha, formatDiaMes, formatFechaLarga, estadoBorrador, contarFotos, DIAS_POR_TURNO,
} from './types';

interface DashboardProps {
  onNavigate: (view: 'borradores' | 'cierre') => void;
  /** Informes de hoy (Día y Noche), guardados o todavía pendientes: la persona elige con cuál trabajar. */
  informesHoy?: BorradorEntry[];
  onAbrirInforme: (entry: BorradorEntry) => void;
  /** Crea un informe nuevo con el turno (Día o Noche) que elija la persona. */
  onNuevoInforme: (turno: 'dia' | 'noche') => void;
  borradorCount: number;
  /** Informes de esta semana de turno (hasta hoy) que siguen en borrador, sin finalizar. */
  pendientesCount?: number;
}

export default function Dashboard({ onNavigate, borradorCount, pendientesCount = 0, informesHoy = [], onAbrirInforme, onNuevoInforme }: DashboardProps) {
  const [modalInformeOpen, setModalInformeOpen] = useState(false);

  // Turno de trabajo (A o B) según el calendario 7x7 y en qué día de su semana va.
  // Día o Noche no se deduce de la hora: cada informe se elige o se crea con su propio turno.
  const hoy = hoyLocalISO();
  const semanaHoy = semanaDeFecha(hoy);
  const diaDelTurno = semanaHoy.dias.indexOf(hoy) + 1;

  useEffect(() => {
    if (!modalInformeOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setModalInformeOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [modalInformeOpen]);

  // "Generar Informe Diario": pregunta con cuál de los informes de hoy (Día o Noche) continuar, o si crear uno nuevo
  // (y en ese caso de qué turno). Nunca se elige el turno por la hora.
  const handleGenerarInforme = () => setModalInformeOpen(true);

  const detalleInforme = (entry: BorradorEntry) => {
    const estado = estadoBorrador(entry);
    const fotos = contarFotos(entry);
    if (estado === 'finalizado') return `Finalizado · ${fotos.llenas} de ${fotos.total} fotos`;
    if (estado === 'iniciado') return `Iniciado · ${fotos.llenas} de ${fotos.total} fotos`;
    return 'Aún sin fotos';
  };

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Panel de Informes
              </div>
              <div className="site-header__meta text-xs truncate">
                DSAL / Reportes de turno
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[1000px] mx-auto p-5 space-y-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-[#0E4660]">¿Qué necesitas hacer hoy?</h1>
          <p className="text-sm text-gray-500 mt-1">Selecciona una opción para continuar.</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#FFF3CD] text-[#856404]">
              <CalendarDays size={14} />
              Hoy: Turno {semanaHoy.letra} · día {diaDelTurno} de {DIAS_POR_TURNO} ({formatDiaMes(semanaHoy.inicio)} – {formatDiaMes(semanaHoy.fin)})
            </span>
            {pendientesCount > 0 && (
              <button
                type="button"
                onClick={() => onNavigate('borradores')}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full bg-white border border-[#DCE1E6] text-gray-500 hover:text-[#0E4660] hover:border-[#0E4660] transition-colors"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-[#F5B300] opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-[#F5B300]" />
                </span>
                <Bell size={12} />
                {pendientesCount} informe{pendientesCount === 1 ? '' : 's'} diario{pendientesCount === 1 ? '' : 's'} en borrador por completar
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <button
            type="button"
            onClick={handleGenerarInforme}
            className="dashboard-card group text-left"
          >
            <div className="dashboard-card__icon bg-[#0E4660]">
              <FileText size={26} color="#fff" strokeWidth={2} />
            </div>
            <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Generar Informe Diario</h2>
            <p className="text-sm text-gray-500 mt-1.5 flex-1">
              Continúa el informe de hoy (Turno Día o Turno Noche) o crea uno nuevo: personal, actividades, evidencia fotográfica y firmas.
            </p>
            <span className="dashboard-card__cta">
              Comenzar <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('borradores')}
            className="dashboard-card group text-left"
          >
            <div className="dashboard-card__icon bg-[#F5B300]">
              <FolderOpen size={26} color="#fff" strokeWidth={2} />
            </div>
            <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Borradores</h2>
            <p className="text-sm text-gray-500 mt-1.5 flex-1">
              Revisa, continúa o elimina los informes guardados de los demás días del turno.
            </p>
            <span className="dashboard-card__badge">
              <CalendarDays size={13} /> {borradorCount} guardado{borradorCount === 1 ? "" : "s"}
            </span>
            <span className="dashboard-card__cta">
              Ver borradores <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('cierre')}
            className="dashboard-card group text-left"
          >
            <div className="dashboard-card__icon bg-[#ED7D31]">
              <FileStack size={26} color="#fff" strokeWidth={2} />
            </div>
            <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Informe de Cierre</h2>
            <p className="text-sm text-gray-500 mt-1.5 flex-1">
              Genera el reporte de cierre semanal, uniendo las actividades de los 7 días del turno más las imágenes adicionales solicitadas.
            </p>
            <span className="dashboard-card__cta">
              Generar cierre <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </span>
          </button>
        </div>
      </main>

      {modalInformeOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
          onClick={() => setModalInformeOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-informe-titulo"
            className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4"
            onClick={event => event.stopPropagation()}
          >
            <div>
              <h2 id="modal-informe-titulo" className="text-lg font-bold text-[#0E4660]">Generar Informe Diario</h2>
              <p className="text-sm text-gray-500 mt-1">
                Elige el informe de hoy con el que quieres trabajar, o crea uno nuevo.
              </p>
            </div>

            {informesHoy.map(informe => (
              <button
                key={informe.id}
                type="button"
                onClick={() => { setModalInformeOpen(false); onAbrirInforme(informe); }}
                className="w-full text-left flex items-start gap-3 p-4 rounded-lg border-2 border-[#0E4660] bg-[#f0f6fb] hover:bg-[#e3eff9] transition-colors"
              >
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#0E4660] text-white">
                  {informe.turno === 'noche' ? <Moon size={16} /> : <Sun size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-[#0E4660]">
                    {estadoBorrador(informe) === 'pendiente' ? 'Comenzar' : 'Continuar con'} el informe de Turno {informe.turno === 'noche' ? 'Noche' : 'Día'}
                  </span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {formatFechaLarga(informe.fecha)} · Turno {informe.letraTurno}
                  </span>
                  <span className="block text-xs text-gray-500">{detalleInforme(informe)}</span>
                </span>
              </button>
            ))}

            <div className="p-4 rounded-lg border-2 border-[#DCE1E6] bg-white">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#F5B300] text-white">
                  <FilePlus size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-[#0E4660]">Crear uno nuevo</span>
                  <span className="block text-xs text-gray-500 mt-0.5">Parte en blanco con la fecha de hoy. ¿De qué turno?</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => { setModalInformeOpen(false); onNuevoInforme('dia'); }}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-bold border border-[#DCE1E6] text-[#0E4660] hover:bg-[#f0f6fb]"
                >
                  <Sun size={15} /> Turno Día
                </button>
                <button
                  type="button"
                  onClick={() => { setModalInformeOpen(false); onNuevoInforme('noche'); }}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-bold bg-[#0E4660] text-white hover:bg-[#0a3549]"
                >
                  <Moon size={15} /> Turno Noche
                </button>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setModalInformeOpen(false)}
                className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="fixed bottom-1 left-1/2 -translate-x-1/2 text-[#F4F6F8] text-[10px] italic cursor-text whitespace-nowrap z-10 select-text">
        creado con amor &lt;3
      </div>
    </div>
  );
}