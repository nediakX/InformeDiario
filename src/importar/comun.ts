// Utilidades compartidas por los importadores de Word.
import { CONFIG_DIVISION, type Division } from '../datos/divisiones';
import { comprimirDataUrl } from '../lib/fotos';
import { normalizar, type Celda, type Tabla } from './leerDocx';

/**
 * A qué división pertenece el documento: se cuentan los textos propios de cada una (faena, cliente,
 * carros…). Si no hay cómo saberlo, se usa la división actual.
 */
export function detectarDivision(textoCompleto: string, actual: Division): Division {
  const texto = normalizar(textoCompleto);
  const puntaje = (d: Division) => {
    const c = CONFIG_DIVISION[d];
    const marcas = [
      c.nombre, c.faena, c.mantenimiento.cliente, c.mantenimiento.minera,
      ...c.carros.flatMap(x => [x, x.replace(/_/g, ' ')]),
    ].map(normalizar).filter(m => m.length >= 3);
    return [...new Set(marcas)].reduce((n, m) => n + (texto.includes(m) ? 1 : 0), 0);
  };
  const otra: Division = actual === 'andina' ? 'el_salvador' : 'andina';
  return puntaje(otra) > puntaje(actual) ? otra : actual;
}

/** Fotos del Word → mismo tamaño y calidad que las que se cargan en la app. */
export const prepararFoto = (dataUrl: string) => comprimirDataUrl(dataUrl);

/** Fotos de una tabla (de izquierda a derecha y de arriba abajo); "(Sin … cargada)" cuenta como espacio vacío. */
export function fotosDeCeldas(celdas: Celda[]): (string | null)[] {
  const fotos: (string | null)[] = [];
  for (const c of celdas) {
    if (c.imagenes.length) fotos.push(...c.imagenes);
    else if (c.textos.some(t => /^\(sin (evidencia|foto|imagen)/i.test(t))) fotos.push(null);
  }
  return fotos;
}

/** Una fila de una sola celda, sin imágenes y con texto: la leyenda de un bloque de fotos. */
export const esFilaLeyenda = (fila: Celda[]) =>
  fila.length === 1 && fila[0].imagenes.length === 0 && fila[0].textos.length > 0
  && !fila[0].textos.some(t => /^\(sin (evidencia|foto|imagen)/i.test(t));

/** Pares "Etiqueta | Valor" de una tabla de 2 columnas (ej: la tabla REGISTRO). */
export function paresDeTabla(t: Tabla): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const fila of t.filas) {
    if (fila.length >= 2) mapa.set(normalizar(fila[0].textos.join(' ')), fila[1].textos.join('\n'));
  }
  return mapa;
}

/** Comprime en paralelo todas las fotos (dataURL) de una lista, dejando los null. */
export const prepararFotos = (fotos: (string | null)[]) =>
  Promise.all(fotos.map(f => (f ? prepararFoto(f) : Promise.resolve(null))));
