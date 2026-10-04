// Recursos que se reutilizan al generar los Word (Mantenimiento y Falla).
//
// Nada de esto cambia el documento: solo evita trabajo repetido.
//  - La librería `docx` y los logos se cargan una sola vez (y se pueden precargar al abrir el
//    formulario), en vez de descargarlos/convertirlos en cada clic de "Generar".
//  - Las fotos se descargan todas en paralelo antes de armar el documento (antes se bajaban de a
//    una o dos, esperando cada descarga) y quedan en caché por si se genera de nuevo.

import logoPsinet from "../assets/logo_psinet.jpg";
import logoEdificio from "../assets/LogoEdificio.png";
import { urlToBase64, dataUrlToUint8Array, resolveImageBytes } from './imagenes';

let docxPromise: Promise<typeof import("docx")> | null = null;

/** Módulo `docx`, descargado una sola vez. */
export function cargarDocx(): Promise<typeof import("docx")> {
  if (!docxPromise) {
    docxPromise = import("docx");
    docxPromise.catch(() => { docxPromise = null; });
  }
  return docxPromise;
}

export interface LogosInforme {
  logoBytes: Uint8Array;
  logoType: "png" | "jpg";
  coverBytes: Uint8Array;
  coverType: "png" | "jpg";
}

let logosPromise: Promise<LogosInforme> | null = null;

/** Logo PSINet y foto de portada, convertidos igual que antes (mismos bytes y tipo), una sola vez. */
export function logosInforme(): Promise<LogosInforme> {
  if (!logosPromise) {
    logosPromise = (async () => {
      const [logoDataUrl, coverDataUrl] = await Promise.all([urlToBase64(logoPsinet), urlToBase64(logoEdificio)]);
      return {
        logoBytes: dataUrlToUint8Array(logoDataUrl),
        logoType: logoDataUrl.startsWith("data:image/png") ? "png" : "jpg",
        coverBytes: dataUrlToUint8Array(coverDataUrl),
        coverType: coverDataUrl.startsWith("data:image/png") ? "png" : "jpg",
      } as LogosInforme;
    })();
    logosPromise.catch(() => { logosPromise = null; });
  }
  return logosPromise;
}

/** Precarga en segundo plano lo necesario para generar el Word (al abrir el formulario). */
export function precargarGeneracionWord(): void {
  const precargar = () => { void cargarDocx().catch(() => {}); void logosInforme().catch(() => {}); };
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    window.requestIdleCallback(precargar, { timeout: 3000 });
  } else {
    setTimeout(precargar, 1000);
  }
}

type BytesImagen = { bytes: Uint8Array; type: "png" | "jpg" };

// Caché por URL (las dataURL no se guardan: son las fotos recién cargadas y ocuparían mucha memoria).
const cacheImagenes = new Map<string, Promise<BytesImagen>>();
const CACHE_MAX = 80;

/** Igual que resolveImageBytes (mismo resultado), pero con caché para las fotos ya subidas a la nube. */
export function bytesDeImagen(src: string): Promise<BytesImagen> {
  if (src.startsWith("data:")) return resolveImageBytes(src);
  let p = cacheImagenes.get(src);
  if (!p) {
    p = resolveImageBytes(src);
    p.catch(() => cacheImagenes.delete(src));
    cacheImagenes.set(src, p);
    if (cacheImagenes.size > CACHE_MAX) {
      const primera = cacheImagenes.keys().next().value;
      if (primera !== undefined) cacheImagenes.delete(primera);
    }
  }
  return p;
}

/**
 * Resuelve todas las fotos en paralelo y devuelve un mapa src → bytes. Se usa antes de armar el
 * documento, para que la construcción (que va en orden) no espere cada descarga por separado.
 */
export async function resolverImagenes(srcs: (string | null | undefined)[]): Promise<Map<string, BytesImagen>> {
  const unicas = [...new Set(srcs.filter((s): s is string => Boolean(s)))];
  const resultados = await Promise.all(unicas.map(src => bytesDeImagen(src)));
  return new Map(unicas.map((src, i) => [src, resultados[i]]));
}
