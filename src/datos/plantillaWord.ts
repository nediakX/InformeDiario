// Constantes compartidas por las plantillas Word (colores y bloque fijo Vertiv del Turno Noche).

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
