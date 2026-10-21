// Informe de Mantención Preventiva de sitio (carro LTE): formulario + Word con el formato del
// informe de referencia. Pensado para llenarse rápido en terreno:
//  - El sitio completa solo el sector y las coordenadas (las que se escriban quedan recordadas).
//  - Las fotos ya vienen con su casilla y su leyenda; solo hay que tomarlas (cámara, galería,
//    pegar con Ctrl+V o escanear los documentos en papel). Las casillas vacías no salen en el Word.
//  - Bancos de baterías, dados de concreto, vientos y enlaces MMOO se ajustan con un número.
//  - El personal se carga del turno; se marca quién ejecutó y la bitácora se arma sola.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Camera, Check, ChevronDown, ClipboardList, Copy, FileText, Image as ImageIcon, Loader2, MapPin, Minus,
  Plus, RefreshCw, Save, ScanLine, Trash2, Users, X,
} from 'lucide-react';
import logoPsinet from '../../assets/logo_psinet.jpg';
import logoEdificio from '../../assets/LogoEdificio.png';
import EscanerDocumento from '../../componentes/EscanerDocumento';
import VisorFoto, { copiarImagenAlPortapapel } from '../../componentes/VisorFoto';
import { pareceDocumento } from '../../lib/documentosEscaneables';
import { fileToDataUrl, uid } from '../../lib/fotos';
import { registrarActividad } from '../../lib/actividad';
import { mapaFotosSubidas, aplicarFotosSubidas } from '../../lib/storage';
import { borrandose, registrarDeshacer, reinsertar } from '../../lib/deshacer';
import { type BorradorOtroEntry, upsertBorradorOtro, deleteBorradorOtro } from '../../datos/borradoresOtros';
import { hoyLocalISO } from '../../datos/fechas';
import { letraDeFecha } from '../../datos/turnos';
import { configDivision } from '../../datos/divisiones';
import { TRABAJADORES } from '../../datos/trabajadores';
import { getPersonalGuardado } from '../diario/constantes';
import { useSesion } from '../../auth/sesion';
import {
  type DatosPreventiva, type FilaBitacora, type FotoPrev, type ModoPersonal, type PersonaPrev, type SeccionPrev,
  ADMINISTRATIVAS_DEFECTO, CANTIDAD_DE, CIERRE_DESCRIPCION, COORDENADAS_CONOCIDAS, actividadesDeSecciones, bitacoraDefecto,
  casillaNueva, nombreEnlace, planificadasDefecto, rehacerCasillas, seccionExtra, seccionesPorDefecto, sinPunto, trabajosDeSecciones,
} from './modelo';
import { generarPreventivaWord, nombreArchivoPreventiva } from './word';

interface Props {
  onBack: () => void;
  borradorInicial?: BorradorOtroEntry | null;
}

const LS_COORDENADAS = 'psinet_coordenadas_sitios_v1';
const leerCoordenadas = (): Record<string, string> => {
  try { return { ...COORDENADAS_CONOCIDAS, ...JSON.parse(localStorage.getItem(LS_COORDENADAS) || '{}') }; } catch { return { ...COORDENADAS_CONOCIDAS }; }
};
const recordarCoordenadas = (sitio: string, coord: string) => {
  try {
    const actual = JSON.parse(localStorage.getItem(LS_COORDENADAS) || '{}') as Record<string, string>;
    localStorage.setItem(LS_COORDENADAS, JSON.stringify({ ...actual, [sitio]: coord }));
  } catch { /* sin almacenamiento */ }
};

const PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eef1f2'/%3E%3C/svg%3E";
const campo = 'w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-white';
const etiqueta = 'block text-xs text-[#6B6B6B] font-bold mb-1';
const btnSec = 'btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] inline-flex items-center gap-1';

/** Lista de líneas editable (actividades, administrativas…). */
function ListaEditable({ items, onChange, placeholder, agregar }: { items: string[]; onChange: (v: string[]) => void; placeholder: string; agregar: string }) {
  return (
    <div className="space-y-1.5">
      {items.map((t, i) => (
        <div key={i} className="flex gap-1.5">
          <input type="text" value={t} placeholder={placeholder} onChange={e => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} className={campo} />
          <button type="button" aria-label="Quitar línea" onClick={() => {
            onChange(items.filter((_, k) => k !== i));
            registrarDeshacer(`Se quitó «${t.trim().slice(0, 40) || 'una línea vacía'}»`, () => onChange(reinsertar(items.filter((_, k) => k !== i), i, t)));
          }} className="bg-red-50 text-red-700 px-2 rounded-md hover:bg-red-100"><Trash2 size={14} /></button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...items, ''])} className={btnSec}><Plus size={13} /> {agregar}</button>
    </div>
  );
}

function Panel({ icono, titulo, resumen, children, abierto = true }: { icono: ReactNode; titulo: string; resumen?: string; children: ReactNode; abierto?: boolean }) {
  return (
    <details open={abierto} className="panel p-4 sm:p-5">
      <summary className="panel__summary font-display font-bold text-lg">
        {icono} {titulo}
        {resumen && <span className="ml-auto text-xs font-sans font-bold text-gray-500">{resumen}</span>}
      </summary>
      {children}
    </details>
  );
}

