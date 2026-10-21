// Mantención preventiva de sitio (carro LTE): datos del formulario y valores por defecto.
// La estructura sigue el informe de referencia "Reporte_mantencion_preventiva_LTE_CMF_09_11-10-2026"
// (mismas secciones, mismas leyendas y mismo orden de fotos).
import { uid } from '../../lib/fotos';

/**
 * Cómo se muestra la foto en el Word:
 *  - par: dos por fila (si queda una sola al final, va sola y centrada).
 *  - doc: dos por fila, con más alto (documentos en papel: ART, charla, checklists).
 *  - grande: sola a lo ancho de la hoja.
 *  - consola: captura de pantalla a lo ancho, con título en negrita.
 */
export type FormatoFoto = 'par' | 'doc' | 'grande' | 'consola';

export interface FotoPrev {
  id: string;
  /** Clave estable de la casilla (para conservar la foto al cambiar cantidades). */
  k: string;
  formato: FormatoFoto;
  /** Línea en negrita sobre la descripción (vista general, consolas). */
  titulo: string;
  /** Texto que va después de "Descripción:" (en consolas, la segunda línea). */
  descripcion: string;
  /** Medición que va en negrita bajo la descripción (ej: "56,6 VDC"). undefined = la casilla no lleva medición. */
  valor?: string;
  photo: string | null;
}

export type ClaveSeccion =
  | 'vista' | 'documentacion' | 'fotovoltaico' | 'vertiv' | 'comunicaciones' | 'baterias' | 'medicion'
  | 'generador' | 'torre' | 'rodado' | 'dados' | 'vientos' | 'consolas' | 'extra';

export interface SeccionPrev {
  id: string;
  clave: ClaveSeccion;
  titulo: string;
  /** La vista general del sitio no lleva título en el informe de referencia. */
  mostrarTitulo: boolean;
  activa: boolean;
  /** Cantidad (bancos de baterías, dados de concreto…) para las secciones que se repiten. */
  cantidad?: number;
  /** Enlaces de MMOO revisados (sección de consolas). */
  enlaces?: string[];
  fotos: FotoPrev[];
}

export interface PersonaPrev { id: string; nombre: string; cargo: string; ejecutante: boolean }

export type ModoPersonal = 'turno' | 'ejecutantes' | 'manual';
export interface FilaBitacora {
  id: string;
  inicio: string;
  termino: string;
  actividades: string[];
  modoPersonal: ModoPersonal;
  /** Solo si modoPersonal = manual (un nombre por línea). */
  personalManual: string;
}

export interface DatosPreventiva {
  /** Distingue este informe de los de Mantenimiento de Generador (se guardan en la misma lista). */
  clase: 'preventiva';
  fecha: string;
  /** Código del sitio (ej: LTE_CMF_09). Se llama "sitio" para que el panel de administración lo cuente. */
  sitio: string;
  sector: string;
  coordenadas: string;
  creadoNombre: string;
  creadoCargo: string;
  revisados: string[];
  autorizadoNombre: string;
  autorizadoCargo: string;
  /** Ya no se usa: la portada es fija (la de los reportes originales). Se conserva por los borradores antiguos. */
  portada?: string | null;
  actividades: string[];
  cierreDescripcion: string;
  personal: PersonaPrev[];
  administrativas: string[];
  planificadas: string[];
  secciones: SeccionPrev[];
  bitacora: FilaBitacora[];
  /** Horas de la bitácora (lo único que cambia de un informe a otro en esa tabla). */
  horas?: HorasBitacora;
}

export interface HorasBitacora { planInicio: string; planTermino: string; mantInicio: string; mantTermino: string }
export const HORAS_DEFECTO: HorasBitacora = { planInicio: '08:00', planTermino: '09:00', mantInicio: '11:30', mantTermino: '13:00' };

export const esPreventiva = (datos: unknown): boolean =>
  !!datos && typeof datos === 'object' && (datos as Record<string, unknown>).clase === 'preventiva';

// ---------------------------------------------------------------------------------------
// Secciones y casillas
// ---------------------------------------------------------------------------------------

type Casilla = Omit<FotoPrev, 'id' | 'photo'>;
const c = (k: string, formato: FormatoFoto, descripcion: string, extra: Partial<Casilla> = {}): Casilla =>
  ({ k, formato, titulo: '', descripcion, ...extra });

/** "LTE_CMM_06" → "carro CMM-06"; "MMOO_01" → "MMOO-01" (como se escribe en el informe). */
export const nombreEnlace = (codigo: string) => {
  const limpio = codigo.trim().replace(/^LTE[_\s-]*/i, '').replace(/[_\s]+/g, '-');
  return /^MMOO/i.test(limpio) ? limpio.toUpperCase() : `carro ${limpio.toUpperCase()}`;
};

