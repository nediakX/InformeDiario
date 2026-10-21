// ¿Dos actividades escritas distinto son la misma? Se usa para contar actividades en el panel de
// administración sin que "Mantención preventiva LTE_CMF_08" y "Mantenimiento preventivo LTE CMF 08."
// cuenten como dos cosas, pero sí separando "… LTE_CMF_08" de "… LTE_CMF_09".
//
// Cómo decide:
//  1. Se normaliza el texto: minúsculas, sin tildes, sin fechas ni puntuación, sin palabras de relleno
//     ("de", "la", "se", "realiza"…), plurales simples y sinónimos ("mantención" = "mantenimiento").
//  2. Se separan los IDENTIFICADORES (códigos de sitio o carro, patentes y números): deben coincidir
//     exactamente. Si cambian, es otra actividad (otro sitio, otra camioneta).
//  3. Las palabras se comparan con tolerancia a errores de tipeo (una o dos letras distintas, o una
//     abreviatura de 5+ letras) y basta con que coincidan en su gran mayoría (≥ 75 %), sin importar el orden.

const RELLENO = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'al', 'con', 'para', 'por', 'un', 'una', 'se', 'su', 'sus',
  'e', 'o', 'u', 'que', 'lo', 'le', 'realiza', 'realizan', 'realizo', 'realizada', 'realizado', 'efectua', 'efectuo',
  'hace', 'hizo', 'segun', 'sobre', 'diaria', 'diario', 'dia', 'turno',
]);

const SINONIMOS: Record<string, string> = {
  mantencion: 'mantenimiento', mantenciones: 'mantenimiento', mantenimientos: 'mantenimiento', mant: 'mantenimiento',
  prev: 'preventivo', preventiva: 'preventivo', correctiva: 'correctivo',
  chequeo: 'revision', verificacion: 'revision', revisar: 'revision', verificar: 'revision',
  generador: 'gg', generadores: 'gg', grupo: 'gg', electrogeno: 'gg',
  camioneta: 'vehiculo', camionetas: 'vehiculo',
  reportabilidad: 'reporte', reportes: 'reporte', reportar: 'reporte',
  atencion: 'atencion', atender: 'atencion',
  administrativas: 'administrativa', administrativos: 'administrativa', administrativo: 'administrativa',
};

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

function raiz(p: string): string {
  if (SINONIMOS[p]) return SINONIMOS[p];
  let r = p;
  if (r.length > 4 && r.endsWith('es') && /[rldnzc]es$/.test(r)) r = r.slice(0, -2);
  else if (r.length > 3 && r.endsWith('s') && !r.endsWith('ss')) r = r.slice(0, -1);
  return SINONIMOS[r] ?? r;
}

export interface ActividadNormalizada {
  /** Identificadores que deben coincidir exactamente (sitios, carros, patentes, números). */
  ids: string[];
  /** Palabras significativas, ya normalizadas. */
  palabras: string[];
}

export function normalizarActividad(texto: string): ActividadNormalizada {
  const ids: string[] = [];
  const guardar = (id: string) => { ids.push(id); return ' '; };
  // Patentes (VCTF 84, TZYJ-98): en mayúsculas en el texto original, para no confundirlas con palabras.
  let t = sinTildes(texto).replace(/\b([A-Z]{4})[\s-]?(\d{2})\b/g, (_m, l: string, n: string) => guardar(`${l.toLowerCase()}${n}`)).toLowerCase();
  // Fechas y horas: no cambian la actividad ("Mantenimiento GG (13-10-2026)").
  t = t.replace(/\b\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\b/g, ' ').replace(/\b\d{1,2}:\d{2}\b/g, ' ');
  t = t.replace(/check[\s-]*list/g, 'checklist');
  // Códigos de sitio / carro: LTE_CMF_08, LTE CMM 3, CMF-09, MMOO 01, Light_12, TPGS-46…
  t = t.replace(/\b(?:lte[\s_-]*)?(cm[fm]|mmoo|cm[\s_-]*mmoo|light|tpgs)[\s_-]*0*(\d{1,3})\b/g, (_m, tipo: string, n: string) => guardar(`${tipo.replace(/[\s_-]/g, '')}${Number(n)}`));
  t = t.replace(/\blte[\s_-]*0*(\d{1,3})\b/g, (_m, n: string) => guardar(`lte${Number(n)}`));
  // Modelos (L200).
  t = t.replace(/\b([a-z])(\d{2,4})\b/g, (_m, l: string, n: string) => guardar(`${l}${n}`));
  // Números sueltos (cantidades, N° de equipo).
  t = t.replace(/\b0*(\d+)\b/g, (_m, n: string) => guardar(String(Number(n))));
  const palabras = t.split(/[^a-zñ]+/).filter(p => p.length > 1 && !RELLENO.has(p)).map(raiz).filter(p => !RELLENO.has(p));
  return { ids: [...new Set(ids)].sort(), palabras: [...new Set(palabras)] };
}

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = tmp;
    }
  }
  return fila[b.length];
}

