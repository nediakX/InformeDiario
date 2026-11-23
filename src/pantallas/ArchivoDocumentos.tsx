// Archivo de documentos de la división: los documentos en papel que se escanearon o fotografiaron en los
// informes (ART, registros, charlas, checklists, permisos…), para buscarlos, verlos y bajarlos en PDF con su
// nombre: uno a uno, o todos los de la búsqueda en un .zip (un PDF por documento).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CloudOff, Download, ExternalLink, FileText, Loader2, Search, X } from 'lucide-react';
import { saveAs } from 'file-saver';
import CuentaCabecera from '../componentes/CuentaCabecera';
import logoPsinet from '../assets/logo_psinet.png';
import logoEdificio from '../assets/LogoEdificio.png';
import { useSesion } from '../auth/sesion';
import { configDivision } from '../datos/divisiones';
import type { BorradorEntry } from '../datos/borradoresDiario';
import { fetchBorradoresOtros, type BorradorOtroEntry } from '../datos/borradoresOtros';
import {
  ETIQUETA_ORIGEN, ORIGENES, coincideBusqueda, documentosDeInformes, type DocumentoArchivo, type OrigenDocumento,
} from '../datos/archivoDocumentos';
import { formatFechaCorta, formatFechaLarga } from '../datos/fechas';
import { useConexion } from '../lib/conexion';
import { pdfDeDocumento, zipDeDocumentos } from './archivo/exportar';
import './archivo/archivo.css';

interface Props {
  onBack: () => void;
  diarios: BorradorEntry[];
  /** Mantenimientos de generador y mantenciones preventivas. */
  mantenimientos: BorradorOtroEntry[];
  fallas: BorradorOtroEntry[];
  /** Abre el informe del que sale el documento. */
  onAbrirInforme: (doc: DocumentoArchivo) => void;
}

const POR_PAGINA = 48;
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const fechaDelGrupo = (iso: string) => `${DIAS[new Date(`${iso}T12:00:00`).getDay()]} ${formatFechaLarga(iso)}`;
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-CL')} ${n === 1 ? uno : varios}`;

