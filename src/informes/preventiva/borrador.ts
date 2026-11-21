// Mantención preventiva: lo que muestra el formulario al abrirse (informe nuevo o borrador guardado) y los
// datos completos del Word (lo que cambia + lo fijo). Lo usan el formulario y "Descargar" en Borradores,
// así los dos arman exactamente el mismo documento.
import { uid } from '../../lib/fotos';
import { hoyLocalISO } from '../../datos/fechas';
import { letraDeFecha } from '../../datos/turnos';
import { configDivision, type Division } from '../../datos/divisiones';
import { getPersonalGuardado } from '../diario/constantes';
import {
  type DatosPreventiva, type HorasBitacora, type PersonaPrev,
  ADMINISTRATIVAS_DEFECTO, CIERRE_DESCRIPCION, COORDENADAS_CONOCIDAS, HORAS_DEFECTO,
  actividadesDeSecciones, bitacoraDefecto, planificadasDefecto, seccionesPorDefecto, sinPunto,
} from './modelo';

const LS_COORDENADAS = 'psinet_coordenadas_sitios_v1';
export const leerCoordenadas = (): Record<string, string> => {
  try { return { ...COORDENADAS_CONOCIDAS, ...JSON.parse(localStorage.getItem(LS_COORDENADAS) || '{}') }; } catch { return { ...COORDENADAS_CONOCIDAS }; }
};
export const recordarCoordenadas = (sitio: string, coord: string) => {
  try {
    const actual = JSON.parse(localStorage.getItem(LS_COORDENADAS) || '{}') as Record<string, string>;
    localStorage.setItem(LS_COORDENADAS, JSON.stringify({ ...actual, [sitio]: coord }));
  } catch { /* sin almacenamiento */ }
};

/** Personal en turno de una fecha (nadie marcado aún como ejecutante). */
export const personalDelTurno = (iso: string, division: Division): PersonaPrev[] =>
  getPersonalGuardado(letraDeFecha(iso), division).map(p => ({ id: uid(), nombre: sinPunto(p.nombre), cargo: sinPunto(p.cargo), ejecutante: false }));

/** Lo que cambia de un informe a otro (lo demás se arma solo). */
export type EstadoPreventiva = Pick<DatosPreventiva, 'fecha' | 'sitio' | 'sector' | 'coordenadas' | 'creadoNombre' | 'creadoCargo' | 'personal' | 'secciones'> & { horas: HorasBitacora };

/** Lo que muestra el formulario al abrirse: lo guardado en el borrador o, si falta, lo de un informe nuevo. */
export function estadoInicialPreventiva(guardados: unknown, division: Division): EstadoPreventiva {
  const cfg = configDivision(division);
  const { carros, ubicacionPorCarro } = cfg;
  const d0 = (guardados ?? null) as Partial<DatosPreventiva> | null;
  const creadorDefecto = cfg.diario.creadorPorDefecto[letraDeFecha(hoyLocalISO()) === 'B' ? 'B' : 'A'];
  return {
    fecha: d0?.fecha ?? hoyLocalISO(),
    sitio: d0?.sitio ?? carros[0] ?? '',
    sector: d0?.sector ?? ubicacionPorCarro[carros[0]] ?? '',
    coordenadas: d0?.coordenadas ?? leerCoordenadas()[carros[0]] ?? '',
    creadoNombre: d0?.creadoNombre ?? sinPunto(creadorDefecto.nombre),
    creadoCargo: d0?.creadoCargo ?? sinPunto(creadorDefecto.cargo),
    personal: d0?.personal ?? personalDelTurno(d0?.fecha ?? hoyLocalISO(), division),
    secciones: d0?.secciones ?? seccionesPorDefecto(cfg.vertiv),
    horas: d0?.horas ?? HORAS_DEFECTO,
  };
}

/** Revisado y autorizado por (fijos de la división). */
export function firmasPreventiva(division: Division): { revisados: string[]; autorizado: { nombre: string; cargo: string } } {
  const cfg = configDivision(division);
  return {
    revisados: cfg.falla.revisadoText.split('\n').map(sinPunto).filter(Boolean),
    autorizado: division === 'el_salvador' ? { nombre: 'Cesar Orellana Martinez.', cargo: 'ADC' } : cfg.diario.autorizado,
  };
}

/** Datos completos del informe (lo que cambia + lo fijo). */
export function armarDatosPreventiva(e: EstadoPreventiva, division: Division): DatosPreventiva {
  const { revisados, autorizado } = firmasPreventiva(division);
  const { fecha, sitio, sector, coordenadas, creadoNombre, creadoCargo, personal, secciones, horas } = e;
  return {
    clase: 'preventiva', fecha, sitio, sector, coordenadas, creadoNombre, creadoCargo,
    revisados, autorizadoNombre: autorizado.nombre, autorizadoCargo: autorizado.cargo,
    actividades: actividadesDeSecciones(secciones), cierreDescripcion: CIERRE_DESCRIPCION, personal,
    administrativas: ADMINISTRATIVAS_DEFECTO, planificadas: planificadasDefecto(sitio, sector), secciones,
    bitacora: bitacoraDefecto(sitio, sector, secciones, horas), horas,
  };
}

/** Fotos cargadas en las secciones activas. */
export const fotosCargadasPreventiva = (e: Pick<EstadoPreventiva, 'secciones'>) =>
  e.secciones.filter(s => s.activa).reduce((n, s) => n + s.fotos.filter(f => f.photo).length, 0);

/** Lo que falta para poder armar el Word (null si está todo). */
export function faltaParaWordPreventiva(e: EstadoPreventiva): string | null {
  if (!e.sitio.trim()) return 'Indica el sitio.';
  if (!e.fecha) return 'Selecciona la fecha.';
  if (!fotosCargadasPreventiva(e)) return 'Agrega al menos una foto.';
  if (!e.personal.some(p => p.ejecutante)) return 'Marca quién ejecutó el mantenimiento (en Personal).';
  return null;
}
