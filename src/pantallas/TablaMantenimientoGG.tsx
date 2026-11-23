// Tabla de mantenimiento de generadores (la planilla Excel "Datos GG Generadores", ahora en la app):
//  - Mantenimiento: los indicadores de la planilla (próximo, faltan, desde el último, fecha estimada,
//    fecha por año, status), editables celda por celda.
//  - Cambio de correa: horas y fecha del último cambio y cuándo toca el próximo (cada 1.500 h).
//  - Reportabilidad: el último reporte de GG de cada generador, sus alertas y los últimos reportes.
//  - Reporte de GG: el reporte de GG de un día (combustible, refrigerante, aceite, temperatura, horómetro, partidas).
// Las horas actuales salen solas del último reporte de GG (o de lo que se escriba aquí, si es más nuevo).
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, CloudOff, DatabaseZap, Download, Loader2, TriangleAlert } from 'lucide-react';
import { saveAs } from 'file-saver';
import CuentaCabecera from '../componentes/CuentaCabecera';
import logoPsinet from '../assets/logo_psinet.png';
import logoEdificio from '../assets/LogoEdificio.png';
import { useSesion } from '../auth/sesion';
import { configDivision } from '../datos/divisiones';
import { formatFechaLarga, hoyLocalISO, nombreDiaSemana, sumarDias } from '../datos/fechas';
import { registrarDeshacer } from '../lib/deshacer';
import { esErrorDeRed } from '../lib/conexion';
import { crearLibroExcel, type ColoresColumna, type HojaExcel } from '../lib/excel';
import {
  descartarPendienteMantenimientoGG, guardarCambiosMantenimientoGG, listarMantenimientoGG, sincronizarMantenimientoGG,
  suscribirMantenimientoGG, usePendientesMantenimientoGG, type CambiosMantenimientoGG, type FilaMantenimientoGG, type TablaMantenimientoCargada,
} from '../datos/mantenimientoGG';
import {
  AVISO_DIAS, AVISO_HORAS_CORREA, AVISO_HORAS_MANTENIMIENTO, HORAS_ENTRE_CAMBIOS_CORREA, HORAS_ENTRE_MANTENIMIENTOS, LIMITES_DESDE_ULTIMO,
  contarEstados, horasActuales, indicadoresCorrea, indicadoresMantenimiento, ultimoConHorometro, type Vencimiento,
} from '../datos/indicadoresMantenimientoGG';
import { TEMP_ATENCION, TEMP_CRITICA, type EstadoGG } from '../datos/analisisGG';
import PestanaMantenimiento from './mantenimientoGG/PestanaMantenimiento';
import PestanaCorrea from './mantenimientoGG/PestanaCorrea';
import PestanaReportes from './mantenimientoGG/PestanaReportes';
import PestanaReporteGG from './mantenimientoGG/PestanaReporteGG';
import DialogoRegistro from './mantenimientoGG/DialogoRegistro';
import { useAnalisisGG } from './mantenimientoGG/useAnalisisGG';
import {
  ETIQUETA_ESTADO, NOMBRE_REFRIGERANTE, cuandoLectura, estadoNiveles, fmtFecha, fmtHoras, reporteDelDia,
  type EquipoCalculado, type EstadoGuardado, type TipoRegistro,
} from './mantenimientoGG/formato';
import './mantenimientoGG/mantenimientoGG.css';

type Pestana = 'mantenimiento' | 'correa' | 'reportes' | 'reporte';
const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: 'mantenimiento', titulo: 'Mantenimiento' },
  { id: 'correa', titulo: 'Cambio de correa' },
  { id: 'reportes', titulo: 'Reportabilidad' },
  { id: 'reporte', titulo: 'Reporte de GG' },
];
const CLAVE_PESTANA = 'psinet_mtto_gg_pestana';
const leerPestana = (): Pestana => {
  try {
    const p = localStorage.getItem(CLAVE_PESTANA);
    return p === 'correa' || p === 'reportes' || p === 'reporte' ? p : 'mantenimiento';
  } catch { return 'mantenimiento'; }
};
/** Días hacia atrás que se pueden ver en el Reporte de GG (los que trae la Reportabilidad). */
const DIAS_REPORTES = 30;

