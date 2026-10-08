// Ajuste automático de imágenes para los Word (informes de Andina).
//
// Cada imagen se mide (ancho × alto reales) y, según su formato, se decide cómo ponerla en la hoja
// para que se vea lo más grande posible SIN deformarse:
//  - Imágenes de formato parecido van de a 2 por fila (mitad del ancho cada una), a la misma altura.
//  - Si no combinan (una vertical junto a una panorámica) o son capturas muy anchas, van solas a
//    todo el ancho, para que ninguna quede diminuta.
//  - Horizontales quedan bajas: caben varias filas por hoja. Verticales (fotos de celular,
//    documentos) quedan altas, aprovechando el alto de la hoja.
//  - Si una fila no cabe en lo que queda de la hoja, se achica un poco (hasta 75 %) o pasa a una
//    hoja nueva.
//
// Medidas en puntos (pt). El Word usa carta (612 × 792 pt) con márgenes de 72 pt → 468 pt de ancho
// útil. El encabezado (tabla PSINet) baja el inicio del texto, por eso el alto útil es menor.

export interface ImagenMedida { src: string; ancho: number; alto: number }
/** Imagen ya dimensionada para el Word (en píxeles de docx: 1 px = 0,75 pt). */
export interface ImagenAjustada { src: string; anchoPx: number; altoPx: number }
export interface HojaImagenes { filas: ImagenAjustada[][] }

export interface OpcionesAjuste {
  /** Ancho útil de la tabla de fotos (pt). */
  anchoTotal?: number;
  /** Alto disponible para las fotos en una hoja (pt), ya descontados encabezado, leyenda y márgenes. */
  altoHoja?: number;
  /** Margen interno de cada celda (pt, por lado). */
  margenCelda?: number;
  /** Espacio que ocupa cada fila además de la foto (márgenes de celda + bordes, pt). */
  extraPorFila?: number;
  /** Máximo de imágenes por fila. */
  porFila?: number;
}

const PX_POR_PT = 1 / 0.75;

/** Lee el ancho y alto real de una imagen (dataURL o URL). */
export function medirImagen(src: string): Promise<ImagenMedida> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve({ src, ancho: img.naturalWidth || 4, alto: img.naturalHeight || 3 });
    // Si no se puede leer, se asume una foto horizontal 4:3 (no se pierde la imagen).
    img.onerror = () => resolve({ src, ancho: 4, alto: 3 });
    img.src = src;
  });
}

/**
 * Distribuye las imágenes en hojas y filas, y calcula el tamaño de cada una según su formato.
 * Función pura (no lee imágenes): recibe las medidas ya tomadas.
 */
export function distribuirImagenes(imagenes: ImagenMedida[], opciones: OpcionesAjuste = {}): HojaImagenes[] {
  const {
    anchoTotal = 468, altoHoja = 520, margenCelda = 5, extraPorFila = 12, porFila = 2,
  } = opciones;
  if (imagenes.length === 0) return [];

  // Alto común de una fila: el mayor que permita que todas sus imágenes quepan en su celda y en la hoja.
  const altoDeFila = (grupo: ImagenMedida[]) => {
    const anchoCelda = anchoTotal / grupo.length - margenCelda * 2;
    return Math.min(altoHoja, ...grupo.map(img => anchoCelda / (img.ancho / img.alto)));
  };
  // ¿Conviene poner estas imágenes juntas en una fila? Solo si cada una aprovecha bien su celda
  // (≥ 75 % del ancho: así una vertical no queda diminuta al lado de una panorámica) y la fila no
  // queda demasiado baja (≥ 110 pt: capturas muy anchas se leen mejor solas a todo el ancho).
  const combinan = (grupo: ImagenMedida[]) => {
    const anchoCelda = anchoTotal / grupo.length - margenCelda * 2;
    const alto = altoDeFila(grupo);
    return alto >= 110 && grupo.every(img => (alto * img.ancho) / img.alto >= anchoCelda * 0.75);
  };

  // 1) Filas: se agrupan de a `porFila` las imágenes consecutivas que combinan; las demás van
  //    solas, a todo el ancho.
  const grupos: ImagenMedida[][] = [];
  for (let i = 0; i < imagenes.length;) {
    let tomadas = 1;
    for (let n = Math.min(porFila, imagenes.length - i); n > 1; n--) {
      if (combinan(imagenes.slice(i, i + n))) { tomadas = n; break; }
    }
    grupos.push(imagenes.slice(i, i + tomadas));
    i += tomadas;
  }

  // 2) Tamaño de cada fila: misma altura para todas sus imágenes, sin deformarlas.
  const filas = grupos.map(grupo => {
    const proporciones = grupo.map(img => img.ancho / img.alto);
    const alto = altoDeFila(grupo);
    return grupo.map((img, k) => ({
      src: img.src,
      anchoPt: alto * proporciones[k],
      altoPt: alto,
    }));
  });

  // 3) Hojas: se llenan con filas mientras quepan. Si una fila no cabe por poco (achicándola hasta
  //    un 75 % sí cabe), se achica un poco en vez de mandarla sola a una hoja nueva.
  const hojas: { filas: typeof filas; usado: number }[] = [];
  for (const fila of filas) {
    const actual = hojas[hojas.length - 1];
    const libre = actual ? altoHoja + extraPorFila - actual.usado - extraPorFila : 0;
    const alto = fila[0].altoPt;
    if (actual && alto <= libre) {
      actual.filas.push(fila);
      actual.usado += alto + extraPorFila;
    } else if (actual && alto * 0.75 <= libre) {
      const escala = libre / alto;
      actual.filas.push(fila.map(img => ({ ...img, anchoPt: img.anchoPt * escala, altoPt: img.altoPt * escala })));
      actual.usado += libre + extraPorFila;
    } else {
      hojas.push({ filas: [fila], usado: alto + extraPorFila });
    }
  }

  return hojas.map(hoja => ({
    filas: hoja.filas.map(fila => fila.map(img => ({
      src: img.src,
      anchoPx: Math.round(img.anchoPt * PX_POR_PT),
      altoPx: Math.round(img.altoPt * PX_POR_PT),
    }))),
  }));
}

/** Mide las imágenes y las distribuye (atajo de las dos funciones anteriores). */
export async function ajustarImagenes(fuentes: string[], opciones?: OpcionesAjuste): Promise<HojaImagenes[]> {
  const medidas = await Promise.all(fuentes.map(medirImagen));
  return distribuirImagenes(medidas, opciones);
}
