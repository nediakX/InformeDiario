// Mapa de sitios: ubicación de todos los carros LTE de la mina (satélite o mapa), con la orientación
// de sus sectores, la distancia desde donde está uno, un enlace para llegar con Google Maps y la
// reportabilidad de GG actual de cada carro (último reporte, estado y alertas, igual que el monitoreo).
// Leaflet se carga solo al abrir esta pantalla.
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapaSitios.css';
import { ArrowLeft, Copy, Crosshair, Layers, LocateFixed, Navigation, Radio, Search } from 'lucide-react';
import logoPsinet from '../assets/logo_psinet.jpg';
import logoEdificio from '../assets/LogoEdificio.png';
import { useSesion } from '../auth/sesion';
import { configDivision } from '../datos/divisiones';
import { SITIOS_MAPA, type SitioMapa, distanciaMetros, puntoDesde, sitioGGDe, textoCoordenadas } from '../datos/sitiosMapa';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import { EVENTO_GG, SITIOS_GG, pendientesGG, suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { analizarGeneradores, type EstadoGG, type SitioGG } from '../datos/analisisGG';

const CAPAS = {
  satelite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    atribucion: 'Imágenes © Esri, Maxar, Earthstar Geographics',
  },
  mapa: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    atribucion: '© colaboradores de OpenStreetMap',
  },
} as const;
type Capa = keyof typeof CAPAS;

const COLOR_SECTOR = ['#F5B300', '#29B6F6', '#EF5350'];
const RADIO_SECTOR = 260; // metros
const ANCHO_SECTOR = 60; // grados

const corto = (codigo: string) => codigo.replace(/^LIGHT_LTE_/, 'LIGHT_').replace(/^LTE_/, '');
const formatoDistancia = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);
const escapar = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const ESTADO_TEXTO: Record<EstadoGG, string> = { ok: 'Normal', atencion: 'Atención', critico: 'Crítico', sin_datos: 'Sin reportes' };
const fmtNum = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: 1 }));
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const cuandoReporte = (r: ReporteGG) => `${ddmm(r.fecha)}${r.hora ? ` ${r.hora}` : ''}`;
const antiguedad = (g: SitioGG) => (g.diasSinReporte === 0 ? 'hoy' : g.diasSinReporte === 1 ? 'ayer' : Number.isFinite(g.diasSinReporte) ? `hace ${g.diasSinReporte} días` : '');

