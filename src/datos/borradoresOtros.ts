import { supabase, BORRADORES_OTROS_TABLE } from '../lib/supabase';
import { type EstadoBorrador } from './borradoresDiario';
import { borrarCarpetaFotos, subirFotosEnObjeto } from '../lib/storage';

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
}

export type BorradorOtroRow = {
  id: string;
  tipo: TipoInformeOtro;
  titulo: string | null;
  fecha: string;
  datos: Record<string, unknown> | null;
  saved_at: string;
};

export const rowToOtroEntry = (row: BorradorOtroRow): BorradorOtroEntry => ({
  id: row.id,
  tipo: row.tipo,
  titulo: row.titulo ?? "",
  fecha: row.fecha,
  datos: row.datos ?? {},
  savedAt: row.saved_at,
});

const otroEntryToRow = (entry: BorradorOtroEntry): BorradorOtroRow => ({
  id: entry.id,
  tipo: entry.tipo,
  titulo: entry.titulo,
  fecha: entry.fecha,
  datos: entry.datos,
  saved_at: entry.savedAt,
});

/** Trae los borradores compartidos de un tipo (mantenimiento o falla), del más reciente al más antiguo. */
export async function fetchBorradoresOtros(tipo: TipoInformeOtro): Promise<BorradorOtroEntry[]> {
  const { data, error } = await supabase
    .from(BORRADORES_OTROS_TABLE)
    .select("*")
    .eq("tipo", tipo)
    .order("saved_at", { ascending: false });
  if (error) {
    console.error(`No se pudieron cargar los borradores de ${tipo} desde la nube:`, error);
    return [];
  }
  return (data as BorradorOtroRow[]).map(rowToOtroEntry);
}

/** Sube las fotos pendientes (dondequiera que estén dentro de "datos") y guarda/actualiza el borrador en la nube. */
export async function upsertBorradorOtro(entry: BorradorOtroEntry): Promise<BorradorOtroEntry> {
  const datos = await subirFotosEnObjeto(entry.datos, `borradores-otros/${entry.id}`);
  const conFotosSubidas: BorradorOtroEntry = { ...entry, datos };
  const { error } = await supabase.from(BORRADORES_OTROS_TABLE).upsert(otroEntryToRow(conFotosSubidas));
  if (error) throw error;
  return conFotosSubidas;
}

/** Elimina un borrador compartido de Mantenimiento/Falla (afecta a todos los dispositivos). */
export async function deleteBorradorOtro(id: string): Promise<void> {
  const { error } = await supabase.from(BORRADORES_OTROS_TABLE).delete().eq("id", id);
  if (error) throw error;
  void borrarCarpetaFotos(`borradores-otros/${id}`);
  // El Informe de Cierre sube sus fotos a "cierre/<id>" (si la carpeta no existe, no pasa nada).
  void borrarCarpetaFotos(`cierre/${id}`);
}

/** Escucha cambios en tiempo real de un tipo (mantenimiento o falla) y refresca la lista. */
export function subscribeBorradoresOtros(tipo: TipoInformeOtro, onChange: (list: BorradorOtroEntry[]) => void): () => void {
  const channel = supabase
    .channel(`borradores-otros-sync-${tipo}-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: BORRADORES_OTROS_TABLE, filter: `tipo=eq.${tipo}` }, () => {
      void fetchBorradoresOtros(tipo).then(onChange);
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
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
