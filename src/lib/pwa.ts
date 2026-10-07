// Instala el service worker (modo sin conexión) y pide al navegador que no borre los datos
// guardados en el dispositivo (informes y fotos pendientes de subir).
export function iniciarModoSinConexion() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('No se pudo activar el modo sin conexión:', error));
    void navigator.storage?.persist?.().catch(() => false);
  });
}
