// Word del Informe de Mantenimiento de Generador. Lo usan el formulario (botón "Generar") y "Descargar"
// en Borradores: los dos arman exactamente el mismo documento a partir de los mismos datos.
import type * as docx from 'docx';
import { uid } from '../../lib/fotos';
import { formatFechaLarga, hoyLocalISO } from '../../datos/fechas';
import { BLUE, ORANGE } from '../../datos/plantillaWord';
import { configDivision, type Division } from '../../datos/divisiones';
import { cargarDocx, logosInforme, resolverImagenes, bytesDeImagen } from '../../lib/docxRecursos';

export interface FotoItem {
  id: string;
  /** Encabezado de grupo (H2) — se muestra solo la primera vez que aparece, igual que en la plantilla. */
  section: string;
  caption: string;
  description: string;
  photo: string | null;
}

export interface ParteItem { id: string; parte: string; cantidad: string; detalle: string; }
export interface PlanItem { id: string; detalle: string; cantidad: string; parte: string; }
export interface ChecklistItem { id: string; label: string; estado: string; observaciones: string; }
export interface FiltroItem { id: string; nombre: string; estado: string; tipo: string; observaciones: string; }

// ---------------------------------------------------------------------------------------
// Datos por defecto — tomados de la estructura del informe de referencia (LTE_CMF_11),
// editables en el formulario antes de generar el documento.
// ---------------------------------------------------------------------------------------

export const DEFAULT_TRABAJOS: string[] = [
  "Chequeo de parámetros en GG.",
  "Chequeo de batería en modo stand by, arranque y con carga.",
  "Chequeo de breaker, circuitos eléctricos.",
  "Chequeo de niveles de aceite, refrigerante y combustible.",
  "Se realiza mantenimiento en el generador.",
  "Chequeo de mangueras, fugas, calefactor, conexionado.",
  "Se realiza limpieza de generador y controlador.",
];

export const DEFAULT_COMPONENTES: string[] = [
  "Filtro de aire (AF25904)",
  "Filtro de combustible (FS01275)",
  "Filtro de aceite (LF16087)",
];

