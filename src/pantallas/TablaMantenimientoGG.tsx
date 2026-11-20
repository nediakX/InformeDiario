// Tabla de mantenimiento de generadores, en formato de planilla: se edita directo en cada celda
// y cada cambio se guarda solo. Las horas del próximo mantenimiento y las horas restantes se calculan.
// En el celular cada equipo es una tarjeta con sus campos (la planilla ancha no cabe).
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, Loader2 } from 'lucide-react';
import CuentaCabecera from '../componentes/CuentaCabecera';
import logoPsinet from '../assets/logo_psinet.png';
import logoEdificio from '../assets/LogoEdificio.png';
import { useSesion } from '../auth/sesion';
import { configDivision } from '../datos/divisiones';
import { OPCIONES_REFRIGERANTE } from '../datos/reportesGG';
import { HORAS_ENTRE_MANTENIMIENTOS, guardarMantenimientoGG, listarMantenimientoGG, type FilaMantenimientoGG } from '../datos/mantenimientoGG';
import { esErrorDeRed } from '../lib/conexion';

type EstadoGuardado = 'guardando' | 'guardado' | 'error';
type Vencimiento = 'vencido' | 'proximo' | 'al_dia' | 'sin_datos';
const numero = new Intl.NumberFormat('es-CL');
const proximaDe = (f: FilaMantenimientoGG) => (f.ultimoHoras === null ? null : f.ultimoHoras + HORAS_ENTRE_MANTENIMIENTOS);
const restanDe = (f: FilaMantenimientoGG) => {
  const proxima = proximaDe(f);
  return proxima === null || f.horasRegistradas === null ? null : proxima - f.horasRegistradas;
};
const vencimientoDe = (restan: number | null): Vencimiento =>
  restan === null ? 'sin_datos' : restan <= 0 ? 'vencido' : restan <= 25 ? 'proximo' : 'al_dia';

