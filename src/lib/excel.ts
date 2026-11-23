// Excel (.xlsx) sencillo: una o varias hojas con encabezados y filas, con fechas y horas como fechas
// reales de Excel (se pueden filtrar y ordenar). Se arma con JSZip, sin librerías pesadas.
// Las columnas pueden llevar colores condicionales (formato condicional de Excel): se recalculan solos si
// cambian los valores o la fecha.

export type TipoColumna = 'texto' | 'numero' | 'porcentaje' | 'fecha' | 'hora' | 'fechaHora';
export interface ColumnaExcel { titulo: string; tipo: TipoColumna; ancho?: number }
/** Fecha: "AAAA-MM-DD"; hora: "HH:MM"; fechaHora: Date; porcentaje: fracción (1 = 100 %). */
export type ValorExcel = string | number | Date | null | undefined;
/** Estilos de Excel Bueno, Neutral e Incorrecto (los de la planilla Datos GG); "Texto" solo cambia la letra. */
export type ColorExcel = 'verde' | 'naranjo' | 'rojo' | 'verdeTexto' | 'rojoTexto';
/**
 * Colores de una columna: la primera regla que se cumple manda. `si` es una fórmula de Excel donde `{c}` es la
 * celda (ej.: "{c}>240", "{c}<TODAY()", '{c}="Vencido"'). Las celdas vacías no se pintan.
 */
export interface ColoresColumna { columna: number; reglas: { si: string; color: ColorExcel }[] }
export interface HojaExcel { nombre: string; columnas: ColumnaExcel[]; filas: ValorExcel[][]; colores?: ColoresColumna[] }

const DXF: Record<ColorExcel, number> = { verde: 0, naranjo: 1, rojo: 2, verdeTexto: 3, rojoTexto: 4 };
const DXFS = '<dxfs count="5">'
  + '<dxf><font><color rgb="FF006100"/></font><fill><patternFill><bgColor rgb="FFC6EFCE"/></patternFill></fill></dxf>'
  + '<dxf><font><color rgb="FF9C5700"/></font><fill><patternFill><bgColor rgb="FFFFEB9C"/></patternFill></fill></dxf>'
  + '<dxf><font><color rgb="FF9C0006"/></font><fill><patternFill><bgColor rgb="FFFFC7CE"/></patternFill></fill></dxf>'
  + '<dxf><font><color rgb="FF006100"/></font></dxf>'
  + '<dxf><font><color rgb="FF9C0006"/></font></dxf>'
  + '</dxfs>';

/** Formato condicional de la hoja (va después del filtro). */
function coloresXml(colores: ColoresColumna[] | undefined, filas: number): string {
  if (!colores?.length || filas < 1) return '';
  let prioridad = 1;
  return colores.map(({ columna, reglas }) => {
    const celda = `${letra(columna)}2`;
    const reglasXml = reglas.map(({ si, color }) => {
      const formula = `AND(NOT(ISBLANK(${celda})),${si.split('{c}').join(celda)})`;
      return `<cfRule type="expression" dxfId="${DXF[color]}" priority="${prioridad++}" stopIfTrue="1"><formula>${esc(formula)}</formula></cfRule>`;
    }).join('');
    return `<conditionalFormatting sqref="${celda}:${letra(columna)}${filas + 1}">${reglasXml}</conditionalFormatting>`;
  }).join('');
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letra = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letra(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

// Número de serie de Excel (días desde 1899-12-30), con la hora local tal cual se ve.
const DIA_MS = 86_400_000;
const serieFecha = (a: number, m: number, d: number) => (Date.UTC(a, m - 1, d) - Date.UTC(1899, 11, 30)) / DIA_MS;
const serieHora = (h: number, min: number, s = 0) => (h * 3600 + min * 60 + s) / 86400;

function serie(tipo: TipoColumna, v: ValorExcel): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (tipo === 'fecha' && typeof v === 'string') {
    const [a, m, d] = v.split('-').map(Number);
    return a ? serieFecha(a, m, d) : null;
  }
  if (tipo === 'hora' && typeof v === 'string') {
    const [h, min, s] = v.split(':').map(Number);
    return Number.isFinite(h) ? serieHora(h, min || 0, s || 0) : null;
  }
  if (tipo === 'fechaHora') {
    const f = v instanceof Date ? v : new Date(String(v));
    if (Number.isNaN(f.getTime())) return null;
    return serieFecha(f.getFullYear(), f.getMonth() + 1, f.getDate()) + serieHora(f.getHours(), f.getMinutes(), f.getSeconds());
  }
  return null;
}

// Estilos: 0 normal, 1 encabezado (negrita), 2 fecha, 3 hora, 4 fecha y hora, 5 porcentaje.
const ESTILO: Record<TipoColumna, number> = { texto: 0, numero: 0, fecha: 2, hora: 3, fechaHora: 4, porcentaje: 5 };

/** Contenido de una hoja (encabezados en la fila 1, congelada y con filtro). */
function hojaXml({ columnas, filas, colores }: HojaExcel): string {
  const celdas: string[] = [];
  celdas.push(`<row r="1">${columnas.map((c, i) => `<c r="${letra(i)}1" t="inlineStr" s="1"><is><t>${esc(c.titulo)}</t></is></c>`).join('')}</row>`);
  filas.forEach((fila, f) => {
    const r = f + 2;
    const xml = columnas.map((c, i) => {
      const v = fila[i];
      const ref = `${letra(i)}${r}`;
      if (v === null || v === undefined || v === '') return '';
      if (c.tipo === 'numero' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      if (c.tipo === 'porcentaje' && typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${ESTILO.porcentaje}"><v>${v}</v></c>`;
      if (c.tipo !== 'texto' && c.tipo !== 'numero' && c.tipo !== 'porcentaje') {
        const n = serie(c.tipo, v);
        if (n !== null) return `<c r="${ref}" s="${ESTILO[c.tipo]}"><v>${n}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
    }).join('');
    celdas.push(`<row r="${r}">${xml}</row>`);
  });
  const anchos = `<cols>${columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.ancho ?? 14}" customWidth="1"/>`).join('')}</cols>`;
  const ultima = `${letra(columnas.length - 1)}${filas.length + 1}`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${anchos}<sheetData>${celdas.join('')}</sheetData><autoFilter ref="A1:${ultima}"/>${coloresXml(colores, filas.length)}</worksheet>`;
}

/** Nombre de hoja válido para Excel (máximo 31 caracteres, sin los signos : \ / ? * [ ]) y sin repetir. */
function nombresDeHoja(hojas: HojaExcel[]): string[] {
  const usados = new Set<string>();
  return hojas.map((h, i) => {
    const base = (h.nombre.replace(/[:\\/?*[\]]/g, ' ').trim() || `Hoja ${i + 1}`).slice(0, 31);
    let nombre = base;
    for (let n = 2; usados.has(nombre.toLowerCase()); n++) nombre = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    usados.add(nombre.toLowerCase());
    return nombre;
  });
}

/** Libro de Excel con una o varias hojas. */
export async function crearLibroExcel(hojas: HojaExcel[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const nombres = nombresDeHoja(hojas);
  const hojasTipo = hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojasTipo}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nombres.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/><numFmt numFmtId="166" formatCode="dd/mm/yyyy hh:mm:ss"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' + DXFS + '</styleSheet>');
  hojas.forEach((h, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, hojaXml(h)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Libro de una sola hoja. */
export function crearExcel(nombreHoja: string, columnas: ColumnaExcel[], filas: ValorExcel[][]): Promise<Blob> {
  return crearLibroExcel([{ nombre: nombreHoja, columnas, filas }]);
}

