import { useState } from 'react';
import { ArrowLeft, Trash2, FolderOpen, CalendarDays, Users, Camera, Plus, Cloud } from 'lucide-react';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import { type BorradorEntry, formatFechaLarga } from './types';

interface BorradoresProps {
  borradores: BorradorEntry[];
  onOpen: (entry: BorradorEntry) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  onNew: () => void;
}

const countFotos = (entry: BorradorEntry) =>
  entry.evidenceBlocks.reduce((total, block) => total + block.photos.filter(Boolean).length, 0)
  + entry.vertivCarroPhotos.filter(Boolean).length
  + entry.vertivItemPhotos.filter(Boolean).length;

export default function Borradores({ borradores, onOpen, onDelete, onBack, onNew }: BorradoresProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const ordenados = [...borradores].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const meta = 7;

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Borradores
              </div>
              <div className="site-header__meta text-xs truncate flex items-center gap-1">
                <Cloud size={12} /> Sincronizados en la nube · visibles en todos los dispositivos
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver al menú
          </button>
          <button type="button" onClick={onNew} className="bg-[#0E4660] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#0a3549] flex items-center gap-1.5">
            <Plus size={14} /> Nuevo informe diario
          </button>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-1">
            <CalendarDays size={18} className="text-[#0E4660]" />
            <h2 className="font-display font-bold text-lg text-[#0E4660]">Progreso de la semana</h2>
          </div>
          <p className="text-sm text-gray-500">
            {borradores.length >= meta
              ? `Tienes ${borradores.length} borradores guardados. Ya cuentas con los ${meta} días de la semana para generar el Informe de Cierre.`
              : `Tienes ${borradores.length} de ${meta} borradores guardados. Aquí aparecerá automáticamente cada informe diario que generes.`}
          </p>
          <div className="w-full h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
            <div
              className="h-full bg-[#F5B300] transition-all"
              style={{ width: `${Math.min(100, (borradores.length / meta) * 100)}%` }}
            />
          </div>
        </div>

        {ordenados.length === 0 ? (
          <div className="panel p-8 text-center text-gray-500">
            <FolderOpen size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Aún no hay borradores guardados. Genera un Informe Diario para que aparezca aquí.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {ordenados.map(entry => (
              <div key={entry.id} className="panel p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-bold text-base text-[#0E4660]">{formatFechaLarga(entry.fecha)}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${entry.turno === 'noche' ? 'bg-[#0E4660] text-white' : 'bg-[#FFF3CD] text-[#856404]'}`}>
                      Turno {entry.letraTurno} · {entry.turno === 'noche' ? 'Noche' : 'Día'}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Users size={12} /> {entry.personal.filter(p => p.nombre.trim()).length} personas</span>
                    <span className="flex items-center gap-1"><Camera size={12} /> {countFotos(entry)} fotos</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button type="button" onClick={() => onOpen(entry)} className="bg-[#0E4660] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#0a3549]">
                    Abrir
                  </button>
                  <button type="button" onClick={() => setConfirmDeleteId(entry.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100" aria-label="Eliminar borrador" title="Eliminar borrador">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-[#0E4660]">Eliminar borrador</h2>
            <p className="text-sm text-gray-600">Esta acción no se puede deshacer. ¿Deseas eliminar este borrador?</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
                className="bg-red-700 text-white rounded-md px-3 py-2 text-sm font-bold hover:bg-red-800"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
