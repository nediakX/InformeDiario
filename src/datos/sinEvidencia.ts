// Actividades sin bloque de evidencia (Informe Diario), compartidas entre dispositivos.
//
// Cada equipo guarda la marca en su copia local (para verla sin señal) y la sube a la nube. Si no hay
// señal, el cambio queda en la cola de sincronización y se sube al volver la conexión. Lo que se lee es
// la lista de la nube más los cambios pendientes de este equipo.
import { supabase, SIN_EVIDENCIA_TABLE } from '../lib/supabase';
import { EVENTO_SINCRONIZADO, encolarCambio, listaConCambiosLocales, registrarEjecutor } from '../lib/sincronizacion';
import {
  actividadesSinEvidencia,
  desmarcarActividadSinEvidencia,
  marcarActividadSinEvidencia,
  reemplazarActividadesSinEvidencia,
  todasLasMarcasLocales,
} from '../informes/diario/constantes';
import type { Division } from './divisiones';

type Turno = 'dia' | 'noche';

/** Una marca: la actividad de ese turno y división no vuelve a tener bloque de evidencia. */
export interface MarcaSinEvidencia {
  /** `${turno}|${division}|${actividad}`: un lugar por marca en la cola de sincronización. */
  id: string;
  turno: Turno;
  division: Division;
  actividad: string;
}

interface FilaSinEvidencia {
  turno: Turno;
  division: Division;
  actividad: string;
}

const claveMarca = (turno: Turno, division: Division, actividad: string) => `${turno}|${division}|${actividad}`;

// Turno y división no llevan "|", pero la actividad sí puede llevarlo: por eso se separa solo al principio.
const desdeClave = (id: string): FilaSinEvidencia => {
  const [turno, division, ...resto] = id.split('|');
  return { turno: turno as Turno, division: division as Division, actividad: resto.join('|') };
};

const avisarError = (error: unknown) => console.error('No se pudo guardar la marca sin evidencia:', error);

// Subida a la nube (la ejecuta la cola de sincronización).
registrarEjecutor('sin_evidencia', {
  guardar: async entry => {
    const { turno, division, actividad } = entry as FilaSinEvidencia;
    const { error } = await supabase
      .from(SIN_EVIDENCIA_TABLE)
      .upsert({ turno, division, actividad }, { onConflict: 'turno,division,actividad', ignoreDuplicates: true });
    if (error) throw error;
  },
  eliminar: async id => {
    const { turno, division, actividad } = desdeClave(id);
    const { error } = await supabase
      .from(SIN_EVIDENCIA_TABLE)
      .delete()
      .eq('turno', turno)
      .eq('division', division)
      .eq('actividad', actividad);
    if (error) throw error;
  },
});

const CLAVE_MIGRACION = 'psinet_sin_evidencia_nube_v1';

// Las marcas que ya estaban solo en este equipo (de antes de la nube) pasan a la cola para subirlas.
function subirMarcasLocalesUnaVez() {
  try {
    if (localStorage.getItem(CLAVE_MIGRACION)) return;
    for (const m of todasLasMarcasLocales()) {
      const id = claveMarca(m.turno, m.division, m.actividad);
      void encolarCambio({ tabla: 'sin_evidencia', tipo: 'guardar', id, entry: { id, ...m } }).catch(avisarError);
    }
    localStorage.setItem(CLAVE_MIGRACION, '1');
  } catch (error) {
    console.error('No se pudieron preparar las actividades sin evidencia para subirlas:', error);
  }
}

async function pedirMarcasNube(division: Division): Promise<MarcaSinEvidencia[]> {
  const { data, error } = await supabase
    .from(SIN_EVIDENCIA_TABLE)
    .select('turno, division, actividad')
    .eq('division', division);
  if (error) throw error;
  return ((data ?? []) as FilaSinEvidencia[]).map(f => ({
    id: claveMarca(f.turno, f.division, f.actividad),
    turno: f.turno,
    division: f.division,
    actividad: f.actividad,
  }));
}

/**
 * Actualiza la copia de este equipo con las marcas de la división (nube + cambios pendientes de aquí).
 * Devuelve true si cambió algo, para que los bloques de evidencia del informe se vuelvan a armar.
 */
export async function cargarSinEvidencia(division: Division): Promise<boolean> {
  const lista = await listaConCambiosLocales<MarcaSinEvidencia>(
    `cache_sin_evidencia_${division}`,
    () => pedirMarcasNube(division),
    'sin_evidencia',
    m => m.division === division,
    (a, b) => a.actividad.localeCompare(b.actividad),
  );
  let cambio = false;
  for (const turno of ['dia', 'noche'] as const) {
    const nuevas = [...new Set(lista.filter(m => m.turno === turno).map(m => m.actividad))];
    const actuales = actividadesSinEvidencia(turno, division);
    const iguales = nuevas.length === actuales.length && nuevas.every(a => actuales.includes(a));
    if (!iguales) {
      reemplazarActividadesSinEvidencia(turno, division, nuevas);
      cambio = true;
    }
  }
  return cambio;
}

/** Quita el bloque de evidencia de una actividad: no vuelve a crearse, ni en este equipo ni en los demás. */
export function marcarSinEvidencia(turno: Turno, division: Division, actividad: string) {
  marcarActividadSinEvidencia(turno, division, actividad);
  const id = claveMarca(turno, division, actividad);
  void encolarCambio({ tabla: 'sin_evidencia', tipo: 'guardar', id, entry: { id, turno, division, actividad } }).catch(avisarError);
}

/** Vuelve a permitir el bloque de evidencia de una actividad (en todos los equipos). */
export function desmarcarSinEvidencia(turno: Turno, division: Division, actividad: string) {
  desmarcarActividadSinEvidencia(turno, division, actividad);
  const id = claveMarca(turno, division, actividad);
  void encolarCambio({ tabla: 'sin_evidencia', tipo: 'eliminar', id }).catch(avisarError);
}

/** Avisa cuando cambian las marcas de la división: en otro equipo, o al subir los cambios pendientes de este. */
export function suscribirSinEvidencia(division: Division, onChange: () => void): () => void {
  const channel = supabase
    .channel(`sin-evidencia-${division}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: SIN_EVIDENCIA_TABLE, filter: `division=eq.${division}` }, () => onChange())
    .subscribe();
  const alSincronizar = () => onChange();
  window.addEventListener(EVENTO_SINCRONIZADO, alSincronizar);
  return () => {
    window.removeEventListener(EVENTO_SINCRONIZADO, alSincronizar);
    void supabase.removeChannel(channel);
  };
}

if (typeof window !== 'undefined') subirMarcasLocalesUnaVez();
