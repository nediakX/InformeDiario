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
//   /impresion                 Impresión Rápida
//   /admin/:pestana?           Panel de administración (resumen | usuarios)
//   /login, /registro          Acceso (solo sin sesión)

export type Vista = 'dashboard' | 'diario' | 'borradores' | 'cierre' | 'mantenimiento' | 'falla-carro' | 'impresion' | 'admin';
export type TipoBorradores = 'diario' | 'mantenimiento' | 'falla';
export type PestanaAdmin = 'resumen' | 'usuarios';

const BASE: Record<Vista, string> = {
  dashboard: '/',
  diario: '/informe-diario',
  borradores: '/borradores',
  cierre: '/cierre',
  mantenimiento: '/mantenimiento',
  'falla-carro': '/falla',
  impresion: '/impresion',
  admin: '/admin',
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
  if (segunda && (vista === 'cierre' || vista === 'impresion')) return { vista: null, param: null };
  return { vista, param: segunda };
}

export const esTipoBorradores = (v: string | null): v is TipoBorradores =>
  v === 'diario' || v === 'mantenimiento' || v === 'falla';

export const esPestanaAdmin = (v: string | null): v is PestanaAdmin => v === 'resumen' || v === 'usuarios';
