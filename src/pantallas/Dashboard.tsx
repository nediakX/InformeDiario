import CuentaCabecera from '../componentes/CuentaCabecera';
import { Fragment, Suspense, lazy, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { ChevronDown, ClipboardCheck, CloudOff, FileStack, FolderOpen, ChevronRight, Bell, FilePlus, Sun, Moon, Wrench, AlertTriangle, LayoutGrid, Pencil, Pin } from 'lucide-react';
import { useSesion, nombreVisible } from '../auth/sesion';
import { useConexion } from '../lib/conexion';
import { registrarDeshacer } from '../lib/deshacer';
import { accesosDelRol, guardarAccesosRapidos, useAccesosElegidos } from '../datos/accesosRapidos';
import { INFO_TAREA } from './tareasInicio';
import EditorAccesosRapidos from './EditorAccesosRapidos';
import { CONFIG_DIVISION } from '../datos/divisiones';
import './dashboard.css';
import SelectorDivision from '../componentes/SelectorDivision';
import BannerCumpleanos from '../componentes/BannerCumpleanos';
import RecordatorioPerfil from '../componentes/RecordatorioPerfil';
import logoPsinet from "../assets/logo_psinet.png";
import logoEdificio from "../assets/LogoEdificio.png";
import { type BorradorEntry, estadoBorrador, contarFotos, esSemillaSinEditar } from '../datos/borradoresDiario';
import { type BorradorOtroEntry, estadoBorradorOtro, contarFotosGenerico } from '../datos/borradoresOtros';
import { hoyLocalISO, formatDiaMes, formatFechaLarga } from '../datos/fechas';
import { semanaDeFecha, turnosDeDivision, DIAS_POR_TURNO } from '../datos/turnos';
import { estadoChecklistDelDia } from '../informes/checklist/catalogo';
import MonitorGeneradores from './MonitorGeneradores';
import { esPreventiva } from '../informes/preventiva/modelo';
import { SITIOS_MAPA, carrosSinUbicacion } from '../datos/sitiosMapa';
// La vista previa del mapa trae Leaflet: se carga aparte para no demorar el panel.
const MiniMapaSitios = lazy(() => import('./MiniMapaSitios'));
import { PorRevisar, ResumenContrato } from './BloquesRol';
import { DISENO_INICIO, DISENO_INICIO_ANDINA, ETIQUETA_CORTA_ROL, ETIQUETA_ROL, MAX_ACCESOS_RAPIDOS, ORDEN_COMPLETO, rolDePersona, type BloqueInicio, type IdTarea } from '../datos/roles';

type TipoBorradorTab = 'diario' | 'mantenimiento' | 'falla';
type EstadoPip = 'pendiente' | 'iniciado' | 'finalizado' | 'futuro' | 'no_realizado';

const INICIAL_DIA = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const ETIQUETA_ESTADO: Record<EstadoPip, string> = { pendiente: 'sin fotos', iniciado: 'en curso', finalizado: 'finalizado', futuro: 'aún no', no_realizado: 'no realizado' };

/** Acceso a una tarea: ícono, nombre y su estado en una línea. */
function Tarea({ id, estado, tono, etiqueta, ayuda, onClick }: {
  id: IdTarea; estado: string;
  tono?: 'ok' | 'aviso'; etiqueta?: string;
  /** El texto es solo una descripción fija (no un estado): en el celular se oculta para ahorrar espacio. */
  ayuda?: boolean;
  onClick: () => void;
}) {
  const { icono: Icono, color, titulo } = INFO_TAREA[id];
  return (
    <button type="button" onClick={onClick} className="dash-tarea">
      <span className="dash-tarea__icono" style={{ background: color }}><Icono size={20} color="#fff" strokeWidth={2} aria-hidden="true" /></span>
      <span className="dash-tarea__texto">
        <span className="dash-tarea__titulo">
          {titulo}
          {etiqueta && <span className="dash-tarea__etiqueta">{etiqueta}</span>}
        </span>
        <span className={`dash-tarea__estado ${tono ? `dash-tarea__estado--${tono}` : ''} ${ayuda ? 'dash-tarea__estado--ayuda' : ''}`}>{estado}</span>
      </span>
      <ChevronRight size={18} className="dash-tarea__flecha" aria-hidden="true" />
    </button>
  );
}

interface DashboardProps {
  onNavigate: (view: 'borradores' | 'cierre' | 'presentacion' | 'presentacion-fds' |'checklist' | 'impresion' | 'reportabilidad-gg' | 'tabla-mantenimiento' | 'mapa' | 'admin' | 'perfil') => void;
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
  /** Nueva Mantención preventiva de sitio (sus borradores van en la lista de Mantenimiento). */
  onNuevaPreventiva: () => void;
  onNuevaFalla: () => void;
  onAbrirFalla: (entry: BorradorOtroEntry) => void;
  /** Lleva a la pantalla de Borradores ya en la pestaña del tipo indicado. */
  onVerBorradores: (tipo: TipoBorradorTab) => void;
  /** Abre "Importar informe desde Word" (recuperar un informe borrado). */
  onImportar: () => void;
  /** Marca el turno noche de hoy como no realizado, con su motivo. */
  onMarcarNocheNoRealizada?: (motivo: string) => Promise<void>;
}

const ESTADO_OTRO_LABEL: Record<'pendiente' | 'iniciado' | 'finalizado', string> = {
  pendiente: 'Sin fotos', iniciado: 'Iniciado', finalizado: 'Finalizado',
};

export default function Dashboard({
  onNavigate, borradorCount, pendientesCount = 0, informesHoy = [], onAbrirInforme, onNuevoInforme,
  borradoresMantenimiento = [], borradoresFalla = [], checklistsCamioneta = [], borradoresSemana = [],
  onNuevoMantenimiento, onAbrirMantenimiento, onNuevaPreventiva, onNuevaFalla, onAbrirFalla, onVerBorradores, onImportar,
  onMarcarNocheNoRealizada,
}: DashboardProps) {
  const [modalNoche, setModalNoche] = useState(false);
  const [motivoNoche, setMotivoNoche] = useState('');
  const { perfil, esAdmin, pendientesAprobacion, division, session } = useSesion();
  const enLinea = useConexion();
  const checklistHoy = estadoChecklistDelDia(checklistsCamioneta, hoyLocalISO(), CONFIG_DIVISION[division].camionetas.length);
  const [modalInformeOpen, setModalInformeOpen] = useState(false);
  // Modal de Mantenimiento: de generador o preventiva de sitio (cada uno con sus borradores).
  const [modalMant, setModalMant] = useState<null | 'generador' | 'preventiva'>(null);
  const modalMantenimientoOpen = modalMant !== null;
  const setModalMantenimientoOpen = (abierto: false) => { if (!abierto) setModalMant(null); };
  // Los informes finalizados no se ofrecen para continuar (siguen guardados en Borradores).
  const sinFinalizar = (e: BorradorOtroEntry) => estadoBorradorOtro(e) !== 'finalizado';
  const borradoresGenerador = borradoresMantenimiento.filter(e => !esPreventiva(e.datos) && sinFinalizar(e));
  const borradoresPreventiva = borradoresMantenimiento.filter(e => esPreventiva(e.datos) && sinFinalizar(e));
  const borradoresFallaEnCurso = borradoresFalla.filter(sinFinalizar);
  const borradoresModalMant = modalMant === 'preventiva' ? borradoresPreventiva : borradoresGenerador;
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
    // Turno marcado como no realizado (p. ej. "Turno noche no realizado esta semana"): queda resuelto, en verde.
    if (b?.sinTurno) return 'no_realizado';
    if (!b || esSemillaSinEditar(b)) return fecha > hoy ? 'futuro' : 'pendiente';
    return estadoBorrador(b);
  };
  // Turnos de la división: Andina trabaja solo el Turno Día, así que su panel muestra una sola marca por día.
  const turnos = turnosDeDivision(division);
  const nombreTurno = (turno: 'dia' | 'noche') => (turno === 'dia' ? 'Día' : 'Noche');
  const resumenDia = (fecha: string) => turnos.map(t => `${nombreTurno(t)} ${ETIQUETA_ESTADO[estadoDe(fecha, t)]}`).join(', ');
  const diasQueTocan = semanaHoy.dias.filter(f => f <= hoy);
  // Un turno no realizado no se espera (igual que en los KPI): no suma a "de N informes".
  const informesQueTocan = diasQueTocan.reduce((n, f) => n + turnos.filter(t => estadoDe(f, t) !== 'no_realizado').length, 0);
  const hayNoRealizados = semanaHoy.dias.some(f => turnos.some(t => estadoDe(f, t) === 'no_realizado'));
  const finalizadosSemana = diasQueTocan.reduce((n, f) => n + turnos.filter(t => estadoDe(f, t) === 'finalizado').length, 0);
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
    const estado = estadoBorradorOtro(entry);
    const fotos = contarFotosGenerico(entry.datos);
    return `${ESTADO_OTRO_LABEL[estado]} · ${fotos.llenas} de ${fotos.total} fotos`;
  };

  // Saludo según la hora (se actualiza solo: el turno Día parte en la mañana y el Noche a las 20:00).
  const [hora, setHora] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = window.setInterval(() => setHora(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const saludo = hora >= 5 && hora < 12 ? 'Buenos días' : hora >= 12 && hora < 20 ? 'Buenas tardes' : 'Buenas noches';

  // --- Rol: decide el orden del inicio (solo visual; permisos y datos no cambian) ---
  const { rol } = rolDePersona(perfil, nombreVisible(perfil), division);
  const [verTodo, setVerTodo] = useState<boolean>(() => {
    try { return localStorage.getItem('psinet_inicio_completo') === '1'; } catch { return false; }
  });
  const alternarVista = () => setVerTodo(v => {
    try { localStorage.setItem('psinet_inicio_completo', v ? '0' : '1'); } catch { /* sin almacenamiento */ }
    return !v;
  });
  // Andina tiene la misma distribución que El Salvador; cambian solo sus accesos rápidos (y trabaja solo el
  // Turno Día). Su monitor de generadores y su mapa usan sus propios carros.
  const esAndina = division === 'andina';
  const diseno = esAndina ? DISENO_INICIO_ANDINA[rol] : DISENO_INICIO[rol];
  const ladoLateral = diseno.lateral;
  const esGestion = rol === 'supervisor' || rol === 'jefe' || rol === 'contrato' || rol === 'lider_tecnico' || rol === 'ingeniero_especialista';

  // Accesos rápidos de la cuenta (hasta 5): los que eligió en esta división o, si no ha elegido, los de su rol.
  const { elegidos, sinSubir: accesosSinSubir } = useAccesosElegidos(session.user, division);
  const [editorAccesos, setEditorAccesos] = useState(false);

  // Accesos a cada pantalla (se usan en "Accesos rápidos" y en "Todas las opciones").
  const tareas: Record<IdTarea, ReactNode> = {
    checklist: <Tarea id="checklist" onClick={() => onNavigate('checklist')}
      estado={checklistHoy.texto} tono={checklistHoy.completo ? 'ok' : 'aviso'} />,
    gg: <Tarea id="gg" onClick={() => onNavigate('reportabilidad-gg')}
      estado="Combustible, horómetro, niveles y temperatura" ayuda />,
    tablaMantenimiento: division === 'el_salvador' ? <Tarea id="tablaMantenimiento" onClick={() => onNavigate('tabla-mantenimiento')}
      estado="Mantenimientos, cambio de correa y último reporte de cada GG" /> : null,
    impresion: <Tarea id="impresion" onClick={() => onNavigate('impresion')}
      estado={diaDelTurno === 1 ? 'Imprime el kit de formularios de esta semana' : diaDelTurno >= DIAS_POR_TURNO - 1 ? 'Prepara el kit de la próxima semana' : 'Formularios de faena listos para imprimir'}
      tono={diaDelTurno === 1 || diaDelTurno >= DIAS_POR_TURNO - 1 ? 'aviso' : undefined} />,
    cierre: <Tarea id="cierre" onClick={() => onNavigate('cierre')}
      estado={`${diasConInformeDia} de ${DIAS_POR_TURNO} días de Turno Día con informe`} />,
    presentacion: division === 'el_salvador' ? <Tarea id="presentacion" onClick={() => onNavigate('presentacion')}
      estado="Láminas del turno completo desde los informes diarios" /> : null,
    presentacionFds: division === 'el_salvador' ? <Tarea id="presentacionFds" onClick={() => onNavigate('presentacion-fds')}
      estado="Viernes a domingo: láminas del fin de semana" /> : null,
    falla: <Tarea id="falla" onClick={() => setModalFallaOpen(true)}
      estado={borradoresFallaEnCurso.length ? `${borradoresFallaEnCurso.length} borrador${borradoresFallaEnCurso.length === 1 ? '' : 'es'}` : 'Sin borradores'}
      etiqueta="En desarrollo" />,
    mantenimiento: <Tarea id="mantenimiento" onClick={() => setModalMant('generador')}
      estado={borradoresGenerador.length ? `${borradoresGenerador.length} borrador${borradoresGenerador.length === 1 ? '' : 'es'}` : 'Sin borradores'}
      etiqueta="En desarrollo" />,
    preventiva: <Tarea id="preventiva"
      onClick={() => (borradoresPreventiva.length ? setModalMant('preventiva') : onNuevaPreventiva())}
      estado={borradoresPreventiva.length ? `${borradoresPreventiva.length} borrador${borradoresPreventiva.length === 1 ? '' : 'es'}` : 'Paneles, baterías, GG, torre y consolas'} />,
    mapa: SITIOS_MAPA[division] ? <Tarea id="mapa" onClick={() => onNavigate('mapa')}
      estado={SITIOS_MAPA[division]!.sitios.length
        ? `${SITIOS_MAPA[division]!.sitios.length + carrosSinUbicacion(division).length} carros en ${SITIOS_MAPA[division]!.nombre}`
        : `${carrosSinUbicacion(division).length} carros · ubicaciones pendientes`} /> : null,
    borradores: <Tarea id="borradores" onClick={() => onNavigate('borradores')}
      estado={`${borradorCount} informe${borradorCount === 1 ? '' : 's'} guardado${borradorCount === 1 ? '' : 's'}`} />,
    recuperar: <Tarea id="recuperar" onClick={onImportar}
      estado="Vuelve a crear un informe borrado a partir de su Word" ayuda />,
    admin: esAdmin ? <Tarea id="admin" onClick={() => onNavigate('admin')}
      estado={pendientesAprobacion > 0 ? `${pendientesAprobacion} cuenta${pendientesAprobacion === 1 ? '' : 's'} por aprobar` : 'Indicadores, actividades, generadores y usuarios'}
      tono={pendientesAprobacion > 0 ? 'aviso' : undefined} /> : null,
  };

  // Todas las opciones, agrupadas por para qué sirven, con buscador (sin tildes ni mayúsculas).
  const [busquedaOpc, setBusquedaOpc] = useState('');
  const buscando = busquedaOpc.trim() !== '';
  const normalizarOpc = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const coincide = (id: IdTarea) => {
    if (!tareas[id]) return false;
    return !buscando || normalizarOpc(INFO_TAREA[id].titulo).includes(normalizarOpc(busquedaOpc.trim()));
  };
  const GRUPOS_OPCIONES: { clave: string; titulo: string; icono: ReactNode; ids: IdTarea[] }[] = [
    { clave: 'terreno', titulo: 'Registros en terreno', icono: <ClipboardCheck size={15} aria-hidden="true" />, ids: ['checklist', 'gg', 'tablaMantenimiento', 'impresion', 'mapa'] },
    { clave: 'informes', titulo: 'Otros informes', icono: <FileStack size={15} aria-hidden="true" />, ids: ['cierre', 'presentacion', 'presentacionFds', 'preventiva', 'falla', 'mantenimiento'] },
    { clave: 'archivo', titulo: 'Archivo', icono: <FolderOpen size={15} aria-hidden="true" />, ids: ['borradores', 'recuperar', 'admin'] },
  ];
  const gruposVisibles = GRUPOS_OPCIONES.map(g => ({ ...g, visibles: g.ids.filter(coincide) })).filter(g => g.visibles.length > 0);

  const opciones = (
    <div className="dash-opciones">
      <label className="block">
        <span className="sr-only">Buscar una opción</span>
        <input type="search" value={busquedaOpc} onChange={e => setBusquedaOpc(e.target.value)}
          placeholder="Buscar una opción (ej.: gg, cierre, borradores)"
          className="w-full rounded-lg border border-[#c9d3da] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4660]/30" />
      </label>
      <div className="dash-grupos mt-3">
        {gruposVisibles.map(g => (
          <section key={g.clave} className="dash-grupo" aria-labelledby={`dash-grupo-${g.clave}`}>
            <h2 id={`dash-grupo-${g.clave}`} className="dash-grupo__titulo">{g.icono} {g.titulo}</h2>
            <div className="dash-grupo__lista">{g.visibles.map(id => <Fragment key={id}>{tareas[id]}</Fragment>)}</div>
          </section>
        ))}
        {gruposVisibles.length === 0 && <p className="text-sm text-gray-500">No hay opciones que coincidan con «{busquedaOpc}».</p>}
      </div>
    </div>
  );

  // Turno en una tarjeta corta (columna lateral): semana con sus marcas Día/Noche y el avance.
  const turnoMini = (
    <section className="dash-turno-mini" aria-labelledby="dash-turno-mini-titulo">
      <div className="dash-turno-mini__cabecera">
        <h2 id="dash-turno-mini-titulo" className="font-display">Turno {semanaHoy.letra}</h2>
        <span>Día {diaDelTurno} de {DIAS_POR_TURNO} · {formatDiaMes(semanaHoy.inicio)} al {formatDiaMes(semanaHoy.fin)}</span>
      </div>
      <ol className="dash-turno-mini__dias" aria-label={turnos.length > 1 ? 'Informes de la semana: arriba Día, abajo Noche' : 'Informes de la semana'}>
        {semanaHoy.dias.map(fecha => (
          <li key={fecha} className={`${fecha === hoy ? 'hoy' : ''} ${fecha > hoy ? 'futuro' : ''}`}
            title={`${formatFechaLarga(fecha)}: ${resumenDia(fecha)}`}>
            <span className="dash-turno-mini__dia">{INICIAL_DIA[new Date(`${fecha}T12:00:00`).getDay()]}{Number(fecha.slice(8, 10))}</span>
            {turnos.map(t => <span key={t} className={`dash-pip dash-pip--${estadoDe(fecha, t)}`} />)}
          </li>
        ))}
      </ol>
      <div className="dash-turno-mini__pie">
        <span><strong>{finalizadosSemana}</strong> de {informesQueTocan} informes finalizados</span>
        {pendientesCount > 0 && (
          <button type="button" onClick={() => onNavigate('borradores')} className="dash-turno__pendientes"><Bell size={12} aria-hidden="true" /> {pendientesCount} por completar</button>
        )}
      </div>
    </section>
  );

  // Opciones que se pueden anclar (las de "Todas las opciones" que la persona puede usar) y las que se ven.
  const disponibles = GRUPOS_OPCIONES.flatMap(g => g.ids).filter(id => tareas[id]);
  const accesosRol = accesosDelRol(diseno.accesos, id => Boolean(tareas[id]));
  const accesosVisibles = elegidos ? elegidos.filter(id => tareas[id]).slice(0, MAX_ACCESOS_RAPIDOS) : accesosRol;
  const guardarAccesos = (ids: IdTarea[] | null) => {
    const anteriores = elegidos;
    setEditorAccesos(false);
    void guardarAccesosRapidos(session.user.id, division, ids);
    registrarDeshacer(ids ? 'Accesos rápidos guardados' : 'Volviste a los accesos rápidos de tu rol',
      () => { void guardarAccesosRapidos(session.user.id, division, anteriores); });
  };

  const accesos = (
    <section className="dash-accesos" aria-labelledby="dash-accesos-titulo">
      <div className="dash-accesos__cabecera">
        <h2 id="dash-accesos-titulo" className="dash-grupo__titulo">Accesos rápidos</h2>
        <button type="button" className="dash-accesos__editar" onClick={() => setEditorAccesos(true)} aria-haspopup="dialog"
          aria-label="Editar accesos rápidos" title="Elegir qué opciones anclar (hasta 5)">
          <Pencil size={13} aria-hidden="true" /> Editar
        </button>
      </div>
      {accesosVisibles.length > 0 ? (
        <div className="dash-grupo__lista">
          {accesosVisibles.map(id => <Fragment key={id}>{tareas[id]}</Fragment>)}
        </div>
      ) : (
        <button type="button" className="dash-accesos__vacio" onClick={() => setEditorAccesos(true)}>
          <Pin size={16} aria-hidden="true" /> Ancla hasta {MAX_ACCESOS_RAPIDOS} opciones para tenerlas a mano
        </button>
      )}
      {accesosSinSubir && !enLinea && (
        <p className="dash-accesos__nota"><CloudOff size={13} aria-hidden="true" /> Sin señal: se guardan en tu cuenta al volver la conexión.</p>
      )}
    </section>
  );

  const bloques: Record<BloqueInicio, ReactNode> = {
    contrato: <ResumenContrato division={division} onVerMas={esAdmin ? () => onNavigate('admin') : undefined} />,
    revisar: (
      <PorRevisar
        titulo={esGestion ? 'Por revisar' : 'Pendientes del turno'}
        dias={semanaHoy.dias} hoy={hoy} semana={borradoresSemana} turnos={turnos} checklist={checklistHoy}
        onAbrirInforme={onAbrirInforme} onVerBorradores={() => onVerBorradores('diario')} onChecklist={() => onNavigate('checklist')}
      />
    ),
    turno: <>
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
                  <span className="dash-dia__pips" aria-label={`${formatFechaLarga(fecha)}: ${resumenDia(fecha)}`}>
                    {turnos.map(t => <span key={t} className={`dash-pip dash-pip--${estadoDe(fecha, t)}`} title={`Turno ${nombreTurno(t)}`} />)}
                  </span>
                  {i === 0 && <span className="sr-only">Primer día del turno</span>}
                </li>
              );
            })}
          </ol>
          <p className="dash-leyenda">
            <span><span className="dash-pip dash-pip--finalizado" /> {hayNoRealizados ? 'Finalizado o no realizado' : 'Finalizado'}</span>
            <span><span className="dash-pip dash-pip--iniciado" /> En curso</span>
            <span><span className="dash-pip dash-pip--pendiente" /> Sin fotos</span>
            {turnos.length > 1 && <span className="dash-leyenda__nota">Arriba Día · abajo Noche</span>}
          </p>
        </section>
        </>,
    hoy: <>
        {/* Informe de hoy: acceso directo a los dos turnos */}
        <section className="dash-hoy" aria-labelledby="dash-hoy-titulo">
          <div className="dash-hoy__cabecera">
            <h2 id="dash-hoy-titulo" className="font-display">Informe de hoy</h2>
            <button type="button" onClick={handleGenerarInforme} className="dash-enlace">
              <FilePlus size={14} aria-hidden="true" /> Crear otro informe
            </button>
          </div>
          <div className="dash-hoy__turnos" style={turnos.length === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
            {turnos.map(turno => {
              const informe = informesHoy.find(b => b.turno === turno);
              const estado = informe ? estadoBorrador(informe) : 'pendiente';
              const fotos = informe ? contarFotos(informe) : { llenas: 0, total: 0 };
              const avance = fotos.total ? Math.round((fotos.llenas / fotos.total) * 100) : 0;
              const Icono = turno === 'dia' ? Sun : Moon;
              const noRealizado = Boolean(informe?.sinTurno);
              return (
                <button
                  key={turno}
                  type="button"
                  onClick={() => (informe ? onAbrirInforme(informe) : onNuevoInforme(turno))}
                  className={`dash-turno-hoy dash-turno-hoy--${noRealizado ? 'finalizado' : estado}`}
                >
                  <span
                    className="dash-anillo"
                    aria-hidden="true"
                    style={{ '--pct': noRealizado || estado === 'finalizado' ? 100 : avance, '--ring': noRealizado || estado === 'finalizado' ? '#1e8e3e' : 'var(--brand-blue)' } as CSSProperties}
                  >
                    <span className="dash-anillo__centro"><Icono size={20} aria-hidden="true" /></span>
                  </span>
                  <span className="dash-turno-hoy__texto">
                    <span className="dash-turno-hoy__titulo font-display">Turno {turno === 'dia' ? 'Día' : 'Noche'}</span>
                    <span className="dash-turno-hoy__estado">
                      {noRealizado
                        ? `No realizado · ${informe?.sinTurnoMotivo || 'sin motivo'}`
                        : estado === 'finalizado' ? `Finalizado · ${fotos.llenas} fotos` : estado === 'iniciado' ? `${fotos.llenas} de ${fotos.total} fotos` : 'Aún sin fotos'}
                    </span>
                    <span className="dash-barra" aria-hidden="true"><span style={{ width: `${noRealizado ? 100 : avance}%` }} /></span>
                  </span>
                  <span className="dash-turno-hoy__accion">
                    {noRealizado ? 'Ver' : estado === 'pendiente' ? 'Comenzar' : estado === 'finalizado' ? 'Revisar' : 'Continuar'}
                    <ChevronRight size={16} aria-hidden="true" />
                  </span>
                </button>
              );
            })}
          </div>
          {turnos.includes('noche') && !informesHoy.some(b => b.turno === 'noche') && onMarcarNocheNoRealizada && (
            <p className="text-sm text-gray-600 mt-3">
              ¿Se hará turno noche hoy?{' '}
              <button type="button" onClick={() => setModalNoche(true)} className="dash-enlace">No, no se hará</button>
            </p>
          )}
        </section>
        {modalNoche && (
          <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
              <h2 className="text-lg font-bold text-[#0E4660]">¿Por qué no se hará turno noche?</h2>
              <textarea
                value={motivoNoche}
                onChange={e => setMotivoNoche(e.target.value)}
                rows={3}
                placeholder="Ej.: sin personal, faena detenida, feriado…"
                className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setModalNoche(false); setMotivoNoche(''); }} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold">Cancelar</button>
                <button
                  type="button"
                  disabled={!motivoNoche.trim()}
                  onClick={() => {
                    const m = motivoNoche.trim();
                    setModalNoche(false);
                    setMotivoNoche('');
                    void onMarcarNocheNoRealizada?.(m).catch(() => window.alert('No se pudo marcar el turno. Revisa la conexión e inténtalo de nuevo.'));
                  }}
                  className="bg-[#a32626] text-white px-3 py-1.5 rounded-md text-xs font-bold disabled:opacity-50"
                >
                  Marcar turno no realizado
                </button>
              </div>
            </div>
          </div>
        )}
        </>,
    generadores: <MonitorGeneradores onAbrir={() => onNavigate('reportabilidad-gg')} detalleInicial={rol === 'electromecanico' ? true : rol === 'contrato' ? false : undefined} />,
    turnoMini,
    generadoresMini: <MonitorGeneradores compacto onAbrir={() => onNavigate('reportabilidad-gg')} />,
    mapa: SITIOS_MAPA[division] ? <Suspense fallback={null}><MiniMapaSitios onAbrir={() => onNavigate('mapa')} /></Suspense> : null,
    accesos,
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
                {division === 'andina' ? CONFIG_DIVISION[division].nombre : 'Panel de Informes'}
              </div>
              <div className="site-header__meta text-xs truncate">
                {CONFIG_DIVISION[division].sigla} / Reportes de turno
              </div>
            </div>
          </div>
          <CuentaCabecera />
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="dash">
        <BannerCumpleanos division={division} />
        <RecordatorioPerfil onIr={() => onNavigate('perfil')} />
        {/* Saludo, división y vista (por rol o completa) en una sola franja */}
        <div className="dash-top">
          <div className="min-w-0">
            <h1 className="dash-saludo font-display">{saludo}, {primerNombre}</h1>
            <p className="dash-fecha">{esAndina ? `${fechaHoyTexto} · Turno Día, 08:00 a 20:00` : fechaHoyTexto}</p>
          </div>
          <div className="dash-cuenta">
            <SelectorDivision />
            {/* Vista: la del rol o el inicio completo, en un solo selector */}
            <div role="radiogroup" aria-label="Vista del inicio" className="inline-flex items-center rounded-full border border-[#DCE1E6] bg-white p-0.5 text-xs font-bold">
              <LayoutGrid size={14} className="mx-1.5 text-[#0E4660]" aria-hidden="true" />
              {([[false, ETIQUETA_CORTA_ROL[rol]], [true, 'Todo']] as const).map(([todo, texto]) => (
                <button key={texto} type="button" role="radio" aria-checked={verTodo === todo}
                  title={todo ? 'Ver el inicio completo' : `Ver solo lo de ${ETIQUETA_ROL[rol].toLowerCase()}`}
                  onClick={() => { if (verTodo !== todo) alternarVista(); }}
                  className={`rounded-full px-3 py-1 transition-colors ${verTodo === todo ? 'bg-[#0E4660] text-white' : 'text-[#0E4660] hover:bg-[#e3edf3]'}`}>
                  {texto}
                </button>
              ))}
            </div>
          </div>
        </div>

        {verTodo ? (
          <>
            {ORDEN_COMPLETO.map(b => <Fragment key={b}>{bloques[b]}</Fragment>)}
            {opciones}
          </>
        ) : (
          <>
            <div className={`dash-rol${ladoLateral.length ? '' : ' dash-rol--solo'}`}>
              <div className="dash-rol__principal">{diseno.principal.map(b => <Fragment key={b}>{bloques[b]}</Fragment>)}</div>
              {ladoLateral.length > 0 && <aside className="dash-rol__lateral" aria-label="Resumen y accesos">{ladoLateral.map(b => <Fragment key={b}>{bloques[b]}</Fragment>)}</aside>}
            </div>
            <details className="dash-mas" open={buscando ? true : undefined}>
              <summary><ChevronDown size={16} aria-hidden="true" /> Todas las opciones</summary>
              {opciones}
            </details>
          </>
        )}
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

            {informesHoy.filter(informe => estadoBorrador(informe) !== 'finalizado').map(informe => (
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
                  <span className="block text-xs text-gray-500 mt-0.5">{turnos.length > 1 ? 'Parte en blanco con la fecha de hoy. ¿De qué turno?' : 'Parte en blanco con la fecha de hoy.'}</span>
                </span>
              </div>
              <div className={turnos.length > 1 ? 'grid grid-cols-2 gap-2 mt-3' : 'mt-3'}>
                <button
                  type="button"
                  onClick={() => { setModalInformeOpen(false); onNuevoInforme('dia'); }}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-bold border border-[#DCE1E6] text-[#0E4660] hover:bg-[#f0f6fb]"
                >
                  <Sun size={15} /> Turno Día
                </button>
                {turnos.includes('noche') && (
                  <button
                    type="button"
                    onClick={() => { setModalInformeOpen(false); onNuevoInforme('noche'); }}
                    className="flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-bold bg-[#0E4660] text-white hover:bg-[#0a3549]"
                  >
                    <Moon size={15} /> Turno Noche
                  </button>
                )}
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
              <h2 className="text-lg font-bold text-[#0E4660]">{modalMant === 'preventiva' ? 'Mantención preventiva de sitio' : 'Mantenimiento de Generador'}</h2>
              <p className="text-sm text-gray-500 mt-1">Continúa un borrador guardado o crea uno nuevo.</p>
            </div>

            {borradoresModalMant.slice(0, 4).map(entry => (
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

            {borradoresModalMant.length > 4 && (
              <button
                type="button"
                onClick={() => { setModalMantenimientoOpen(false); onVerBorradores('mantenimiento'); }}
                className="text-xs font-bold text-[#0E4660] underline"
              >
                Ver los {borradoresModalMant.length} borradores guardados
              </button>
            )}

            <button
              type="button"
              onClick={() => { const tipo = modalMant; setModalMantenimientoOpen(false); if (tipo === 'preventiva') onNuevaPreventiva(); else onNuevoMantenimiento(); }}
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

            {borradoresFallaEnCurso.slice(0, 4).map(entry => (
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

            {borradoresFallaEnCurso.length > 4 && (
              <button
                type="button"
                onClick={() => { setModalFallaOpen(false); onVerBorradores('falla'); }}
                className="text-xs font-bold text-[#0E4660] underline"
              >
                Ver los {borradoresFallaEnCurso.length} borradores guardados
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

      {editorAccesos && (
        <EditorAccesosRapidos
          disponibles={disponibles}
          actuales={accesosVisibles}
          delRol={accesosRol}
          propios={elegidos !== null}
          nombreRol={ETIQUETA_ROL[rol]}
          onCerrar={() => setEditorAccesos(false)}
          onGuardar={guardarAccesos}
        />
      )}

      <div className="fixed bottom-1 left-1/2 -translate-x-1/2 text-[#F4F6F8] text-[10px] italic cursor-text whitespace-nowrap z-10 select-text">
      </div>
    </div>
  );
}