// Divisiones de Codelco donde trabaja el equipo. Cada usuario trabaja en la división de su cuenta
// (la faena que eligió al registrarse); los administradores pueden cambiar entre ambas.
//
// Aquí está TODO lo que cambia de una división a otra en los informes: nombre de la faena,
// firmas (creado / revisado / autorizado por), personal sugerido y si existe el bloque Vertiv.
// Los valores de El Salvador son exactamente los que ya usaban los informes (no cambian sus Word).

export type Division = 'el_salvador' | 'andina';

export const DIVISIONES: Division[] = ['el_salvador', 'andina'];

/** La faena del registro (rajo_inca / andina) define la división de la cuenta. */
export const divisionDeFaena = (faena: string | null | undefined): Division => (faena === 'andina' ? 'andina' : 'el_salvador');

export const esDivision = (v: unknown): v is Division => v === 'el_salvador' || v === 'andina';

export interface Firmante { nombre: string; cargo: string }

export interface ConfigDivision {
  id: Division;
  nombre: string;          // "División El Salvador"
  nombreCorto: string;     // "El Salvador"
  sigla: string;           // "DSAL"
  /** Texto "Faena" de los informes. */
  faena: string;
  /** Sufijo de las claves guardadas en el dispositivo (El Salvador mantiene las claves de siempre). */
  sufijoLocal: string;
  /** Bloque fijo "Verificación de la Gestión en Planta Rectificadora Vertiv" del Turno Noche. */
  vertiv: boolean;
  /** Personas que no son de la dotación de un turno pero se agregan seguido (jefaturas, administración). */
  personalSugerido: Firmante[];
  diario: {
    revisadoText: string;
    autorizado: Firmante;
    creadoPor: { A: Firmante[]; B: Firmante[] };
    creadorPorDefecto: { A: Firmante; B: Firmante };
  };
  cierre: {
    revisadoText: string;
    autorizado: Firmante;
    creadoPor: { A: Firmante[]; B: Firmante[] };
    /** Id fijo del "cierre en curso" compartido de la división. */
    borradorId: string;
  };
  mantenimiento: {
    cliente: string;
    minera: string;
    revisadoText: string;
    creado: Firmante;
    ejecutante: string;
    /** true = los sitios se eligen de la lista de carros; false = se escriben a mano. */
    listaDeSitios: boolean;
  };
  falla: {
    revisadoText: string;
    autorizado: Firmante;
    creado: Firmante;
    tecnico: string;
    equipos: { etiqueta: string; personas: Firmante[] }[];
    listaDeCarros: boolean;
  };
}

