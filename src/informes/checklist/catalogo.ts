// Checklist de Camioneta (GSSO-LTE-R-LV-DSAL-29 · Registro lista de verificación de camioneta).
//
// Cada ítem indica dónde va en la plantilla Word original (tabla, fila y primera columna de los
// 8 días), así el documento generado mantiene exactamente el formato del registro oficial.
import { sumarDias } from '../../datos/fechas';
import { semanaDeFecha } from '../../datos/turnos';

/** Marca de un ítem en un día: ✓ (positiva), X (negativa) o vacío. */
export type Marca = '' | 'ok' | 'x';
/** Respuesta a las preguntas de aptitud: SI / NO / vacío. */
export type Respuesta = '' | 'SI' | 'NO';

export interface ItemChecklist {
  id: string;
  nombre: string;
  /** Posición en la plantilla: índice de tabla, fila y columna del primer día. */
  tabla: number;
  fila: number;
  col: number;
}

export interface SeccionChecklist {
  id: string;
  titulo: string;
  items: ItemChecklist[];
}

const items = (prefijo: string, tabla: number, primeraFila: number, col: number, nombres: string[]): ItemChecklist[] =>
  nombres.map((nombre, i) => ({ id: `${prefijo}-${i + 1}`, nombre, tabla, fila: primeraFila + i, col }));

export const SECCIONES: SeccionChecklist[] = [
  {
    id: 'documentos',
    titulo: 'Documentos del vehículo / conductor',
    items: items('doc', 1, 2, 1, [
      'Permiso de circulación', 'Revisión Técnica / Em. Gases', 'Seguro Obligatorio', 'Licencia Municipal', 'Licencia interna',
    ]),
  },
  {
    id: 'implementos',
    titulo: 'Implementos de seguridad',
    items: items('imp', 2, 1, 1, [
      'Cinturones de Seguridad', 'Botiquín', 'Triángulos Reflectantes', 'Bocina', 'Limpia parabrisas',
      'Espejo Retrovisor Derecho', 'Espejo Retrovisor Izquierdo', 'Chaleco reflectante', 'Alarma sonora de Retroceso',
      'Dispositivo CAS10', 'GPS', 'Barra Antivuelco Interna', 'Cintas Reflectantes', 'Dos Cuñas amarradas',
      'Malla o defensa de acero externa en luneta', 'Apoya Cabeza', 'Dos Cuñas amarradas', 'Extintor 1 Kg', 'Extintor 10 Kg',
    ]),
  },
  {
    id: 'luces',
    titulo: 'Luces',
    items: items('luz', 2, 1, 10, [
      'Frontal Alta', 'Frontal Baja', 'Freno', 'Tercera Luz de Freno', 'Retroceso', 'Intermitente Izquierdo',
      'Intermitente Derecho', 'Baliza Azul / capuchón', 'Pértiga', 'Foco Faenero', 'Estacionamiento',
    ]),
  },
  {
    id: 'neumaticos',
    titulo: 'Neumáticos',
    items: items('neu', 2, 13, 10, [
      'En buen Estado', 'Neumático repuesto es del mismo Aro + protección contra robo', 'Llave tuerca /Gata',
    ]),
  },
  {
    id: 'seguridad-activa',
    titulo: 'Seguridad activa',
    items: items('sa', 2, 17, 10, [
      'Estado de Frenos', 'Estado de la Dirección', 'Alineamiento y balanceo', 'Verificación de Niveles (Freno, Dirección, Refrigerante, etc.).',
    ]),
  },
  {
    id: 'otros',
    titulo: 'Otros',
    items: items('otr', 2, 21, 1, ['Aire acondicionado', 'Malla Carga']),
  },
  {
    id: 'invierno',
    titulo: 'Caja de operación de invierno',
    items: [
      ...items('inv', 2, 24, 1, [
        'Pala de Nieve', 'Cadenas Rompe hielo (4)', 'Estrobo 4m ½ ‘’ 2 Grilletes', 'Atornillador de cruz',
        'Atornillador de paleta', 'Alicate Universal', 'Fósforos y Velas',
      ]),
      ...items('inv', 2, 23, 10, [
        'Tensores para cadenas', 'Linterna con pilas', 'Saco de arpillera o yute (1)', 'Radio', 'Frazadas',
        'Cinturones de seguridad', 'Sal',
      ]).map((item, i) => ({ ...item, id: `inv-${8 + i}` })),
    ],
  },
];

