// Selector de división (El Salvador / Andina). Solo lo ven los administradores: al cambiar, toda la
// app (borradores, informes, indicadores e impresión) pasa a trabajar con la otra división.
// Los demás usuarios ven solo una etiqueta con la división de su cuenta.
import { MapPin } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { CONFIG_DIVISION, DIVISIONES } from '../datos/divisiones';

export default function SelectorDivision({ className = '' }: { className?: string }) {
  const { esAdmin, division, setDivision } = useSesion();

  if (!esAdmin) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold text-[#0E4660] bg-[#e3edf3] rounded-full px-3 py-1.5 ${className}`}>
        <MapPin size={14} /> {CONFIG_DIVISION[division].nombre}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label="División" className={`inline-flex items-center rounded-full border border-[#DCE1E6] bg-white p-0.5 text-xs font-bold ${className}`}>
      <MapPin size={14} className="mx-1.5 text-[#0E4660]" aria-hidden="true" />
      {DIVISIONES.map(d => {
        const activa = d === division;
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={() => { if (!activa) setDivision(d); }}
            className={`rounded-full px-3 py-1 transition-colors ${activa ? 'bg-[#0E4660] text-white' : 'text-[#0E4660] hover:bg-[#e3edf3]'}`}
          >
            {CONFIG_DIVISION[d].nombreCorto}
          </button>
        );
      })}
    </div>
  );
}