// --- Andina -------------------------------------------------------------------------------
const ANDINA_ADMINISTRADOR: Firmante = { nombre: 'Cesar Enrique Orellana Martinez', cargo: 'Administrador de contrato' };
const ANDINA_JEFE_TURNO: Firmante = { nombre: 'Dennis William Gatica Martinez', cargo: 'Jefe Turno' };
const ANDINA_INGENIERO: Firmante = { nombre: 'Luciano Salvador Olmos Torres', cargo: 'Ingeniero especialista RAN, CORE, EPC' };
const ANDINA_SUPERVISORES: Firmante[] = [
  { nombre: 'Oscar Fabian Acuña Solis', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Guillermo Arturo Soto Alvarado', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Jose Luis Arévalo Guerra', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Maikol Peña Gavidia', cargo: 'Supervisor de Operaciones' },
];
const ANDINA_PERSONAL: Firmante[] = [ANDINA_ADMINISTRADOR, ANDINA_JEFE_TURNO, ...ANDINA_SUPERVISORES, ANDINA_INGENIERO];

// --- El Salvador (valores originales de cada informe) ---------------------------------------
const ES_SUPERVISORES_A: Firmante[] = [
  { nombre: 'Max Diaz Cornejo.', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Patricio Santana.', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Nicolas Bahamondes.', cargo: 'Tecnico Lider' },
];
const ES_SUPERVISORES_B: Firmante[] = [
  { nombre: 'Luis Humberto Fernández Ortega', cargo: 'Supervisor de Operaciones' },
  { nombre: 'Camilo Andrés Pailapan Hormazabal', cargo: 'Supervisor de Operaciones' },
];

export const CONFIG_DIVISION: Record<Division, ConfigDivision> = {
  el_salvador: {
    id: 'el_salvador',
    nombre: 'División El Salvador',
    nombreCorto: 'El Salvador',
    sigla: 'DSAL',
    faena: 'Minera Rajo Inca',
    sufijoLocal: '',
    vertiv: true,
    personalSugerido: [
      { nombre: 'Juan Saavedra.', cargo: 'Jefe de Turno.' },
      { nombre: 'German Votter.', cargo: 'Gerente de Operaciones.' },
      { nombre: 'Javiera Lira.', cargo: 'Directora Legal.' },
      { nombre: 'Carolina Klenner.', cargo: 'Gerenta de Personas.' },
      { nombre: 'Juan Morata.', cargo: 'Ingeniero Especialista.' },
      { nombre: 'Cesar Orellana.', cargo: 'Administrador de Contrato.' },
    ],
    diario: {
      revisadoText: 'Juan Morata\nJuan Saavedra',
      autorizado: { nombre: 'Cesar Orellana', cargo: 'ADC' },
      creadoPor: { A: ES_SUPERVISORES_A, B: ES_SUPERVISORES_B },
      creadorPorDefecto: { A: { nombre: 'Max Diaz Cornejo', cargo: 'Supervisor' }, B: ES_SUPERVISORES_B[0] },
    },
    cierre: {
      revisadoText: 'Juan Saavedra\nJuan Morata',
      autorizado: { nombre: 'Cesar Orellana', cargo: 'ADC' },
      creadoPor: {
        A: [
          { nombre: 'Max Diaz Cornejo.', cargo: 'Supervisor' },
          { nombre: 'Patricio Santana.', cargo: 'Supervisor de Operaciones' },
          { nombre: 'Nicolas Bahamondes.', cargo: 'Tecnico Lider' },
        ],
        B: ES_SUPERVISORES_B,
      },
      borradorId: '00000000-0000-4000-8000-00000000c1e2',
    },
    mantenimiento: {
      cliente: 'División El Salvador Codelco',
      minera: 'El Salvador Rajo Inca',
      revisadoText: 'Jefe de Turno\nJuan Saavedra\nLuis Fernandez\nSupervisor de Operación',
      creado: { nombre: 'Ricardo Riquelme.', cargo: 'Ingeniero Electromecánico' },
      ejecutante: 'Ricardo Riquelme',
      listaDeSitios: true,
    },
    falla: {
      revisadoText: 'Juan Saavedra.\nJuan Morata.',
      autorizado: { nombre: 'Cesar Orellana.', cargo: 'ADC' },
      creado: { nombre: 'Max Diaz.', cargo: 'Supervisor de Operaciones' },
      tecnico: 'Max Diaz.',
      equipos: [], // El Salvador usa sus listas de Equipo A / Equipo B (en el formulario de falla)
      listaDeCarros: true,
    },
  },
  andina: {
    id: 'andina',
    nombre: 'División Andina',
    nombreCorto: 'Andina',
    sigla: 'DAND',
    faena: 'División Andina',
    sufijoLocal: '_andina',
    vertiv: false,
    personalSugerido: ANDINA_PERSONAL,
    diario: {
      revisadoText: `${ANDINA_INGENIERO.nombre}\n${ANDINA_JEFE_TURNO.nombre}`,
      autorizado: ANDINA_ADMINISTRADOR,
      creadoPor: { A: ANDINA_SUPERVISORES, B: ANDINA_SUPERVISORES },
      creadorPorDefecto: { A: ANDINA_SUPERVISORES[0], B: ANDINA_SUPERVISORES[0] },
    },
    cierre: {
      revisadoText: `${ANDINA_JEFE_TURNO.nombre}\n${ANDINA_INGENIERO.nombre}`,
      autorizado: ANDINA_ADMINISTRADOR,
      creadoPor: { A: ANDINA_SUPERVISORES, B: [] },
      borradorId: '00000000-0000-4000-8000-0000000a0d1e',
    },
    mantenimiento: {
      cliente: 'División Andina Codelco',
      minera: 'División Andina',
      revisadoText: `Jefe de Turno\n${ANDINA_JEFE_TURNO.nombre}\n${ANDINA_SUPERVISORES[0].nombre}\nSupervisor de Operaciones`,
      creado: ANDINA_SUPERVISORES[0],
      ejecutante: '',
      listaDeSitios: false,
    },
    falla: {
      revisadoText: `${ANDINA_JEFE_TURNO.nombre}.\n${ANDINA_INGENIERO.nombre}.`,
      autorizado: { nombre: `${ANDINA_ADMINISTRADOR.nombre}.`, cargo: ANDINA_ADMINISTRADOR.cargo },
      creado: ANDINA_SUPERVISORES[0],
      tecnico: ANDINA_SUPERVISORES[0].nombre,
      equipos: [{ etiqueta: 'División Andina', personas: ANDINA_PERSONAL }],
      listaDeCarros: false,
    },
  },
};

export const configDivision = (d: Division) => CONFIG_DIVISION[d];

/** Lista única de quienes pueden figurar como "Creado por" en el Informe Diario. */
export const creadoPorDiario = (d: Division): Firmante[] => {
  const { A, B } = CONFIG_DIVISION[d].diario.creadoPor;
  return [...A, ...B.filter(b => !A.some(a => a.nombre === b.nombre))];
};
