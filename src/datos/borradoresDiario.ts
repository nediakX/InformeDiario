// Informe Diario: tipos y sincronización en la nube (Supabase) de los borradores compartidos.

import { supabase, BORRADORES_TABLE } from '../lib/supabase';
import type { Division } from './divisiones';
import { borrarCarpetaFotos, uploadPhotoIfNeeded } from '../lib/storage';
import { EVENTO_SINCRONIZADO, eliminarConCola, guardarConCola, listaConCambiosLocales, registrarEjecutor } from '../lib/sincronizacion';

export interface PersonalItemLike {
  nombre: string;
  cargo: string;
}

export interface EvidenceBlockLike {
  id: string;
  title: string;
  photos: (string | null)[];
  isActivity?: boolean;
  isFixed?: boolean;
  actIndex?: number;
  photoCount?: number;
}

export interface BorradorEntry {
  id: string;
  turno: 'dia' | 'noche';
  fecha: string;
  faena: string;
  letraTurno: string;
  contrato: string;
  version: string;
  servicio: string;
  creadoNombre: string;
  creadoCargo: string;
  revisadoText: string;
  autorizadoNombre: string;
  autorizadoCargo: string;
  personal: PersonalItemLike[];
  actividades: string[];
  observaciones: string[];
  evidenceBlocks: EvidenceBlockLike[];
  vertivCarroPhotos: (string | null)[];
  vertivItemPhotos: (string | null)[];
  savedAt: string;
  /** División a la que pertenece el informe. */
  division: Division;
}

export const LS_KEY_BORRADORES = "psinet_borradores_v1";

// --- Sincronización en la nube (Supabase): todo el equipo comparte los mismos borradores ---

export type BorradorRow = {
  id: string;
  turno: 'dia' | 'noche';
  fecha: string;
  faena: string | null;
  letra_turno: string | null;
  contrato: string | null;
  version: string | null;
  servicio: string | null;
  creado_nombre: string | null;
  creado_cargo: string | null;
  revisado_text: string | null;
  autorizado_nombre: string | null;
  autorizado_cargo: string | null;
  personal: PersonalItemLike[] | null;
  actividades: string[] | null;
  observaciones: string[] | null;
  evidence_blocks: EvidenceBlockLike[] | null;
  vertiv_carro_photos: (string | null)[] | null;
  vertiv_item_photos: (string | null)[] | null;
  saved_at: string;
  division?: Division | null;
};

export const rowToEntry = (row: BorradorRow): BorradorEntry => ({
  id: row.id,
  turno: row.turno,
  fecha: row.fecha,
  faena: row.faena ?? "",
  letraTurno: row.letra_turno ?? "",
  contrato: row.contrato ?? "",
  version: row.version ?? "",
  servicio: row.servicio ?? "",
  creadoNombre: row.creado_nombre ?? "",
  creadoCargo: row.creado_cargo ?? "",
  revisadoText: row.revisado_text ?? "",
  autorizadoNombre: row.autorizado_nombre ?? "",
  autorizadoCargo: row.autorizado_cargo ?? "",
  personal: row.personal ?? [],
  actividades: row.actividades ?? [],
  observaciones: row.observaciones ?? [],
  evidenceBlocks: row.evidence_blocks ?? [],
  vertivCarroPhotos: row.vertiv_carro_photos ?? [],
  vertivItemPhotos: row.vertiv_item_photos ?? [],
  savedAt: row.saved_at,
  division: row.division ?? 'el_salvador',
});

const entryToRow = (entry: BorradorEntry) => ({
  id: entry.id,
  turno: entry.turno,
  fecha: entry.fecha,
  faena: entry.faena,
  letra_turno: entry.letraTurno,
  contrato: entry.contrato,
  version: entry.version,
  servicio: entry.servicio,
  creado_nombre: entry.creadoNombre,
  creado_cargo: entry.creadoCargo,
  revisado_text: entry.revisadoText,
  autorizado_nombre: entry.autorizadoNombre,
  autorizado_cargo: entry.autorizadoCargo,
  personal: entry.personal,
  actividades: entry.actividades,
  observaciones: entry.observaciones,
  evidence_blocks: entry.evidenceBlocks,
  vertiv_carro_photos: entry.vertivCarroPhotos,
  vertiv_item_photos: entry.vertivItemPhotos,
  saved_at: entry.savedAt,
  division: entry.division,
});

/** Trae los borradores compartidos de una división (todos los dispositivos ven lo mismo). */
// Sin conexión se usa la última lista descargada + los cambios guardados en este dispositivo.
export async function fetchBorradores(division: Division): Promise<BorradorEntry[]> {
  return listaConCambiosLocales<BorradorEntry>(
    `cache_borradores_${division}`,
    async () => {
      const { data, error } = await supabase
        .from(BORRADORES_TABLE)
        .select("*")
        .eq("division", division)
        .order("fecha", { ascending: true });
      if (error) throw error;
      return (data as BorradorRow[]).map(rowToEntry);
    },
    "borradores",
    entry => entry.division === division,
    (a, b) => a.fecha.localeCompare(b.fecha),
  );
}