export default function InformePreventiva({ onBack, borradorInicial = null }: Props) {
  const { division } = useSesion();
  const cfg = configDivision(division);
  const { carros, ubicacionPorCarro } = cfg;
  const d0 = (borradorInicial?.datos ?? null) as Partial<DatosPreventiva> | null;

  const [fecha, setFecha] = useState(() => d0?.fecha ?? hoyLocalISO());
  const [sitio, setSitio] = useState(() => d0?.sitio ?? carros[0] ?? '');
  const [sector, setSector] = useState(() => d0?.sector ?? ubicacionPorCarro[carros[0]] ?? '');
  const [coordenadas, setCoordenadas] = useState(() => d0?.coordenadas ?? leerCoordenadas()[carros[0]] ?? '');
  const [sitioAMano, setSitioAMano] = useState(() => !!d0?.sitio && !carros.includes(d0.sitio));
  const [portada, setPortada] = useState<string | null>(() => d0?.portada ?? null);

  const creadoresLista = useMemo(() => {
    const vistos = new Set<string>();
    return [...cfg.diario.creadoPor.A, ...cfg.diario.creadoPor.B]
      .map(p => ({ nombre: sinPunto(p.nombre), cargo: sinPunto(p.cargo) }))
      .filter(p => !vistos.has(p.nombre) && vistos.add(p.nombre));
  }, [cfg]);
  const creadorDefecto = cfg.diario.creadorPorDefecto[letraDeFecha(hoyLocalISO()) === 'B' ? 'B' : 'A'];
  const [creadoNombre, setCreadoNombre] = useState(() => d0?.creadoNombre ?? sinPunto(creadorDefecto.nombre));
  const [creadoCargo, setCreadoCargo] = useState(() => d0?.creadoCargo ?? sinPunto(creadorDefecto.cargo));
  const [creadoAMano, setCreadoAMano] = useState(false);
  const [revisados, setRevisados] = useState<string[]>(() => d0?.revisados ?? cfg.falla.revisadoText.split('\n').map(sinPunto).filter(Boolean));
  const [autorizadoNombre, setAutorizadoNombre] = useState(() => d0?.autorizadoNombre ?? (division === 'el_salvador' ? 'Cesar Orellana Martinez.' : cfg.diario.autorizado.nombre));
  const [autorizadoCargo, setAutorizadoCargo] = useState(() => d0?.autorizadoCargo ?? cfg.diario.autorizado.cargo);

  const personalDelTurno = (iso: string): PersonaPrev[] =>
    getPersonalGuardado(letraDeFecha(iso), division).map(p => ({ id: uid(), nombre: sinPunto(p.nombre), cargo: sinPunto(p.cargo), ejecutante: false }));
  const [personal, setPersonal] = useState<PersonaPrev[]>(() => d0?.personal ?? personalDelTurno(d0?.fecha ?? hoyLocalISO()));

  const [secciones, setSecciones] = useState<SeccionPrev[]>(() => d0?.secciones ?? seccionesPorDefecto(cfg.vertiv));
  const [actividades, setActividades] = useState<string[]>(() => d0?.actividades ?? actividadesDeSecciones(secciones));
  const [cierreDescripcion, setCierreDescripcion] = useState(() => d0?.cierreDescripcion ?? CIERRE_DESCRIPCION);
  const [administrativas, setAdministrativas] = useState<string[]>(() => d0?.administrativas ?? ADMINISTRATIVAS_DEFECTO);
  const [planificadas, setPlanificadas] = useState<string[]>(() => d0?.planificadas ?? planificadasDefecto(sitio, sector));
  const [bitacora, setBitacora] = useState<FilaBitacora[]>(() => d0?.bitacora ?? bitacoraDefecto(sitio, sector, secciones));
  // Mientras no se editen a mano, las planificadas y la bitácora siguen al sitio elegido.
  const planificadasTocadasRef = useRef(!!d0);

  const [generando, setGenerando] = useState(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [escanear, setEscanear] = useState<{ seccion: string; foto: string } | null>(null);
  const [seleccion, setSeleccion] = useState<{ seccion: string; foto: string } | null>(null);
  const showToast = (text: string, error = false) => { setToast({ text, error }); setTimeout(() => setToast(null), 3500); };

  // --- Sitio ---
  const elegirSitio = (valor: string) => {
    if (valor === '__otro') { setSitioAMano(true); return; }
    setSitioAMano(false);
    setSitio(valor);
    setSector(ubicacionPorCarro[valor] ?? '');
    setCoordenadas(leerCoordenadas()[valor] ?? '');
    if (!planificadasTocadasRef.current) {
      setPlanificadas(planificadasDefecto(valor, ubicacionPorCarro[valor] ?? ''));
      setBitacora(prev => prev.map((f, i) => (i === 1 && f.actividades[0]?.startsWith('Se realiza mantenimiento preventivo sitio')
        ? { ...f, actividades: [`Se realiza mantenimiento preventivo sitio ${[valor, (ubicacionPorCarro[valor] ?? '').toUpperCase()].filter(Boolean).join(' ')}`, ...f.actividades.slice(1)] }
        : f)));
    }
  };

  // --- Personal ---
  const cambiarPersona = (id: string, patch: Partial<PersonaPrev>) => setPersonal(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  const quitarPersona = (id: string) => {
    const i = personal.findIndex(p => p.id === id);
    const quitada = personal[i];
    setPersonal(prev => prev.filter(p => p.id !== id));
    if (quitada) registrarDeshacer(`Se quitó a ${quitada.nombre || 'una persona'}`, () => setPersonal(prev => reinsertar(prev, i, quitada)));
  };
  const listaTrabajadores = TRABAJADORES[division];
  const cargoDe = (nombre: string) => {
    const n = sinPunto(nombre).toLowerCase();
    if (!n) return '';
    const t = listaTrabajadores.find(x => x.nombre.toLowerCase().includes(n) || n.split(' ').every(p => x.nombre.toLowerCase().includes(p)));
    return t?.cargo ?? '';
  };
  const nombresSugeridos = useMemo(() => {
    const set = new Set<string>([...getPersonalGuardado('A', division), ...getPersonalGuardado('B', division)].map(p => sinPunto(p.nombre)));
    return [...set];
  }, [division]);

  // --- Secciones y fotos ---
  const cambiarSeccion = (id: string, f: (s: SeccionPrev) => SeccionPrev) => setSecciones(prev => prev.map(s => (s.id === id ? f(s) : s)));
  const cambiarFoto = (sid: string, fid: string, patch: Partial<FotoPrev>) =>
    cambiarSeccion(sid, s => ({ ...s, fotos: s.fotos.map(f => (f.id === fid ? { ...f, ...patch } : f)) }));
  const asignarFoto = async (sid: string, fid: string, file: File) => cambiarFoto(sid, fid, { photo: await fileToDataUrl(file) });
  const quitarCasilla = (sid: string, fid: string) => {
    const s = secciones.find(x => x.id === sid);
    const i = s?.fotos.findIndex(f => f.id === fid) ?? -1;
    const quitada = s?.fotos[i];
    cambiarSeccion(sid, x => ({ ...x, fotos: x.fotos.filter(f => f.id !== fid) }));
    if (quitada) registrarDeshacer('Se quitó una casilla de foto', () => cambiarSeccion(sid, x => ({ ...x, fotos: reinsertar(x.fotos, i, quitada) })));
  };
  const totalFotos = secciones.filter(s => s.activa).reduce((n, s) => n + s.fotos.length, 0);
  const fotosListas = secciones.filter(s => s.activa).reduce((n, s) => n + s.fotos.filter(f => f.photo).length, 0);

  // Ctrl+V sobre la casilla elegida; la selección avanza sola a la siguiente casilla vacía.
  const seccionesRef = useRef(secciones);
  useEffect(() => { seccionesRef.current = secciones; }, [secciones]);
  useEffect(() => {
    if (!seleccion) return;
    const alPegar = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void asignarFoto(seleccion.seccion, seleccion.foto, file);
      const casillas = seccionesRef.current.filter(s => s.activa).flatMap(s => s.fotos.map(f => ({ seccion: s.id, foto: f.id, vacia: !f.photo })));
      const idx = casillas.findIndex(c => c.foto === seleccion.foto);
      const siguiente = casillas.slice(idx + 1).find(c => c.vacia);
      setSeleccion(siguiente ? { seccion: siguiente.seccion, foto: siguiente.foto } : null);
    };
    document.addEventListener('paste', alPegar);
    return () => document.removeEventListener('paste', alPegar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seleccion]);

  // --- Bitácora ---
  const cambiarFila = (id: string, patch: Partial<FilaBitacora>) => setBitacora(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));

  // --- Borrador en la nube (lista de Mantenimiento, con clase "preventiva") ---
  const [draftId, setDraftId] = useState(() => borradorInicial?.id ?? crypto.randomUUID());
  const enNubeRef = useRef(!!borradorInicial);
  const pausarRef = useRef(false);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(borradorInicial?.savedAt ?? null);
  const [guardando, setGuardando] = useState(false);
  const datos: DatosPreventiva = {
    clase: 'preventiva', fecha, sitio, sector, coordenadas, creadoNombre, creadoCargo, revisados, autorizadoNombre, autorizadoCargo,
    portada, actividades, cierreDescripcion, personal, administrativas, planificadas, secciones, bitacora,
  };
  const datosRef = useRef(datos);
  useEffect(() => { datosRef.current = datos; });
  const primeraVezRef = useRef(true);
  useEffect(() => {
    if (primeraVezRef.current) { primeraVezRef.current = false; return; }
    if (pausarRef.current) { pausarRef.current = false; return; }
    const d = datosRef.current;
    const tieneFotos = d.secciones.some(s => s.fotos.some(f => f.photo)) || !!d.portada;
    if (!tieneFotos && !enNubeRef.current) return;
    const t = setTimeout(() => {
      const entry: BorradorOtroEntry = {
        id: draftId, tipo: 'mantenimiento', division, fecha: d.fecha, savedAt: new Date().toISOString(),
        titulo: `Mantención preventiva · ${d.sitio.trim() || 'sin sitio'}`,
        datos: d as unknown as Record<string, unknown>,
      };
      setGuardando(true);
      upsertBorradorOtro(entry)
        .then(g => {
          const subidas = mapaFotosSubidas(entry.datos, g.datos);
          if (subidas.size) {
            setSecciones(prev => aplicarFotosSubidas(prev, subidas));
            setPortada(prev => aplicarFotosSubidas(prev, subidas));
          }
          enNubeRef.current = true;
          setGuardadoEn(g.savedAt);
        })
        .catch(error => { console.error('No se pudo guardar el borrador:', error); showToast('No se pudo sincronizar el borrador con la nube. Revisa tu conexión.', true); })
        .finally(() => setGuardando(false));
    }, 900);
    return () => clearTimeout(t);
  }, [
    draftId, division, fecha, sitio, sector, coordenadas, creadoNombre, creadoCargo, revisados, autorizadoNombre, autorizadoCargo,
    portada, actividades, cierreDescripcion, personal, administrativas, planificadas, secciones, bitacora,
  ]);

  const borrarBorrador = () => {
    const idPrevio = draftId;
    const habia = enNubeRef.current;
    const guardadoPrevio = guardadoEn;
    enNubeRef.current = false;
    pausarRef.current = true;
    setGuardadoEn(null);
    setDraftId(crypto.randomUUID());
    if (habia) borrandose.add(idPrevio);
    registrarDeshacer('Se eliminó el borrador', () => {
      borrandose.delete(idPrevio); setDraftId(idPrevio); enNubeRef.current = habia; setGuardadoEn(guardadoPrevio);
    }, () => {
      if (!habia) return;
      deleteBorradorOtro(idPrevio).catch(() => showToast('No se pudo eliminar el borrador en la nube.', true)).finally(() => borrandose.delete(idPrevio));
    });
  };

  // --- Word ---
  const generar = async () => {
    if (!sitio.trim()) { showToast('Indica el sitio.', true); return; }
    if (!fecha) { showToast('Selecciona la fecha.', true); return; }
    if (!fotosListas) { showToast('Agrega al menos una foto.', true); return; }
    if (!personal.some(p => p.ejecutante)) { showToast('Marca quién ejecutó el mantenimiento (en Personal).', true); return; }
    setGenerando(true);
    try {
      const blob = await generarPreventivaWord(datosRef.current);
      const nombre = nombreArchivoPreventiva(datosRef.current);
      saveAs(blob, nombre);
      void registrarActividad('word_generado', nombre, draftId);
      showToast(`Documento generado: ${nombre}`);
    } catch (error) {
      console.error(error);
      showToast('No se pudo generar el Word.', true);
    } finally {
      setGenerando(false);
    }
  };

  const fotoCasilla = (s: SeccionPrev, f: FotoPrev) => {
    const elegida = seleccion?.foto === f.id;
    const esDoc = f.formato === 'doc' || pareceDocumento(f.descripcion, f.titulo, s.titulo);
    return (
      <div key={f.id} className={`rounded-lg border p-2 bg-white flex gap-2 ${elegida ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-[#DCE1E6]'}`}
        onClick={() => setSeleccion({ seccion: s.id, foto: f.id })}>
        <div className="w-[96px] flex-none">
          <div className="relative">
            <img src={f.photo || PLACEHOLDER} alt="" onClick={e => { if (f.photo) { e.stopPropagation(); setFotoAmpliada(f.photo); } }}
              className={`w-full h-[72px] object-cover rounded bg-[#eef1f2] ${f.photo ? 'cursor-zoom-in' : ''}`} />
            {f.photo ? (
              <span className="absolute top-1 right-1 bg-[#1e8e3e] text-white rounded-full w-4 h-4 flex items-center justify-center"><Check size={11} /></span>
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-[10px] text-gray-400 pointer-events-none">{elegida ? 'Ctrl+V' : 'Sin foto'}</span>
            )}
            {f.photo && (
              <button type="button" aria-label="Copiar imagen" onClick={async e => { e.stopPropagation(); const ok = await copiarImagenAlPortapapel(f.photo!); showToast(ok ? 'Imagen copiada.' : 'No se pudo copiar la imagen.', !ok); }}
                className="absolute top-1 left-1 bg-black/55 text-white rounded-full w-5 h-5 flex items-center justify-center"><Copy size={11} /></button>
            )}
          </div>
          <input type="file" accept="image/*" capture="environment" id={`pv-cam-${f.id}`} className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void asignarFoto(s.id, f.id, file); e.target.value = ''; }} />
          <input type="file" accept="image/*" id={`pv-gal-${f.id}`} className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void asignarFoto(s.id, f.id, file); e.target.value = ''; }} />
          <div className="flex gap-1 mt-1">
            <label htmlFor={`pv-cam-${f.id}`} title="Tomar foto" className="flex-1 flex items-center justify-center bg-[#0E4660] text-white rounded py-1 cursor-pointer"><Camera size={13} /></label>
            <label htmlFor={`pv-gal-${f.id}`} title="Elegir de la galería" className="flex-1 flex items-center justify-center bg-gray-200 text-gray-700 rounded py-1 cursor-pointer"><ImageIcon size={13} /></label>
            <button type="button" title="Escanear documento" onClick={e => { e.stopPropagation(); setEscanear({ seccion: s.id, foto: f.id }); }}
              className={`flex-1 flex items-center justify-center rounded py-1 ${esDoc ? 'bg-[#ED7D31] text-white' : 'bg-[#e3edf3] text-[#0E4660]'}`}><ScanLine size={13} /></button>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          {(f.titulo || f.formato === 'grande' || f.formato === 'consola') && (
            <input type="text" value={f.titulo} onChange={e => cambiarFoto(s.id, f.id, { titulo: e.target.value })} placeholder="Título (negrita)" aria-label="Título de la foto"
              className="w-full text-xs font-bold p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]" />
          )}
          <textarea value={f.descripcion} rows={2} onChange={e => cambiarFoto(s.id, f.id, { descripcion: e.target.value })}
            placeholder={f.formato === 'consola' ? 'Detalle (ej: Enlace a carro CMM-06.)' : 'Descripción'} aria-label="Descripción de la foto"
            className="w-full text-xs p-1.5 border border-[#DCE1E6] rounded resize-y" />
          {f.valor !== undefined && (
            <input type="text" inputMode="decimal" value={f.valor} onChange={e => cambiarFoto(s.id, f.id, { valor: e.target.value })}
              onBlur={e => { const v = e.target.value.trim(); if (/^\d+([.,]\d+)?$/.test(v)) cambiarFoto(s.id, f.id, { valor: `${v.replace('.', ',')} VDC` }); }}
              placeholder="Medición (ej: 56,5)" aria-label="Medición en VDC" className="w-full text-xs font-bold p-1.5 border border-[#f1c69d] bg-[#fff8f1] rounded" />
          )}
          <div className="flex gap-2 text-[11px]">
            {f.photo && <button type="button" onClick={e => { e.stopPropagation(); cambiarFoto(s.id, f.id, { photo: null }); }} className="text-gray-500 underline">Quitar foto</button>}
            {f.k.startsWith('mano-') && <button type="button" onClick={e => { e.stopPropagation(); quitarCasilla(s.id, f.id); }} className="text-red-700 underline">Quitar casilla</button>}
          </div>
        </div>
      </div>
    );
  };

  const opcionesSitio = carros.map(c => ({ valor: c, texto: ubicacionPorCarro[c] ? `${c} — ${ubicacionPorCarro[c]}` : c }));
  const enCreadores = creadoresLista.find(p => p.nombre === sinPunto(creadoNombre) && p.cargo === sinPunto(creadoCargo));
  const valorCreado = creadoAMano ? '__otro' : enCreadores ? `${enCreadores.nombre}|${enCreadores.cargo}` : '__actual';
  const portadaEfectiva = portada || secciones.find(s => s.clave === 'vista' && s.activa)?.fotos.find(f => f.photo)?.photo || null;

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Mantención preventiva de sitio</div>
              <div className="site-header__meta text-xs truncate">Mismo formato que los reportes de mantención preventiva (portada, encabezado, fotos y bitácora)</div>
            </div>
          </div>
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[1000px] mx-auto p-3 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <button type="button" onClick={onBack} className={btnSec}><ArrowLeft size={14} /> Volver al menú</button>
          <div className="text-xs text-gray-500 flex items-center gap-2">
            {guardando ? (
              <span className="inline-flex items-center gap-1 font-bold text-[#0E4660]"><Loader2 size={12} className="animate-spin" /> Guardando…</span>
            ) : guardadoEn ? (
              <>
                <span className="inline-flex items-center gap-1 font-bold text-[#0E4660]"><Save size={12} /> Guardado · {new Date(guardadoEn).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
                <button type="button" onClick={borrarBorrador} className="inline-flex items-center gap-1 underline hover:text-red-700"><X size={12} /> Borrar borrador</button>
              </>
            ) : <span>Se guarda solo (en la nube) apenas cargues la primera foto.</span>}
          </div>
        </div>

        <Panel icono={<MapPin size={18} className="panel__summary-icon" />} titulo="1. Sitio y portada" resumen={sitio}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta} htmlFor="pv-fecha">Fecha</label>
              <input id="pv-fecha" type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="pv-sitio">Sitio</label>
              <select id="pv-sitio" value={sitioAMano ? '__otro' : sitio} onChange={e => elegirSitio(e.target.value)} className={campo}>
                {opcionesSitio.map(o => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
                <option value="__otro">Otro sitio (escribir)…</option>
              </select>
              {sitioAMano && <input type="text" value={sitio} onChange={e => setSitio(e.target.value)} placeholder="Ej: LTE_CMM_11" aria-label="Código del sitio" className={`${campo} mt-1.5`} />}
            </div>
            <div>
              <label className={etiqueta} htmlFor="pv-sector">Sector</label>
              <input id="pv-sector" type="text" value={sector} onChange={e => setSector(e.target.value)} placeholder="Ej: Cerro La Ballena" className={campo} />
            </div>
            <div>
              <label className={etiqueta} htmlFor="pv-coord">Coordenadas</label>
              <input id="pv-coord" type="text" value={coordenadas} onChange={e => setCoordenadas(e.target.value)} onBlur={() => { if (sitio.trim() && coordenadas.trim()) recordarCoordenadas(sitio.trim(), coordenadas.trim()); }}
                placeholder="Ej: -26.254449, -69.540413" className={campo} />
              <p className="text-[11px] text-gray-500 mt-0.5">Quedan recordadas para la próxima vez que elijas este sitio.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <img src={portadaEfectiva || PLACEHOLDER} alt="" className="w-[64px] h-[88px] object-cover rounded border border-[#DCE1E6]" />
            <div className="text-xs text-gray-600 flex-1 min-w-[180px]">
              <p className="font-bold text-[#0E4660]">Foto de portada</p>
              <p>{portada ? 'Foto elegida.' : portadaEfectiva ? 'Se usa la vista general del sitio.' : 'Se usa la foto de la plantilla (o la vista general, cuando la cargues).'}</p>
              <div className="flex gap-2 mt-1">
                <label htmlFor="pv-portada" className={`${btnSec} cursor-pointer`}><ImageIcon size={13} /> Elegir otra</label>
                <input id="pv-portada" type="file" accept="image/*" className="hidden" onChange={async e => { const file = e.target.files?.[0]; if (file) setPortada(await fileToDataUrl(file)); e.target.value = ''; }} />
                {portada && <button type="button" onClick={() => setPortada(null)} className="text-xs underline">Usar la vista general</button>}
              </div>
            </div>
          </div>
        </Panel>

        <Panel icono={<FileText size={18} className="panel__summary-icon" />} titulo="2. Firmas de la portada" resumen={sinPunto(creadoNombre)} abierto={false}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className={etiqueta} htmlFor="pv-creado">Creado por</label>
              <select id="pv-creado" value={valorCreado} onChange={e => {
                const v = e.target.value;
                if (v === '__otro') { setCreadoAMano(true); return; }
                setCreadoAMano(false);
                if (v === '__actual') return;
                const [n, c] = v.split('|'); setCreadoNombre(n); setCreadoCargo(c);
              }} className={campo}>
                {!enCreadores && !creadoAMano && <option value="__actual">{sinPunto(creadoNombre)} · {creadoCargo}</option>}
                {creadoresLista.map(p => <option key={p.nombre} value={`${p.nombre}|${p.cargo}`}>{p.nombre} · {p.cargo}</option>)}
                <option value="__otro">Otra persona…</option>
              </select>
              {creadoAMano && (
                <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                  <input type="text" value={creadoNombre} onChange={e => setCreadoNombre(e.target.value)} placeholder="Nombre" aria-label="Nombre de quien crea" className={campo} />
                  <input type="text" value={creadoCargo} onChange={e => setCreadoCargo(e.target.value)} placeholder="Cargo" aria-label="Cargo de quien crea" className={campo} />
                </div>
              )}
            </div>
            <div>
              <span className={etiqueta}>Autorizado por</span>
              <div className="grid grid-cols-[1fr_90px] gap-1.5">
                <input type="text" value={autorizadoNombre} onChange={e => setAutorizadoNombre(e.target.value)} aria-label="Autorizado por" className={campo} />
                <input type="text" value={autorizadoCargo} onChange={e => setAutorizadoCargo(e.target.value)} aria-label="Cargo de quien autoriza" className={campo} />
              </div>
            </div>
            <div className="md:col-span-2">
              <span className={etiqueta}>Revisado por</span>
              <ListaEditable items={revisados} onChange={setRevisados} placeholder="Nombre" agregar="Agregar revisor" />
            </div>
          </div>
        </Panel>

        <Panel icono={<Users size={18} className="panel__summary-icon" />} titulo="3. Personal"
          resumen={`${personal.length} en turno · ${personal.filter(p => p.ejecutante).length} ejecutantes`}>
          <p className="text-xs text-gray-500 mb-2">Marca <strong>Ejecutó</strong> a quienes hicieron el mantenimiento: van en "Personal Ejecutante" y en la bitácora.</p>
          <div className="space-y-1.5">
            {personal.map(p => (
              <div key={p.id} className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.2fr_1fr_auto_auto] gap-1.5 items-center">
                <input type="text" value={p.nombre} list="pv-personas" placeholder="Nombre" aria-label="Nombre"
                  onChange={e => cambiarPersona(p.id, { nombre: e.target.value })}
                  onBlur={e => { if (!p.cargo.trim()) { const c = cargoDe(e.target.value); if (c) cambiarPersona(p.id, { cargo: c }); } }} className={campo} />
                <label className={`sm:order-3 flex items-center gap-1 text-xs font-bold px-2 py-2 rounded-md border cursor-pointer select-none ${p.ejecutante ? 'bg-[#e6f4ea] border-[#b9dfb9] text-[#1e6b34]' : 'border-[#DCE1E6] text-gray-500'}`}>
                  <input type="checkbox" checked={p.ejecutante} onChange={e => cambiarPersona(p.id, { ejecutante: e.target.checked })} className="accent-[#1e8e3e]" /> Ejecutó
                </label>
                <input type="text" value={p.cargo} placeholder="Cargo" aria-label="Cargo" onChange={e => cambiarPersona(p.id, { cargo: e.target.value })} className={`${campo} sm:order-2`} />
                <button type="button" aria-label="Quitar persona" onClick={() => quitarPersona(p.id)} className="sm:order-4 bg-red-50 text-red-700 px-2 py-2 rounded-md hover:bg-red-100 justify-self-end"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <datalist id="pv-personas">{nombresSugeridos.map(n => <option key={n} value={n} />)}</datalist>
          <div className="flex gap-2 flex-wrap mt-2">
            <button type="button" onClick={() => setPersonal(prev => [...prev, { id: uid(), nombre: '', cargo: '', ejecutante: true }])} className={btnSec}><Plus size={13} /> Agregar persona</button>
            <button type="button" onClick={() => setPersonal(personalDelTurno(fecha))} className={btnSec}><RefreshCw size={13} /> Cargar personal del Turno {letraDeFecha(fecha)}</button>
          </div>
        </Panel>

        <Panel icono={<ClipboardList size={18} className="panel__summary-icon" />} titulo="4. Descripción y actividades" abierto={false}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className={etiqueta}>Actividades realizadas (descripción)</span>
            <button type="button" onClick={() => setActividades(actividadesDeSecciones(secciones))} className="text-[11px] font-bold text-[#0E4660] underline">Rehacer según las secciones</button>
          </div>
          <ListaEditable items={actividades} onChange={setActividades} placeholder="Actividad" agregar="Agregar actividad" />
          <label className={`${etiqueta} mt-3`} htmlFor="pv-cierre">Texto final de la descripción</label>
          <textarea id="pv-cierre" value={cierreDescripcion} rows={2} onChange={e => setCierreDescripcion(e.target.value)} className={campo} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <span className={etiqueta}>Actividades administrativas</span>
              <ListaEditable items={administrativas} onChange={setAdministrativas} placeholder="Actividad" agregar="Agregar" />
            </div>
            <div>
              <span className={etiqueta}>Actividades planificadas</span>
              <ListaEditable items={planificadas} onChange={v => { planificadasTocadasRef.current = true; setPlanificadas(v); }} placeholder="Actividad" agregar="Agregar" />
            </div>
          </div>
        </Panel>

        <Panel icono={<Camera size={18} className="panel__summary-icon" />} titulo="5. Registro fotográfico" resumen={`${fotosListas}/${totalFotos} fotos`}>
          <p className="text-xs text-gray-500 mb-3">Toca una casilla y toma la foto, elígela de la galería o pégala con Ctrl+V (la selección pasa sola a la siguiente vacía). Las casillas sin foto no salen en el Word. Desactiva las secciones que no apliquen al sitio.</p>
          <div className="space-y-3">
            {secciones.map(s => {
              const cant = CANTIDAD_DE[s.clave];
              const listas = s.fotos.filter(f => f.photo).length;
              return (
                <details key={s.id} open={s.activa} className={`rounded-lg border ${s.activa ? 'border-[#cfdbe3] bg-[#f7fafc]' : 'border-dashed border-[#DCE1E6] bg-white opacity-70'}`}>
                  <summary className="flex items-center gap-2 p-2.5 cursor-pointer list-none">
                    <ChevronDown size={15} className="text-gray-400 flex-none" />
                    <span className="font-bold text-sm text-[#0E4660] flex-1 min-w-0 truncate">{s.titulo}</span>
                    <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${listas === s.fotos.length && listas ? 'bg-[#e6f4ea] text-[#1e6b34]' : 'bg-gray-100 text-gray-500'}`}>{listas}/{s.fotos.length}</span>
                    <label className="flex items-center gap-1 text-[11px] font-bold text-gray-600" onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={s.activa} onChange={e => cambiarSeccion(s.id, x => ({ ...x, activa: e.target.checked }))} /> Incluir
                    </label>
                  </summary>
                  {s.activa && (
                    <div className="px-2.5 pb-2.5 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {s.mostrarTitulo && (
                          <input type="text" value={s.titulo} onChange={e => cambiarSeccion(s.id, x => ({ ...x, titulo: e.target.value }))} aria-label="Título de la sección"
                            className="flex-1 min-w-[200px] text-xs p-1.5 border border-[#DCE1E6] rounded" />
                        )}
                        {cant && (
                          <div className="flex items-center gap-1 text-xs font-bold text-gray-600">
                            {cant.etiqueta}:
                            <button type="button" aria-label={`Menos ${cant.etiqueta}`} disabled={(s.cantidad ?? 0) <= 1}
                              onClick={() => cambiarSeccion(s.id, x => rehacerCasillas(x, Math.max(1, (x.cantidad ?? 1) - 1)))}
                              className="w-7 h-7 rounded border border-[#DCE1E6] bg-white flex items-center justify-center disabled:opacity-40"><Minus size={13} /></button>
                            <span className="w-5 text-center">{s.cantidad}</span>
                            <button type="button" aria-label={`Más ${cant.etiqueta}`} disabled={(s.cantidad ?? 0) >= cant.max}
                              onClick={() => cambiarSeccion(s.id, x => rehacerCasillas(x, Math.min(cant.max, (x.cantidad ?? 0) + 1)))}
                              className="w-7 h-7 rounded border border-[#DCE1E6] bg-white flex items-center justify-center disabled:opacity-40"><Plus size={13} /></button>
                          </div>
                        )}
                      </div>
                      {s.clave === 'consolas' && (
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          <span className="font-bold text-gray-600">Enlaces MMOO:</span>
                          {(s.enlaces ?? []).map(e => (
                            <span key={e} className="inline-flex items-center gap-1 bg-white border border-[#DCE1E6] rounded-full px-2 py-0.5">
                              {e}
                              <button type="button" aria-label={`Quitar enlace ${e}`} onClick={() => cambiarSeccion(s.id, x => rehacerCasillas(x, x.cantidad, (x.enlaces ?? []).filter(y => y !== e)))}><X size={11} /></button>
                            </span>
                          ))}
                          <select value="" aria-label="Agregar enlace MMOO" onChange={e => {
                            const v = e.target.value; if (!v) return;
                            cambiarSeccion(s.id, x => (x.enlaces ?? []).includes(v) ? x : rehacerCasillas(x, x.cantidad, [...(x.enlaces ?? []), v]));
                          }} className="border border-[#DCE1E6] rounded-md text-xs p-1 bg-white">
                            <option value="">+ Agregar enlace…</option>
                            {carros.filter(c => c !== sitio).map(c => <option key={c} value={nombreEnlace(c)}>{nombreEnlace(c)}</option>)}
                          </select>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {s.fotos.map(f => fotoCasilla(s, f))}
                      </div>
                      <button type="button" onClick={() => cambiarSeccion(s.id, x => ({ ...x, fotos: [...x.fotos, casillaNueva(x.clave === 'consolas' ? 'consola' : x.clave === 'documentacion' ? 'doc' : 'par')] }))} className={btnSec}>
                        <Plus size={13} /> Agregar foto
                      </button>
                    </div>
                  )}
                </details>
              );
            })}
          </div>
          <button type="button" onClick={() => setSecciones(prev => [...prev, { ...seccionExtra(), fotos: [casillaNueva(), casillaNueva()] }])} className={`${btnSec} mt-3`}>
            <Plus size={13} /> Agregar sección
          </button>
        </Panel>

        <Panel icono={<ClipboardList size={18} className="panel__summary-icon" />} titulo="6. Bitácora" abierto={false}>
          <div className="space-y-3">
            {bitacora.map((f, i) => (
              <div key={f.id} className="rounded-lg border border-[#DCE1E6] p-2.5 bg-[#fafbfc] space-y-2">
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className={etiqueta} htmlFor={`pv-ini-${f.id}`}>Inicio</label><input id={`pv-ini-${f.id}`} type="time" value={f.inicio} onChange={e => cambiarFila(f.id, { inicio: e.target.value })} className={campo} /></div>
                  <div><label className={etiqueta} htmlFor={`pv-fin-${f.id}`}>Término</label><input id={`pv-fin-${f.id}`} type="time" value={f.termino} onChange={e => cambiarFila(f.id, { termino: e.target.value })} className={campo} /></div>
                  <div className="flex-1 min-w-[160px]">
                    <label className={etiqueta} htmlFor={`pv-per-${f.id}`}>Personal</label>
                    <select id={`pv-per-${f.id}`} value={f.modoPersonal} onChange={e => cambiarFila(f.id, { modoPersonal: e.target.value as ModoPersonal })} className={campo}>
                      <option value="turno">Todo el personal en turno</option>
                      <option value="ejecutantes">Solo quienes ejecutaron</option>
                      <option value="manual">Escribir a mano</option>
                    </select>
                  </div>
                  <button type="button" aria-label="Quitar fila" onClick={() => {
                    setBitacora(prev => prev.filter(x => x.id !== f.id));
                    registrarDeshacer('Se quitó una fila de la bitácora', () => setBitacora(prev => reinsertar(prev, i, f)));
                  }} className="bg-red-50 text-red-700 px-2 py-2 rounded-md hover:bg-red-100"><Trash2 size={14} /></button>
                </div>
                {f.modoPersonal === 'manual' && (
                  <textarea value={f.personalManual} rows={3} onChange={e => cambiarFila(f.id, { personalManual: e.target.value })} placeholder="Un nombre por línea" aria-label="Personal" className={campo} />
                )}
                <div className="flex items-center justify-between">
                  <span className={etiqueta}>Actividades</span>
                  {i > 0 && <button type="button" onClick={() => cambiarFila(f.id, { actividades: [f.actividades[0] ?? '', ...trabajosDeSecciones(secciones)] })} className="text-[11px] font-bold text-[#0E4660] underline">Rehacer según las secciones</button>}
                </div>
                <ListaEditable items={f.actividades} onChange={v => cambiarFila(f.id, { actividades: v })} placeholder="Actividad" agregar="Agregar actividad" />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setBitacora(prev => [...prev, { id: uid(), inicio: '', termino: '', actividades: [''], modoPersonal: 'ejecutantes', personalManual: '' }])} className={`${btnSec} mt-2`}>
            <Plus size={13} /> Agregar fila
          </button>
        </Panel>

        <div className="action-zone">
          <button type="button" onClick={() => void generar()} disabled={generando}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {generando ? <><Loader2 size={18} className="animate-spin" /> Generando informe…</> : `Generar Word (${fotosListas} fotos)`}
          </button>
        </div>
      </main>

      {toast && (
        <div role="status" className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toast.error ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>{toast.text}</div>
      )}
      {fotoAmpliada && <VisorFoto src={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
      {escanear && (
        <EscanerDocumento onCancelar={() => setEscanear(null)}
          onUsar={doc => { cambiarFoto(escanear.seccion, escanear.foto, { photo: doc }); setEscanear(null); }} />
      )}
    </div>
  );
}
