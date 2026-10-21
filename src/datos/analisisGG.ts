// Análisis automático de la Reportabilidad de GG: estado de cada generador y alertas.
// Lo usan el panel principal (vista compacta) y el panel de administración (pestaña Generadores).
//
// Reglas (ajustadas con el histórico de la planilla de El Salvador):
//  - Reporte: el del día puede hacerse a cualquier hora, así que 1 día sin reporte no es alerta
//    ("pendiente hoy"); 2 días = atención; 3 días o más = crítico.
//  - Combustible en 1/4 = crítico (hay que rellenar).
//  - Aceite "Bajo" = crítico; "Sobre Relleno" = atención. Refrigerante "Minimo" = atención.
//  - Temperatura: 90 °C o más = atención; 95 °C o más = crítico.
//  - Horómetro: si baja más de una décima respecto del reporte anterior (una variación de 0,1 h es
//    redondeo de lectura, no alerta), o sube más de lo posible (más horas que las
//    transcurridas), es un dato a revisar (casi siempre un error de digitación). Si un generador que
//    normalmente suma horas lleva 3 días sin moverse, se avisa (podría no estar operando).
//  - Partidas: si bajan, o suben mucho más de lo normal en el sitio, se avisa.
import type { ReporteGG } from './reportesGG';

/** Variación del horómetro que se considera lectura/redondeo y no genera alerta (una décima). */
export const TOLERANCIA_HOROMETRO = 0.1;
const EPS = 1e-6;
/** El horómetro bajó de verdad (más de una décima). */
export const horometroRetrocede = (anterior: number, actual: number) => actual - anterior < -(TOLERANCIA_HOROMETRO + EPS);

// Mismo valor que COMBUSTIBLE_PCT de reportesGG (aquí aparte para que este cálculo no cargue Supabase).
const COMBUSTIBLE_PCT: Record<string, number> = { '1/4': 25, '1/2': 50, '3/4': 75, Lleno: 100 };

export type Severidad = 'critico' | 'atencion';
export type EstadoGG = 'ok' | 'atencion' | 'critico' | 'sin_datos';

export interface AlertaGG {
  sitio: string;
  severidad: Severidad;
  /** "reporte": falta de reportes; "equipo": un dato del generador fuera de lo normal. */
  tipo: 'reporte' | 'equipo';
  /** Texto muy corto para la tarjeta del sitio ("Comb. 1/4"). */
  corto: string;
  /** Texto corto para mostrar ("Combustible bajo (1/4)"). */
  titulo: string;
  /** Detalle con los valores que la provocaron. */
  detalle: string;
  fecha: string | null;
}

export interface SitioGG {
  sitio: string;
  estado: EstadoGG;
  ultimo: ReporteGG | null;
  /** Días desde el último reporte (Infinity si no hay). */
  diasSinReporte: number;
  alertas: AlertaGG[];
  /** Reportes del periodo, del más antiguo al más reciente (para los minigráficos). */
  serie: ReporteGG[];
}