export const DEFAULT_FOTOS: Omit<FotoItem, 'id' | 'photo'>[] = [
  { section: "", caption: "Vista del sitio antes del mantenimiento", description: "" },
  { section: "", caption: "Vista del generador antes del mantenimiento", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro ART", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro ART", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro Verificación de Entorno", description: "" },
  { section: "Registro fotográfico SSO", caption: "Registro Bloqueo de Energías", description: "" },
  { section: "", caption: "Revisión e inspección de generador", description: "" },
  { section: "Bloqueo de energías y seguridad LOTO", caption: "Bloqueo de energía electromecánico", description: "Se activan paradas de emergencia y se bloquean energías según procedimiento LOTO." },
  { section: "Bloqueo de energías y seguridad LOTO", caption: "Bloqueo de energía supervisor", description: "Se entrega la llave al supervisor y se deja en la caja respectiva." },
  { section: "Sistema de refrigeración del generador", caption: "Vista general del sistema de refrigeración (antes)", description: "Vista general del sistema de refrigeración del motor antes de su mantención." },
  { section: "Sistema de refrigeración del generador", caption: "Vista general del sistema de refrigeración (después)", description: "Vista general del sistema de refrigeración del motor después de su mantención." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Vista general de sistema de admisión de aire", description: "Se revisa estado general de unidad, sellos y estado de estructura." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Filtro de aire (antes)", description: "Vista general antes del cambio de filtro; presenta polución." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Filtro de aire existente", description: "Se aprecia exceso de polución al interior del filtro, por lo que se procede con el cambio de unidad." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Nuevo filtro de aire", description: "Se presenta filtro nuevo, se procede a instalar." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Reemplazo de filtro de aire", description: "Se realiza limpieza en cámara de admisión." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Instalación del filtro nuevo", description: "Una vez limpiada la zona se realiza la instalación del filtro nuevo." },
  { section: "Sistema de admisión de aire y filtro de aire", caption: "Vista general del conducto de admisión de aire", description: "Una vez instalado el filtro nuevo, se deja en detalle la fecha de instalación." },
  { section: "Filtro y nivel de aceite", caption: "Filtro de aceite (antes)", description: "Vista de filtro antes de su cambio." },
  { section: "Filtro y nivel de aceite", caption: "Reemplazo de filtro de aceite", description: "Se retira filtro de aceite y se drena la zona." },
  { section: "Filtro y nivel de aceite", caption: "Vista sin filtro de aceite (antes)", description: "Una vez retirado el filtro de aceite, se limpia la zona dejándola en condiciones para instalar el filtro nuevo." },
  { section: "Filtro y nivel de aceite", caption: "Vista filtro de aceite (después)", description: "Se realiza instalación de filtro nuevo." },
  { section: "Filtro y nivel de aceite", caption: "Nivel de aceite (antes)", description: "Vista de varilla de aceite antes del cambio; aceite se encontraba sin consistencia." },
  { section: "Filtro y nivel de aceite", caption: "Nivel de aceite (después)", description: "Nivel de aceite después del llenado, dejando un nivel óptimo de trabajo." },
  { section: "Filtro de combustible", caption: "Filtro de combustible (anterior)", description: "Se presenta filtro anterior." },
  { section: "Filtro de combustible", caption: "Nuevo filtro de combustible", description: "Se presenta el nuevo filtro de combustible." },
  { section: "Filtro de combustible", caption: "Filtros instalados (después)", description: "Una vez instalados ambos filtros, se deja constancia de la fecha de instalación." },
  { section: "Filtro de combustible", caption: "Aceite (después)", description: "Después del trasvasije e instalación de filtros, se procede al llenado del sistema." },
  { section: "Power command", caption: "Power command — fase + fase", description: "Se verifican voltajes entre fase y fase, correctos para su operación." },
  { section: "Power command", caption: "Power command — fase + neutro", description: "Se verifican voltajes entre fase y neutro, correctos para la operación." },
  { section: "Limpieza general", caption: "Generador — limpieza general", description: "Se realiza limpieza general del generador y del tablero de control." },
  { section: "Limpieza general", caption: "Calefactor", description: "Se revisa el estado general del calefactor y mangueras, limpieza, verificación de fugas y estado de conexionado." },
];

export const DEFAULT_REPUESTOS: Omit<ParteItem, 'id'>[] = [
  { parte: "AF25904", cantidad: "1", detalle: "Filtro de aire" },
  { parte: "LF16087", cantidad: "1", detalle: "Filtro de aceite" },
  { parte: "FS01275", cantidad: "1", detalle: "Filtro de combustible" },
  { parte: "100031-103", cantidad: "7 litros", detalle: "Aceite (15W40)" },
];

export const DEFAULT_PLAN: Omit<PlanItem, 'id'>[] = [
  { detalle: "Filtro de combustible", cantidad: "1", parte: "FS01275" },
  { detalle: "Filtro de aceite", cantidad: "1", parte: "LF16087" },
  { detalle: "Filtro de aire", cantidad: "1", parte: "AF25904" },
  { detalle: "Lavado de radiador", cantidad: "1", parte: "—" },
  { detalle: "Limpieza tablero de control", cantidad: "1", parte: "—" },
  { detalle: "Pruebas en vacío y con carga", cantidad: "1", parte: "N/A" },
  { detalle: "Revisión de mangueras", cantidad: "1", parte: "—" },
];

export const DEFAULT_VERIFICACIONES: Omit<ChecklistItem, 'id'>[] = [
  { label: "Botón parada de emergencia", estado: "OK", observaciones: "" },
  { label: "Botón reset de alarmas", estado: "OK", observaciones: "" },
  { label: "Funcionamiento de indicadores", estado: "OK", observaciones: "" },
  { label: "Calefactor de agua", estado: "OK", observaciones: "" },
  { label: "Pérdida de combustible", estado: "OK", observaciones: "" },
  { label: "Pérdida de aceite", estado: "OK", observaciones: "" },
  { label: "Pérdida de refrigerante", estado: "OK", observaciones: "" },
  { label: "Pérdida en tubo de escape", estado: "OK", observaciones: "" },
];

export const DEFAULT_FILTROS: Omit<FiltroItem, 'id'>[] = [
  { nombre: "FILTRO DE AIRE", estado: "OK", tipo: "AF25904", observaciones: "Filtro nuevo" },
  { nombre: "FILTRO DE ACEITE", estado: "OK", tipo: "LF16087", observaciones: "Filtro nuevo" },
  { nombre: "FILTRO DE COMBUSTIBLE", estado: "OK", tipo: "FS01275", observaciones: "Filtro nuevo" },
];


export const withIds = <T>(items: T[]): (T & { id: string })[] => items.map(item => ({ ...item, id: uid() }));

/** Valores con que empieza un informe nuevo (los que no dependen de la división). */
export const VALORES_INICIALES = {
  modeloGenerador: "Cummins C17D5",
  tipoServicio: "Mantenimiento preventivo Generador",
  descripcionTexto: "Se realiza un mantenimiento preventivo a grupo electrógeno en el sitio, revisando el estado general del generador. Conjuntamente se ejecuta la limpieza en sistema mecánico y eléctrico, y de funcionamiento en control Power Command.",
  horasPlan: "1750",
  nivelRefrigerante: "ÓPTIMO",
  nivelCombustible: "1/2",
  nivelAceite: "ÓPTIMO",
  cantidadBaterias: "1",
  capacidadBateria: "100 A/H",
};

/** Todo lo que lleva el Word (lo mismo que guarda el borrador en "datos"). */
export interface DatosMantenimiento {
  fecha: string; creadoNombre: string; creadoCargo: string; revisadoText: string; sitio: string; modeloGenerador: string;
  cliente: string; area: string; minera: string; tipoServicio: string; ejecutante: string;
  descripcionTexto: string; componentes: string[]; trabajos: string[]; fotos: FotoItem[];
  horasPlan: string; repuestos: ParteItem[]; filtros: FiltroItem[]; horometro: string; cantidadPartidas: string;
  nivelRefrigerante: string; nivelCombustible: string; nivelAceite: string; cantidadBaterias: string; capacidadBateria: string;
  voltajeArranque: string; voltajeMotorEncendido: string; verificaciones: ChecklistItem[];
  horasProximaMantencion: string; planPreventivo: PlanItem[]; fechaProximoMantenimiento: string;
}

/**
 * Datos de un borrador guardado, tal como quedan en el formulario al abrirlo: lo que falte en el borrador
 * se completa con los mismos valores con que empieza un informe nuevo.
 */
export function datosMantenimientoDeBorrador(guardados: unknown, division: Division): DatosMantenimiento {
  const config = configDivision(division).mantenimiento;
  const { carros, ubicacionPorCarro } = configDivision(division);
  const sitioInicial = carros.map(c => c.replace(/_/g, " "))[0];
  const ubicacionDeSitio = (sitio: string) => ubicacionPorCarro[sitio.trim().replace(/\s+/g, "_")] ?? "";
  const d = (guardados && typeof guardados === 'object' ? guardados : {}) as Record<string, unknown>;
  const texto = (v: unknown, defecto: string) => (typeof v === 'string' ? v : defecto);
  const lista = <T>(v: unknown, defecto: () => T[]): T[] => (Array.isArray(v) ? (v as T[]) : defecto());
  const v = VALORES_INICIALES;
  return {
    fecha: texto(d.fecha, hoyLocalISO()),
    creadoNombre: texto(d.creadoNombre, config.creado.nombre),
    creadoCargo: texto(d.creadoCargo, config.creado.cargo),
    revisadoText: texto(d.revisadoText, config.revisadoText),
    sitio: texto(d.sitio, sitioInicial),
    modeloGenerador: texto(d.modeloGenerador, v.modeloGenerador),
    cliente: texto(d.cliente, config.cliente),
    area: texto(d.area, ubicacionDeSitio(sitioInicial)),
    minera: texto(d.minera, config.minera),
    tipoServicio: texto(d.tipoServicio, v.tipoServicio),
    ejecutante: texto(d.ejecutante, config.ejecutante),
    descripcionTexto: texto(d.descripcionTexto, v.descripcionTexto),
    componentes: lista<string>(d.componentes, () => DEFAULT_COMPONENTES),
    trabajos: lista<string>(d.trabajos, () => DEFAULT_TRABAJOS),
    fotos: lista<FotoItem>(d.fotos, () => withIds(DEFAULT_FOTOS).map(f => ({ ...f, photo: null }))),
    horasPlan: texto(d.horasPlan, v.horasPlan),
    repuestos: lista<ParteItem>(d.repuestos, () => withIds(DEFAULT_REPUESTOS)),
    filtros: lista<FiltroItem>(d.filtros, () => withIds(DEFAULT_FILTROS)),
    horometro: texto(d.horometro, ""),
    cantidadPartidas: texto(d.cantidadPartidas, ""),
    nivelRefrigerante: texto(d.nivelRefrigerante, v.nivelRefrigerante),
    nivelCombustible: texto(d.nivelCombustible, v.nivelCombustible),
    nivelAceite: texto(d.nivelAceite, v.nivelAceite),
    cantidadBaterias: texto(d.cantidadBaterias, v.cantidadBaterias),
    capacidadBateria: texto(d.capacidadBateria, v.capacidadBateria),
    voltajeArranque: texto(d.voltajeArranque, ""),
    voltajeMotorEncendido: texto(d.voltajeMotorEncendido, ""),
    verificaciones: lista<ChecklistItem>(d.verificaciones, () => withIds(DEFAULT_VERIFICACIONES)),
    horasProximaMantencion: texto(d.horasProximaMantencion, ""),
    planPreventivo: lista<PlanItem>(d.planPreventivo, () => withIds(DEFAULT_PLAN)),
    fechaProximoMantenimiento: texto(d.fechaProximoMantenimiento, ""),
  };
}

/** Lo que falta para poder armar el Word (null si está todo). */
export const faltaParaWordMantenimiento = (d: Pick<DatosMantenimiento, 'fecha' | 'sitio'>): string | null =>
  !d.fecha ? "Selecciona la fecha del informe." : !d.sitio.trim() ? "Indica el nombre del sitio / emplazamiento." : null;

export function nombreArchivoMantenimiento(d: Pick<DatosMantenimiento, 'fecha' | 'sitio'>): string {
  const [year, month, day] = d.fecha.split("-");
  const sitioArchivo = d.sitio.trim().replace(/\s+/g, "_") || "SITIO";
  return `Informe_Mantenimiento_Generador_${sitioArchivo}_${day}-${month}-${year}.docx`;
}

/** Arma el Word (el mismo documento que siempre ha generado el formulario). */
export async function generarWordMantenimiento(d: DatosMantenimiento): Promise<Blob> {
  const {
    fecha, creadoNombre, creadoCargo, revisadoText, sitio, modeloGenerador,
    cliente, area, minera, tipoServicio, ejecutante,
    descripcionTexto, componentes, trabajos, fotos,
    horasPlan, repuestos, filtros, horometro, cantidadPartidas,
    nivelRefrigerante, nivelCombustible, nivelAceite, cantidadBaterias, capacidadBateria,
    voltajeArranque, voltajeMotorEncendido, verificaciones,
    horasProximaMantencion, planPreventivo, fechaProximoMantenimiento,
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
    resolverImagenes(fotos.map(f => f.photo)),
  ]);
  const revisadoPor = revisadoText.split("\n").map(s => s.trim()).filter(Boolean);

  const headerCellMargins = { top: 160, bottom: 160, left: 220, right: 220 };

  // Encabezado repetido en cada página del cuerpo del informe.
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
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Informe de Mantenimiento de Generador", size: 18, font: "Arial", bold: true })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sitio, size: 16, font: "Arial" })] }),
                ],
              }),
              new TableCell({
                width: { size: 2808, type: WidthType.DXA },
                borders: cellBorders("000000"),
                margins: headerCellMargins,
                verticalAlign: VerticalAlign.CENTER,
                children: [
                  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "Fecha:", size: 15, font: "Arial" })] }),
                  new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: formatFechaLarga(fecha), size: 15, font: "Arial" })] }),
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
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "INFORME DE MANTENIMIENTO", size: 52, font: "Arial", bold: true, color: "000000" })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DE GENERADOR", size: 52, font: "Arial", bold: true, color: "000000" })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sitio, bold: true, size: 36, font: "Arial", color: BLUE })] }),
  ];

  // Fecha / Creado por / Revisado por: columna angosta a la derecha, alineados a la derecha.
  const coverRightChildren: docx.Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: formatFechaLarga(fecha), size: 20, font: "Arial" })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Creado por:", size: 18, font: "Arial", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: creadoNombre, size: 18, font: "Arial" })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `Cargo: ${creadoCargo}`, size: 18, font: "Arial" })] }),
    new Paragraph({ text: "" }),
    new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Revisado por:", size: 18, font: "Arial", bold: true })] }),
    ...revisadoPor.map(line => new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: line, size: 18, font: "Arial" })] })),
  ];

  const coverTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [7000, 2360],
    borders: noBorders(),
    rows: [new TableRow({
      children: [
        new TableCell({ width: { size: 7000, type: WidthType.DXA }, borders: noBorders(), children: coverLeftChildren }),
        new TableCell({
          width: { size: 2360, type: WidthType.DXA },
          borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
          margins: { left: 300, top: 100, bottom: 100 },
          children: coverRightChildren,
        }),
      ],
    })],
  });

  // --- Tabla REGISTRO ---
  const registroRow = (label: string, value: string) => new TableRow({
    children: [
      new TableCell({
        width: { size: 3200, type: WidthType.DXA },
        borders: cellBorders(),
        shading: { fill: "EEF1F2" },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 20 })] })],
      }),
      new TableCell({
        width: { size: 6160, type: WidthType.DXA },
        borders: cellBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: value || "—", font: "Arial", size: 20 })] })],
      }),
    ],
  });

  const registroTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [3200, 6160],
    borders: cellBorders(),
    rows: [
      new TableRow({ children: [new TableCell({
        columnSpan: 2, borders: cellBorders(), shading: { fill: "0E4660" },
        children: [new Paragraph({ children: [new TextRun({ text: "REGISTRO", bold: true, color: "FFFFFF", font: "Arial", size: 21 })] })],
      })] }),
      registroRow("Cliente", cliente),
      registroRow("Nombre Emplazamiento", sitio),
      registroRow("Área", area),
      registroRow("Minera", minera),
      registroRow("Tipo de servicio", tipoServicio),
      registroRow("Ejecutante", ejecutante),
    ],
  });

  // --- Registro fotográfico: agrupado por "section", de a 2 fotos por fila ---
  const buildFotoCell = async (item: FotoItem, widthDxa: number) => {
    const children: docx.Paragraph[] = [];
    if (item.photo) {
      const { bytes, type } = imagenes.get(item.photo) ?? await bytesDeImagen(item.photo);
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: 260, height: 260 }, type })] }));
    } else {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin foto cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] }));
    }
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80 }, children: [new TextRun({ text: item.caption || "—", bold: true, size: 19, font: "Arial" })] }));
    if (item.description.trim()) {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: item.description, size: 18, font: "Arial", italics: true })] }));
    }
    return new TableCell({ width: { size: widthDxa, type: WidthType.DXA }, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children });
  };

  const fotoBlocks: (docx.Paragraph | docx.Table)[] = [
    new Paragraph({ text: "", pageBreakBefore: true }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun({ text: `Registro fotográfico del mantenimiento del generador ${modeloGenerador}`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
  ];

  let seccionAnterior = "__none__";
  let primeraSeccion = true;
  for (let i = 0; i < fotos.length; ) {
    const item = fotos[i];
    if (item.section && item.section !== seccionAnterior) {
      // Cada sección nueva (salvo la primera) arranca en página limpia, para que el título
      // no quede separado de sus fotos por un salto de página automático.
      fotoBlocks.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
        pageBreakBefore: !primeraSeccion,
        spacing: { before: 200 },
        children: [new TextRun({ text: item.section, color: BLUE, size: 22, font: "Arial", bold: true })],
      }));
      primeraSeccion = false;
    }
    seccionAnterior = item.section || seccionAnterior;

    // Agrupa de a 2 mientras compartan la misma sección.
    const pair = [item];
    const next = fotos[i + 1];
    if (next && next.section === item.section) {
      pair.push(next);
    }
    const cells = await Promise.all(pair.map(p => buildFotoCell(p, Math.floor(9360 / pair.length))));
    fotoBlocks.push(new Table({
      width: { size: 9360, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: pair.map(() => Math.floor(9360 / pair.length)),
      rows: [new TableRow({ cantSplit: false, children: cells })],
    }));
    i += pair.length;
  }

  // --- 4. Programa de mantenimiento ---
  const repuestosTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [3120, 3120, 3120],
    borders: cellBorders(),
    rows: [
      new TableRow({ children: ["N° parte", "Cantidad", "Detalle"].map(h => new TableCell({
        borders: cellBorders(), shading: { fill: "EEF1F2" },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
      })) }),
      ...repuestos.map(r => new TableRow({ children: [r.parte, r.cantidad, r.detalle].map(v => new TableCell({
        borders: cellBorders(),
        children: [new Paragraph({ children: [new TextRun({ text: v || "—", font: "Arial", size: 20 })] })],
      })) })),
    ],
  });

  // --- 4.1 Inspección de grupo Generador ---
  const infoRow = (label: string, value: string) => new TableRow({
    children: [
      new TableCell({ width: { size: 3200, type: WidthType.DXA }, borders: cellBorders(), shading: { fill: "EEF1F2" }, children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 20 })] })] }),
      new TableCell({ width: { size: 6160, type: WidthType.DXA }, borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: value || "—", font: "Arial", size: 20 })] })] }),
    ],
  });

  const datosNodoTable = new Table({
    width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
    rows: [
      infoRow("Nombre de sitio", sitio),
      infoRow("Nombre ejecutante", ejecutante),
      infoRow("Fecha de inspección", formatFechaLarga(fecha)),
    ],
  });

  const filtrosTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [2500, 1500, 2000, 3360],
    borders: cellBorders(),
    rows: [
      new TableRow({ children: ["Filtro", "Estado", "Tipo / N° parte", "Observaciones"].map(h => new TableCell({
        borders: cellBorders(), shading: { fill: "EEF1F2" },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
      })) }),
      ...filtros.map(f => new TableRow({ children: [f.nombre, f.estado, f.tipo, f.observaciones].map(v => new TableCell({
        borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: v || "—", font: "Arial", size: 20 })] })],
      })) })),
    ],
  });

  const horasNivelesTable = new Table({
    width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
    rows: [
      infoRow("Horómetro", horometro),
      infoRow("Cantidad de partidas", cantidadPartidas),
      infoRow("Nivel de refrigerante", nivelRefrigerante),
      infoRow("Nivel de combustible", nivelCombustible),
      infoRow("Nivel de aceite", nivelAceite),
    ],
  });

  const bateriaTable = new Table({
    width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
    rows: [
      infoRow("Cantidad de baterías", cantidadBaterias),
      infoRow("Capacidad batería A/HR", capacidadBateria),
      infoRow("Voltaje batería (arranque)", voltajeArranque),
      infoRow("Voltaje batería (motor encendido)", voltajeMotorEncendido),
    ],
  });

  const verificacionesTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [4160, 1600, 3600],
    borders: cellBorders(),
    rows: [
      new TableRow({ children: ["Verificación general", "Estado", "Observaciones"].map(h => new TableCell({
        borders: cellBorders(), shading: { fill: "EEF1F2" },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
      })) }),
      ...verificaciones.map(v => new TableRow({ children: [v.label, v.estado, v.observaciones].map(val => new TableCell({
        borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: val || "—", font: "Arial", size: 20 })] })],
      })) })),
    ],
  });

  // --- Conclusión + Plan preventivo ---
  const conclusionTexto =
    `Se desarrolló el plan de mantenimiento preventivo del generador ${modeloGenerador.split(" ")[0] || "—"}, ` +
    `modelo ${modeloGenerador.split(" ").slice(1).join(" ") || modeloGenerador} del sitio ${sitio}, que corresponde a las ${horasPlan || "—"} horas de funcionamiento. ` +
    `En este caso el generador contaba con ${horometro || "—"} horas de trabajo` +
    (horasProximaMantencion ? ` y su próxima mantención se realizará a las ${horasProximaMantencion} horas, de acuerdo con lo indicado por el fabricante.` : ".");

  const planTable = new Table({
    width: { size: 9360, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [4160, 2600, 2600],
    borders: cellBorders(),
    rows: [
      new TableRow({ children: [new TableCell({
        columnSpan: 3, borders: cellBorders(), shading: { fill: "0E4660" },
        children: [new Paragraph({ children: [new TextRun({ text: `PLAN PREVENTIVO: ${horasPlan || "—"} HRS`, bold: true, color: "FFFFFF", font: "Arial", size: 21 })] })],
      })] }),
      new TableRow({ children: ["Detalle", "Cantidad", "N° parte"].map(h => new TableCell({
        borders: cellBorders(), shading: { fill: "EEF1F2" },
        children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20 })] })],
      })) }),
      ...planPreventivo.map(p => new TableRow({ children: [p.detalle, p.cantidad, p.parte].map(v => new TableCell({
        borders: cellBorders(), children: [new Paragraph({ children: [new TextRun({ text: v || "—", font: "Arial", size: 20 })] })],
      })) })),
    ],
  });

  const proximoTable = new Table({
    width: { size: 9360, type: WidthType.DXA }, layout: TableLayoutType.FIXED, columnWidths: [3200, 6160], borders: cellBorders(),
    rows: [
      infoRow("Fecha próximo mantenimiento", fechaProximoMantenimiento ? formatFechaLarga(fechaProximoMantenimiento) : "—"),
      infoRow("Horómetro estimado", horasProximaMantencion),
    ],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
    sections: [
      { properties: { page: { size: { width: 12240, height: 15840 } } }, children: [coverTable] },
      {
        properties: { page: { size: { width: 12240, height: 15840 } } },
        headers: { default: header },
        children: [
          registroTable,
          new Paragraph({ text: "" }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Descripción", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: descripcionTexto, font: "Arial" })] }),
          ...(componentes.filter(c => c.trim()).length ? [
            new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Se realiza cambio de los siguientes componentes:", font: "Arial", bold: true })] }),
            ...componentes.filter(c => c.trim()).map(c => new Paragraph({ text: c, bullet: { level: 0 } })),
          ] : []),
          new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Trabajos realizados:", font: "Arial", bold: true })] }),
          ...trabajos.filter(t => t.trim()).map(t => new Paragraph({ text: t, bullet: { level: 0 } })),
          ...fotoBlocks,
          new Paragraph({ text: "", pageBreakBefore: true }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "4. Programa de mantenimiento", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: `Programa de mantenimiento según pauta de ${horasPlan || "—"} horas de funcionamiento.`, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          repuestosTable,
          new Paragraph({ text: "" }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "4.1 Inspección de grupo Generador", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          datosNodoTable,
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Filtros — aceite, refrigerante, combustible", font: "Arial", bold: true })] }),
          filtrosTable,
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Inspección de horas y niveles", font: "Arial", bold: true })] }),
          horasNivelesTable,
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Batería", font: "Arial", bold: true })] }),
          bateriaTable,
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Verificaciones generales", font: "Arial", bold: true })] }),
          verificacionesTable,
          new Paragraph({ text: "" }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Conclusión", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: conclusionTexto, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          planTable,
          new Paragraph({ text: "" }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Próximo mantenimiento programado", color: BLUE, size: 26, font: "Arial", bold: true })] }),
          proximoTable,
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
