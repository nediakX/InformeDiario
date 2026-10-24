// Documentos de faena que se imprimen antes de cada semana de turno, y dónde va cada dato
// cuando se imprimen "prellenados" (nombre, RUT, cargo, fechas de la semana, turno).
//
// Las posiciones están medidas sobre cada PDF de /public/documentos, en puntos y con el origen
// ARRIBA a la izquierda ("base" = distancia desde el borde superior hasta la línea base del texto).
// Si un PDF cambia de diseño, basta con ajustar aquí sus coordenadas.

export interface CampoTexto {
  pagina?: number;       // índice de página (0 = primera)
  x: number;
  base: number;
  tamano?: number;       // tamaño de letra (pt). Por defecto 9.
  ancho?: number;        // ancho máximo: si el texto no cabe, se achica la letra.
  centrado?: boolean;    // x es el centro del texto
  tapar?: { x: number; top: number; ancho: number; alto: number }; // rectángulo blanco previo (sobre "__/__/__")
  negrita?: boolean;     // letra negrita y negra (para rehacer un texto impreso del formulario)
  texto: string;
}

export interface Persona { nombre: string; rut: string; cargo: string }

export interface ContextoSemana {
  letra: 'A' | 'B';
  dias: string[];        // 7 fechas ISO (miércoles a martes)
  supervisor: { nombre: string; cargo: string };
  /** Fecha de los formularios de una sola fecha (Test de Alcohol y Encuesta de Fatiga). Por defecto, el primer día del turno. */
  fechaUnica?: string;
}

export interface DocumentoImprimible {
  id: string;
  nombre: string;
  descripcion: string;
  archivo: string;
  /** Hojas a doble cara (dúplex): se arman en un PDF aparte, alineadas a páginas pares. */
  dobleCara?: boolean;
  /** No viene marcado por defecto: se imprime solo cuando corresponde (como la Encuesta de Fatiga). */
  opcional?: boolean;
  /** Se imprime uno por cada persona del turno (con su nombre) o una cantidad fija para el turno. */
  modo: 'persona' | 'turno';
  /** Cantidad sugerida cuando el modo es "turno" (o copias en blanco extra si es "persona"). */
  cantidadSugerida: number;
  /** Campos que dependen de la semana / turno (van en todas las copias). */
  camposSemana?: (s: ContextoSemana) => CampoTexto[];
  /** Arreglos del formulario impreso: van en todas las copias, también en blanco. */
  correcciones?: CampoTexto[];
  /** Campos de la persona (solo en las copias con nombre). */
  camposPersona?: (p: Persona, s: ContextoSemana) => CampoTexto[];
}

const ddmm = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const ddmmaa = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y.slice(2)}`; };
const ddmmaaaa = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${m}-${y}`; };
const diaMes = (iso: string) => { const [, m, d] = iso.split('-'); return `${Number(d)}-${m}`; };
// Centro de la columna de cada día (miércoles a martes) en la Autoevaluación.
const CENTROS_AUTOEVALUACION = [319.4, 385.3, 451.3, 517.3, 583.2, 651.0, 722.6];
const rangoSemana = (s: ContextoSemana) => `${ddmmaaaa(s.dias[0])} al ${ddmmaaaa(s.dias[6])}`;