const instante = (r: ReporteGG) => Date.parse(`${r.fecha}T${r.hora ?? '12:00'}:00`);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00`) - Date.parse(`${a}T12:00:00`)) / 86_400_000);
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });
const mediana = (v: number[]) => {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const TEMP_ATENCION = 90;
export const TEMP_CRITICA = 95;

/** Valor numérico de un dato (combustible en %), o null. */
export const valorGG = (r: ReporteGG, dato: 'horometro' | 'temperatura' | 'combustible' | 'nroPartidas'): number | null =>
  dato === 'combustible' ? (r.combustible ? COMBUSTIBLE_PCT[r.combustible] ?? null : null) : r[dato];

export function analizarSitio(sitio: string, reportes: ReporteGG[], hoy: string): SitioGG {
  const serie = reportes.filter(r => r.sitio === sitio).sort((a, b) => instante(a) - instante(b));
  const ultimo = serie[serie.length - 1] ?? null;
  const alertas: AlertaGG[] = [];
  const alerta = (severidad: Severidad, corto: string, titulo: string, detalle: string, fecha: string | null = ultimo?.fecha ?? null, tipo: AlertaGG['tipo'] = 'equipo') =>
    alertas.push({ sitio, severidad, tipo, corto, titulo, detalle, fecha });

  const diasSinReporte = ultimo ? diasEntre(ultimo.fecha, hoy) : Infinity;
  const cuando = ultimo ? `Último reporte: ${ddmm(ultimo.fecha)}${ultimo.hora ? ` ${ultimo.hora}` : ''}.` : '';
  if (!ultimo) alerta('critico', 'Sin reportes', 'Sin reportes', 'No hay reportes en los últimos 30 días.', null, 'reporte');
  else if (diasSinReporte >= 3) alerta('critico', `${diasSinReporte} días sin rep.`, `${diasSinReporte} días sin reporte`, cuando, ultimo.fecha, 'reporte');
  else if (diasSinReporte === 2) alerta('atencion', '2 días sin rep.', '2 días sin reporte', cuando, ultimo.fecha, 'reporte');

  if (ultimo) {
    if (ultimo.combustible === '1/4') alerta('critico', 'Comb. 1/4', 'Combustible bajo (1/4)', 'Programar relleno de combustible.');
    if (ultimo.nivelAceite === 'Bajo') alerta('critico', 'Aceite bajo', 'Aceite bajo', 'Revisar nivel de aceite.');
    else if (ultimo.nivelAceite === 'Sobre Relleno') alerta('atencion', 'Aceite alto', 'Aceite sobre relleno', 'Nivel de aceite sobre lo normal.');
    if (ultimo.nivelRefrigerante === 'Minimo') alerta('atencion', 'Refrig. mínimo', 'Refrigerante al mínimo', 'Revisar nivel de refrigerante.');
    if (ultimo.temperatura != null) {
      if (ultimo.temperatura >= TEMP_CRITICA) alerta('critico', 'Temp. muy alta', 'Temperatura muy alta', `${fmt(ultimo.temperatura)} °C (límite ${TEMP_CRITICA} °C).`);
      else if (ultimo.temperatura >= TEMP_ATENCION) alerta('atencion', 'Temp. alta', 'Temperatura alta', `${fmt(ultimo.temperatura)} °C (sobre ${TEMP_ATENCION} °C).`);
    }
  }

  // Horómetro y partidas: se comparan los últimos reportes con el anterior de cada uno.
  const conHoras = serie.filter(r => r.horometro != null);
  const deltasHoras: number[] = [];
  for (let i = 1; i < conHoras.length; i++) {
    const horas = (instante(conHoras[i]) - instante(conHoras[i - 1])) / 3_600_000;
    const d = Math.max(0, conHoras[i].horometro! - conHoras[i - 1].horometro!);
    if (horas > 0 && d <= horas + 1) deltasHoras.push((d / horas) * 24);
  }
  const ritmoNormal = mediana(deltasHoras); // horas de uso por día, típico del sitio
  const n = conHoras.length;
  if (n >= 2) {
    const [a, b] = [conHoras[n - 2], conHoras[n - 1]];
    const horas = (instante(b) - instante(a)) / 3_600_000;
    const d = b.horometro! - a.horometro!;
    if (horometroRetrocede(a.horometro!, b.horometro!)) alerta('atencion', 'Horóm. baja', 'Horómetro retrocede', `${fmt(a.horometro!)} → ${fmt(b.horometro!)} h: revisar si se digitó mal.`, b.fecha);
    else if (d > 0 && horas > 0 && d > horas + 1) alerta('atencion', 'Horóm. salta', 'Salto de horómetro', `Subió ${fmt(d)} h en ${fmt(horas)} h transcurridas: revisar el dato.`, b.fecha);
  }
  if (ritmoNormal >= 2 && n >= 3) {
    // Generador que normalmente opera (≥ 2 h/día) y no suma horas en 3 días o más.
    const ultimoH = conHoras[n - 1];
    let k = n - 1;
    // Variaciones de una décima cuentan como "sin moverse" (redondeo de la lectura).
    while (k > 0 && Math.abs(conHoras[k - 1].horometro! - ultimoH.horometro!) <= TOLERANCIA_HOROMETRO + EPS) k--;
    const primeroIgual = conHoras[k];
    const diasQuieto = diasEntre(primeroIgual.fecha, ultimoH.fecha);
    if (diasQuieto >= 3) alerta('atencion', 'Horóm. detenido', 'Horómetro detenido', `Sin sumar horas desde el ${ddmm(primeroIgual.fecha)} (normal: ~${fmt(ritmoNormal)} h/día). ¿Está operando?`, ultimoH.fecha);
  }

  const conPartidas = serie.filter(r => r.nroPartidas != null);
  const m = conPartidas.length;
  if (m >= 2) {
    const deltas = conPartidas.slice(1).map((r, i) => r.nroPartidas! - conPartidas[i].nroPartidas!).filter(d => d >= 0);
    const [a, b] = [conPartidas[m - 2], conPartidas[m - 1]];
    const d = b.nroPartidas! - a.nroPartidas!;
    const normal = mediana(deltas.slice(0, -1));
    if (d < 0) alerta('atencion', 'Partidas bajan', 'Partidas retroceden', `${a.nroPartidas} → ${b.nroPartidas}: revisar si se digitó mal.`, b.fecha);
    else if (d >= 10 && d > Math.max(5, normal * 5)) alerta('atencion', 'Muchas partidas', 'Muchas partidas', `+${d} partidas desde el reporte anterior (normal: ~${fmt(normal)}).`, b.fecha);
  }

  const orden: Record<Severidad, number> = { critico: 0, atencion: 1 };
  alertas.sort((x, y) => orden[x.severidad] - orden[y.severidad]);
  const estado: EstadoGG = !ultimo ? 'sin_datos'
    : alertas.some(a => a.severidad === 'critico') ? 'critico'
      : alertas.length ? 'atencion' : 'ok';
  return { sitio, estado, ultimo, diasSinReporte, alertas, serie };
}

export function analizarGeneradores(sitios: string[], reportes: ReporteGG[], hoy: string) {
  const porSitio = sitios.map(s => analizarSitio(s, reportes, hoy));
  // Sitios con reportes que no están en la lista fija (por si se agregó uno nuevo).
  for (const s of new Set(reportes.map(r => r.sitio))) if (!sitios.includes(s)) porSitio.push(analizarSitio(s, reportes, hoy));
  const alertas = porSitio.flatMap(s => s.alertas).sort((a, b) => (a.severidad === b.severidad ? a.sitio.localeCompare(b.sitio) : a.severidad === 'critico' ? -1 : 1));
  const cuenta = (e: EstadoGG) => porSitio.filter(s => s.estado === e).length;
  return { porSitio, alertas, resumen: { ok: cuenta('ok'), atencion: cuenta('atencion'), critico: cuenta('critico') + cuenta('sin_datos') } };
}
