// Respaldo local del informe en curso (en este dispositivo), guardado en IndexedDB.
//
// Antes se usaba localStorage, que admite ~5 MB por sitio: con 2-3 fotos ya se llenaba y el
// respaldo dejaba de guardarse sin avisar (si se caía la señal, se perdía el trabajo).
// IndexedDB admite cientos de MB. Si no está disponible (modo privado antiguo), se usa localStorage.

const DB_NOMBRE = "psinet-informes";
const STORE = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

function abrirDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") { reject(new Error("IndexedDB no disponible")); return; }
      const req = indexedDB.open(DB_NOMBRE, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function operacion<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return abrirDb().then(db => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, modo);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/** Lee un valor. Si nunca se guardó en IndexedDB, intenta con el respaldo antiguo en localStorage (migración). */
export async function leerLocal<T>(clave: string): Promise<T | null> {
  try {
    const valor = await operacion<T | undefined>("readonly", s => s.get(clave));
    if (valor !== undefined) return valor;
  } catch (error) {
    console.warn("IndexedDB no disponible, se usa localStorage:", error);
  }
  try {
    const raw = localStorage.getItem(clave);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

/** Guarda un valor. Devuelve false si no se pudo guardar en ningún lado (para avisar al usuario). */
export async function guardarLocal(clave: string, valor: unknown): Promise<boolean> {
  try {
    await operacion("readwrite", s => s.put(valor, clave));
    // Ya está en IndexedDB: se borra la copia antigua de localStorage para liberar espacio.
    try { localStorage.removeItem(clave); } catch { /* sin acceso a localStorage */ }
    return true;
  } catch (error) {
    console.warn("No se pudo guardar en IndexedDB, se intenta localStorage:", error);
  }
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch (error) {
    console.error("No se pudo guardar el respaldo local:", error);
    return false;
  }
}

export async function borrarLocal(clave: string): Promise<void> {
  try { localStorage.removeItem(clave); } catch { /* sin acceso a localStorage */ }
  try { await operacion("readwrite", s => s.delete(clave)); } catch { /* sin IndexedDB */ }
}
