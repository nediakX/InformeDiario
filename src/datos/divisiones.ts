// Divisiones de Codelco donde trabaja el equipo. Cada usuario trabaja en la división de su cuenta
// (la faena que eligió al registrarse); los administradores pueden cambiar entre ambas.
//
// Aquí está TODO lo que cambia de una división a otra en los informes: nombre de la faena,
// firmas (creado / revisado / autorizado por), personal sugerido y si existe el bloque Vertiv.
// Los valores de El Salvador son exactamente los que ya usaban los informes (no cambian sus Word).

import { CARRO_OPCIONES, UBICACION_POR_CARRO } from './catalogos';

export type Division = 'el_salvador' | 'andina';

export const DIVISIONES: Division[] = ['el_salvador', 'andina'];

/** La faena del registro (rajo_inca / andina) define la división de la cuenta. */
export const divisionDeFaena = (faena: string | null | undefined): Division => (faena === 'andina' ? 'andina' : 'el_salvador');

export const esDivision = (v: unknown): v is Division => v === 'el_salvador' || v === 'andina';

export interface Firmante { nombre: string; cargo: string }

/** Camioneta de la división: cada una tiene su propio Checklist de Camioneta por semana. */
export interface Camioneta { patente: string; marca: string; modelo: string; anio: string }

export interface ConfigDivision {
  id: Division;
  nombre: string;          // "División El Salvador"
  nombreCorto: string;     // "El Salvador"
  sigla: string;           // "DSAL"
  /** Texto "Faena" de los informes. */
  faena: string;
  /** Ciudad desde la que se traslada el personal (tarea 1.1.1 "Traslado desde … hacia … y viceversa"). */
  origenTraslado: string;
  /** Sufijo de las claves guardadas en el dispositivo (El Salvador mantiene las claves de siempre). */
  sufijoLocal: string;
  /** Bloque fijo "Verificación de la Gestión en Planta Rectificadora Vertiv" del Turno Noche. */
  vertiv: boolean;
  /** Personas que no son de la dotación de un turno pero se agregan seguido (jefaturas, administración). */
  personalSugerido: Firmante[];
  /** Dotación por defecto de cada turno (El Salvador usa sus listas de siempre, en constantes.ts). */
  personalPorTurno?: { A: Firmante[]; B: Firmante[] };
  /** Carros / sitios LTE de la división (listas desplegables de Falla, Mantenimiento y "Mantenimiento" del Informe Diario). */
  carros: string[];
  /** Ubicación en faena de cada carro (se completa sola al elegirlo). */
  ubicacionPorCarro: Record<string, string>;
  /** Camionetas fijas del Checklist de Camioneta (se pueden agregar otras desde la pantalla). */
  camionetas: Camioneta[];
  /** Conductores de cada turno (lista desplegable del Checklist de Camioneta). */
  conductores: { A: string[]; B: string[] };
  /** Sitios de la reportabilidad diaria GG (actividad por defecto de Turno Noche y texto final del Word). */
  sitiosReportabilidad: string;
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
  };
  falla: {
    revisadoText: string;
    autorizado: Firmante;
    creado: Firmante;
    tecnico: string;
    equipos: { etiqueta: string; personas: Firmante[] }[];
  };
}

