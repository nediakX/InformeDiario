// Ventana "Importar informe desde Word": se elige el .docx que se descargó de la app, se muestra qué
// se encontró (tipo de informe, fecha, fotos…) y, al confirmar, se guarda como borrador y se abre.
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, X } from 'lucide-react';
import type { Division } from '../datos/divisiones';
import { contarFotosImportadas, importarWord, NOMBRE_TIPO, type ResultadoImportacion } from '../importar';

export interface DescripcionImportacion {
  detalles: string[];
  /** Advertencia antes de confirmar (ej: "Reemplazará el informe que ya existe para ese día"). */
  aviso?: string;
}

type Estado =
  | { paso: 'elegir' }
  | { paso: 'leyendo'; nombre: string }
  | { paso: 'confirmar'; nombre: string; resultado: ResultadoImportacion; descripcion: DescripcionImportacion }
  | { paso: 'guardando'; nombre: string }
  | { paso: 'error'; mensaje: string };

export default function ImportadorWord({ division, esAdmin, describir, guardar, onCerrar }: {
  division: Division;
  esAdmin: boolean;
  describir: (r: ResultadoImportacion) => DescripcionImportacion;
  /** Guarda lo importado y abre el informe. */
  guardar: (r: ResultadoImportacion) => Promise<void>;
  onCerrar: () => void;
}) {
  const [estado, setEstado] = useState<Estado>({ paso: 'elegir' });
  const inputRef = useRef<HTMLInputElement>(null);
  const ocupado = estado.paso === 'leyendo' || estado.paso === 'guardando';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !ocupado) onCerrar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ocupado, onCerrar]);

  const leer = async (archivo: File) => {
    setEstado({ paso: 'leyendo', nombre: archivo.name });
    try {
      const resultado = await importarWord(archivo, division, esAdmin);
      setEstado({ paso: 'confirmar', nombre: archivo.name, resultado, descripcion: describir(resultado) });
    } catch (error) {
      setEstado({ paso: 'error', mensaje: error instanceof Error ? error.message : 'No se pudo leer el archivo.' });
    }
  };

  const confirmar = async () => {
    if (estado.paso !== 'confirmar') return;
    const { resultado, nombre } = estado;
    setEstado({ paso: 'guardando', nombre });
    try {
      await guardar(resultado);
      onCerrar();
    } catch (error) {
      console.error('No se pudo guardar el informe importado:', error);
      setEstado({ paso: 'error', mensaje: 'No se pudo guardar el informe importado. Revisa tu conexión e inténtalo de nuevo.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={() => { if (!ocupado) onCerrar(); }}>
      <div
        className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="importar-titulo"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="importar-titulo" className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2">
            <FileUp size={20} aria-hidden="true" /> Importar informe desde Word
          </h2>
          {!ocupado && (
            <button type="button" onClick={onCerrar} className="text-gray-400 hover:text-gray-700" aria-label="Cerrar"><X size={20} /></button>
          )}
        </div>

        {estado.paso === 'elegir' && (
          <>
            <p className="text-sm text-gray-600">
              Si un informe se borró, puedes recuperarlo desde el Word que descargaste de la app: se vuelve a crear
              el borrador con sus textos, personal, actividades y fotos, listo para seguir editándolo.
            </p>
            <p className="text-xs text-gray-500">Sirve para Informe Diario, Cierre, Mantenimiento de Generador, Falla de Carro y Checklist de Camioneta.</p>
            <button type="button" onClick={() => inputRef.current?.click()} className="w-full bg-[#0E4660] text-white rounded-md px-4 py-3 font-bold hover:bg-[#0a3549] flex items-center justify-center gap-2">
              <FileUp size={18} aria-hidden="true" /> Elegir archivo Word (.docx)
            </button>
          </>
        )}

        {(estado.paso === 'leyendo' || estado.paso === 'guardando') && (
          <p className="text-sm text-gray-700 flex items-center gap-2" role="status">
            <Loader2 size={18} className="animate-spin text-[#0E4660]" aria-hidden="true" />
            {estado.paso === 'leyendo' ? `Leyendo «${estado.nombre}»…` : 'Guardando el informe y sus fotos en la nube…'}
          </p>
        )}

        {estado.paso === 'confirmar' && (
          <>
            <div className="rounded-lg border border-[#DCE1E6] bg-[#F6F8FA] p-4 space-y-1.5">
              <p className="font-bold text-[#0E4660] flex items-center gap-2">
                <CheckCircle2 size={18} className="text-green-600" aria-hidden="true" /> {NOMBRE_TIPO[estado.resultado.tipo]}
              </p>
              {estado.descripcion.detalles.map(d => <p key={d} className="text-sm text-gray-700">{d}</p>)}
              {contarFotosImportadas(estado.resultado) > 0 && (
                <p className="text-sm text-gray-700">{contarFotosImportadas(estado.resultado)} foto(s) recuperada(s)</p>
              )}
            </div>
            {estado.descripcion.aviso && (
              <p className="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-800 p-3 flex gap-2">
                <AlertTriangle size={18} className="flex-shrink-0" aria-hidden="true" /> {estado.descripcion.aviso}
              </p>
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEstado({ paso: 'elegir' })} className="px-4 py-2 rounded-md text-sm font-bold text-gray-600 hover:bg-gray-100">Elegir otro</button>
              <button type="button" onClick={() => void confirmar()} className="px-4 py-2 rounded-md text-sm font-bold bg-[#0E4660] text-white hover:bg-[#0a3549]">
                Importar y abrir
              </button>
            </div>
          </>
        )}

        {estado.paso === 'error' && (
          <>
            <p className="text-sm rounded-md bg-red-50 border border-red-200 text-red-800 p-3 flex gap-2" role="alert">
              <AlertTriangle size={18} className="flex-shrink-0" aria-hidden="true" /> {estado.mensaje}
            </p>
            <div className="flex justify-end">
              <button type="button" onClick={() => setEstado({ paso: 'elegir' })} className="px-4 py-2 rounded-md text-sm font-bold bg-[#0E4660] text-white hover:bg-[#0a3549]">Intentar con otro archivo</button>
            </div>
          </>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void leer(f); }}
        />
      </div>
    </div>
  );
}
