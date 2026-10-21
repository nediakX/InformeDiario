// Panel principal · vista previa del Mapa de sitios: los carros sobre la imagen satelital, con el
// color de su reportabilidad de GG. Es solo para mirar: al tocarla se abre el mapa completo.
import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './mapaSitios.css';
import { ChevronRight, Map as MapIcon } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { SITIOS_MAPA } from '../datos/sitiosMapa';
import type { EstadoGG } from '../datos/analisisGG';
import { useGGSitios } from './useGGSitios';

const corto = (codigo: string) => codigo.replace(/^LIGHT_LTE_/, 'LIGHT_').replace(/^LTE_/, '');

export default function MiniMapaSitios({ onAbrir }: { onAbrir: () => void }) {
  const { division } = useSesion();
  const datos = SITIOS_MAPA[division];
  const sitios = useMemo(() => datos?.sitios ?? [], [datos]);
  const gg = useGGSitios(division, sitios);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const marcadoresRef = useRef(new Map<string, L.Marker>());

  useEffect(() => {
    if (!contenedorRef.current || !sitios.length) return;
    const mapa = L.map(contenedorRef.current, {
      zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
      boxZoom: false, keyboard: false, touchZoom: false, zoomSnap: 0.25,
    });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18, attribution: '© Esri',
    }).addTo(mapa);
    const encuadrar = () => mapa.fitBounds(L.latLngBounds(sitios.map(s => [s.lat, s.lon] as [number, number])), { padding: [26, 26] });
    encuadrar();
    for (const s of sitios) {
      const icono = L.divIcon({
        className: 'mapa-pin-envoltura',
        html: `<span class="mapa-pin mapa-pin--mini"><span class="mapa-pin__punto"></span><span class="mapa-pin__texto">${corto(s.codigo)}</span></span>`,
        iconSize: [0, 0],
      });
      marcadoresRef.current.set(s.codigo, L.marker([s.lat, s.lon], { icon: icono, interactive: false, keyboard: false }).addTo(mapa));
    }
    const marcadores = marcadoresRef.current;
    const observador = new ResizeObserver(() => { mapa.invalidateSize(); encuadrar(); });
    observador.observe(contenedorRef.current);
    return () => { observador.disconnect(); mapa.remove(); marcadores.clear(); };
  }, [sitios]);

  // Color de cada punto según la reportabilidad de GG.
  useEffect(() => {
    for (const s of sitios) {
      const g = gg.get(s.codigo);
      marcadoresRef.current.get(s.codigo)?.getElement()?.querySelector('.mapa-pin')
        ?.setAttribute('data-gg', g ? g.estado : g === null ? 'na' : 'cargando');
    }
  }, [gg, sitios]);

  if (!datos) return null;
  const cuenta = (e: EstadoGG[]) => sitios.filter(s => { const g = gg.get(s.codigo); return g && e.includes(g.estado); }).length;
  const criticos = cuenta(['critico', 'sin_datos']);
  const atencion = cuenta(['atencion']);

  return (
    <section className="dash-minimapa" aria-labelledby="dash-minimapa-titulo">
      <div className="dash-gg__cabecera">
        <h2 id="dash-minimapa-titulo" className="font-display"><MapIcon size={17} aria-hidden="true" /> Mapa de sitios</h2>
        <button type="button" onClick={onAbrir} className="dash-enlace dash-gg__abrir">Abrir mapa <ChevronRight size={14} aria-hidden="true" /></button>
      </div>
      <button type="button" className="dash-minimapa__lienzo" onClick={onAbrir} aria-label={`Abrir el mapa de sitios: ${sitios.length} carros en ${datos.nombre}`}>
        <div ref={contenedorRef} className="dash-minimapa__mapa" aria-hidden="true" />
        <span className="dash-minimapa__resumen">
          {sitios.length} carros · {datos.nombre}
          {criticos > 0 && <span className="dash-minimapa__chip dash-minimapa__chip--critico">{criticos} crítico{criticos === 1 ? '' : 's'}</span>}
          {atencion > 0 && <span className="dash-minimapa__chip dash-minimapa__chip--atencion">{atencion} en atención</span>}
        </span>
      </button>
    </section>
  );
}
