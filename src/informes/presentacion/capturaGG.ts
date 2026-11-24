// Captura de la reportabilidad de GG de cada día (desde los reportes guardados en la app, tabla reportes_gg).
// Reemplaza al formulario de Google: la imagen se incrusta en el recuadro de cada día de la lámina de reportabilidad.
// La lámina ya dice "REPORTABILIDAD GG" y la fecha sobre cada recuadro: la imagen es solo la tabla, lo más grande
// que cabe en el recuadro.
import type { ReporteGG } from '../../datos/reportesGG';
import { SITIOS_GG } from '../../datos/reportesGG';
import type { Division } from '../../datos/divisiones';

// Proporción de los recuadros de la plantilla (ancho / alto; varían entre ~3,07 y ~3,43). La imagen se genera con
// esta proporción y la lámina la recorta un poco por los lados o por arriba y abajo para llenar cada recuadro: por
// eso lleva un margen blanco de un 3 % (lo que más se recorta), así nunca se corta la tabla.
const PROPORCION = 3.25;
const MARGEN = 0.03;
/** Letra de la tabla (px) y filas justas: en el recuadro de la lámina se lee mejor que con filas holgadas. */
const LETRA = 19;
/** Columnas de ancho fijo (px), en orden; "Observaciones" usa el resto (al menos 380 px). */
const COLUMNAS: [string, number][] = [
  ['Sitio', 200], ['Turno', 92], ['Hora', 72], ['Reporta', 186], ['Comb.', 78], ['Horómetro', 124],
  ['Partidas', 100], ['Refrig.', 90], ['Aceite', 94], ['Temp. °C', 104],
];
const ANCHO_FIJAS = COLUMNAS.reduce((s, [, w]) => s + w, 0);
/** Ancho mínimo de la imagen (px): lo justo para las columnas y el margen. Con menos filas, la letra se ve más grande. */
const ANCHO_MIN = Math.ceil((ANCHO_FIJAS + 380) / (1 - 2 * MARGEN));

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

const numero = (n: number | null) => (n === null ? '—' : n.toLocaleString('es-CL', { maximumFractionDigits: 1 }));

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

/** Tabla del día con el ancho indicado (el alto lo da su contenido). */
function tablaDelDia(reportes: ReporteGG[], division: Division, ancho: number): string {
  const filas = ordenarDelDia(reportes, division);
  const sitiosTotal = SITIOS_GG[division].length;
  const sitiosReportados = new Set(filas.map(r => r.sitio)).size;

  const celdas = filas.map((r, i) => {
    const medido = !sinMediciones(r);
    const valores = medido
      ? [r.combustible ?? '—', numero(r.horometro), numero(r.nroPartidas), r.nivelRefrigerante ?? '—', r.nivelAceite ?? '—', numero(r.temperatura)]
      : ['—', '—', '—', '—', '—', '—'];
    const observacion = medido
      ? escapar(r.observaciones ?? '')
      : `<b style="color:#a32626">NO REALIZADA.</b> ${escapar(r.observaciones ?? '')}`;
    const fondo = i % 2 ? '#F4F7FA' : '#FFFFFF';
    const td = (texto: string, extra = '') => `<td style="padding:4px 8px;border-bottom:1px solid #DCE1E6;vertical-align:middle;line-height:1.2;${extra}">${texto}</td>`;
    return `<tr style="background:${fondo}">`
      + td(escapar(r.sitio), 'font-weight:700;color:#0E4660;white-space:nowrap')
      + td(escapar(r.turno.replace('TURNO ', 'Turno ')), 'white-space:nowrap')
      + td(r.hora ? escapar(r.hora.slice(0, 5)) : '—', 'white-space:nowrap')
      + td(escapar(r.reporta))
      + valores.map(v => td(escapar(v))).join('')
      + td(observacion)
      + '</tr>';
  }).join('');

  const th = (t: string) => `<th style="text-align:left;padding:6px 8px;background:#0E4660;color:#fff;font-size:${LETRA - 1}px;white-space:nowrap">${t}</th>`;
  // La cantidad de sitios reportados va a la derecha del último encabezado (sin una línea de título aparte).
  const cabecera = COLUMNAS.map(([t]) => th(t)).join('')
    + `<th style="text-align:left;padding:6px 8px;background:#0E4660;color:#fff;font-size:${LETRA - 1}px;white-space:nowrap">Observaciones<span style="float:right;font-weight:400;font-size:${LETRA - 3}px">${sitiosReportados} de ${sitiosTotal} sitios reportados</span></th>`;

  return `
    <div style="width:${ancho}px;box-sizing:border-box;background:#fff;padding:${Math.ceil((ancho / PROPORCION) * MARGEN)}px ${Math.ceil(ancho * MARGEN)}px;font-family:Arial,Helvetica,sans-serif;color:#222">
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:${LETRA}px">
        <colgroup>${COLUMNAS.map(([, w]) => `<col style="width:${w}px">`).join('')}<col></colgroup>
        <thead><tr>${cabecera}</tr></thead>
        <tbody>${celdas}</tbody>
      </table>
    </div>`;
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
    const contenedor = document.createElement('div');
    contenedor.setAttribute('aria-hidden', 'true');
    Object.assign(contenedor.style, { position: 'fixed', left: '-10000px', top: '0', zIndex: '-1' });
    document.body.appendChild(contenedor);
    try {
      // El ancho más angosto en que la tabla cabe en la proporción del recuadro (así la letra se ve lo más grande
      // posible): con más ancho las observaciones ocupan menos líneas y la tabla queda más baja.
      const altoTabla = (ancho: number) => {
        contenedor.style.width = `${ancho}px`;
        contenedor.innerHTML = tablaDelDia(delDia, division, ancho);
        return Math.ceil((contenedor.firstElementChild as HTMLElement).getBoundingClientRect().height);
      };
      const cabe = (ancho: number) => altoTabla(ancho) * PROPORCION <= ancho;
      let ancho = ANCHO_MIN;
      if (!cabe(ancho)) {
        let angosto = ancho;
        let ancho2 = ancho * 2;
        while (!cabe(ancho2) && ancho2 < 8000) { angosto = ancho2; ancho2 *= 2; }
        while (ancho2 - angosto > 8) {
          const medio = Math.round((angosto + ancho2) / 2);
          if (cabe(medio)) ancho2 = medio; else angosto = medio;
        }
        ancho = ancho2;
      }
      altoTabla(ancho);
      const tabla = contenedor.firstElementChild as HTMLElement;
      const objetivo = Math.round(ancho / PROPORCION);
      // Con pocos sitios sobra alto: las filas se separan un poco (hasta 16 px más cada una) para llenar el recuadro
      // en vez de dejar una franja blanca abajo.
      const filas = tabla.querySelectorAll('tbody tr').length;
      const sobra = objetivo - Math.ceil(tabla.getBoundingClientRect().height) - 2;
      if (sobra > 0 && filas > 0) {
        const extra = Math.min(16, sobra / filas) / 2;
        tabla.querySelectorAll<HTMLElement>('tbody td').forEach(td => {
          td.style.paddingTop = td.style.paddingBottom = `${4 + extra}px`;
        });
      }
      // (Por si la tabla aún no cabe: nunca se corta, aunque la proporción quede un poco distinta.)
      const alto = Math.max(objetivo, Math.ceil(tabla.getBoundingClientRect().height));
      tabla.style.height = `${alto}px`;
      salida[fecha] = await toJpeg(tabla, { quality: 0.92, pixelRatio: 2, backgroundColor: '#ffffff', width: ancho, height: alto });
    } finally {
      contenedor.remove();
    }
  }
  return salida;
}