const uploadPhotoArray = (photos: (string | null)[], folder: string) =>
  Promise.all(photos.map(photo => uploadPhotoIfNeeded(photo, folder)));

/**
 * Guarda el borrador: sube las fotos pendientes y lo guarda en la nube. Sin conexión queda en la
 * cola de este dispositivo (con sus fotos) y se sube solo al volver la señal.
 */
export function upsertBorrador(entry: BorradorEntry): Promise<BorradorEntry> {
  return guardarConCola("borradores", entry.id, entry, upsertBorradorNube);
}

async function upsertBorradorNube(entry: BorradorEntry): Promise<BorradorEntry> {
  const evidenceBlocks = await Promise.all(entry.evidenceBlocks.map(async block => ({
    ...block,
    photos: await uploadPhotoArray(block.photos, `borradores/${entry.id}`),
  })));
  const vertivCarroPhotos = await uploadPhotoArray(entry.vertivCarroPhotos, `borradores/${entry.id}`);
  const vertivItemPhotos = await uploadPhotoArray(entry.vertivItemPhotos, `borradores/${entry.id}`);

  const withUploadedPhotos: BorradorEntry = { ...entry, evidenceBlocks, vertivCarroPhotos, vertivItemPhotos };

  const { error } = await supabase.from(BORRADORES_TABLE).upsert(entryToRow(withUploadedPhotos));
  if (error) throw error;
  return withUploadedPhotos;
}

/** Elimina un borrador compartido (afecta a todos los dispositivos). Sin conexión, queda en cola. */
export function deleteBorrador(id: string): Promise<void> {
  return eliminarConCola("borradores", id, deleteBorradorNube);
}

async function deleteBorradorNube(id: string): Promise<void> {
  const { error } = await supabase.from(BORRADORES_TABLE).delete().eq("id", id);
  if (error) throw error;
  void borrarCarpetaFotos(`borradores/${id}`);
}

registrarEjecutor("borradores", {
  guardar: entry => upsertBorradorNube(entry as BorradorEntry),
  eliminar: deleteBorradorNube,
});

/** Escucha cambios en tiempo real: cuando alguien crea/edita/borra un borrador en otro dispositivo, refresca la lista. */
export function subscribeBorradores(division: Division, onChange: (list: BorradorEntry[]) => void): () => void {
  // Nombre único por suscripción: dos vistas (Dashboard/App e Informe de Cierre) pueden
  // estar montadas a la vez, y reusar el mismo topic hace fallar el segundo `.subscribe()`.
  const channel = supabase
    .channel(`borradores-sync-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: BORRADORES_TABLE, filter: `division=eq.${division}` }, () => {
      void fetchBorradores(division).then(onChange);
    })
    .subscribe();
  // Al terminar de subir cambios hechos sin conexión, la lista se refresca (fotos ya en la nube).
  const alSincronizar = () => { void fetchBorradores(division).then(onChange); };
  window.addEventListener(EVENTO_SINCRONIZADO, alSincronizar);
  return () => { window.removeEventListener(EVENTO_SINCRONIZADO, alSincronizar); void supabase.removeChannel(channel); };
}

/** Marca de guardado de los borradores "vacíos" que se mostraban antes de tener fotos; sirve para reconocerlos y limpiarlos. */
export const savedAtSemilla = (fecha: string) => `${fecha}T00:00:00.000Z`;

/** true = borrador vacío autogenerado que nadie ha editado (no es un informe real guardado por una persona). */
export const esSemillaSinEditar = (entry: BorradorEntry) =>
  new Date(entry.savedAt).getTime() === new Date(savedAtSemilla(entry.fecha)).getTime();

/** Fotos del informe: total de espacios y cuántos están llenos. Vertiv (12 carros + 7 ítems) solo cuenta en Turno Noche. */
export const contarFotos = (entry: BorradorEntry) => {
  const bloques = entry.evidenceBlocks;
  let total = bloques.reduce((n, b) => n + b.photos.length, 0);
  let llenas = bloques.reduce((n, b) => n + b.photos.filter(Boolean).length, 0);
  if (entry.turno === 'noche') {
    total += entry.vertivCarroPhotos.length + entry.vertivItemPhotos.length;
    llenas += entry.vertivCarroPhotos.filter(Boolean).length + entry.vertivItemPhotos.filter(Boolean).length;
  }
  return { total, llenas };
};

export type EstadoBorrador = 'pendiente' | 'iniciado' | 'finalizado';

/** Pendiente: sin fotos. Iniciado: al menos una foto. Finalizado: todas las fotos cargadas. */
export const estadoBorrador = (entry: BorradorEntry): EstadoBorrador => {
  const { total, llenas } = contarFotos(entry);
  if (llenas === 0) return 'pendiente';
  return llenas >= total ? 'finalizado' : 'iniciado';
};

/** Elimina varios borradores de la nube de una sola vez. */
export async function deleteBorradores(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const { error } = await supabase.from(BORRADORES_TABLE).delete().in("id", ids);
  if (error) throw error;
  ids.forEach(id => { void borrarCarpetaFotos(`borradores/${id}`); });
}
