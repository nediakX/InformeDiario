// Reportabilidad de GG de cada carro del mapa (mismos datos y reglas que el monitoreo del panel):
// últimos 30 días, se actualiza sola cuando alguien reporta (en la nube o en este equipo).
import { useEffect, useMemo, useState } from 'react';
import type { Division } from '../datos/divisiones';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import { EVENTO_GG, SITIOS_GG, pendientesGG, suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { analizarGeneradores, type SitioGG } from '../datos/analisisGG';
import { type SitioMapa, sitioGGDe } from '../datos/sitiosMapa';

/** Por código del carro: el análisis, undefined mientras carga, o null si el carro no reporta GG. */
export function useGGSitios(division: Division, sitios: SitioMapa[]): Map<string, SitioGG | null | undefined> {
  const hoy = hoyLocalISO();
  const desde = sumarDias(hoy, -30);
  const [reportes, setReportes] = useState<ReporteGG[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!sitios.length) return;
    let vivo = true;
    todosLosReportesGG({ division, desde, hasta: hoy })
      .then(r => { if (vivo) setReportes(r); })
      .catch(() => { if (vivo) setReportes([]); });
    return () => { vivo = false; };
  }, [division, desde, hoy, version, sitios.length]);
  useEffect(() => (sitios.length ? suscribirReportesGG(division, () => setVersion(v => v + 1)) : undefined), [division, sitios.length]);
  useEffect(() => {
    const alCambiar = () => setVersion(v => v + 1);
    window.addEventListener(EVENTO_GG, alCambiar);
    return () => window.removeEventListener(EVENTO_GG, alCambiar);
  }, []);
  return useMemo(() => {
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
}
