import { useState } from 'react';
import { ArrowLeft, Trash2, FolderOpen, CalendarDays, Users, Camera, Plus, Cloud, Sun, Moon, History, Download, Loader2 } from 'lucide-react';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import {
  type BorradorEntry,
  type SemanaTurno,
  DIAS_POR_TURNO,
  contarFotos,
  esSemillaSinEditar,
  estadoBorrador,
  formatDiaMes,
  formatFechaLarga,
  hoyLocalISO,
  nombreDiaSemana,
  semanaDeFecha,
  sumarDias,
} from './types';

interface BorradoresProps {
  borradores: BorradorEntry[];
  /** Pestaña activa (Día / Noche); la controla App para poder volver a la del informe que se estaba editando. */
  tab: 'dia' | 'noche';
  onTabChange: (tab: 'dia' | 'noche') => void;
  onOpen: (entry: BorradorEntry) => void;
  onDelete: (id: string) => void;
  onBack: () => void;
  /** Crea un informe nuevo con el turno (Día o Noche) que elija la persona. */
  onNew: (turno: 'dia' | 'noche') => void;
  /** Descarga el Word de un informe finalizado. */
  onDownload: (entry: BorradorEntry) => void;
  descargandoId: string | null;
}

const porFechaAsc = (a: BorradorEntry, b: BorradorEntry) => a.fecha.localeCompare(b.fecha);
const rangoSemana = (s: SemanaTurno) => `${formatDiaMes(s.inicio)} – ${formatDiaMes(s.fin)}`;

