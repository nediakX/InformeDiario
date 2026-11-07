// Tema claro u oscuro. "Automático" usa el oscuro de noche (19:00 a 07:00, hora del dispositivo).
// Se guarda en este dispositivo.

export type Tema = 'automatico' | 'claro' | 'oscuro';

const CLAVE = 'psinet-tema';

export function esDeNoche(ahora = new Date()): boolean {
  const h = ahora.getHours();
  return h >= 19 || h < 7;
}

export function leerTema(): Tema {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' || v === 'automatico' ? v : 'automatico';
  } catch {
    return 'automatico';
  }
}

export function aplicarTema(t: Tema) {
  const oscuro = t === 'oscuro' || (t === 'automatico' && esDeNoche());
  document.documentElement.toggleAttribute('data-tema-oscuro', oscuro);
}

export function guardarTema(t: Tema) {
  try { localStorage.setItem(CLAVE, t); } catch { /* sin almacenamiento: vale solo esta sesión */ }
  aplicarTema(t);
}

/** Aplica el tema al abrir y lo revisa cada 5 minutos, para que el modo automático cambie de noche a día. */
export function iniciarTema() {
  aplicarTema(leerTema());
  window.setInterval(() => aplicarTema(leerTema()), 5 * 60 * 1000);
}
