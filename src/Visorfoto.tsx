import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface VisorFotoProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_PASO = 0.5;

/** Vista previa de una foto en grande, con zoom. Se usa en todos los formularios que cargan fotos. */
export default function VisorFoto({ src, alt = 'Vista previa de la foto', onClose }: VisorFotoProps) {
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const scrollPrevio = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === '+' || event.key === '=') setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_PASO));
      if (event.key === '-' || event.key === '_') setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_PASO));
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
        <button type="button" onClick={() => setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_PASO))} disabled={zoom <= ZOOM_MIN} className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-full" aria-label="Alejar">
          <ZoomOut size={18} />
        </button>
        <button type="button" onClick={() => setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_PASO))} disabled={zoom >= ZOOM_MAX} className="bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-white p-2.5 rounded-full" aria-label="Acercar">
          <ZoomIn size={18} />
        </button>
        {zoom !== 1 && (
          <button type="button" onClick={() => setZoom(1)} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full" aria-label="Restablecer zoom">
            <RotateCcw size={18} />
          </button>
        )}
        <button type="button" onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full" aria-label="Cerrar vista previa">
          <X size={18} />
        </button>
      </div>

      <div className="w-full h-full overflow-auto flex items-center justify-center" onClick={event => event.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          draggable={false}
          onClick={() => setZoom(z => (z === 1 ? 2 : 1))}
          className="select-none rounded"
          style={{
            maxWidth: zoom === 1 ? '92vw' : 'none',
            maxHeight: zoom === 1 ? '88vh' : 'none',
            width: zoom !== 1 ? `${zoom * 100}%` : 'auto',
            cursor: zoom === 1 ? 'zoom-in' : 'zoom-out',
            transition: 'width 0.15s ease',
          }}
        />
      </div>

      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/70 text-xs">
        Toca la foto para acercar/alejar · Esc para cerrar
      </p>
    </div>
  );
}