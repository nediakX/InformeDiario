import CuentaCabecera from '../../componentes/CuentaCabecera';
import { useEffect, useMemo, useState } from 'react';
import { saveAs } from 'file-saver';
import { ArrowLeft, ChevronLeft, ChevronRight, CircleCheckBig, Circle, Loader2, Presentation, RefreshCw } from 'lucide-react';
import logoPsinet from '../../assets/logo_psinet.png';
import logoEdificio from '../../assets/LogoEdificio.png';
import { fetchBorradores, subscribeBorradores, type BorradorEntry } from '../../datos/borradoresDiario';
import type { BorradorOtroEntry } from '../../datos/borradoresOtros';
import { formatDiaMes, formatFechaLarga, hoyLocalISO, sumarDias } from '../../datos/fechas';
import { semanaDeFecha } from '../../datos/turnos';
import { listarReportesGG, suscribirReportesGG, type ReporteGG } from '../../datos/reportesGG';
import { capturasGG } from './capturaGG';
import { useSesion } from '../../auth/sesion';
import { construirPresentacion, nombreArchivoPresentacion, textoInstalaciones, tituloInstalaciones } from './modelo';
import { generarPresentacionTurno } from './pptx';
import PresentacionFds from './PresentacionFds';
import { leerHorometros, leerReportesFds } from './datosFds';
import { fdsDeSemana, filasMantenimientoAl, mantenimientosGeneradorDe, sitiosConHorometro, type DatosAutoFds } from './modeloFds';
import { listarMantenimientoGG, suscribirMantenimientoGG, type FilaMantenimientoGG } from '../../datos/mantenimientoGG';
import type { Division } from '../../datos/divisiones';
import { HORAS_ENTRE_MANTENIMIENTOS, LIMITES_DESDE_ULTIMO, semaforoDesdeUltimo, semaforoFecha, type Semaforo } from '../../datos/indicadoresMantenimientoGG';

/** Turno completo (láminas del turno) o fin de semana (viernes a domingo). */
export type Modo = 'completo' | 'fds';

/** Lo que se leyó de la base para el fin de semana, con la clave de la división, la semana y la recarga a la que corresponde. */
interface LecturaFds {
  clave: string;
  datos: Pick<DatosAutoFds, 'reportesFds' | 'horometros'> | null;
  error: string | null;
}

/** Horómetros hasta el último día del turno (lámina 21), con la clave de la división, la semana y la recarga. */
interface LecturaHorasTurno {
  clave: string;
  /** null = no se pudieron leer (sin señal): quedan las horas escritas en la tabla. */
  horometros: DatosAutoFds['horometros'] | null;
}

const numeroCL = new Intl.NumberFormat('es-CL');
/** Colores del semáforo de la tabla de mantenimiento (los de la lámina). */
const CLASE_SEMAFORO: Record<Semaforo, string> = { verde: 'text-green-700', naranjo: 'text-amber-800', rojo: 'text-red-700' };
/** "2026-11-20" -> "20/11/26" */
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
/** Suma días a una fecha ISO (en UTC, sin horario de verano). */
const masDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

interface PresentacionTurnoProps {
  onBack: () => void;
  /** Pantalla que se abre primero (la ruta /presentacion-fin-de-semana abre el fin de semana). */
  modoInicial?: Modo;
  /** Mantenimientos de la app: los de generador alimentan la presentación de fin de semana. */
  borradoresMantenimiento: BorradorOtroEntry[];
}

