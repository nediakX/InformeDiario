// Importa un Checklist de Camioneta (GSSO-LTE-R-LV-DSAL-29) desde su Word. El documento se generó
// rellenando la plantilla oficial, así que cada dato se lee de la misma celda donde se escribió.
import plantillaUrl from '../assets/plantillas/checklist_camioneta.docx?url';
import { sumarDias } from '../datos/fechas';
import { semanaDeFecha } from '../datos/turnos';
import {
  DIAS_CHECKLIST, TODOS_LOS_ITEMS, checklistVacio, type DatosChecklist, type Marca, type Respuesta,
} from '../informes/checklist/catalogo';
import { fechaDesdeTexto, leerDocx, textoDe, type DocumentoLeido } from './leerDocx';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const hijos = (el: Element, nombre: string) =>
  Array.from(el.children).filter(c => c.namespaceURI === W && c.localName === nombre);

/** Acceso a la celda (tabla, fila, columna) del cuerpo del documento, igual que al generarlo. */
function lectorCeldas(xml: Document) {
  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  const tablas = body ? hijos(body, 'tbl') : [];
  const celda = (t: number, f: number, c: number): Element | null => {
    const tr = tablas[t] ? hijos(tablas[t], 'tr')[f] : undefined;
    return tr ? hijos(tr, 'tc')[c] ?? null : null;
  };
  return {
    texto: (t: number, f: number, c: number) => { const el = celda(t, f, c); return el ? textoDe(el).trim() : ''; },
    parrafos: body ? hijos(body, 'p').map(p => textoDe(p)) : [],
  };
}

/** Valor escrito sobre la línea "_____" de un texto: se le quita el texto fijo de la plantilla. */
function valorSobreLinea(plantilla: string, lleno: string): string {
  const partes = plantilla.split(/_+/).map(s => s.trim()).filter(Boolean);
  let valor = lleno;
  for (const parte of partes) valor = valor.replace(parte, '');
  return valor.replace(/_+/g, '').trim();
}

export async function importarChecklist(doc: DocumentoLeido): Promise<DatosChecklist> {
  const plantilla = await leerDocx(await (await fetch(plantillaUrl)).blob());
  const lleno = lectorCeldas(doc.xml);
  const base = lectorCeldas(plantilla.xml);

  const desde = fechaDesdeTexto(lleno.texto(0, 1, 2));
  if (!desde) throw new Error('No se pudo leer la semana del checklist (fecha "desde").');
  // La primera columna es el martes de llegada; la semana de turno parte el miércoles siguiente.
  const semanaInicio = sumarDias(desde, 1);
  const letra = semanaDeFecha(semanaInicio).letra as 'A' | 'B';
  const datos = checklistVacio(semanaInicio, letra);

  const fechaCelda = (t: number, f: number, c: number) => fechaDesdeTexto(lleno.texto(t, f, c));
  datos.conductor = lleno.texto(0, 0, 1);
  datos.marca = lleno.texto(1, 1, 10);
  datos.modelo = lleno.texto(1, 2, 10);
  datos.anio = lleno.texto(1, 3, 10);
  datos.patente = lleno.texto(1, 4, 10).toUpperCase();
  datos.fechaUltimaMantencion = fechaCelda(1, 5, 10);
  datos.kmProximaMantencion = lleno.texto(1, 6, 10);
  datos.fechaControlLicencia = fechaCelda(1, 7, 1);
  datos.kmInicio = lleno.texto(1, 7, 3);
  datos.fechaExtintor = fechaCelda(1, 8, 1);
  datos.kmFin = lleno.texto(1, 8, 3);

  const marca = (t: string): Marca => (t.includes('✓') ? 'ok' : /^x$/i.test(t) ? 'x' : '');
  for (const item of TODOS_LOS_ITEMS) {
    datos.marcas[item.id] = Array.from({ length: DIAS_CHECKLIST }, (_, dia) => marca(lleno.texto(item.tabla, item.fila, item.col + dia)));
  }
  const resp = (t: string): Respuesta => (/^si$/i.test(t) ? 'SI' : /^no$/i.test(t) ? 'NO' : '');
  for (let dia = 0; dia < DIAS_CHECKLIST; dia++) {
    datos.aptitudes.alcohol[dia] = resp(lleno.texto(4, 2, 1 + dia));
    datos.aptitudes.medicamento[dia] = resp(lleno.texto(4, 2, 10 + dia));
    datos.aptitudes.aptitud[dia] = resp(lleno.texto(4, 3, 1 + dia));
    datos.firmas[dia] = lleno.texto(5, 1, 1 + dia);
  }
  datos.medicamentoCual = valorSobreLinea(base.texto(4, 3, 9), lleno.texto(4, 3, 9));
  datos.dpf = valorSobreLinea(base.texto(4, 5, 0), lleno.texto(4, 5, 0));
  datos.limpiezaFiltro = valorSobreLinea(base.texto(4, 6, 0), lleno.texto(4, 6, 0));

  // Observaciones: el renglón "_____" que sigue al título en la plantilla.
  const iTitulo = base.parrafos.findIndex(p => p.includes('OBSERVACIONES'));
  const iLinea = base.parrafos.findIndex((p, i) => i > iTitulo && /_{5,}/.test(p));
  const linea = iLinea >= 0 ? lleno.parrafos[iLinea] ?? '' : '';
  datos.observaciones = /_{5,}/.test(linea) ? '' : linea.trim();

  if (!datos.patente) throw new Error('El checklist no tiene la patente de la camioneta.');
  return datos;
}
