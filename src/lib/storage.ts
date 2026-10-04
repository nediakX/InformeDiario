// Fotos en la nube (bucket "evidencias" de Supabase): subida con reintentos, borrado y
// reemplazo de la copia local (dataURL) por la URL ya subida.

import { supabase, EVIDENCIAS_BUCKET } from './supabase';
import { dataUrlToUint8Array } from './imagenes';

const esperar = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const SUBIDA_INTENTOS = 3;

/**
 * Sube al bucket público las fotos nuevas (dataURL) de un borrador; deja intactas las que ya son URL.
 * Reintenta hasta 3 veces (la señal en faena es intermitente). Si aun así falla, LANZA el error:
 * antes devolvía la foto en base64 y esa foto (varios MB) quedaba guardada dentro de la base de datos.
 * Quien llama muestra el aviso, y la foto sigue en el respaldo local para reintentar en el próximo guardado.
 */
export async function uploadPhotoIfNeeded(photo: string | null, folder: string): Promise<string | null> {
  if (!photo) return photo;
  if (!photo.startsWith("data:")) return photo;
  const isPng = photo.startsWith("data:image/png");
  const bytes = dataUrlToUint8Array(photo);
  const path = `${folder}/${crypto.randomUUID()}.${isPng ? "png" : "jpg"}`;
  let ultimoError: unknown = null;
  for (let intento = 1; intento <= SUBIDA_INTENTOS; intento++) {
    const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(path, bytes, {
      contentType: isPng ? "image/png" : "image/jpeg",
      upsert: true,
    });
    if (!error) {
      const { data } = supabase.storage.from(EVIDENCIAS_BUCKET).getPublicUrl(path);
      return data.publicUrl;
    }
    ultimoError = error;
    if (intento < SUBIDA_INTENTOS) await esperar(1000 * intento);
  }
  console.error("No se pudo subir una foto a la nube:", ultimoError);
  throw ultimoError instanceof Error ? ultimoError : new Error("No se pudo subir una foto a la nube");
}

/**
 * Borra del bucket todas las fotos de una carpeta (p. ej. al eliminar un borrador), para que el
 * almacenamiento no crezca para siempre con fotos huérfanas. Si falla, solo se registra: el borrador
 * ya se eliminó y no vale la pena molestar al usuario por esto.
 */
export async function borrarCarpetaFotos(folder: string): Promise<void> {
  try {
    const bucket = supabase.storage.from(EVIDENCIAS_BUCKET);
    for (;;) {
      const { data, error } = await bucket.list(folder, { limit: 100 });
      if (error) throw error;
      const archivos = (data ?? []).filter(item => item.id).map(item => `${folder}/${item.name}`);
      if (!archivos.length) return;
      const { error: errorBorrado } = await bucket.remove(archivos);
      if (errorBorrado) throw errorBorrado;
      if (archivos.length < 100) return;
    }
  } catch (error) {
    console.warn(`No se pudieron borrar las fotos de ${folder}:`, error);
  }
}

/** Recorre cualquier objeto/arreglo y sube al bucket cada foto todavía en dataURL (deja las que ya son URL intactas). */
export async function subirFotosEnObjeto<T>(valor: T, folder: string): Promise<T> {
  if (Array.isArray(valor)) {
    return Promise.all(valor.map(item => subirFotosEnObjeto(item, folder))) as unknown as T;
  }
  if (typeof valor === "string") {
    if (valor.startsWith("data:image")) {
      return (await uploadPhotoIfNeeded(valor, folder)) as unknown as T;
    }
    return valor;
  }
  if (valor && typeof valor === "object") {
    const entradas = await Promise.all(
      Object.entries(valor as Record<string, unknown>).map(async ([clave, v]) => [clave, await subirFotosEnObjeto(v, folder)] as const)
    );
    return Object.fromEntries(entradas) as T;
  }
  return valor;
}

// ---------------------------------------------------------------------------------------
// Fotos ya subidas: reemplazar la copia local (dataURL) por su URL en la nube
// ---------------------------------------------------------------------------------------
// Al guardar, las fotos nuevas se suben al bucket y el guardado devuelve sus URLs. Si el formulario
// sigue guardando la dataURL, el siguiente autoguardado la vuelve a subir (con otro nombre): cada
// tecla tras cargar fotos subía TODAS las fotos otra vez. Con estas dos funciones el formulario
// cambia cada dataURL ya subida por su URL, y los guardados siguientes ya no suben nada.

/** Recorre lo que se envió y lo que se guardó (misma forma) y arma el mapa dataURL → URL subida. */
export function mapaFotosSubidas(enviado: unknown, guardado: unknown, mapa = new Map<string, string>()): Map<string, string> {
  if (typeof enviado === "string") {
    if (enviado.startsWith("data:image") && typeof guardado === "string" && guardado !== enviado && !guardado.startsWith("data:")) {
      mapa.set(enviado, guardado);
    }
  } else if (Array.isArray(enviado) && Array.isArray(guardado)) {
    enviado.forEach((v, i) => mapaFotosSubidas(v, guardado[i], mapa));
  } else if (enviado && typeof enviado === "object" && guardado && typeof guardado === "object") {
    for (const [clave, v] of Object.entries(enviado as Record<string, unknown>)) {
      mapaFotosSubidas(v, (guardado as Record<string, unknown>)[clave], mapa);
    }
  }
  return mapa;
}

/**
 * Devuelve `valor` con cada dataURL del mapa cambiada por su URL. Si no cambia nada devuelve el
 * MISMO objeto (así React no vuelve a renderizar ni a disparar otro autoguardado).
 */
export function aplicarFotosSubidas<T>(valor: T, mapa: Map<string, string>): T {
  if (!mapa.size) return valor;
  if (typeof valor === "string") return (mapa.get(valor) ?? valor) as T;
  if (Array.isArray(valor)) {
    let cambio = false;
    const nuevo = valor.map(v => { const r = aplicarFotosSubidas(v, mapa); if (r !== v) cambio = true; return r; });
    return (cambio ? nuevo : valor) as T;
  }
  if (valor && typeof valor === "object") {
    let cambio = false;
    const nuevo: Record<string, unknown> = {};
    for (const [clave, v] of Object.entries(valor as Record<string, unknown>)) {
      const r = aplicarFotosSubidas(v, mapa);
      if (r !== v) cambio = true;
      nuevo[clave] = r;
    }
    return (cambio ? nuevo : valor) as T;
  }
  return valor;
}
