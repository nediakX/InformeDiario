import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Copy, Check } from 'lucide-react';

interface VisorFotoProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_PASO = 0.5;

/** Convierte cualquier imagen (dataURL, blob URL o URL remota) a un Blob PNG, dibujándola en un canvas. */
function imagenAPngBlob(src: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No se pudo preparar el lienzo')); return; }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
    };
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
    img.src = src;
  });
}

/**
 * Copia una imagen directamente al portapapeles del sistema (como imagen, no como texto),
 * lista para pegar con Ctrl+V en otro programa (Word, correo, etc).
 * Se usa desde las miniaturas de foto y desde el visor ampliado.
 */
export async function copiarImagenAlPortapapel(src: string): Promise<boolean> {
  try {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') {
      throw new Error('El navegador no soporta copiar imágenes al portapapeles');
    }
    const blob = await imagenAPngBlob(src);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (err) {
    console.error('No se pudo copiar la imagen al portapapeles:', err);
    return false;
  }
}

/** Vista previa de una foto en grande, con zoom. Se usa en todos los formularios que cargan fotos. */
export default function VisorFoto({ src, alt = 'Vista previa de la foto', onClose }: VisorFotoProps) {
  const [zoom, setZoom] = useState(1);
  const [copiado, setCopiado] = useState<'ok' | 'error' | null>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
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
    const ok = await copiarImagenAlPortapapel(src);
    setCopiado(ok ? 'ok' : 'error');
    setTimeout(() => setCopiado(null), 1800);
  };

  useEffect(() => {
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_PASO));
      if (event.key === '-' || event.key === '_') setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_PASO));
      if (event.key === '0') setZoom(1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = scrollPrevio;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Vista previa de foto"
    >
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
          <button type="button" onClick={() => cambiarZoom(1)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full" aria-label="Restablecer zoom">
            <RotateCcw size={18} />
          </button>
        )}
        <button type="button" onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full" aria-label="Cerrar vista previa">
          <X size={18} />
        </button>
      </div>

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
          src={src}
          alt={alt}
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

      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/70 text-xs">
        Toca la foto para acercar/alejar · Arrastra o desliza para moverte · Esc para cerrar · Usa el ícono de copiar para llevarla al portapapeles
      </p>
    </div>
  );
}