/** Casillas de cada sección (las que se repiten según la cantidad o los enlaces). */
export function casillasDe(clave: ClaveSeccion, cantidad = 0, enlaces: string[] = []): Casilla[] {
  const n = Array.from({ length: Math.max(0, cantidad) }, (_, i) => i + 1);
  switch (clave) {
    case 'vista':
      return [c('vista', 'grande', 'vista general del sitio.', { titulo: 'Vista general del sitio' })];
    case 'documentacion':
      return [
        c('art1', 'doc', 'ART de actividad realizada.'),
        c('art2', 'doc', 'ART de actividad realizada.'),
        c('charla', 'doc', 'charla de 5 minutos.'),
        c('entorno', 'doc', 'verificación de condición del entorno.'),
        c('chk-pinzas', 'doc', 'check list de Pinzas Amperimétricas.'),
        c('chk-soplador', 'doc', 'check list del soplador inalámbrico.'),
        c('chk-manuales', 'doc', 'check list de herramientas manuales.'),
        c('chk-hidro', 'doc', 'check list de hidro lavadora.'),
      ];
    case 'fotovoltaico':
      return [
        c('lat-antes', 'par', 'vista lateral de paneles solares antes de la limpieza.'),
        c('lat-despues', 'par', 'vista lateral de paneles solares después de la limpieza.'),
        c('fro-antes', 'par', 'vista frontal de paneles solares antes de la limpieza.'),
        c('fro-durante', 'par', 'vista frontal de paneles solares durante la limpieza.'),
        c('paneles-general', 'grande', 'vista general de paneles solares después del mantenimiento.', { titulo: 'Vista general de paneles solares con número de sitio' }),
      ];
    case 'vertiv':
      return [
        c('vertiv-antes', 'par', 'vista general de gabinete eléctrico antes de la limpieza.'),
        c('vertiv-despues', 'par', 'vista general de gabinete eléctrico después de la limpieza.'),
      ];
    case 'comunicaciones':
      return [
        c('com-antes', 'par', 'vista general de gabinete de comunicaciones antes de la limpieza.'),
        c('com-despues', 'par', 'vista general de gabinete de comunicaciones después de la limpieza.'),
      ];
    case 'baterias':
      return n.flatMap(i => [
        c(`bb${i}-antes`, 'par', `vista general de banco de baterías ${i} antes de la limpieza.`),
        c(`bb${i}-despues`, 'par', `vista general de banco de baterías ${i} después de la limpieza.`),
      ]);
    case 'medicion':
      return n.map(i => c(`med${i}`, 'par', `vista general de pinzas de multímetro haciendo contacto con bornes positivo y negativo de banco de baterías ${i}.`, { valor: '' }));
    case 'generador':
      return [
        c('gg-display1', 'par', 'Vista general de visualización de tensión, temperatura, presión de aceite y odómetro'),
        c('gg-display2', 'par', 'Vista general de visualización de partidas, odómetro y horas de funcionamiento.'),
        c('gg-general', 'grande', 'Revisión general del grupo generador.'),
        c('gg-aceite', 'par', 'Revisión de nivel de aceite.'),
        c('gg-filtro', 'par', 'Revisión del filtro de aire.'),
        c('gg-bat-standby', 'par', 'Se realiza medición de voltaje de batería con generador en stand by.', { valor: '' }),
        c('gg-bat-carga', 'par', 'Se realiza medición de voltaje de batería de generador con carga.', { valor: '' }),
        c('gg-combustible', 'par', 'Revisión de nivel de combustible.'),
        c('gg-refrigerante', 'par', 'Revisión de nivel del líquido refrigerante.'),
        c('gg-estanque', 'par', 'Limpieza exterior de estanque de combustible.'),
      ];
    case 'torre':
      return [
        c('torre', 'par', 'Chequeo visual de torre.'),
        c('antenas', 'par', 'Chequeo visual de antenas.'),
        c('levante', 'par', 'Chequeo visual de sistema de levante de la torre.'),
        c('levante-electrico', 'par', 'Chequeo visual de sistema eléctrico de levante de la torre.'),
      ];
    case 'rodado':
      return [
        c('rodado-izq', 'par', 'Chequeo visual del sistema de rodado del carro lado izquierdo.'),
        c('rodado-der', 'par', 'Chequeo visual del sistema de rodado del carro lado derecho.'),
        c('gancho', 'par', 'Chequeo de gancho de tiro del carro.'),
        c('nivel', 'par', 'Chequeo de nivel del carro.'),
      ];
    case 'dados':
      return n.flatMap(i => [
        c(`dado${i}-a`, 'par', `Chequeo visual de dado de concreto N°${i}.`),
        c(`dado${i}-b`, 'par', `Chequeo visual de dado de concreto N°${i}.`),
      ]);
    case 'vientos':
      return n.map(i => c(`viento${i}`, 'par', `Chequeo visual de vientos de dado de concreto N°${i}.`));
    case 'consolas':
      return [
        c('consola-vertiv', 'consola', '', { titulo: 'Vista general de planta Vertiv' }),
        c('consola-bts', 'consola', '', { titulo: 'Vista general de BTS Airscale' }),
        ...enlaces.filter(e => e.trim()).map(e => c(`mmoo-${e.trim().toLowerCase()}`, 'consola', `Enlace a ${e.trim()}.`, { titulo: 'Revisión de estado de MMOO' })),
      ];
    case 'extra':
      return [];
  }
}

