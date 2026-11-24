// Imagen de la Tabla de mantenimiento GG (pestaña "Mantenimiento") a una fecha: es el "Registro de mantenimiento de
// GG." del Informe Diario (cuando no se carga una foto) y va al final del Informe de Cierre. Mismos datos y cálculos
// que la pantalla: último mantenimiento, horas actuales (último reporte de GG o lo escrito), próximo por horas y por
// fecha, refrigerante y estado. Va en una hoja horizontal para que la tabla se lea bien impresa.
import type { ISectionOptions } from 'docx';
import type { Division } from '../datos/divisiones';
import { SITIOS_GG } from '../datos/reportesGG';
import { analizarGeneradores } from '../datos/analisisGG';
import { listarMantenimientoGG } from '../datos/mantenimientoGG';
import {
  HORAS_ENTRE_MANTENIMIENTOS, contarEstados, horasActuales, indicadoresMantenimiento, ultimoConHorometro,
  type IndicadoresMantenimiento, type LecturaHoras, type Vencimiento,
} from '../datos/indicadoresMantenimientoGG';
import { ETIQUETA_ESTADO, fmtDia, fmtFecha, fmtHoras, fmtHorasConSigno, motivoEstado, nombreRefrigerante, textoDias } from '../pantallas/mantenimientoGG/formato';
import { conEsperaMaxima, pngDeHtml, reportesGGHasta, tieneReportabilidadGG, type ImagenEstadoGG } from './estadoGeneradores';

/** Ancho de la tabla (px): pensado para el ancho de una hoja horizontal (~890 px), con letra que se lea impresa. */
const ANCHO = 1180;

const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
/** Fecha local (AAAA-MM-DD) de un instante ISO. */
const fechaLocal = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const ESTADO: Record<Vencimiento, { fondo: string; texto: string; borde: string }> = {
  vencido: { fondo: '#FBE9E9', texto: '#A32626', borde: '#B3261E' },
  proximo: { fondo: '#FFF3CD', texto: '#7A5B00', borde: '#D39B00' },
  al_dia: { fondo: '#E6F4EA', texto: '#1E6B34', borde: '#1E8E3E' },
  sin_datos: { fondo: '#EEF1F2', texto: '#55636B', borde: '#9AA7AE' },
};
const COLOR_VALOR: Partial<Record<Vencimiento, string>> = { vencido: '#B3261E', proximo: '#8A6100' };
const valor = (texto: string, e: Vencimiento, fuerte = false) => {
  const color = COLOR_VALOR[e];
  return color || fuerte ? `<span style="${color ? `color:${color};` : ''}font-weight:${color || fuerte ? 800 : 400}">${escapar(texto)}</span>` : escapar(texto);
};
const chica = (texto: string, color = '#55636B') => (texto ? `<div style="font-size:12.5px;line-height:1.25;color:${color};margin-top:2px;white-space:nowrap">${escapar(texto)}</div>` : '');

/** De dónde salen las horas actuales: "Rep. 24 nov 09:12" (la hora solo si es del mismo día de la imagen) o "Escrita 20 nov". */
const textoLectura = (l: LecturaHoras | null, fecha: string) => {
  if (!l) return 'Sin lectura';
  const cuando = l.fecha ? `${fmtDia(l.fecha)}${l.fecha === fecha && l.hora ? ` ${l.hora}` : ''}` : '';
  return `${l.fuente === 'reporte' ? 'Rep.' : 'Escrita'}${cuando ? ` ${cuando}` : ''}`;
};

interface FilaImagen {
  nombre: string;
  sitio: string;
  ultimoHoras: number | null;
  ultimoFecha: string | null;
  statusPct: number;
  cicloDias: number;
  refrigerante: string | null;
  actuales: LecturaHoras | null;
  m: IndicadoresMantenimiento;
}

