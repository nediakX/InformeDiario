import { useEffect, useState } from 'react';
import { ClipboardCheck, FileText, FileStack, FolderOpen, ArrowRight, CalendarDays, Bell, FilePlus, Sun, Moon, Wrench, AlertTriangle, Construction, Printer, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useSesion, nombreVisible } from '../auth/sesion';
import { CONFIG_DIVISION } from '../datos/divisiones';
import SelectorDivision from '../componentes/SelectorDivision';
import logoPsinet from "../assets/logo_psinet.jpg";
import logoEdificio from "../assets/LogoEdificio.png";
import { type BorradorEntry, estadoBorrador, contarFotos } from '../datos/borradoresDiario';
import { type BorradorOtroEntry, estadoBorradorGenerico, contarFotosGenerico } from '../datos/borradoresOtros';
import { hoyLocalISO, formatDiaMes, formatFechaLarga } from '../datos/fechas';
import { semanaDeFecha, DIAS_POR_TURNO } from '../datos/turnos';
import { estadoChecklistDelDia } from '../informes/checklist/catalogo';

type TipoBorradorTab = 'diario' | 'mantenimiento' | 'falla';

interface DashboardProps {
  onNavigate: (view: 'borradores' | 'cierre' | 'checklist' | 'impresion' | 'admin') => void;
  /** Informes de hoy (Día y Noche), guardados o todavía pendientes: la persona elige con cuál trabajar. */
  informesHoy?: BorradorEntry[];
  onAbrirInforme: (entry: BorradorEntry) => void;
  /** Crea un informe nuevo con el turno (Día o Noche) que elija la persona. */
  onNuevoInforme: (turno: 'dia' | 'noche') => void;
  borradorCount: number;
  /** Informes de esta semana de turno (hasta hoy) que siguen en borrador, sin finalizar. */
  pendientesCount?: number;
  /** Borradores guardados en la nube de Mantenimiento e Falla (todos, no solo los de hoy: no dependen del turno). */
  borradoresMantenimiento?: BorradorOtroEntry[];
  borradoresFalla?: BorradorOtroEntry[];
  /** Checklists de camioneta guardados (para mostrar si el de hoy ya está completo). */
  checklistsCamioneta?: BorradorOtroEntry[];
  onNuevoMantenimiento: () => void;
  onAbrirMantenimiento: (entry: BorradorOtroEntry) => void;
  onNuevaFalla: () => void;
  onAbrirFalla: (entry: BorradorOtroEntry) => void;
  /** Lleva a la pantalla de Borradores ya en la pestaña del tipo indicado. */
  onVerBorradores: (tipo: TipoBorradorTab) => void;
}

const ESTADO_OTRO_LABEL: Record<'pendiente' | 'iniciado' | 'finalizado', string> = {
  pendiente: 'Sin fotos', iniciado: 'Iniciado', finalizado: 'Finalizado',
};

