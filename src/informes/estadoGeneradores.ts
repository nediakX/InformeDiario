// Estado de los generadores (reportabilidad de GG) a una fecha: una imagen con el último reporte de cada generador y
// su estado (como en el panel principal), que va en la última hoja del Informe Diario y del Informe de Cierre.
// Solo para las divisiones con reportabilidad de GG (Andina no la hace).
import type { ISectionOptions } from 'docx';
import type { Division } from '../datos/divisiones';
import { SITIOS_GG, pendientesValidosGG, reportesDelDiaGuardados, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { TEMP_ATENCION, TEMP_CRITICA, analizarGeneradores, type EstadoGG, type SitioGG } from '../datos/analisisGG';
import { esNoRealizada } from '../datos/reglasGG';
import { dataUrlToUint8Array } from '../lib/imagenes';

/** La división hace reportabilidad de GG (Andina no: su Word no lleva esta hoja). */
export const tieneReportabilidadGG = (division: Division) => division !== 'andina';

export interface ImagenEstadoGG {
  /** PNG de la tabla. */
  bytes: Uint8Array;
  /** Tamaño de la tabla a escala 1 (px); la imagen se genera al doble para que se vea nítida. */
  ancho: number;
  alto: number;
  /** Fecha del estado (AAAA-MM-DD). */
  fecha: string;
  /** No se pudo leer la nube: la imagen se armó con lo guardado en el equipo. */
  sinConexion: boolean;
}

/** Días hacia atrás que se leen (el análisis avisa desde los 2 días sin reporte). */
const DIAS_ATRAS = 30;
/** Con señal débil no se espera más que esto (es solo una hoja del Word): se usa lo guardado en el equipo. */
const ESPERA_MAXIMA_MS = 15_000;
const conEsperaMaxima = <T>(promesa: Promise<T>) => new Promise<T>((resolve, reject) => {
  const timer = setTimeout(() => reject(new DOMException('Tiempo de espera agotado (timeout)', 'TimeoutError')), ESPERA_MAXIMA_MS);
  promesa.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
});
const ANCHO = 1152;

const sumarDias = (iso: string, n: number) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const ddmm = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const numero = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: 1 }));
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const ESTADOS: Record<EstadoGG, { nombre: string; fondo: string; texto: string }> = {
  ok: { nombre: 'Normal', fondo: '#E6F4EA', texto: '#1E6B34' },
  atencion: { nombre: 'Atención', fondo: '#FFF3CD', texto: '#7A5B00' },
  critico: { nombre: 'Crítico', fondo: '#FDE8E8', texto: '#A32626' },
  sin_datos: { nombre: 'Sin reportes', fondo: '#EEF1F2', texto: '#55636B' },
};
const ROJO = '#A32626';
const AMBAR = '#8A5A00';

// Copia en este equipo de lo último leído de la nube (la fecha más reciente): sin señal, la hoja se arma con ella.
interface Copia { hasta: string; reportes: ReporteGG[] }
const claveCopia = (division: Division) => `psinet_estado_gg_${division}`;
function leerCopia(division: Division): Copia | null {
  try {
    const c = JSON.parse(localStorage.getItem(claveCopia(division)) ?? 'null') as Copia | null;
    return c && typeof c.hasta === 'string' && Array.isArray(c.reportes) ? c : null;
  } catch { return null; }
}
function guardarCopia(division: Division, copia: Copia) {
  const actual = leerCopia(division);
  if (actual && actual.hasta > copia.hasta) return; // un informe antiguo no reemplaza la copia más nueva
  try { localStorage.setItem(claveCopia(division), JSON.stringify(copia)); } catch { /* sin almacenamiento */ }
}

/** Une listas de reportes sin repetir (por id); a igual id manda el de la lista posterior. */
const unir = (...listas: ReporteGG[][]) => [...new Map(listas.flat().map(r => [r.id, r] as const)).values()];

/** Reportes de los últimos días hasta la fecha: los de la nube y los guardados sin señal en este equipo. */
async function reportesHasta(division: Division, fecha: string): Promise<{ reportes: ReporteGG[]; sinConexion: boolean }> {
  const desde = sumarDias(fecha, -DIAS_ATRAS);
  const enRango = (r: ReporteGG) => r.fecha >= desde && r.fecha <= fecha;
  const locales = pendientesValidosGG(division).filter(enRango);
  try {
    const nube = await conEsperaMaxima(todosLosReportesGG({ division, desde, hasta: fecha }));
    guardarCopia(division, { hasta: fecha, reportes: nube });
    return { reportes: unir(nube, locales.filter(p => !nube.some(r => r.id === p.id))), sinConexion: false };
  } catch {
    // Sin señal: la última copia leída de la nube, lo de ese día que quedó guardado en el equipo y lo hecho aquí sin señal.
    const copia = (leerCopia(division)?.reportes ?? []).filter(enRango);
    return { reportes: unir(copia, reportesDelDiaGuardados(division, fecha)?.reportes ?? [], locales), sinConexion: true };
  }
}

