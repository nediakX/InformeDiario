// Preferencias de accesibilidad de este dispositivo (texto grande, alto contraste, menos animaciones).
// Se guardan en localStorage: son una comodidad por dispositivo, no datos del informe.

export interface Accesibilidad {
  textoGrande: boolean;
  altoContraste: boolean;
  reducirMovimiento: boolean;
}

const CLAVE = 'psinet-accesibilidad';
export const ACCESIBILIDAD_INICIAL: Accesibilidad = { textoGrande: false, altoContraste: false, reducirMovimiento: false };

export function leerAccesibilidad(): Accesibilidad {
  try {
    const crudo = localStorage.getItem(CLAVE);
    return crudo ? { ...ACCESIBILIDAD_INICIAL, ...JSON.parse(crudo) } : ACCESIBILIDAD_INICIAL;
  } catch {
    return ACCESIBILIDAD_INICIAL;
  }
}

export function aplicarAccesibilidad(p: Accesibilidad) {
  const html = document.documentElement;
  html.toggleAttribute('data-texto-grande', p.textoGrande);
  html.toggleAttribute('data-alto-contraste', p.altoContraste);
  html.toggleAttribute('data-reducir-movimiento', p.reducirMovimiento);
}

export function guardarAccesibilidad(p: Accesibilidad) {
  aplicarAccesibilidad(p);
  try { localStorage.setItem(CLAVE, JSON.stringify(p)); } catch { /* sin almacenamiento: la preferencia dura solo esta sesión */ }
}
