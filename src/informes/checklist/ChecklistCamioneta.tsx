// Checklist diario de la camioneta (registro GSSO-LTE-R-LV-DSAL-29).
//
// Un registro por camioneta y semana de turno, con los 8 días del formato (martes de llegada +
// miércoles a martes). Cada día se marca ✓ / X en cada ítem, las aptitudes del conductor y su
// nombre; se guarda solo en la nube (y en el dispositivo si no hay señal) y se descarga en Word
// con el mismo formato del registro oficial.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, CarFront, ClipboardCheck, UserRound, ShieldAlert,
  Check, X, Copy, Eraser, Loader2, FileDown, Plus, NotebookPen, Eye, Send,
} from 'lucide-react';
import { saveAs } from 'file-saver';
import logoPsinet from '../../assets/logo_psinet.jpg';
import logoEdificio from '../../assets/LogoEdificio.png';
import { useSesion, nombreVisible } from '../../auth/sesion';
import { configDivision } from '../../datos/divisiones';
import { hoyLocalISO, sumarDias, formatDiaMes } from '../../datos/fechas';
import { semanaDeFecha, uuidDeterministico } from '../../datos/turnos';
import { type BorradorOtroEntry, fetchBorradoresOtros, subscribeBorradoresOtros, upsertBorradorOtro } from '../../datos/borradoresOtros';
import { registrarDeshacer } from '../../lib/deshacer';
import { firmasDivision } from '../../datos/perfil';
import { registrarActividad } from '../../lib/actividad';
import {
  SECCIONES, DIAS_CHECKLIST, INICIALES_DIA, ETIQUETAS_DIA, fechasChecklist, checklistVacio, normalizarChecklist,
  avanceDia, requiereAviso, clavePatente, type DatosChecklist, type Marca, type Respuesta,
} from './catalogo';
import { generarChecklistWord, nombreArchivoChecklist } from './word';
import VistaPreviaDocx from '../../componentes/VistaPreviaDocx';
import { enviarChecklistAlDiario } from './enviarDiario';
import { esErrorDeRed } from '../../lib/conexion';
import './checklist.css';

const TIPO = 'checklist_camioneta' as const;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Huella del checklist: si no cambió, no se vuelven a enviar las hojas al Informe Diario. */
const huella = (datos: DatosChecklist) => {
  const t = JSON.stringify(datos);
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0;
  return `${t.length}:${h}`;
};
const claveEnviado = (id: string, dia: number) => `psinet_checklist_diario_${id}_${dia}`;
const leerLocal = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const guardarLocal = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