/** Sin señal, un generador sin reportes a la vista no es "sin reportes": solo no se sabe. */
const nombreEstado = (e: EstadoGG, sinConexion: boolean) => (e === 'sin_datos' && sinConexion ? 'Sin datos' : ESTADOS[e].nombre);
/** Texto del resumen de arriba ("8 normales", "1 crítico"...). */
const resumenDe = (e: EstadoGG, n: number, sinConexion: boolean) =>
  e === 'ok' ? `${n} ${n === 1 ? 'normal' : 'normales'}`
    : e === 'atencion' ? `${n} en atención`
      : e === 'critico' ? `${n} ${n === 1 ? 'crítico' : 'críticos'}`
        : `${n} ${sinConexion ? 'sin datos' : 'sin reportes'}`;

/** Fila de la tabla: el último reporte del generador hasta la fecha, con su estado y el porqué. */
function fila(s: SitioGG, fecha: string, par: boolean, sinConexion: boolean): string {
  const r = s.ultimo;
  const estado = ESTADOS[s.estado];
  const medido = !!r && !esNoRealizada(r);
  const td = (contenido: string, estilo = '') =>
    `<td style="padding:6px 8px;border-bottom:1px solid #DCE1E6;vertical-align:middle;${estilo}">${contenido}</td>`;
  const valor = (texto: string, color: string | null) => (color ? `<b style="color:${color}">${escapar(texto)}</b>` : escapar(texto));
  const cuando = r
    ? `<div style="white-space:nowrap">${ddmm(r.fecha)}${r.hora ? ` ${escapar(r.hora.slice(0, 5))}` : ''}</div><div style="font-size:12px;line-height:1.25;color:#55636B;margin-top:1px">${escapar(r.reporta)}</div>`
    : '—';
  // El porqué del estado (sin repetir lo que ya dice la etiqueta: "Sin reportes").
  const motivos = s.alertas.filter(a => a.titulo !== 'Sin reportes').map(a => escapar(a.titulo));
  // Reportabilidad no realizada de días anteriores (la del mismo día ya viene como aviso).
  if (r && !medido && !s.alertas.some(a => a.titulo === 'Reportabilidad no realizada')) motivos.unshift('Reportabilidad no realizada');
  // La observación solo explica el estado si es del reporte de ese día.
  const observacion = r && r.fecha === fecha && r.observaciones?.trim() ? `<i style="color:#55636B">${escapar(r.observaciones.trim())}</i>` : '';
  const chip = `<span style="display:inline-block;padding:2px 9px;margin-right:6px;border-radius:999px;background:${estado.fondo};color:${estado.texto};font-weight:700;font-size:13px;white-space:nowrap">${nombreEstado(s.estado, sinConexion)}</span>`;
  // El estado y el porqué en la misma línea; la observación del día, debajo.
  const estadoCelda = `<div style="font-size:13px;line-height:1.4">${chip}${motivos.join(' · ')}</div>${observacion ? `<div style="font-size:13px;line-height:1.3;margin-top:2px">${observacion}</div>` : ''}`;
  return `<tr style="background:${par ? '#F4F7FA' : '#FFFFFF'}">`
    + td(escapar(s.sitio), 'font-weight:700;color:#0E4660;white-space:nowrap')
    + td(cuando)
    + td(medido ? valor(r.combustible ?? '—', r.combustible === '1/4' ? ROJO : null) : '—')
    + td(medido ? valor(r.nivelRefrigerante ?? '—', r.nivelRefrigerante === 'Minimo' ? AMBAR : null) : '—')
    + td(medido ? valor(r.nivelAceite ?? '—', r.nivelAceite === 'Bajo' ? ROJO : r.nivelAceite === 'Sobre Relleno' ? AMBAR : null) : '—')
    + td(medido && r.temperatura !== null ? valor(`${numero(r.temperatura)} °C`, r.temperatura >= TEMP_CRITICA ? ROJO : r.temperatura >= TEMP_ATENCION ? AMBAR : null) : '—', 'white-space:nowrap')
    + td(medido && r.horometro !== null ? `${numero(r.horometro)} h` : '—', 'white-space:nowrap')
    + td(estadoCelda)
    + '</tr>';
}

