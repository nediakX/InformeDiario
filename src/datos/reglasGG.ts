// Reglas de la Reportabilidad de GG sin acceso a la nube (las usan el guardado, las pantallas y el análisis sin
// cargar Supabase).
import type { ReporteGG } from './reportesGG';
import type { Division } from './divisiones';

/** Reportabilidad "no realizada": el reporte no tiene ninguna medición (solo el motivo en observaciones). */
export const esNoRealizada = (r: Pick<ReporteGG, 'combustible' | 'horometro' | 'nroPartidas' | 'nivelRefrigerante' | 'nivelAceite' | 'temperatura'>): boolean =>
  r.combustible == null && r.horometro == null && r.nroPartidas == null
  && r.nivelRefrigerante == null && r.nivelAceite == null && r.temperatura == null;

/**
 * Una reportabilidad por carro y día. Devuelve el reporte que ya existe y por el que `nuevo` NO se guarda, o null si
 * se puede guardar: si el carro ya tiene un reporte con mediciones ese día, no va otro; si solo está anotado como
 * "no realizada", sí se puede guardar uno con mediciones (se pudo revisar después), pero no otro "no realizada".
 */
export function reporteQueBloquea(
  nuevo: { division: Division; fecha: string; sitio: string; id?: string; noRealizada: boolean },
  existentes: readonly ReporteGG[],
): ReporteGG | null {
  const mismos = existentes.filter(r => r.id !== nuevo.id && r.division === nuevo.division && r.fecha === nuevo.fecha && r.sitio === nuevo.sitio);
  if (!mismos.length) return null;
  const conMediciones = mismos.find(r => !esNoRealizada(r));
  if (conMediciones) return conMediciones;
  return nuevo.noRealizada ? mismos[0] : null;
}

/** Reportes que repiten la reportabilidad de un carro en un día: vale el primero que se hizo; los demás sobran. */
export function idsRepetidosGG(reportes: readonly ReporteGG[]): Set<string> {
  const porDia = new Map<string, ReporteGG[]>();
  for (const r of reportes) {
    const clave = `${r.division}|${r.fecha}|${r.sitio}`;
    porDia.set(clave, [...(porDia.get(clave) ?? []), r]);
  }
  const repetidos = new Set<string>();
  for (const grupo of porDia.values()) {
    if (grupo.length < 2) continue;
    const vigentes: ReporteGG[] = [];
    for (const r of [...grupo].sort((a, b) => a.marcaTemporal.localeCompare(b.marcaTemporal))) {
      if (reporteQueBloquea({ ...r, noRealizada: esNoRealizada(r) }, vigentes)) repetidos.add(r.id);
      else vigentes.push(r);
    }
  }
  return repetidos;
}