const TITULOS: Record<ClaveSeccion, string> = {
  vista: 'Vista general del sitio',
  documentacion: 'Documentación',
  fotovoltaico: 'Mantención de sistema fotovoltaico',
  vertiv: 'Mantención de planta Vertiv',
  comunicaciones: 'Mantención de equipos de comunicaciones',
  baterias: 'Mantención de bancos de baterías',
  medicion: 'Medición de voltaje de flotación a bancos de baterías',
  generador: 'Inspección de grupo generador',
  torre: 'Inspección visual de torre y antenas',
  rodado: 'Inspección de sistema de rodado',
  dados: 'Inspección de dados de concreto',
  vientos: 'Inspección de sistema de vientos',
  consolas: 'Revisión de estatus en consolas.',
  extra: 'Otras fotos',
};

/** Qué cuenta la cantidad en las secciones que se repiten. */
export const CANTIDAD_DE: Partial<Record<ClaveSeccion, { etiqueta: string; defecto: number; max: number }>> = {
  baterias: { etiqueta: 'Bancos de baterías', defecto: 2, max: 8 },
  medicion: { etiqueta: 'Bancos medidos', defecto: 5, max: 8 },
  dados: { etiqueta: 'Dados de concreto', defecto: 3, max: 6 },
  vientos: { etiqueta: 'Vientos', defecto: 3, max: 6 },
};

const ORDEN: ClaveSeccion[] = ['vista', 'documentacion', 'fotovoltaico', 'vertiv', 'comunicaciones', 'baterias', 'medicion', 'generador', 'torre', 'rodado', 'dados', 'vientos', 'consolas'];

const conFoto = (x: Casilla): FotoPrev => ({ ...x, id: uid(), photo: null });

export function seccionesPorDefecto(conVertiv = true, enlaces: string[] = []): SeccionPrev[] {
  return ORDEN.map(clave => {
    const cant = CANTIDAD_DE[clave]?.defecto;
    return {
      id: uid(), clave, titulo: TITULOS[clave], mostrarTitulo: clave !== 'vista',
      activa: clave === 'vertiv' ? conVertiv : true,
      ...(cant !== undefined ? { cantidad: cant } : {}),
      ...(clave === 'consolas' ? { enlaces } : {}),
      fotos: casillasDe(clave, cant, enlaces).map(conFoto),
    };
  });
}

/** Sección "Otras fotos" (para agregar bloques que no estén en la plantilla). */
export const seccionExtra = (titulo = 'Otras fotos'): SeccionPrev =>
  ({ id: uid(), clave: 'extra', titulo, mostrarTitulo: true, activa: true, fotos: [] });

/**
 * Rehace las casillas de una sección al cambiar la cantidad o los enlaces, conservando las fotos,
 * textos y mediciones ya ingresados (por su clave) y las fotos agregadas a mano al final.
 */
export function rehacerCasillas(s: SeccionPrev, cantidad = s.cantidad ?? 0, enlaces = s.enlaces ?? []): SeccionPrev {
  const nuevas = casillasDe(s.clave, cantidad, enlaces);
  const claves = new Set(nuevas.map(x => x.k));
  const previas = new Map(s.fotos.map(f => [f.k, f]));
  const fotos = nuevas.map(x => {
    const p = previas.get(x.k);
    return p ? { ...p, formato: x.formato } : conFoto(x);
  });
  const sueltas = s.fotos.filter(f => f.k.startsWith('mano-') && !claves.has(f.k));
  return { ...s, cantidad, enlaces, fotos: [...fotos, ...sueltas] };
}

export const casillaNueva = (formato: FormatoFoto = 'par'): FotoPrev =>
  ({ id: uid(), k: `mano-${uid()}`, formato, titulo: '', descripcion: '', photo: null });

// ---------------------------------------------------------------------------------------
// Textos por defecto (iguales al informe de referencia)
// ---------------------------------------------------------------------------------------

