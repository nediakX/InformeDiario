// Impresión Rápida: arma en un clic el kit de documentos de faena de la semana de turno.
// Cada trabajador recibe sus formularios con nombre, RUT, cargo y fechas ya escritos; lo que va
// a doble cara (Inspección de Radios) sale en un PDF aparte. El botón "Imprimir" abre
// directamente el diálogo de impresión.
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, Printer, Loader2, FileText, Minus, Plus, Copy, RotateCw, Users, CalendarDays,
  Download, UserPlus, Trash2, CheckCircle2, Settings2,
} from 'lucide-react';
import logoPsinet from '../assets/logo_psinet.jpg';
import logoEdificio from '../assets/LogoEdificio.png';
import { supabase } from '../lib/supabase';
import { useSesion, formatearRut, rutValido } from '../auth/sesion';
import { registrarActividad } from '../lib/actividad';
import { urlDePdf, imprimirPdf, descargarPdf } from '../lib/imprimir';
import { hoyLocalISO, sumarDias, formatDiaMes } from '../datos/fechas';
import { semanaDeFecha, DIAS_POR_TURNO, type SemanaTurno } from '../datos/turnos';
import { getCreadorPorDefecto } from '../informes/diario/constantes';
import { creadoPorDiario } from '../datos/divisiones';
import { DOCUMENTOS } from '../impresion/plantillas';
import { generarKit, type SeleccionDocumento } from '../impresion/generarKit';
import { personalDelTurno, guardarRut, type PersonaImpresion } from '../impresion/personal';
import { TRABAJADORES, buscarTrabajador } from '../datos/trabajadores';

interface ImpresionRapidaProps {
  onBack: () => void;
}

const MAX_COPIAS = 50;
const CLAVE_PREFERENCIAS = 'psinet_impresion_preferencias_v2';

interface Preferencias {
  seleccion: SeleccionDocumento[];
  prellenar: boolean;
  orden: 'persona' | 'documento';
}

const preferenciasPorDefecto = (): Preferencias => ({
  seleccion: DOCUMENTOS.map(d => ({ id: d.id, incluir: d.id !== 'fatiga' || d.cantidadSugerida > 0, extra: d.cantidadSugerida })),
  prellenar: true,
  orden: 'persona',
});

function leerPreferencias(): Preferencias {
  const base = preferenciasPorDefecto();
  try {
    const guardadas = JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) ?? 'null') as Preferencias | null;
    if (!guardadas) return base;
    return {
      prellenar: guardadas.prellenar ?? base.prellenar,
      orden: guardadas.orden === 'documento' ? 'documento' : 'persona',
      seleccion: base.seleccion.map(s => guardadas.seleccion?.find(g => g.id === s.id) ?? s),
    };
  } catch {
    return base;
  }
}

interface Resultado {
  simpleUrl: string | null;
  simplePaginas: number;
  dobleUrl: string | null;
  dobleHojas: number;
  detalle: { documento: string; copias: number }[];
  nombreBase: string;
}

const rango = (s: SemanaTurno) => `${formatDiaMes(s.inicio)} – ${formatDiaMes(s.fin)}`;