/** Estado de la Reportabilidad en los mismos colores que los vencimientos. */
const COLOR_GG: Record<EstadoGG, Vencimiento> = { critico: 'vencido', atencion: 'proximo', ok: 'al_dia', sin_datos: 'sin_datos' };
const estadoReportes = (e: EquipoCalculado): Vencimiento => (e.gg ? COLOR_GG[e.gg.estado] : 'sin_datos');
const ESTADO_DE: Record<Exclude<Pestana, 'reporte'>, (e: EquipoCalculado) => Vencimiento> = {
  mantenimiento: e => e.mtto.estado,
  correa: e => e.correa.estado,
  reportes: estadoReportes,
};
/** Texto de los filtros de cada pestaña ("2 vencidos", "1 en atención"…). */
const FILTROS: Record<Pestana, Record<Vencimiento, [string, string]>> = {
  mantenimiento: { vencido: ['vencido', 'vencidos'], proximo: ['próximo', 'próximos'], al_dia: ['al día', 'al día'], sin_datos: ['sin datos', 'sin datos'] },
  correa: { vencido: ['vencido', 'vencidos'], proximo: ['próximo', 'próximos'], al_dia: ['al día', 'al día'], sin_datos: ['sin datos', 'sin datos'] },
  reportes: { vencido: ['crítico', 'críticos'], proximo: ['en atención', 'en atención'], al_dia: ['normal', 'normales'], sin_datos: ['sin reportes', 'sin reportes'] },
  reporte: { vencido: ['nivel crítico', 'niveles críticos'], proximo: ['por revisar', 'por revisar'], al_dia: ['normal', 'normales'], sin_datos: ['sin reporte', 'sin reporte'] },
};
const ORDEN_FILTROS: Vencimiento[] = ['vencido', 'proximo', 'al_dia', 'sin_datos'];

/** "Reporte 20-11-2026 09:12 (Max Diaz)" para el Excel. */
const lecturaParaExcel = (e: EquipoCalculado) => {
  const l = e.actuales;
  if (!l) return '';
  const cuando = [l.fecha ? fmtFecha(l.fecha) : '', l.hora ?? ''].filter(Boolean).join(' ');
  return `${l.fuente === 'reporte' ? 'Reporte' : 'Escrita en la tabla'}${cuando ? ` ${cuando}` : ''}${l.reporta ? ` (${l.reporta})` : ''}`;
};

