// Word del Informe de Falla — Carro. Lo usan el formulario (botón "Generar") y "Descargar" en Borradores:
// los dos arman exactamente el mismo documento a partir de los mismos datos.
import type * as docx from 'docx';
import { formatFechaLarga, hoyLocalISO } from '../../datos/fechas';
import { BLUE, ORANGE } from '../../datos/plantillaWord';
import { configDivision, type Division } from '../../datos/divisiones';
import { cargarDocx, logosInforme, resolverImagenes, bytesDeImagen } from '../../lib/docxRecursos';
import {
  type FotoSlot, type RegistroGrupo, FALLAS_COMUNES, HORAS_INICIALES, LINEA_SERVICIO_FIJA, N_CONTRATO_FIJO, VERSION_FIJA,
  carroDisplay, construirGruposEstandar, formatHora12,
} from './modelo';

/** Todo lo que lleva el Word. */
export interface DatosFalla {
  fecha: string; carroCodigo: string; ubicacion: string; creadoNombre: string; creadoCargo: string;
  descripcionTexto: string; notificacionIntro: string; notificacionPuntos: string[]; notificacionCheckItem: string;
  solucionIntro: string; hallazgos: string[]; accionesSolucion: string[];
  verificacionTexto: string; verificacionCheckItem: string; grupos: RegistroGrupo[];
  /** Revisado y autorizado por: fijos de la división. */
  revisadoText: string; autorizadoNombre: string; autorizadoCargo: string;
}

/** Revisado y autorizado por (fijos de la división). */
export function firmasFalla(division: Division): Pick<DatosFalla, 'revisadoText' | 'autorizadoNombre' | 'autorizadoCargo'> {
  const config = configDivision(division).falla;
  return { revisadoText: config.revisadoText, autorizadoNombre: config.autorizado.nombre, autorizadoCargo: config.autorizado.cargo };
}

/**
 * Datos de un borrador guardado, tal como quedan en el formulario al abrirlo: lo que falte se completa con
 * lo mismo con que empieza un informe nuevo, y "Tiempo de respuesta; …" se ajusta a la hora guardada.
 */
export function datosFallaDeBorrador(guardados: unknown, division: Division): DatosFalla {
  const config = configDivision(division).falla;
  const { carros, ubicacionPorCarro } = configDivision(division);
  const carroInicial = carros[0];
  const d = (guardados && typeof guardados === 'object' ? guardados : {}) as Record<string, unknown>;
  const texto = (v: unknown, defecto: string) => (typeof v === 'string' ? v : defecto);
  const lista = <T>(v: unknown, defecto: T[]): T[] => (Array.isArray(v) ? (v as T[]) : defecto);
  // Textos con que empieza un informe nuevo (carro, fecha y horas iniciales).
  const iniciales = FALLAS_COMUNES[0].build({
    codigo: carroInicial, carro: carroDisplay(carroInicial), fecha: hoyLocalISO(),
    horaAlarma: HORAS_INICIALES.alarma, horaRespuesta: HORAS_INICIALES.respuesta, horaOperativo: HORAS_INICIALES.operativo,
  });
  const horaRespuesta = texto(d.horaRespuesta, HORAS_INICIALES.respuesta);
  let notificacionPuntos = lista<string>(d.notificacionPuntos, iniciales.notificacionPuntos);
  // Igual que el formulario al abrir el borrador: el "Tiempo de respuesta; …" pasa a la hora guardada.
  const anterior = formatHora12(HORAS_INICIALES.respuesta);
  const actual = formatHora12(horaRespuesta);
  if (anterior !== actual && anterior.trim()) {
    notificacionPuntos = notificacionPuntos.map(t => t.split(`respuesta; ${anterior}`).join(`respuesta; ${actual}`));
  }
  return {
    fecha: texto(d.fecha, hoyLocalISO()),
    carroCodigo: texto(d.carroCodigo, carroInicial),
    ubicacion: texto(d.ubicacion, ubicacionPorCarro[carroInicial] ?? ""),
    creadoNombre: texto(d.creadoNombre, config.creado.nombre),
    creadoCargo: texto(d.creadoCargo, config.creado.cargo),
    descripcionTexto: texto(d.descripcionTexto, iniciales.descripcionTexto),
    notificacionIntro: texto(d.notificacionIntro, iniciales.notificacionIntro),
    notificacionPuntos,
    notificacionCheckItem: texto(d.notificacionCheckItem, iniciales.notificacionCheckItem),
    solucionIntro: texto(d.solucionIntro, iniciales.solucionIntro),
    hallazgos: lista<string>(d.hallazgos, iniciales.hallazgos),
    accionesSolucion: lista<string>(d.accionesSolucion, iniciales.accionesSolucion),
    verificacionTexto: texto(d.verificacionTexto, iniciales.verificacionTexto),
    verificacionCheckItem: texto(d.verificacionCheckItem, iniciales.verificacionCheckItem),
    grupos: lista<RegistroGrupo>(d.grupos, construirGruposEstandar(iniciales, carroDisplay(carroInicial))),
    ...firmasFalla(division),
  };
}

