import { supabase, BORRADORES_OTROS_TABLE } from '../lib/supabase';
import type { Division } from './divisiones';
import { type EstadoBorrador } from './borradoresDiario';
import { borrarCarpetaFotos, subirFotosEnObjeto } from '../lib/storage';
import { EVENTO_SINCRONIZADO, eliminarConCola, guardarConCola, listaConCambiosLocales, registrarEjecutor } from '../lib/sincronizacion';

// ---------------------------------------------------------------------------------------
// Borradores "genéricos" (Mantenimiento de Generador e Informe de Falla — Carro)
// ---------------------------------------------------------------------------------------
// Igual que los borradores de Informe Diario (compartidos en la nube, en tiempo real, con las
// fotos subidas al bucket de evidencias), pero con una sola tabla para los dos tipos: el
// formulario completo de cada uno se guarda tal cual en la columna "datos" (JSONB), así no hace
// falta crear ni mantener una tabla nueva cada vez que un informe agregue o cambie un campo.

export type TipoInformeOtro = 'mantenimiento' | 'falla' | 'cierre';

export interface BorradorOtroEntry<T = Record<string, unknown>> {
  id: string;
  tipo: TipoInformeOtro;
  /** Texto corto para identificar el informe en la lista (ej: sitio, o carro + tipo de falla). */
  titulo: string;
  fecha: string;
  datos: T;
  savedAt: string;
  /** División a la que pertenece el informe. */
  division: Division;
}

export type BorradorOtroRow = {
  id: string;
  tipo: TipoInformeOtro;
  titulo: string | null;
  fecha: string;
  datos: Record<string, unknown> | null;
  saved_at: string;
  division?: Division | null;
};

export const rowToOtroEntry = (row: BorradorOtroRow): BorradorOtroEntry => ({
  id: row.id,
  tipo: row.tipo,
  titulo: row.titulo ?? "",
  fecha: row.fecha,
  datos: row.datos ?? {},
  savedAt: row.saved_at,
  division: row.division ?? 'el_salvador',
});

const otroEntryToRow = (entry: BorradorOtroEntry): BorradorOtroRow => ({
  id: entry.id,
  tipo: entry.tipo,
  titulo: entry.titulo,
  fecha: entry.fecha,
  datos: entry.datos,
  saved_at: entry.savedAt,
  division: entry.division,
});

/** Trae los borradores compartidos de un tipo (mantenimiento o falla), del más reciente al más antiguo. */
// Sin conexión se usa la última lista descargada + los cambios guardados en este dispositivo.
export async function fetchBorradoresOtros(tipo: TipoInformeOtro, division: Division): Promise<BorradorOtroEntry[]> {
  return listaConCambiosLocales<BorradorOtroEntry>(
    `cache_borradores_otros_${tipo}_${division}`,
    async () => {
      const { data, error } = await supabase
        .from(BORRADORES_OTROS_TABLE)
        .select("*")
        .eq("tipo", tipo)
        .eq("division", division)
        .order("saved_at", { ascending: false });
      if (error) throw error;
      return (data as BorradorOtroRow[]).map(rowToOtroEntry);
    },
    "borradores_otros",
    entry => entry.tipo === tipo && entry.division === division,
    (a, b) => b.savedAt.localeCompare(a.savedAt),
  );
}

/**
 * Guarda el borrador: sube las fotos pendientes (dondequiera que estén dentro de "datos") y lo
 * guarda en la nube. Sin conexión queda en la cola de este dispositivo y se sube al volver la señal.
 */
export function upsertBorradorOtro(entry: BorradorOtroEntry): Promise<BorradorOtroEntry> {
  return guardarConCola("borradores_otros", entry.id, entry, upsertBorradorOtroNube);
}

async function upsertBorradorOtroNube(entry: BorradorOtroEntry): Promise<BorradorOtroEntry> {
  const datos = await subirFotosEnObjeto(entry.datos, `borradores-otros/${entry.id}`);
  const conFotosSubidas: BorradorOtroEntry = { ...entry, datos };
  const { error } = await supabase.from(BORRADORES_OTROS_TABLE).upsert(otroEntryToRow(conFotosSubidas));
  if (error) throw error;
  return conFotosSubidas;
}

/** Elimina un borrador compartido de Mantenimiento/Falla/Cierre (afecta a todos los dispositivos). Sin conexión, queda en cola. */
export function deleteBorradorOtro(id: string): Promise<void> {
  return eliminarConCola("borradores_otros", id, deleteBorradorOtroNube);
}

async function deleteBorradorOtroNube(id: string): Promise<void> {
  const { error } = await supabase.from(BORRADORES_OTROS_TABLE).delete().eq("id", id);
  if (error) throw error;
  void borrarCarpetaFotos(`borradores-otros/${id}`);
  // El Informe de Cierre sube sus fotos a "cierre/<id>" (si la carpeta no existe, no pasa nada).
  void borrarCarpetaFotos(`cierre/${id}`);
}

registrarEjecutor("borradores_otros", {
  guardar: entry => upsertBorradorOtroNube(entry as BorradorOtroEntry),
  eliminar: deleteBorradorOtroNube,
});

/** Escucha cambios en tiempo real de un tipo (mantenimiento o falla) y refresca la lista. */
export function subscribeBorradoresOtros(tipo: TipoInformeOtro, division: Division, onChange: (list: BorradorOtroEntry[]) => void): () => void {
  const channel = supabase
    .channel(`borradores-otros-sync-${tipo}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: BORRADORES_OTROS_TABLE, filter: `tipo=eq.${tipo}` }, () => {
      // Realtime admite un solo filtro (tipo); la división se filtra al volver a pedir la lista.
      void fetchBorradoresOtros(tipo, division).then(onChange);
    })
    .subscribe();
  // Al terminar de subir cambios hechos sin conexión, la lista se refresca (fotos ya en la nube).
  const alSincronizar = () => { void fetchBorradoresOtros(tipo, division).then(onChange); };
  window.addEventListener(EVENTO_SINCRONIZADO, alSincronizar);
  return () => { window.removeEventListener(EVENTO_SINCRONIZADO, alSincronizar); void supabase.removeChannel(channel); };
}

/** Cuenta fotos dentro de "datos" buscando cualquier campo llamado "photo" (así lo nombran Mantenimiento y Falla). */
export const contarFotosGenerico = (datos: unknown): { total: number; llenas: number } => {
  let total = 0;
  let llenas = 0;
  const recorrer = (nodo: unknown) => {
    if (Array.isArray(nodo)) { nodo.forEach(recorrer); return; }
    if (nodo && typeof nodo === "object") {
      const obj = nodo as Record<string, unknown>;
      if ("photo" in obj) {
        total += 1;
        if (obj.photo) llenas += 1;
      }
      Object.values(obj).forEach(recorrer);
    }
  };
  recorrer(datos);
  return { total, llenas };
};

/** Igual que estadoBorrador, pero para los borradores genéricos (Mantenimiento/Falla). */
export const estadoBorradorGenerico = (datos: unknown): EstadoBorrador => {
  const { total, llenas } = contarFotosGenerico(datos);
  if (llenas === 0) return 'pendiente';
  return total > 0 && llenas >= total ? 'finalizado' : 'iniciado';
};