const palabrasIguales = (a: string, b: string) => {
  if (a === b) return true;
  const corta = Math.min(a.length, b.length);
  if (corta >= 5 && (a.startsWith(b) || b.startsWith(a))) return true; // abreviatura: "mantenim" / "mantenimiento"
  if (corta >= 8) return distancia(a, b) <= 2;
  if (corta >= 5) return distancia(a, b) <= 1;
  return false;
};

/** Palabras que no cambian de qué se trata la actividad aunque sobren o falten. */
const GENERICAS = new Set(['general', 'sector', 'area', 'zona', 'equipo', 'sitio', 'carro', 'ubicacion', 'faena', 'actividad', 'tarea', 'trabajo', 'registro', 'control', 'servicio']);

function emparejar(a: string[], b: string[]) {
  const usadasB = new Set<number>();
  const sobranA: string[] = [];
  for (const p of a) {
    const k = b.findIndex((q, i) => !usadasB.has(i) && palabrasIguales(p, q));
    if (k >= 0) usadasB.add(k); else sobranA.push(p);
  }
  const sobranB = b.filter((_, i) => !usadasB.has(i));
  return { iguales: usadasB.size, sobranA, sobranB };
}

/** Parecido entre 0 y 1 de las palabras (sin importar el orden, con tolerancia a errores de tipeo). */
export function parecidoPalabras(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1;
  if (!a.length || !b.length) return 0;
  return (2 * emparejar(a, b).iguales) / (a.length + b.length);
}

export const UMBRAL_MISMA_ACTIVIDAD = 0.75;

export function mismaActividad(a: ActividadNormalizada, b: ActividadNormalizada): boolean {
  if (a.ids.join('|') !== b.ids.join('|')) return false;
  if (!a.palabras.length && !b.palabras.length) return true;
  if (!a.palabras.length || !b.palabras.length) return false;
  const { iguales, sobranA, sobranB } = emparejar(a.palabras, b.palabras);
  if ((2 * iguales) / (a.palabras.length + b.palabras.length) < UMBRAL_MISMA_ACTIVIDAD) return false;
  // Que a un nombre le sobre una palabra está bien ("Reunión inicio de turno" = "Registro de reunión
  // inicio de turno"); pero si cada uno tiene una palabra propia distinta, se cambió de qué se trata
  // ("Revisión de fibra…" ≠ "Instalación de fibra…", "status ENODO" ≠ "status energía").
  const propiasA = sobranA.filter(p => !GENERICAS.has(p));
  const propiasB = sobranB.filter(p => !GENERICAS.has(p));
  return !(propiasA.length && propiasB.length);
}

// ---------------------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------------------

export const CATEGORIAS = [
  'Fallas y atenciones', 'Mantenimiento', 'Generadores (GG)', 'Monitoreo', 'Redes y telecomunicaciones', 'Seguridad y registros',
  'Vehículos', 'Administrativas', 'Otras',
] as const;
export type Categoria = typeof CATEGORIAS[number];

const REGLAS: [Categoria, RegExp][] = [
  ['Fallas y atenciones', /^(falla|alarma|caida|corte|emergencia|reposicion|incidente|sin gestion|gestion|averia|atencion)$/],
  ['Mantenimiento', /^(mantenimiento|preventivo|correctivo|limpieza|reparacion|cambio|instalacion|lubricacion|ajuste)$/],
  ['Generadores (GG)', /^(gg|combustible|petroleo|diesel|horometro|relleno)$/],
  ['Monitoreo', /^(monitoreo|status|estado|enodo|vertiv|energia|rectificador)$/],
  ['Redes y telecomunicaciones', /^(fibra|optica|antena|enlace|radio|router|switch|red|nodo|lte|cableado|cable|senal|cobertura)$/],
  ['Seguridad y registros', /^(registro|reunion|art|checklist|autoevaluacion|fatiga|somnolencia|charla|hidratacion|solar|protector|proteccion|visibilidad|epp|inspeccion|entorno|riesgo|alerta)$/],
  ['Vehículos', /^(vehiculo|liviano|traslado|conduccion)$/],
  ['Administrativas', /^(administrativa|reporte|planificacion|confeccion|informe|tarea|coordinacion)$/],
];

export function categoriaDe(n: ActividadNormalizada): Categoria {
  for (const [cat, re] of REGLAS) if (n.palabras.some(p => re.test(p))) return cat;
  return 'Otras';
}