/** Presentación del turno (solo DSAL): arma el .pptx del turno completo o del fin de semana, con el formato de las referencias. */
export default function PresentacionTurno({ onBack, modoInicial = 'completo', borradoresMantenimiento }: PresentacionTurnoProps) {
  const { division } = useSesion();
  const [borradores, setBorradores] = useState<BorradorEntry[]>([]);
  const [fechaSemana, setFechaSemana] = useState(() => hoyLocalISO());
  const [modo, setModo] = useState<Modo>(modoInicial);
  // Reportes de GG del fin de semana y horómetros: se leen de la base al entrar al fin de semana.
  const [lecturaFds, setLecturaFds] = useState<LecturaFds | null>(null);
  const [recargaFds, setRecargaFds] = useState(0);
  // Observaciones de Turno Noche editadas por semana (si no se editan, salen las de los informes).
  const [observacionesEditadas, setObservacionesEditadas] = useState<Record<string, string>>({});
  // Lámina 30: equipos con instalación de CPE, editables antes de generar (por semana).
  const [instalacionesEditadas, setInstalacionesEditadas] = useState<Record<string, string>>({});
  const [generando, setGenerando] = useState(false);
  // Avisos de la última presentación generada (fotos que no caben, fotos que no se pudieron preparar...).
  const [avisos, setAvisos] = useState<string[]>([]);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(null);
  // Reportes de GG de la semana (guardados en la app): cada día se incrusta como captura en la lámina de reportabilidad.
  const [reportesGG, setReportesGG] = useState<ReporteGG[]>([]);
  // Tabla de mantenimiento GG de la app (con la división a la que corresponde): manda en las tablas de mantenimiento
  // de las dos presentaciones, con el dato más nuevo hasta la fecha de corte.
  const [lecturaTabla, setLecturaTabla] = useState<{ division: Division; filas: FilaMantenimientoGG[] } | null>(null);
  const [lecturaHorasTurno, setLecturaHorasTurno] = useState<LecturaHorasTurno | null>(null);
  const [recargaTurno, setRecargaTurno] = useState(0);
  // Fecha de corte del fin de semana elegida en el formulario, por semana (las horas se leen hasta esa fecha).
  const [cortesFds, setCortesFds] = useState<Record<string, string>>({});

  const semana = useMemo(() => semanaDeFecha(fechaSemana), [fechaSemana]);
  const datos = useMemo(() => construirPresentacion(borradores, semana), [borradores, semana]);
  const fechasConGG = useMemo(() => new Set(reportesGG.map(r => r.fecha)), [reportesGG]);
  const textoObservaciones = observacionesEditadas[semana.inicio] ?? datos.observacionesNoche.join('\n');
  const textoEquiposInstalados = instalacionesEditadas[semana.inicio] ?? datos.instalaciones.join(', ');
  const equiposInstalados = textoEquiposInstalados.split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
  // null = la tabla todavía no se lee (si no se puede leer, queda vacía y mandan los informes y los reportes).
  const tablaMtto = lecturaTabla?.division === division ? lecturaTabla.filas : null;
  // Sitios cuyos horómetros se leen (los de la presentación y los que agregue la tabla), como texto para no releer por nada.
  const claveSitiosHoras = useMemo(() => sitiosConHorometro(tablaMtto ?? []).join('|'), [tablaMtto]);
  const corteFds = cortesFds[semana.inicio] || fdsDeSemana(semana).corte;
  // La clave identifica la división, la semana, el corte y la última recarga: si la lectura guardada no es de esa clave, todavía no llegó.
  const claveFds = `${division}|${semana.inicio}|${corteFds}|${recargaFds}|${claveSitiosHoras}`;
  const lectura = lecturaFds?.clave === claveFds ? lecturaFds : null;
  const cargandoFds = modo === 'fds' && (lectura === null || tablaMtto === null);
  const errorFds = lectura?.error ?? null;
  const mantenimientosFds = useMemo(() => mantenimientosGeneradorDe(borradoresMantenimiento), [borradoresMantenimiento]);
  const leidoFds = lectura?.datos ?? null;
  const autoFds = useMemo<DatosAutoFds>(() => ({
    reportesFds: leidoFds?.reportesFds ?? [],
    horometros: leidoFds?.horometros ?? {},
    mantenimientos: mantenimientosFds,
    tablaMantenimiento: tablaMtto ?? [],
  }), [leidoFds, mantenimientosFds, tablaMtto]);

  // Lámina 21 del turno: el dato más nuevo hasta el último día del turno.
  const claveHorasTurno = `${division}|${semana.fin}|${recargaTurno}|${claveSitiosHoras}`;
  const horasTurno = lecturaHorasTurno?.clave === claveHorasTurno ? lecturaHorasTurno : null;
  const cargandoMttoTurno = tablaMtto === null || horasTurno === null;
  const filasMttoTurno = useMemo(() => filasMantenimientoAl(semana.fin, {
    reportesFds: [],
    horometros: horasTurno?.horometros ?? {},
    mantenimientos: mantenimientosFds,
    tablaMantenimiento: tablaMtto ?? [],
  }), [semana.fin, horasTurno, mantenimientosFds, tablaMtto]);
  // Como en la lámina: de menos a más horas desde el último mantenimiento (sin el dato, al final).
  const vistaMttoTurno = useMemo(() => filasMttoTurno
    .map(f => ({
      ...f,
      proximo: f.horasUltimo === null ? null : f.horasUltimo + HORAS_ENTRE_MANTENIMIENTOS,
      estimada: f.fechaUltimo ? masDias(f.fechaUltimo, f.dias) : null,
      desde: f.horasUltimo === null || f.horasRegistradas === null ? null : f.horasRegistradas - f.horasUltimo,
    }))
    .sort((a, b) => (a.desde === null || b.desde === null
      ? Number(a.desde === null) - Number(b.desde === null)
      : a.desde - b.desde)), [filasMttoTurno]);
  const mttoEnRojo = vistaMttoTurno.filter(f => f.desde !== null && semaforoDesdeUltimo(f.desde) === 'rojo').length;

  useEffect(() => {
    void fetchBorradores(division).then(setBorradores);
    return subscribeBorradores(division, setBorradores);
  }, [division]);

  // Tabla de mantenimiento GG: se vuelve a leer cuando alguien la cambia (sin señal queda la copia de este equipo).
  useEffect(() => {
    let vigente = true;
    const cargar = () => listarMantenimientoGG(division)
      .then(({ filas }) => { if (vigente) setLecturaTabla({ division, filas }); })
      .catch(error => {
        console.error('No se pudo leer la Tabla de mantenimiento GG:', error);
        if (vigente) setLecturaTabla(previa => (previa?.division === division ? previa : { division, filas: [] }));
      });
    void cargar();
    const dejarDeEscuchar = suscribirMantenimientoGG(division, () => { void cargar(); });
    return () => { vigente = false; dejarDeEscuchar(); };
  }, [division]);

  // Horómetros hasta el último día del turno, para la vista previa de la lámina 21 (al generar se vuelven a leer).
  useEffect(() => {
    if (modo !== 'completo') return;
    let vigente = true;
    leerHorometros(division, semana.fin, claveSitiosHoras.split('|'))
      .then(horometros => { if (vigente) setLecturaHorasTurno({ clave: claveHorasTurno, horometros }); })
      .catch(error => {
        console.error('No se pudieron leer los horómetros de los reportes de GG:', error);
        if (vigente) setLecturaHorasTurno({ clave: claveHorasTurno, horometros: null });
      });
    return () => { vigente = false; };
  }, [modo, division, semana.fin, claveSitiosHoras, claveHorasTurno]);

  // Se vuelven a leer al cambiar la semana y cuando alguien guarda o corrige un reporte de GG.
  useEffect(() => {
    let vigente = true;
    const cargar = () => listarReportesGG({ division, desde: semana.inicio, hasta: semana.fin }, 0, 1000)
      .then(lista => { if (vigente) setReportesGG(lista); })
      .catch(error => console.error('No se pudieron leer los reportes de GG de la semana:', error));
    void cargar();
    const dejarDeEscuchar = suscribirReportesGG(division, () => { void cargar(); });
    return () => { vigente = false; dejarDeEscuchar(); };
  }, [division, semana.inicio, semana.fin]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Al entrar al fin de semana (y al cambiar de semana o de división) se leen de la base los reportes de GG y los horómetros.
  useEffect(() => {
    if (modo !== 'fds') return;
    let vigente = true;
    leerReportesFds(division, semana, claveSitiosHoras.split('|'), corteFds)
      .then(datos => { if (vigente) setLecturaFds({ clave: claveFds, datos, error: null }); })
      .catch(error => {
        console.error(error);
        if (vigente) {
          setLecturaFds({ clave: claveFds, datos: null, error: 'No se pudieron leer los reportes de GG de la base. Revisa la conexión y vuelve a intentar.' });
        }
      });
    return () => { vigente = false; };
  }, [modo, division, semana, claveFds, claveSitiosHoras, corteFds]);

  const hayInformes = datos.dias.some(d => d.tieneInforme);
  // Días con informe (o con Turno Noche) cuyo recuadro de reportabilidad GG queda sin foto.
  const sinFotoGG = datos.dias.filter(d => (d.tieneInforme || d.tieneNoche) && !d.fotoGG && !fechasConGG.has(d.fecha)).length;

  const generar = async () => {
    setGenerando(true);
    try {
      const observaciones = textoObservaciones.split('\n').map(s => s.trim()).filter(Boolean);
      // Reportabilidad de GG de cada día desde la app (lectura fresca al generar). Si un día no tiene reportes, queda la foto antigua del Turno Noche, si la hay.
      const reportes = await listarReportesGG({ division, desde: semana.inicio, hasta: semana.fin }, 0, 1000);
      const capturas = await capturasGG(reportes, division, semana.dias);
      const dias = datos.dias.map(d => ({ ...d, fotoGG: capturas[d.fecha] ?? d.fotoGG }));
      // Lámina 21: la tabla de mantenimiento y los horómetros, leídos de nuevo para que vaya el dato más nuevo.
      // Sin señal quedan los que ya se leyeron (la tabla, con la copia de este equipo).
      const tabla = await listarMantenimientoGG(division).then(t => t.filas).catch(() => tablaMtto ?? []);
      const horometros = await leerHorometros(division, datos.fin, sitiosConHorometro(tabla)).catch(() => horasTurno?.horometros ?? {});
      const mantenimientoGG = filasMantenimientoAl(datos.fin, { reportesFds: [], horometros, mantenimientos: mantenimientosFds, tablaMantenimiento: tabla });
      const { blob, avisos: nuevosAvisos } = await generarPresentacionTurno({ ...datos, dias, observacionesNoche: observaciones, mantenimientoGG, instalaciones: equiposInstalados });
      saveAs(blob, nombreArchivoPresentacion(datos));
      setAvisos(nuevosAvisos);
      setToast({ text: nuevosAvisos.length ? 'Presentación generada, revisa los avisos.' : 'Presentación generada.' });
    } catch (error) {
      console.error(error);
      setAvisos([]);
      setToast({ text: 'No se pudo generar la presentación. Revisa la conexión e intenta de nuevo.', isError: true });
    } finally {
      setGenerando(false);
    }
  };

  const botonModo = (valor: Modo, texto: string) => (
    <button
      type="button"
      aria-pressed={modo === valor}
      onClick={() => setModo(valor)}
      className={`px-3 py-1.5 font-bold ${modo === valor ? 'bg-[#0E4660] text-white' : 'bg-white text-[#0E4660]'}`}
    >
      {texto}
    </button>
  );

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
                {modo === 'completo'
                  ? 'Láminas del turno completo a partir de los Informes Diarios'
                  : 'Láminas del fin de semana (viernes a domingo)'}
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

      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1 text-sm font-bold text-[#0E4660]">
          <ArrowLeft size={16} /> Volver al panel
        </button>

        <section className="panel p-5">
          <div className="flex flex-wrap items-center gap-2">
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
          <div className="mt-3 inline-flex overflow-hidden rounded-md border border-[#0E4660] text-sm">
            {botonModo('completo', 'Turno completo')}
            {botonModo('fds', 'Fin de semana')}
          </div>
        </section>

        {/* Se mantienen montados al cambiar de modo para no perder lo que se editó. */}
        <div hidden={modo !== 'completo'} className="space-y-4">
          <section className="panel p-5">
            <div className="space-y-2">
              {datos.dias.map(dia => (
                <div key={dia.fecha} className={`flex flex-wrap items-center gap-x-4 gap-y-1 p-3 rounded-md border ${dia.tieneInforme ? 'border-[#0E4660] bg-[#E8F1FB]' : 'border-[#DCE1E6] bg-white'}`}>
                  {dia.tieneInforme ? <CircleCheckBig size={18} className="text-[#0E4660] flex-shrink-0" /> : <Circle size={18} className="text-gray-300 flex-shrink-0" />}
                  <span className="text-sm font-bold text-[#0E4660] min-w-[150px]">{formatFechaLarga(dia.fecha)}</span>
                  {dia.tieneInforme ? (
                    <span className="text-xs text-gray-600">
                      {dia.resumen.length} {dia.resumen.length === 1 ? 'actividad' : 'actividades'} · {dia.difusiones.length} {dia.difusiones.length === 1 ? 'difusión' : 'difusiones'}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">Sin Informe Diario de Turno Día.</span>
                  )}
                  {(dia.tieneInforme || dia.tieneNoche) && (
                    <span className="text-xs text-gray-600">
                      {fechasConGG.has(dia.fecha) ? '· reportabilidad GG desde la app' : dia.fotoGG ? '· reportabilidad GG con foto (Turno Noche)' : '· sin reportabilidad GG'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Se generan: portada, resumen de Turno Día y Turno Noche, reportabilidad GG (captura de los reportes de cada día guardados en la app), una lámina de difusiones por día, el estado de mantenimiento de GG y las instalaciones de CPE.
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
            <label htmlFor="instalaciones-cpe" className="block text-sm font-bold text-[#0E4660] mb-1">Instalaciones de CPE (lámina 30)</label>
            <p className="text-xs text-gray-500 mb-2">Equipos donde se instaló CPE en el turno, separados por coma. Salen de los Informes Diarios; puedes corregirlos antes de generar.</p>
            <input
              id="instalaciones-cpe"
              value={textoEquiposInstalados}
              onChange={e => setInstalacionesEditadas(prev => ({ ...prev, [semana.inicio]: e.target.value }))}
              placeholder="Ej: CAEX 140, CAEX 142"
              className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
            />
            <p className="text-xs text-gray-600 mt-2">
              En la lámina: <strong>{equiposInstalados.length ? `${tituloInstalaciones(equiposInstalados)} ${textoInstalaciones(equiposInstalados)}` : 'SIN INSTALACIONES'}</strong>
            </p>
            {!equiposInstalados.length && datos.instalacionesSinEquipo.length > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mt-2">
                Los informes mencionan una instalación de CPE sin número de equipo («{datos.instalacionesSinEquipo[0]}»): escribe el equipo arriba para que salga en la lámina.
              </p>
            )}
          </section>

          <section className="panel p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display font-bold text-[#0E4660] text-base">Estado de mantenimiento de GG (lámina 21)</h3>
              <button
                type="button"
                onClick={() => setRecargaTurno(n => n + 1)}
                disabled={cargandoMttoTurno}
                className="inline-flex items-center gap-1 text-xs font-bold text-[#0E4660] underline disabled:opacity-50"
              >
                <RefreshCw size={13} /> Actualizar
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Sale de la Tabla de mantenimiento GG, de los informes de mantenimiento y de los reportes de GG: el dato más nuevo hasta el {formatFechaLarga(semana.fin)}.
            </p>
            {cargandoMttoTurno ? (
              <p className="text-xs text-[#0E4660] flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" /> Leyendo la tabla de mantenimiento y los horómetros…
              </p>
            ) : (
              <>
                {horasTurno?.horometros === null && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                    No se pudieron leer los reportes de GG (sin señal): las horas registradas salen de la tabla. Al generar se intenta de nuevo.
                  </p>
                )}
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs font-bold text-[#0E4660]">
                    Ver los {vistaMttoTurno.length} generadores{mttoEnRojo ? ` · ${mttoEnRojo} con ${LIMITES_DESDE_ULTIMO.rojoDesde} h o más desde el último mantenimiento` : ''}
                  </summary>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-left text-[#0E4660] border-b border-[#DCE1E6]">
                          <th className="py-2 pr-3 font-bold">Generador</th>
                          <th className="py-2 pr-3 font-bold text-right">Último mto.</th>
                          {/* En el celular se omite (es el último + 250): así caben las horas desde el último sin desplazar. */}
                          <th className="hidden sm:table-cell py-2 pr-3 font-bold text-right">Próximo</th>
                          <th className="py-2 pr-3 font-bold text-right">Horas al {fechaCorta(semana.fin)}</th>
                          <th className="py-2 font-bold text-right">Desde el último</th>
                        </tr>
                      </thead>
                      <tbody>
                        {vistaMttoTurno.map(f => (
                          <tr key={f.sitio} className={`border-b border-[#eef1f4] align-top ${f.desde === null ? 'bg-amber-50' : ''}`}>
                            <td className="py-1.5 pr-3">
                              <span className="block font-mono">{f.sitio}</span>
                              <span className="block text-gray-500">{f.nombre}</span>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">
                              {f.horasUltimo === null ? '—' : numeroCL.format(f.horasUltimo)}
                              <span className="block text-gray-500">{f.fechaUltimo ? fechaCorta(f.fechaUltimo) : '—'}</span>
                            </td>
                            <td className="hidden sm:table-cell py-1.5 pr-3 text-right tabular-nums">
                              {f.proximo === null ? '—' : numeroCL.format(f.proximo)}
                              <span className={`block ${f.estimada && semaforoFecha(f.estimada, semana.fin) !== 'verde' ? `font-bold ${CLASE_SEMAFORO[semaforoFecha(f.estimada, semana.fin)]}` : 'text-gray-500'}`}>
                                {f.estimada ? fechaCorta(f.estimada) : '—'}
                              </span>
                            </td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{f.horasRegistradas === null ? '—' : numeroCL.format(f.horasRegistradas)}</td>
                            <td className={`py-1.5 text-right tabular-nums font-bold ${f.desde === null ? '' : CLASE_SEMAFORO[semaforoDesdeUltimo(f.desde)]}`}>
                              {f.desde === null ? '—' : `${numeroCL.format(f.desde)} h`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
          </section>

          <section className="panel p-5">
            {!hayInformes && (
              <p className="text-sm text-gray-500 mb-3">Esta semana de turno no tiene Informes Diarios de Turno Día todavía.</p>
            )}
            {hayInformes && sinFotoGG > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2 mb-3">
                {sinFotoGG === 1 ? 'Un día no tiene' : `${sinFotoGG} días no tienen`} reportabilidad GG registrada en la app; su recuadro quedará marcado como “sin foto” para completarlo a mano.
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
            {avisos.length > 0 && (
              <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-md p-2 mt-3">
                <p className="font-bold mb-1">Revisa antes de presentar:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {avisos.map((aviso, i) => <li key={i}>{aviso}</li>)}
                </ul>
              </div>
            )}
          </section>
        </div>

        <div hidden={modo !== 'fds'}>
          <PresentacionFds
            semana={semana}
            borradores={borradores}
            auto={autoFds}
            cargando={cargandoFds}
            errorDatos={errorFds}
            onActualizar={() => setRecargaFds(n => n + 1)}
            onCambiarCorte={corte => setCortesFds(previos => ({ ...previos, [semana.inicio]: corte }))}
          />
        </div>
      </main>

      {toast && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toast.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toast.text}
        </div>
      )}
    </div>
  );
}
