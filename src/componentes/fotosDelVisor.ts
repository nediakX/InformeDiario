// Qué abre el visor de fotos: la foto tocada y, si se quiere recorrer, todas las del mismo bloque.

/** Una foto del bloque, con su leyenda (opcional) para mostrarla en el visor. */
export interface FotoDelVisor {
  src: string;
  leyenda?: string;
}

/** Lo que se le pasa al visor. Sin `fotos` (o con una sola) se ve solo esa foto, como antes. */
export interface FotoAmpliada {
  src: string;
  /** Todas las fotos del bloque, en orden y sin casillas vacías. */
  fotos?: FotoDelVisor[];
  /** Posición de la foto tocada dentro de `fotos`. */
  indice?: number;
  /** Nombre del bloque (se muestra arriba del visor). */
  titulo?: string;
}

/**
 * Arma lo que abre el visor desde una casilla de fotos: la foto tocada y todas las del mismo bloque
 * (las casillas vacías se saltan). `leyendas` va en el mismo orden que las casillas.
 */
export function fotoConBloque(
  casillas: readonly (string | null | undefined)[],
  indiceTocado: number,
  titulo?: string,
  leyendas?: readonly (string | null | undefined)[],
): FotoAmpliada {
  const fotos: FotoDelVisor[] = [];
  let indice = 0;
  casillas.forEach((src, i) => {
    if (!src) return;
    if (i === indiceTocado) indice = fotos.length;
    fotos.push({ src, leyenda: leyendas?.[i]?.trim() || undefined });
  });
  return { src: casillas[indiceTocado] || fotos[indice]?.src || '', fotos, indice, titulo: titulo?.trim() || undefined };
}