function htmlEstado(porSitio: SitioGG[], fecha: string, sinConexion: boolean): string {
  const cuenta = (e: EstadoGG) => porSitio.filter(s => s.estado === e).length;
  const resumen = (['ok', 'atencion', 'critico', 'sin_datos'] as EstadoGG[])
    .filter(e => e !== 'sin_datos' || cuenta(e) > 0)
    .map(e => `<span style="padding:4px 12px;border-radius:999px;background:${ESTADOS[e].fondo};color:${ESTADOS[e].texto};font-weight:700;font-size:15px;white-space:nowrap">${resumenDe(e, cuenta(e), sinConexion)}</span>`)
    .join('');
  const origen = sinConexion ? ' · sin señal: con lo guardado en este equipo' : '';
  const cabecera = ['Generador', 'Último reporte', 'Combustible', 'Refrigerante', 'Aceite', 'Temp.', 'Horómetro', 'Estado']
    .map(t => `<th style="text-align:left;padding:8px 8px;background:#0E4660;color:#FFFFFF;font-size:14px;font-weight:700;white-space:nowrap">${t}</th>`)
    .join('');
  return `
    <div style="width:${ANCHO}px;box-sizing:border-box;background:#FFFFFF;padding:4px 2px 6px;font-family:Arial,Helvetica,sans-serif;color:#222222">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:24px;border-bottom:3px solid #0E4660;padding-bottom:10px;margin-bottom:10px">
        <div>
          <div style="font-size:21px;font-weight:700;color:#0E4660">Estado al ${dmy(fecha)}</div>
          <div style="font-size:14px;color:#55636B;margin-top:3px">Último reporte de cada generador (Reportabilidad de GG)${origen}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px">${resumen}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:15px">
        <colgroup><col style="width:168px"><col style="width:140px"><col style="width:100px"><col style="width:106px"><col style="width:104px"><col style="width:72px"><col style="width:96px"><col></colgroup>
        <thead><tr>${cabecera}</tr></thead>
        <tbody>${porSitio.map((s, i) => fila(s, fecha, i % 2 === 1, sinConexion)).join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Imagen con el estado de los generadores al día indicado (el último reporte de cada uno hasta esa fecha). Null si la
 * división no hace reportabilidad de GG o no hay ningún reporte que mostrar (por ejemplo, sin señal y sin nada guardado).
 */
export async function imagenEstadoGeneradores(division: Division, fecha: string): Promise<ImagenEstadoGG | null> {
  if (!tieneReportabilidadGG(division)) return null;
  const { reportes, sinConexion } = await reportesHasta(division, fecha);
  if (!reportes.length) return null;
  const { porSitio } = analizarGeneradores(SITIOS_GG[division] ?? [], reportes, fecha);
  const { toPng } = await import('html-to-image');
  const contenedor = document.createElement('div');
  contenedor.setAttribute('aria-hidden', 'true');
  Object.assign(contenedor.style, { position: 'fixed', left: '-20000px', top: '0', width: `${ANCHO}px`, zIndex: '-1' });
  contenedor.innerHTML = htmlEstado(porSitio, fecha, sinConexion);
  document.body.appendChild(contenedor);
  try {
    const tabla = contenedor.firstElementChild as HTMLElement;
    const alto = Math.ceil(tabla.getBoundingClientRect().height);
    const dataUrl = await toPng(tabla, { pixelRatio: 2, backgroundColor: '#ffffff', width: ANCHO, height: alto });
    return { bytes: dataUrlToUint8Array(dataUrl), ancho: ANCHO, alto, fecha, sinConexion };
  } finally {
    contenedor.remove();
  }
}

/**
 * Última hoja del Word con el estado de los generadores: horizontal (como el cuadro Vertiv), para que la tabla se lea
 * bien a lo ancho, con el título en el mismo estilo de los demás títulos del informe.
 */
export async function seccionEstadoGeneradores(imagen: ImagenEstadoGG, colorTitulo: string): Promise<ISectionOptions> {
  const { AlignmentType, Header, HeadingLevel, ImageRun, PageOrientation, Paragraph, TextRun } = await import('docx');
  const MARGEN = 1134; // 2 cm
  // Espacio útil de la hoja en px (1 px = 15 twips), menos el título.
  const anchoUtil = (15840 - 2 * MARGEN) / 15;
  const altoUtil = (12240 - 2 * MARGEN) / 15 - 60;
  const escala = Math.min(anchoUtil / imagen.ancho, altoUtil / imagen.alto, 1);
  return {
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
      },
    },
    headers: { default: new Header({ children: [new Paragraph({ text: '' })] }) },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 160 },
        children: [new TextRun({ text: 'Estado actual de los generadores', color: colorTitulo, size: 26, font: 'Arial', bold: true })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: imagen.bytes, transformation: { width: Math.round(imagen.ancho * escala), height: Math.round(imagen.alto * escala) }, type: 'png' })],
      }),
    ],
  };
}