/** fechaInicial: semana a mostrar al abrir (ej: un checklist recién importado de otra semana). */
export default function ChecklistCamioneta({ onBack, fechaInicial = null }: { onBack: () => void; fechaInicial?: string | null }) {
  const { division, perfil } = useSesion();
  const config = configDivision(division);
  const hoy = hoyLocalISO();
  const [fechaRef, setFechaRef] = useState(fechaInicial ?? hoy);
  const semana = useMemo(() => semanaDeFecha(fechaRef), [fechaRef]);
  const [lista, setLista] = useState<BorradorOtroEntry[] | null>(null);

  useEffect(() => {
    let vivo = true;
    void fetchBorradoresOtros(TIPO, division).then(l => { if (vivo) setLista(l); });
    const desuscribir = subscribeBorradoresOtros(TIPO, division, l => setLista(l));
    return () => { vivo = false; desuscribir(); };
  }, [division]);

  // Camionetas: las 3 del contrato y cualquier otra que se haya agregado (con sus últimos datos).
  const camionetas = useMemo(() => {
    const vistas = new Map<string, DatosChecklist>();
    for (const c of config.camionetas) {
      const d = checklistVacio(semana.inicio, semana.letra);
      vistas.set(clavePatente(c.patente), { ...d, patente: c.patente, marca: c.marca, modelo: c.modelo, anio: c.anio });
    }
    const registradas = new Set<string>();
    for (const e of [...(lista ?? [])].sort((a, b) => b.savedAt.localeCompare(a.savedAt))) {
      const d = normalizarChecklist(e.datos, semana.inicio, semana.letra);
      const clave = clavePatente(d.patente);
      if (!clave || registradas.has(clave)) continue;
      registradas.add(clave);
      const fija = config.camionetas.find(c => clavePatente(c.patente) === clave);
      vistas.set(clave, fija ? { ...d, patente: fija.patente, marca: d.marca || fija.marca, modelo: d.modelo || fija.modelo, anio: d.anio || fija.anio } : d);
    }
    return vistas;
  }, [lista, semana.inicio, semana.letra, config.camionetas]);

  const CLAVE_PATENTE = `psinet_checklist_patente${config.sufijoLocal}`;
  const [patente, setPatenteState] = useState<string>(() => {
    try { return localStorage.getItem(CLAVE_PATENTE) ?? ''; } catch { return ''; }
  });
  const setPatente = (p: string) => {
    const limpia = p.toUpperCase().trim();
    setPatenteState(limpia);
    try { localStorage.setItem(CLAVE_PATENTE, limpia); } catch { /* sin almacenamiento */ }
  };
  const [nuevaPatente, setNuevaPatente] = useState('');
  // Sin patente elegida: la primera camioneta del contrato.
  const elegida = camionetas.get(clavePatente(patente));
  const patenteActiva = elegida?.patente ?? (patente || config.camionetas[0]?.patente || [...camionetas.values()][0]?.patente || '');

  const id = patenteActiva ? uuidDeterministico(`checklist|${division}|${semana.inicio}|${clavePatente(patenteActiva)}`) : '';
  const entrada = lista?.find(e => e.id === id) ?? null;

  /** Checklist nuevo de la semana: arrastra los datos de la camioneta del último registro. */
  const base = useMemo(() => {
    const d = checklistVacio(semana.inicio, semana.letra);
    const anterior = camionetas.get(clavePatente(patenteActiva));
    d.patente = patenteActiva;
    // Conductor por defecto: la persona que abre el checklist, si está en la lista de conductores.
    const propio = nombreVisible(perfil);
    const lista = [...config.conductores.A, ...config.conductores.B];
    d.conductor = lista.length ? (lista.find(n => mismaPersona(n, propio)) ?? '') : propio;
    if (anterior) {
      d.patente = anterior.patente || patenteActiva;
      d.marca = anterior.marca; d.modelo = anterior.modelo; d.anio = anterior.anio;
      d.fechaUltimaMantencion = anterior.fechaUltimaMantencion; d.kmProximaMantencion = anterior.kmProximaMantencion;
      d.fechaControlLicencia = anterior.fechaControlLicencia; d.fechaExtintor = anterior.fechaExtintor;
      d.kmInicio = anterior.kmFin; // el kilometraje de inicio es el de término de la semana anterior
    }
    return d;
  }, [semana.inicio, semana.letra, camionetas, patenteActiva, perfil, config.conductores]);

  const rango = `${formatDiaMes(sumarDias(semana.inicio, -1))} – ${formatDiaMes(semana.fin)}`;

  return (
    <div className="min-h-screen text-[#222] font-sans pb-24">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Checklist de Camioneta</div>
              <div className="site-header__meta text-xs truncate">{config.sigla} / GSSO-LTE-R-LV-DSAL-29 · Lista de verificación diaria</div>
            </div>
          </div>
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <div className="checklist-semana" role="group" aria-label="Semana de turno">
            <button type="button" aria-label="Semana anterior" onClick={() => setFechaRef(sumarDias(semana.inicio, -7))}><ChevronLeft size={16} /></button>
            <span>
              <strong>Turno {semana.letra}</strong> · {rango}
              {fechaRef !== hoy && semana.inicio !== semanaDeFecha(hoy).inicio && (
                <button type="button" className="checklist-semana__hoy" onClick={() => setFechaRef(hoy)}>Ir a hoy</button>
              )}
            </span>
            <button type="button" aria-label="Semana siguiente" onClick={() => setFechaRef(sumarDias(semana.inicio, 7))}><ChevronRight size={16} /></button>
          </div>
        </div>

        <section className="panel p-5">
          <h2 className="panel__summary font-display font-bold text-lg"><CarFront size={18} className="panel__summary-icon" strokeWidth={2.2} /> Camioneta</h2>
          <div className="flex flex-wrap gap-2 items-center">
            {[...camionetas.keys()].map(clave => {
              const c = camionetas.get(clave)!;
              const activa = clavePatente(patenteActiva) === clave;
              return (
                <button key={clave} type="button" onClick={() => setPatente(c.patente)} className={`checklist-chip ${activa ? 'checklist-chip--activa' : ''}`}>
                  {[c.marca, c.patente.toUpperCase()].filter(Boolean).join(' · ')}
                </button>
              );
            })}
            <form
              className="flex items-center gap-1.5"
              onSubmit={e => { e.preventDefault(); if (nuevaPatente.trim()) { setPatente(nuevaPatente); setNuevaPatente(''); } }}
            >
              <input
                value={nuevaPatente}
                onChange={e => setNuevaPatente(e.target.value.toUpperCase())}
                placeholder={camionetas.size ? 'Otra patente' : 'Patente'}
                className="w-36 p-2 border border-[#DCE1E6] rounded-md text-sm uppercase"
                aria-label="Patente de la camioneta"
              />
              <button type="submit" className="btn-outline text-[#0E4660] px-2.5 py-2 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1"><Plus size={14} /> Agregar</button>
            </form>
          </div>
          {!patenteActiva && <p className="text-sm text-gray-500 mt-3">Ingresa la patente de la camioneta para comenzar el checklist de la semana.</p>}
        </section>

        {lista === null && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Cargando checklists…</p>}
        {lista !== null && patenteActiva && (
          <FormularioChecklist
            key={id}
            id={id}
            division={division}
            conductores={config.conductores}
            entrada={entrada}
            base={base}
            hoy={hoy}
            onGuardado={entry => setLista(prev => [entry, ...(prev ?? []).filter(e => e.id !== entry.id)])}
          />
        )}
      </main>
    </div>
  );
}

