import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, FileDown, Loader2, RotateCcw, X } from 'lucide-react';

interface Props {
  /** Genera el Word: la misma acción del botón de generar del formulario. */
  onExportar: () => void;
  /** Mientras se genera el Word. */
  exportando: boolean;
  /** Ya finalizado: a mano, o porque tiene todas las fotos cargadas. */
  finalizado: boolean;
  /** Finalizado a mano: solo así se puede reabrir desde aquí. */
  finalizadoAMano: boolean;
  /** El informe ya está guardado en la nube; sin eso no se puede finalizar. */
  enNube: boolean;
  onAlternarFinalizado: () => void;
}

/**
 * Botón flotante de cierre del informe: exportar a Word y finalizar (o reabrir).
 * Va abajo a la derecha, encima del botón de subir (BotonSubir). Se abre con un toque.
 */
export default function BotonAccionesInforme({
  onExportar, exportando, finalizado, finalizadoAMano, enNube, onAlternarFinalizado,
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Se cierra al tocar fuera del botón o al presionar Escape.
  useEffect(() => {
    if (!abierto) return;
    const alTocarFuera = (evento: MouseEvent | TouchEvent) => {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false);
    };
    const alPresionarTecla = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAbierto(false);
    };
    document.addEventListener('mousedown', alTocarFuera);
    document.addEventListener('touchstart', alTocarFuera);
    document.addEventListener('keydown', alPresionarTecla);
    return () => {
      document.removeEventListener('mousedown', alTocarFuera);
      document.removeEventListener('touchstart', alTocarFuera);
      document.removeEventListener('keydown', alPresionarTecla);
    };
  }, [abierto]);

  const ejecutar = (accion: () => void) => {
    setAbierto(false);
    accion();
  };

  return (
    <div ref={contenedorRef} className="fixed bottom-20 right-4 z-40 flex flex-col items-end gap-2">
      {abierto && (
        <div className="flex flex-col gap-2 rounded-xl border border-[#DCE1E6] bg-white p-2 shadow-xl">
          <button
            type="button"
            onClick={() => ejecutar(onExportar)}
            disabled={exportando}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#0E4660] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#0a3549] disabled:cursor-not-allowed disabled:bg-[#9fb3bd]"
          >
            {exportando ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {exportando ? 'Generando Word…' : 'Exportar Word'}
          </button>

          {finalizado ? (
            finalizadoAMano && (
              <button
                type="button"
                onClick={() => ejecutar(onAlternarFinalizado)}
                className="flex items-center gap-2 whitespace-nowrap rounded-lg border-2 border-[#0E4660] px-4 py-2.5 text-sm font-bold text-[#0E4660] hover:bg-[#d5e7f8]"
              >
                <RotateCcw size={16} /> Reabrir informe
              </button>
            )
          ) : enNube ? (
            <button
              type="button"
              onClick={() => ejecutar(onAlternarFinalizado)}
              className="flex items-center gap-2 whitespace-nowrap rounded-lg border-2 border-green-600 px-4 py-2.5 text-sm font-bold text-green-700 hover:bg-green-50"
            >
              <CheckCircle2 size={16} /> Finalizar informe
            </button>
          ) : (
            <p className="max-w-[220px] px-2 pb-1 text-[11px] text-gray-500">
              Para finalizar, primero guarda el informe cargando la primera foto.
            </p>
          )}

          {finalizado && !finalizadoAMano && (
            <p className="max-w-[220px] px-2 pb-1 text-[11px] text-gray-500">
              Ya está finalizado: tiene todas las fotos cargadas.
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-label="Exportar o finalizar el informe"
        aria-expanded={abierto}
        title="Exportar o finalizar el informe"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0E4660] text-white shadow-lg hover:bg-[#0a3549] active:scale-95"
      >
        {exportando ? <Loader2 size={22} className="animate-spin" /> : abierto ? <X size={22} /> : <FileDown size={22} />}
      </button>
    </div>
  );
}
