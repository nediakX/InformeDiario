// Tipos y utilidades de almacenamiento compartidos entre el generador de Informe Diario,
// la vista de Borradores y el generador de Informe de Cierre semanal.

import { supabase, BORRADORES_TABLE, EVIDENCIAS_BUCKET } from './supabaseClient';

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
}

export const LS_KEY_BORRADORES = "psinet_borradores_v1";

// --- Sincronización en la nube (Supabase): todo el equipo comparte los mismos borradores ---

type BorradorRow = {
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
};

const rowToEntry = (row: BorradorRow): BorradorEntry => ({
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
});

/** Trae todos los borradores compartidos desde la nube (todos los dispositivos ven lo mismo). */
export async function fetchBorradores(): Promise<BorradorEntry[]> {
  const { data, error } = await supabase
    .from(BORRADORES_TABLE)
    .select("*")
    .order("fecha", { ascending: true });
  if (error) {
    console.error("No se pudieron cargar los borradores desde la nube:", error);
    return [];
  }
  return (data as BorradorRow[]).map(rowToEntry);
}

/** Sube al bucket público las fotos nuevas (dataURL) de un borrador; deja intactas las que ya son URL. */
async function uploadPhotoIfNeeded(photo: string | null, folder: string): Promise<string | null> {
  if (!photo) return photo;
  if (photo.startsWith("http")) return photo;
  const isPng = photo.startsWith("data:image/png");
  const bytes = dataUrlToUint8Array(photo);
  const path = `${folder}/${crypto.randomUUID()}.${isPng ? "png" : "jpg"}`;
  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(path, bytes, {
    contentType: isPng ? "image/png" : "image/jpeg",
    upsert: false,
  });
  if (error) {
    console.error("No se pudo subir una foto a la nube:", error);
    return photo;
  }
  const { data } = supabase.storage.from(EVIDENCIAS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

const uploadPhotoArray = (photos: (string | null)[], folder: string) =>
  Promise.all(photos.map(photo => uploadPhotoIfNeeded(photo, folder)));

/** Sube las fotos pendientes y guarda (crea o actualiza) el borrador compartido en la nube. */
export async function upsertBorrador(entry: BorradorEntry): Promise<BorradorEntry> {
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

/** Elimina un borrador compartido (afecta a todos los dispositivos). */
export async function deleteBorrador(id: string): Promise<void> {
  const { error } = await supabase.from(BORRADORES_TABLE).delete().eq("id", id);
  if (error) throw error;
}

/** Escucha cambios en tiempo real: cuando alguien crea/edita/borra un borrador en otro dispositivo, refresca la lista. */
export function subscribeBorradores(onChange: (list: BorradorEntry[]) => void): () => void {
  // Nombre único por suscripción: dos vistas (Dashboard/App e Informe de Cierre) pueden
  // estar montadas a la vez, y reusar el mismo topic hace fallar el segundo `.subscribe()`.
  const channel = supabase
    .channel(`borradores-sync-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: BORRADORES_TABLE }, () => {
      void fetchBorradores().then(onChange);
    })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

/** Convierte una imagen (dataURL o URL remota) a bytes, para insertarla en el .docx. */
export async function resolveImageBytes(src: string): Promise<{ bytes: Uint8Array; type: 'png' | 'jpg' }> {
  const response = await fetch(src);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return { bytes: new Uint8Array(buffer), type: blob.type.includes("png") ? "png" : "jpg" };
}

export const dataUrlToUint8Array = (dataUrl: string) => {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

export const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const BLUE = "156082";
export const ORANGE = "ED7D31";

// Bloque fijo "Verificación de la Gestión en Planta Rectificadora Vertiv" — solo turno NOCHE.
// Vive aquí (no solo en App.tsx) para que el Informe de Cierre pueda reproducirlo también.
export const VERTIV_TITLE = "Verificación de la Gestión en Planta Rectificadora Vertiv";

export const VERTIV_CARROS: [string, string][] = [
  ["Carro LTE CMF 01", "Carro LTE CMF 02"],
  ["Carro LTE CMM 03", "Carro LTE CMF 04"],
  ["Carro LTE CMM 05", "Carro LTE CMM 06"],
  ["Carro LTE CMM 07", "Carro LTE CMF 08"],
  ["Carro LTE CMF 09", "Carro LTE CMM 10"],
  ["Carro LTE CMF 11", "Carro MMOO 01"],
];

export const VERTIV_CARROS_FLAT: string[] = VERTIV_CARROS.flat();

export const VERTIV_ITEMS: string[] = [
  "Estado de Vertiv ICMP (administración remota)",
  "E-Nodos B ICMP Response Time (Latencia).",
  "Voltaje del sistema LTE.",
  "Voltaje de los bancos de baterías.",
  "Monitoreo de la Corriente sistema LTE Dsal.",
  "Monitoreo de la descarga total de los bancos de baterías.",
  "Monitoreo del status de las temperaturas en los gabinetes batería.",
];

export const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export const formatFechaLarga = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} del ${y}`;
};

export const formatFechaCorta = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
};

export const formatFechaPunto = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
};