export const DOCUMENTOS: DocumentoImprimible[] = [
  {
    id: 'autoevaluacion',
    nombre: 'Autoevaluación Diaria Inicio y Término de Turno',
    descripcion: 'GSSO-LTE-R-ADIYTT-DSAL-01 · una por persona',
    archivo: '/documentos/GSSO-LTE-R-ADIYTT-DSAL-01_Autoevaluación_Diaria_de_Inicio_y_Termino_de_Turno.pdf',
    modo: 'persona',
    cantidadSugerida: 0,
    camposSemana: s => [
      { x: 74, base: 149.6, tamano: 8, texto: rangoSemana(s) },
      { x: 74, base: 426.8, tamano: 8, texto: rangoSemana(s) },
      // Día y mes sobre cada día de la semana (inicio y término de turno): 7-10, 8-10…
      ...CENTROS_AUTOEVALUACION.flatMap((x, i) => [
        { x, base: 148.6, tamano: 7.5, centrado: true, texto: diaMes(s.dias[i]) },
        { x, base: 425.9, tamano: 7.5, centrado: true, texto: diaMes(s.dias[i]) },
      ]),
    ],
    camposPersona: p => [
      { x: 64, base: 139.9, tamano: 8.5, ancho: 215, texto: p.nombre },
      { x: 568, base: 139.9, tamano: 8.5, ancho: 260, texto: p.rut },
      { x: 64, base: 417.1, tamano: 8.5, ancho: 215, texto: p.nombre },
      { x: 568, base: 417.1, tamano: 8.5, ancho: 260, texto: p.rut },
    ],
  },
  {
    id: 'alta-visibilidad',
    nombre: 'Checklist Alta Visibilidad',
    descripcion: 'GOT-LTE-R-IRAV-DSAL-32 · una por persona',
    archivo: '/documentos/CHECKLIST_ALTA_VISIBILIDAD.pdf',
    modo: 'persona',
    cantidadSugerida: 0,
    camposSemana: s => [330.1, 391.0, 449.3, 509.8, 568.8, 635.1, 701.6].map((x, i) => ({
      x: x + 2, base: 119.6, tamano: 6.5, texto: ddmm(s.dias[i]),
    })),
    camposPersona: p => [{ x: 107, base: 513, tamano: 9, ancho: 235, texto: p.nombre }],
  },
  {
    id: 'protector-solar',
    nombre: 'Registro de Aplicación de Protector Solar',
    descripcion: 'GSSO-LTE-R-EQPSPRU-DSAL-06 · uno por persona',
    archivo: '/documentos/GSSO-LTE-R-EQPSPRU-DSAL-06_REGISTRO_DE_APLICACIÓN_DE_PROTECTOR_SOLAR.pdf',
    // El "NO" de las 10:00 viene partido en dos líneas en el PDF: se rehace en una sola.
    correcciones: [{ x: 254.5, base: 252.4, tamano: 9.8, centrado: true, negrita: true, tapar: { x: 242.8, top: 235.8, ancho: 23.6, alto: 25.6 }, texto: 'NO' }],
    modo: 'persona',
    cantidadSugerida: 0,
    camposSemana: s => [
      ...s.dias.map((d, i) => ({ x: 88, base: 276.6 + 19 * i, tamano: 9, texto: ddmmaaaa(d) })),
      { x: 124, base: 446.4, tamano: 9, ancho: 600, texto: s.supervisor.nombre },
      { x: 124, base: 460.4, tamano: 9, ancho: 600, texto: s.supervisor.cargo },
    ],
    camposPersona: p => [
      { x: 190, base: 147.3, ancho: 520, texto: p.nombre },
      { x: 190, base: 161.3, ancho: 520, texto: p.rut },
      { x: 190, base: 175.2, ancho: 520, texto: p.cargo },
    ],
  },
  {
    id: 'hidratacion',
    nombre: 'Retiro de Agua e Hidratación en Terreno',
    descripcion: 'GSSO-LTE-R-RACPHT-DSAL-19 · uno por persona',
    archivo: '/documentos/GSSO-LTE-R-RACPHT-DSAL-19_REGISTRO_RETIRO_DE_AGUA_PARA_CONSUMO_PERSONAL_E_HIDRATACIÓN_EN_TERRENO.pdf',
    modo: 'persona',
    cantidadSugerida: 0,
    camposSemana: s => [
      // Fechas del turno en las filas 1 a 7 (una por día, miércoles a martes).
      ...s.dias.map((d, i) => ({ x: 196.7, base: 223.9 + 13.95 * i, tamano: 8.5, centrado: true, texto: ddmmaaaa(d) })),
      { x: 140, base: 462.6, ancho: 620, texto: s.supervisor.nombre },
      { x: 140, base: 476.5, ancho: 620, texto: s.supervisor.cargo },
    ],
    camposPersona: p => [
      { x: 140, base: 155.7, ancho: 620, texto: p.nombre },
      { x: 140, base: 169.6, ancho: 620, texto: p.rut },
      { x: 140, base: 183.6, ancho: 620, texto: p.cargo },
    ],
  },
  {
    id: 'radios',
    nombre: 'Inspección de Radios',
    descripcion: 'GSSO-LTE-R-IRDC-49 · una por radio (frente y reverso)',
    archivo: '/documentos/INSPECCION_RADIOS.pdf',
    dobleCara: true,
    modo: 'turno',
    cantidadSugerida: 1,
    camposSemana: s => [
      { x: 68, base: 128.7, tamano: 9, texto: `Turno ${s.letra}` },
      ...[297.1, 365.2, 433.3, 501.5, 569.8, 637.9, 705.7].map((x0, i) => ({
        x: x0 + 17, base: 158, tamano: 7.5, centrado: true,
        tapar: { x: x0 - 1, top: 150, ancho: 36, alto: 11 },
        texto: ddmmaa(s.dias[i]),
      })),
    ],
  },
  {
    id: 'fatiga',
    nombre: 'Encuesta de Fatiga y Somnolencia',
    descripcion: 'Se usa solo si alguien presenta pérdida de alerta · una por persona',
    archivo: '/documentos/Formato_Encuesta_Fatiga_y_somnolencia.pdf',
    opcional: true,
    modo: 'persona',
    cantidadSugerida: 0,
    // Datos del supervisor, del trabajador y la fecha ya escritos: en terreno solo se marcan SI/NO y las firmas.
    camposSemana: s => [
      { x: 232, base: 665.4, tamano: 9, ancho: 212, texto: s.supervisor.nombre },
      { x: 232, base: 684.1, tamano: 9, ancho: 212, texto: s.supervisor.cargo },
      // Fila "Fecha" del pie: la misma fecha que el Test de Alcohol del turno.
      { x: 232, base: 733.9, tamano: 9, ancho: 212, texto: ddmmaaaa(s.fechaUnica ?? s.dias[0]) },
    ],
    camposPersona: p => [
      { x: 232, base: 700.9, tamano: 9, ancho: 212, texto: p.nombre },
      { x: 232, base: 718.9, tamano: 9, ancho: 212, texto: p.cargo },
    ],
  },
  {
    id: 'alcohol',
    nombre: 'Registro de Toma de Test de Alcohol',
    descripcion: 'GSSO-LTE-R-TNA&D · uno por persona',
    archivo: '/documentos/GSSO-LTE-R-TNAD_REGISTRO_TOMA_DE_TEST_DE_ALCOHOL.pdf',
    opcional: true,
    modo: 'persona',
    cantidadSugerida: 0,
    // El formulario tiene una sola fecha por trabajador: la que se elige en Impresión Rápida (por defecto, el miércoles de inicio de la semana).
    camposSemana: s => [
      { x: 406, base: 240.9, tamano: 9, ancho: 150, texto: ddmmaaaa(s.fechaUnica ?? s.dias[0]) },
    ],
    camposPersona: p => [
      { x: 146, base: 217.3, tamano: 9, ancho: 405, texto: p.nombre },
      { x: 146, base: 240.9, tamano: 9, ancho: 186, texto: p.cargo },
    ],
  },
];
