// Reportabilidad de GG de los últimos 30 días, analizada por generador (mismas reglas que el panel).
// Se actualiza sola cuando alguien reporta y, sin señal, usa la última copia guardada en este equipo.
import { useEffect, useMemo, useState } from 'react';
import type { Division } from '../../datos/divisiones';
import { hoyLocalISO, sumarDias } from '../../datos/fechas';
import { EVENTO_GG, SITIOS_GG, pendientesGG, suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../../datos/reportesGG';
import { analizarGeneradores, type SitioGG } from '../../datos/analisisGG';
import { esErrorDeRed } from '../../lib/conexion';

const DIAS = 30;
const claveCopia = (division: Division) => `psinet_mtto_gg_reportes_${division}`;

interface Lectura { reportes: ReporteGG[]; copiaDel: string | null }

function leerCopia(division: Division): Lectura | null {
  try {
    const c = JSON.parse(localStorage.getItem(claveCopia(division)) ?? 'null') as { reportes: ReporteGG[]; en: string } | null;
    return c && Array.isArray(c.reportes) ? { reportes: c.reportes, copiaDel: c.en } : null;
  } catch { return null; }
}

export interface AnalisisReportesGG {
  porSitio: Map<string, SitioGG>;
  /** Sin conexión: los reportes son la copia guardada en este equipo (cuándo se guardó, ISO). */
  copiaDel: string | null;
}

export function useAnalisisGG(division: Division): { analisis: AnalisisReportesGG | null; error: boolean } {
  const hoy = hoyLocalISO();
  const desde = sumarDias(hoy, -(DIAS - 1));
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let vivo = true;
    todosLosReportesGG({ division, desde, hasta: hoy })
      .then(reportes => {
        if (!vivo) return;
        setLectura({ reportes, copiaDel: null });
        setError(false);
        try { localStorage.setItem(claveCopia(division), JSON.stringify({ reportes, en: new Date().toISOString() })); } catch { /* sin espacio */ }
      })
      .catch(e => {
        if (!vivo) return;
        const copia = esErrorDeRed(e) ? leerCopia(division) : null;
        if (copia) { setLectura(copia); setError(false); } else setError(true);
      });
    return () => { vivo = false; };
  }, [division, desde, hoy, version]);

  // Reportes nuevos o corregidos por otras personas, y los que se guardan sin señal en este equipo.
  useEffect(() => suscribirReportesGG(division, () => setVersion(v => v + 1)), [division]);
  useEffect(() => {
    const alCambiar = () => setVersion(v => v + 1);
    window.addEventListener(EVENTO_GG, alCambiar);
    return () => window.removeEventListener(EVENTO_GG, alCambiar);
  }, []);

  const analisis = useMemo(() => {
    if (!lectura) return null;
    const locales = pendientesGG().filter(p => p.division === division && !lectura.reportes.some(r => r.id === p.id));
    const { porSitio } = analizarGeneradores(SITIOS_GG[division] ?? [], [...lectura.reportes, ...locales], hoy);
    return { porSitio: new Map(porSitio.map(s => [s.sitio, s])), copiaDel: lectura.copiaDel };
  }, [lectura, division, hoy]);

  return { analisis, error };
}
