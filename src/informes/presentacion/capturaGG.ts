// Captura de la reportabilidad de GG de cada día (desde los reportes guardados en la app, tabla reportes_gg).
// Reemplaza al formulario de Google: la imagen se incrusta en el recuadro de cada día de la lámina de reportabilidad.
import type { ReporteGG } from '../../datos/reportesGG';
import { SITIOS_GG } from '../../datos/reportesGG';
import type { Division } from '../../datos/divisiones';

// Proporción del recuadro de la plantilla (ancho / alto). La imagen se genera con esta misma proporción
// para que la lámina no la recorte.
const PROPORCION = 3.3;
const ANCHO_MIN = 1900;
const ALTO_TITULO = 74;
const ALTO_ENCABEZADO = 44;
const ALTO_LINEA = 21;
const ALTO_FILA_MIN = 40;
const CARACTERES_POR_LINEA = 85;

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const numero = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: 1 }));

const fechaCorta = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

const sinMediciones = (r: ReporteGG) =>
  r.combustible === null && r.horometro === null && r.nroPartidas === null
  && r.nivelRefrigerante === null && r.nivelAceite === null && r.temperatura === null;

/** Filas del día ordenadas como en el formulario (por sitio) y, dentro de cada sitio, por hora de ingreso. */
function ordenarDelDia(reportes: ReporteGG[], division: Division): ReporteGG[] {
  const orden = SITIOS_GG[division];
  const posicion = (sitio: string) => { const i = orden.indexOf(sitio); return i === -1 ? orden.length : i; };
  return [...reportes].sort((a, b) =>
    (posicion(a.sitio) - posicion(b.sitio)) || a.marcaTemporal.localeCompare(b.marcaTemporal));
}

/** Alto aproximado de una fila: la observación puede ocupar varias líneas. */
const altoDeFila = (r: ReporteGG) => {
  const texto = (sinMediciones(r) ? 'NO REALIZADA. ' : '') + (r.observaciones ?? '');
  const lineas = Math.max(1, Math.ceil(texto.length / CARACTERES_POR_LINEA));
  return Math.max(ALTO_FILA_MIN, 14 + lineas * ALTO_LINEA);
};

function tablaDelDia(reportes: ReporteGG[], division: Division, fecha: string) {
  const filas = ordenarDelDia(reportes, division);
  const sitiosTotal = SITIOS_GG[division].length;
  const sitiosReportados = new Set(filas.map(r => r.sitio)).size;
  const alturas = filas.map(altoDeFila);
  const altoContenido = ALTO_TITULO + ALTO_ENCABEZADO + alturas.reduce((s, h) => s + h, 0) + 24;
  const alto = Math.max(altoContenido, ANCHO_MIN / PROPORCION);
  const ancho = Math.round(alto * PROPORCION);

  const celdas = filas.map((r, i) => {
    const medido = !sinMediciones(r);
    const valores = medido
      ? [r.combustible ?? '—', numero(r.horometro), numero(r.nroPartidas), r.nivelRefrigerante ?? '—', r.nivelAceite ?? '—', numero(r.temperatura)]
      : ['—', '—', '—', '—', '—', '—'];
    const observacion = medido
      ? escapar(r.observaciones ?? '')
      : `<b style="color:#a32626">NO REALIZADA.</b> ${escapar(r.observaciones ?? '')}`;
    const fondo = i % 2 ? '#F4F7FA' : '#FFFFFF';
    const td = (texto: string, extra = '') => `<td style="padding:6px 8px;border-bottom:1px solid #DCE1E6;${extra}">${texto}</td>`;
    return `<tr style="background:${fondo};height:${alturas[i]}px">`
      + td(escapar(r.sitio), 'font-weight:700;color:#0E4660;white-space:nowrap')
      + td(escapar(r.turno.replace('TURNO ', 'Turno ')), 'white-space:nowrap')
      + td(r.hora ? escapar(r.hora.slice(0, 5)) : '—', 'white-space:nowrap')
      + td(escapar(r.reporta))
      + valores.map(v => td(escapar(v), 'white-space:nowrap')).join('')
      + td(observacion, 'white-space:normal;line-height:1.3')
      + '</tr>';
  }).join('');

  const cabecera = ['Sitio', 'Turno', 'Hora', 'Reporta', 'Comb.', 'Horómetro', 'Partidas', 'Refrig.', 'Aceite', 'Temp. °C', 'Observaciones']
    .map(t => `<th style="text-align:left;padding:8px;background:#0E4660;color:#fff;font-size:16px">${t}</th>`).join('');

  const html = `
    <div style="width:${ancho}px;height:${alto}px;box-sizing:border-box;background:#fff;padding:16px 22px;font-family:Arial,Helvetica,sans-serif;color:#222;display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:3px solid #0E4660;padding-bottom:8px;margin-bottom:10px">
        <span style="font-size:30px;font-weight:700;color:#0E4660">REPORTABILIDAD GG · ${fechaCorta(fecha)}</span>
        <span style="font-size:18px;color:#555">${sitiosReportados} de ${sitiosTotal} sitios reportados</span>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:16px">
        <colgroup>
          <col style="width:9%"><col style="width:6%"><col style="width:5%"><col style="width:10%"><col style="width:6%">
          <col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:8%"><col style="width:6%"><col>
        </colgroup>
        <thead><tr>${cabecera}</tr></thead>
        <tbody>${celdas}</tbody>
      </table>
    </div>`;
  return { html, ancho, alto };
}

/**
 * Imagen JPEG (dataURL) de la reportabilidad GG de cada día con reportes en la app.
 * Los días sin reportes no aparecen en el resultado (la presentación usa entonces otra foto o deja el recuadro sin foto).
 */
export async function capturasGG(reportes: ReporteGG[], division: Division, fechas: string[]): Promise<Record<string, string>> {
  const { toJpeg } = await import('html-to-image');
  const salida: Record<string, string> = {};
  for (const fecha of fechas) {
    const delDia = reportes.filter(r => r.fecha === fecha);
    if (delDia.length === 0) continue;
    const { html, ancho, alto } = tablaDelDia(delDia, division, fecha);
    const contenedor = document.createElement('div');
    contenedor.setAttribute('aria-hidden', 'true');
    Object.assign(contenedor.style, { position: 'fixed', left: '-10000px', top: '0', width: `${ancho}px`, height: `${alto}px`, zIndex: '-1' });
    contenedor.innerHTML = html;
    document.body.appendChild(contenedor);
    try {
      salida[fecha] = await toJpeg(contenedor.firstElementChild as HTMLElement, { quality: 0.92, pixelRatio: 2, backgroundColor: '#ffffff' });
    } finally {
      contenedor.remove();
    }
  }
  return salida;
}
