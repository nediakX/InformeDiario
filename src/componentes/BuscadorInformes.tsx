import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { fetchBorradores, type BorradorEntry } from '../datos/borradoresDiario';
import { formatDiaMes } from '../datos/fechas';

const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Texto donde buscar: fecha, turno, quién lo creó y el personal del informe. */
function textoDeBusqueda(b: BorradorEntry): string {
  const partes = [
    b.fecha, formatDiaMes(b.fecha), b.turno === 'dia' ? 'dia turno' : 'noche turno',
    b.creadoNombre, b.letraTurno ? `turno ${b.letraTurno}` : '',
    ...b.personal.map(p => p.nombre),
  ];
  return normalizar(partes.join(' '));
}

/** Buscador centrado en la barra superior. Los resultados se dibujan fuera de la barra para no quedar recortados. */
export default function BuscadorInformes() {
  const { division } = useSesion();
  const [consulta, setConsulta] = useState('');
  const [enfocado, setEnfocado] = useState(false);
  const [informes, setInformes] = useState<BorradorEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posicion, setPosicion] = useState<CSSProperties>({});
  const campoRef = useRef<HTMLDivElement>(null);
  const abierto = enfocado;

  useEffect(() => {
    if (!abierto || informes !== null) return;
    let vivo = true;
    fetchBorradores(division)
      .then(lista => { if (vivo) setInformes(lista); })
      .catch(() => { if (vivo) setError('No se pudieron cargar los informes.'); });
    return () => { vivo = false; };
  }, [abierto, informes, division]);

  // Posiciona el panel justo bajo el campo; se cierra si la página se desplaza.
  useLayoutEffect(() => {
    if (!abierto || !campoRef.current) return;
    const r = campoRef.current.getBoundingClientRect();
    setPosicion({ top: r.bottom + 6, left: r.left, width: Math.max(r.width, 340) });
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const alClic = (e: MouseEvent) => {
      const dentro = campoRef.current?.contains(e.target as Node) || (e.target as HTMLElement).closest?.('[data-buscador-panel]');
      if (!dentro) setEnfocado(false);
    };
    const alEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setEnfocado(false); };
    const alDesplazar = () => setEnfocado(false);
    document.addEventListener('mousedown', alClic);
    window.addEventListener('keydown', alEsc);
    window.addEventListener('scroll', alDesplazar, true);
    return () => {
      document.removeEventListener('mousedown', alClic);
      window.removeEventListener('keydown', alEsc);
      window.removeEventListener('scroll', alDesplazar, true);
    };
  }, [abierto]);

  const resultados = useMemo(() => {
    if (!informes) return [];
    const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
    const lista = [...informes].sort((a, b) => b.fecha.localeCompare(a.fecha));
    if (palabras.length === 0) return lista.slice(0, 8);
    return lista.filter(b => { const t = textoDeBusqueda(b); return palabras.every(p => t.includes(p)); }).slice(0, 12);
  }, [informes, consulta]);

  const abrir = (b: BorradorEntry) => {
    setEnfocado(false);
    setConsulta('');
    window.dispatchEvent(new CustomEvent('psinet:abrir-diario', { detail: b }));
  };

  return (
    <>
      <div ref={campoRef} className="buscador-cabecera">
        <label className="buscador-cabecera__campo">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={consulta}
            onChange={e => setConsulta(e.target.value)}
            onFocus={() => setEnfocado(true)}
            placeholder="Buscar informe por fecha, persona o turno"
            aria-label="Buscar informe"
            autoComplete="off"
          />
          {consulta && (
            <button type="button" onClick={() => setConsulta('')} aria-label="Limpiar búsqueda" className="buscador-cabecera__limpiar">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </label>
      </div>
      {abierto && createPortal(
        <div data-buscador-panel role="listbox" aria-label="Resultados" className="buscador-panel" style={posicion}>
          {error && <p className="px-3 py-2 text-xs text-[#a32626]">{error}</p>}
          {!error && informes === null && <p className="px-3 py-2 text-xs text-gray-500">Cargando informes…</p>}
          {informes !== null && resultados.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Ningún informe coincide.</p>}
          {resultados.map(b => (
            <button key={b.id} type="button" role="option" aria-selected={false} onClick={() => abrir(b)} className="buscador-panel__item">
              <span className="block text-sm font-bold text-[#0E4660]">{formatDiaMes(b.fecha)} · Turno {b.turno === 'dia' ? 'Día' : 'Noche'}{b.letraTurno ? ` ${b.letraTurno}` : ''}</span>
              <span className="block text-xs text-gray-500 truncate">{b.creadoNombre || 'Sin creador'}{b.sinTurno ? ' · no realizado' : ''}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