/** Bloque de reportabilidad para el globo del carro. */
function htmlReportabilidad(g: SitioGG | null | undefined): string {
  if (g === undefined) return '<div class="mapa-gg mapa-gg--cargando">Cargando reportabilidad de GG…</div>';
  if (g === null) return '<div class="mapa-gg mapa-gg--na">Sin generador en la reportabilidad de GG.</div>';
  const u = g.ultimo;
  const filas = u ? [
    ['Combustible', u.combustible ?? '—'], ['Horómetro', u.horometro !== null ? `${fmtNum(u.horometro)} h` : '—'],
    ['Temperatura', u.temperatura !== null ? `${fmtNum(u.temperatura)} °C` : '—'], ['Partidas', fmtNum(u.nroPartidas)],
    ['Aceite', u.nivelAceite ?? '—'], ['Refrigerante', u.nivelRefrigerante ?? '—'],
  ] : [];
  return `<div class="mapa-gg mapa-gg--${g.estado}">
    <div class="mapa-gg__cabecera"><span>Reportabilidad GG</span><span class="mapa-gg__estado">${ESTADO_TEXTO[g.estado]}</span></div>
    ${u ? `<div class="mapa-gg__ultimo">Último: ${escapar(cuandoReporte(u))} (${antiguedad(g)}) · ${escapar(u.reporta)}</div>
      <dl class="mapa-gg__datos">${filas.map(([k, v]) => `<dt>${k}</dt><dd>${escapar(String(v))}</dd>`).join('')}</dl>` : '<div class="mapa-gg__ultimo">Sin reportes en los últimos 30 días.</div>'}
    ${g.alertas.length ? `<ul class="mapa-gg__alertas">${g.alertas.map(a => `<li class="mapa-gg__alerta--${a.severidad}">${escapar(a.titulo)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

const enlaceRuta = (s: SitioMapa) => `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`;

export default function MapaSitios({ onBack }: { onBack: () => void }) {
  const { division } = useSesion();
  const datos = SITIOS_MAPA[division];
  const { ubicacionPorCarro } = configDivision(division);
  const sitios = useMemo(() => datos?.sitios ?? [], [datos]);
  const ubicacion = (s: SitioMapa) => ubicacionPorCarro[s.carro ?? s.codigo] ?? '';

  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaRef = useRef<L.TileLayer | null>(null);
  const sectoresRef = useRef<L.LayerGroup | null>(null);
  const marcadoresRef = useRef(new Map<string, L.Marker>());
  const yoRef = useRef<L.LayerGroup | null>(null);

  const [capa, setCapa] = useState<Capa>('satelite');
  const [verSectores, setVerSectores] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [elegido, setElegido] = useState<string | null>(null);
  const [yo, setYo] = useState<{ lat: number; lon: number; precision: number } | null>(null);
  const [errorUbicacion, setErrorUbicacion] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  // --- Reportabilidad de GG (mismos datos y reglas que el monitoreo del panel) ---
  const hoy = hoyLocalISO();
  const desde = sumarDias(hoy, -30);
  const [reportes, setReportes] = useState<ReporteGG[] | null>(null);
  const [versionGG, setVersionGG] = useState(0);
  useEffect(() => {
    let vivo = true;
    todosLosReportesGG({ division, desde, hasta: hoy })
      .then(r => { if (vivo) setReportes(r); })
      .catch(() => { if (vivo) setReportes([]); });
    return () => { vivo = false; };
  }, [division, desde, hoy, versionGG]);
  useEffect(() => suscribirReportesGG(division, () => setVersionGG(v => v + 1)), [division]);
  useEffect(() => {
    const alCambiar = () => setVersionGG(v => v + 1);
    window.addEventListener(EVENTO_GG, alCambiar);
    return () => window.removeEventListener(EVENTO_GG, alCambiar);
  }, []);
  /** Por carro del mapa: undefined = cargando, null = no reporta GG. */
  const ggPorCodigo = useMemo(() => {
    const m = new Map<string, SitioGG | null | undefined>();
    const lista = SITIOS_GG[division] ?? [];
    const todos = reportes ? [...reportes, ...pendientesGG().filter(p => p.division === division && !reportes.some(r => r.id === p.id))] : null;
    const analisis = todos ? analizarGeneradores(lista, todos, hoy) : null;
    for (const s of sitios) {
      const g = sitioGGDe(s);
      if (!g) { m.set(s.codigo, null); continue; }
      if (!analisis) { m.set(s.codigo, undefined); continue; }
      const a = analisis.porSitio.find(x => x.sitio === g);
      m.set(s.codigo, a && (lista.includes(g) || a.ultimo) ? a : null);
    }
    return m;
  }, [reportes, sitios, division, hoy]);

  // Mapa (una sola vez)
  useEffect(() => {
    if (!contenedorRef.current || !sitios.length) return;
    const mapa = L.map(contenedorRef.current, { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'bottomright' }).addTo(mapa);
    mapa.fitBounds(L.latLngBounds(sitios.map(s => [s.lat, s.lon] as [number, number])).pad(0.12));
    sectoresRef.current = L.layerGroup().addTo(mapa);
    yoRef.current = L.layerGroup().addTo(mapa);

    for (const s of sitios) {
      const icono = L.divIcon({
        className: 'mapa-pin-envoltura',
        html: `<span class="mapa-pin${s.nota ? ' mapa-pin--aviso' : ''}"><span class="mapa-pin__punto"></span><span class="mapa-pin__texto">${escapar(corto(s.codigo))}</span></span>`,
        iconSize: [0, 0],
      });
      const marcador = L.marker([s.lat, s.lon], { icon: icono, title: s.codigo, keyboard: true, riseOnHover: true }).addTo(mapa);
      // El globo se corre para no quedar bajo los botones de arriba ni la leyenda.
      marcador.bindPopup('', { maxWidth: 280, autoPanPaddingTopLeft: [16, 64], autoPanPaddingBottomRight: [60, 56] });
      marcador.on('click', () => setElegido(s.codigo));
      marcadoresRef.current.set(s.codigo, marcador);
    }
    mapaRef.current = mapa;
    const marcadores = marcadoresRef.current;
    // El contenedor cambia de tamaño (celular girado, panel lateral): Leaflet necesita saberlo.
    const observador = new ResizeObserver(() => mapa.invalidateSize());
    observador.observe(contenedorRef.current);
    return () => { observador.disconnect(); mapa.remove(); mapaRef.current = null; marcadores.clear(); };
  }, [sitios]);

  // Globo y color de cada carro según su reportabilidad (se actualiza al llegar reportes nuevos).
  useEffect(() => {
    for (const s of sitios) {
      const marcador = marcadoresRef.current.get(s.codigo);
      if (!marcador) continue;
      const g = ggPorCodigo.get(s.codigo);
      const u = ubicacion(s);
      const el = marcador.getElement()?.querySelector('.mapa-pin');
      if (el) el.setAttribute('data-gg', g ? g.estado : g === null ? 'na' : 'cargando');
      marcador.setPopupContent(`
        <div class="mapa-popup">
          <strong>${escapar(s.codigo)}</strong>
          ${u ? `<span class="mapa-popup__lugar">${escapar(u)}</span>` : ''}
          <span>${textoCoordenadas(s)}${s.altitud ? ` · ${s.altitud} m s.n.m.` : ''}</span>
          ${s.azimuts ? `<span>Sectores: ${s.azimuts.map(a => `${a}°`).join(' · ')}</span>` : ''}
          ${s.nota ? `<span class="mapa-popup__nota">${escapar(s.nota)}</span>` : ''}
          ${htmlReportabilidad(g)}
          <a href="${enlaceRuta(s)}" target="_blank" rel="noopener noreferrer">Cómo llegar (Google Maps)</a>
        </div>`);
    }
    // ubicacion depende solo de la división (igual que sitios).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ggPorCodigo, sitios]);

  // Satélite / mapa
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa) return;
    capaRef.current?.remove();
    capaRef.current = L.tileLayer(CAPAS[capa].url, { maxZoom: 19, maxNativeZoom: capa === 'satelite' ? 18 : 19, attribution: CAPAS[capa].atribucion }).addTo(mapa);
    capaRef.current.bringToBack();
  }, [capa, sitios]);

  // Sectores de antena (cuñas de 60° hacia cada azimut)
  useEffect(() => {
    const grupo = sectoresRef.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!verSectores) return;
    for (const s of sitios) {
      (s.azimuts ?? []).forEach((az, i) => {
        const puntos: [number, number][] = [[s.lat, s.lon]];
        for (let a = az - ANCHO_SECTOR / 2; a <= az + ANCHO_SECTOR / 2; a += 6) puntos.push(puntoDesde(s, a, RADIO_SECTOR));
        L.polygon(puntos, { color: COLOR_SECTOR[i % 3], weight: 1, fillOpacity: 0.28, interactive: false }).addTo(grupo);
      });
    }
  }, [verSectores, sitios]);

  // Mi ubicación (punto azul con su precisión)
  useEffect(() => {
    const grupo = yoRef.current;
    if (!grupo) return;
    grupo.clearLayers();
    if (!yo) return;
    L.circle([yo.lat, yo.lon], { radius: yo.precision, color: '#1a73e8', weight: 1, fillOpacity: 0.12, interactive: false }).addTo(grupo);
    L.circleMarker([yo.lat, yo.lon], { radius: 7, color: '#fff', weight: 2, fillColor: '#1a73e8', fillOpacity: 1 }).bindTooltip('Estás aquí').addTo(grupo);
  }, [yo]);

  const vigiaRef = useRef<number | null>(null);
  useEffect(() => () => { if (vigiaRef.current !== null) navigator.geolocation.clearWatch(vigiaRef.current); }, []);
  const ubicarme = () => {
    if (!('geolocation' in navigator)) { setErrorUbicacion('Este equipo no permite obtener la ubicación.'); return; }
    setErrorUbicacion(null);
    let primera = true;
    if (vigiaRef.current !== null) navigator.geolocation.clearWatch(vigiaRef.current);
    vigiaRef.current = navigator.geolocation.watchPosition(
      p => {
        const punto = { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy };
        setYo(punto);
        if (primera) { primera = false; mapaRef.current?.flyTo([punto.lat, punto.lon], Math.max(mapaRef.current.getZoom(), 15)); }
      },
      e => setErrorUbicacion(e.code === e.PERMISSION_DENIED ? 'Permiso de ubicación denegado.' : 'No se pudo obtener tu ubicación.'),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  };

  const irA = (s: SitioMapa) => {
    setElegido(s.codigo);
    const mapa = mapaRef.current;
    if (!mapa) return;
    mapa.closePopup();
    // El globo se abre al terminar el vuelo: así el mapa se corre para que quepa entero.
    mapa.once('moveend', () => marcadoresRef.current.get(s.codigo)?.openPopup());
    mapa.flyTo([s.lat, s.lon], 16, { duration: 0.8 });
    // En el celular el mapa queda arriba de la lista.
    contenedorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const verTodos = () => mapaRef.current?.flyToBounds(L.latLngBounds(sitios.map(s => [s.lat, s.lon] as [number, number])).pad(0.12), { duration: 0.8 });

  const copiar = async (s: SitioMapa) => {
    try { await navigator.clipboard.writeText(textoCoordenadas(s)); setCopiado(s.codigo); setTimeout(() => setCopiado(null), 1800); } catch { /* sin portapapeles */ }
  };

  const q = busqueda.trim().toLowerCase();
  const lista = sitios
    .map(s => ({ s, dist: yo ? distanciaMetros(yo, s) : null }))
    .filter(({ s }) => !q || s.codigo.toLowerCase().includes(q) || ubicacion(s).toLowerCase().includes(q))
    .sort((a, b) => (a.dist !== null && b.dist !== null ? a.dist - b.dist : a.s.codigo.localeCompare(b.s.codigo)));

  return (
    <div className="mapa-pantalla text-[#222] font-sans">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Mapa de sitios</div>
              <div className="site-header__meta text-xs truncate">{datos ? `${datos.nombre} · ${sitios.length} carros` : 'Sin datos para esta división'}</div>
            </div>
          </div>
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      {!datos ? (
        <main className="max-w-[700px] mx-auto p-5 space-y-3">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1"><ArrowLeft size={14} /> Volver al menú</button>
          <p className="panel p-5 text-sm">Todavía no hay coordenadas de los sitios de esta división.</p>
        </main>
      ) : (
        <main className="mapa-cuerpo">
          <div className="mapa-lienzo">
            <div ref={contenedorRef} className="mapa-leaflet" role="application" aria-label="Mapa de los sitios" />
            <div className="mapa-controles">
              <button type="button" onClick={onBack} className="mapa-btn" aria-label="Volver al menú"><ArrowLeft size={16} /></button>
              <div className="mapa-segmento" role="group" aria-label="Tipo de mapa">
                <button type="button" aria-pressed={capa === 'satelite'} onClick={() => setCapa('satelite')}>Satélite</button>
                <button type="button" aria-pressed={capa === 'mapa'} onClick={() => setCapa('mapa')}>Mapa</button>
              </div>
            </div>
            <div className="mapa-controles mapa-controles--derecha">
              <button type="button" className={`mapa-btn ${verSectores ? 'mapa-btn--activo' : ''}`} aria-pressed={verSectores} onClick={() => setVerSectores(v => !v)} title="Sectores de antena">
                <Radio size={16} /> <span className="mapa-btn__texto">Sectores</span>
              </button>
              <button type="button" className="mapa-btn" onClick={verTodos} title="Ver todos los sitios"><Layers size={16} /> <span className="mapa-btn__texto">Todos</span></button>
              <button type="button" className={`mapa-btn ${yo ? 'mapa-btn--activo' : ''}`} onClick={ubicarme} title="Mi ubicación"><LocateFixed size={16} /> <span className="mapa-btn__texto">Mi ubicación</span></button>
            </div>
            {errorUbicacion && <div className="mapa-aviso" role="status">{errorUbicacion}</div>}
            <div className="mapa-leyenda" aria-label="Estado de la reportabilidad de GG">
              <span><i data-gg="ok" /> Normal</span><span><i data-gg="atencion" /> Atención</span>
              <span><i data-gg="critico" /> Crítico</span><span><i data-gg="na" /> Sin GG</span>
            </div>
          </div>

          <aside className="mapa-lista" aria-label="Lista de sitios">
            <label className="mapa-buscar">
              <Search size={14} aria-hidden="true" />
              <input type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar sitio o sector" aria-label="Buscar sitio" />
            </label>
            {yo && <p className="mapa-lista__nota"><Crosshair size={12} /> Ordenados por distancia desde tu ubicación (en línea recta).</p>}
            <ul>
              {lista.map(({ s, dist }) => (
                <li key={s.codigo}>
                  <div className={`mapa-item ${elegido === s.codigo ? 'mapa-item--elegido' : ''}`}>
                    <button type="button" className="mapa-item__principal" onClick={() => irA(s)}>
                      <span className="mapa-item__codigo">{s.codigo}{s.nota && <span className="mapa-item__aviso" title={s.nota}>revisar</span>}</span>
                      <span className="mapa-item__detalle">{[ubicacion(s), s.altitud ? `${s.altitud} m` : ''].filter(Boolean).join(' · ') || textoCoordenadas(s)}</span>
                      {(() => {
                        const g = ggPorCodigo.get(s.codigo);
                        if (g === null) return null;
                        if (g === undefined) return <span className="mapa-item__gg">GG: cargando…</span>;
                        const u = g.ultimo;
                        return (
                          <span className={`mapa-item__gg mapa-item__gg--${g.estado}`}>
                            <span className="mapa-item__gg-estado">{ESTADO_TEXTO[g.estado]}</span>
                            {u ? ` ${cuandoReporte(u)} · Comb. ${u.combustible ?? '—'} · ${fmtNum(u.horometro)} h` : ' en los últimos 30 días'}
                            {u && g.alertas.length > 0 && ` · ${g.alertas[0].corto}${g.alertas.length > 1 ? ` +${g.alertas.length - 1}` : ''}`}
                          </span>
                        );
                      })()}
                    </button>
                    {dist !== null && <span className="mapa-item__dist">{formatoDistancia(dist)}</span>}
                    <button type="button" className="mapa-item__accion" onClick={() => void copiar(s)} title="Copiar coordenadas" aria-label={`Copiar coordenadas de ${s.codigo}`}>
                      {copiado === s.codigo ? <span className="text-[10px] font-bold">✓</span> : <Copy size={14} />}
                    </button>
                    <a className="mapa-item__accion" href={enlaceRuta(s)} target="_blank" rel="noopener noreferrer" title="Cómo llegar" aria-label={`Cómo llegar a ${s.codigo}`}><Navigation size={14} /></a>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </main>
      )}
    </div>
  );
}
