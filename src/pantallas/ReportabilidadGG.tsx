// Reportabilidad de GG: formulario para registrar el estado de un grupo generador (mismos datos
// que el formulario de Google "REPORTABILIDAD DE GG") y la tabla con todos los reportes, que se
// puede filtrar y descargar en Excel con el formato de la planilla.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Download, Fuel, Loader2, Save, Trash2 } from 'lucide-react';
import { saveAs } from 'file-saver';
import logoPsinet from '../assets/logo_psinet.jpg';
import logoEdificio from '../assets/LogoEdificio.png';
import { nombreVisible, useSesion } from '../auth/sesion';
import { hoyLocalISO } from '../datos/fechas';
import { letraDeFecha } from '../datos/turnos';
import { mismaPersona } from '../lib/firma';
import { esErrorDeRed } from '../lib/conexion';
import { registrarDeshacer } from '../lib/deshacer';
import { crearExcel } from '../lib/excel';
import {
  OPCIONES_ACEITE, OPCIONES_COMBUSTIBLE, OPCIONES_REFRIGERANTE, OPCIONES_TURNO, REPORTAN_GG, SITIOS_GG,
  crearReporteGG, eliminarReporteGG, leerNumero, listarReportesGG, restaurarReporteGG, suscribirReportesGG, todosLosReportesGG,
  type FiltroGG, type ReporteGG,
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
  const personas = useMemo(() => {
    const lista = [...REPORTAN_GG[division]];
    const propio = nombreVisible(perfil);
    if (propio && !lista.some(n => mismaPersona(n, propio))) lista.push(propio);
    return lista;
  }, [division, perfil]);
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

  // --- Tabla de reportes -------------------------------------------------------------------------
  const [filtro, setFiltro] = useState<Omit<FiltroGG, 'division'>>({});
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

  const guardar = async () => {
    if (!validar()) { setAviso({ texto: 'Revisa los campos marcados.', error: true }); return; }
    setGuardando(true);
    try {
      const nuevo = await crearReporteGG({
        division, fecha: form.fecha, hora: form.hora || null, sitio: form.sitio, turno: form.turno, reporta: form.reporta.trim(),
        combustible: form.combustible, horometro: leerNumero(form.horometro), nroPartidas: leerNumero(form.nroPartidas),
        nivelRefrigerante: form.nivelRefrigerante, nivelAceite: form.nivelAceite,
        temperatura1: leerNumero(form.temperatura), temperatura2: null,
      });
      setLista(prev => [nuevo, ...(prev ?? []).filter(r => r.id !== nuevo.id)]);
      setUltimoDelSitio(nuevo);
      setForm(f => nuevoFormulario(f));
      setErrores({});
      setAviso({ texto: `Reporte de ${nuevo.sitio} guardado.` });
    } catch (error) {
      console.error('No se pudo guardar el reporte de GG:', error);
      setAviso({ texto: esErrorDeRed(error) ? 'Sin conexión: el reporte no se guardó. Los datos siguen en el formulario, inténtalo de nuevo con señal.' : 'No se pudo guardar el reporte.', error: true });
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async (r: ReporteGG) => {
    if (!window.confirm(`¿Eliminar el reporte de ${r.sitio} del ${ddmmaaaa(r.fecha)}${r.hora ? ` ${r.hora}` : ''}?`)) return;
    try {
      await eliminarReporteGG(r.id);
      setLista(prev => (prev ?? []).filter(x => x.id !== r.id));
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
        r.nivelRefrigerante, r.nivelAceite, r.temperatura1 ?? r.temperatura2,
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

        {/* Formulario */}
        <section className="panel p-5 space-y-4 max-w-[760px]">
          <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><Fuel size={18} /> Nuevo reporte</h2>
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
              <input className={campo} list="reportan-gg" value={form.reporta} onChange={e => poner('reporta', e.target.value)} placeholder="Nombre" />
              <datalist id="reportan-gg">{personas.map(n => <option key={n} value={n} />)}</datalist>
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
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Guardar reporte
            </button>
          </div>
        </section>

        {/* Tabla */}
        <section className="panel p-5 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display font-bold text-lg text-[#0E4660]">Reportes</h2>
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
          {lista && lista.length === 0 && <p className="text-sm text-gray-500">No hay reportes con este filtro.</p>}
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
                      <td className="text-right tabular-nums">{fmtNum(r.temperatura1 ?? r.temperatura2)}</td>
                      <td>
                        {(esAdmin || r.creadoPor === perfil.id) && (
                          <button type="button" onClick={() => void eliminar(r)} aria-label={`Eliminar reporte de ${r.sitio}`} title="Eliminar"
                            className="text-red-700 hover:bg-red-50 rounded p-1"><Trash2 size={14} /></button>
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
