// Reportabilidad de GG: formulario para registrar el estado de un grupo generador (mismos datos
// que el formulario de Google "REPORTABILIDAD DE GG") y la tabla con todos los reportes, que se
// puede filtrar y descargar en Excel con el formato de la planilla.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, CircleDashed, CloudOff, Download, Fuel, Loader2, Pencil, Save, Trash2, X } from 'lucide-react';
import { saveAs } from 'file-saver';
import logoPsinet from '../assets/logo_psinet.jpg';
import logoEdificio from '../assets/LogoEdificio.png';
import { nombreVisible, useSesion } from '../auth/sesion';
import { hoyLocalISO } from '../datos/fechas';
import { letraDeFecha } from '../datos/turnos';
import { mismaPersona } from '../lib/firma';
import { getDefaultPersonal } from '../informes/diario/constantes';
import { esErrorDeRed } from '../lib/conexion';
import { registrarDeshacer } from '../lib/deshacer';
import { crearExcel } from '../lib/excel';
import {
  OPCIONES_ACEITE, OPCIONES_COMBUSTIBLE, OPCIONES_REFRIGERANTE, OPCIONES_TURNO, REPORTAN_GG, SITIOS_GG,
  EVENTO_GG, actualizarReporteGG, crearReporteGG, eliminarReporteGG, leerNumero, listarReportesGG, pendientesGG, restaurarReporteGG,
  sincronizarPendientesGG, suscribirReportesGG, todosLosReportesGG, type FiltroGG, type ReporteGG,
} from '../datos/reportesGG';

const POR_PAGINA = 100;
const campo = 'w-full p-2.5 border border-[#DCE1E6] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E4660]/25';
const etiqueta = 'block text-xs font-bold text-[#55636B] mb-1';
const horaActual = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const ddmmaaaa = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const fmtNum = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: 1 }));

