// Datos fijos del contrato y de los sitios, compartidos por todos los informes.
// Si cambia el contrato, un carro o una ubicación, se edita SOLO aquí.

export const N_CONTRATO = "4600027858";
export const LINEA_SERVICIO = "SERVICIO DE IMPLEMENTACIÓN Y CONTINUIDAD OPERACIONAL DE RED INALAMBRICA LTE-DSAL";

/** Códigos de los carros/sitios LTE (con guion bajo, como se usan en los formularios). */
export const CARRO_OPCIONES: string[] = [
  "LTE_CMF_01", "LTE_CMF_02", "LTE_CMF_04", "LTE_CMF_08", "LTE_CMF_09",
  "LTE_CMM_03", "LTE_CMM_05", "LTE_CMM_06", "LTE_CMM_07", "LTE_CMM_10",
  "LTE_11", "MMOO_01",
];

/** Ubicación en faena de cada carro. */
export const UBICACION_POR_CARRO: Record<string, string> = {
  "LTE_CMM_03": "Cerro Pepa",
  "LTE_CMF_09": "Cerro La Ballena",
  "MMOO_01": "Chancado Primario",
  "LTE_CMF_04": "Cerro Antenas",
  "LTE_CMM_06": "Mirador Fase 2",
  "LTE_CMM_10": "Cerro Pisquero",
  "LTE_CMF_02": "Truck Shop",
  "LTE_CMF_08": "Ex Garita Rajo Inca",
  "LTE_CMM_05": "Ex Barrio Cívico",
  "LTE_CMF_01": "Bloquera",
  "LTE_11": "Ex Ventiladores",
  "LTE_CMM_07": "Campamento Antiguo",
};

// ---------------------------------------------------------------------------------------
// Tareas de la actividad (listado entregado por el cliente). Aparecen en "Actividades
// sugeridas" del Informe Diario, agrupadas por su número; al insertarlas se agrega solo el
// nombre de la tarea. {ORIGEN} y {DIVISION} se reemplazan según la división (ver gruposTareas).
// ---------------------------------------------------------------------------------------
export interface TareaActividad { codigo: string; tarea: string }

export const GRUPOS_TAREAS: { titulo: string; tareas: TareaActividad[] }[] = [
  {
    titulo: "Tareas 1.1",
    tareas: [
      { codigo: "1.1.1", tarea: "Traslado desde {ORIGEN} hacia {DIVISION} y viceversa" },
      { codigo: "1.1.2", tarea: "Circulación area industrial" },
      { codigo: "1.1.3", tarea: "Circulación area mina" },
    ],
  },
  {
    titulo: "Tareas 2.1",
    tareas: [
      { codigo: "2.1.1", tarea: "Energización de equipos LTE." },
      { codigo: "2.1.2", tarea: "Alineación MMOO" },
      { codigo: "2.1.3", tarea: "Configuración de pruebas RF y MMOO LTE." },
      { codigo: "2.1.4", tarea: "Instalación de Hardware LTE" },
    ],
  },
  {
    titulo: "Tareas 3.1",
    tareas: [
      { codigo: "3.1.1", tarea: "Energización de equipos LTE." },
      { codigo: "3.1.2", tarea: "Alineación MMOO" },
      { codigo: "3.1.3", tarea: "Configuración de pruebas RF y MMOO LTE." },
      { codigo: "3.1.4", tarea: "Instalación de Hardware LTE" },
    ],
  },
  {
    titulo: "Tareas 4.1",
    tareas: [
      { codigo: "4.1.1", tarea: "Reemplazo de equipos en móviles en Sala de Comunicaciones" },
      { codigo: "4.1.2", tarea: "Instalacion CPE" },
      { codigo: "4.1.3", tarea: "Instalación y/o Cambio de Baterías" },
      { codigo: "4.1.4", tarea: "Instalación de Conmutador Energía Alterna." },
    ],
  },
  {
    titulo: "Tareas 5.1",
    tareas: [
      { codigo: "5.1.1", tarea: "Mantención Preventiva de Gabinetes en salas de comunicación y CPE" },
      { codigo: "5.1.2", tarea: "Mantención Banco de Baterías en carros móviles." },
      { codigo: "5.1.3", tarea: "Mantención Equipos Torre" },
      { codigo: "5.1.4", tarea: "Mantención Preventiva Paneles Solares (FS – HD – LT)." },
      { codigo: "5.1.5", tarea: "Mantención preventiva a grupo generador (HD-FS-LT)." },
      { codigo: "5.1.6", tarea: "Mantenimiento de Equipos Generadores." },
    ],
  },
  {
    titulo: "Tareas 6.1",
    tareas: [
      { codigo: "6.1.1", tarea: "Asistencia Eventos por Caída de servicio" },
      { codigo: "6.1.2", tarea: "Asistencia en Trabajos de Electrónica" },
      { codigo: "6.1.3", tarea: "Instalación de MMOO" },
      { codigo: "6.1.4", tarea: "Instalación de RF y MMOO en Carro Móvil." },
      { codigo: "6.1.5", tarea: "Instalación de Sistema Radiante LTE" },
    ],
  },
  {
    titulo: "Tareas generales",
    tareas: [
      { codigo: "1.1.1", tarea: "Soporte y continuidad operativa" },
      { codigo: "1.1.2", tarea: "Trabajo en oficina" },
    ],
  },
];

/** Tareas del cliente con los datos de la división: p. ej. "Traslado desde Los Andes hacia DAND y viceversa" (Andina)
 *  o "Traslado desde El Salvador hacia DSAL y viceversa" (El Salvador). */
export const gruposTareas = (division: { origenTraslado: string; sigla: string }) =>
  GRUPOS_TAREAS.map(grupo => ({
    ...grupo,
    tareas: grupo.tareas.map(t => ({
      ...t,
      tarea: t.tarea.replace('{ORIGEN}', division.origenTraslado).replace('{DIVISION}', division.sigla),
    })),
  }));
