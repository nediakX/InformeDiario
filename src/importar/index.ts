// "Importar informe desde Word": reconoce qué informe es el .docx y lo convierte de vuelta en un
// borrador de la app (con sus fotos), para recuperar un informe que se borró.
import { CONFIG_DIVISION, type Division } from '../datos/divisiones';
import type { BorradorEntry } from '../datos/borradoresDiario';
import type { DatosChecklist } from '../informes/checklist/catalogo';
import { leerDocx, normalizar } from './leerDocx';
import { detectarDivision } from './comun';
import type { DatosCierreImportados } from './cierre';

export type ResultadoImportacion =
  | { tipo: 'diario'; entry: BorradorEntry }
  | { tipo: 'cierre'; datos: DatosCierreImportados }
  | { tipo: 'mantenimiento' | 'falla'; titulo: string; fecha: string; datos: Record<string, unknown> }
  | { tipo: 'checklist'; datos: DatosChecklist };

export const NOMBRE_TIPO: Record<ResultadoImportacion['tipo'], string> = {
  diario: 'Informe Diario',
  cierre: 'Informe de Cierre',
  mantenimiento: 'Mantenimiento de Generador',
  falla: 'Informe de Falla — Carro',
  checklist: 'Checklist de Camioneta',
};

export class ErrorImportacion extends Error {}

export async function importarWord(archivo: File, divisionActual: Division, puedeCambiarDivision: boolean): Promise<ResultadoImportacion> {
  if (!/\.docx$/i.test(archivo.name)) throw new ErrorImportacion('Elige el archivo Word (.docx) que descargaste de la app.');
  const doc = await leerDocx(archivo);
  const texto = normalizar(doc.textoCompleto);

  const tipo: ResultadoImportacion['tipo'] | null =
    texto.includes('datos camioneta') && texto.includes('documentos del vehiculo') ? 'checklist'
      : texto.includes('informe de cierre') ? 'cierre'
        : texto.includes('reporte de falla') ? 'falla'
          : texto.includes('informe de mantenimiento') ? 'mantenimiento'
            : texto.includes('reporte diario') ? 'diario'
              : null;
  if (!tipo) throw new ErrorImportacion('Este Word no parece ser un informe generado por la app (Diario, Cierre, Mantenimiento, Falla o Checklist).');

  // El informe se importa en la división a la que pertenece.
  const division = detectarDivision(doc.textoCompleto, divisionActual);
  if (division !== divisionActual) {
    const nombre = CONFIG_DIVISION[division].nombre;
    throw new ErrorImportacion(puedeCambiarDivision
      ? `Este informe es de ${nombre}. Cambia a esa división (arriba, en el panel) y vuelve a importarlo.`
      : `Este informe es de ${nombre}, que no corresponde a tu cuenta.`);
  }

  try {
    switch (tipo) {
      case 'diario': {
        const { importarDiario } = await import('./diario');
        return { tipo, entry: await importarDiario(doc, division) };
      }
      case 'cierre': {
        const { importarCierre } = await import('./cierre');
        return { tipo, datos: await importarCierre(doc) };
      }
      case 'mantenimiento': {
        const { importarMantenimiento } = await import('./mantenimiento');
        return { tipo, ...(await importarMantenimiento(doc)) };
      }
      case 'falla': {
        const { importarFalla } = await import('./falla');
        return { tipo, ...(await importarFalla(doc, division)) };
      }
      case 'checklist': {
        const { importarChecklist } = await import('./checklist');
        return { tipo, datos: await importarChecklist(doc) };
      }
    }
  } catch (error) {
    console.error('No se pudo importar el Word:', error);
    throw new ErrorImportacion(error instanceof Error && error.message ? error.message : 'No se pudo leer el informe.');
  }
}

/** Cuántas fotos trae lo importado (para el resumen antes de confirmar). */
export function contarFotosImportadas(r: ResultadoImportacion): number {
  let n = 0;
  const recorrer = (v: unknown) => {
    if (typeof v === 'string') { if (v.startsWith('data:image')) n++; return; }
    if (Array.isArray(v)) { v.forEach(recorrer); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(recorrer);
  };
  recorrer(r);
  return n;
}
