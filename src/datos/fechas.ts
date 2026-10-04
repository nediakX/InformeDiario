// Fechas en formato ISO (yyyy-mm-dd) y sus formatos en español.

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

export const DIA_MS = 86_400_000;

export const isoToUtc = (iso: string) => {
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