export default function Dashboard({
  onNavigate, borradorCount, pendientesCount = 0, informesHoy = [], onAbrirInforme, onNuevoInforme,
  borradoresMantenimiento = [], borradoresFalla = [], checklistsCamioneta = [],
  onNuevoMantenimiento, onAbrirMantenimiento, onNuevaFalla, onAbrirFalla, onVerBorradores,
}: DashboardProps) {
  const { perfil, esAdmin, pendientesAprobacion, cerrarSesion, division } = useSesion();
  const checklistHoy = estadoChecklistDelDia(checklistsCamioneta, hoyLocalISO(), CONFIG_DIVISION[division].camionetas.length);
  const [modalInformeOpen, setModalInformeOpen] = useState(false);
  const [modalMantenimientoOpen, setModalMantenimientoOpen] = useState(false);
  const [modalFallaOpen, setModalFallaOpen] = useState(false);

  // Turno de trabajo (A o B) según el calendario 7x7 y en qué día de su semana va.
  // Día o Noche no se deduce de la hora: cada informe se elige o se crea con su propio turno.
  const hoy = hoyLocalISO();
  const semanaHoy = semanaDeFecha(hoy);
  const diaDelTurno = semanaHoy.dias.indexOf(hoy) + 1;

  const algunModalOpen = modalInformeOpen || modalMantenimientoOpen || modalFallaOpen;
  useEffect(() => {
    if (!algunModalOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setModalInformeOpen(false); setModalMantenimientoOpen(false); setModalFallaOpen(false); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [algunModalOpen]);

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

  const detalleOtro = (entry: BorradorOtroEntry) => {
    const estado = estadoBorradorGenerico(entry.datos);
    const fotos = contarFotosGenerico(entry.datos);
    return `${ESTADO_OTRO_LABEL[estado]} · ${fotos.llenas} de ${fotos.total} fotos`;
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
                {CONFIG_DIVISION[division].sigla} / Reportes de turno
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[1000px] mx-auto p-5 space-y-8">
        <div className="flex flex-wrap items-center justify-end gap-2 sm:-mb-4">
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-600 bg-white border border-[#DCE1E6] rounded-full px-3 py-1.5 max-w-full">
            <UserRound size={14} className="flex-none text-[#0E4660]" />
            <span className="truncate">{nombreVisible(perfil)}</span>
            {esAdmin && <span className="flex-none text-[10px] font-bold uppercase tracking-wide text-[#0E4660] bg-[#e3edf3] rounded-full px-1.5 py-0.5">Admin</span>}
          </span>
          <button
            type="button"
            onClick={() => { if (window.confirm('¿Cerrar sesión en este dispositivo?')) void cerrarSesion(); }}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0E4660] bg-white border border-[#DCE1E6] rounded-full px-3 py-1.5 hover:border-[#0E4660] transition-colors"
          >
            <LogOut size={14} /> Cerrar sesión
          </button>
        </div>
        <div>
          <h1 className="font-display font-bold text-2xl text-[#0E4660]">¿Qué necesitas hacer hoy?</h1>
          <p className="text-sm text-gray-500 mt-1">Selecciona una opción para continuar.</p>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <SelectorDivision />
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
            {/* Primer día o últimos dos días de la semana de turno: recordatorio para imprimir el kit de formularios. */}
            {(diaDelTurno === 1 || diaDelTurno >= DIAS_POR_TURNO - 1) && (
              <button
                type="button"
                onClick={() => onNavigate('impresion')}
                className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#0E4660] text-white hover:bg-[#0a3549] transition-colors"
              >
                <Printer size={12} />
                {diaDelTurno === 1 ? 'Imprimir el kit de formularios de esta semana' : 'Preparar el kit de formularios de la próxima semana'}
              </button>
            )}
          </div>
        </div>

        <section>
          <h2 className="dashboard-section__title">Informe de turno</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button
              type="button"
              onClick={handleGenerarInforme}
              className="dashboard-card dashboard-card--principal group text-left"
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

            <button
              type="button"
              onClick={() => onNavigate('checklist')}
              className="dashboard-card group text-left"
            >
              <div className="dashboard-card__icon bg-[#1E8E3E]">
                <ClipboardCheck size={26} color="#fff" strokeWidth={2} />
              </div>
              <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Checklist de Camioneta</h2>
              <p className="text-sm text-gray-500 mt-1.5 flex-1">
                Lista de verificación diaria de la camioneta (GSSO-LTE-R-LV-DSAL-29): documentos, implementos, luces, neumáticos y aptitudes del conductor.
              </p>
              <span className={`text-[11px] font-bold mt-1.5 ${checklistHoy.completo ? 'text-[#1e6b34]' : 'text-[#856404]'}`}>
                {checklistHoy.texto}
              </span>
              <span className="dashboard-card__cta">
                Completar checklist <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          </div>
        </section>

        <section>
          <h2 className="dashboard-section__title">
            Otros informes <span className="dashboard-section__title-badge">Aún en desarrollo</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button
              type="button"
              onClick={() => setModalMantenimientoOpen(true)}
              title="Aún en desarrollo: puedes entrar a probarlo y guardar borrador, pero puede tener cambios."
              className="dashboard-card group text-left opacity-80 hover:opacity-100"
            >
              <div className="dashboard-card__icon bg-[#55636B]">
                <Wrench size={26} color="#fff" strokeWidth={2} />
              </div>
              <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Mantenimiento de Generador</h2>
              <p className="text-sm text-gray-500 mt-1.5 flex-1">
                Genera el informe de mantenimiento preventivo de un generador: registro, descripción, evidencia fotográfica e inspección técnica.
              </p>
              <span className="dashboard-card__badge">
                <Construction size={13} /> Aún en desarrollo
              </span>
              {borradoresMantenimiento.length > 0 && (
                <span className="text-[11px] text-gray-500 mt-1.5">{borradoresMantenimiento.length} borrador{borradoresMantenimiento.length === 1 ? '' : 'es'} guardado{borradoresMantenimiento.length === 1 ? '' : 's'}</span>
              )}
              <span className="dashboard-card__cta">
                Generar informe <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </button>

            <button
              type="button"
              onClick={() => setModalFallaOpen(true)}
              title="Aún en desarrollo: puedes entrar a probarlo y guardar borrador, pero puede tener cambios."
              className="dashboard-card group text-left opacity-80 hover:opacity-100"
            >
              <div className="dashboard-card__icon bg-[#B3261E]">
                <AlertTriangle size={26} color="#fff" strokeWidth={2} />
              </div>
              <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Informe de Falla — Carro</h2>
              <p className="text-sm text-gray-500 mt-1.5 flex-1">
                Genera el reporte de falla de un Carro (Light / LTE): descripción de la falla, solución implementada, verificación final y registro fotográfico.
              </p>
              <span className="dashboard-card__badge">
                <Construction size={13} /> Aún en desarrollo
              </span>
              {borradoresFalla.length > 0 && (
                <span className="text-[11px] text-gray-500 mt-1.5">{borradoresFalla.length} borrador{borradoresFalla.length === 1 ? '' : 'es'} guardado{borradoresFalla.length === 1 ? '' : 's'}</span>
              )}
              <span className="dashboard-card__cta">
                Generar informe <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </button>
          </div>
        </section>

        <section>
          <h2 className="dashboard-section__title">Herramientas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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
                Revisa, continúa o elimina los informes guardados: Diario, Mantenimiento y Falla — Carro, cada uno en su pestaña.
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
              onClick={() => onNavigate('impresion')}
              className="dashboard-card group text-left"
            >
              <div className="dashboard-card__icon bg-[#0E4660]">
                <Printer size={26} color="#fff" strokeWidth={2} />
              </div>
              <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Impresión Rápida</h2>
              <p className="text-sm text-gray-500 mt-1.5 flex-1">
                Elige qué documentos de faena necesitas y cuántas copias de cada uno, y se juntan en un solo PDF listo para imprimir.
              </p>
              <span className="dashboard-card__cta">
                Elegir e imprimir <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
              </span>
            </button>

            {esAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="dashboard-card group text-left md:col-span-2"
              >
                <div className="dashboard-card__icon bg-[#14181C]">
                  <ShieldCheck size={26} color="#F5B300" strokeWidth={2} />
                </div>
                <h2 className="font-display font-bold text-lg text-[#0E4660] mt-4">Panel de administración</h2>
                <p className="text-sm text-gray-500 mt-1.5 flex-1">
                  Indicadores de cumplimiento, fallas y mantenimientos por carro, actividad del equipo y aprobación de cuentas de usuario.
                </p>
                {pendientesAprobacion > 0 && (
                  <span className="dashboard-card__badge">
                    <Bell size={13} /> {pendientesAprobacion} cuenta{pendientesAprobacion === 1 ? '' : 's'} por aprobar
                  </span>
                )}
                <span className="dashboard-card__cta">
                  Abrir panel <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            )}
          </div>
        </section>
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

      {modalMantenimientoOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={() => setModalMantenimientoOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4"
            onClick={event => event.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-[#0E4660]">Mantenimiento de Generador</h2>
              <p className="text-sm text-gray-500 mt-1">Continúa un borrador guardado o crea uno nuevo.</p>
            </div>

            {borradoresMantenimiento.slice(0, 4).map(entry => (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setModalMantenimientoOpen(false); onAbrirMantenimiento(entry); }}
                className="w-full text-left flex items-start gap-3 p-4 rounded-lg border-2 border-[#0E4660] bg-[#f0f6fb] hover:bg-[#e3eff9] transition-colors"
              >
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#0E4660] text-white">
                  <Wrench size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-[#0E4660] truncate">{entry.titulo || 'Continuar borrador'}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{formatFechaLarga(entry.fecha)}</span>
                  <span className="block text-xs text-gray-500">{detalleOtro(entry)}</span>
                </span>
              </button>
            ))}

            {borradoresMantenimiento.length > 4 && (
              <button
                type="button"
                onClick={() => { setModalMantenimientoOpen(false); onVerBorradores('mantenimiento'); }}
                className="text-xs font-bold text-[#0E4660] underline"
              >
                Ver los {borradoresMantenimiento.length} borradores guardados
              </button>
            )}

            <button
              type="button"
              onClick={() => { setModalMantenimientoOpen(false); onNuevoMantenimiento(); }}
              className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-[#DCE1E6] bg-white hover:bg-[#f0f6fb] transition-colors text-left"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#F5B300] text-white">
                <FilePlus size={16} />
              </span>
              <span>
                <span className="block font-display font-bold text-[#0E4660]">Crear uno nuevo</span>
                <span className="block text-xs text-gray-500 mt-0.5">Parte en blanco con la fecha de hoy.</span>
              </span>
            </button>

            <div className="flex justify-end">
              <button type="button" onClick={() => setModalMantenimientoOpen(false)} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {modalFallaOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={() => setModalFallaOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4"
            onClick={event => event.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-[#0E4660]">Informe de Falla — Carro</h2>
              <p className="text-sm text-gray-500 mt-1">Continúa un borrador guardado o crea uno nuevo.</p>
            </div>

            {borradoresFalla.slice(0, 4).map(entry => (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setModalFallaOpen(false); onAbrirFalla(entry); }}
                className="w-full text-left flex items-start gap-3 p-4 rounded-lg border-2 border-[#0E4660] bg-[#f0f6fb] hover:bg-[#e3eff9] transition-colors"
              >
                <span className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#0E4660] text-white">
                  <AlertTriangle size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-bold text-[#0E4660] truncate">{entry.titulo || 'Continuar borrador'}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{formatFechaLarga(entry.fecha)}</span>
                  <span className="block text-xs text-gray-500">{detalleOtro(entry)}</span>
                </span>
              </button>
            ))}

            {borradoresFalla.length > 4 && (
              <button
                type="button"
                onClick={() => { setModalFallaOpen(false); onVerBorradores('falla'); }}
                className="text-xs font-bold text-[#0E4660] underline"
              >
                Ver los {borradoresFalla.length} borradores guardados
              </button>
            )}

            <button
              type="button"
              onClick={() => { setModalFallaOpen(false); onNuevaFalla(); }}
              className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-[#DCE1E6] bg-white hover:bg-[#f0f6fb] transition-colors text-left"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#F5B300] text-white">
                <FilePlus size={16} />
              </span>
              <span>
                <span className="block font-display font-bold text-[#0E4660]">Crear uno nuevo</span>
                <span className="block text-xs text-gray-500 mt-0.5">Parte en blanco con la fecha de hoy.</span>
              </span>
            </button>

            <div className="flex justify-end">
              <button type="button" onClick={() => setModalFallaOpen(false)} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
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