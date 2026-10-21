// Métricas de las actividades de los Informes Diarios (pestaña "Actividades" del panel de administración).
// Cada actividad escrita en un informe se agrupa con las que son la misma aunque estén escritas
// distinto (ver lib/similitudActividades.ts) y se clasifica:
//  - Rutinaria: viene de la plantilla del turno o aparece en la mayoría de los informes (registros diarios).
//  - Repetida: no es de rutina y se hizo en 2 o más informes (ej. la misma falla o mantención otra vez).
//  - Única: se registró en un solo informe.
import { type BorradorEntry, esSemillaSinEditar } from '../datos/borradoresDiario';
import { DEFAULT_ACTIVIDADES_DIA, actividadesNoche } from '../informes/diario/constantes';
import { categoriaDe, mismaActividad, normalizarActividad, CATEGORIAS, type ActividadNormalizada, type Categoria } from '../lib/similitudActividades';
import type { Division } from '../datos/divisiones';
import type { Barra } from './datos';

export type TipoActividad = 'rutinaria' | 'repetida' | 'unica';

export interface GrupoActividad {
  /** Nombre más usado. */
  nombre: string;
  categoria: Categoria;
  tipo: TipoActividad;
  /** Veces que aparece (contando todas las formas de escribirla). */
  veces: number;
  /** Informes distintos en que aparece. */
  informes: number;
  dia: number;
  noche: number;
  primera: string;
  ultima: string;
  /** Otras formas en que se escribió, con cuántas veces. */
  variantes: { texto: string; veces: number }[];
  /** Veces que quedó escrita 2 o más veces en un mismo informe. */
  duplicadaEnInforme: number;
}

export interface MetricasActividades {
  informes: number;
  registradas: number;
  distintas: number;
  rutinarias: { grupos: number; veces: number };
  repetidas: { grupos: number; veces: number };
  unicas: number;
  /** Nombres escritos distinto que se reconocieron como la misma actividad. */
  unificadas: number;
  duplicadasEnInforme: number;
  promedioPorInforme: number;
  operativasPorInforme: number;
  porCategoria: Barra[];
  topRepetidas: Barra[];
  grupos: GrupoActividad[];
}

interface Grupo {
  base: ActividadNormalizada;
  textos: Map<string, number>;
  informes: Set<string>;
  dia: number; noche: number;
  fechas: string[];
  duplicada: number;
  plantilla: boolean;
}

/** El informe que vale de cada día y turno (si se guardó más de uno, el último editado). */
function informesDelPeriodo(diarios: BorradorEntry[]): BorradorEntry[] {
  const porTurno = new Map<string, BorradorEntry>();
  for (const b of diarios) {
    if (esSemillaSinEditar(b)) continue; // automático que nadie abrió: no tiene actividades propias
    const clave = `${b.fecha}|${b.turno}`;
    const previo = porTurno.get(clave);
    if (!previo || b.savedAt > previo.savedAt) porTurno.set(clave, b);
  }
  return [...porTurno.values()];
}

export function calcularMetricasActividades(diarios: BorradorEntry[], division: Division): MetricasActividades {
  const informes = informesDelPeriodo(diarios);
  const plantilla = [...DEFAULT_ACTIVIDADES_DIA, ...actividadesNoche(division)].map(normalizarActividad);
  const grupos: Grupo[] = [];
  const cache = new Map<string, Grupo>(); // mismo texto exacto → mismo grupo (evita recomparar)

  const grupoDe = (texto: string): Grupo => {
    const exacto = cache.get(texto);
    if (exacto) return exacto;
    const n = normalizarActividad(texto);
    let g = grupos.find(x => mismaActividad(x.base, n));
    if (!g) {
      g = { base: n, textos: new Map(), informes: new Set(), dia: 0, noche: 0, fechas: [], duplicada: 0, plantilla: plantilla.some(p => mismaActividad(p, n)) };
      grupos.push(g);
    }
    cache.set(texto, g);
    return g;
  };

  let registradas = 0;
  let duplicadas = 0;
  for (const inf of informes) {
    const enEste = new Map<Grupo, number>();
    for (const bruto of inf.actividades ?? []) {
      const texto = bruto.trim().replace(/\s+/g, ' ');
      if (!texto) continue;
      registradas++;
      const g = grupoDe(texto);
      g.textos.set(texto, (g.textos.get(texto) ?? 0) + 1);
      enEste.set(g, (enEste.get(g) ?? 0) + 1);
    }
    for (const [g, n] of enEste) {
      g.informes.add(inf.id);
      if (inf.turno === 'noche') g.noche++; else g.dia++;
      g.fechas.push(inf.fecha);
      if (n > 1) { g.duplicada += n - 1; duplicadas += n - 1; }
    }
  }

  // Rutinaria: de la plantilla, o presente en al menos el 60 % de los informes de su turno (mín. 3).
  const informesDia = informes.filter(i => i.turno !== 'noche').length;
  const informesNoche = informes.length - informesDia;
  const esRutinaria = (g: Grupo) => g.plantilla
    || (g.informes.size >= 3 && ((informesDia && g.dia / informesDia >= 0.6) || (informesNoche && g.noche / informesNoche >= 0.6)));

  const resultado: GrupoActividad[] = grupos.map(g => {
    const textos = [...g.textos.entries()].sort((a, b) => b[1] - a[1]);
    const fechas = [...g.fechas].sort();
    const tipo: TipoActividad = esRutinaria(g) ? 'rutinaria' : g.informes.size >= 2 ? 'repetida' : 'unica';
    return {
      nombre: textos[0][0],
      categoria: categoriaDe(g.base),
      tipo,
      veces: textos.reduce((n, [, v]) => n + v, 0),
      informes: g.informes.size,
      dia: g.dia,
      noche: g.noche,
      primera: fechas[0],
      ultima: fechas[fechas.length - 1],
      variantes: textos.slice(1).map(([texto, veces]) => ({ texto, veces })),
      duplicadaEnInforme: g.duplicada,
    };
  }).sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre));

  const suma = (lista: GrupoActividad[]) => lista.reduce((n, g) => n + g.veces, 0);
  const rutinarias = resultado.filter(g => g.tipo === 'rutinaria');
  const repetidas = resultado.filter(g => g.tipo === 'repetida');
  const operativas = resultado.filter(g => g.tipo !== 'rutinaria');

  const porCategoria = new Map<Categoria, number>();
  for (const g of operativas) porCategoria.set(g.categoria, (porCategoria.get(g.categoria) ?? 0) + g.veces);

  return {
    informes: informes.length,
    registradas,
    distintas: resultado.length,
    rutinarias: { grupos: rutinarias.length, veces: suma(rutinarias) },
    repetidas: { grupos: repetidas.length, veces: suma(repetidas) },
    unicas: resultado.filter(g => g.tipo === 'unica').length,
    unificadas: resultado.reduce((n, g) => n + g.variantes.length, 0),
    duplicadasEnInforme: duplicadas,
    promedioPorInforme: informes.length ? registradas / informes.length : 0,
    operativasPorInforme: informes.length ? suma(operativas) / informes.length : 0,
    porCategoria: CATEGORIAS.filter(c => porCategoria.get(c)).map(c => ({ etiqueta: c, valor: porCategoria.get(c)! }))
      .sort((a, b) => b.valor - a.valor),
    topRepetidas: repetidas.slice(0, 8).map(g => ({ etiqueta: g.nombre, valor: g.veces, detalle: `${g.informes} informes · último ${g.ultima.slice(8, 10)}/${g.ultima.slice(5, 7)}` })),
    grupos: resultado,
  };
}
