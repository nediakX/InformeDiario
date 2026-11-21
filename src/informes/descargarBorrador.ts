// "Descargar" en Borradores de Mantenimiento y Falla: arma el mismo Word que el botón "Generar" de cada
// informe, con lo guardado en el borrador y sin tener que abrirlo.
import { saveAs } from 'file-saver';
import { registrarActividad } from '../lib/actividad';
import type { BorradorOtroEntry } from '../datos/borradoresOtros';
import { esPreventiva } from './preventiva/modelo';
import { armarDatosPreventiva, estadoInicialPreventiva, faltaParaWordPreventiva } from './preventiva/borrador';
import { generarPreventivaWord, nombreArchivoPreventiva } from './preventiva/word';
import { datosMantenimientoDeBorrador, faltaParaWordMantenimiento, generarWordMantenimiento, nombreArchivoMantenimiento } from './mantenimiento/word';
import { datosFallaDeBorrador, faltaParaWordFalla, generarWordFalla, nombreArchivoFalla } from './falla/word';

/** Error cuando al borrador le falta algo para armar el Word (el mismo aviso que da el informe). */
const faltanDatos = (motivo: string) => Object.assign(new Error(motivo), { name: 'FaltanDatos' });

/** Genera y descarga el Word del borrador; devuelve el nombre del archivo. Si falta algo, lanza el motivo. */
export async function descargarWordDeBorrador(entry: BorradorOtroEntry): Promise<string> {
  let blob: Blob;
  let nombre: string;
  if (entry.tipo === 'falla') {
    const d = datosFallaDeBorrador(entry.datos, entry.division);
    const falta = faltaParaWordFalla(d);
    if (falta) throw faltanDatos(falta);
    blob = await generarWordFalla(d);
    nombre = nombreArchivoFalla(d);
  } else if (entry.tipo === 'mantenimiento' && esPreventiva(entry.datos)) {
    const estado = estadoInicialPreventiva(entry.datos, entry.division);
    const falta = faltaParaWordPreventiva(estado);
    if (falta) throw faltanDatos(falta);
    const d = armarDatosPreventiva(estado, entry.division);
    blob = await generarPreventivaWord(d);
    nombre = nombreArchivoPreventiva(d);
  } else if (entry.tipo === 'mantenimiento') {
    const d = datosMantenimientoDeBorrador(entry.datos, entry.division);
    const falta = faltaParaWordMantenimiento(d);
    if (falta) throw faltanDatos(falta);
    blob = await generarWordMantenimiento(d);
    nombre = nombreArchivoMantenimiento(d);
  } else {
    throw new Error('Este borrador no tiene un Word para descargar.');
  }
  saveAs(blob, nombre);
  void registrarActividad('word_generado', nombre, entry.id);
  return nombre;
}