export default function TablaMantenimientoGG({ onBack }: { onBack: () => void }) {
  const { division } = useSesion();
  const hoy = hoyLocalISO();
  const [tabla, setTabla] = useState<TablaMantenimientoCargada | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [pestana, setPestana] = useState<Pestana>(leerPestana);
  // Día del Reporte de GG (null = el más reciente con reportes).
  const [fechaReporte, setFechaReporte] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Vencimiento | null>(null);
  const [guardados, setGuardados] = useState<Record<string, EstadoGuardado>>({});
  const [registro, setRegistro] = useState<{ tipo: TipoRegistro; sitio: string } | null>(null);
  const [descargando, setDescargando] = useState(false);
  const [avisoExcel, setAvisoExcel] = useState('');
  const pendientes = usePendientesMantenimientoGG(division);
  const { analisis, error: errorReportes } = useAnalisisGG(division);
  // Guardados en curso: si llega un cambio de otra persona mientras tanto, se recarga al terminar
  // (así una recarga no muestra por un momento el valor anterior de lo que se está guardando).
  const enCurso = useRef(0);
  const recargarAlTerminar = useRef(false);

  useEffect(() => {
    let vivo = true;
    listarMantenimientoGG(division)
      .then(t => { if (vivo) { setTabla(t); setError(''); } })
      .catch(e => {
        if (!vivo) return;
        setError(esErrorDeRed(e)
          ? 'Sin conexión: esta tabla todavía no se ha abierto con señal en este equipo. Ábrela una vez con conexión para tenerla también sin señal.'
          : 'No se pudo cargar la tabla. ¿Ya se creó la tabla mantenimiento_gg en Supabase?');
      });
    return () => { vivo = false; };
  }, [division, version]);

  // Cambios de otras personas (se ven al instante) y cambios que quedaron sin subir por falta de señal.
  useEffect(() => suscribirMantenimientoGG(division, () => {
    if (enCurso.current) recargarAlTerminar.current = true;
    else setVersion(v => v + 1);
  }), [division]);
  useEffect(() => { void sincronizarMantenimientoGG(); }, []);

  const guardar = useCallback((sitio: string, cambios: CambiosMantenimientoGG) => {
    setTabla(t => t && { ...t, filas: t.filas.map(f => (f.sitio === sitio ? { ...f, ...cambios } : f)) });
    setGuardados(g => ({ ...g, [sitio]: 'guardando' }));
    enCurso.current += 1;
    guardarCambiosMantenimientoGG(division, sitio, cambios)
      .then(r => {
        setGuardados(g => ({ ...g, [sitio]: r }));
        if (r === 'falta_bd') setTabla(t => t && { ...t, faltaActualizarBD: true });
      })
      .catch(error => {
        console.error('No se pudo guardar la tabla de mantenimiento GG:', error);
        setGuardados(g => ({ ...g, [sitio]: 'error' }));
        recargarAlTerminar.current = true; // vuelve a mostrar lo que de verdad quedó guardado
      })
      .finally(() => {
        enCurso.current -= 1;
        if (!enCurso.current && recargarAlTerminar.current) {
          recargarAlTerminar.current = false;
          setVersion(v => v + 1);
        }
      });
  }, [division]);

  const abrirRegistro = useCallback((tipo: TipoRegistro, sitio: string) => setRegistro({ tipo, sitio }), []);
  const cerrarRegistro = useCallback(() => setRegistro(null), []);
  const acciones = useMemo(() => ({ guardar, registrar: abrirRegistro }), [guardar, abrirRegistro]);

  // Cada equipo con sus horas actuales (último reporte o lo escrito, lo más nuevo) y sus indicadores.
  const equipos = useMemo<EquipoCalculado[]>(() => (tabla?.filas ?? []).map(fila => {
    const gg = analisis?.porSitio.get(fila.sitio) ?? null;
    const actuales = horasActuales(fila, gg ? ultimoConHorometro(gg.serie) : null);
    const ritmo = gg?.ritmoHorasDia ?? null;
    return { fila, gg, actuales, ritmo, mtto: indicadoresMantenimiento(fila, actuales, hoy, ritmo), correa: indicadoresCorrea(fila, actuales, hoy, ritmo) };
  }), [tabla, analisis, hoy]);

  // Reporte de GG: días con reportes (los últimos 30) y el día que se está viendo.
  const fechasConReporte = useMemo(() => {
    const fechas = new Set<string>();
    for (const s of analisis?.porSitio.values() ?? []) for (const r of s.serie) fechas.add(r.fecha);
    return [...fechas].sort();
  }, [analisis]);
  const fechaDelReporte = fechaReporte ?? fechasConReporte[fechasConReporte.length - 1] ?? hoy;
  const diaAnterior = [...fechasConReporte].reverse().find(f => f < fechaDelReporte) ?? null;
  const diaSiguiente = fechasConReporte.find(f => f > fechaDelReporte) ?? null;
  const reportaronEseDia = equipos.filter(e => reporteDelDia(e.gg, fechaDelReporte)).length;

  const estadoEn = useCallback((p: Pestana, e: EquipoCalculado): Vencimiento =>
    (p === 'reporte' ? estadoNiveles(reporteDelDia(e.gg, fechaDelReporte)) : ESTADO_DE[p](e)), [fechaDelReporte]);
  const conteos = useMemo(() => ({
    mantenimiento: contarEstados(equipos.map(e => estadoEn('mantenimiento', e))),
    correa: contarEstados(equipos.map(e => estadoEn('correa', e))),
    reportes: contarEstados(equipos.map(e => estadoEn('reportes', e))),
    reporte: contarEstados(equipos.map(e => estadoEn('reporte', e))),
  }), [equipos, estadoEn]);
  const conteo = conteos[pestana];
  // Si después de un cambio ya no queda ninguno en el estado elegido, se vuelve a ver todos.
  const filtroActivo = filtro && conteo[filtro] > 0 ? filtro : null;
  const visibles = filtroActivo ? equipos.filter(e => estadoEn(pestana, e) === filtroActivo) : equipos;
  const reportesListos = !!analisis;
  // "Sin señal" deja de mostrarse en el equipo apenas su cambio sube.
  const guardadosVisibles = useMemo(() => {
    const enCola = new Set(pendientes.map(p => p.sitio));
    return Object.fromEntries(Object.entries(guardados).map(([sitio, e]) => [sitio, e === 'pendiente' && !enCola.has(sitio) ? 'guardado' : e])) as Record<string, EstadoGuardado>;
  }, [guardados, pendientes]);

  const cambiarPestana = (p: Pestana) => {
    setPestana(p);
    setFiltro(null);
    try { localStorage.setItem(CLAVE_PESTANA, p); } catch { /* sin almacenamiento */ }
  };
  // Flechas izquierda/derecha entre pestañas (como en cualquier lista de pestañas).
  const alTeclearPestanas = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = PESTANAS.findIndex(p => p.id === pestana);
    const siguiente = PESTANAS[(i + (e.key === 'ArrowRight' ? 1 : PESTANAS.length - 1)) % PESTANAS.length].id;
    cambiarPestana(siguiente);
    document.getElementById(`mgg-pestana-${siguiente}`)?.focus();
  };

  const confirmarRegistro = (cambios: CambiosMantenimientoGG) => {
    const pedido = registro;
    const equipo = pedido && equipos.find(x => x.fila.sitio === pedido.sitio);
    if (!pedido || !equipo) return;
    const anteriores = Object.fromEntries(Object.keys(cambios).map(k => [k, equipo.fila[k as keyof FilaMantenimientoGG]])) as CambiosMantenimientoGG;
    guardar(pedido.sitio, cambios);
    setRegistro(null);
    const nombre = equipo.fila.nombre || equipo.fila.sitio;
    registrarDeshacer(
      pedido.tipo === 'mantenimiento' ? `Mantenimiento registrado: ${nombre}` : `Cambio de correa registrado: ${nombre}`,
      () => guardar(pedido.sitio, anteriores),
    );
  };

  const descargarExcel = async () => {
    setDescargando(true);
    setAvisoExcel('');
    // Colores como en la planilla Datos GG (formato condicional: se recalculan con la fecha del día en que se abre).
    const porFecha = (columna: number): ColoresColumna => ({ columna, reglas: [
      { si: '{c}<TODAY()', color: 'rojo' }, { si: `{c}<=TODAY()+${AVISO_DIAS}`, color: 'naranjo' }, { si: 'TRUE', color: 'verde' },
    ] });
    const porEstado = (columna: number): ColoresColumna => ({ columna, reglas: [
      { si: `{c}="${ETIQUETA_ESTADO.vencido}"`, color: 'rojo' }, { si: `{c}="${ETIQUETA_ESTADO.proximo}"`, color: 'naranjo' },
      { si: `{c}="${ETIQUETA_ESTADO.al_dia}"`, color: 'verde' },
    ] });
    try {
      const mtto: HojaExcel = {
        nombre: 'Mantenimiento GG',
        columnas: [
          { titulo: 'Sitio', tipo: 'texto', ancho: 17 }, { titulo: 'Nombre del Equipo', tipo: 'texto', ancho: 22 },
          { titulo: 'Último Mantenimiento (hrs)', tipo: 'numero', ancho: 13 }, { titulo: 'Fecha Último Mantenimiento', tipo: 'fecha', ancho: 14 },
          { titulo: 'STATUS MMTTO', tipo: 'porcentaje', ancho: 10 }, { titulo: 'Próximo Mantenimiento (hrs)', tipo: 'numero', ancho: 13 },
          { titulo: 'Horas de Mantenimiento', tipo: 'numero', ancho: 12 }, { titulo: 'Días de mantenimiento', tipo: 'numero', ancho: 12 },
          { titulo: 'Fecha Estimada Próximo Mantenimiento', tipo: 'fecha', ancho: 16 }, { titulo: 'Fecha Mantenimiento Por Año', tipo: 'fecha', ancho: 15 },
          { titulo: 'Nivel de refrigerante', tipo: 'texto', ancho: 12 }, { titulo: `Horas Registradas al ${fmtFecha(hoy)}`, tipo: 'numero', ancho: 14 },
          { titulo: 'Lectura de las horas', tipo: 'texto', ancho: 34 }, { titulo: 'Horas restantes para el próximo MTTO', tipo: 'numero', ancho: 15 },
          { titulo: 'Horas desde Último Mantenimiento', tipo: 'numero', ancho: 15 }, { titulo: 'status', tipo: 'numero', ancho: 9 },
          { titulo: 'Estado', tipo: 'texto', ancho: 11 }, { titulo: 'Llega a las 250 h (aprox.)', tipo: 'fecha', ancho: 14 },
        ],
        filas: equipos.map(e => {
          const { fila: f, mtto: m } = e;
          return [
            f.sitio, f.nombre, f.ultimoHoras, f.ultimoFecha, f.statusPct / 100, m.proximoHoras, HORAS_ENTRE_MANTENIMIENTOS, f.cicloDias,
            m.fechaEstimada, m.fechaAnual, NOMBRE_REFRIGERANTE[f.refrigerante ?? ''] ?? f.refrigerante, e.actuales?.valor ?? null,
            lecturaParaExcel(e), m.faltanHoras, m.desdeUltimo, m.desdeUltimo === null ? null : m.desdeUltimo - HORAS_ENTRE_MANTENIMIENTOS,
            ETIQUETA_ESTADO[m.estado], m.fechaPorHoras,
          ];
        }),
        colores: [
          { columna: 4, reglas: [{ si: '{c}<=0', color: 'rojo' }, { si: '{c}<1', color: 'naranjo' }, { si: 'TRUE', color: 'verde' }] },
          porFecha(8),
          porFecha(9),
          { columna: 13, reglas: [{ si: '{c}<=50', color: 'rojoTexto' }, { si: 'TRUE', color: 'verdeTexto' }] },
          { columna: 14, reglas: [
            { si: `{c}>=${LIMITES_DESDE_ULTIMO.rojoDesde}`, color: 'rojo' }, { si: `{c}>${LIMITES_DESDE_ULTIMO.verdeHasta}`, color: 'naranjo' },
            { si: 'TRUE', color: 'verde' },
          ] },
          porEstado(16),
        ],
      };
      const correa: HojaExcel = {
        nombre: 'Cambio de correa',
        columnas: [
          { titulo: 'Sitio', tipo: 'texto', ancho: 17 }, { titulo: 'Nombre del Equipo', tipo: 'texto', ancho: 22 },
          { titulo: 'Horas del Último Cambio de Correa', tipo: 'numero', ancho: 15 }, { titulo: 'Último Cambio de correa (Fecha)', tipo: 'fecha', ancho: 15 },
          { titulo: 'Próximo Cambio de correa (Horas)', tipo: 'numero', ancho: 15 }, { titulo: 'Horas Registradas', tipo: 'numero', ancho: 12 },
          { titulo: 'Horas restantes para el cambio', tipo: 'numero', ancho: 14 }, { titulo: 'Horas desde el último cambio', tipo: 'numero', ancho: 14 },
          { titulo: 'Estado', tipo: 'texto', ancho: 11 },
        ],
        filas: equipos.map(e => [
          e.fila.sitio, e.fila.nombre, e.fila.correaHoras, e.fila.correaFecha, e.correa.proximoHoras, e.actuales?.valor ?? null,
          e.correa.faltanHoras, e.correa.desdeUltimo, ETIQUETA_ESTADO[e.correa.estado],
        ]),
        colores: [
          { columna: 6, reglas: [{ si: '{c}<=0', color: 'rojo' }, { si: `{c}<=${AVISO_HORAS_CORREA}`, color: 'naranjo' }, { si: 'TRUE', color: 'verde' }] },
          porEstado(8),
        ],
      };
      const reportes: HojaExcel = {
        nombre: 'Último reporte GG',
        columnas: [
          { titulo: 'Sitio', tipo: 'texto', ancho: 17 }, { titulo: 'Nombre del Equipo', tipo: 'texto', ancho: 22 },
          { titulo: 'Fecha', tipo: 'fecha', ancho: 12 }, { titulo: 'Hora', tipo: 'hora', ancho: 8 },
          { titulo: 'P Q REPORTA', tipo: 'texto', ancho: 20 }, { titulo: 'TURNO', tipo: 'texto', ancho: 10 },
          { titulo: 'Horómetro', tipo: 'numero', ancho: 11 }, { titulo: 'Uso diario (h/día)', tipo: 'numero', ancho: 11 },
          { titulo: 'Nro Partidas', tipo: 'numero', ancho: 11 }, { titulo: 'Combustible', tipo: 'texto', ancho: 11 },
          { titulo: 'Nivel de Refrigerante', tipo: 'texto', ancho: 13 }, { titulo: 'Nivel de Aceite', tipo: 'texto', ancho: 13 },
          { titulo: 'Temperatura del Generador', tipo: 'numero', ancho: 13 }, { titulo: 'Estado', tipo: 'texto', ancho: 12 },
          { titulo: 'Alertas', tipo: 'texto', ancho: 40 }, { titulo: 'Observaciones', tipo: 'texto', ancho: 40 },
        ],
        filas: equipos.map(e => {
          const u = e.gg?.ultimo ?? null;
          return [
            e.fila.sitio, e.fila.nombre, u?.fecha, u?.hora, u?.reporta, u?.turno, u?.horometro ?? null,
            e.ritmo === null ? null : Math.round(e.ritmo * 10) / 10, u?.nroPartidas ?? null, u?.combustible, u?.nivelRefrigerante,
            u?.nivelAceite, u?.temperatura ?? null, e.gg ? { critico: 'Crítico', atencion: 'Atención', ok: 'Normal', sin_datos: 'Sin reportes' }[e.gg.estado] : 'Sin reportes',
            (e.gg?.alertas ?? []).map(a => a.titulo).join(' · '), u?.observaciones,
          ];
        }),
        // Los mismos colores de la pestaña Reportabilidad.
        colores: [
          { columna: 9, reglas: [{ si: '{c}="1/4"', color: 'rojo' }] },
          { columna: 10, reglas: [{ si: '{c}="Minimo"', color: 'naranjo' }] },
          { columna: 11, reglas: [{ si: '{c}="Bajo"', color: 'rojo' }, { si: '{c}="Sobre Relleno"', color: 'naranjo' }] },
          { columna: 12, reglas: [{ si: `{c}>=${TEMP_CRITICA}`, color: 'rojo' }, { si: `{c}>=${TEMP_ATENCION}`, color: 'naranjo' }] },
          { columna: 13, reglas: [{ si: '{c}="Crítico"', color: 'rojo' }, { si: '{c}="Atención"', color: 'naranjo' }, { si: '{c}="Normal"', color: 'verde' }] },
        ],
      };
      saveAs(await crearLibroExcel([mtto, correa, reportes]), `Mantenimiento_GG_${hoy}.xlsx`);
    } catch (error) {
      console.error('No se pudo generar el Excel de mantenimiento GG:', error);
      setAvisoExcel('No se pudo generar el Excel.');
    } finally {
      setDescargando(false);
    }
  };

  const rechazados = pendientes.filter(p => p.rechazo);
  const equipoRegistro = registro ? equipos.find(e => e.fila.sitio === registro.sitio) : undefined;
  const copiaTabla = tabla?.copiaDel ?? null;
  const copiaReportes = analisis?.copiaDel ?? null;
  const cuandoCopia = (iso: string) => { const d = new Date(iso); return cuandoLectura({ fecha: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, hora: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }); };

  return (
    <div className="min-h-screen pb-16">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Tabla de mantenimiento GG</div>
              <div className="site-header__meta text-xs truncate">{configDivision(division).sigla} / Mantenimiento, correa y reportes de los generadores</div>
            </div>
          </div>
          <CuentaCabecera />
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="mgg-main mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <button type="button" onClick={() => void descargarExcel()} disabled={!equipos.length || descargando}
            className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5 disabled:opacity-50">
            {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar Excel
          </button>
        </div>
        {avisoExcel && <p className="mgg-aviso mgg-aviso--error" role="alert">{avisoExcel}</p>}

        <section className="panel mgg-panel" aria-labelledby="mgg-titulo">
          <div className="mgg-encabezado">
            <h1 id="mgg-titulo" className="font-display">Tabla de mantenimiento de generadores</h1>
            <p>
              Mantenimiento cada {HORAS_ENTRE_MANTENIMIENTOS} h o cada 180/210 días, lo que ocurra primero · correa cada {fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)} h.
              {' '}Las horas actuales salen solas del último reporte de GG.
            </p>
          </div>

          {(copiaTabla || copiaReportes) && (
            <p className="mgg-aviso mgg-aviso--sin-senal">
              <CloudOff size={15} aria-hidden="true" />
              <span>Sin conexión: estás viendo {copiaTabla ? `la tabla guardada en este equipo (${cuandoCopia(copiaTabla)})` : 'la tabla'}{copiaReportes ? ` y los reportes de GG guardados (${cuandoCopia(copiaReportes)})` : ''}. Lo que cambies se sube solo al volver la señal.</span>
            </p>
          )}
          {pendientes.length > rechazados.length && (
            <p className="mgg-aviso mgg-aviso--sin-senal" role="status">
              <CloudOff size={15} aria-hidden="true" />
              <span>Cambios de {pendientes.length - rechazados.length === 1 ? 'un generador' : `${pendientes.length - rechazados.length} generadores`} guardados solo en este equipo: se suben solos apenas vuelva la señal.</span>
            </p>
          )}
          {rechazados.map(p => (
            <p key={p.sitio} className="mgg-aviso mgg-aviso--error" role="alert">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>La nube no aceptó los cambios de {p.sitio} ({p.rechazo}). <button type="button" className="mgg-enlace" onClick={() => { descartarPendienteMantenimientoGG(division, p.sitio); setVersion(v => v + 1); }}>Descartar esos cambios</button></span>
            </p>
          ))}
          {tabla?.faltaActualizarBD && (
            <p className="mgg-aviso mgg-aviso--base">
              <DatabaseZap size={15} aria-hidden="true" />
              <span>Falta una actualización de la base de datos (avísale al administrador): por ahora no se pueden guardar el status del mantenimiento ni el cambio de correa. Lo demás se guarda normal.</span>
            </p>
          )}

          {error && <p className="mgg-aviso mgg-aviso--error">{error}</p>}
          {!error && tabla === null && <p className="mgg-aviso"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Cargando tabla…</p>}
          {tabla && tabla.filas.length === 0 && <p className="mgg-aviso">Esta división todavía no tiene generadores en la tabla de mantenimiento.</p>}

          {tabla && tabla.filas.length > 0 && (
            <>
              <div className="mgg-pestanas" role="tablist" aria-label="Tablas" onKeyDown={alTeclearPestanas}>
                {PESTANAS.map(p => {
                  const c = conteos[p.id];
                  const listo = (p.id !== 'reportes' && p.id !== 'reporte') || reportesListos;
                  const marca = !listo ? null : c.vencido ? { n: c.vencido, tipo: 'vencido' } : c.proximo ? { n: c.proximo, tipo: 'proximo' } : null;
                  return (
                    <button key={p.id} type="button" role="tab" id={`mgg-pestana-${p.id}`} aria-controls={`mgg-panel-${p.id}`}
                      aria-selected={pestana === p.id} tabIndex={pestana === p.id ? 0 : -1} className="mgg-pestana" onClick={() => cambiarPestana(p.id)}>
                      <span className="mgg-pestana__titulo">{p.titulo}</span>
                      {marca && (
                        <span className={`mgg-pestana__cuenta mgg-pestana__cuenta--${marca.tipo}`}
                          title={`${marca.n} ${FILTROS[p.id][marca.tipo as Vencimiento][marca.n === 1 ? 0 : 1]}`}>
                          {marca.n}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div role="tabpanel" id={`mgg-panel-${pestana}`} aria-labelledby={`mgg-pestana-${pestana}`} className="mgg-contenido">
                <div className="mgg-barra-filtros">
                  {((pestana !== 'reportes' && pestana !== 'reporte') || reportesListos) && (
                    <div className="mgg-filtros" role="group" aria-label="Ver solo">
                      {ORDEN_FILTROS.filter(v => conteo[v] > 0).map(v => (
                        <button key={v} type="button" aria-pressed={filtroActivo === v} className={`mgg-filtro mgg-filtro--${v}`}
                          onClick={() => setFiltro(f => (f === v ? null : v))}>
                          <b>{conteo[v]}</b> {FILTROS[pestana][v][conteo[v] === 1 ? 0 : 1]}
                        </button>
                      ))}
                      {filtroActivo && <button type="button" className="mgg-enlace" onClick={() => setFiltro(null)}>Ver todos</button>}
                    </div>
                  )}
                  {pestana === 'reporte' && reportesListos && (
                    <div className="mgg-dia" role="group" aria-label="Día del reporte">
                      <button type="button" className="mgg-icono-boton" onClick={() => diaAnterior && setFechaReporte(diaAnterior)} disabled={!diaAnterior}
                        aria-label="Día anterior con reportes" title="Día anterior con reportes"><ChevronLeft size={16} aria-hidden="true" /></button>
                      <input type="date" className="mgg-campo mgg-dia__fecha" value={fechaDelReporte} min={sumarDias(hoy, -(DIAS_REPORTES - 1))} max={hoy}
                        aria-label="Día del reporte" onChange={ev => { if (ev.target.value) { setFechaReporte(ev.target.value); setFiltro(null); } }} />
                      <button type="button" className="mgg-icono-boton" onClick={() => diaSiguiente && setFechaReporte(diaSiguiente)} disabled={!diaSiguiente}
                        aria-label="Día siguiente con reportes" title="Día siguiente con reportes"><ChevronRight size={16} aria-hidden="true" /></button>
                    </div>
                  )}
                </div>
                {pestana === 'reporte' && reportesListos && (
                  <p className="mgg-dia__resumen" aria-live="polite">
                    Reporte del <b>{nombreDiaSemana(fechaDelReporte).toLowerCase()} {formatFechaLarga(fechaDelReporte)}</b>
                    {' · '}{reportaronEseDia} de {equipos.length} generadores reportaron
                  </p>
                )}

                {pestana === 'mantenimiento' && <PestanaMantenimiento equipos={visibles} guardados={guardadosVisibles} acciones={acciones} faltaActualizarBD={tabla.faltaActualizarBD} />}
                {pestana === 'correa' && <PestanaCorrea equipos={visibles} guardados={guardadosVisibles} acciones={acciones} faltaActualizarBD={tabla.faltaActualizarBD} />}
                {pestana === 'reportes' && <PestanaReportes equipos={visibles} cargando={!analisis && !errorReportes} error={errorReportes && !analisis} />}
                {pestana === 'reporte' && <PestanaReporteGG equipos={visibles} fecha={fechaDelReporte} cargando={!analisis && !errorReportes} error={errorReportes && !analisis} />}
              </div>

              <details className="mgg-calculo">
                <summary>Cómo se calcula</summary>
                <ul>
                  <li><b>Horas actuales:</b> la lectura más reciente del horómetro, sea del último reporte de GG o la que se escriba en la tabla.</li>
                  <li><b>Próximo mantenimiento</b> = horas del último + {HORAS_ENTRE_MANTENIMIENTOS}. <b>Faltan</b> = próximo − horas actuales (negativo: horas pasadas). <b>Desde el último</b> = horas actuales − horas del último.</li>
                  <li><b>Próximo por fecha</b> = fecha del último + 180 o 210 días. <b>Anual</b> = fecha del último + 365 días.</li>
                  <li><b>Vencido</b> si faltan 0 horas o menos, o si ya pasó la fecha. <b>Próximo</b> si faltan {AVISO_HORAS_MANTENIMIENTO} h o menos, o {AVISO_DIAS} días o menos. Manda lo que ocurra primero.</li>
                  <li><b>Correa:</b> próximo cambio = horas del último cambio + {fmtHoras(HORAS_ENTRE_CAMBIOS_CORREA)}. Próximo cuando faltan {AVISO_HORAS_CORREA} h o menos.</li>
                  <li><b>≈ fecha por horas:</b> cuándo se llegaría a las horas al ritmo de uso de los reportes de los últimos 30 días (aprox.).</li>
                  <li><b>Reporte de GG:</b> lo que se reportó ese día en la Reportabilidad de GG (el último reporte del día de cada generador). <b>Crítico:</b> combustible en 1/4, aceite bajo o temperatura de 95 °C o más. <b>Revisar:</b> refrigerante mínimo, aceite sobre relleno, temperatura de 90 °C o más, o revisión no realizada.</li>
                </ul>
              </details>
            </>
          )}
        </section>
      </main>

      {registro && equipoRegistro && (
        <DialogoRegistro tipo={registro.tipo} equipo={equipoRegistro} faltaActualizarBD={!!tabla?.faltaActualizarBD}
          onCerrar={cerrarRegistro} onGuardar={confirmarRegistro} />
      )}
    </div>
  );
}