/** Aviso según las horas que faltan: vencido (rojo), próximo (amarillo), al día (verde). */
function Aviso({ restan }: { restan: number | null }) {
  const v = vencimientoDe(restan);
  if (v === 'sin_datos') return <span className="text-xs text-gray-500">Sin datos</span>;
  if (v === 'vencido') return <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-[#fde8e8] text-[#9b1c1c] whitespace-nowrap">Vencido</span>;
  if (v === 'proximo') return <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-[#fff4d6] text-[#7a5200] whitespace-nowrap">Próximo</span>;
  return <span className="text-xs font-bold rounded-full px-2 py-0.5 bg-[#e6f6e6] text-[#006300] whitespace-nowrap">Al día</span>;
}

function EstadoCelda({ estado }: { estado?: EstadoGuardado }) {
  if (estado === 'guardando') return <span className="flex items-center gap-1 text-gray-500"><Loader2 size={13} className="animate-spin" /> Guardando</span>;
  if (estado === 'guardado') return <span className="flex items-center gap-1 text-[#006300]"><Check size={13} /> Guardado</span>;
  if (estado === 'error') return <span className="flex items-center gap-1 text-[#9b1c1c]"><CircleAlert size={13} /> No se guardó</span>;
  return null;
}

const CAMPO = 'w-full min-h-10 px-2 py-1.5 border border-[#DCE1E6] rounded-md text-sm bg-white';
const ETIQUETA = 'block text-[11px] font-bold text-gray-600 mb-1';

export default function TablaMantenimientoGG({ onBack }: { onBack: () => void }) {
  const { division } = useSesion();
  const [filas, setFilas] = useState<FilaMantenimientoGG[] | null>(null);
  const [error, setError] = useState('');
  const [estados, setEstados] = useState<Record<string, EstadoGuardado>>({});

  useEffect(() => {
    let vivo = true;
    listarMantenimientoGG(division)
      .then(r => { if (vivo) { setFilas(r); setError(''); } })
      .catch(e => {
        if (vivo) setError(esErrorDeRed(e) ? 'Sin conexión: no se pudo cargar la tabla.' : 'No se pudo cargar la tabla. ¿Ya se creó la tabla mantenimiento_gg en Supabase?');
      });
    return () => { vivo = false; };
  }, [division]);

  const guardar = async (f: FilaMantenimientoGG) => {
    setEstados(e => ({ ...e, [f.sitio]: 'guardando' }));
    try {
      await guardarMantenimientoGG(division, f);
      setEstados(e => ({ ...e, [f.sitio]: 'guardado' }));
    } catch {
      setEstados(e => ({ ...e, [f.sitio]: 'error' }));
    }
  };

  /** Cambia una celda. `ahora` guarda al instante (listas y fechas); los números se guardan al salir de la celda. */
  const actualizar = (i: number, cambio: Partial<FilaMantenimientoGG>, ahora: boolean) => {
    if (!filas) return;
    const nueva = { ...filas[i], ...cambio };
    setFilas(filas.map((f, j) => (j === i ? nueva : f)));
    if (ahora) void guardar(nueva);
  };

  const aNumero = (texto: string) => (texto.trim() === '' ? null : Math.round(Number(texto)));

  // Resumen de vencimientos (arriba de la tabla).
  const conteo = (filas ?? []).reduce<Record<Vencimiento, number>>((n, f) => {
    n[vencimientoDe(restanDe(f))] += 1;
    return n;
  }, { vencido: 0, proximo: 0, al_dia: 0, sin_datos: 0 });

  // Campos de cada equipo (los mismos en la planilla y en las tarjetas del celular).
  const campoUltimasHoras = (f: FilaMantenimientoGG, i: number) => (
    <input type="number" inputMode="numeric" min={0} aria-label={`${f.nombre}: últimas horas del mantenimiento`}
      value={f.ultimoHoras ?? ''} className={CAMPO}
      onChange={e => actualizar(i, { ultimoHoras: aNumero(e.target.value) }, false)}
      onBlur={() => void guardar(filas![i])} />
  );
  const campoFecha = (f: FilaMantenimientoGG, i: number) => (
    <input type="date" aria-label={`${f.nombre}: fecha del último mantenimiento`}
      value={f.ultimoFecha ?? ''} className={CAMPO}
      onChange={e => actualizar(i, { ultimoFecha: e.target.value || null }, true)} />
  );
  const campoHorasRegistradas = (f: FilaMantenimientoGG, i: number) => (
    <input type="number" inputMode="numeric" min={0} aria-label={`${f.nombre}: horas registradas`}
      value={f.horasRegistradas ?? ''} className={CAMPO}
      onChange={e => actualizar(i, { horasRegistradas: aNumero(e.target.value) }, false)}
      onBlur={() => void guardar(filas![i])} />
  );
  const campoCiclo = (f: FilaMantenimientoGG, i: number) => (
    <select aria-label={`${f.nombre}: cada cuántos días`} value={f.cicloDias} className={CAMPO}
      onChange={e => actualizar(i, { cicloDias: Number(e.target.value) }, true)}>
      <option value={180}>180 días</option>
      <option value={210}>210 días</option>
    </select>
  );
  const campoRefrigerante = (f: FilaMantenimientoGG, i: number) => (
    <select aria-label={`${f.nombre}: nivel de refrigerante`} value={f.refrigerante ?? ''} className={CAMPO}
      onChange={e => actualizar(i, { refrigerante: e.target.value || null }, true)}>
      <option value="">—</option>
      {OPCIONES_REFRIGERANTE.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <div className="min-h-screen pb-16">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Tabla de mantenimiento GG</div>
              <div className="site-header__meta text-xs truncate">{configDivision(division).sigla} / Horas de mantenimiento de generadores</div>
            </div>
          </div>
          <CuentaCabecera />
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[1280px] mx-auto p-4 sm:p-5 space-y-4">
        <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver al menú
        </button>

        <section className="panel p-4 sm:p-5 space-y-3" aria-labelledby="tabla-mtto-gg">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 id="tabla-mtto-gg" className="font-display font-bold text-lg text-[#0E4660]">Tabla de mantenimiento de generadores</h1>
              <p className="text-xs text-gray-600">Escribe las horas y la fecha de cada equipo. Se guarda al salir de cada campo. Próximo mantenimiento = últimas horas + {HORAS_ENTRE_MANTENIMIENTOS}.</p>
            </div>
            {filas && filas.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Resumen de vencimientos">
                {conteo.vencido > 0 && <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-[#fde8e8] text-[#9b1c1c]">{conteo.vencido} vencido{conteo.vencido === 1 ? '' : 's'}</span>}
                {conteo.proximo > 0 && <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-[#fff4d6] text-[#7a5200]">{conteo.proximo} próximo{conteo.proximo === 1 ? '' : 's'}</span>}
                <span className="text-xs font-bold rounded-full px-2.5 py-1 bg-[#e6f6e6] text-[#006300]">{conteo.al_dia} al día</span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md p-3">{error}</p>}
          {!error && filas === null && (
            <p className="text-sm text-gray-600 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando tabla…</p>
          )}

          {filas && (
            <>
              {/* Planilla (pantallas anchas) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="min-w-[980px] w-full text-sm border-collapse">
                  <thead>
                    <tr className="text-left text-xs text-[#0E4660] border-b border-[#DCE1E6]">
                      <th className="py-2 pr-3 font-bold">Equipo</th>
                      <th className="py-2 pr-3 font-bold">Últimas horas (mantenimiento)</th>
                      <th className="py-2 pr-3 font-bold">Fecha último mantenimiento</th>
                      <th className="py-2 pr-3 font-bold">Horas registradas</th>
                      <th className="py-2 pr-3 font-bold">Próximo (h)</th>
                      <th className="py-2 pr-3 font-bold">Faltan (h)</th>
                      <th className="py-2 pr-3 font-bold">Estado</th>
                      <th className="py-2 pr-3 font-bold">Cada</th>
                      <th className="py-2 pr-3 font-bold">Refrigerante</th>
                      <th className="py-2 font-bold">Guardado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f, i) => {
                      const restan = restanDe(f);
                      const proxima = proximaDe(f);
                      return (
                        <tr key={f.sitio} className="border-b border-[#eef1f4] align-middle">
                          <td className="py-1.5 pr-3">
                            <div className="font-bold text-[#0E4660]">{f.nombre}</div>
                            <div className="text-[11px] text-gray-500 font-mono">{f.sitio}</div>
                          </td>
                          <td className="py-1.5 pr-3 w-36">{campoUltimasHoras(f, i)}</td>
                          <td className="py-1.5 pr-3 w-40">{campoFecha(f, i)}</td>
                          <td className="py-1.5 pr-3 w-36">{campoHorasRegistradas(f, i)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{proxima === null ? '—' : numero.format(proxima)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums font-bold">{restan === null ? '—' : numero.format(restan)}</td>
                          <td className="py-1.5 pr-3"><Aviso restan={restan} /></td>
                          <td className="py-1.5 pr-3 w-28">{campoCiclo(f, i)}</td>
                          <td className="py-1.5 pr-3 w-32">{campoRefrigerante(f, i)}</td>
                          <td className="py-1.5 text-xs"><EstadoCelda estado={estados[f.sitio]} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Tarjetas (celular y tablet: dos columnas) */}
              <ul className="lg:hidden grid gap-3 sm:grid-cols-2">
                {filas.map((f, i) => {
                  const restan = restanDe(f);
                  const proxima = proximaDe(f);
                  const v = vencimientoDe(restan);
                  const borde = v === 'vencido' ? 'border-l-[#b3261e]' : v === 'proximo' ? 'border-l-[#d39b00]' : v === 'al_dia' ? 'border-l-[#1e8e3e]' : 'border-l-[#c9d3da]';
                  return (
                    <li key={f.sitio} className={`rounded-lg border border-[#DCE1E6] border-l-4 ${borde} p-3 space-y-3`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-[#0E4660] leading-tight">{f.nombre}</div>
                          <div className="text-[11px] text-gray-500 font-mono">{f.sitio}</div>
                        </div>
                        <Aviso restan={restan} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label><span className={ETIQUETA}>Últimas horas</span>{campoUltimasHoras(f, i)}</label>
                        <label><span className={ETIQUETA}>Fecha último</span>{campoFecha(f, i)}</label>
                        <label><span className={ETIQUETA}>Horas registradas</span>{campoHorasRegistradas(f, i)}</label>
                        <label><span className={ETIQUETA}>Cada</span>{campoCiclo(f, i)}</label>
                        <label className="col-span-2"><span className={ETIQUETA}>Refrigerante</span>{campoRefrigerante(f, i)}</label>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="text-gray-600">
                          Próximo <strong className="tabular-nums text-[#222]">{proxima === null ? '—' : `${numero.format(proxima)} h`}</strong>
                          {' · '}Faltan <strong className="tabular-nums text-[#222]">{restan === null ? '—' : `${numero.format(restan)} h`}</strong>
                        </span>
                        <EstadoCelda estado={estados[f.sitio]} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
