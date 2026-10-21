// Rutas de la app: cada pantalla tiene su propia URL, así funcionan el botón "Atrás" del
// navegador/teléfono, recargar la página sin perder la pantalla y compartir un enlace directo
// a un informe.
//
//   /                          Panel principal
//   /informe-diario/:id        Informe Diario (id del borrador)
//   /borradores/:tipo          Borradores (diario | mantenimiento | falla)
//   /cierre                    Informe de Cierre semanal
//   /mantenimiento/:id?        Mantenimiento de Generador (sin id = nuevo)
//   /falla/:id?                Informe de Falla — Carro (sin id = nuevo)
//   /mantencion-preventiva/:id? Mantención preventiva de sitio (sin id = nuevo)
//   /checklist-camioneta       Checklist diario de la camioneta
//   /impresion                 Impresión Rápida
//   /mapa-sitios               Mapa con la ubicación de los carros
//   /reportabilidad-gg         Reportabilidad de GG (formulario + tabla de grupos generadores)
//   /perfil                    Mi perfil (datos, contraseña y firma)
//   /admin/:pestana?           Panel de administración (resumen | actividades | generadores | en-linea | usuarios | actividad | sistema)
//   /login, /registro          Acceso (solo sin sesión)

export type Vista = 'dashboard' | 'diario' | 'borradores' | 'cierre' | 'mantenimiento' | 'preventiva' | 'falla-carro' | 'checklist' | 'impresion' | 'reportabilidad-gg' | 'mapa' | 'admin' | 'perfil';
export type TipoBorradores = 'diario' | 'mantenimiento' | 'falla';
export type PestanaAdmin = 'resumen' | 'actividades' | 'generadores' | 'en-linea' | 'usuarios' | 'actividad' | 'sistema';

/** Nombre legible de cada pantalla (se muestra en "Usuarios en línea"). */
export const NOMBRE_PANTALLA: Record<Vista, string> = {
  dashboard: 'Panel principal',
  diario: 'Informe Diario',
  borradores: 'Borradores',
  cierre: 'Informe de Cierre',
  mantenimiento: 'Mantenimiento de Generador',
  preventiva: 'Mantención preventiva de sitio',
  'falla-carro': 'Informe de Falla — Carro',
  checklist: 'Checklist de Camioneta',
  impresion: 'Impresión Rápida',
  'reportabilidad-gg': 'Reportabilidad de GG',
  mapa: 'Mapa de sitios',
  admin: 'Panel de administración',
  perfil: 'Mi perfil',
};

const BASE: Record<Vista, string> = {
  dashboard: '/',
  diario: '/informe-diario',
  borradores: '/borradores',
  cierre: '/cierre',
  mantenimiento: '/mantenimiento',
  preventiva: '/mantencion-preventiva',
  'falla-carro': '/falla',
  checklist: '/checklist-camioneta',
  impresion: '/impresion',
  'reportabilidad-gg': '/reportabilidad-gg',
  mapa: '/mapa-sitios',
  admin: '/admin',
  perfil: '/perfil',
};

/** URL de una pantalla; `param` es el id del informe, el tipo de borradores o la pestaña de administración. */
export function rutaDe(vista: Vista, param?: string | null): string {
  return param ? `${BASE[vista]}/${encodeURIComponent(param)}` : BASE[vista];
}

export interface RutaLeida {
  /** null = la URL no corresponde a ninguna pantalla (se redirige al panel principal). */
  vista: Vista | null;
  param: string | null;
}

export function leerRuta(pathname: string): RutaLeida {
  const partes = pathname.replace(/\/+$/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (partes.length === 0) return { vista: 'dashboard', param: null };
  const [primera, segunda = null, ...resto] = partes;
  if (resto.length) return { vista: null, param: null };
  const vista = (Object.keys(BASE) as Vista[]).find(v => v !== 'dashboard' && BASE[v] === `/${primera}`) ?? null;
  if (!vista) return { vista: null, param: null };
  if (segunda && (vista === 'cierre' || vista === 'impresion' || vista === 'reportabilidad-gg' || vista === 'checklist' || vista === 'perfil' || vista === 'mapa')) return { vista: null, param: null };
  return { vista, param: segunda };
}

export const esTipoBorradores = (v: string | null): v is TipoBorradores =>
  v === 'diario' || v === 'mantenimiento' || v === 'falla';

export const esPestanaAdmin = (v: string | null): v is PestanaAdmin =>
  v === 'resumen' || v === 'actividades' || v === 'generadores' || v === 'en-linea' || v === 'usuarios' || v === 'actividad' || v === 'sistema';