function fila(f: FilaImagen, fecha: string, par: boolean): string {
  const { m } = f;
  const estado = ESTADO[m.estado];
  const td = (contenido: string, estilo = '') =>
    `<td style="padding:7px 6px;border-bottom:1px solid #DCE1E6;vertical-align:middle;${estilo}">${contenido}</td>`;
  const num = 'text-align:right;white-space:nowrap';
  const pct = m.desdeUltimo === null ? 0 : Math.max(0, Math.min(100, (m.desdeUltimo / HORAS_ENTRE_MANTENIMIENTOS) * 100));
  const barra = m.desdeUltimo === null ? ''
    : `<div style="height:4px;margin-top:4px;border-radius:99px;background:#E3E8EC;overflow:hidden"><div style="height:100%;width:${pct}%;border-radius:99px;background:${ESTADO[m.estadoHoras].borde}"></div></div>`;
  const anualVencida = m.diasParaAnual !== null && m.diasParaAnual < 0;
  return `<tr style="background:${par ? '#F4F7FA' : '#FFFFFF'}">`
    + td(`<div style="font-weight:700;color:#0E4660;white-space:nowrap">${escapar(f.nombre || f.sitio)}</div>${chica(f.sitio)}`, `border-left:4px solid ${estado.borde}`)
    + td(fmtHoras(f.ultimoHoras), num)
    + td(fmtFecha(f.ultimoFecha), 'white-space:nowrap')
    + td(`${f.statusPct} %`, num)
    + td(`<div>${fmtHoras(f.actuales?.valor ?? null)}</div>${chica(textoLectura(f.actuales, fecha))}`, num)
    + td(`<div>${valor(fmtHoras(m.desdeUltimo), m.estadoHoras)}</div>${barra}`, num)
    + td(fmtHoras(m.proximoHoras), num)
    + td(valor(fmtHorasConSigno(m.faltanHoras), m.estadoHoras, true), num)
    + td(`${f.cicloDias} d`, num)
    + td(`<div>${valor(fmtFecha(m.fechaEstimada), m.estadoFecha)}</div>${chica(textoDias(m.diasParaFecha))}`, 'white-space:nowrap')
    + td(anualVencida ? valor(fmtFecha(m.fechaAnual), 'vencido') : fmtFecha(m.fechaAnual), 'white-space:nowrap')
    + td(escapar(nombreRefrigerante(f.refrigerante)))
    + td(`<span style="display:inline-block;padding:2px 9px;border-radius:999px;background:${estado.fondo};color:${estado.texto};font-weight:700;font-size:13.5px;white-space:nowrap">${ETIQUETA_ESTADO[m.estado]}</span>${chica(motivoEstado(m))}`)
    + '</tr>';
}

