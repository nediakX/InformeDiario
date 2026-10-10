// Instala el service worker (modo sin conexión) y pide al navegador que no borre los datos
// guardados en el dispositivo (informes y fotos pendientes de subir).
// Además avisa cuando se publica una versión nueva de la app, para que una pestaña que quedó
// abierta no siga con la versión anterior.
export function iniciarModoSinConexion() {
  if (!import.meta.env.PROD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  // Si la página ya estaba controlada por un service worker, un cambio de controlador = versión nueva.
  const habiaVersion = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaVersion) avisarVersionNueva();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registro => {
        // Busca versiones nuevas al volver a la pestaña y cada 15 minutos.
        const revisar = () => { void registro.update().catch(() => undefined); };
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') revisar(); });
        setInterval(revisar, 15 * 60 * 1000);
      })
      .catch(error => console.warn('No se pudo activar el modo sin conexión:', error));
    void navigator.storage?.persist?.().catch(() => false);
  });
}

function avisarVersionNueva() {
  if (document.getElementById('aviso-version-nueva')) return;
  const aviso = document.createElement('div');
  aviso.id = 'aviso-version-nueva';
  aviso.setAttribute('role', 'status');
  Object.assign(aviso.style, {
    position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)', zIndex: '70',
    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '10px',
    background: '#0E4660', color: '#fff', font: '600 14px system-ui, sans-serif', boxShadow: '0 6px 20px rgba(0,0,0,.25)',
    maxWidth: 'calc(100vw - 32px)',
  });
  const texto = document.createElement('span');
  texto.textContent = 'Hay una versión nueva de la app.';
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.textContent = 'Actualizar';
  Object.assign(boton.style, { background: '#fff', color: '#0E4660', border: '0', borderRadius: '6px', padding: '6px 12px', font: 'inherit', cursor: 'pointer' });
  boton.onclick = () => window.location.reload();
  aviso.append(texto, boton);
  document.body.appendChild(aviso);
}