export const TODOS_LOS_ITEMS: ItemChecklist[] = SECCIONES.flatMap(s => s.items);

/** Los 8 días del registro (columnas "M M J V S D L M"): el martes de llegada y la semana de turno (miércoles a martes). */
export const DIAS_CHECKLIST = 8;
export const ETIQUETAS_DIA = ['Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo', 'Lunes', 'Martes'];
export const INICIALES_DIA = ['M', 'M', 'J', 'V', 'S', 'D', 'L', 'M'];

/** Fechas de las 8 columnas a partir del inicio de la semana de turno (miércoles). */
export const fechasChecklist = (inicioSemana: string): string[] =>
  Array.from({ length: DIAS_CHECKLIST }, (_, i) => sumarDias(inicioSemana, i - 1));

export interface DatosChecklist {
  semanaInicio: string;
  letra: 'A' | 'B';
  conductor: string;
  marca: string;
  modelo: string;
  anio: string;
  patente: string;
  fechaUltimaMantencion: string;
  kmProximaMantencion: string;
  fechaControlLicencia: string;
  fechaExtintor: string;
  kmInicio: string;
  kmFin: string;
  /** Marca de cada ítem en cada uno de los 8 días. */
  marcas: Record<string, Marca[]>;
  aptitudes: { alcohol: Respuesta[]; aptitud: Respuesta[]; medicamento: Respuesta[] };
  medicamentoCual: string;
  dpf: string;
  limpiezaFiltro: string;
  /** Nombre del conductor que firma cada día. */
  firmas: string[];
  observaciones: string;
}

const vacios = <T,>(valor: T): T[] => Array.from({ length: DIAS_CHECKLIST }, () => valor);

export function checklistVacio(semanaInicio: string, letra: 'A' | 'B'): DatosChecklist {
  return {
    semanaInicio, letra, conductor: '',
    marca: '', modelo: '', anio: '', patente: '', fechaUltimaMantencion: '', kmProximaMantencion: '',
    fechaControlLicencia: '', fechaExtintor: '', kmInicio: '', kmFin: '',
    marcas: Object.fromEntries(TODOS_LOS_ITEMS.map(item => [item.id, vacios<Marca>('')])),
    aptitudes: { alcohol: vacios<Respuesta>(''), aptitud: vacios<Respuesta>(''), medicamento: vacios<Respuesta>('') },
    medicamentoCual: '', dpf: '', limpiezaFiltro: '', firmas: vacios(''), observaciones: '',
  };
}

