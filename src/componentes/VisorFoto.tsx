import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Copy, Check, ChevronUp, ChevronDown } from 'lucide-react';
import { copiarImagenAlPortapapel } from '../lib/copiarImagen';
import type { FotoDelVisor } from './fotosDelVisor';
import './visorFoto.css';

interface VisorFotoProps {
  src: string;
  /** Todas las fotos del bloque: si hay más de una, se recorren desplazando hacia abajo (como en WhatsApp). */
  fotos?: FotoDelVisor[];
  /** Posición de `src` dentro de `fotos`. */
  indice?: number;
  /** Nombre del bloque (arriba a la izquierda). */
  titulo?: string;
  alt?: string;
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_PASO = 0.5;
const sinAnimacion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vista previa de una foto en grande, con zoom. Se usa en todos los formularios que cargan fotos.
 *  Si recibe las fotos del bloque, se pasa de una a otra desplazando hacia abajo (rueda del mouse,
 *  dedo, flechas del teclado o las miniaturas de abajo). */
export default function VisorFoto({ src, fotos, indice: indiceInicial, titulo, alt = 'Vista previa de la foto', onClose }: VisorFotoProps) {
  // Fotos que se recorren: las del bloque, o solo la tocada.
  const lista = useMemo<FotoDelVisor[]>(() => (fotos && fotos.length > 1 ? fotos : [{ src }]), [fotos, src]);
  const galeria = lista.length > 1;
  const [indice, setIndice] = useState(() => {
    if (!galeria) return 0;
    if (indiceInicial !== undefined && lista[indiceInicial]?.src === src) return indiceInicial;
    return Math.max(0, lista.findIndex(f => f.src === src));
  });
  const indiceRef = useRef(indice);
  const actual = lista[Math.min(indice, lista.length - 1)];

  const [zoom, setZoom] = useState(1);
  const enGaleria = galeria && zoom === 1;
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const galeriaRef = useRef<HTMLDivElement>(null);
  const fotosRef = useRef<(HTMLImageElement | null)[]>([]);
  const miniaturasRef = useRef<HTMLDivElement>(null);
  // Ancho de la foto ajustada a la pantalla (zoom 1): el zoom se calcula sobre ese tamaño.
  const [anchoBase, setAnchoBase] = useState(0);
  // Punto que se quiere mantener a la vista al acercar (fracción 0–1 de la foto).
  const anclaRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const arrastreRef = useRef<{ x: number; y: number; left: number; top: number; movio: boolean } | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const cambiarZoom = (nuevo: number, ancla?: { x: number; y: number }) => {
    const marco = marcoRef.current;
    const img = imgRef.current;
    if (!ancla && marco && img && zoom > 1) {
      // Sin punto elegido: se mantiene el centro de lo que se está viendo.
      ancla = {
        x: (marco.scrollLeft + marco.clientWidth / 2 - img.offsetLeft) / img.offsetWidth,
        y: (marco.scrollTop + marco.clientHeight / 2 - img.offsetTop) / img.offsetHeight,
      };
    }
    // Desde la galería, el zoom parte del tamaño con que se ve la foto actual.
    if (zoom === 1 && galeria) {
      const enPantalla = fotosRef.current[indiceRef.current];
      if (enPantalla) setAnchoBase(enPantalla.offsetWidth);
    }
    anclaRef.current = ancla ?? { x: 0.5, y: 0.5 };
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nuevo)));
  };

  // Al cambiar el zoom se desplaza la vista para dejar el punto elegido al centro (se puede mover
  // hacia arriba, abajo y a los lados: la foto ya no queda cortada por arriba).
  useLayoutEffect(() => {
    const marco = marcoRef.current;
    const img = imgRef.current;
    if (!marco || !img) return;
    if (zoom === 1) { setAnchoBase(img.offsetWidth); return; }
    const { x, y } = anclaRef.current;
    marco.scrollLeft = img.offsetLeft + x * img.offsetWidth - marco.clientWidth / 2;
    marco.scrollTop = img.offsetTop + y * img.offsetHeight - marco.clientHeight / 2;
  }, [zoom]);

  // Galería: al abrir (o al volver del zoom) queda en la foto actual, sin animación.
  useLayoutEffect(() => {
    if (!enGaleria) return;
    const g = galeriaRef.current;
    if (g) g.scrollTop = indiceRef.current * g.clientHeight;
  }, [enGaleria]);

  // Rueda del mouse o del touchpad: cada gesto pasa exactamente una foto (como en WhatsApp), sin
  // depender de cuánto avance cada "clic" de la rueda. Con el dedo se desliza de forma nativa.
  useEffect(() => {
    const g = galeriaRef.current;
    if (!enGaleria || !g) return;
    let acumulado = 0;
    let esperarHasta = 0;
    const alRueda = (e: WheelEvent) => {
      if (e.ctrlKey) return; // pellizco del touchpad: zoom del navegador
      e.preventDefault();
      const ahora = performance.now();
      if (ahora < esperarHasta) { acumulado = 0; return; }
      acumulado += e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
      if (Math.abs(acumulado) < 40) return;
      const paso = acumulado > 0 ? 1 : -1;
      acumulado = 0;
      esperarHasta = ahora + 450;
      const destino = Math.max(0, Math.min(lista.length - 1, indiceRef.current + paso));
      g.scrollTo({ top: destino * g.clientHeight, behavior: sinAnimacion() ? 'auto' : 'smooth' });
    };
    g.addEventListener('wheel', alRueda, { passive: false });
    return () => g.removeEventListener('wheel', alRueda);
  }, [enGaleria, lista.length]);

  // La miniatura de la foto actual queda siempre a la vista.
  useEffect(() => {
    const cont = miniaturasRef.current;
    const el = cont?.children[indice] as HTMLElement | undefined;
    if (!cont || !el) return;
    cont.scrollTo({ left: el.offsetLeft - (cont.clientWidth - el.offsetWidth) / 2, behavior: sinAnimacion() ? 'auto' : 'smooth' });
  }, [indice, enGaleria]);

  /** Va a la foto `i` del bloque (desplazando la galería). */
  const ir = (i: number) => {
    const g = galeriaRef.current;
    if (!g) return;
    const destino = Math.max(0, Math.min(lista.length - 1, i));
    g.scrollTo({ top: destino * g.clientHeight, behavior: sinAnimacion() ? 'auto' : 'smooth' });
  };
  const alDesplazarGaleria = () => {
    const g = galeriaRef.current;
    if (!g || !g.clientHeight) return;
    const i = Math.max(0, Math.min(lista.length - 1, Math.round(g.scrollTop / g.clientHeight)));
    if (i !== indiceRef.current) { indiceRef.current = i; setIndice(i); }
  };
  /** Tocar una foto de la galería la acerca en ese punto. */
  const acercarDesdeGaleria = (i: number, e: ReactMouseEvent<HTMLImageElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    indiceRef.current = i;
    setIndice(i);
    setAnchoBase(e.currentTarget.offsetWidth);
    anclaRef.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    setZoom(2);
  };

  // Con el mouse: arrastrar para moverse por la foto ampliada (en el celular se mueve con el dedo).
  const alPresionar = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (zoom === 1 || e.pointerType !== 'mouse' || !marcoRef.current) return;
    arrastreRef.current = { x: e.clientX, y: e.clientY, left: marcoRef.current.scrollLeft, top: marcoRef.current.scrollTop, movio: false };
    setArrastrando(true);
  };
  const alMover = (e: ReactPointerEvent<HTMLDivElement>) => {
    const a = arrastreRef.current;
    const marco = marcoRef.current;
    if (!a || !marco) return;
    const dx = e.clientX - a.x; const dy = e.clientY - a.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) a.movio = true;
    marco.scrollLeft = a.left - dx;
    marco.scrollTop = a.top - dy;
  };
  const alSoltar = () => { setArrastrando(false); setTimeout(() => { arrastreRef.current = null; }, 0); };

  const alTocarFoto = (e: ReactMouseEvent<HTMLImageElement>) => {
    if (arrastreRef.current?.movio) return; // fue un arrastre, no un toque
    const r = e.currentTarget.getBoundingClientRect();
    const ancla = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
    cambiarZoom(zoom === 1 ? 2 : 1, ancla);
  };

  const handleCopiar = async () => {
    const ok = await copiarImagenAlPortapapel(actual.src);
    setCopiado(ok ? 'ok' : 'error');
    setTimeout(() => setCopiado(null), 1800);
  };

  // Teclado: Esc cierra, + y - acercan, 0 vuelve al tamaño normal y, en la galería, las flechas
  // (y Re Pág / Av Pág, Inicio, Fin) pasan de foto. Se lee siempre la versión actual del manejador.
  const alTeclaRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    alTeclaRef.current = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key === '+' || event.key === '=') { cambiarZoom(zoom + ZOOM_PASO); return; }
      if (event.key === '-' || event.key === '_') { cambiarZoom(zoom - ZOOM_PASO); return; }
      if (event.key === '0') { cambiarZoom(1); return; }
      if (!enGaleria) return;
      const siguiente = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(event.key);
      const anterior = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(event.key);
      if (siguiente || anterior || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        ir(event.key === 'Home' ? 0 : event.key === 'End' ? lista.length - 1 : indiceRef.current + (siguiente ? 1 : -1));
      }
    };
  });
  useEffect(() => {
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => alTeclaRef.current(event);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = scrollPrevio;
    };
  }, []);

  return (
    <div
      className="visor-fondo fixed inset-0 z-[200] flex items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={galeria ? `Fotos${titulo ? ` de ${titulo}` : ''}` : 'Vista previa de foto'}
    >
      {galeria && (
        <div className="visor-cabecera" onClick={event => event.stopPropagation()}>
          {titulo && <span className="visor-cabecera__titulo">{titulo}</span>}
          <span className="visor-cabecera__cuenta" aria-live="polite">
            Foto {indice + 1} de {lista.length}{actual.leyenda ? ` · ${actual.leyenda}` : ''}
          </span>
        </div>
      )}

      <div className="absolute top-3 right-3 flex gap-2 z-10" onClick={event => event.stopPropagation()}>
        <button
          type="button"
          onClick={handleCopiar}
          className={`bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full ${copiado === 'ok' ? 'text-green-400' : copiado === 'error' ? 'text-red-400' : ''}`}
          aria-label="Copiar imagen al portapapeles"
          title={copiado === 'ok' ? '¡Copiada!' : copiado === 'error' ? 'No se pudo copiar' : 'Copiar imagen al portapapeles'}
        >
          {copiado === 'ok' ? <Check size={18} /> : <Copy size={18} />}
        </button>
        <button type="button" onClick={() => cambiarZoom(zoom - ZOOM_PASO)} disabled={zoom <= ZOOM_MIN} className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-full" aria-label="Alejar">
          <ZoomOut size={18} />
        </button>
        <button type="button" onClick={() => cambiarZoom(zoom + ZOOM_PASO)} disabled={zoom >= ZOOM_MAX} className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-full" aria-label="Acercar">
          <ZoomIn size={18} />
        </button>
        {zoom !== 1 && (
          <button type="button" onClick={() => cambiarZoom(1)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full" aria-label={galeria ? 'Volver a todas las fotos' : 'Restablecer zoom'} title={galeria ? 'Volver a todas las fotos' : 'Restablecer zoom'}>
            <RotateCcw size={18} />
          </button>
        )}
        <button type="button" onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full" aria-label="Cerrar vista previa">
          <X size={18} />
        </button>
      </div>

      {enGaleria ? (
        <>
          {/* Todas las fotos del bloque, una bajo otra: cada desplazamiento pasa a la siguiente. */}
          <div ref={galeriaRef} className="visor-galeria" onScroll={alDesplazarGaleria}>
            {lista.map((f, i) => (
              <div key={i} className="visor-galeria__foto">
                <img
                  ref={el => { fotosRef.current[i] = el; }}
                  src={f.src}
                  alt={f.leyenda || `${titulo ?? 'Foto'} ${i + 1} de ${lista.length}`}
                  draggable={false}
                  decoding="async"
                  onClick={e => acercarDesdeGaleria(i, e)}
                />
              </div>
            ))}
          </div>
          <div className="visor-flechas" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={() => ir(indice - 1)} disabled={indice === 0} aria-label="Foto anterior" title="Foto anterior (↑)">
              <ChevronUp size={20} />
            </button>
            <button type="button" onClick={() => ir(indice + 1)} disabled={indice === lista.length - 1} aria-label="Foto siguiente" title="Foto siguiente (↓)">
              <ChevronDown size={20} />
            </button>
          </div>
          <div ref={miniaturasRef} className="visor-miniaturas" onClick={event => event.stopPropagation()} aria-label="Fotos del bloque">
            {lista.map((f, i) => (
              <button
                key={i}
                type="button"
                onClick={() => ir(i)}
                aria-current={i === indice ? 'true' : undefined}
                aria-label={`Ver foto ${i + 1}${f.leyenda ? `: ${f.leyenda}` : ''}`}
                className={`visor-miniatura${i === indice ? ' visor-miniatura--activa' : ''}`}
              >
                <img src={f.src} alt="" draggable={false} decoding="async" />
              </button>
            ))}
          </div>
          <p className="visor-ayuda">Desliza hacia abajo o usa la rueda del mouse para ver las demás · Toca una foto para acercarla · Esc para cerrar</p>
        </>
      ) : (
        <>
          {/* "margin: auto" (y no centrar con flex) deja centrada la foto chica y, al ampliarla, permite
              recorrerla entera: con justify/align-center la parte de arriba e izquierda quedaba fuera de alcance. */}
          <div
            ref={marcoRef}
            className="w-full h-full overflow-auto flex"
            style={{ cursor: zoom > 1 ? (arrastrando ? 'grabbing' : 'grab') : undefined, touchAction: zoom > 1 ? 'pan-x pan-y' : undefined }}
            onClick={event => event.stopPropagation()}
            onPointerDown={alPresionar}
            onPointerMove={alMover}
            onPointerUp={alSoltar}
            onPointerLeave={alSoltar}
          >
            <img
              ref={imgRef}
              src={actual.src}
              alt={actual.leyenda || alt}
              draggable={false}
              onClick={alTocarFoto}
              onLoad={e => { if (zoom === 1) setAnchoBase(e.currentTarget.offsetWidth); }}
              className="select-none rounded m-auto flex-none"
              style={{
                maxWidth: zoom === 1 ? '92vw' : 'none',
                maxHeight: zoom === 1 ? '88vh' : 'none',
                width: zoom !== 1 && anchoBase ? `${Math.round(anchoBase * zoom)}px` : 'auto',
                cursor: zoom === 1 ? 'zoom-in' : 'zoom-out',
              }}
            />
          </div>

          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 w-max max-w-[92vw] text-center text-white/70 text-xs">
            {galeria
              ? 'Toca la foto para alejar y volver a todas · Arrastra o desliza para moverte · Esc para cerrar'
              : 'Toca la foto para acercar/alejar · Arrastra o desliza para moverte · Esc para cerrar · Usa el ícono de copiar para llevarla al portapapeles'}
          </p>
        </>
      )}
    </div>
  );
}
