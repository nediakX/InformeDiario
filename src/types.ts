// Tipos y utilidades de almacenamiento compartidos entre el generador de Informe Diario,
// la vista de Borradores y el generador de Informe de Cierre semanal.

import { supabase, BORRADORES_TABLE, EVIDENCIAS_BUCKET, BORRADORES_OTROS_TABLE } from './supabaseClient';

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

// ---------------------------------------------------------------------------------------
// Calendario de turnos 7x7 (Turno A / Turno B) e informes automáticos
// ---------------------------------------------------------------------------------------
// El Turno A trabaja 7 días, luego el Turno B otros 7, y se repite (ciclo de 14 días).
// TURNO_ANCLA_A es el primer día de una semana del Turno A. Según el calendario del equipo:
//   Turno A: 23-29 sep, 7-13 oct, 21-27 oct...   Turno B: 30 sep-6 oct, 14-20 oct, 28 oct-3 nov...
export const TURNO_ANCLA_A = "2026-09-23";
export const DIAS_POR_TURNO = 7;

// Qué informes aparecen (como borrador por completar) por cada día del turno.
export const TURNOS_AUTOMATICOS: ('dia' | 'noche')[] = ['dia', 'noche'];

export interface SemanaTurno {
  letra: 'A' | 'B';
  inicio: string; // ISO yyyy-mm-dd
  fin: string;
  dias: string[]; // los 7 días del turno
}

const DIA_MS = 86_400_000;
const isoToUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const sumarDias = (iso: string, n: number) =>
  new Date(isoToUtc(iso) + n * DIA_MS).toISOString().slice(0, 10);

/** Fecha de hoy según la hora local del dispositivo (toISOString() usa UTC y en Chile cambia de día a las 20-21 h). */
export const hoyLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Turno de trabajo que está en curso ahora: Día 08:00-20:00 o Noche 20:00-08:00.
 * `fecha` es el día en que empezó el turno: entre las 00:00 y las 08:00 la noche en curso
 * empezó el día anterior, así que su informe pertenece a esa fecha.
 */
export const turnoEnCurso = (ahora: Date = new Date()): { fecha: string; turno: 'dia' | 'noche' } => {
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`;
  const hora = ahora.getHours();
  if (hora >= 8 && hora < 20) return { fecha: hoy, turno: 'dia' };
  if (hora >= 20) return { fecha: hoy, turno: 'noche' };
  return { fecha: sumarDias(hoy, -1), turno: 'noche' };
};

const crearSemana = (letra: 'A' | 'B', inicio: string): SemanaTurno => ({
  letra,
  inicio,
  fin: sumarDias(inicio, DIAS_POR_TURNO - 1),
  dias: Array.from({ length: DIAS_POR_TURNO }, (_, i) => sumarDias(inicio, i)),
});

/** Ciclo de 14 días que contiene la fecha: los 7 días del Turno A seguidos de los 7 días del Turno B. */
export const cicloDeFecha = (iso: string): { A: SemanaTurno; B: SemanaTurno } => {
  const largo = DIAS_POR_TURNO * 2;
  const diff = Math.round((isoToUtc(iso) - isoToUtc(TURNO_ANCLA_A)) / DIA_MS);
  const inicio = sumarDias(TURNO_ANCLA_A, Math.floor(diff / largo) * largo);
  return { A: crearSemana('A', inicio), B: crearSemana('B', sumarDias(inicio, DIAS_POR_TURNO)) };
};

/** Semana de turno (con su letra) a la que pertenece una fecha. */
export const semanaDeFecha = (iso: string): SemanaTurno => {
  const ciclo = cicloDeFecha(iso);
  return iso <= ciclo.A.fin ? ciclo.A : ciclo.B;
};

export const letraDeFecha = (iso: string) => semanaDeFecha(iso).letra;

export const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export const nombreDiaSemana = (iso: string) => {
  if (!iso) return "";
  return DIAS_SEMANA[new Date(isoToUtc(iso)).getUTCDay()];
};

/** "23 sep" */
export const formatDiaMes = (iso: string) => {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
};

/** UUID válido y siempre igual para la misma semilla (para que dos dispositivos no dupliquen los borradores automáticos). */
export function uuidDeterministico(seed: string): string {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < seed.length; i++) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  const hex = [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
    .map(n => n.toString(16).padStart(8, "0"))
    .join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${"89ab"[parseInt(hex[16], 16) % 4]}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const idBorradorAutomatico = (fecha: string, letra: string, turno: 'dia' | 'noche') =>
  uuidDeterministico(`psinet-auto|${fecha}|${letra}|${turno}`);

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
}

// ---------------------------------------------------------------------------------------
// Borradores "genéricos" (Mantenimiento de Generador e Informe de Falla — Carro)
// ---------------------------------------------------------------------------------------
// Igual que los borradores de Informe Diario (compartidos en la nube, en tiempo real, con las
// fotos subidas al bucket de evidencias), pero con una sola tabla para los dos tipos: el
// formulario completo de cada uno se guarda tal cual en la columna "datos" (JSONB), así no hace
// falta crear ni mantener una tabla nueva cada vez que un informe agregue o cambie un campo.

export type TipoInformeOtro = 'mantenimiento' | 'falla';

export interface BorradorOtroEntry<T = Record<string, unknown>> {
  id: string;
  tipo: TipoInformeOtro;
  /** Texto corto para identificar el informe en la lista (ej: sitio, o carro + tipo de falla). */
  titulo: string;
  fecha: string;
  datos: T;
  savedAt: string;
}

type BorradorOtroRow = {
  id: string;
  tipo: TipoInformeOtro;
  titulo: string | null;
  fecha: string;
  datos: Record<string, unknown> | null;
  saved_at: string;
};

const rowToOtroEntry = (row: BorradorOtroRow): BorradorOtroEntry => ({
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

/** Recorre cualquier objeto/arreglo y sube al bucket cada foto todavía en dataURL (deja las que ya son URL intactas). */
async function subirFotosEnObjeto<T>(valor: T, folder: string): Promise<T> {
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