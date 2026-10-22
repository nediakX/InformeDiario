// Ubicación de los carros LTE en la mina (Rajo Inca, División El Salvador).
// Fuente: listado de coordenadas entregado y "KMZ_SITIOS_19-08-2026.kmz" (altitud y orientación de
// los 3 sectores de cada sitio). Los azimuts se redondean a la decena, como se planifican.
import type { Division } from './divisiones';

export interface SitioMapa {
  /** Código como aparece en el listado (ej: LTE_CMF_09). */
  codigo: string;
  /** Código del carro en la app (catalogos.ts), si es distinto, para unir con la ubicación y los informes. */
  carro?: string;
  lat: number;
  lon: number;
  /** Metros sobre el nivel del mar (del KMZ). */
  altitud?: number;
  /** Orientación de los sectores de antena, en grados (0 = norte). */
  azimuts?: number[];
  /** Nombre del sitio en la Reportabilidad de GG, si es distinto del código (vacío = no reporta GG). */
  gg?: string;
  /** Aviso para revisar el dato. */
  nota?: string;
}

const RAJO_INCA: SitioMapa[] = [
  { codigo: 'LIGHT_LTE_12', carro: 'Light_12', gg: '', lat: -26.254049, lon: -69.54821996 },
  { codigo: 'LTE_CMF_01', lat: -26.272367, lon: -69.589742, altitud: 2486, azimuts: [90, 210, 330] },
  { codigo: 'LTE_CMF_02', lat: -26.255425, lon: -69.592775, altitud: 2458, azimuts: [30, 110, 180] },
  { codigo: 'LTE_CMF_04', lat: -26.239322, lon: -69.557997, altitud: 2763, azimuts: [10, 90, 210] },
  // En el listado figura como LTE_CMF_05 y en el KMZ como "CMM_05 FIN": es el carro LTE_CMM_05.
  { codigo: 'LTE_CMM_05', lat: -26.249131, lon: -69.561597, altitud: 2781 },
  { codigo: 'LTE_CMF_08', lat: -26.245128, lon: -69.539831, altitud: 2919, azimuts: [40, 160, 270] },
  { codigo: 'LTE_CMF_09', lat: -26.254431, lon: -69.540383, altitud: 3193, azimuts: [180, 240, 350] },
  // Es el carro que se reporta como "LTE_11" (en la app y en la Reportabilidad de GG).
  { codigo: 'LTE_CMF_11', carro: 'LTE_11', gg: 'LTE_11', lat: -26.273938, lon: -69.562873, altitud: 2986, azimuts: [30, 90, 270] },
  { codigo: 'LTE_CMM_03', lat: -26.245211, lon: -69.576033, altitud: 2626, azimuts: [80, 170, 260] },
  { codigo: 'LTE_CMM_06', lat: -26.259114, lon: -69.549489, altitud: 3202, azimuts: [20, 270, 320] },
  { codigo: 'LTE_CMM_07', lat: -26.232131, lon: -69.54165, altitud: 2836, azimuts: [120, 250, 330] },
  { codigo: 'LTE_CMM_10', lat: -26.277317, lon: -69.541322, altitud: 2915, azimuts: [30, 270, 310] },
];

export const SITIOS_MAPA: Partial<Record<Division, { nombre: string; sitios: SitioMapa[] }>> = {
  el_salvador: { nombre: 'Mina Rajo Inca', sitios: RAJO_INCA },
};

/** Sitio de la Reportabilidad de GG que corresponde al carro del mapa (null = no reporta GG). */
export const sitioGGDe = (s: SitioMapa): string | null => (s.gg === undefined ? s.codigo : s.gg || null);

/** "lat, lon" con 6 decimales. */
export const textoCoordenadas = (s: Pick<SitioMapa, 'lat' | 'lon'>) => `${s.lat.toFixed(6)}, ${s.lon.toFixed(6)}`;

/** Coordenadas por código de carro (para completar solos otros informes, ej. la mantención preventiva). */
export function coordenadasPorCarro(): Record<string, string> {
  const r: Record<string, string> = {};
  for (const { sitios } of Object.values(SITIOS_MAPA)) {
    for (const s of sitios ?? []) {
      if (s.nota && s.carro) continue; // las coordenadas dudosas no se usan para completar
      const clave = s.carro ?? s.codigo;
      if (!r[clave]) r[clave] = textoCoordenadas(s);
    }
  }
  return r;
}

/** Distancia en metros entre dos puntos (fórmula del haversine). */
export function distanciaMetros(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Punto a `metros` de distancia en la dirección `azimut` (grados desde el norte). */
export function puntoDesde(o: { lat: number; lon: number }, azimut: number, metros: number): [number, number] {
  const rad = (azimut * Math.PI) / 180;
  const dLat = (metros * Math.cos(rad)) / 111320;
  const dLon = (metros * Math.sin(rad)) / (111320 * Math.cos((o.lat * Math.PI) / 180));
  return [o.lat + dLat, o.lon + dLon];
}