export default function ImpresionRapida({ onBack }: ImpresionRapidaProps) {
  const { esAdmin, division } = useSesion();
  const CREADO_POR_ALL = creadoPorDiario(division);
  const hoy = hoyLocalISO();
  const semanaActual = semanaDeFecha(hoy);
  const semanaSiguiente = semanaDeFecha(sumarDias(semanaActual.fin, 1));
  // Al final de la semana (últimos 2 días) lo normal es preparar la semana que viene.
  const diaDelTurno = semanaActual.dias.indexOf(hoy) + 1;
  const [semanaElegida, setSemanaElegida] = useState<'actual' | 'siguiente' | 'otra'>(diaDelTurno >= DIAS_POR_TURNO - 1 ? 'siguiente' : 'actual');
  const [otraFecha, setOtraFecha] = useState(hoy);
  const semana = semanaElegida === 'actual' ? semanaActual : semanaElegida === 'siguiente' ? semanaSiguiente : semanaDeFecha(otraFecha || hoy);

  const [cuentas, setCuentas] = useState<{ nombre: string; rut: string | null }[]>([]);
  const [personas, setPersonas] = useState<PersonaImpresion[]>(() => personalDelTurno(semana.letra, [], division));
  const [supervisor, setSupervisor] = useState(() => getCreadorPorDefecto(semana.letra, division));
  const [pref, setPref] = useState<Preferencias>(leerPreferencias);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [aviso, setAviso] = useState('');

  // Administradores: completa RUT desde las cuentas registradas (el resto de usuarios no puede leerlas).
  useEffect(() => {
    if (!esAdmin) return;
    void supabase.from('perfiles').select('nombre, rut').eq('estado', 'aprobado').then(({ data }) => {
      if (data) setCuentas(data as { nombre: string; rut: string | null }[]);
    });
  }, [esAdmin]);

  // Al cambiar de semana (y por lo tanto de turno A/B) se carga la dotación de ese turno.
  const [letraCargada, setLetraCargada] = useState(semana.letra);
  if (letraCargada !== semana.letra) {
    setLetraCargada(semana.letra);
    setPersonas(personalDelTurno(semana.letra, cuentas, division));
    setSupervisor(getCreadorPorDefecto(semana.letra, division));
    setResultado(null);
  }
  const [cuentasAplicadas, setCuentasAplicadas] = useState(0);
  if (cuentas.length && cuentasAplicadas !== cuentas.length) {
    setCuentasAplicadas(cuentas.length);
    setPersonas(personalDelTurno(semana.letra, cuentas, division).map((p, i) => ({ ...p, incluir: personas[i]?.incluir ?? true })));
  }

  const guardarPreferencias = (nuevas: Preferencias) => {
    setPref(nuevas);
    setResultado(null);
    try { localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(nuevas)); } catch { /* sin almacenamiento local */ }
  };
  const cambiarSeleccion = (id: string, cambio: Partial<SeleccionDocumento>) =>
    guardarPreferencias({ ...pref, seleccion: pref.seleccion.map(s => s.id === id ? { ...s, ...cambio } : s) });

  const actualizarPersona = (i: number, cambio: Partial<PersonaImpresion>) => {
    setPersonas(prev => prev.map((p, j) => j === i ? { ...p, ...cambio } : p));
    setResultado(null);
  };

  const incluidas = personas.filter(p => p.incluir && p.nombre.trim());

  const copiasDe = (id: string) => {
    const doc = DOCUMENTOS.find(d => d.id === id)!;
    const sel = pref.seleccion.find(s => s.id === id)!;
    if (!sel.incluir) return 0;
    return (doc.modo === 'persona' ? incluidas.length : 0) + sel.extra;
  };
  const totalCopias = DOCUMENTOS.reduce((n, d) => n + copiasDe(d.id), 0);
  const rutsFaltantes = incluidas.filter(p => !p.rut.trim()).length;

  const nombreBase = useMemo(() => `Kit_Turno${semana.letra}_${semana.inicio}`, [semana]);

  const preparar = async (): Promise<Resultado | null> => {
    if (!totalCopias) { setError('Elige al menos un documento.'); return null; }
    setError(null);
    setGenerando(true);
    try {
      const r = await generarKit({
        semana: { letra: semana.letra, dias: semana.dias, supervisor },
        personas: incluidas.map(p => ({ nombre: p.nombre.trim(), rut: p.rut.trim(), cargo: p.cargo.trim() })),
        seleccion: pref.seleccion,
        prellenar: pref.prellenar,
        orden: pref.orden,
        cargarPdf: async archivo => {
          const res = await fetch(archivo);
          if (!res.ok) throw new Error(`No se pudo cargar ${archivo}`);
          return res.arrayBuffer();
        },
      });
      const nuevo: Resultado = {
        simpleUrl: r.simple ? urlDePdf(r.simple) : null,
        simplePaginas: r.simplePaginas,
        dobleUrl: r.doble ? urlDePdf(r.doble) : null,
        dobleHojas: r.dobleHojas,
        detalle: r.detalle,
        nombreBase,
      };
      setResultado(nuevo);
      void registrarActividad('impresion_generada',
        `Turno ${semana.letra} · ${rango(semana)} · ${r.detalle.map(d => `${d.copias} ${d.documento}`).join(', ')}`);
      return nuevo;
    } catch (err) {
      console.error('No se pudo preparar la impresión:', err);
      setError('No se pudo preparar la impresión. Verifica tu conexión e inténtalo de nuevo.');
      return null;
    } finally {
      setGenerando(false);
    }
  };

  // Un clic: prepara el kit y abre directo el diálogo de impresión de las hojas a una cara.
  const imprimirTodo = async () => {
    const r = resultado ?? await preparar();
    if (!r) return;
    if (r.simpleUrl) {
      const modo = imprimirPdf(r.simpleUrl);
      setAviso(modo === 'pestana'
        ? 'Se abrió el PDF en otra pestaña: usa "Imprimir" o "Compartir → Imprimir" de tu teléfono.'
        : r.dobleUrl ? 'Cuando termine, imprime las hojas a doble cara con el botón de abajo.' : '');
    } else if (r.dobleUrl) {
      imprimirPdf(r.dobleUrl);
    }
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
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Impresión Rápida</div>
              <div className="site-header__meta text-xs truncate">Kit de documentos de la semana, prellenado para cada trabajador</div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[960px] mx-auto p-5 space-y-4">
        <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver al menú
        </button>

        {/* 1. Semana */}
        <section className="panel p-5">
          <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><CalendarDays size={18} /> 1. Semana de turno</h2>
          <p className="text-sm text-gray-500 mt-1">Las fechas (miércoles a martes) y el turno se escriben solos en los formularios.</p>
          <div className="grid gap-2 mt-3 sm:grid-cols-3">
            {([
              ['actual', `Esta semana · Turno ${semanaActual.letra}`, rango(semanaActual)],
              ['siguiente', `Próxima semana · Turno ${semanaSiguiente.letra}`, rango(semanaSiguiente)],
              ['otra', 'Otra semana', semanaElegida === 'otra' ? `Turno ${semana.letra} · ${rango(semana)}` : 'Elegir fecha'],
            ] as const).map(([valor, titulo, sub]) => (
              <button
                key={valor}
                type="button"
                onClick={() => { setSemanaElegida(valor); setResultado(null); }}
                className={`text-left border rounded-md p-3 transition-colors ${semanaElegida === valor ? 'border-[#0E4660] bg-[#f0f6fb]' : 'border-[#DCE1E6] bg-white hover:border-[#0E4660]'}`}
                aria-pressed={semanaElegida === valor}
              >
                <div className="font-bold text-sm text-[#0E4660]">{titulo}</div>
                <div className="text-xs text-gray-500">{sub}</div>
              </button>
            ))}
          </div>
          {semanaElegida === 'otra' && (
            <label className="block mt-3 text-sm text-gray-600">
              Cualquier día de la semana que quieres imprimir:{' '}
              <input type="date" value={otraFecha} onChange={e => { setOtraFecha(e.target.value); setResultado(null); }} className="ml-1 border border-[#DCE1E6] rounded-md p-1.5 text-sm" />
            </label>
          )}
        </section>

        {/* 2. Personal */}
        <section className="panel p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><Users size={18} /> 2. Personal del Turno {semana.letra}</h2>
              <p className="text-sm text-gray-500 mt-1">
                Cada persona marcada recibe su juego de formularios con su nombre, RUT y cargo. Los RUT se recuerdan en este dispositivo.
              </p>
            </div>
            <div className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#e3edf3] text-[#0E4660]">{incluidas.length} persona{incluidas.length === 1 ? '' : 's'}</div>
          </div>

          <div className="mt-3 space-y-2">
            {personas.map((p, i) => {
              const rutMalo = p.rut.trim() !== '' && !rutValido(p.rut);
              return (
                <div key={i} className={`grid gap-2 items-center border rounded-md p-2 sm:grid-cols-[auto_1.3fr_0.8fr_1fr_auto] ${p.incluir ? 'border-[#DCE1E6] bg-white' : 'border-dashed border-[#DCE1E6] bg-gray-50 opacity-60'}`}>
                  <input type="checkbox" checked={p.incluir} onChange={e => actualizarPersona(i, { incluir: e.target.checked })} aria-label={`Incluir a ${p.nombre || 'persona'}`} className="w-4 h-4 accent-[#0E4660]" />
                  <input
                    value={p.nombre}
                    list="trabajadores-impresion"
                    onChange={e => {
                      const nombre = e.target.value;
                      // Al elegir a alguien del listado se completan solos su RUT y cargo.
                      const t = TRABAJADORES[division].find(x => x.nombre === nombre) ?? (p.rut.trim() ? null : buscarTrabajador(nombre, division));
                      actualizarPersona(i, t ? { nombre, rut: p.rut.trim() || t.rut, cargo: p.cargo.trim() || t.cargo } : { nombre });
                    }}
                    placeholder="Nombre"
                    className="border border-[#DCE1E6] rounded-md p-1.5 text-sm min-w-0"
                    aria-label="Nombre"
                  />
                  <input
                    value={p.rut}
                    onChange={e => actualizarPersona(i, { rut: formatearRut(e.target.value) })}
                    onBlur={() => p.nombre.trim() && guardarRut(p.nombre, p.rut)}
                    placeholder="RUT"
                    className={`border rounded-md p-1.5 text-sm min-w-0 ${rutMalo ? 'border-red-400 bg-red-50' : 'border-[#DCE1E6]'}`}
                    aria-label="RUT"
                    title={rutMalo ? 'RUT con dígito verificador incorrecto' : undefined}
                  />
                  <input value={p.cargo} onChange={e => actualizarPersona(i, { cargo: e.target.value })} placeholder="Cargo" className="border border-[#DCE1E6] rounded-md p-1.5 text-sm min-w-0" aria-label="Cargo" />
                  <button type="button" onClick={() => setPersonas(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-700 justify-self-end p-1" aria-label="Quitar de la lista">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button type="button" onClick={() => setPersonas(prev => [...prev, { nombre: '', rut: '', cargo: '', incluir: true }])} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
              <UserPlus size={14} /> Agregar persona
            </button>
            {rutsFaltantes > 0 && pref.prellenar && (
              <span className="text-xs text-[#856404] bg-[#FFF3CD] rounded-full px-3 py-1">
                {rutsFaltantes} sin RUT: su casilla de RUT quedará en blanco
              </span>
            )}
          </div>

          <label className="block mt-4 text-sm text-gray-600">
            Supervisor que toma conocimiento:
            <input
              list="supervisores-impresion"
              value={supervisor.nombre}
              onChange={e => {
                const elegido = CREADO_POR_ALL.find(c => c.nombre === e.target.value);
                setSupervisor(elegido ? { nombre: elegido.nombre.replace(/\.$/, ''), cargo: elegido.cargo } : { ...supervisor, nombre: e.target.value });
                setResultado(null);
              }}
              className="block w-full sm:w-80 mt-1 border border-[#DCE1E6] rounded-md p-1.5 text-sm"
            />
            <datalist id="trabajadores-impresion">
              {TRABAJADORES[division].map(t => <option key={t.rut} value={t.nombre}>{t.rut} · {t.cargo}</option>)}
            </datalist>
            <datalist id="supervisores-impresion">
              {CREADO_POR_ALL.map(c => <option key={c.nombre} value={c.nombre} />)}
            </datalist>
          </label>
        </section>

        {/* 3. Documentos */}
        <section className="panel p-5">
          <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><FileText size={18} /> 3. Documentos</h2>
          <p className="text-sm text-gray-500 mt-1">Tu selección se recuerda para la próxima vez.</p>
          <div className="space-y-2.5 mt-3">
            {DOCUMENTOS.map(doc => {
              const sel = pref.seleccion.find(s => s.id === doc.id)!;
              const copias = copiasDe(doc.id);
              return (
                <div key={doc.id} className={`flex items-center justify-between gap-3 border rounded-md p-3 transition-colors flex-wrap ${sel.incluir ? 'border-[#0E4660] bg-[#f0f6fb]' : 'border-[#DCE1E6] bg-white'}`}>
                  <label className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer">
                    <input type="checkbox" checked={sel.incluir} onChange={e => cambiarSeleccion(doc.id, { incluir: e.target.checked })} className="w-4 h-4 accent-[#0E4660] flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="font-bold text-sm text-[#0E4660] flex items-center gap-1.5 flex-wrap">
                        {doc.nombre}
                        {doc.dobleCara && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF3CD] text-[#856404]"><Copy size={10} /> Doble cara</span>
                        )}
                      </span>
                      <span className="block text-xs text-gray-500">{doc.descripcion}</span>
                    </span>
                  </label>
                  {sel.incluir && (
                    <div className="flex items-center gap-2 flex-shrink-0 text-xs text-gray-600">
                      {doc.modo === 'persona' && <span className="font-bold text-[#0E4660]">{incluidas.length} con nombre +</span>}
                      <button type="button" onClick={() => cambiarSeleccion(doc.id, { extra: Math.max(0, sel.extra - 1) })} disabled={sel.extra <= 0} aria-label={`Restar copia de ${doc.nombre}`} className="w-7 h-7 flex items-center justify-center rounded-md border border-[#DCE1E6] text-[#0E4660] hover:bg-[#d5e7f8] disabled:opacity-40"><Minus size={13} /></button>
                      <span className="w-6 text-center font-bold text-sm">{sel.extra}</span>
                      <button type="button" onClick={() => cambiarSeleccion(doc.id, { extra: Math.min(MAX_COPIAS, sel.extra + 1) })} aria-label={`Sumar copia de ${doc.nombre}`} className="w-7 h-7 flex items-center justify-center rounded-md border border-[#DCE1E6] text-[#0E4660] hover:bg-[#d5e7f8]"><Plus size={13} /></button>
                      <span>{doc.modo === 'persona' ? 'en blanco' : doc.dobleCara ? 'por turno/radio' : 'en blanco'}</span>
                      <span className="ml-1 font-bold text-[#0E4660] whitespace-nowrap">= {copias}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-[#0E4660] font-bold flex items-center gap-1.5"><Settings2 size={14} /> Opciones</summary>
            <div className="mt-2 space-y-2 pl-1">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={pref.prellenar} onChange={e => guardarPreferencias({ ...pref, prellenar: e.target.checked })} className="accent-[#0E4660]" />
                Escribir nombres, RUT, cargos, fechas y turno en los formularios
              </label>
              <div className="flex items-center gap-2 flex-wrap">
                Orden de las hojas:
                {(['persona', 'documento'] as const).map(o => (
                  <label key={o} className="flex items-center gap-1.5">
                    <input type="radio" name="orden-impresion" checked={pref.orden === o} onChange={() => guardarPreferencias({ ...pref, orden: o })} className="accent-[#0E4660]" />
                    {o === 'persona' ? 'Juego completo por persona' : 'Agrupado por documento'}
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => guardarPreferencias(preferenciasPorDefecto())} className="text-xs underline text-gray-500">Restablecer selección</button>
            </div>
          </details>
        </section>

        {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</p>}

        <div className="action-zone">
          <button
            onClick={() => void imprimirTodo()}
            disabled={generando || totalCopias === 0}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generando
              ? <><Loader2 size={18} className="animate-spin" /> Preparando kit…</>
              : <><Printer size={18} /> Imprimir kit · Turno {semana.letra} ({totalCopias} formulario{totalCopias === 1 ? '' : 's'})</>}
          </button>
        </div>

        {resultado && (
          <section className="panel p-5 space-y-3">
            <h3 className="font-display font-bold text-base text-[#0E4660] flex items-center gap-2"><CheckCircle2 size={18} className="text-[#0ca30c]" /> Kit listo</h3>
            <ul className="text-sm text-gray-600 list-disc pl-5">
              {resultado.detalle.map(d => <li key={d.documento}>{d.copias} × {d.documento}</li>)}
            </ul>
            {aviso && <p className="text-sm text-[#0E4660] bg-[#f0f6fb] rounded-md p-2">{aviso}</p>}

            {resultado.simpleUrl && (
              <div className="flex items-center justify-between gap-3 border border-[#DCE1E6] rounded-md p-3 bg-white flex-wrap">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[#0E4660]">Hojas a una cara</div>
                  <div className="text-xs text-gray-500">{resultado.simplePaginas} hoja{resultado.simplePaginas === 1 ? '' : 's'} · impresión normal</div>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => descargarPdf(resultado.simpleUrl!, `${resultado.nombreBase}.pdf`)} className="btn-outline text-[#0E4660] px-3 py-2 rounded-md text-sm font-bold flex items-center gap-1.5"><Download size={15} /> PDF</button>
                  <button type="button" onClick={() => imprimirPdf(resultado.simpleUrl!)} className="btn-primary-field text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2"><Printer size={15} /> Imprimir</button>
                </div>
              </div>
            )}

            {resultado.dobleUrl && (
              <div className="border border-[#F5B300] rounded-md p-3 bg-[#FFF9E8] space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#0E4660] flex items-center gap-1.5"><RotateCw size={14} /> Hojas a doble cara</div>
                    <div className="text-xs text-gray-600">{resultado.dobleHojas} hoja{resultado.dobleHojas === 1 ? '' : 's'} física{resultado.dobleHojas === 1 ? '' : 's'} · frente y reverso ya ordenados</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => descargarPdf(resultado.dobleUrl!, `${resultado.nombreBase}_doble_cara.pdf`)} className="btn-outline text-[#0E4660] px-3 py-2 rounded-md text-sm font-bold flex items-center gap-1.5"><Download size={15} /> PDF</button>
                    <button type="button" onClick={() => imprimirPdf(resultado.dobleUrl!)} className="bg-[#0E4660] text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 hover:bg-[#0a3549]"><Printer size={15} /> Imprimir doble cara</button>
                  </div>
                </div>
                <p className="text-xs text-[#856404]">
                  En el diálogo de impresión activa <strong>"Imprimir en ambas caras"</strong> (borde largo). El navegador no puede activarlo solo: es una opción de la impresora.
                </p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
