// Armado de la app: elige la pantalla según la ruta y mantiene las listas compartidas de borradores.
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';

import { Loader2 } from 'lucide-react';
import './App.css';

import Dashboard from '../pantallas/Dashboard';
import Borradores from '../pantallas/Borradores';

import { useSesion } from '../auth/sesion';
import { leerRuta, rutaDe, esTipoBorradores, esPestanaAdmin, NOMBRE_PANTALLA, type Vista, type TipoBorradores } from './rutas';
import { usePresencia } from '../lib/presencia';

import { type BorradorEntry, fetchBorradores, subscribeBorradores, deleteBorrador, deleteBorradores, esSemillaSinEditar, estadoBorrador } from '../datos/borradoresDiario';
import { type BorradorOtroEntry, fetchBorradoresOtros, subscribeBorradoresOtros, deleteBorradorOtro } from '../datos/borradoresOtros';
import { hoyLocalISO } from '../datos/fechas';

import { semanaDeFecha, letraDeFecha, TURNOS_AUTOMATICOS } from '../datos/turnos';

import { crearBorradorAutomatico } from '../informes/diario/constantes';
import { useInformeDiario } from '../informes/diario/useInformeDiario';
import InformeDiario from '../informes/diario/InformeDiario';
import BotonSubir from '../componentes/BotonSubir';

// Pantallas que no se usan al abrir la app: se descargan recién cuando se entra a ellas.
const InformeCierre = lazy(() => import('../informes/InformeCierre'));
const InformeMantenimiento = lazy(() => import('../informes/InformeMantenimiento'));
const InformeFallaCarro = lazy(() => import('../informes/InformeFallaCarro'));
const ImpresionRapida = lazy(() => import('../pantallas/ImpresionRapida'));
const PanelAdmin = lazy(() => import('../admin/PanelAdmin'));

const CargandoPantalla = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={
    <div className="min-h-screen flex items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 className="animate-spin" size={18} /> Cargando…
    </div>
  }>
    {children}
  </Suspense>
);

