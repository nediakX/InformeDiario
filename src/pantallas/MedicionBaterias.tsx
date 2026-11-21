// Medición de baterías de los carros (la planilla "MEDICION BATERIAS DSAL", ahora en la app):
//  - Carros: el estado de cada carro según su última medición (cada batería en su color), cuándo toca la
//    próxima (cada 3 meses) y los totales, que también sirven de filtro.
//  - Detalle de un carro (/medicion-baterias/<carro>): cada medición banco por banco, el cambio contra la
//    anterior y la tendencia de cada batería.
//  - Registrar o corregir una medición desde el celular, también sin señal (se sube sola al volver).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CloudOff, DatabaseZap, Download, Loader2, Plus, TriangleAlert } from 'lucide-react';
import { saveAs } from 'file-saver';
import CuentaCabecera from '../componentes/CuentaCabecera';
import logoPsinet from '../assets/logo_psinet.png';
import logoEdificio from '../assets/LogoEdificio.png';
import { nombreVisible, useSesion } from '../auth/sesion';
import { configDivision } from '../datos/divisiones';
import { hoyLocalISO } from '../datos/fechas';
import { esSupervisorGG } from '../datos/roles';
import { esSupervisorDelListado } from '../datos/trabajadores';
import {
  AVISO_DIAS_MEDICION, ETIQUETA_ESTADO_BATERIA, MESES_ENTRE_MEDICIONES, ORDEN_ESTADO, RESISTENCIA_ADVERTENCIA,
  RESISTENCIA_BUEN_ESTADO, masNuevaPrimero, type MedicionBaterias,
} from '../datos/indicadoresBaterias';
import {
  descartarPendienteBaterias, eliminarMedicionBaterias, guardarMedicionBaterias, listarMedicionesBaterias,
  sincronizarBaterias, suscribirMedicionesBaterias, suscribirSubidasBaterias, usePendientesBaterias, type MedicionesCargadas,
} from '../datos/medicionBaterias';
import { hayConexion, suscribirConexion, useConexion } from '../lib/conexion';
import { registrarDeshacer } from '../lib/deshacer';
import { crearLibroExcel } from '../lib/excel';
import { Conteos, Estado, MapaBaterias } from './baterias/comunes';
import DetalleCarro from './baterias/DetalleCarro';
import FormularioMedicion from './baterias/FormularioMedicion';
import { hojasBaterias } from './baterias/excelBaterias';
import { fmtFecha, fmtValor, textoProxima } from './baterias/formato';
import { cumpleFiltro, ordenarCarros, resumirCarros, type FiltroCarros, type ResumenCarro } from './baterias/resumen';
import './baterias/baterias.css';

interface Props {
  onBack: () => void;
  /** Carro que se está viendo (de la URL); null = todos los carros. */
  carro: string | null;
  onCarro: (carro: string | null) => void;
}

const cuando = (iso: string) => new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Texto del mapa de baterías de un carro (para lectores de pantalla y al pasar el mouse). */
function etiquetaCarro(r: ResumenCarro, hoy: string): string {
  const partes = [r.codigo, r.sitio].filter(Boolean).join(', ');
  const { ultima, conteo } = r;
  if (!ultima || !conteo) return `${partes}: sin mediciones. Toca medirlo.`;
  const estados = ORDEN_ESTADO.filter(e => conteo[e] > 0).map(e => `${conteo[e]} ${ETIQUETA_ESTADO_BATERIA[e].toLowerCase()}`);
  return `${partes}: ${ETIQUETA_ESTADO_BATERIA[r.estado]}. Medición del ${fmtFecha(ultima.fecha)}: ${estados.join(', ')}. Próxima medición: ${textoProxima(r.proxima, r.estadoProxima, hoy)}.`;
}

