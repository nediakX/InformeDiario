import { useEffect, useState } from 'react';
import { ClipboardCheck, FileStack, FolderOpen, ChevronRight, Bell, FilePlus, Sun, Moon, Wrench, AlertTriangle, Printer, LogOut, ShieldCheck, UserRound, FileUp, type LucideIcon } from 'lucide-react';
import { useSesion, nombreVisible } from '../auth/sesion';
import { CONFIG_DIVISION } from '../datos/divisiones';
import './dashboard.css';
import SelectorDivision from '../componentes/SelectorDivision';
import logoPsinet from "../assets/logo_psinet.jpg";
import logoEdificio from "../assets/LogoEdificio.png";
import { type BorradorEntry, estadoBorrador, contarFotos, esSemillaSinEditar } from '../datos/borradoresDiario';
import { type BorradorOtroEntry, estadoBorradorGenerico, contarFotosGenerico } from '../datos/borradoresOtros';
import { hoyLocalISO, formatDiaMes, formatFechaLarga } from '../datos/fechas';
import { semanaDeFecha, DIAS_POR_TURNO } from '../datos/turnos';
import { estadoChecklistDelDia } from '../informes/checklist/catalogo';

type TipoBorradorTab = 'diario' | 'mantenimiento' | 'falla';
type EstadoPip = 'pendiente' | 'iniciado' | 'finalizado' | 'futuro';

const INICIAL_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const ETIQUETA_ESTADO: Record<EstadoPip, string> = { pendiente: 'sin fotos', iniciado: 'en curso', finalizado: 'finalizado', futuro: 'aún no' };

/** Acceso a una tarea: ícono, nombre y su estado en una línea. */
function Tarea({ icono: Icono, color, titulo, estado, tono, etiqueta, onClick }: {
  icono: LucideIcon; color: string; titulo: string; estado: string;
  tono?: 'ok' | 'aviso'; etiqueta?: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="dash-tarea">
      <span className="dash-tarea__icono" style={{ background: color }}><Icono size={20} color="#fff" strokeWidth={2} aria-hidden="true" /></span>
      <span className="dash-tarea__texto">
        <span className="dash-tarea__titulo">
          {titulo}
          {etiqueta && <span className="dash-tarea__etiqueta">{etiqueta}</span>}
        </span>
        <span className={`dash-tarea__estado ${tono ? `dash-tarea__estado--${tono}` : ''}`}>{estado}</span>
      </span>
      <ChevronRight size={18} className="dash-tarea__flecha" aria-hidden="true" />
    </button>
  );
}

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
  /** Informes diarios de la semana de turno (guardados y los automáticos aún vacíos), para el tablero del turno. */
  borradoresSemana?: BorradorEntry[];
  /** Checklists de camioneta guardados (para mostrar si el de hoy ya está completo). */
  checklistsCamioneta?: BorradorOtroEntry[];
  onNuevoMantenimiento: () => void;
  onAbrirMantenimiento: (entry: BorradorOtroEntry) => void;
  onNuevaFalla: () => void;
  onAbrirFalla: (entry: BorradorOtroEntry) => void;
  /** Lleva a la pantalla de Borradores ya en la pestaña del tipo indicado. */
  onVerBorradores: (tipo: TipoBorradorTab) => void;
  /** Abre "Importar informe desde Word" (recuperar un informe borrado). */
  onImportar: () => void;
}

const ESTADO_OTRO_LABEL: Record<'pendiente' | 'iniciado' | 'finalizado', string> = {
  pendiente: 'Sin fotos', iniciado: 'Iniciado', finalizado: 'Finalizado',
};

