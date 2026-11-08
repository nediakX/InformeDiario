import { useEffect, useRef, useState } from 'react';
import { Accessibility, X } from 'lucide-react';
import { guardarAccesibilidad, leerAccesibilidad, type Accesibilidad } from '../lib/accesibilidad';
import { guardarTema, leerTema, type Tema } from '../lib/tema';

const OPCIONES_TEMA: { valor: Tema; etiqueta: string }[] = [
  { valor: 'automatico', etiqueta: 'Auto (noche)' },
  { valor: 'claro', etiqueta: 'Claro' },
  { valor: 'oscuro', etiqueta: 'Oscuro' },
];

const OPCIONES_ACCESIBILIDAD: { clave: keyof Accesibilidad; titulo: string }[] = [
  { clave: 'textoGrande', titulo: 'Texto grande' },
  { clave: 'altoContraste', titulo: 'Alto contraste' },
  { clave: 'reducirMovimiento', titulo: 'Reducir animaciones' },
];

/** Botón flotante visible en todas las vistas para cambiar apariencia y accesibilidad. */
export default function PreferenciasFlotantes() {
  const [abierto, setAbierto] = useState(false);
  const [tema, setTema] = useState<Tema>(() => leerTema());
  const [acc, setAcc] = useState<Accesibilidad>(() => leerAccesibilidad());
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Con el panel abierto: Escape o un toque/clic fuera de él lo cierran.
  useEffect(() => {
    if (!abierto) return;
    const alPulsarEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false); };
    const alPulsarFuera = (e: PointerEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    window.addEventListener('keydown', alPulsarEsc);
    document.addEventListener('pointerdown', alPulsarFuera);
    return () => {
      window.removeEventListener('keydown', alPulsarEsc);
      document.removeEventListener('pointerdown', alPulsarFuera);
    };
  }, [abierto]);

  const elegirTema = (t: Tema) => { setTema(t); guardarTema(t); };
  const alternar = (clave: keyof Accesibilidad) => {
    const siguiente = { ...acc, [clave]: !acc[clave] };
    setAcc(siguiente);
    guardarAccesibilidad(siguiente);
  };

  return (
    <div ref={contenedorRef} className="fixed bottom-4 left-4 z-40 flex items-end gap-2 print:hidden">
      {abierto && (
        <div
          role="dialog"
          aria-label="Apariencia y accesibilidad"
          className="mb-2 w-[260px] rounded-xl border border-[#C9D3DA] bg-white p-4 shadow-xl space-y-4"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm text-[#0E4660]">Apariencia</span>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-[#0E4660] hover:bg-[#eef5fb] rounded p-1"><X size={14} /></button>
          </div>
          <div role="radiogroup" aria-label="Tema" className="flex rounded-md border border-[#C9D3DA] overflow-hidden text-[11px] font-bold">
            {OPCIONES_TEMA.map(o => (
              <button key={o.valor} type="button" role="radio" aria-checked={tema === o.valor} onClick={() => elegirTema(o.valor)}
                className={`flex-1 px-2 py-1.5 ${tema === o.valor ? 'bg-[#0E4660] text-white' : 'bg-white text-[#0E4660] hover:bg-[#eef5fb]'}`}>
                {o.etiqueta}
              </button>
            ))}
          </div>
          <ul className="space-y-2.5">
            {OPCIONES_ACCESIBILIDAD.map(o => (
              <li key={o.clave} className="flex items-center justify-between gap-3">
                <span id={`flot-${o.clave}`} className="text-sm font-bold text-[#0E4660]">{o.titulo}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={acc[o.clave]}
                  aria-labelledby={`flot-${o.clave}`}
                  onClick={() => alternar(o.clave)}
                  className={`relative flex-none w-10 h-5 rounded-full transition-colors ${acc[o.clave] ? 'bg-[#0E4660]' : 'bg-[#C9D3DA]'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${acc[o.clave] ? 'translate-x-5' : ''}`} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Con el panel abierto el botón se oculta: el panel tiene su propio botón de cerrar. */}
      {!abierto && (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-expanded={false}
          aria-label="Apariencia y accesibilidad"
          title="Apariencia y accesibilidad"
          className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0E4660] text-white shadow-lg hover:bg-[#0a3549] focus-visible:outline focus-visible:outline-3 focus-visible:outline-[#F5B300]"
        >
          <Accessibility size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