// --- Andina -------------------------------------------------------------------------------
// Carros LTE de División Andina.
const ANDINA_CARROS: string[] = ['SUR_SUR', 'CONGRESO', 'CHIVATO', 'DNL', 'MORRENA', 'TRES_ESQUINAS', 'PIPA', '3700'];
// En Andina cada carro lleva el nombre de su ubicación.
const ANDINA_UBICACIONES: Record<string, string> = {
  SUR_SUR: 'Sur Sur', CONGRESO: 'Congreso', CHIVATO: 'Chivato', DNL: 'DNL',
  MORRENA: 'Morrena', TRES_ESQUINAS: 'Tres Esquinas', PIPA: 'Pipa', '3700': '3700',
};
const ANDINA_ADMINISTRADOR: Firmante = { nombre: 'Cesar Enrique Orellana Martinez', cargo: 'Administrador de contrato' };
const ANDINA_JEFE_TURNO: Firmante = { nombre: 'Dennis William Gatica Martinez', cargo: 'Jefe Turno' };
const ANDINA_INGENIERO: Firmante = { nombre: 'Luciano Salvador Olmos Torres', cargo: 'Ingeniero especialista RAN, CORE, EPC' };
const SUPERVISOR = 'Supervisor de Operaciones';
const TEC_TELECOM = 'Técnico en telecomunicaciones';
const ANDINA_OSCAR: Firmante = { nombre: 'Oscar Fabian Acuña Solis', cargo: SUPERVISOR };
// Organigrama División Andina LTE: columna izquierda = Turno A, columna derecha = Turno B.
const ANDINA_TURNO_A: Firmante[] = [
  { nombre: 'Guillermo Arturo Soto Alvarado', cargo: SUPERVISOR },
  { nombre: 'Jose Luis Arévalo Guerra', cargo: SUPERVISOR },
  { nombre: 'Vicente Vasquez', cargo: 'Líder Técnico' },
  { nombre: 'Cristopher Mercado', cargo: TEC_TELECOM },
  { nombre: 'Diego Salinas', cargo: TEC_TELECOM },
  { nombre: 'Felipe Sandoval', cargo: TEC_TELECOM },
  { nombre: 'Diego Diaz', cargo: TEC_TELECOM },
  { nombre: 'Sebastián Burgos', cargo: 'Técnico eléctrico' },
];
const ANDINA_TURNO_B: Firmante[] = [
  ANDINA_OSCAR,
  { nombre: 'Maikol Peña Gavidia', cargo: SUPERVISOR },
  { nombre: 'Luis Navarrete', cargo: 'Líder Técnico' },
  { nombre: 'Mario Espinosa', cargo: TEC_TELECOM },
  { nombre: 'Carlos Cisternas', cargo: TEC_TELECOM },
  { nombre: 'Nicolas Jamen', cargo: TEC_TELECOM },
  { nombre: 'Leonardo Toro', cargo: TEC_TELECOM },
  { nombre: 'Victor Ñanco', cargo: 'Técnico eléctrico' },
];
// Quienes pueden figurar como "Creado por" en cada turno.
const ANDINA_CREADORES_A: Firmante[] = ANDINA_TURNO_A.slice(0, 2);
const ANDINA_CREADORES_B: Firmante[] = ANDINA_TURNO_B.slice(0, 3); // Oscar, Maikol y Luis Navarrete (Líder Técnico)
// Jefaturas y personal 4x3 / SSOMA: no pertenecen a un turno, se agregan desde "Personal sugerido".
const ANDINA_SUGERIDO: Firmante[] = [
  ANDINA_ADMINISTRADOR,
  ANDINA_JEFE_TURNO,
  ANDINA_INGENIERO,
  { nombre: 'Cristobal Higueras', cargo: 'Electromecánico' },
  { nombre: 'Rodrigo Ponce', cargo: 'Experto en SSOMA' },
  { nombre: 'Rodrigo Mancilla', cargo: 'Experto en SSOMA' },
];

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
    origenTraslado: 'El Salvador',
    carros: CARRO_OPCIONES,
    ubicacionPorCarro: UBICACION_POR_CARRO,
    camionetas: [
      { patente: 'VCTD-93', marca: 'Ford', modelo: 'Ranger', anio: '2025' },
      { patente: 'VCTF-84', marca: 'Mitsubishi', modelo: 'L200 Katana', anio: '2025' },
      { patente: 'TZYJ-98', marca: 'Toyota', modelo: 'Hilux', anio: '2025' },
    ],
    conductores: {
      A: ['Carlos Moll', 'Patricio Santana', 'Claudia Droguett', 'Juan Morata', 'Juan Saavedra'],
      B: ['Omar Gutierrez', 'Camilo Pailapan', 'Fernando Contreras', 'Luis Fernandez', 'Alberto Arancibia'],
    },
    sitiosReportabilidad: 'LTE 01, 02, 03, 04, 06, 07, 08, 09, 10, 11 y MMOO 01',
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
    },
    falla: {
      revisadoText: 'Juan Saavedra.\nJuan Morata.',
      autorizado: { nombre: 'Cesar Orellana.', cargo: 'ADC' },
      creado: { nombre: 'Max Diaz.', cargo: 'Supervisor de Operaciones' },
      tecnico: 'Max Diaz.',
      equipos: [], // El Salvador usa sus listas de Equipo A / Equipo B (en el formulario de falla)
    },
  },
  andina: {
    id: 'andina',
    nombre: 'División Andina',
    nombreCorto: 'Andina',
    sigla: 'DAND',
    faena: 'División Andina',
    origenTraslado: 'Los Andes',
    carros: ANDINA_CARROS,
    ubicacionPorCarro: ANDINA_UBICACIONES,
    camionetas: [], // aún sin camionetas fijas: se agregan con "Otra patente"
    conductores: { A: [], B: [] }, // aún sin lista: el nombre se escribe a mano
    sitiosReportabilidad: 'SUR SUR, CONGRESO, CHIVATO, DNL, MORRENA, TRES ESQUINAS, PIPA y 3700',
    sufijoLocal: '_andina',
    vertiv: false,
    personalSugerido: ANDINA_SUGERIDO,
    personalPorTurno: { A: ANDINA_TURNO_A, B: ANDINA_TURNO_B },
    diario: {
      revisadoText: `${ANDINA_INGENIERO.nombre}\n${ANDINA_JEFE_TURNO.nombre}`,
      autorizado: ANDINA_ADMINISTRADOR,
      creadoPor: { A: ANDINA_CREADORES_A, B: ANDINA_CREADORES_B },
      creadorPorDefecto: { A: ANDINA_CREADORES_A[0], B: ANDINA_OSCAR },
    },
    cierre: {
      revisadoText: `${ANDINA_JEFE_TURNO.nombre}\n${ANDINA_INGENIERO.nombre}`,
      autorizado: ANDINA_ADMINISTRADOR,
      creadoPor: { A: ANDINA_CREADORES_A, B: ANDINA_CREADORES_B },
      borradorId: '00000000-0000-4000-8000-0000000a0d1e',
    },
    mantenimiento: {
      cliente: 'División Andina Codelco',
      minera: 'División Andina',
      revisadoText: `Jefe de Turno\n${ANDINA_JEFE_TURNO.nombre}\n${ANDINA_OSCAR.nombre}\nSupervisor de Operaciones`,
      creado: ANDINA_OSCAR,
      ejecutante: '',
    },
    falla: {
      revisadoText: `${ANDINA_JEFE_TURNO.nombre}.\n${ANDINA_INGENIERO.nombre}.`,
      autorizado: { nombre: `${ANDINA_ADMINISTRADOR.nombre}.`, cargo: ANDINA_ADMINISTRADOR.cargo },
      creado: ANDINA_OSCAR,
      tecnico: ANDINA_OSCAR.nombre,
      equipos: [
        { etiqueta: 'Turno A', personas: ANDINA_TURNO_A },
        { etiqueta: 'Turno B', personas: ANDINA_TURNO_B },
        { etiqueta: 'Jefaturas y apoyo', personas: ANDINA_SUGERIDO },
      ],
    },
  },
};

export const configDivision = (d: Division) => CONFIG_DIVISION[d];

/** Lista única de quienes pueden figurar como "Creado por" en el Informe Diario. */
export const creadoPorDiario = (d: Division): Firmante[] => {
  const { A, B } = CONFIG_DIVISION[d].diario.creadoPor;
  return [...A, ...B.filter(b => !A.some(a => a.nombre === b.nombre))];
};
