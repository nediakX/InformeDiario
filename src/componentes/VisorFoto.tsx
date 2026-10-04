import { useEffect, useState } from 'react';
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
        Toca la foto para acercar/alejar · Esc para cerrar · Usa el ícono de copiar para llevarla al portapapeles
      </p>
    </div>
  );
}