function FormularioChecklist({ id, division, conductores, entrada, base, hoy, onGuardado }: {
  id: string;
  conductores: { A: string[]; B: string[] };
  /** Avisa el checklist recién guardado (la lista de camionetas se actualiza al tiro, aun sin señal). */
  onGuardado: (entry: BorradorOtroEntry) => void;
  division: ReturnType<typeof useSesion>['division'];
  entrada: BorradorOtroEntry | null;
  base: DatosChecklist;
  hoy: string;
}) {
  // Lo guardado, completando con los datos fijos de la camioneta lo que haya quedado vacío.
  const normalizar = (e: BorradorOtroEntry): DatosChecklist => {
    const d = normalizarChecklist(e.datos, base.semanaInicio, base.letra);
    return { ...d, patente: base.patente, marca: d.marca || base.marca, modelo: d.modelo || base.modelo, anio: d.anio || base.anio };
  };
  const [datos, setDatos] = useState<DatosChecklist>(() => (entrada ? normalizar(entrada) : base));
  // Cada cambio suma una edición; hay cambios sin guardar mientras la última guardada sea anterior.
  const [edicion, setEdicion] = useState(0);
  const [edicionGuardada, setEdicionGuardada] = useState(0);
  const sucio = edicion !== edicionGuardada;
  const [guardando, setGuardando] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(entrada?.savedAt ?? null);
  const [versionVista, setVersionVista] = useState<string | null>(entrada?.savedAt ?? null);
  const [generando, setGenerando] = useState<'ver' | 'descargar' | null>(null);
  const [vista, setVista] = useState<{ blob: Blob; nombre: string } | null>(null);
  const cerrarVista = useCallback(() => setVista(null), []);
  const [aviso, setAviso] = useState<{ texto: string; error?: boolean } | null>(null);

  const fechas = useMemo(() => fechasChecklist(base.semanaInicio), [base.semanaInicio]);
  const indiceHoy = fechas.indexOf(hoy);
  const [dia, setDia] = useState(indiceHoy >= 0 ? indiceHoy : 0);

  // Cambios guardados desde otro dispositivo: se aplican si aquí no hay cambios sin guardar.
  if (entrada && entrada.savedAt !== versionVista) {
    setVersionVista(entrada.savedAt);
    if (!sucio && entrada.savedAt !== guardadoEn) {
      setDatos(normalizar(entrada));
      setGuardadoEn(entrada.savedAt);
    }
  }

  // Último día modificado: al quedar completo, sus hojas se guardan en el Informe Diario de esa fecha.
  const [diaEditado, setDiaEditado] = useState<number | null>(null);
  const cambiar = (fn: (d: DatosChecklist) => DatosChecklist) => {
    setDatos(fn);
    setEdicion(n => n + 1);
    setDiaEditado(dia);
  };
  const campo = <K extends keyof DatosChecklist>(clave: K, valor: DatosChecklist[K]) => cambiar(d => ({ ...d, [clave]: valor }));

  // Guardado automático (en la nube, o en el dispositivo si no hay señal).
  useEffect(() => {
    if (!sucio) return;
    const version = edicion;
    const timer = setTimeout(() => {
      const savedAt = new Date().toISOString();
      const entry: BorradorOtroEntry = {
        id, tipo: 'checklist_camioneta', division,
        titulo: `Camioneta ${datos.patente.toUpperCase()} · Turno ${datos.letra} · ${ddmm(fechas[0])} al ${ddmm(fechas[DIAS_CHECKLIST - 1])}`,
        fecha: datos.semanaInicio,
        savedAt,
        datos: datos as unknown as Record<string, unknown>,
      };
      setGuardando(true);
      upsertBorradorOtro(entry)
        .then(() => {
          setGuardadoEn(savedAt);
          setVersionVista(savedAt);
          setEdicionGuardada(version);
          onGuardado(entry);
        })
        .catch(error => {
          console.error('No se pudo guardar el checklist:', error);
          setAviso({ texto: 'No se pudo guardar el checklist. Inténtalo de nuevo.', error: true });
        })
        .finally(() => setGuardando(false));
    }, 700);
    return () => clearTimeout(timer);
  }, [sucio, edicion, datos, id, division, fechas, onGuardado]);


  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 3500);
    return () => clearTimeout(t);
  }, [aviso]);

  // --- Acciones del día -------------------------------------------------------------------------
  const marcar = (itemId: string, valor: Marca) => cambiar(d => {
    const actuales = [...(d.marcas[itemId] ?? [])];
    actuales[dia] = actuales[dia] === valor ? '' : valor;
    return { ...d, marcas: { ...d.marcas, [itemId]: actuales } };
  });

  const marcarSeccion = (ids: string[]) => cambiar(d => {
    const marcas = { ...d.marcas };
    for (const itemId of ids) {
      const actuales = [...marcas[itemId]];
      if (!actuales[dia]) actuales[dia] = 'ok';
      marcas[itemId] = actuales;
    }
    return { ...d, marcas };
  });

  const todoOk = () => cambiar(d => {
    const marcas = { ...d.marcas };
    for (const itemId of Object.keys(marcas)) {
      const actuales = [...marcas[itemId]];
      if (!actuales[dia]) actuales[dia] = 'ok';
      marcas[itemId] = actuales;
    }
    const firmas = [...d.firmas];
    if (!firmas[dia]) firmas[dia] = d.conductor;
    return { ...d, marcas, firmas };
  });

  const copiarAnterior = () => {
    if (dia === 0) return;
    cambiar(d => {
      const marcas = Object.fromEntries(Object.entries(d.marcas).map(([k, v]) => {
        const nuevo = [...v]; nuevo[dia] = v[dia - 1]; return [k, nuevo];
      }));
      const ap = (arr: Respuesta[]) => { const n = [...arr]; n[dia] = arr[dia - 1]; return n; };
      const firmas = [...d.firmas]; firmas[dia] = d.firmas[dia - 1] || firmas[dia];
      return { ...d, marcas, firmas, aptitudes: { alcohol: ap(d.aptitudes.alcohol), aptitud: ap(d.aptitudes.aptitud), medicamento: ap(d.aptitudes.medicamento) } };
    });
    setAviso({ texto: `Se copió el ${ETIQUETAS_DIA[dia - 1].toLowerCase()} ${ddmm(fechas[dia - 1])}.` });
  };

  const limpiarDia = () => {
    if (!window.confirm(`¿Borrar las marcas del ${ETIQUETAS_DIA[dia].toLowerCase()} ${ddmm(fechas[dia])}?`)) return;
    // Para "Deshacer": se guarda lo que tenía ese día (marcas, respuestas y firma).
    const d0 = datos;
    const diaLimpio = dia;
    registrarDeshacer(`Se borraron las marcas del ${ETIQUETAS_DIA[dia].toLowerCase()} ${ddmm(fechas[dia])}`, () => cambiar(d => {
      const marcas = Object.fromEntries(Object.entries(d.marcas).map(([k, v]) => { const n = [...v]; n[diaLimpio] = d0.marcas[k]?.[diaLimpio] ?? ''; return [k, n]; }));
      const ap = (actual: Respuesta[], antes: Respuesta[]) => { const n = [...actual]; n[diaLimpio] = antes[diaLimpio]; return n; };
      const firmas = [...d.firmas]; firmas[diaLimpio] = d0.firmas[diaLimpio];
      return { ...d, marcas, firmas, aptitudes: { alcohol: ap(d.aptitudes.alcohol, d0.aptitudes.alcohol), aptitud: ap(d.aptitudes.aptitud, d0.aptitudes.aptitud), medicamento: ap(d.aptitudes.medicamento, d0.aptitudes.medicamento) } };
    }));
    cambiar(d => {
      const marcas = Object.fromEntries(Object.entries(d.marcas).map(([k, v]) => { const n = [...v]; n[dia] = ''; return [k, n]; }));
      const ap = (arr: Respuesta[]) => { const n = [...arr]; n[dia] = ''; return n; };
      const firmas = [...d.firmas]; firmas[dia] = '';
      return { ...d, marcas, firmas, aptitudes: { alcohol: ap(d.aptitudes.alcohol), aptitud: ap(d.aptitudes.aptitud), medicamento: ap(d.aptitudes.medicamento) } };
    });
  };

  const responder = (clave: keyof DatosChecklist['aptitudes'], valor: Respuesta) => cambiar(d => {
    const arr = [...d.aptitudes[clave]];
    arr[dia] = arr[dia] === valor ? '' : valor;
    return { ...d, aptitudes: { ...d.aptitudes, [clave]: arr } };
  });

  const firmar = (valor: string) => cambiar(d => { const f = [...d.firmas]; f[dia] = valor; return { ...d, firmas: f }; });

  const descargar = (blob: Blob, nombre: string) => {
    saveAs(blob, nombre);
    void registrarActividad('word_generado', nombre, id);
    setAviso({ texto: 'Checklist descargado en Word.' });
  };

  /** ver = true: se abre la vista previa (y desde ahí se descarga); si no, se descarga directo. */
  const generarWord = async (ver: boolean) => {
    setGenerando(ver ? 'ver' : 'descargar');
    try {
      // Firmas cargadas en «Mi perfil»: cada una va en el cuadro del día de ese conductor.
      const blob = await generarChecklistWord(datos, await firmasDivision(division));
      const nombre = nombreArchivoChecklist(datos);
      if (ver) setVista({ blob, nombre });
      else descargar(blob, nombre);
    } catch (error) {
      console.error('No se pudo generar el checklist:', error);
      setAviso({ texto: 'No se pudo generar el Word del checklist.', error: true });
    } finally {
      setGenerando(null);
    }
  };

  // --- Hojas del checklist → Informe Diario (Turno Día de la misma fecha) -----------------------
  const [envio, setEnvio] = useState<{ dia: number; estado: 'enviando' | 'ok' | 'error'; texto?: string } | null>(null);
  const enviandoRef = useRef(false);
  const enviarAlDiario = async (d: number, datosEnvio: DatosChecklist) => {
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    setEnvio({ dia: d, estado: 'enviando' });
    try {
      const blob = await generarChecklistWord(datosEnvio, await firmasDivision(division));
      await enviarChecklistAlDiario({ blob, patente: datosEnvio.patente, fecha: fechas[d], division });
      guardarLocal(claveEnviado(id, d), huella(datosEnvio));
      setEnvio({ dia: d, estado: 'ok' });
    } catch (error) {
      console.error('No se pudo guardar el checklist en el Informe Diario:', error);
      setEnvio({
        dia: d, estado: 'error',
        texto: esErrorDeRed(error) ? 'Sin señal: no se pudieron guardar las hojas en el Informe Diario.' : 'No se pudieron guardar las hojas en el Informe Diario.',
      });
    } finally {
      enviandoRef.current = false;
    }
  };

  // Al completar (o corregir) un día ya guardado, sus 2 hojas se mandan solas al Informe Diario.
  useEffect(() => {
    if (sucio || diaEditado === null) return;
    const a = avanceDia(datos, diaEditado);
    if (a.hechos !== a.total || leerLocal(claveEnviado(id, diaEditado)) === huella(datos)) return;
    const d = diaEditado;
    const t = setTimeout(() => { setDiaEditado(null); void enviarAlDiario(d, datos); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucio, diaEditado, datos, id]);

  const avance = avanceDia(datos, dia);
  const completo = avance.hechos === avance.total;
  const estadoGuardado = guardando || sucio
    ? 'Guardando…'
    : guardadoEn ? `Guardado · ${new Date(guardadoEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}` : 'Se guarda solo';

  const input = (clave: keyof DatosChecklist, etiqueta: string, tipo: 'text' | 'date' | 'number' = 'text', extra?: { placeholder?: string; inputMode?: 'numeric' }) => (
    <label className="block">
      <span className="block text-xs text-[#6B6B6B] font-bold mb-1">{etiqueta}</span>
      <input
        type={tipo}
        value={datos[clave] as string}
        onChange={e => campo(clave, e.target.value as never)}
        placeholder={extra?.placeholder}
        inputMode={extra?.inputMode}
        className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
      />
    </label>
  );

  return (
    <>
      <p className="text-[11px] text-gray-500 text-right -mt-2">{estadoGuardado}</p>

      <details open className="panel p-5">
        <summary className="panel__summary font-display font-bold text-lg">
          <UserRound size={18} className="panel__summary-icon" strokeWidth={2.2} /> Datos de la semana
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <span className="block text-xs text-[#6B6B6B] font-bold mb-1">Nombre del conductor</span>
            <SelectorConductor valor={datos.conductor} onChange={v => campo('conductor', v)} conductores={conductores} letra={datos.letra} />
          </div>
          {input('marca', 'Marca', 'text', { placeholder: 'Ej. Toyota' })}
          {input('modelo', 'Modelo', 'text', { placeholder: 'Ej. Hilux' })}
          {input('anio', 'Año', 'text', { inputMode: 'numeric' })}
          <label className="block">
            <span className="block text-xs text-[#6B6B6B] font-bold mb-1">Patente</span>
            <input value={datos.patente.toUpperCase()} readOnly className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-gray-50" />
          </label>
          {input('fechaUltimaMantencion', 'Fecha última mantención', 'date')}
          {input('kmProximaMantencion', 'Km. próxima mantención', 'text', { inputMode: 'numeric' })}
          {input('fechaControlLicencia', 'Fecha control licencia municipal', 'date')}
          {input('fechaExtintor', 'Extintor incendio portátil vigente (fecha)', 'date')}
          {input('kmInicio', 'Km. inicio de turno', 'text', { inputMode: 'numeric' })}
          {input('kmFin', 'Km. fin de turno', 'text', { inputMode: 'numeric' })}
        </div>
      </details>

      <div className="checklist-dias" role="tablist" aria-label="Día del checklist">
        {fechas.map((fecha, i) => {
          const a = avanceDia(datos, i);
          const estado = a.hechos === 0 ? '' : a.hechos === a.total ? (a.negativos ? 'alerta' : 'listo') : 'parcial';
          return (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={dia === i}
              onClick={() => setDia(i)}
              className={`checklist-dia ${dia === i ? 'checklist-dia--activo' : ''} ${estado ? `checklist-dia--${estado}` : ''}`}
              title={`${ETIQUETAS_DIA[i]} ${ddmm(fecha)} · ${a.hechos}/${a.total}`}
            >
              <span className="checklist-dia__inicial">{INICIALES_DIA[i]}</span>
              <span className="checklist-dia__fecha">{ddmm(fecha)}</span>
              {fecha === hoy && <span className="checklist-dia__hoy">Hoy</span>}
            </button>
          );
        })}
      </div>

      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2">
            <ClipboardCheck size={18} /> {ETIQUETAS_DIA[dia]} {ddmm(fechas[dia])}
            <span className={`checklist-progreso ${completo ? 'checklist-progreso--listo' : ''}`}>{avance.hechos}/{avance.total}</span>
          </h2>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={todoOk} className="checklist-accion checklist-accion--ok"><Check size={14} /> Todo ✓ en este día</button>
            <button type="button" onClick={copiarAnterior} disabled={dia === 0} className="checklist-accion"><Copy size={14} /> Copiar día anterior</button>
            <button type="button" onClick={limpiarDia} className="checklist-accion"><Eraser size={14} /> Limpiar</button>
          </div>
        </div>
        {completo && (
          <div className={`checklist-diario ${envio?.dia === dia && envio.estado === 'error' ? 'checklist-diario--error' : ''}`} role="status">
            {envio?.dia === dia && envio.estado === 'enviando' ? (
              <span className="flex items-center gap-1.5"><Loader2 size={14} className="animate-spin" /> Guardando las 2 hojas en el Informe Diario del {ddmm(fechas[dia])}…</span>
            ) : envio?.dia === dia && envio.estado === 'ok' ? (
              <span className="flex items-center gap-1.5"><Check size={14} /> Hojas guardadas en el Informe Diario (Turno Día {ddmm(fechas[dia])}) · «Registro de Check List de Vehículo Liviano.»</span>
            ) : envio?.dia === dia && envio.estado === 'error' ? (
              <span>{envio.texto}</span>
            ) : (
              <span>Día completo. Sus 2 hojas van como imagen al Informe Diario del {ddmm(fechas[dia])} (Registro de Check List de Vehículo Liviano.).</span>
            )}
            <button type="button" disabled={envio?.estado === 'enviando'} onClick={() => void enviarAlDiario(dia, datos)} className="checklist-accion">
              <Send size={14} /> {envio?.dia === dia && envio.estado === 'error' ? 'Reintentar' : envio?.dia === dia && envio.estado === 'ok' ? 'Volver a enviar' : 'Enviar al Informe Diario'}
            </button>
          </div>
        )}
        <p className="text-xs text-gray-500 mb-4">Marca <strong>✓</strong> si está bien y <strong>X</strong> si está malo o falta. "Todo ✓" completa solo lo que esté vacío (no cambia las X).</p>

        <div className="space-y-5">
          {SECCIONES.map(seccion => (
            <div key={seccion.id}>
              <div className="checklist-seccion">
                <h3>{seccion.titulo}</h3>
                <button type="button" onClick={() => marcarSeccion(seccion.items.map(i => i.id))}>✓ todo</button>
              </div>
              <ul className="checklist-items">
                {seccion.items.map(item => {
                  const valor = datos.marcas[item.id]?.[dia] ?? '';
                  return (
                    <li key={item.id} className={valor === 'x' ? 'checklist-item--x' : ''}>
                      <span>{item.nombre}</span>
                      <div className="checklist-botones" role="group" aria-label={item.nombre}>
                        <button type="button" aria-pressed={valor === 'ok'} className="ok" onClick={() => marcar(item.id, 'ok')} aria-label="Bien"><Check size={16} /></button>
                        <button type="button" aria-pressed={valor === 'x'} className="x" onClick={() => marcar(item.id, 'x')} aria-label="Malo o falta"><X size={16} /></button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2 mb-3">
          <ShieldAlert size={18} /> Aptitudes físicas y psicológicas · {ETIQUETAS_DIA[dia]} {ddmm(fechas[dia])}
        </h2>
        <ul className="checklist-items">
          {([
            ['alcohol', '1.- ¿Se encuentra bajo los efectos de alcohol y/o droga?'],
            ['aptitud', '2.- ¿Se encuentra en aptitudes físicas y psicológicas para conducir?'],
            ['medicamento', '3.- ¿Está tomando algún medicamento?'],
          ] as const).map(([clave, pregunta]) => (
            <li key={clave}>
              <span>{pregunta}</span>
              <div className="checklist-botones checklist-botones--texto" role="group" aria-label={pregunta}>
                {(['SI', 'NO'] as const).map(r => (
                  <button key={r} type="button" aria-pressed={datos.aptitudes[clave][dia] === r} onClick={() => responder(clave, r)}>{r}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        {datos.aptitudes.medicamento.some(r => r === 'SI') && (
          <div className="mt-3">{input('medicamentoCual', '4.- Indicar cuál medicamento')}</div>
        )}
        {requiereAviso(datos, dia) && (
          <p className="checklist-alerta" role="alert">
            <ShieldAlert size={16} /> Debe informar inmediatamente a la Jefatura directa antes de conducir.
          </p>
        )}
        <div className="mt-4">
          <span className="block text-xs text-[#6B6B6B] font-bold mb-1">Firma y nombre del conductor ({ETIQUETAS_DIA[dia].toLowerCase()})</span>
          <div className="flex gap-2">
            <div className="flex-1">
              <SelectorConductor key={dia} valor={datos.firmas[dia]} onChange={firmar} conductores={conductores} letra={datos.letra} vacio="Seleccionar quién conduce este día" />
            </div>
            {datos.conductor && datos.firmas[dia] !== datos.conductor && (
              <button type="button" onClick={() => firmar(datos.conductor)} className="checklist-accion">Usar conductor</button>
            )}
          </div>
        </div>
      </section>

      <details open className="panel p-5">
        <summary className="panel__summary font-display font-bold text-lg">
          <NotebookPen size={18} className="panel__summary-icon" strokeWidth={2.2} /> Sistema DPF y observaciones
        </summary>
        <div className="space-y-3">
          {input('dpf', '6.- ¿Se observa luz de alarma de sistema DPF en panel?', 'text', { placeholder: 'Ej. NO' })}
          {input('limpiezaFiltro', '7.- Con respecto a la pregunta n°6, ¿se efectuó el procedimiento de limpieza del filtro?', 'text', { placeholder: 'Ej. No aplica' })}
          <label className="block">
            <span className="block text-xs text-[#6B6B6B] font-bold mb-1">Observaciones</span>
            <textarea value={datos.observaciones} onChange={e => campo('observaciones', e.target.value)} rows={3} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
          </label>
          <p className="text-xs text-gray-500">La hoja de revisión exterior (abolladuras, rayas y picaduras sobre el dibujo de la camioneta) se mantiene igual en el Word para marcarla a mano si corresponde.</p>
        </div>
      </details>

      <div className="action-zone flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          onClick={() => void generarWord(true)}
          disabled={generando !== null}
          className="btn-outline sm:w-2/5 text-[#0E4660] bg-white py-3.5 px-6 font-bold text-base rounded-md hover:bg-[#d5e7f8] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {generando === 'ver' ? (<><Loader2 size={18} className="animate-spin" /> Preparando…</>) : (<><Eye size={18} /> Ver antes de descargar</>)}
        </button>
        <button
          type="button"
          onClick={() => void generarWord(false)}
          disabled={generando !== null}
          className="btn-primary-field flex-1 text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {generando === 'descargar' ? (<><Loader2 size={18} className="animate-spin" /> Generando checklist…</>) : (<><FileDown size={18} /> Descargar checklist en Word</>)}
        </button>
      </div>

      {vista && (
        <VistaPreviaDocx
          blob={vista.blob}
          titulo={vista.nombre}
          onDescargar={() => descargar(vista.blob, vista.nombre)}
          onCerrar={cerrarVista}
        />
      )}

      {aviso && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${aviso.error ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {aviso.texto}
        </div>
      )}
    </>
  );
}

/** Compara nombres sin importar mayúsculas, tildes ni el segundo apellido ("Juan Morata" = "Juan Morata López"). */
function mismaPersona(a: string, b: string) {
  const palabras = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-zñ ]/g, ' ').split(/\s+/).filter(Boolean);
  const pa = palabras(a); const pb = new Set(palabras(b));
  return pa.length > 0 && pa.every(p => pb.has(p));
}

/** Lista desplegable de conductores (primero los del turno de la semana) con opción de escribir otro nombre. */
function SelectorConductor({ valor, onChange, conductores, letra, vacio = 'Seleccionar conductor' }: {
  valor: string;
  onChange: (v: string) => void;
  conductores: { A: string[]; B: string[] };
  letra: 'A' | 'B';
  vacio?: string;
}) {
  const OTRO = '__otro__';
  const grupos: ['A' | 'B', string[]][] = letra === 'B' ? [['B', conductores.B], ['A', conductores.A]] : [['A', conductores.A], ['B', conductores.B]];
  const todos = [...conductores.A, ...conductores.B];
  const enLista = todos.includes(valor);
  const [escribiendo, setEscribiendo] = useState(Boolean(valor) && !enLista);
  const clase = 'w-full p-2 border border-[#DCE1E6] rounded-md text-sm';

  if (!todos.length) {
    return <input value={valor} onChange={e => onChange(e.target.value)} placeholder={vacio} className={clase} />;
  }

  return (
    <div className="space-y-2">
      <select
        value={escribiendo || (valor && !enLista) ? OTRO : valor}
        onChange={e => {
          if (e.target.value === OTRO) { setEscribiendo(true); return; }
          setEscribiendo(false);
          onChange(e.target.value);
        }}
        className={`${clase} bg-white`}
      >
        <option value="">{vacio}</option>
        {grupos.map(([l, nombres]) => nombres.length > 0 && (
          <optgroup key={l} label={`Turno ${l}`}>
            {nombres.map(n => <option key={n} value={n}>{n}</option>)}
          </optgroup>
        ))}
        <option value={OTRO}>Otro (escribir nombre)…</option>
      </select>
      {(escribiendo || (valor && !enLista)) && (
        <input autoFocus value={valor} onChange={e => onChange(e.target.value)} placeholder="Nombre del conductor" className={clase} />
      )}
    </div>
  );
}