/** Lo que falta para poder armar el Word (null si está todo). */
export const faltaParaWordFalla = (d: Pick<DatosFalla, 'fecha' | 'carroCodigo'>): string | null =>
  !d.fecha ? "Selecciona la fecha del informe." : !d.carroCodigo.trim() ? "Selecciona el carro / sitio." : null;

export function nombreArchivoFalla(d: Pick<DatosFalla, 'fecha' | 'carroCodigo'>): string {
  const [year, month, day] = d.fecha.split("-");
  return `Informe_de_falla_${d.carroCodigo}_${day}-${month}-${year}.docx`;
}

/** Arma el Word (el mismo documento que siempre ha generado el formulario). */
export async function generarWordFalla(d: DatosFalla): Promise<Blob> {
  const {
    fecha, carroCodigo, ubicacion, creadoNombre, creadoCargo,
    descripcionTexto, notificacionIntro, notificacionPuntos, notificacionCheckItem,
    solucionIntro, hallazgos, accionesSolucion, verificacionTexto, verificacionCheckItem, grupos,
    revisadoText: REVISADO_TEXT_FIJO, autorizadoNombre: AUTORIZADO_NOMBRE_FIJO, autorizadoCargo: AUTORIZADO_CARGO_FIJO,
  } = d;
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, ImageRun, WidthType, BorderStyle, AlignmentType,
    HeadingLevel, VerticalAlign, TableLayoutType,
  } = await cargarDocx(); // se descarga una sola vez (y se precarga al abrir el formulario)

  const cellBorders = (color?: string) => {
    const b = { style: BorderStyle.SINGLE, size: 4, color: color || "D9D9D9" };
    return { top: b, bottom: b, left: b, right: b };
  };
  const noBorders = () => {
    const n = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
    return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
  };

  // Logos (en caché) y TODAS las fotos se resuelven en paralelo antes de armar el documento;
  // el documento se arma igual que antes, solo que ya no espera cada descarga por separado.
  const [{ logoBytes, logoType, coverBytes, coverType }, imagenes] = await Promise.all([
    logosInforme(),
    resolverImagenes(grupos.flatMap(g => g.fotos.map(f => f.photo))),
  ]);
  const revisadoPor = REVISADO_TEXT_FIJO.split("\n").map(s => s.trim()).filter(Boolean);
  const carroNombre = carroDisplay(carroCodigo);

  const headerCellMargins = { top: 160, bottom: 160, left: 220, right: 220 };

  // --- Encabezado repetido en cada página del cuerpo del informe ---
  const header = new Header({
    children: [
      new Table({
        width: { size: 9360, type: WidthType.DXA },
        layout: TableLayoutType.FIXED,
        columnWidths: [2059, 4493, 2808],
        borders: cellBorders("000000"),
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 2059, type: WidthType.DXA },
                borders: cellBorders("000000"),
                margins: headerCellMargins,
                verticalAlign: VerticalAlign.CENTER,
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 40 }, type: logoType })],
                })],
              }),
              new TableCell({
                width: { size: 4493, type: WidthType.DXA },
                borders: cellBorders("000000"),
                margins: headerCellMargins,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Reporte Falla", size: 18, font: "Arial", bold: true })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: LINEA_SERVICIO_FIJA, size: 14, font: "Arial" })] }),
                ],
              }),
              new TableCell({
                width: { size: 2808, type: WidthType.DXA },
                borders: cellBorders("000000"),
                margins: headerCellMargins,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: `N° Contrato: ${N_CONTRATO_FIJO}`, size: 15, font: "Arial" })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: `Versión: ${VERSION_FIJA}`, size: 15, font: "Arial" })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Fecha: ${formatFechaLarga(fecha)}`, size: 15, font: "Arial" })] }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // --- Portada ---
  const coverLeftChildren: docx.Paragraph[] = [
    new Paragraph({ children: [new ImageRun({ data: logoBytes, transformation: { width: 200, height: 66 }, type: logoType })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new ImageRun({ data: coverBytes, transformation: { width: 340, height: 255 }, type: coverType })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: "REPORTE DE FALLA", size: 30, font: "Arial", color: "000000" })] }),
    new Paragraph({ children: [new TextRun({ text: carroNombre, bold: true, size: 30, font: "Arial", color: "000000" })] }),
    ...(ubicacion.trim() ? [new Paragraph({ children: [new TextRun({ text: ubicacion, size: 24, font: "Arial", color: "000000" })] })] : []),
    new Paragraph({ children: [new TextRun({ text: formatFechaLarga(fecha), size: 24, font: "Arial", color: "000000" })] }),
  ];

  const cajaFirmas: docx.Paragraph[] = [
    new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Creado por:", size: 20, font: "Arial", bold: true })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: creadoNombre, size: 20, font: "Arial" })] }),
    new Paragraph({ children: [new TextRun({ text: `Cargo: ${creadoCargo}`, size: 20, font: "Arial" })] }),
    new Paragraph({ text: "_______________" }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: "Revisado por:", size: 20, font: "Arial", bold: true })] }),
    new Paragraph({ text: "" }),
    ...revisadoPor.map(line => new Paragraph({ children: [new TextRun({ text: line, size: 20, font: "Arial" })] })),
    new Paragraph({ text: "_______________" }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: "Autorizado por:", size: 20, font: "Arial", bold: true })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: AUTORIZADO_NOMBRE_FIJO, size: 20, font: "Arial" })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ children: [new TextRun({ text: `Cargo: ${AUTORIZADO_CARGO_FIJO}`, size: 20, font: "Arial" })] }),
  ];

  const coverTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [6360, 3000],
    borders: noBorders(),
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: 6360, type: WidthType.DXA }, borders: noBorders(), children: coverLeftChildren }),
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
          margins: { left: 260, top: 100, bottom: 100, right: 100 },
          children: [
            new Table({
              width: { size: 2640, type: WidthType.DXA },
              layout: TableLayoutType.FIXED,
              columnWidths: [2640],
              borders: cellBorders("000000"),
              rows: [new TableRow({ children: [new TableCell({ borders: cellBorders("000000"), margins: { top: 100, bottom: 100, left: 120, right: 120 }, children: cajaFirmas })] })],
            }),
          ],
        }),
      ],
    })],
  });

  // --- Registro fotográfico: bloques con nota opcional + fotos (de a 2) + leyenda opcional ---
  const buildFotoImgCell = async (slot: FotoSlot, widthDxa: number, columnSpan: 1 | 2) => {
    const children: docx.Paragraph[] = [];
    if (slot.photo) {
      const { bytes, type } = imagenes.get(slot.photo) ?? await bytesDeImagen(slot.photo);
      const w = columnSpan === 2 ? 420 : 240;
      const h = columnSpan === 2 ? 260 : 220;
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: w, height: h }, type })] }));
    } else {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin foto cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] }));
    }
    if (slot.caption?.trim()) {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [new TextRun({ text: slot.caption, bold: true, size: 18, font: "Arial" })] }));
    }
    return new TableCell({ width: { size: widthDxa, type: WidthType.DXA }, columnSpan, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children });
  };

  const buildGrupoTable = async (grupo: RegistroGrupo) => {
    const rows: docx.TableRow[] = [];
    const colWidth = 9360;

    if (grupo.nota.trim()) {
      const notaLineas = grupo.nota.split("\n").map(s => s.trim()).filter(Boolean);
      rows.push(new TableRow({
        children: [new TableCell({
          columnSpan: 2, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: notaLineas.map(linea => new Paragraph({ children: [new TextRun({ text: linea, bold: true, font: "Arial", size: 20 })] })),
        })],
      }));
    }

    for (let i = 0; i < grupo.fotos.length; i += 2) {
      const chunk = grupo.fotos.slice(i, i + 2);
      if (chunk.length === 2) {
        const cells = await Promise.all(chunk.map(f => buildFotoImgCell(f, colWidth / 2, 1)));
        rows.push(new TableRow({ children: cells }));
      } else {
        const cell = await buildFotoImgCell(chunk[0], colWidth, 2);
        rows.push(new TableRow({ children: [cell] }));
      }
    }

    if (grupo.caption.trim()) {
      const captionLineas = grupo.caption.split("\n").map(s => s.trim()).filter(Boolean);
      rows.push(new TableRow({
        children: [new TableCell({
          columnSpan: 2, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 120, right: 120 },
          children: captionLineas.map(linea => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: linea, font: "Arial", size: 19 })] })),
        })],
      }));
    }

    if (rows.length === 0) return null;
    return new Table({ width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [4680, 4680], borders: cellBorders(), rows });
  };

  const fotoBlocks: (docx.Paragraph | docx.Table)[] = [
    new Paragraph({ text: "", pageBreakBefore: true }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "C. Registro Fotográfico", color: BLUE, size: 26, font: "Arial", bold: true })] }),
    new Paragraph({ text: "" }),
  ];
  for (const grupo of grupos) {
    const tabla = await buildGrupoTable(grupo);
    if (tabla) {
      fotoBlocks.push(tabla);
      fotoBlocks.push(new Paragraph({ text: "" }));
    }
  }

  // --- Cuerpo del informe ---
  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
    sections: [
      { properties: { page: { size: { width: 12240, height: 15840 } } }, children: [coverTable] },
      {
        properties: { page: { size: { width: 12240, height: 15840 } } },
        headers: { default: header },
        children: [
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "A. Descripción de falla", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          ...descripcionTexto.split("\n").map(linea => new Paragraph({ children: [new TextRun({ text: linea, font: "Arial" })] })),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: notificacionIntro, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          ...notificacionPuntos.filter(p => p.trim()).map((p, idx) => new Paragraph({ indent: { left: 400 }, children: [new TextRun({ text: `${idx + 1}) ${p}`, font: "Arial" })] })),
          ...(notificacionCheckItem.trim() ? [new Paragraph({ indent: { left: 800 }, children: [new TextRun({ text: `✓ ${notificacionCheckItem}`, font: "Arial", underline: {} })] })] : []),
          new Paragraph({ text: "" }),

          new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200 }, children: [new TextRun({ text: "B. Solución Implementada", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: solucionIntro, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          ...hallazgos.filter(h => h.trim()).map(h => new Paragraph({ text: h, bullet: { level: 0 } })),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Solución", font: "Arial", bold: true })] }),
          new Paragraph({ text: "" }),
          ...accionesSolucion.filter(a => a.trim()).map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
          new Paragraph({ text: "" }),

          new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 200 }, children: [new TextRun({ text: "Verificación Final", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: verificacionTexto, font: "Arial" })] }),
          ...(verificacionCheckItem.trim() ? [
            new Paragraph({ text: "" }),
            new Paragraph({ indent: { left: 400 }, children: [new TextRun({ text: `✓ ${verificacionCheckItem}`, font: "Arial", underline: {} })] }),
          ] : []),

          ...fotoBlocks,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