export default function Dashboard({
  onNavigate, borradorCount, pendientesCount = 0, informesHoy = [], onAbrirInforme, onNuevoInforme,
  borradoresMantenimiento = [], borradoresFalla = [], checklistsCamioneta = [], borradoresSemana = [],
  onNuevoMantenimiento, onAbrirMantenimiento, onNuevaFalla, onAbrirFalla, onVerBorradores, onImportar,
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

  const primerNombre = (nombreVisible(perfil).split(' ')[0] || '').replace(/^./, c => c.toUpperCase());
  const fechaHoyTexto = new Date(`${hoy}T12:00:00`).toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace(/^./, c => c.toUpperCase());

  // Estado de cada informe diario de la semana (Día y Noche) para el tablero del turno.
  const estadoDe = (fecha: string, turno: 'dia' | 'noche'): EstadoPip => {
    const b = borradoresSemana.find(x => x.fecha === fecha && x.turno === turno);
    if (!b || esSemillaSinEditar(b)) return fecha > hoy ? 'futuro' : 'pendiente';
    return estadoBorrador(b);
  };
  const diasQueTocan = semanaHoy.dias.filter(f => f <= hoy);
  const informesQueTocan = diasQueTocan.length * 2;
  const finalizadosSemana = diasQueTocan.reduce((n, f) => n + (estadoDe(f, 'dia') === 'finalizado' ? 1 : 0) + (estadoDe(f, 'noche') === 'finalizado' ? 1 : 0), 0);
  const diasConInformeDia = semanaHoy.dias.filter(f => ['iniciado', 'finalizado'].includes(estadoDe(f, 'dia'))).length;

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

      <main className="dash">
        {/* Saludo y cuenta */}
        <div className="dash-top">
          <div className="min-w-0">
            <h1 className="dash-saludo font-display">Hola, {primerNombre}</h1>
            <p className="dash-fecha">{fechaHoyTexto}</p>
          </div>
          <div className="dash-cuenta">
            <SelectorDivision />
            <span className="dash-usuario" title={perfil.email}>
              <UserRound size={14} aria-hidden="true" />
              <span className="truncate">{nombreVisible(perfil)}</span>
              {esAdmin && <span className="dash-usuario__rol">Admin</span>}
            </span>
            <button
              type="button"
              onClick={() => { if (window.confirm('¿Cerrar sesión en este dispositivo?')) void cerrarSesion(); }}
              className="dash-salir"
            >
              <LogOut size={14} aria-hidden="true" /> Salir
            </button>
          </div>
        </div>

        {/* Tablero del turno: la semana de un vistazo, con el estado de cada informe diario */}
        <section className="dash-turno" aria-labelledby="dash-turno-titulo">
          <div className="dash-turno__cabecera">
            <div>
              <h2 id="dash-turno-titulo" className="dash-turno__letra font-display">Turno {semanaHoy.letra}</h2>
              <p className="dash-turno__rango">
                Día {diaDelTurno} de {DIAS_POR_TURNO} · {formatDiaMes(semanaHoy.inicio)} al {formatDiaMes(semanaHoy.fin)}
              </p>
            </div>
            <div className="dash-turno__resumen">
              <span><strong className="font-display">{finalizadosSemana}</strong> de {informesQueTocan} informes finalizados</span>
              {pendientesCount > 0 && (
                <button type="button" onClick={() => onNavigate('borradores')} className="dash-turno__pendientes">
                  <Bell size={13} aria-hidden="true" /> {pendientesCount} por completar
                </button>
              )}
            </div>
          </div>
          <ol className="dash-semana">
            {semanaHoy.dias.map((fecha, i) => {
              const futuro = fecha > hoy;
              return (
                <li key={fecha} className={`dash-dia ${fecha === hoy ? 'dash-dia--hoy' : ''} ${futuro ? 'dash-dia--futuro' : ''}`}>
                  <span className="dash-dia__nombre">{INICIAL_DIA[new Date(`${fecha}T12:00:00`).getDay()]}</span>
                  <span className="dash-dia__fecha font-display">{Number(fecha.slice(8, 10))}</span>
                  <span className="dash-dia__pips" aria-label={`${formatFechaLarga(fecha)}: Día ${ETIQUETA_ESTADO[estadoDe(fecha, 'dia')]}, Noche ${ETIQUETA_ESTADO[estadoDe(fecha, 'noche')]}`}>
                    <span className={`dash-pip dash-pip--${estadoDe(fecha, 'dia')}`} title="Turno Día" />
                    <span className={`dash-pip dash-pip--${estadoDe(fecha, 'noche')}`} title="Turno Noche" />
                  </span>
                  {i === 0 && <span className="sr-only">Primer día del turno</span>}
                </li>
              );
            })}
          </ol>
          <p className="dash-leyenda">
            <span><span className="dash-pip dash-pip--finalizado" /> Finalizado</span>
            <span><span className="dash-pip dash-pip--iniciado" /> En curso</span>
            <span><span className="dash-pip dash-pip--pendiente" /> Sin fotos</span>
            <span className="dash-leyenda__nota">Arriba Día · abajo Noche</span>
          </p>
        </section>

        {/* Informe de hoy: acceso directo a los dos turnos */}
        <section className="dash-hoy" aria-labelledby="dash-hoy-titulo">
          <div className="dash-hoy__cabecera">
            <h2 id="dash-hoy-titulo" className="font-display">Informe de hoy</h2>
            <button type="button" onClick={handleGenerarInforme} className="dash-enlace">
              <FilePlus size={14} aria-hidden="true" /> Crear otro informe
            </button>
          </div>
          <div className="dash-hoy__turnos">
            {(['dia', 'noche'] as const).map(turno => {
              const informe = informesHoy.find(b => b.turno === turno);
              const estado = informe ? estadoBorrador(informe) : 'pendiente';
              const fotos = informe ? contarFotos(informe) : { llenas: 0, total: 0 };
              const avance = fotos.total ? Math.round((fotos.llenas / fotos.total) * 100) : 0;
              const Icono = turno === 'dia' ? Sun : Moon;
              return (
                <button
                  key={turno}
                  type="button"
                  onClick={() => (informe ? onAbrirInforme(informe) : onNuevoInforme(turno))}
                  className={`dash-turno-hoy dash-turno-hoy--${estado}`}
                >
                  <span className="dash-turno-hoy__icono"><Icono size={20} aria-hidden="true" /></span>
                  <span className="dash-turno-hoy__texto">
                    <span className="dash-turno-hoy__titulo font-display">Turno {turno === 'dia' ? 'Día' : 'Noche'}</span>
                    <span className="dash-turno-hoy__estado">
                      {estado === 'finalizado' ? `Finalizado · ${fotos.llenas} fotos` : estado === 'iniciado' ? `${fotos.llenas} de ${fotos.total} fotos` : 'Aún sin fotos'}
                    </span>
                    <span className="dash-barra" aria-hidden="true"><span style={{ width: `${avance}%` }} /></span>
                  </span>
                  <span className="dash-turno-hoy__accion">
                    {estado === 'pendiente' ? 'Comenzar' : estado === 'finalizado' ? 'Revisar' : 'Continuar'}
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Resto de tareas: cada una con su estado en una línea */}
        <section aria-labelledby="dash-tareas-titulo">
          <h2 id="dash-tareas-titulo" className="dash-subtitulo font-display">Tareas del turno</h2>
          <div className="dash-tareas">
            <Tarea icono={ClipboardCheck} color="#1E8E3E" titulo="Checklist de camioneta" onClick={() => onNavigate('checklist')}
              estado={checklistHoy.texto} tono={checklistHoy.completo ? 'ok' : 'aviso'} />
            <Tarea icono={FileStack} color="#ED7D31" titulo="Informe de cierre" onClick={() => onNavigate('cierre')}
              estado={`${diasConInformeDia} de ${DIAS_POR_TURNO} días de Turno Día con informe`} />
            <Tarea icono={Printer} color="#0E4660" titulo="Impresión rápida" onClick={() => onNavigate('impresion')}
              estado={diaDelTurno === 1 ? 'Imprime el kit de formularios de esta semana' : diaDelTurno >= DIAS_POR_TURNO - 1 ? 'Prepara el kit de la próxima semana' : 'Formularios de faena listos para imprimir'}
              tono={diaDelTurno === 1 || diaDelTurno >= DIAS_POR_TURNO - 1 ? 'aviso' : undefined} />
            <Tarea icono={FolderOpen} color="#55636B" titulo="Borradores" onClick={() => onNavigate('borradores')}
              estado={`${borradorCount} informe${borradorCount === 1 ? '' : 's'} guardado${borradorCount === 1 ? '' : 's'}`} />
            <Tarea icono={FileUp} color="#0E7C86" titulo="Recuperar informe desde Word" onClick={onImportar}
              estado="Vuelve a crear un informe borrado a partir de su Word" />
            <Tarea icono={Wrench} color="#55636B" titulo="Mantenimiento de generador" onClick={() => setModalMantenimientoOpen(true)}
              estado={borradoresMantenimiento.length ? `${borradoresMantenimiento.length} borrador${borradoresMantenimiento.length === 1 ? '' : 'es'}` : 'Sin borradores'}
              etiqueta="En desarrollo" />
            <Tarea icono={AlertTriangle} color="#B3261E" titulo="Informe de falla de carro" onClick={() => setModalFallaOpen(true)}
              estado={borradoresFalla.length ? `${borradoresFalla.length} borrador${borradoresFalla.length === 1 ? '' : 'es'}` : 'Sin borradores'}
              etiqueta="En desarrollo" />
            {esAdmin && (
              <Tarea icono={ShieldCheck} color="#14181C" titulo="Panel de administración" onClick={() => onNavigate('admin')}
                estado={pendientesAprobacion > 0 ? `${pendientesAprobacion} cuenta${pendientesAprobacion === 1 ? '' : 's'} por aprobar` : 'Indicadores, usuarios y actividad'}
                tono={pendientesAprobacion > 0 ? 'aviso' : undefined} />
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