/** Botones para elegir una opción (como las listas del formulario de Google, pero de un toque). */
function Opciones({ valor, opciones, onChange, nombre }: { valor: string; opciones: readonly string[]; onChange: (v: string) => void; nombre: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={nombre}>
      {opciones.map(o => (
        <button key={o} type="button" role="radio" aria-checked={valor === o} onClick={() => onChange(o)}
          className={`px-3 py-2 rounded-md text-sm font-bold border transition-colors ${valor === o ? 'bg-[#0E4660] text-white border-[#0E4660]' : 'bg-white text-[#0E4660] border-[#C9D3DA] hover:bg-[#eef5fb]'}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

interface Formulario {
  fecha: string; hora: string; sitio: string; turno: string; reporta: string; combustible: string;
  horometro: string; nroPartidas: string; nivelRefrigerante: string; nivelAceite: string; temperatura: string;
}

export default function ReportabilidadGG({ onBack }: { onBack: () => void }) {
  const { division, perfil, esAdmin } = useSesion();
  const sitios = SITIOS_GG[division];
  // Quién reporta: lista desplegable por turno (como en el Informe Diario) + otros + escribir otro nombre.
  const gruposPersonas = useMemo(() => {
    const limpio = (n: string) => n.trim().replace(/\.+$/, '');
    const vistos = new Set<string>();
    const unico = (lista: string[]) => lista.map(limpio).filter(n => n && !vistos.has(n.toLowerCase()) && vistos.add(n.toLowerCase()));
    const grupos = [
      { titulo: 'Turno A', nombres: unico(getDefaultPersonal('A', division).map(p => p.nombre)) },
      { titulo: 'Turno B', nombres: unico(getDefaultPersonal('B', division).map(p => p.nombre)) },
      { titulo: 'Otros', nombres: unico([...REPORTAN_GG[division], nombreVisible(perfil)]) },
    ];
    return grupos.filter(g => g.nombres.length);
  }, [division, perfil]);
  const personas = useMemo(() => gruposPersonas.flatMap(g => g.nombres), [gruposPersonas]);
  const reportaPorDefecto = () => { const propio = nombreVisible(perfil); return personas.find(n => mismaPersona(n, propio)) ?? propio; };

  const nuevoFormulario = (anterior?: Formulario): Formulario => {
    const fecha = anterior?.fecha ?? hoyLocalISO();
    return {
      fecha, hora: horaActual(), sitio: anterior?.sitio ?? '', turno: anterior?.turno ?? `TURNO ${letraDeFecha(fecha)}`,
      reporta: anterior?.reporta ?? reportaPorDefecto(), combustible: '', horometro: '', nroPartidas: '',
      nivelRefrigerante: '', nivelAceite: '', temperatura: '',
    };
  };
  const [form, setForm] = useState<Formulario>(() => nuevoFormulario());
  const [errores, setErrores] = useState<Partial<Record<keyof Formulario, string>>>({});
  const poner = <K extends keyof Formulario>(k: K, v: Formulario[K]) => {
    setForm(f => ({ ...f, [k]: v }));
    if (errores[k]) setErrores(e => ({ ...e, [k]: undefined })); // al corregir el campo se quita su aviso
  };
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);
  // Reporte que se está corrigiendo (null = reporte nuevo).
  const [editando, setEditando] = useState<ReporteGG | null>(null);
  const [otroNombre, setOtroNombre] = useState(false);
  const formRef = useRef<HTMLElement>(null);
  const irAlFormulario = () => setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

  // --- Lo de hoy: qué sitios ya tienen reporte y cuáles faltan -----------------------------------
  const hoy = hoyLocalISO();
  const [deHoy, setDeHoy] = useState<ReporteGG[] | null>(null);
  const [pendientes, setPendientes] = useState(() => pendientesGG().filter(p => p.division === division));
  const cargarHoy = useCallback(async () => {
    try { setDeHoy(await listarReportesGG({ division, desde: hoy, hasta: hoy }, 0, 300)); } catch { /* sin señal: se muestra lo guardado en el equipo */ setDeHoy(prev => prev ?? []); }
  }, [division, hoy]);
  useEffect(() => {
    let vivo = true;
    listarReportesGG({ division, desde: hoy, hasta: hoy }, 0, 300).then(r => { if (vivo) setDeHoy(r); }).catch(() => { if (vivo) setDeHoy([]); });
    return () => { vivo = false; };
  }, [division, hoy]);
  useEffect(() => {
    const alCambiar = () => { setPendientes(pendientesGG().filter(p => p.division === division)); void cargarHoy(); };
    window.addEventListener(EVENTO_GG, alCambiar);
    void sincronizarPendientesGG();
    return () => window.removeEventListener(EVENTO_GG, alCambiar);
  }, [division, cargarHoy]);
  const reportesHoy = useMemo(() => {
    const todos = [...pendientes.filter(p => p.fecha === hoy), ...(deHoy ?? []).filter(r => !pendientes.some(p => p.id === r.id))];
    return todos.sort((a, b) => (b.hora ?? '').localeCompare(a.hora ?? ''));
  }, [deHoy, pendientes, hoy]);
  const ultimoHoyPorSitio = useMemo(() => {
    const m = new Map<string, { ultimo: ReporteGG; cantidad: number }>();
    for (const r of reportesHoy) {
      const actual = m.get(r.sitio);
      m.set(r.sitio, actual ? { ...actual, cantidad: actual.cantidad + 1 } : { ultimo: r, cantidad: 1 });
    }
    return m;
  }, [reportesHoy]);
  const faltanHoy = sitios.filter(s => !ultimoHoyPorSitio.has(s));
  const puedeEditar = (r: ReporteGG) => esAdmin || r.creadoPor === perfil.id || 'pendiente' in r;

  // --- Tabla de reportes -------------------------------------------------------------------------
  // Al abrir se ven solo los reportes de hoy; con "Ver todos" o las fechas se ve el resto.
  const [filtro, setFiltro] = useState<Omit<FiltroGG, 'division'>>(() => ({ desde: hoyLocalISO(), hasta: hoyLocalISO() }));
  const soloHoy = filtro.desde === hoy && filtro.hasta === hoy;
  const [lista, setLista] = useState<ReporteGG[] | null>(null);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [errorLista, setErrorLista] = useState<string | null>(null);
  const filtroCompleto = useMemo<FiltroGG>(() => ({ division, ...filtro }), [division, filtro]);

  const recargar = useCallback(async (cantidad = POR_PAGINA) => {
    try {
      const pagina = await listarReportesGG(filtroCompleto, 0, cantidad);
      setLista(pagina);
      setHayMas(pagina.length === cantidad);
      setErrorLista(null);
    } catch (error) {
      console.error('No se pudieron cargar los reportes de GG:', error);
      setErrorLista(esErrorDeRed(error) ? 'Sin conexión: no se pudieron cargar los reportes.' : 'No se pudieron cargar los reportes. Si es la primera vez, falta correr supabase/schema.sql en Supabase.');
    }
  }, [filtroCompleto]);

  useEffect(() => {
    let vivo = true;
    listarReportesGG(filtroCompleto, 0, POR_PAGINA)
      .then(pagina => { if (vivo) { setLista(pagina); setHayMas(pagina.length === POR_PAGINA); setErrorLista(null); } })
      .catch(error => {
        console.error('No se pudieron cargar los reportes de GG:', error);
        if (vivo) setErrorLista(esErrorDeRed(error) ? 'Sin conexión: no se pudieron cargar los reportes.' : 'No se pudieron cargar los reportes. Si es la primera vez, falta correr supabase/schema.sql en Supabase.');
      });
    return () => { vivo = false; };
  }, [filtroCompleto]);

  // Reportes de otras personas: la tabla se actualiza sola.
  useEffect(() => suscribirReportesGG(division, () => { void recargar(Math.max(POR_PAGINA, lista?.length ?? 0)); }), [division, recargar, lista?.length]);

  // Último reporte del sitio elegido: sirve de referencia (y para avisar si el horómetro baja).
  const [ultimoDelSitio, setUltimoDelSitio] = useState<ReporteGG | null>(null);
  useEffect(() => {
    let vivo = true;
    if (!form.sitio) return;
    listarReportesGG({ division, sitio: form.sitio }, 0, 1).then(r => { if (vivo) setUltimoDelSitio(r[0] ?? null); }).catch(() => { if (vivo) setUltimoDelSitio(null); });
    return () => { vivo = false; };
  }, [division, form.sitio, lista]);
  const ultimo = form.sitio && ultimoDelSitio?.sitio === form.sitio ? ultimoDelSitio : null;

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  // --- Guardar ------------------------------------------------------------------------------------
  const validar = () => {
    const e: Partial<Record<keyof Formulario, string>> = {};
    const requerido = 'Obligatorio';
    if (!form.fecha) e.fecha = requerido;
    if (!form.sitio) e.sitio = requerido;
    if (!form.turno) e.turno = requerido;
    if (!form.reporta.trim()) e.reporta = requerido;
    if (!form.combustible) e.combustible = requerido;
    if (!form.nivelRefrigerante) e.nivelRefrigerante = requerido;
    if (!form.nivelAceite) e.nivelAceite = requerido;
    const numeros: [keyof Formulario, boolean][] = [['horometro', false], ['nroPartidas', true], ['temperatura', false]];
    for (const [k, entero] of numeros) {
      const n = leerNumero(form[k]);
      if (n === null) e[k] = requerido;
      else if (Number.isNaN(n) || n < 0) e[k] = 'Escribe solo el número';
      else if (entero && !Number.isInteger(n)) e[k] = 'Número entero';
    }
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const valoresFormulario = () => ({
    division, fecha: form.fecha, hora: form.hora || null, sitio: form.sitio, turno: form.turno, reporta: form.reporta.trim(),
    combustible: form.combustible, horometro: leerNumero(form.horometro), nroPartidas: leerNumero(form.nroPartidas),
    nivelRefrigerante: form.nivelRefrigerante, nivelAceite: form.nivelAceite, temperatura: leerNumero(form.temperatura),
  });

  const guardar = async () => {
    if (!validar()) { setAviso({ texto: 'Revisa los campos marcados.', error: true }); return; }
    setGuardando(true);
    try {
      if (editando) {
        const corregido = await actualizarReporteGG({ ...editando, ...valoresFormulario() });
        setLista(prev => (prev ?? []).map(r => (r.id === corregido.id ? corregido : r)));
        setDeHoy(prev => prev?.map(r => (r.id === corregido.id ? corregido : r)) ?? prev);
        setEditando(null);
        setForm(f => nuevoFormulario(f));
        setErrores({});
        setAviso({ texto: `Reporte de ${corregido.sitio} corregido.` });
        return;
      }
      const nuevo = await crearReporteGG(valoresFormulario(), perfil.id);
      const sinSenal = 'pendiente' in nuevo;
      if (!sinSenal) {
        const entraEnFiltro = (!filtro.sitio || filtro.sitio === nuevo.sitio) && (!filtro.desde || nuevo.fecha >= filtro.desde) && (!filtro.hasta || nuevo.fecha <= filtro.hasta);
        if (entraEnFiltro) setLista(prev => [nuevo, ...(prev ?? []).filter(r => r.id !== nuevo.id)]);
        setDeHoy(prev => (nuevo.fecha === hoy ? [nuevo, ...(prev ?? [])] : prev));
      }
      setUltimoDelSitio(nuevo);
      // Para seguir en terreno: queda elegido el siguiente sitio que falta hoy.
      const siguiente = [...sitios.slice(sitios.indexOf(nuevo.sitio) + 1), ...sitios].find(s => s !== nuevo.sitio && !ultimoHoyPorSitio.has(s));
      setForm(f => ({ ...nuevoFormulario(f), sitio: nuevo.fecha === hoy ? (siguiente ?? '') : f.sitio }));
      setErrores({});
      setAviso({ texto: sinSenal ? `Sin señal: el reporte de ${nuevo.sitio} quedó guardado en este equipo y se subirá solo.` : `Reporte de ${nuevo.sitio} guardado.${siguiente && nuevo.fecha === hoy ? ` Sigue: ${siguiente}.` : ''}` });
      irAlFormulario();
    } catch (error) {
      console.error('No se pudo guardar el reporte de GG:', error);
      setAviso({ texto: 'No se pudo guardar el reporte. Los datos siguen en el formulario.', error: true });
    } finally {
      setGuardando(false);
    }
  };

  const editar = (r: ReporteGG) => {
    setEditando(r);
    setErrores({});
    setOtroNombre(!personas.includes(r.reporta));
    setForm({
      fecha: r.fecha, hora: r.hora ?? '', sitio: r.sitio, turno: r.turno, reporta: r.reporta, combustible: r.combustible ?? '',
      horometro: r.horometro?.toString().replace('.', ',') ?? '', nroPartidas: r.nroPartidas?.toString() ?? '',
      nivelRefrigerante: r.nivelRefrigerante ?? '', nivelAceite: r.nivelAceite ?? '', temperatura: r.temperatura?.toString().replace('.', ',') ?? '',
    });
    irAlFormulario();
  };
  const cancelarEdicion = () => { setEditando(null); setErrores({}); setForm(f => ({ ...nuevoFormulario(f), sitio: '' })); };
  const elegirSitio = (sitio: string) => { if (editando) cancelarEdicion(); setForm(f => ({ ...f, sitio, hora: horaActual() })); irAlFormulario(); };

  const eliminar = async (r: ReporteGG) => {
    if (!window.confirm(`¿Eliminar el reporte de ${r.sitio} del ${ddmmaaaa(r.fecha)}${r.hora ? ` ${r.hora}` : ''}?`)) return;
    try {
      await eliminarReporteGG(r.id);
      setLista(prev => (prev ?? []).filter(x => x.id !== r.id));
      setDeHoy(prev => prev?.filter(x => x.id !== r.id) ?? prev);
      if (editando?.id === r.id) cancelarEdicion();
      registrarDeshacer(`Se eliminó el reporte de ${r.sitio}`, () => {
        void restaurarReporteGG(r).then(() => recargar(Math.max(POR_PAGINA, lista?.length ?? 0))).catch(() => setAviso({ texto: 'No se pudo restaurar el reporte.', error: true }));
      });
    } catch (error) {
      console.error('No se pudo eliminar el reporte de GG:', error);
      setAviso({ texto: 'No se pudo eliminar el reporte.', error: true });
    }
  };

  const cargarMas = async () => {
    if (!lista) return;
    setCargandoMas(true);
    try {
      const pagina = await listarReportesGG(filtroCompleto, lista.length, POR_PAGINA);
      setLista([...lista, ...pagina.filter(p => !lista.some(r => r.id === p.id))]);
      setHayMas(pagina.length === POR_PAGINA);
    } catch {
      setAviso({ texto: 'No se pudieron cargar más reportes.', error: true });
    } finally {
      setCargandoMas(false);
    }
  };

  const descargarExcel = async () => {
    setDescargando(true);
    try {
      const todos = await todosLosReportesGG(filtroCompleto);
      // Mismas columnas (y orden) que la planilla del formulario de Google, del más antiguo al más nuevo.
      const filas = [...todos].reverse().map(r => [
        new Date(r.marcaTemporal), r.fecha, r.hora, r.sitio, r.turno, r.reporta, r.combustible, r.horometro, r.nroPartidas,
        r.nivelRefrigerante, r.nivelAceite, r.temperatura,
      ]);
      const blob = await crearExcel('Respuestas de formulario 1', [
        { titulo: 'Marca temporal', tipo: 'fechaHora', ancho: 20 }, { titulo: 'Fecha', tipo: 'fecha', ancho: 12 },
        { titulo: 'Hora', tipo: 'hora', ancho: 8 }, { titulo: 'SITIO', tipo: 'texto', ancho: 17 }, { titulo: 'TURNO', tipo: 'texto', ancho: 10 },
        { titulo: 'P Q REPORTA', tipo: 'texto', ancho: 20 }, { titulo: 'Combustible', tipo: 'texto', ancho: 12 },
        { titulo: 'Horómetro', tipo: 'numero', ancho: 11 }, { titulo: 'Nro Partidas', tipo: 'numero', ancho: 12 },
        { titulo: 'Nivel de Refrigerante', tipo: 'texto', ancho: 19 }, { titulo: 'Nivel de Aceite', tipo: 'texto', ancho: 15 },
        { titulo: 'Temperatura del Generador', tipo: 'numero', ancho: 23 },
      ], filas);
      const sufijo = filtro.sitio ? `_${filtro.sitio}` : '';
      saveAs(blob, `Reportabilidad_GG${sufijo}_${hoyLocalISO()}.xlsx`);
    } catch (error) {
      console.error('No se pudo generar el Excel:', error);
      setAviso({ texto: 'No se pudo generar el Excel.', error: true });
    } finally {
      setDescargando(false);
    }
  };

  const error = (k: keyof Formulario) => errores[k] ? <span className="text-[11px] text-[#a32626] font-bold">{errores[k]}</span> : null;
  const horometroBaja = ultimo?.horometro != null && leerNumero(form.horometro) !== null && (leerNumero(form.horometro) as number) < ultimo.horometro;

  return (
    <div className="min-h-screen pb-16">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Reportabilidad de GG</div>
              <div className="site-header__meta text-xs truncate">Estado de los grupos generadores · combustible, horómetro, niveles y temperatura</div>
            </div>
          </div>
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[1100px] mx-auto p-4 sm:p-5 space-y-5">
        <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver al menú
        </button>

        {/* Hoy: avance de la reportabilidad del día */}
        <section className="panel p-5 space-y-3" aria-labelledby="gg-hoy">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="gg-hoy" className="font-display font-bold text-lg text-[#0E4660]">Hoy · {ddmmaaaa(hoy)}</h2>
            <span className={`text-xs font-bold rounded-full px-3 py-1 ${faltanHoy.length === 0 ? 'bg-[#e6f6e6] text-[#006300]' : 'bg-[#eef5fb] text-[#0E4660]'}`}>
              {sitios.length - faltanHoy.length} de {sitios.length} sitios reportados
            </span>
          </div>
          <div className="h-2 rounded-full bg-[#dbe7ee] overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={sitios.length} aria-valuenow={sitios.length - faltanHoy.length} aria-label="Sitios reportados hoy">
            <span className="block h-full bg-[#0E4660] rounded-full transition-all" style={{ width: `${((sitios.length - faltanHoy.length) / Math.max(1, sitios.length)) * 100}%` }} />
          </div>
          {pendientes.length > 0 && (
            <p className="text-xs font-bold text-[#7a5b00] bg-[#fff3cd] rounded-md px-3 py-2 flex items-center gap-2">
              <CloudOff size={14} /> {pendientes.length} reporte{pendientes.length === 1 ? '' : 's'} guardado{pendientes.length === 1 ? '' : 's'} en este equipo, esperando señal para subir.
            </p>
          )}
          {deHoy === null ? (
            <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {sitios.map(sitio => {
                const hecho = ultimoHoyPorSitio.get(sitio);
                if (!hecho) {
                  return (
                    <button key={sitio} type="button" onClick={() => elegirSitio(sitio)}
                      className={`text-left rounded-lg border-2 border-dashed px-3 py-2.5 hover:bg-[#eef5fb] ${form.sitio === sitio && !editando ? 'border-[#0E4660] bg-[#eef5fb]' : 'border-[#C9D3DA] bg-white'}`}>
                      <span className="block font-bold text-sm text-[#0E4660]">{sitio}</span>
                      <span className="text-xs text-gray-500 flex items-center gap-1"><CircleDashed size={12} /> Pendiente · tocar para reportar</span>
                    </button>
                  );
                }
                const r = hecho.ultimo;
                const enEquipo = 'pendiente' in r;
                return (
                  <div key={sitio} className="rounded-lg border border-[#b9dfb9] bg-[#f3fbf3] px-3 py-2.5">
                    <div className="flex items-start justify-between gap-1">
                      <span className="font-bold text-sm text-[#0E4660]">{sitio}</span>
                      {puedeEditar(r) && (
                        <button type="button" onClick={() => editar(r)} aria-label={`Corregir reporte de ${sitio}`} title="Corregir"
                          className="text-[#0E4660] hover:bg-white rounded p-1 -m-1"><Pencil size={13} /></button>
                      )}
                    </div>
                    <span className="text-xs text-[#006300] flex items-center gap-1">
                      {enEquipo ? <CloudOff size={12} /> : <CheckCircle2 size={12} />} {r.hora ?? '—'} · {r.reporta}{hecho.cantidad > 1 ? ` · ${hecho.cantidad} reportes` : ''}
                    </span>
                    <span className="block text-[11px] text-gray-600">{r.combustible ?? '—'} · {fmtNum(r.horometro)} h · {fmtNum(r.temperatura)} °C</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Formulario */}
        <section ref={formRef} className={`panel p-5 space-y-4 max-w-[760px] scroll-mt-4 ${editando ? 'ring-2 ring-[#ED7D31]' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><Fuel size={18} /> {editando ? `Corregir reporte · ${editando.sitio}` : 'Nuevo reporte'}</h2>
            {editando && (
              <button type="button" onClick={cancelarEdicion} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
                <X size={14} /> Cancelar corrección
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={etiqueta}>Fecha *</span>
              <input type="date" className={campo} value={form.fecha} onChange={e => { const fecha = e.target.value; setForm(f => ({ ...f, fecha, turno: fecha ? `TURNO ${letraDeFecha(fecha)}` : f.turno })); }} />
              {error('fecha')}
            </label>
            <label>
              <span className={etiqueta}>Hora</span>
              <input type="time" className={campo} value={form.hora} onChange={e => poner('hora', e.target.value)} />
            </label>
            <label>
              <span className={etiqueta}>Sitio *</span>
              <select className={campo} value={form.sitio} onChange={e => poner('sitio', e.target.value)}>
                <option value="">Elegir sitio</option>
                {sitios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {error('sitio')}
            </label>
            <label>
              <span className={etiqueta}>Turno *</span>
              <select className={campo} value={form.turno} onChange={e => poner('turno', e.target.value)}>
                {OPCIONES_TURNO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="col-span-2">
              <span className={etiqueta}>Quién reporta *</span>
              <select className={campo} value={otroNombre ? '__otro__' : form.reporta}
                onChange={e => { if (e.target.value === '__otro__') { setOtroNombre(true); poner('reporta', ''); } else { setOtroNombre(false); poner('reporta', e.target.value); } }}>
                <option value="">Elegir persona</option>
                {gruposPersonas.map(g => (
                  <optgroup key={g.titulo} label={g.titulo}>
                    {g.nombres.map(n => <option key={n} value={n}>{n}</option>)}
                  </optgroup>
                ))}
                <option value="__otro__">Otra persona (escribir nombre)…</option>
              </select>
              {otroNombre && <input className={`${campo} mt-1.5`} value={form.reporta} onChange={e => poner('reporta', e.target.value)} placeholder="Nombre y apellido" autoFocus />}
              {error('reporta')}
            </label>
          </div>

          {ultimo && (
            <p className="text-xs text-[#36505e] bg-[#eef5fb] border border-[#d5e7f8] rounded-md px-3 py-2">
              Último reporte de <strong>{ultimo.sitio}</strong>: {ddmmaaaa(ultimo.fecha)}{ultimo.hora ? ` ${ultimo.hora}` : ''} · horómetro <strong>{fmtNum(ultimo.horometro)}</strong> · {fmtNum(ultimo.nroPartidas)} partidas · combustible {ultimo.combustible ?? '—'} · {ultimo.reporta}
            </p>
          )}

          <div>
            <span className={etiqueta}>Combustible *</span>
            <Opciones nombre="Combustible" valor={form.combustible} opciones={OPCIONES_COMBUSTIBLE} onChange={v => poner('combustible', v)} />
            {error('combustible')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className={etiqueta}>Horómetro *</span>
              <input className={campo} inputMode="decimal" value={form.horometro} onChange={e => poner('horometro', e.target.value)} placeholder="Ej: 5139,8" />
              {error('horometro')}
              {horometroBaja && !errores.horometro && <span className="text-[11px] text-[#9a5b00] font-bold">Es menor que el último reporte ({fmtNum(ultimo!.horometro)}). Revisa el número.</span>}
            </label>
            <label>
              <span className={etiqueta}>Nro Partidas *</span>
              <input className={campo} inputMode="numeric" value={form.nroPartidas} onChange={e => poner('nroPartidas', e.target.value)} placeholder="Ej: 2472" />
              {error('nroPartidas')}
            </label>
          </div>
          <div>
            <span className={etiqueta}>Nivel de Refrigerante *</span>
            <Opciones nombre="Nivel de Refrigerante" valor={form.nivelRefrigerante} opciones={OPCIONES_REFRIGERANTE} onChange={v => poner('nivelRefrigerante', v)} />
            {error('nivelRefrigerante')}
          </div>
          <div>
            <span className={etiqueta}>Nivel de Aceite *</span>
            <Opciones nombre="Nivel de Aceite" valor={form.nivelAceite} opciones={OPCIONES_ACEITE} onChange={v => poner('nivelAceite', v)} />
            {error('nivelAceite')}
          </div>
          <label className="block max-w-[calc(50%-6px)]">
            <span className={etiqueta}>Temperatura del Generador * (°C)</span>
            <input className={campo} inputMode="decimal" value={form.temperatura} onChange={e => poner('temperatura', e.target.value)} placeholder="Ej: 72" />
            {error('temperatura')}
          </label>
          <div className="flex justify-end">
            <button type="button" onClick={() => void guardar()} disabled={guardando}
              className="bg-[#0E4660] text-white px-5 py-2.5 rounded-md text-sm font-bold hover:bg-[#0a3549] disabled:opacity-50 flex items-center gap-2">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {editando ? 'Guardar corrección' : 'Guardar reporte'}
            </button>
          </div>
        </section>

        {/* Tabla */}
        <section className="panel p-5 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display font-bold text-lg text-[#0E4660]">{soloHoy ? 'Reportes de hoy' : 'Reportes'}</h2>
              <div className="flex rounded-md border border-[#C9D3DA] overflow-hidden text-xs font-bold" role="group" aria-label="Qué reportes ver">
                <button type="button" aria-pressed={soloHoy} onClick={() => setFiltro(f => ({ ...f, desde: hoy, hasta: hoy }))}
                  className={`px-3 py-1.5 ${soloHoy ? 'bg-[#0E4660] text-white' : 'bg-white text-[#0E4660] hover:bg-[#eef5fb]'}`}>Hoy</button>
                <button type="button" aria-pressed={!filtro.desde && !filtro.hasta} onClick={() => setFiltro(f => ({ ...f, desde: undefined, hasta: undefined }))}
                  className={`px-3 py-1.5 border-l border-[#C9D3DA] ${!filtro.desde && !filtro.hasta ? 'bg-[#0E4660] text-white' : 'bg-white text-[#0E4660] hover:bg-[#eef5fb]'}`}>Ver todos</button>
              </div>
            </div>
            <button type="button" onClick={() => void descargarExcel()} disabled={descargando}
              className="btn-outline text-[#0E4660] px-3 py-2 rounded-md text-xs font-bold hover:bg-[#d5e7f8] disabled:opacity-50 flex items-center gap-1.5">
              {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar Excel
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="col-span-2 sm:col-span-2">
              <span className={etiqueta}>Sitio</span>
              <select className={campo} value={filtro.sitio ?? ''} onChange={e => setFiltro(f => ({ ...f, sitio: e.target.value || undefined }))}>
                <option value="">Todos los sitios</option>
                {sitios.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>
              <span className={etiqueta}>Desde</span>
              <input type="date" className={campo} value={filtro.desde ?? ''} onChange={e => setFiltro(f => ({ ...f, desde: e.target.value || undefined }))} />
            </label>
            <label>
              <span className={etiqueta}>Hasta</span>
              <input type="date" className={campo} value={filtro.hasta ?? ''} onChange={e => setFiltro(f => ({ ...f, hasta: e.target.value || undefined }))} />
            </label>
          </div>
          <p className="text-[11px] text-gray-500">El Excel trae todos los reportes del filtro, con las mismas columnas de la planilla del formulario.</p>

          {errorLista && <p role="alert" className="text-sm rounded-md px-3 py-2 bg-[#fbe9e9] text-[#a32626]">{errorLista}</p>}
          {lista === null && !errorLista && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando reportes…</p>}
          {lista && lista.length === 0 && <p className="text-sm text-gray-500">{soloHoy ? 'Todavía no hay reportes hoy.' : 'No hay reportes con este filtro.'}</p>}
          {lista && lista.length > 0 && (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="tabla-gg w-full text-xs">
                <thead>
                  <tr>
                    <th>Fecha</th><th>Hora</th><th>Sitio</th><th>Turno</th><th>Reporta</th><th>Comb.</th>
                    <th className="text-right">Horómetro</th><th className="text-right">Partidas</th><th>Refrig.</th><th>Aceite</th>
                    <th className="text-right">Temp. (°C)</th><th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {lista.map(r => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{ddmmaaaa(r.fecha)}</td>
                      <td>{r.hora ?? '—'}</td>
                      <td className="whitespace-nowrap font-bold text-[#0E4660]">{r.sitio}</td>
                      <td className="whitespace-nowrap">{r.turno.replace('TURNO ', '')}</td>
                      <td className="whitespace-nowrap">{r.reporta}</td>
                      <td>{r.combustible ?? '—'}</td>
                      <td className="text-right tabular-nums">{fmtNum(r.horometro)}</td>
                      <td className="text-right tabular-nums">{fmtNum(r.nroPartidas)}</td>
                      <td>{r.nivelRefrigerante ?? '—'}</td>
                      <td className="whitespace-nowrap">{r.nivelAceite ?? '—'}</td>
                      <td className="text-right tabular-nums">{fmtNum(r.temperatura)}</td>
                      <td>
                        {puedeEditar(r) && (
                          <span className="flex gap-0.5">
                            <button type="button" onClick={() => editar(r)} aria-label={`Corregir reporte de ${r.sitio}`} title="Corregir"
                              className="text-[#0E4660] hover:bg-[#eef5fb] rounded p-1"><Pencil size={14} /></button>
                            <button type="button" onClick={() => void eliminar(r)} aria-label={`Eliminar reporte de ${r.sitio}`} title="Eliminar"
                              className="text-red-700 hover:bg-red-50 rounded p-1"><Trash2 size={14} /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {lista && hayMas && (
            <div className="flex justify-center">
              <button type="button" onClick={() => void cargarMas()} disabled={cargandoMas}
                className="btn-outline text-[#0E4660] px-4 py-2 rounded-md text-xs font-bold hover:bg-[#d5e7f8] disabled:opacity-50 flex items-center gap-1.5">
                {cargandoMas && <Loader2 size={14} className="animate-spin" />} Ver más reportes
              </button>
            </div>
          )}
        </section>
      </main>

      {aviso && (
        <div role={aviso.error ? 'alert' : 'status'} className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${aviso.error ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50 flex items-center gap-2 max-w-[calc(100vw-32px)]`}>
          {!aviso.error && <Check size={16} />} {aviso.texto}
        </div>
      )}
    </div>
  );
}
