import { FileText, FileStack, FolderOpen, ArrowRight, CalendarDays } from 'lucide-react';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import { hoyLocalISO, semanaDeFecha, formatDiaMes, DIAS_POR_TURNO } from './types';

interface DashboardProps {
  onNavigate: (view: 'diario' | 'borradores' | 'cierre') => void;
  borradorCount: number;
}

export default function Dashboard({ onNavigate, borradorCount }: DashboardProps) {
  // Turno que corresponde hoy según el calendario 7x7 (A o B) y en qué día de su semana va.
  const hoy = hoyLocalISO();
  const semanaHoy = semanaDeFecha(hoy);
  const diaDelTurno = semanaHoy.dias.indexOf(hoy) + 1;

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
          <span className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold px-3 py-1.5 rounded-full bg-[#FFF3CD] text-[#856404]">
            <CalendarDays size={14} />
            Hoy corresponde Turno {semanaHoy.letra} · día {diaDelTurno} de {DIAS_POR_TURNO} ({formatDiaMes(semanaHoy.inicio)} – {formatDiaMes(semanaHoy.fin)})
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <button
            type="button"
            onClick={() => onNavigate('diario')}
            className="dashboard-card group text-left"
          >
            <div className="dashboard-card__icon bg-[#0E4660]">
              <FileText size={26} color="#fff" strokeWidth={2} />
            </div>
            <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Generar Informe Diario</h2>
            <p className="text-sm text-gray-500 mt-1.5 flex-1">
              Abre el informe de hoy (ya viene creado según el calendario del turno): personal, actividades, evidencia fotográfica y firmas.
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

      <div className="fixed bottom-1 left-1/2 -translate-x-1/2 text-[#F4F6F8] text-[10px] italic cursor-text whitespace-nowrap z-10 select-text">
        creado con amor &lt;3
      </div>
    </div>
  );
}