function AppContenido() {
  // Navegación del panel: menú principal, generador diario, borradores guardados e informe de cierre semanal.
  // La pantalla actual sale de la URL (ver src/rutas.ts): así funcionan "Atrás", recargar y los enlaces directos.
  const location = useLocation();

  const navigate = useNavigate();

  const ruta = useMemo(() => leerRuta(location.pathname), [location.pathname]);

  const view = ruta.vista;
  // Presencia: el Panel de administración ve quién está conectado y en qué pantalla.
  usePresencia(view ? NOMBRE_PANTALLA[view] : 'Panel principal');

  const vistaActualRef = useRef(view);

  useEffect(() => { vistaActualRef.current = view; }, [view]);

  const { esAdmin, division } = useSesion();

  // Pestaña (Día / Noche) que muestra la lista de Borradores; al volver desde un informe se deja la del turno de ese informe.
  const [borradoresTab, setBorradoresTab] = useState<'dia' | 'noche'>('dia');

  // Tipo de informe que muestra la pantalla de Borradores (Diario / Mantenimiento / Falla).
  const borradoresTipoTab: TipoBorradores = view === 'borradores' && esTipoBorradores(ruta.param) ? ruta.param : 'diario';

  const [borradores, setBorradores] = useState<BorradorEntry[]>([]);

  const borradoresRef = useRef<BorradorEntry[]>([]);

  useEffect(() => { borradoresRef.current = borradores; }, [borradores]);

  // Estado y lógica del Informe Diario (ver src/informes/diario/useInformeDiario.tsx).
  const diario = useInformeDiario({ view, setBorradores, borradoresRef, division });
  const { turno, currentDraftId, setCurrentDraftId, flushSyncRef, generarDocumento, showToast, startNewReport, cargarBorrador } = diario;

  /** Cambia de pantalla. Si se sale del Informe Diario, primero guarda lo pendiente. */
  const setView = useCallback((destino: Vista, param?: string | null) => {
    if (vistaActualRef.current === 'diario' && destino !== 'diario') flushSyncRef.current?.();
    navigate(rutaDe(destino, param));
  }, [navigate, flushSyncRef]);

  const [descargandoId, setDescargandoId] = useState<string | null>(null);

  // Borradores de Mantenimiento e Informe de Falla: mismo esquema de sincronización en la nube que Informe Diario.
  const [borradoresMantenimiento, setBorradoresMantenimiento] = useState<BorradorOtroEntry[]>([]);

  const [borradoresFalla, setBorradoresFalla] = useState<BorradorOtroEntry[]>([]);

  // Borrador puntual que se debe abrir al entrar a Mantenimiento/Falla (desde "Continuar" o desde Borradores). null = informe nuevo.
  const [mantenimientoAAbrir, setMantenimientoAAbrir] = useState<BorradorOtroEntry | null>(null);

  const [fallaAAbrir, setFallaAAbrir] = useState<BorradorOtroEntry | null>(null);

  // Cambia en cada "Nuevo informe" para forzar a Mantenimiento/Falla a remontarse con estado en blanco.
  const [mantenimientoInstancia, setMantenimientoInstancia] = useState(0);

  const [fallaInstancia, setFallaInstancia] = useState(0);

  // Carga los borradores compartidos desde la nube y se suscribe a cambios de otros dispositivos.
  useEffect(() => {
    void fetchBorradores(division).then(setBorradores);
    return subscribeBorradores(division, setBorradores);
  }, [division]);

  useEffect(() => {
    void fetchBorradoresOtros('mantenimiento', division).then(setBorradoresMantenimiento);
    return subscribeBorradoresOtros('mantenimiento', division, setBorradoresMantenimiento);
  }, [division]);

  useEffect(() => {
    void fetchBorradoresOtros('falla', division).then(setBorradoresFalla);
    return subscribeBorradoresOtros('falla', division, setBorradoresFalla);
  }, [division]);

  // Navegación: Mantenimiento / Falla — "Nuevo informe" o "Continuar" un borrador guardado.
  const goToNuevoMantenimiento = () => {
    setMantenimientoAAbrir(null);
    setMantenimientoInstancia(n => n + 1);
    setView('mantenimiento');
  };

  const goToAbrirMantenimiento = (entry: BorradorOtroEntry) => {
    setMantenimientoAAbrir(entry);
    setMantenimientoInstancia(n => n + 1);
    setView('mantenimiento', entry.id);
  };

  const goToNuevaFalla = () => {
    setFallaAAbrir(null);
    setFallaInstancia(n => n + 1);
    setView('falla-carro');
  };

  const goToAbrirFalla = (entry: BorradorOtroEntry) => {
    setFallaAAbrir(entry);
    setFallaInstancia(n => n + 1);
    setView('falla-carro', entry.id);
  };

  // Borrador indicado en la URL (/mantenimiento/:id, /falla/:id). Si se entró por enlace directo o se
  // recargó la página, se busca en la lista apenas llega de la nube.
  const borradorOtroDeRuta = (lista: BorradorOtroEntry[], abierto: BorradorOtroEntry | null) => {
    if (!ruta.param) return null;
    if (abierto?.id === ruta.param) return abierto;
    return lista.find(b => b.id === ruta.param) ?? null;
  };

  const mantenimientoDeRuta = view === 'mantenimiento' ? borradorOtroDeRuta(borradoresMantenimiento, mantenimientoAAbrir) : null;

  const fallaDeRuta = view === 'falla-carro' ? borradorOtroDeRuta(borradoresFalla, fallaAAbrir) : null;

  const handleDeleteBorradorOtro = (id: string) => {
    setBorradoresMantenimiento(prev => prev.filter(b => b.id !== id));
    setBorradoresFalla(prev => prev.filter(b => b.id !== id));
    deleteBorradorOtro(id).catch(error => {
      console.error("No se pudo eliminar el borrador en la nube:", error);
      showToast("No se pudo eliminar el borrador en la nube.", true);
    });
  };

  // Limpieza única: una versión anterior guardó en Supabase borradores vacíos por cada día del turno.
  // Ahora esos días se muestran como pendientes sin ocupar la base de datos, así que se eliminan los vacíos sin editar.
  useEffect(() => {
    fetchBorradores(division)
      .then(lista => {
        const sobrantes = lista.filter(esSemillaSinEditar).map(b => b.id);
        if (!sobrantes.length) return undefined;
        return deleteBorradores(sobrantes).then(() => fetchBorradores(division).then(setBorradores));
      })
      .catch(error => console.error("No se pudieron limpiar los borradores vacíos:", error));
  }, [division]);

  // Lista que ve el usuario: lo guardado en Supabase + los 7 días del turno que toca hoy (Día y Noche) que aún no tienen fotos.
  const hoy = hoyLocalISO();

  const borradoresVisibles = useMemo(() => {
    const semana = semanaDeFecha(hoy);
    const guardados = borradores.filter(b => !esSemillaSinEditar(b));
    const existentes = new Set(guardados.map(b => `${b.fecha}|${b.letraTurno}|${b.turno}`));
    const virtuales: BorradorEntry[] = [];
    semana.dias.forEach(fecha => {
      TURNOS_AUTOMATICOS.forEach(turno => {
        if (!existentes.has(`${fecha}|${semana.letra}|${turno}`)) virtuales.push(crearBorradorAutomatico(fecha, semana.letra, turno, division));
      });
    });
    return [...guardados, ...virtuales];
  }, [borradores, hoy, division]);

  // Informes de hoy (Día y Noche) del turno de trabajo (A o B) que corresponde; sirven para "Continuar" en el Panel.
  // No se asume Día o Noche según la hora: cada persona elige con cuál trabajar.
  const informesHoy = useMemo(() => {
    const letraHoy = letraDeFecha(hoy);
    return TURNOS_AUTOMATICOS
      .map(t => borradoresVisibles.find(b => b.fecha === hoy && b.letraTurno === letraHoy && b.turno === t))
      .filter((b): b is BorradorEntry => Boolean(b));
  }, [borradoresVisibles, hoy]);

  // Informes de esta semana de turno que ya les toca (hasta hoy, Día y Noche) y todavía no están finalizados (aviso del Panel).
  const informesPorCompletar = useMemo(() => {
    const semana = semanaDeFecha(hoy);
    return borradoresVisibles.filter(b => {
      const yaLeToca = b.fecha <= hoy;
      return b.fecha >= semana.inicio && yaLeToca && estadoBorrador(b) !== 'finalizado';
    }).length;
  }, [borradoresVisibles, hoy]);

  // Al salir del Informe Diario (con un botón o con "Atrás" del navegador/teléfono) se guarda al
  // instante lo pendiente, antes de que la pantalla cambie.
  useEffect(() => {
    const onPopState = () => { if (vistaActualRef.current === 'diario') flushSyncRef.current?.(); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [flushSyncRef]);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // Enlace directo o recarga en /informe-diario/:id: abre ese informe apenas llega la lista de borradores.
  const rutaDiarioAplicadaRef = useRef<string | null>(null);

  // Navegación: abre un borrador existente (de otro día) para revisarlo o continuarlo.
  const openBorradorEntry = (entrySeleccionada: BorradorEntry, navegar = true) => {
    rutaDiarioAplicadaRef.current = entrySeleccionada.id;
    cargarBorrador(entrySeleccionada);
    if (navegar) setView('diario', entrySeleccionada.id);
  };

  useEffect(() => {
    if (view !== 'diario' || !ruta.param || ruta.param === currentDraftId) return;
    if (rutaDiarioAplicadaRef.current === ruta.param) return;
    const entry = borradoresVisibles.find(b => b.id === ruta.param);
    if (!entry) return;
    rutaDiarioAplicadaRef.current = entry.id;
    // El formulario del Informe Diario vive en el estado de App: cargarlo desde la URL es sincronizar
    // con algo externo (la lista que llega de la nube), por eso se hace en un efecto.
    openBorradorEntry(entry, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, ruta.param, borradoresVisibles]);

  // Navegación: entra a "Generar Informe Diario" comenzando desde cero, con un nuevo borrador.
  const goToNewInforme = (turnoElegido?: 'dia' | 'noche') => {
    startNewReport(turnoElegido);
    const nuevoId = crypto.randomUUID();
    rutaDiarioAplicadaRef.current = nuevoId;
    setCurrentDraftId(nuevoId);
    setView('diario', nuevoId);
  };

  // Volver desde el Informe Diario: guarda lo pendiente y regresa a la lista de Borradores.
  const volverABorradores = () => {
    setBorradoresTab(turno);
    setView('borradores', 'diario');
  };

  const handleDeleteBorrador = (id: string) => {
    setBorradores(prev => prev.filter(b => b.id !== id));
    deleteBorrador(id).catch(error => {
      console.error("No se pudo eliminar el borrador en la nube:", error);
      showToast("No se pudo eliminar el borrador en la nube.", true);
    });
  };

  // Descarga el Word de un informe finalizado directamente desde la lista de Borradores.
  const descargarInforme = async (entry: BorradorEntry) => {
    if (descargandoId) return;
    setDescargandoId(entry.id);
    const ok = await generarDocumento(entry);
    setDescargandoId(null);
    if (!ok) window.alert("No se pudo generar el documento. Intenta nuevamente.");
  };

  if (view === 'dashboard') {
    return (
      <Dashboard
        borradorCount={borradores.filter(b => !esSemillaSinEditar(b)).length}
        pendientesCount={informesPorCompletar}
        informesHoy={informesHoy}
        onAbrirInforme={openBorradorEntry}
        onNuevoInforme={goToNewInforme}
        onNavigate={setView}
        borradoresMantenimiento={borradoresMantenimiento}
        borradoresFalla={borradoresFalla}
        onNuevoMantenimiento={goToNuevoMantenimiento}
        onAbrirMantenimiento={goToAbrirMantenimiento}
        onNuevaFalla={goToNuevaFalla}
        onAbrirFalla={goToAbrirFalla}
        onVerBorradores={tipo => setView('borradores', tipo)}
      />
    );
  }

  if (view === 'borradores') {
    return (
      <Borradores
        tipoTab={borradoresTipoTab}
        onTipoTabChange={tipo => navigate(rutaDe('borradores', tipo), { replace: true })}
        tab={borradoresTab}
        onTabChange={setBorradoresTab}
        borradores={borradoresVisibles}
        onOpen={openBorradorEntry}
        onDelete={handleDeleteBorrador}
        onBack={() => setView('dashboard')}
        onNew={goToNewInforme}
        onDownload={descargarInforme}
        descargandoId={descargandoId}
        borradoresMantenimiento={borradoresMantenimiento}
        borradoresFalla={borradoresFalla}
        onNuevoMantenimiento={goToNuevoMantenimiento}
        onAbrirMantenimiento={goToAbrirMantenimiento}
        onNuevaFalla={goToNuevaFalla}
        onAbrirFalla={goToAbrirFalla}
        onDeleteOtro={handleDeleteBorradorOtro}
      />
    );
  }

  if (view === 'cierre') {
    return <CargandoPantalla><InformeCierre onBack={() => setView('dashboard')} /></CargandoPantalla>;
  }

  if (view === 'mantenimiento') {
    return <CargandoPantalla><InformeMantenimiento key={`${mantenimientoInstancia}-${mantenimientoDeRuta?.id ?? 'nuevo'}`} onBack={() => setView('dashboard')} borradorInicial={mantenimientoDeRuta} /></CargandoPantalla>;
  }

  if (view === 'falla-carro') {
    return <CargandoPantalla><InformeFallaCarro key={`${fallaInstancia}-${fallaDeRuta?.id ?? 'nuevo'}`} onBack={() => setView('dashboard')} borradorInicial={fallaDeRuta} /></CargandoPantalla>;
  }

  if (view === 'impresion') {
    return <CargandoPantalla><ImpresionRapida onBack={() => setView('dashboard')} /></CargandoPantalla>;
  }

  if (view === 'admin' && esAdmin) {
    return (
      <CargandoPantalla>
        <PanelAdmin
          onBack={() => setView('dashboard')}
          pestana={esPestanaAdmin(ruta.param) ? ruta.param : 'resumen'}
          onPestanaChange={p => navigate(rutaDe('admin', p === 'resumen' ? null : p), { replace: true })}
        />
      </CargandoPantalla>
    );
  }

  // URL desconocida (o /admin sin permiso, o /login y /registro con la sesión ya iniciada): al panel principal.
  if (view !== 'diario') return <Navigate to="/" replace />;

  return <InformeDiario d={diario} volverABorradores={volverABorradores} goToNewInforme={goToNewInforme} />;
}

export default function App() {
  return (
    <>
      <AppContenido />
      <BotonSubir />
    </>
  );
}
