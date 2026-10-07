/* Service worker de Psinet Informes — modo sin conexión.
 * Lo genera el build (vite.config.ts) a partir de este archivo, completando la versión y la
 * lista de archivos de la app.
 *
 * - La app completa (código, estilos, imágenes, formularios PDF) queda guardada en el dispositivo
 *   al instalarse, para poder abrirla sin señal.
 * - Las páginas se piden primero a internet (para tener siempre la última versión) y, si no hay
 *   señal, se abre la copia guardada.
 * - Las fotos de los informes y las fuentes se guardan al verlas, para mostrarlas y ponerlas en el
 *   Word sin conexión.
 * - Los datos (Supabase) no pasan por aquí: los maneja la app con su propia cola.
 */
const VERSION = '__VERSION__';
const ARCHIVOS = __ARCHIVOS__;
const CACHE_APP = `psinet-app-${VERSION}`;
const CACHE_RUNTIME = 'psinet-runtime-v1';
const CACHE_FOTOS = 'psinet-fotos-v1';
const MAX_FOTOS = 600;
const ESPERA_RED_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    await cache.addAll(ARCHIVOS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nombres = await caches.keys();
    // Se conserva también la versión anterior: una pestaña que quedó abierta con ella puede seguir
    // cargando sus pantallas sin conexión. Las más antiguas se borran.
    const versiones = nombres.filter(n => n.startsWith('psinet-app-') && n !== CACHE_APP);
    await Promise.all(versiones.slice(0, -1).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

const conTiempoMaximo = (promesa, ms) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('timeout')), ms);
  promesa.then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
});

async function pagina(request) {
  try {
    const respuesta = await conTiempoMaximo(fetch(request), ESPERA_RED_MS);
    if (respuesta.ok) {
      const cache = await caches.open(CACHE_APP);
      await cache.put('/index.html', respuesta.clone());
    }
    return respuesta;
  } catch {
    const guardada = await caches.match('/index.html');
    return guardada || Response.error();
  }
}

async function primeroGuardado(request, nombreCache) {
  const guardada = await caches.match(request);
  if (guardada) return guardada;
  const respuesta = await fetch(request);
  if (respuesta.ok) {
    const cache = await caches.open(nombreCache);
    await cache.put(request, respuesta.clone());
  }
  return respuesta;
}

async function recortarFotos(cache) {
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - MAX_FOTOS; i++) await cache.delete(claves[i]);
}

async function foto(request) {
  const url = request.url;
  const cache = await caches.open(CACHE_FOTOS);
  const guardada = await cache.match(url);
  if (guardada) return guardada;
  // Se pide en modo CORS (también para <img>) para poder guardarla y reutilizarla en el Word.
  const respuesta = await fetch(url, { mode: 'cors', credentials: 'omit' });
  if (respuesta.ok) {
    await cache.put(url, respuesta.clone());
    void recortarFotos(cache);
  }
  return respuesta;
}

async function fuente(request) {
  const cache = await caches.open(CACHE_RUNTIME);
  const guardada = await cache.match(request);
  const red = fetch(request).then(r => { if (r.ok) void cache.put(request, r.clone()); return r; }).catch(() => null);
  return guardada || (await red) || Response.error();
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (request.mode === 'navigate') { event.respondWith(pagina(request)); return; }
    if (url.pathname === '/sw.js') return;
    event.respondWith(primeroGuardado(request, CACHE_RUNTIME));
    return;
  }
  if (url.pathname.includes('/storage/v1/object/public/')) { event.respondWith(foto(request)); return; }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { event.respondWith(fuente(request)); return; }
});