/** Deja los datos (de la nube o de una versión anterior) siempre completos y con 8 días. */
export function normalizarChecklist(raw: unknown, semanaInicio: string, letra: 'A' | 'B'): DatosChecklist {
  const base = checklistVacio(semanaInicio, letra);
  const d = (raw ?? {}) as Partial<DatosChecklist>;
  const str = (v: unknown, def = '') => (typeof v === 'string' ? v : def);
  const arr = <T extends string>(v: unknown, validos: readonly T[]): T[] =>
    Array.from({ length: DIAS_CHECKLIST }, (_, i) => {
      const x = Array.isArray(v) ? v[i] : '';
      return (validos as readonly unknown[]).includes(x) ? x as T : validos[0];
    });
  const MARCAS = ['', 'ok', 'x'] as const;
  const RESP = ['', 'SI', 'NO'] as const;
  return {
    ...base,
    conductor: str(d.conductor), marca: str(d.marca), modelo: str(d.modelo), anio: str(d.anio), patente: str(d.patente),
    fechaUltimaMantencion: str(d.fechaUltimaMantencion), kmProximaMantencion: str(d.kmProximaMantencion),
    fechaControlLicencia: str(d.fechaControlLicencia), fechaExtintor: str(d.fechaExtintor),
    kmInicio: str(d.kmInicio), kmFin: str(d.kmFin),
    marcas: Object.fromEntries(TODOS_LOS_ITEMS.map(item => [item.id, arr<Marca>(d.marcas?.[item.id], MARCAS)])),
    aptitudes: {
      alcohol: arr<Respuesta>(d.aptitudes?.alcohol, RESP),
      aptitud: arr<Respuesta>(d.aptitudes?.aptitud, RESP),
      medicamento: arr<Respuesta>(d.aptitudes?.medicamento, RESP),
    },
    medicamentoCual: str(d.medicamentoCual), dpf: str(d.dpf), limpiezaFiltro: str(d.limpiezaFiltro),
    firmas: Array.from({ length: DIAS_CHECKLIST }, (_, i) => str(d.firmas?.[i])),
    observaciones: str(d.observaciones),
  };
}

/** Cuántos ítems y preguntas tiene completos un día (para el avance y el estado del panel). */
export function avanceDia(datos: DatosChecklist, dia: number): { hechos: number; total: number; negativos: number } {
  let hechos = 0; let negativos = 0;
  for (const item of TODOS_LOS_ITEMS) {
    const m = datos.marcas[item.id]?.[dia];
    if (m) hechos += 1;
    if (m === 'x') negativos += 1;
  }
  const respuestas = [datos.aptitudes.alcohol[dia], datos.aptitudes.aptitud[dia], datos.aptitudes.medicamento[dia]];
  hechos += respuestas.filter(Boolean).length;
  return { hechos, total: TODOS_LOS_ITEMS.length + 3, negativos };
}

/** Respuestas que obligan a avisar a la jefatura (pregunta 5 del registro). */
export const requiereAviso = (datos: DatosChecklist, dia: number) =>
  datos.aptitudes.alcohol[dia] === 'SI' || datos.aptitudes.medicamento[dia] === 'SI' || datos.aptitudes.aptitud[dia] === 'NO';

const normalizarPatente = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const clavePatente = normalizarPatente;

/** Estado del checklist de hoy para el panel principal: cuántas camionetas ya tienen el día completo. */
export function estadoChecklistDelDia(entradas: { fecha: string; datos: unknown }[], hoy: string, camionetasFijas: number): { texto: string; completo: boolean } {
  // Hoy puede ser el martes de llegada (primera columna de la semana siguiente) o un día de la semana en curso.
  const completas = new Set<string>();
  const iniciadas = new Set<string>();
  for (const semana of [semanaDeFecha(hoy), semanaDeFecha(sumarDias(hoy, 1))]) {
    const dia = fechasChecklist(semana.inicio).indexOf(hoy);
    if (dia < 0) continue;
    for (const e of entradas) {
      if (e.fecha !== semana.inicio) continue;
      const d = normalizarChecklist(e.datos, semana.inicio, semana.letra);
      const a = avanceDia(d, dia);
      const clave = clavePatente(d.patente);
      if (a.hechos > 0) iniciadas.add(clave);
      if (a.hechos >= a.total) completas.add(clave);
    }
  }
  const total = Math.max(camionetasFijas, iniciadas.size);
  if (!iniciadas.size) return { texto: total ? `Hoy: pendiente (${total} camioneta${total === 1 ? '' : 's'})` : 'Hoy: pendiente', completo: false };
  return { texto: `Hoy: ${completas.size} de ${total} camionetas completas`, completo: completas.size >= total };
}