export default function Borradores({ borradores, tab, onTabChange, onOpen, onDelete, onBack, onNew, onDownload, descargandoId }: BorradoresProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [nuevoOpen, setNuevoOpen] = useState(false);

  // Calendario 7x7: solo se muestran los 7 días del turno que está trabajando hoy (A o B).
  // Cuando empieza la semana del otro turno, aquí aparecen sus 7 días y la semana anterior pasa a "Semanas anteriores".
  const hoy = hoyLocalISO();
  const semana = semanaDeFecha(hoy);
  const proxima = semanaDeFecha(sumarDias(semana.fin, 1));

  const delTurnoActual = (turno: 'dia' | 'noche') =>
    borradores.filter(b => b.turno === turno && b.fecha >= semana.inicio && b.fecha <= semana.fin);
  const lista = delTurnoActual(tab).sort(porFechaAsc);
  const finalizados = lista.filter(b => estadoBorrador(b) === 'finalizado').length;
  const enCurso = lista.filter(b => estadoBorrador(b) === 'iniciado').length;

  // Semanas ya terminadas: siguen guardadas en la base de datos y se muestran agrupadas, de la más reciente a la más antigua.
  const mapaAnteriores = new Map<string, { semana: SemanaTurno; entries: BorradorEntry[] }>();
  borradores.filter(b => b.turno === tab && b.fecha < semana.inicio).sort(porFechaAsc).forEach(entry => {
    const sem = semanaDeFecha(entry.fecha);
    const grupo = mapaAnteriores.get(sem.inicio) ?? { semana: sem, entries: [] };
    grupo.entries.push(entry);
    mapaAnteriores.set(sem.inicio, grupo);
  });
  const gruposAnteriores = [...mapaAnteriores.values()].sort((a, c) => c.semana.inicio.localeCompare(a.semana.inicio));
  const totalAnteriores = gruposAnteriores.reduce((total, g) => total + g.entries.length, 0);

  const turnos = [
    { key: 'dia', titulo: 'Turno Día', icono: <Sun size={16} /> },
    { key: 'noche', titulo: 'Turno Noche', icono: <Moon size={16} /> },
  ] as const;
  const tituloTab = tab === 'dia' ? 'Turno Día' : 'Turno Noche';

  const chipEnTurno = (
    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5B300] text-white">En turno</span>
  );

  const ESTADOS = {
    pendiente: { etiqueta: 'Pendiente', clase: 'bg-gray-100 text-gray-500', boton: 'Comenzar' },
    iniciado: { etiqueta: 'Iniciado', clase: 'bg-[#FFF3CD] text-[#856404]', boton: 'Continuar' },
    finalizado: { etiqueta: 'Finalizado', clase: 'bg-green-100 text-green-700', boton: 'Abrir' },
  } as const;

  const renderEntry = (entry: BorradorEntry) => {
    const estado = ESTADOS[estadoBorrador(entry)];
    const fotos = contarFotos(entry);
    const soloEnPantalla = esSemillaSinEditar(entry); // aún no existe en Supabase: no hay nada que eliminar
    const esHoy = entry.fecha === hoy;
    const finalizado = estadoBorrador(entry) === 'finalizado';
    const descargando = descargandoId === entry.id;
    return (
      <div key={entry.id} className={`panel p-4 flex flex-col sm:flex-row sm:items-center gap-3 ${esHoy ? 'ring-2 ring-[#F5B300]' : ''}`}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-base text-[#0E4660]">
              <span className="capitalize">{nombreDiaSemana(entry.fecha)}</span> {formatFechaLarga(entry.fecha)}
            </span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${entry.turno === 'noche' ? 'bg-[#0E4660] text-white' : 'bg-[#FFF3CD] text-[#856404]'}`}>
              Turno {entry.letraTurno} · {entry.turno === 'noche' ? 'Noche' : 'Día'}
            </span>
            {esHoy && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#F5B300] text-white">Hoy</span>}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${estado.clase}`}>{estado.etiqueta}</span>
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1"><Users size={12} /> {entry.personal.filter(p => p.nombre.trim()).length} personas</span>
            <span className="flex items-center gap-1">
              <Camera size={12} /> {fotos.total > 0 ? `${fotos.llenas} de ${fotos.total} fotos` : `${fotos.llenas} fotos`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {finalizado && (
            <button
              type="button"
              onClick={() => onDownload(entry)}
              disabled={descargandoId !== null}
              className="bg-green-600 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
              title="Descargar el informe en Word"
            >
              {descargando ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {descargando ? 'Generando…' : 'Descargar'}
            </button>
          )}
          <button type="button" onClick={() => onOpen(entry)} className="bg-[#0E4660] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#0a3549]">
            {estado.boton}
          </button>
          {!soloEnPantalla && (
            <button type="button" onClick={() => setConfirmDeleteId(entry.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100" aria-label="Eliminar borrador" title="Eliminar borrador">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>
    );
  };

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
          <button type="button" onClick={() => setNuevoOpen(true)} className="bg-[#0E4660] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#0a3549] flex items-center gap-1.5">
            <Plus size={14} /> Nuevo informe diario
          </button>
        </div>

        <div className="panel p-5">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <CalendarDays size={18} className="text-[#0E4660]" />
            <h2 className="font-display font-bold text-lg text-[#0E4660]">Turno {semana.letra} · {rangoSemana(semana)}</h2>
            {chipEnTurno}
          </div>
          <p className="text-xs text-gray-500">
            Aquí aparecen los 7 días del turno según el calendario 7x7. Cada informe queda <b>Pendiente</b> hasta que adjuntas su primera foto:
            entonces se guarda en Supabase como <b>Iniciado</b>, y pasa a <b>Finalizado</b> cuando están todas las fotos. El {formatDiaMes(proxima.inicio)} empieza
            el Turno {proxima.letra} y aquí aparecerán sus 7 días; esta semana pasará a "Semanas anteriores".
          </p>
          <div className="flex items-center justify-between gap-2 text-sm text-gray-500 mt-3">
            <span className="font-bold text-[#0E4660]">{tituloTab}</span>
            <span>{finalizados} finalizado{finalizados === 1 ? '' : 's'} · {enCurso} en curso · de {DIAS_POR_TURNO} días</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full mt-1.5 overflow-hidden flex">
            <div className="h-full bg-green-500 transition-all" style={{ width: `${Math.min(100, (finalizados / DIAS_POR_TURNO) * 100)}%` }} />
            <div className="h-full bg-[#F5B300] transition-all" style={{ width: `${Math.min(100 - (finalizados / DIAS_POR_TURNO) * 100, (enCurso / DIAS_POR_TURNO) * 100)}%` }} />
          </div>
        </div>

        <div role="tablist" aria-label="Turno" className="flex gap-2">
          {turnos.map(t => {
            const activo = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={activo}
                onClick={() => onTabChange(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold border transition-colors ${
                  activo
                    ? 'bg-[#0E4660] text-white border-[#0E4660]'
                    : 'bg-white text-[#0E4660] border-[#DCE1E6] hover:bg-[#f0f6fb]'
                }`}
              >
                {t.icono} {t.titulo}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${activo ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                  {delTurnoActual(t.key).length}
                </span>
              </button>
            );
          })}
        </div>

        {lista.length === 0 ? (
          <div className="panel p-8 text-center text-gray-500">
            <FolderOpen size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">
              {borradores.length === 0
                ? 'Aún no hay borradores. Los informes del turno aparecerán aquí automáticamente; también puedes crear uno con "Nuevo informe diario".'
                : `No hay informes de ${tituloTab} en esta semana del Turno ${semana.letra}.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">{lista.map(renderEntry)}</div>
        )}

        {totalAnteriores > 0 && (
          <details className="panel p-5">
            <summary className="panel__summary font-display font-bold text-lg">
              <History size={18} className="panel__summary-icon" strokeWidth={2.2} />
              Semanas anteriores · {tituloTab} ({totalAnteriores})
            </summary>
            <div className="space-y-5 mt-4">
              {gruposAnteriores.map(({ semana: sem, entries }) => (
                <div key={sem.inicio} className="space-y-3">
                  <div className="text-sm font-bold text-[#0E4660]">
                    Turno {sem.letra} · {rangoSemana(sem)}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {entries.length} informe{entries.length === 1 ? '' : 's'} guardado{entries.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  {entries.map(renderEntry)}
                </div>
              ))}
            </div>
          </details>
        )}
      </main>

      {nuevoOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={() => setNuevoOpen(false)}>
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4" onClick={event => event.stopPropagation()}>
            <h2 className="text-lg font-bold text-[#0E4660]">Nuevo informe diario</h2>
            <p className="text-sm text-gray-600">Parte en blanco con la fecha de hoy. ¿De qué turno?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setNuevoOpen(false); onNew('dia'); }}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-bold border border-[#DCE1E6] text-[#0E4660] hover:bg-[#f0f6fb]"
              >
                <Sun size={15} /> Turno Día
              </button>
              <button
                type="button"
                onClick={() => { setNuevoOpen(false); onNew('noche'); }}
                className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-md text-sm font-bold bg-[#0E4660] text-white hover:bg-[#0a3549]"
              >
                <Moon size={15} /> Turno Noche
              </button>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={() => setNuevoOpen(false)} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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