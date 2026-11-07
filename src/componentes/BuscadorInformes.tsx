import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { fetchBorradores, type BorradorEntry } from '../datos/borradoresDiario';
import { formatDiaMes } from '../datos/fechas';

const normalizar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Texto donde buscar: fecha, turno, quién lo creó y el personal del informe. */
function textoDeBusqueda(b: BorradorEntry): string {
  const partes = [
    b.fecha, formatDiaMes(b.fecha), b.turno === 'dia' ? 'dia turno' : 'noche turno',
    b.creadoNombre, b.letraTurno ? `turno ${b.letraTurno}` : '',
    ...b.personal.map(p => p.nombre),
  ];
  return normalizar(partes.join(' '));
}

/** Busca informes diarios guardados (sin entrar a Borradores). Carga la lista la primera vez que se abre. */
export default function BuscadorInformes() {
  const { division } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const [informes, setInformes] = useState<BorradorEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto || informes !== null) return;
    let vivo = true;
    fetchBorradores(division)
      .then(lista => { if (vivo) setInformes(lista); })
      .catch(() => { if (vivo) setError('No se pudieron cargar los informes.'); });
    return () => { vivo = false; };
  }, [abierto, informes, division]);

  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => { if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false); };
    const alEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', alClic);
    window.addEventListener('keydown', alEsc);
    return () => { document.removeEventListener('mousedown', alClic); window.removeEventListener('keydown', alEsc); };
  }, [abierto]);

  const resultados = useMemo(() => {
    if (!informes) return [];
    const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
    const lista = [...informes].sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (palabras.length === 0) return lista.slice(0, 8);
    return lista.filter(b => { const t = textoDeBusqueda(b); return palabras.every(p => t.includes(p)); }).slice(0, 12);
  }, [informes, consulta]);

  const abrir = (b: BorradorEntry) => {
    setAbierto(false);
    setConsulta('');
    window.dispatchEvent(new CustomEvent('psinet:abrir-diario', { detail: b }));
  };

  return (
    <div ref={contenedorRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}
        aria-label="Buscar informes"
        title="Buscar informes"
        className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
      >
        <Search size={17} aria-hidden="true" />
      </button>
      {abierto && (
        <div role="dialog" aria-label="Buscar informes" className="absolute right-0 top-11 z-50 w-[340px] rounded-xl border border-[#C9D3DA] bg-white p-3 shadow-xl space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-[#C9D3DA] px-2">
            <Search size={14} className="text-[#0E4660]" aria-hidden="true" />
            <input
              autoFocus
              type="search"
              value={consulta}
              onChange={e => setConsulta(e.target.value)}
              placeholder="Fecha, persona o turno (ej: 07/11 Patricio)"
              aria-label="Buscar informe"
              className="w-full py-2 text-sm text-[#0E4660] outline-none bg-transparent"
            />
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-[#0E4660] p-1"><X size={14} /></button>
          </div>
          {error && <p className="text-xs text-[#a32626]">{error}</p>}
          {!error && informes === null && <p className="text-xs text-gray-500">Cargando informes…</p>}
          {informes !== null && resultados.length === 0 && <p className="text-xs text-gray-500">Ningún informe coincide.</p>}
          <ul className="max-h-[320px] overflow-y-auto space-y-1">
            {resultados.map(b => (
              <li key={b.id}>
                <button type="button" onClick={() => abrir(b)} className="w-full text-left rounded-md px-2 py-2 hover:bg-[#eef5fb]">
                  <span className="block text-sm font-bold text-[#0E4660]">{formatDiaMes(b.fecha)} · Turno {b.turno === 'dia' ? 'Día' : 'Noche'}{b.letraTurno ? ` ${b.letraTurno}` : ''}</span>
                  <span className="block text-xs text-gray-500 truncate">{b.creadoNombre || 'Sin creador'}{b.sinTurno ? ' · no realizado' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