export default function MedicionBaterias({ onBack, carro, onCarro }: Props) {
  const { division, perfil, esAdmin } = useSesion();
  const hoy = hoyLocalISO();
  const config = configDivision(division);
  const carros = useMemo(() => ordenarCarros(config.carros.map(c => ({ codigo: c, sitio: config.ubicacionPorCarro[c] ?? '' }))), [config]);
  const usuario = useMemo(() => ({ id: perfil.id, nombre: nombreVisible(perfil) }), [perfil]);
  const esSupervisor = esAdmin || esSupervisorGG(perfil, division, esSupervisorDelListado(perfil.rut, division));

  const [datos, setDatos] = useState<MedicionesCargadas | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [aviso, setAviso] = useState('');
  // Borradas que aún se pueden deshacer (se ocultan; el borrado en la nube se hace pasado el plazo).
  const [ocultas, setOcultas] = useState<ReadonlySet<string>>(() => new Set());
  const [formulario, setFormulario] = useState<{ editando: MedicionBaterias | null; carro: string | null } | null>(null);
  const [elegida, setElegida] = useState<{ carro: string; id: string } | null>(null);
  const [filtro, setFiltro] = useState<FiltroCarros | null>(null);
  const [descargando, setDescargando] = useState(false);
  const pendientes = usePendientesBaterias(division);
  const enLinea = useConexion();

  useEffect(() => {
    let vivo = true;
    listarMedicionesBaterias(division)
      .then(d => { if (vivo) { setDatos(d); setError(''); } })
      .catch(e => {
        console.error('No se pudieron cargar las mediciones de baterías:', e);
        if (vivo) setError('No se pudieron cargar las mediciones. Revisa la conexión y vuelve a intentarlo.');
      });
    return () => { vivo = false; };
  }, [division, version]);

  // Lo que registran otras personas se ve al instante; lo que quedó sin subir se sube al abrir la pantalla
  // y al volver la señal. Cada vez que algo de la cola llega a la nube (o vuelve la señal) se relee la lista.
  useEffect(() => suscribirMedicionesBaterias(division, () => setVersion(v => v + 1)), [division]);
  useEffect(() => suscribirSubidasBaterias(() => setVersion(v => v + 1)), []);
  useEffect(() => { void sincronizarBaterias(); }, []);
  useEffect(() => suscribirConexion(() => {
    if (hayConexion()) void sincronizarBaterias().finally(() => setVersion(v => v + 1));
  }), []);

  // Guardar después de cambiar de carro: el "Deshacer" se registra al llegar a la pantalla del carro (al
  // cambiar de pantalla se cierra lo que se podía deshacer en la anterior).
  const deshacerAlLlegar = useRef<{ carro: string; mensaje: string; deshacer: () => void } | null>(null);
  useEffect(() => {
    const p = deshacerAlLlegar.current;
    if (p && p.carro === carro) {
      deshacerAlLlegar.current = null;
      registrarDeshacer(p.mensaje, p.deshacer);
    }
  }, [carro]);

  const mediciones = useMemo(() => (datos?.mediciones ?? []).filter(m => !ocultas.has(m.id)), [datos, ocultas]);
  const resumen = useMemo(() => resumirCarros(carros, mediciones, hoy), [carros, mediciones, hoy]);
  const sinSubir = useMemo(() => new Set(pendientes.map(p => p.id)), [pendientes]);
  const rechazados = pendientes.filter(p => p.rechazo);
  const enEspera = pendientes.length - rechazados.length;

  const totales = useMemo(() => {
    const t = { falla: 0, advertencia: 0, carrosFalla: 0, carrosAdvertencia: 0, porMedir: 0, vencidos: 0, proximos: 0 };
    for (const r of resumen) {
      t.falla += r.conteo?.falla ?? 0;
      t.advertencia += r.conteo?.advertencia ?? 0;
      if (r.conteo?.falla) t.carrosFalla += 1;
      if (r.conteo?.advertencia) t.carrosAdvertencia += 1;
      if (cumpleFiltro(r, 'por_medir')) t.porMedir += 1;
      if (r.estadoProxima === 'vencida') t.vencidos += 1;
      if (r.estadoProxima === 'proxima') t.proximos += 1;
    }
    return t;
  }, [resumen]);
  const cuentaFiltro: Record<FiltroCarros, number> = { falla: totales.carrosFalla, advertencia: totales.carrosAdvertencia, por_medir: totales.porMedir, proxima: totales.proximos };
  // Si ya no queda ningún carro en lo elegido, se vuelve a ver todos.
  const filtroActivo = filtro && cuentaFiltro[filtro] > 0 ? filtro : null;
  const visibles = filtroActivo ? resumen.filter(r => cumpleFiltro(r, filtroActivo)) : resumen;
  const resumenCarro = carro ? resumen.find(r => r.codigo === carro) ?? null : null;

  // --- Guardar, corregir y borrar ---------------------------------------------------------------------
  const aplicarLocal = (m: MedicionBaterias) =>
    setDatos(d => d && { ...d, mediciones: [...d.mediciones.filter(x => x.id !== m.id), m].sort(masNuevaPrimero) });
  const quitarLocal = (id: string) => setDatos(d => d && { ...d, mediciones: d.mediciones.filter(x => x.id !== id) });
  const mostrar = (id: string) => setOcultas(s => { const n = new Set(s); n.delete(id); return n; });
  const alFallar = (error: unknown) => {
    console.error('No se pudo guardar la medición de baterías:', error);
    setAviso('No se pudo guardar el cambio. Revisa la conexión y vuelve a intentarlo.');
    setVersion(v => v + 1);
  };

  const guardar = (m: MedicionBaterias, anterior: MedicionBaterias | null) => {
    setFormulario(null);
    setAviso('');
    aplicarLocal(m);
    guardarMedicionBaterias(m).catch(alFallar);
    setElegida({ carro: m.carro, id: m.id });
    const mensaje = `${anterior ? 'Medición corregida' : 'Medición guardada'}: ${m.carro} (${fmtFecha(m.fecha)})`;
    const deshacer = anterior
      ? () => { aplicarLocal(anterior); setElegida({ carro: anterior.carro, id: anterior.id }); guardarMedicionBaterias(anterior).catch(alFallar); }
      : () => { quitarLocal(m.id); eliminarMedicionBaterias(division, m.id).catch(alFallar); };
    if (carro === m.carro) registrarDeshacer(mensaje, deshacer);
    else {
      deshacerAlLlegar.current = { carro: m.carro, mensaje, deshacer };
      onCarro(m.carro);
    }
  };

  const eliminar = (m: MedicionBaterias) => {
    setAviso('');
    setOcultas(s => new Set(s).add(m.id));
    registrarDeshacer(
      `Se eliminó la medición de ${m.carro} del ${fmtFecha(m.fecha)}`,
      () => mostrar(m.id),
      () => {
        quitarLocal(m.id);
        eliminarMedicionBaterias(division, m.id).catch(e => { mostrar(m.id); alFallar(e); });
      },
    );
  };
  const puedeEliminar = (m: MedicionBaterias) => esSupervisor || m.registradoPor === perfil.id || sinSubir.has(m.id);

  const descargarExcel = async () => {
    setDescargando(true);
    setAviso('');
    try {
      saveAs(await crearLibroExcel(hojasBaterias(resumen)), `Medicion_Baterias_${config.sigla}_${hoy}.xlsx`);
    } catch (e) {
      console.error('No se pudo generar el Excel de baterías:', e);
      setAviso('No se pudo generar el Excel.');
    } finally {
      setDescargando(false);
    }
  };

  const abrirNueva = (carroInicial: string | null) => setFormulario({ editando: null, carro: carroInicial });
  const cargando = !datos && !error;

  return (
    <div className="min-h-screen pb-16">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Medición de baterías</div>
              <div className="site-header__meta text-xs truncate">{config.sigla} / Resistencia interna y voltaje de los bancos de cada carro</div>
            </div>
          </div>
          <CuentaCabecera />
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="bat-main mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <button type="button" onClick={() => void descargarExcel()} disabled={!mediciones.length || descargando}
            className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5 disabled:opacity-50">
            {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Descargar Excel
          </button>
        </div>

        <section className="panel bat-panel" aria-labelledby="bat-titulo">
          <div className="bat-encabezado">
            <div className="min-w-0">
              <h1 id="bat-titulo" className="font-display">Medición de baterías</h1>
              <p>Resistencia interna y voltaje de cada batería, banco por banco. Se mide cada {MESES_ENTRE_MEDICIONES} meses.</p>
            </div>
            {!carro && (
              <button type="button" className="bat-boton bat-boton--principal bat-encabezado__nueva" onClick={() => abrirNueva(null)} disabled={cargando}>
                <Plus size={16} aria-hidden="true" /> Nueva medición
              </button>
            )}
          </div>

          <ul className="bat-criterio" aria-label="Criterio por resistencia interna">
            <li><Estado estado="buen_estado" texto={`Buen estado: hasta ${fmtValor(RESISTENCIA_BUEN_ESTADO)} mΩ`} /></li>
            <li><Estado estado="advertencia" texto={`Advertencia: ${fmtValor(RESISTENCIA_BUEN_ESTADO)} a ${fmtValor(RESISTENCIA_ADVERTENCIA)} mΩ`} /></li>
            <li><Estado estado="falla" texto={`Falla: más de ${fmtValor(RESISTENCIA_ADVERTENCIA)} mΩ`} /></li>
          </ul>

          {datos?.sinConexion && (
            <p className="bat-aviso bat-aviso--sin-senal">
              <CloudOff size={15} aria-hidden="true" />
              <span>
                {datos.copiaDel
                  ? `Sin conexión: estás viendo las mediciones guardadas en este equipo (${cuando(datos.copiaDel)}).`
                  : 'Sin conexión: este equipo todavía no tiene copia de las mediciones (ábrela una vez con señal para verlas sin señal).'}
                {' '}Lo que registres se sube solo al volver la señal.
              </span>
            </p>
          )}
          {enEspera > 0 && (!enLinea || datos?.faltaTabla || datos?.sinConexion) && (
            <p className="bat-aviso bat-aviso--sin-senal" role="status">
              <CloudOff size={15} aria-hidden="true" />
              <span>
                {plural(enEspera, 'cambio guardado', 'cambios guardados')} solo en este equipo: {datos?.faltaTabla ? 'se suben solos cuando la base de datos tenga la tabla de mediciones.' : 'se suben solos apenas vuelva la señal.'}
              </span>
            </p>
          )}
          {rechazados.map(p => (
            <p key={p.id} className="bat-aviso bat-aviso--error" role="alert">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>
                {p.op === 'guardar'
                  ? `La nube no aceptó la medición de ${p.medicion.carro} del ${fmtFecha(p.medicion.fecha)}`
                  : 'La nube no aceptó borrar una medición'} ({p.rechazo}).{' '}
                <button type="button" className="bat-enlace" onClick={() => { descartarPendienteBaterias(p.id); setVersion(v => v + 1); }}>
                  {p.op === 'guardar' ? 'Descartar esa medición' : 'Descartar'}
                </button>
              </span>
            </p>
          ))}
          {datos?.faltaTabla && (
            <p className="bat-aviso bat-aviso--base">
              <DatabaseZap size={15} aria-hidden="true" />
              <span>Falta crear la tabla de mediciones en la base de datos (avísale al administrador). Lo que registres queda guardado en este equipo y se sube solo cuando exista.</span>
            </p>
          )}
          {aviso && <p className="bat-aviso bat-aviso--error" role="alert"><TriangleAlert size={15} aria-hidden="true" /><span>{aviso}</span></p>}
          {error && (
            <p className="bat-aviso bat-aviso--error">
              <TriangleAlert size={15} aria-hidden="true" />
              <span>{error} <button type="button" className="bat-enlace" onClick={() => { setError(''); setVersion(v => v + 1); }}>Reintentar</button></span>
            </p>
          )}
          {cargando && <p className="bat-aviso"><Loader2 size={15} className="animate-spin" aria-hidden="true" /> Cargando mediciones…</p>}

          {datos && carro && (resumenCarro ? (
            <DetalleCarro resumen={resumenCarro} elegidaId={elegida?.carro === carro ? elegida.id : null} hoy={hoy} sinSubir={sinSubir}
              puedeEliminar={puedeEliminar} onElegir={id => setElegida({ carro, id })} onVolver={() => onCarro(null)}
              onNueva={() => abrirNueva(carro)} onCorregir={m => setFormulario({ editando: m, carro: m.carro })} onEliminar={eliminar} />
          ) : (
            <div className="bat-vacio">
              <p>No hay un carro “{carro}” en {config.nombre}.</p>
              <button type="button" className="bat-boton" onClick={() => onCarro(null)}>Ver todos los carros</button>
            </div>
          ))}

          {datos && !carro && (
            <>
              <div className="bat-kpis" role="group" aria-label="Resumen (toca uno para ver solo esos carros)">
                {([
                  {
                    id: 'falla', valor: totales.falla, titulo: totales.falla === 1 ? 'batería en falla' : 'baterías en falla',
                    sub: totales.carrosFalla ? `en ${plural(totales.carrosFalla, 'carro', 'carros')}` : 'Ningún carro',
                  },
                  {
                    id: 'advertencia', valor: totales.advertencia, titulo: totales.advertencia === 1 ? 'batería en advertencia' : 'baterías en advertencia',
                    sub: totales.carrosAdvertencia ? `en ${plural(totales.carrosAdvertencia, 'carro', 'carros')}` : 'Ningún carro',
                  },
                  {
                    id: 'por_medir', valor: totales.porMedir, titulo: totales.porMedir === 1 ? 'carro por medir' : 'carros por medir',
                    sub: totales.porMedir
                      ? [totales.vencidos ? `${totales.vencidos} vencido${totales.vencidos === 1 ? '' : 's'}` : '', totales.porMedir > totales.vencidos ? `${totales.porMedir - totales.vencidos} sin mediciones` : ''].filter(Boolean).join(' · ')
                      : 'Todos al día',
                  },
                  {
                    id: 'proxima', valor: totales.proximos, titulo: totales.proximos === 1 ? 'carro a medir pronto' : 'carros a medir pronto',
                    sub: `en los próximos ${AVISO_DIAS_MEDICION} días`,
                  },
                ] as const).map(k => {
                  const contenido = (
                    <>
                      <span className="bat-kpi__valor">{k.valor}</span>
                      <span className="bat-kpi__texto"><span className="bat-kpi__titulo">{k.titulo}</span><span className="bat-kpi__sub">{k.sub}</span></span>
                    </>
                  );
                  const clase = `bat-kpi bat-kpi--${k.id}${k.valor ? ' bat-kpi--activo' : ''}`;
                  return cuentaFiltro[k.id] > 0 ? (
                    <button key={k.id} type="button" className={clase} aria-pressed={filtroActivo === k.id} onClick={() => setFiltro(f => (f === k.id ? null : k.id))}>
                      {contenido}
                    </button>
                  ) : <div key={k.id} className={clase}>{contenido}</div>;
                })}
              </div>
              {filtroActivo && (
                <p className="bat-filtro-activo">
                  Viendo {plural(visibles.length, 'carro', 'carros')} de {resumen.length}.{' '}
                  <button type="button" className="bat-enlace" onClick={() => setFiltro(null)}>Ver todos</button>
                </p>
              )}

              <ul className="bat-carros" aria-label="Carros">
                {visibles.map(r => (
                  <li key={r.codigo}>
                    <button type="button" className={`bat-carro bat-carro--${r.estado}`} onClick={() => onCarro(r.codigo)} aria-label={etiquetaCarro(r, hoy)}>
                      <span className="bat-carro__nombre">
                        <span className="bat-carro__codigo">{r.codigo}</span>
                        {r.sitio && <span className="bat-carro__sitio">{r.sitio}</span>}
                      </span>
                      {r.ultima && r.conteo ? (
                        <>
                          <span className="bat-carro__estado"><Estado compacto estado={r.estado} /></span>
                          <span className="bat-carro__conteos"><Conteos conteo={r.conteo} incluirSinMedir={false} /></span>
                          <span className="bat-carro__mapa"><MapaBaterias bancos={r.ultima.bancos} /></span>
                        </>
                      ) : <span className="bat-carro__vacio">Sin mediciones todavía</span>}
                      <span className="bat-carro__pie">
                        <span className="bat-carro__ultima">{r.ultima ? `Medido el ${fmtFecha(r.ultima.fecha)}` : 'Nunca medido'}</span>
                        <span className={`bat-proxima-chip bat-proxima-chip--${r.estadoProxima}`}>
                          {r.estadoProxima === 'sin_mediciones' ? 'Por medir' : r.estadoProxima === 'al_dia' ? `Próxima: ${fmtFecha(r.proxima)}` : textoProxima(r.proxima, r.estadoProxima, hoy)}
                        </span>
                        {r.mediciones.some(m => sinSubir.has(m.id)) && <span className="bat-sin-subir"><CloudOff size={12} aria-hidden="true" /> Sin subir</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <details className="bat-calculo">
                <summary>Cómo se calcula</summary>
                <ul>
                  <li><b>Estado de cada batería</b> según su resistencia interna: hasta {fmtValor(RESISTENCIA_BUEN_ESTADO)} mΩ buen estado, hasta {fmtValor(RESISTENCIA_ADVERTENCIA)} mΩ advertencia y más de {fmtValor(RESISTENCIA_ADVERTENCIA)} mΩ falla (el criterio de la planilla). El voltaje queda registrado y se ve en la tendencia.</li>
                  <li><b>Estado del carro:</b> el de su batería más grave en la última medición.</li>
                  <li><b>Próxima medición:</b> {MESES_ENTRE_MEDICIONES} meses después de la última. Se marca cuando faltan 15 días o menos, y como vencida cuando ya pasó.</li>
                </ul>
              </details>
            </>
          )}
        </section>
      </main>

      {formulario && (
        <FormularioMedicion key={formulario.editando?.id ?? 'nueva'} division={division} carros={carros} mediciones={mediciones}
          editando={formulario.editando} carroInicial={formulario.carro} usuario={usuario}
          onCerrar={() => setFormulario(null)} onGuardar={guardar}
          onCorregir={m => setFormulario({ editando: m, carro: m.carro })} />
      )}
    </div>
  );
}