/** Actividades de la descripción según las secciones que van en el informe. */
/** La sección va en el informe: está incluida y tiene al menos una foto. */
const vaEnInforme = (secciones: SeccionPrev[], k: ClaveSeccion) => secciones.some(s => s.clave === k && s.activa && s.fotos.some(f => f.photo));

export function actividadesDeSecciones(secciones: SeccionPrev[]): string[] {
  const activa = (k: ClaveSeccion) => vaEnInforme(secciones, k);
  const lista = ['Inspección general del sitio.'];
  if (activa('fotovoltaico')) lista.push('Limpieza de paneles solares.');
  if (activa('comunicaciones')) lista.push('Revisión y limpieza del gabinete de telecomunicaciones.');
  if (activa('baterias') || activa('medicion')) lista.push('Revisión, limpieza y mediciones de impedancia de los bancos de baterías.');
  if (activa('vertiv')) lista.push('Revisión y limpieza del gabinete eléctrico.');
  if (activa('generador')) lista.push('Inspección visual limpieza y obtención de datos del Grupo Generador.');
  if (activa('consolas')) lista.push('Revisión de estado Planta Vertiv, BTS on air y MMOO.');
  return lista;
}

/** Trabajos de la bitácora (segunda fila) según las secciones que van en el informe. */
export function trabajosDeSecciones(secciones: SeccionPrev[]): string[] {
  const activa = (k: ClaveSeccion) => vaEnInforme(secciones, k);
  const lista: string[] = [];
  if (activa('fotovoltaico')) lista.push('Limpieza de sistema fotovoltaico.');
  if (activa('vertiv')) lista.push('Limpieza de gabinetes eléctricos.');
  if (activa('comunicaciones')) lista.push('Limpieza de gabinetes de comunicaciones.');
  if (activa('medicion') || activa('baterias')) lista.push('Mediciones de bancos de baterías.');
  if (activa('consolas')) lista.push('Revisión de estado de consolas.');
  if (activa('dados')) lista.push('Revisión de dados de concreto.');
  if (activa('vientos')) lista.push('Revisión de tensores.');
  if (activa('rodado')) lista.push('Revisión de nivel de carro.');
  if (activa('generador')) lista.push('Revisión de niveles de aceite, refrigerante y petróleo.', 'Revisión de partidas y hodómetro.');
  if (activa('rodado') || activa('torre')) lista.push('Revisión general de carro.');
  if (activa('consolas')) lista.push('Revisión de estado Planta Vertiv, BTS on air y MMOO.');
  return lista;
}

export const CIERRE_DESCRIPCION = 'Los trabajos se realizaron en el sitio LTE y el sistema fotovoltaico, con el objetivo de garantizar su óptimo funcionamiento y prolongar su vida útil.';

export const ADMINISTRATIVAS_DEFECTO = [
  'Check List de herramientas.',
  'ART de mantenimiento preventivo.',
  'Realización planificación del día.',
  'Charla de seguridad HSE.',
  'Coordinación y asignación de actividades al personal.',
  'Reporte diario.',
];

export const planificadasDefecto = (sitio: string, sector: string) => [
  `Mantenimiento Preventivo a ${[sitio, sector.toUpperCase()].filter(Boolean).join(' ')}.`,
  'Orden y aseo al área de trabajo.',
];

export const bitacoraDefecto = (sitio: string, sector: string, secciones: SeccionPrev[], h: HorasBitacora = HORAS_DEFECTO): FilaBitacora[] => [
  {
    id: 'plan', inicio: h.planInicio, termino: h.planTermino, modoPersonal: 'turno', personalManual: '',
    actividades: [
      'Planificación, coordinación y delegación de las actividades del día.',
      'Se carga los materiales y herramientas para realizar el mantenimiento preventivo.',
    ],
  },
  {
    id: 'mant', inicio: h.mantInicio, termino: h.mantTermino, modoPersonal: 'ejecutantes', personalManual: '',
    actividades: [`Se realiza mantenimiento preventivo sitio ${[sitio, sector.toUpperCase()].filter(Boolean).join(' ')}`, ...trabajosDeSecciones(secciones)],
  },
];

/** Coordenadas conocidas de cada sitio (las nuevas que se escriban quedan guardadas en el equipo). */
export const COORDENADAS_CONOCIDAS: Record<string, string> = {
  LTE_CMF_09: '-26.254449, -69.540413',
  LTE_11: '-26.162619, -69.334636',
  LTE_CMM_11: '-26.162619, -69.334636',
};

/** Nombre sin el punto final ("Max Diaz." → "Max Diaz"), como aparece en el informe. */
export const sinPunto = (t: string) => t.trim().replace(/\.+$/, '').trim();
