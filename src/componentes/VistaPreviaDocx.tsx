// Vista previa de un Word antes de descargarlo, como un visor de PDF: las hojas una debajo de otra,
// con zoom (se ajusta solo al ancho de la pantalla) y los botones Descargar / Cerrar.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Download, Loader2, Minus, Plus, X } from 'lucide-react';
import { dibujarDocx } from '../lib/vistaDocx';

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 2.5;

export default function VistaPreviaDocx({ blob, titulo, onDescargar, onCerrar }: {
  blob: Blob;
  titulo: string;
  onDescargar: () => void;
  onCerrar: () => void;
}) {
  const areaRef = useRef<HTMLDivElement>(null);
  const hojasRef = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<'cargando' | 'listo' | 'error'>('cargando');
  const [paginas, setPaginas] = useState(0);
  const [anchoHoja, setAnchoHoja] = useState(0);
  // null = ajustado al ancho de la pantalla.
  const [zoomManual, setZoomManual] = useState<number | null>(null);
  const [anchoArea, setAnchoArea] = useState(0);

  useEffect(() => {
    let vivo = true;
    const destino = hojasRef.current;
    if (!destino) return;
    dibujarDocx(blob, destino)
      .then(hojas => {
        if (!vivo) return;
        setPaginas(hojas.length);
        setAnchoHoja(Math.max(...hojas.map(h => h.offsetWidth), 1) + 60); // + margen gris del visor (30 px por lado)
        setEstado('listo');
      })
      .catch(error => {
        console.error('No se pudo mostrar la vista previa:', error);
        if (vivo) setEstado('error');
      });
    return () => { vivo = false; };
  }, [blob]);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const medir = () => setAnchoArea(area.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(area);
    return () => obs.disconnect();
  }, []);

  // Escape cierra; el fondo no se desplaza mientras está abierta.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; };
  }, [onCerrar]);

  const zoomAjustado = anchoHoja && anchoArea ? Math.min(1, (anchoArea - 8) / anchoHoja) : 1;
  const zoom = zoomManual ?? zoomAjustado;
  const cambiarZoom = (z: number) => setZoomManual(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)));

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#3b4448]" role="dialog" aria-modal="true" aria-label={`Vista previa: ${titulo}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-[#0E4660] text-white shadow">
        <div className="min-w-0 flex-1 basis-full sm:basis-0">
          <p className="font-bold text-sm truncate">{titulo}</p>
          <p className="text-[11px] text-white/70">{estado === 'listo' ? `${paginas} ${paginas === 1 ? 'hoja' : 'hojas'} · vista previa` : 'Vista previa'}</p>
        </div>
        <div className="flex items-center gap-1 mr-auto sm:mr-0" role="group" aria-label="Zoom">
          <button type="button" aria-label="Alejar" onClick={() => cambiarZoom(zoom - 0.15)} className="p-1.5 rounded hover:bg-white/15"><Minus size={16} /></button>
          <button type="button" onClick={() => setZoomManual(null)} title="Ajustar al ancho" className="text-xs font-bold w-14 py-1 rounded hover:bg-white/15">{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label="Acercar" onClick={() => cambiarZoom(zoom + 0.15)} className="p-1.5 rounded hover:bg-white/15"><Plus size={16} /></button>
        </div>
        <button type="button" onClick={onDescargar} className="bg-white text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1.5 hover:bg-[#d5e7f8]">
          <Download size={14} /> Descargar Word
        </button>
        <button type="button" onClick={onCerrar} aria-label="Cerrar vista previa" className="p-1.5 rounded hover:bg-white/15"><X size={18} /></button>
      </div>

      <div ref={areaRef} className="flex-1 overflow-auto">
        {estado === 'cargando' && (
          <p className="text-white/80 text-sm flex items-center justify-center gap-2 py-10"><Loader2 size={18} className="animate-spin" /> Preparando vista previa…</p>
        )}
        {estado === 'error' && (
          <p className="text-white text-sm text-center py-10 px-4">No se pudo mostrar la vista previa. Puedes descargar el Word igual.</p>
        )}
        <div className="vista-docx mx-auto" style={{ zoom, width: anchoHoja ? anchoHoja : undefined, visibility: estado === 'listo' ? 'visible' : 'hidden' }}>
          <div ref={hojasRef} />
        </div>
      </div>
    </div>
  );
}