function htmlTabla(filas: FilaImagen[], fecha: string, sinConexion: boolean): string {
  const cuenta = contarEstados(filas.map(f => f.m.estado));
  const resumen = ([
    ['vencido', cuenta.vencido === 1 ? 'vencido' : 'vencidos'],
    ['proximo', cuenta.proximo === 1 ? 'próximo' : 'próximos'],
    ['al_dia', 'al día'],
    ['sin_datos', 'sin datos'],
  ] as [Vencimiento, string][])
    .filter(([e]) => cuenta[e] > 0)
    .map(([e, t]) => `<span style="padding:4px 11px;border-radius:999px;background:${ESTADO[e].fondo};color:${ESTADO[e].texto};font-weight:700;font-size:15px;white-space:nowrap">${cuenta[e]} ${t}</span>`)
    .join('');
  const th = (t: string, estilo = '') => `<th style="padding:7px 6px;background:#0E4660;color:#FFFFFF;font-size:13.5px;font-weight:700;line-height:1.2;vertical-align:bottom;${estilo}">${t}</th>`;
  const grupo = (t: string, n: number) => `<th colspan="${n}" style="padding:6px;background:#E8EEF2;color:#0E4660;font-size:12.5px;font-weight:700;letter-spacing:.06em;text-align:center;border-left:2px solid #FFFFFF">${t}</th>`;
  const der = 'text-align:right';
  const izq = 'text-align:left';
  const origen = sinConexion ? ' · sin señal: con lo guardado en este equipo' : '';
  return `
    <div style="width:${ANCHO}px;box-sizing:border-box;background:#FFFFFF;padding:4px 2px 6px;font-family:Arial,Helvetica,sans-serif;color:#222222">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:3px solid #0E4660;padding-bottom:9px;margin-bottom:8px">
        <div>
          <div style="font-size:21px;font-weight:700;color:#0E4660">Tabla de mantenimiento GG al ${dmy(fecha)}</div>
          <div style="font-size:14px;color:#55636B;margin-top:3px">Mantenimiento cada ${HORAS_ENTRE_MANTENIMIENTOS} h o según los días de cada equipo, lo que ocurra primero${origen}</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px">${resumen}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:15px">
        <colgroup>
          <col style="width:178px"><col style="width:66px"><col style="width:98px"><col style="width:58px">
          <col style="width:124px"><col style="width:84px"><col style="width:70px"><col style="width:64px">
          <col style="width:58px"><col style="width:104px"><col style="width:96px"><col style="width:64px"><col>
        </colgroup>
        <thead>
          <tr><th style="background:#FFFFFF"></th>${grupo('ÚLTIMO MANTENIMIENTO', 3)}${grupo(`HORAS · CADA ${HORAS_ENTRE_MANTENIMIENTOS} H`, 4)}${grupo('FECHAS', 3)}<th colspan="2" style="background:#FFFFFF"></th></tr>
          <tr>${th('Equipo', izq)}${th('Horas', der)}${th('Fecha', izq)}${th('Status', der)}${th('Actuales', der)}${th('Desde el último', der)}${th('Próximo', der)}${th('Faltan', der)}${th('Cada', der)}${th('Próximo', izq)}${th('Anual', izq)}${th('Refrig.', izq)}${th('Estado', izq)}</tr>
        </thead>
        <tbody>${filas.map((f, i) => fila(f, fecha, i % 2 === 1)).join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Imagen de la Tabla de mantenimiento GG a la fecha indicada (si es de días anteriores, las horas actuales son las
 * leídas hasta ese día). Null si la división no hace reportabilidad de GG o no se pudo leer la tabla.
 */
export async function imagenTablaMantenimiento(division: Division, fecha: string): Promise<ImagenEstadoGG | null> {
  if (!tieneReportabilidadGG(division)) return null;
  let tabla: Awaited<ReturnType<typeof listarMantenimientoGG>>;
  try {
    tabla = await conEsperaMaxima(listarMantenimientoGG(division));
  } catch {
    return null;
  }
  if (!tabla.filas.length) return null;
  const { reportes, sinConexion } = await reportesGGHasta(division, fecha);
  const { porSitio } = analizarGeneradores(SITIOS_GG[division] ?? [], reportes, fecha);
  const gg = new Map(porSitio.map(s => [s.sitio, s]));
  const filas: FilaImagen[] = tabla.filas.map(f => {
    const s = gg.get(f.sitio) ?? null;
    // Lo escrito en la tabla después de ese día no cuenta (como un reporte posterior).
    const escritaDespues = !!f.horasRegistradasEn && (fechaLocal(f.horasRegistradasEn) ?? '') > fecha;
    const datos = escritaDespues ? { ...f, horasRegistradas: null, horasRegistradasEn: null } : f;
    const actuales = horasActuales(datos, s ? ultimoConHorometro(s.serie) : null);
    const ritmo = s?.ritmoHorasDia ?? null;
    return {
      nombre: f.nombre, sitio: f.sitio, ultimoHoras: f.ultimoHoras, ultimoFecha: f.ultimoFecha, statusPct: f.statusPct,
      cicloDias: f.cicloDias, refrigerante: f.refrigerante, actuales, m: indicadoresMantenimiento(datos, actuales, fecha, ritmo),
    };
  });
  const sinSenal = sinConexion || tabla.copiaDel !== null;
  return { ...(await pngDeHtml(htmlTabla(filas, fecha, sinSenal), ANCHO)), fecha, sinConexion: sinSenal };
}

/**
 * Hoja horizontal con la imagen de la tabla, con el formato de un bloque de evidencia (recuadro con la imagen y el
 * pie en negrita debajo), sin el encabezado de las demás hojas (igual que la hoja del Cuadro Vertiv).
 */
export async function seccionTablaMantenimiento(imagen: ImagenEstadoGG, pie: string): Promise<ISectionOptions> {
  const { AlignmentType, BorderStyle, Header, ImageRun, PageOrientation, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, WidthType } = await import('docx');
  const MARGEN = 1134; // 2 cm
  const ANCHO_TABLA = 15840 - 2 * MARGEN;
  const borde = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
  const bordes = { top: borde, bottom: borde, left: borde, right: borde };
  // Espacio para la imagen (px; 1 px = 15 twips): el ancho de la celda y el alto de la hoja menos el pie.
  const anchoMax = (ANCHO_TABLA - 200) / 15;
  const altoMax = (12240 - 2 * MARGEN) / 15 - 50;
  const escala = Math.min(anchoMax / imagen.ancho, altoMax / imagen.alto);
  return {
    properties: {
      page: {
        size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
        margin: { top: MARGEN, right: MARGEN, bottom: MARGEN, left: MARGEN },
      },
    },
    headers: { default: new Header({ children: [new Paragraph({ text: '' })] }) },
    children: [
      new Table({
        width: { size: ANCHO_TABLA, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [ANCHO_TABLA],
        rows: [
          new TableRow({
            children: [new TableCell({
              width: { size: ANCHO_TABLA, type: WidthType.DXA },
              borders: bordes,
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new ImageRun({ data: imagen.bytes, transformation: { width: Math.round(imagen.ancho * escala), height: Math.round(imagen.alto * escala) }, type: 'png' })],
              })],
            })],
          }),
          new TableRow({
            children: [new TableCell({
              borders: bordes,
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: pie, bold: true, size: 20, font: 'Arial' })] })],
            })],
          }),
        ],
      }),
    ],
  };
}