export default function ArchivoDocumentos({ onBack, diarios, mantenimientos, fallas, onAbrirInforme }: Props) {
  const { division } = useSesion();
  const config = configDivision(division);
  const enLinea = useConexion();

  // El Informe de Cierre no está en las listas del panel: se lee aquí.
  const [cierres, setCierres] = useState<BorradorOtroEntry[]>([]);
  useEffect(() => {
    let vivo = true;
    fetchBorradoresOtros('cierre', division).then(lista => { if (vivo) setCierres(lista); }).catch(() => { /* sin señal: sin cierre */ });
    return () => { vivo = false; };
  }, [division]);

  const [busqueda, setBusqueda] = useState('');
  const [origen, setOrigen] = useState<OrigenDocumento | 'todos'>('todos');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [limite, setLimite] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<DocumentoArchivo | null>(null);
  const [descargandoId, setDescargandoId] = useState<string | null>(null);
  const [exportando, setExportando] = useState<{ listos: number; total: number } | null>(null);
  const cancelarRef = useRef(false);
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'error'; texto: string } | null>(null);
  const [sinVista, setSinVista] = useState<ReadonlySet<string>>(() => new Set());

  const todos = useMemo(
    () => documentosDeInformes({ diarios, mantenimientos, fallas, cierres }),
    [diarios, mantenimientos, fallas, cierres],
  );
  // Con todos los filtros menos el tipo de informe (así cada tipo muestra cuántos tiene).
  const sinFiltroDeOrigen = useMemo(() => todos.filter(d =>
    (!desde || d.fecha >= desde)
    && (!hasta || d.fecha <= hasta)
    && coincideBusqueda(d, busqueda)), [todos, desde, hasta, busqueda]);
  const visibles = useMemo(
    () => (origen === 'todos' ? sinFiltroDeOrigen : sinFiltroDeOrigen.filter(d => d.origen === origen)),
    [sinFiltroDeOrigen, origen],
  );
  const porOrigen = useMemo(() => {
    const n: Record<OrigenDocumento, number> = { diario: 0, mantenimiento: 0, preventiva: 0, falla: 0, cierre: 0 };
    for (const d of sinFiltroDeOrigen) n[d.origen] += 1;
    return n;
  }, [sinFiltroDeOrigen]);
  const informes = useMemo(() => new Set(visibles.map(d => `${d.origen}:${d.informeId}`)).size, [visibles]);
  const grupos = useMemo(() => {
    const lista: { fecha: string; docs: DocumentoArchivo[] }[] = [];
    for (const doc of visibles.slice(0, limite)) {
      const ultimo = lista[lista.length - 1];
      if (ultimo && ultimo.fecha === doc.fecha) ultimo.docs.push(doc);
      else lista.push({ fecha: doc.fecha, docs: [doc] });
    }
    return lista;
  }, [visibles, limite]);
  const hayFiltros = busqueda.trim() !== '' || origen !== 'todos' || desde !== '' || hasta !== '';

  // Al cambiar un filtro se vuelve a la primera página de resultados.
  const filtrar = (cambio: () => void) => { cambio(); setLimite(POR_PAGINA); };
  const limpiarFiltros = () => filtrar(() => { setBusqueda(''); setOrigen('todos'); setDesde(''); setHasta(''); });

  useEffect(() => {
    if (!abierto) return;
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(null); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  const errorDePdf = (doc: DocumentoArchivo | null) => (!enLinea
    ? 'Sin conexión: para armar el PDF hay que bajar las fotos desde la nube.'
    : doc ? `No se pudo armar el PDF de «${doc.nombre}»: alguna de sus fotos no se pudo leer.` : 'No se pudo armar ningún PDF: las fotos no se pudieron leer.');

  const descargarUno = async (doc: DocumentoArchivo) => {
    if (descargandoId) return;
    setDescargandoId(doc.id);
    setAviso(null);
    try {
      const { blob, nombre } = await pdfDeDocumento(doc);
      saveAs(blob, nombre);
    } catch (error) {
      console.error('No se pudo armar el PDF:', error);
      setAviso({ tono: 'error', texto: errorDePdf(doc) });
    } finally {
      setDescargandoId(null);
    }
  };

  const nombreZip = () => {
    const fechas = visibles.map(d => d.fecha).sort();
    const inicio = desde || fechas[0];
    const fin = hasta || fechas[fechas.length - 1];
    const tipo = origen === 'todos' ? '' : ` ${ETIQUETA_ORIGEN[origen]}`;
    const rango = inicio && fin ? (inicio === fin ? ` ${formatFechaCorta(inicio)}` : ` ${formatFechaCorta(inicio)} al ${formatFechaCorta(fin)}`) : '';
    return `Documentos ${config.sigla}${tipo}${rango}.zip`;
  };

  const descargarTodo = async () => {
    if (!visibles.length || exportando || descargandoId) return;
    if (visibles.length === 1) { void descargarUno(visibles[0]); return; }
    const lote = visibles;
    cancelarRef.current = false;
    setExportando({ listos: 0, total: lote.length });
    setAviso(null);
    try {
      const resultado = await zipDeDocumentos(lote, (listos, total) => setExportando({ listos, total }), () => cancelarRef.current);
      if (!resultado) { setAviso({ tono: 'ok', texto: 'Descarga cancelada.' }); return; }
      const { blob, fallidos } = resultado;
      if (fallidos.length === lote.length) { setAviso({ tono: 'error', texto: errorDePdf(null) }); return; }
      saveAs(blob, nombreZip());
      const listos = lote.length - fallidos.length;
      setAviso(fallidos.length
        ? { tono: 'error', texto: `Se descargaron ${plural(listos, 'documento', 'documentos')}. No se pudieron incluir ${plural(fallidos.length, 'documento', 'documentos')} (sin señal o la foto ya no está en la nube): ${fallidos.slice(0, 4).map(d => `«${d.nombre}» (${formatFechaCorta(d.fecha)})`).join(', ')}${fallidos.length > 4 ? '…' : ''}.` }
        : { tono: 'ok', texto: `Listo: ${plural(listos, 'documento', 'documentos')} en PDF, dentro de un .zip.` });
    } catch (error) {
      console.error('No se pudo armar el .zip:', error);
      setAviso({ tono: 'error', texto: errorDePdf(null) });
    } finally {
      setExportando(null);
    }
  };

  const etiquetaDescargarTodo = visibles.length === 1 ? 'Descargar en PDF' : `Descargar ${plural(visibles.length, 'documento', 'documentos')} en PDF`;

  return (
    <div className="min-h-screen pb-16">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Archivo de documentos</div>
              <div className="site-header__meta text-xs truncate">{config.sigla} / Documentos escaneados de todos los informes</div>
            </div>
          </div>
          <CuentaCabecera />
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="arch-main mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          {exportando ? (
            <div className="arch-progreso" role="status">
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              <span>Armando los PDF: {exportando.listos.toLocaleString('es-CL')} de {exportando.total.toLocaleString('es-CL')}</span>
              <button type="button" className="arch-boton arch-boton--chico" onClick={() => { cancelarRef.current = true; }}>Cancelar</button>
            </div>
          ) : (
            <button type="button" className="arch-boton arch-boton--principal" onClick={() => void descargarTodo()} disabled={!visibles.length || !!descargandoId}>
              <Download size={16} aria-hidden="true" /> {etiquetaDescargarTodo}
            </button>
          )}
        </div>

        <section className="panel arch-panel" aria-labelledby="arch-titulo">
          <div className="arch-encabezado">
            <h1 id="arch-titulo" className="font-display">Archivo de documentos</h1>
            <p>
              ART, registros, charlas, checklists y permisos escaneados en los informes de la {config.nombre}.
              Cada documento se descarga en PDF con su nombre.
            </p>
          </div>

          <div className="arch-filtros">
            <label className="arch-buscar">
              <span className="sr-only">Buscar documento</span>
              <Search size={16} aria-hidden="true" />
              <input type="search" value={busqueda} onChange={e => filtrar(() => setBusqueda(e.target.value))}
                placeholder="Buscar: ART, charla, checklist, LTE_05, Turno Noche…" />
            </label>
            <div className="arch-fechas">
              <label>Desde<input type="date" value={desde} max={hasta || undefined} onChange={e => filtrar(() => setDesde(e.target.value))} /></label>
              <label>Hasta<input type="date" value={hasta} min={desde || undefined} onChange={e => filtrar(() => setHasta(e.target.value))} /></label>
            </div>
          </div>

          <div className="arch-chips" role="group" aria-label="Informe">
            <button type="button" className="arch-chip" aria-pressed={origen === 'todos'} onClick={() => filtrar(() => setOrigen('todos'))}>
              Todos <span>{sinFiltroDeOrigen.length.toLocaleString('es-CL')}</span>
            </button>
            {ORIGENES.filter(o => porOrigen[o] > 0 || origen === o).map(o => (
              <button key={o} type="button" className="arch-chip" aria-pressed={origen === o} onClick={() => filtrar(() => setOrigen(o))}>
                {ETIQUETA_ORIGEN[o]} <span>{porOrigen[o].toLocaleString('es-CL')}</span>
              </button>
            ))}
          </div>

          {hayFiltros && (
            <div className="arch-pie-filtros">
              <button type="button" className="arch-enlace" onClick={limpiarFiltros}>Limpiar filtros</button>
            </div>
          )}
        </section>

        {!enLinea && (
          <p className="arch-aviso arch-aviso--sin-senal"><CloudOff size={16} aria-hidden="true" /> Sin conexión: las fotos que están en la nube no se ven ni se pueden pasar a PDF hasta que vuelva la señal.</p>
        )}
        {aviso && (
          <p className={`arch-aviso arch-aviso--${aviso.tono}`} role={aviso.tono === 'error' ? 'alert' : 'status'}>
            <span>{aviso.texto}</span>
            <button type="button" aria-label="Cerrar aviso" onClick={() => setAviso(null)}><X size={14} /></button>
          </p>
        )}

        {visibles.length > 0 && (
          <p className="arch-resumen">
            {plural(visibles.length, 'documento', 'documentos')} de {plural(informes, 'informe', 'informes')}
          </p>
        )}

        {grupos.map(grupo => (
          <section key={grupo.fecha} className="arch-dia" aria-labelledby={`arch-dia-${grupo.fecha}`}>
            <h2 id={`arch-dia-${grupo.fecha}`}>{fechaDelGrupo(grupo.fecha)} <span>{grupo.docs.length}</span></h2>
            <ul className="arch-grilla">
              {grupo.docs.map(doc => {
                const portada = doc.paginas[0];
                return (
                  <li key={doc.id} className="arch-doc">
                    <button type="button" className="arch-doc__vista" onClick={() => setAbierto(doc)} aria-label={`Ver ${doc.nombre}`}>
                      {sinVista.has(portada) ? (
                        <span className="arch-doc__sin-vista"><FileText size={26} aria-hidden="true" /> Sin vista previa</span>
                      ) : (
                        <img src={portada} alt="" loading="lazy" decoding="async"
                          onError={() => setSinVista(prev => new Set(prev).add(portada))} />
                      )}
                      {doc.paginas.length > 1 && <span className="arch-doc__paginas">{doc.paginas.length} págs.</span>}
                    </button>
                    <div className="arch-doc__texto">
                      <p className="arch-doc__nombre" title={doc.nombre}>{doc.nombre}</p>
                      <p className="arch-doc__informe" title={`${ETIQUETA_ORIGEN[doc.origen]} · ${doc.informe}`}>{ETIQUETA_ORIGEN[doc.origen]} · {doc.informe}</p>
                    </div>
                    <button type="button" className="arch-doc__pdf" onClick={() => void descargarUno(doc)}
                      disabled={!!descargandoId || !!exportando} aria-label={`Descargar ${doc.nombre} en PDF`}>
                      {descargandoId === doc.id ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Download size={14} aria-hidden="true" />} PDF
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {visibles.length > limite && (
          <div className="flex justify-center">
            <button type="button" className="arch-boton" onClick={() => setLimite(l => l + POR_PAGINA)}>
              Mostrar más ({plural(visibles.length - limite, 'queda', 'quedan')})
            </button>
          </div>
        )}

        {visibles.length === 0 && (
          <div className="panel arch-vacio">
            <FileText size={30} aria-hidden="true" />
            {todos.length === 0 ? (
              <p>Aún no hay documentos escaneados en los informes de la {config.nombre}. Aparecen aquí apenas se agregan en un informe (ART, registros, charlas, checklists…).</p>
            ) : (
              <>
                <p>Ningún documento coincide con la búsqueda o los filtros.</p>
                {hayFiltros && <button type="button" className="arch-boton" onClick={limpiarFiltros}>Limpiar filtros</button>}
              </>
            )}
          </div>
        )}
      </main>

      {abierto && (
        <div className="arch-modal" role="dialog" aria-modal="true" aria-labelledby="arch-modal-titulo"
          onClick={e => { if (e.target === e.currentTarget) setAbierto(null); }}>
          <div className="arch-modal__caja">
            <div className="arch-modal__cabecera">
              <div className="min-w-0">
                <h2 id="arch-modal-titulo">{abierto.nombre}</h2>
                <p>
                  {ETIQUETA_ORIGEN[abierto.origen]} · {abierto.informe} · {formatFechaCorta(abierto.fecha)}
                  {abierto.seccion && abierto.seccion !== abierto.nombre ? ` · ${abierto.seccion}` : ''}
                  {abierto.paginas.length > 1 ? ` · ${abierto.paginas.length} páginas` : ''}
                </p>
              </div>
              <button type="button" className="arch-modal__cerrar" onClick={() => setAbierto(null)} aria-label="Cerrar" autoFocus><X size={18} /></button>
            </div>
            <div className="arch-modal__paginas">
              {abierto.paginas.map((src, i) => (
                sinVista.has(src)
                  ? <p key={src} className="arch-doc__sin-vista arch-doc__sin-vista--grande"><FileText size={30} aria-hidden="true" /> Esta foto no se puede mostrar {enLinea ? '(ya no está en la nube)' : '(sin conexión)'}.</p>
                  : <img key={src} src={src} alt={`${abierto.nombre}, página ${i + 1} de ${abierto.paginas.length}`}
                    onError={() => setSinVista(prev => new Set(prev).add(src))} />
              ))}
            </div>
            <div className="arch-modal__acciones">
              <button type="button" className="arch-boton" onClick={() => { const doc = abierto; setAbierto(null); onAbrirInforme(doc); }}>
                <ExternalLink size={15} aria-hidden="true" /> Abrir el informe
              </button>
              <button type="button" className="arch-boton arch-boton--principal" onClick={() => void descargarUno(abierto)} disabled={!!descargandoId || !!exportando}>
                {descargandoId === abierto.id ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />} Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
