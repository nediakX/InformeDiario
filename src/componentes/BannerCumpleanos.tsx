// Aviso de cumpleaños en el panel del turno que corresponde, con serpentinas al entrar.
import { useEffect, useMemo, useState } from 'react';
import { Cake } from 'lucide-react';
import { cumpleanerosDelTurnoHoy, type Cumpleanero } from '../datos/cumpleanos';
import type { Division } from '../datos/divisiones';
import { leerAccesibilidad } from '../lib/accesibilidad';
import './BannerCumpleanos.css';

const COLORES = ['#0E4660', '#F2A900', '#E0457B', '#2BB673', '#7B5CD6', '#FF7A45', '#2D9CDB'];

function Serpentinas() {
  // Posiciones fijas por montaje (no cambian al re-renderizar).
  const piezas = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    x: `${(i * 37) % 100}%`,
    color: COLORES[i % COLORES.length],
    dur: `${3.6 + ((i * 13) % 20) / 10}s`,
    retardo: `${((i * 7) % 12) / 10}s`,
    deriva: `${((i * 29) % 80) - 40}px`,
  })), []);
  return (
    <div className="serpentinas" aria-hidden="true">
      {piezas.map((p, i) => (
        <span key={i} className="serpentina" style={{
          '--x': p.x, '--color': p.color, '--dur': p.dur, '--retardo': p.retardo, '--deriva': p.deriva,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

export default function BannerCumpleanos({ division }: { division: Division }) {
  const [cumple, setCumple] = useState<Cumpleanero[]>([]);
  const [serpentinas, setSerpentinas] = useState(false);

  useEffect(() => {
    let vigente = true;
    cumpleanerosDelTurnoHoy(division)
      .then(lista => {
        if (!vigente || lista.length === 0) return;
        setCumple(lista);
        // Serpentinas solo si el dispositivo no pidió menos animaciones.
        if (!leerAccesibilidad().reducirMovimiento) {
          setSerpentinas(true);
          window.setTimeout(() => { if (vigente) setSerpentinas(false); }, 7000);
        }
      })
      .catch(error => console.warn('No se pudieron leer los cumpleaños de hoy:', error));
    return () => { vigente = false; };
  }, [division]);

  if (cumple.length === 0) return null;
  const nombres = cumple.map(p => p.nombre).join(', ');
  const turnos = [...new Set(cumple.map(p => p.turno).filter(Boolean))];
  return (
    <>
      {serpentinas && <Serpentinas />}
      <div className="banner-cumple" role="status">
        <Cake size={22} aria-hidden="true" />
        <span>
          ¡Feliz cumpleaños! Hoy cumple años {nombres}
          {turnos.length > 0 && <> · Turno {turnos.join(' y ')}</>}.
        </span>
      </div>
    </>
  );
}
