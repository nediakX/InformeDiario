// Aviso de cumpleaños en el panel del turno que corresponde, con serpentinas y confeti al entrar.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cake } from 'lucide-react';
import { cumpleanerosDelTurnoHoy, type Cumpleanero } from '../datos/cumpleanos';
import type { Division } from '../datos/divisiones';
import { leerAccesibilidad } from '../lib/accesibilidad';
import { hoyLocalISO } from '../datos/fechas';
import './BannerCumpleanos.css';

// Paleta de PSINet: sin blanco, que se pierde sobre el fondo claro.
const COLORES = ['#0E4660', '#2D9CDB', '#F2A900', '#E0457B', '#2BB673', '#7B5CD6', '#FF7A45'];
const DURACION_MS = 6200;
const DESVANECER_MS = 1400;
const SEGMENTOS = 22;
const aleatorio = (min: number, max: number) => min + Math.random() * (max - min);
const elegir = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

interface Serpentina {
  x: number; y: number; vx: number; vy: number;
  rastro: { x: number; y: number }[];
  ancho: number; color: string;
  fase: number; velFase: number;
}
interface Confeti {
  x: number; y: number; vx: number; vy: number;
  tam: number; color: string; circulo: boolean;
  rot: number; velRot: number; volteo: number; velVolteo: number;
}

/**
 * Dos cañones de fiesta en las esquinas inferiores: lanzan cintas finas que se desvanecen a lo largo
 * y confeti suave. Todo va en un canvas que no recibe clics y se borra solo al terminar.
 */
function Serpentinas({ onFin }: { onFin: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { onFin(); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ancho = 0, alto = 0;
    const ajustar = () => {
      ancho = window.innerWidth; alto = window.innerHeight;
      canvas.width = ancho * dpr; canvas.height = alto * dpr;
      canvas.style.width = `${ancho}px`; canvas.style.height = `${alto}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    ajustar();

    const cañones = [
      { x: 0, y: alto, angulo: -Math.PI / 2 + 0.5 },
      { x: ancho, y: alto, angulo: -Math.PI / 2 - 0.5 },
    ];
    const cintas: Serpentina[] = [];
    const confeti: Confeti[] = [];
    for (const c of cañones) {
      for (let i = 0; i < 22; i++) {
        const dir = c.angulo + aleatorio(-0.38, 0.38);
        const rapidez = aleatorio(11, 19);
        cintas.push({
          x: c.x, y: c.y,
          vx: Math.cos(dir) * rapidez, vy: Math.sin(dir) * rapidez,
          rastro: [],
          ancho: aleatorio(2.5, 4), color: elegir(COLORES),
          fase: aleatorio(0, Math.PI * 2), velFase: aleatorio(0.05, 0.1),
        });
      }
      for (let i = 0; i < 34; i++) {
        const dir = c.angulo + aleatorio(-0.45, 0.45);
        const rapidez = aleatorio(7, 14);
        confeti.push({
          x: c.x, y: c.y,
          vx: Math.cos(dir) * rapidez, vy: Math.sin(dir) * rapidez,
          tam: aleatorio(4, 7), color: elegir(COLORES), circulo: Math.random() < 0.25,
          rot: aleatorio(0, Math.PI * 2), velRot: aleatorio(-0.15, 0.15),
          volteo: aleatorio(0, Math.PI * 2), velVolteo: aleatorio(0.04, 0.12),
        });
      }
    }

    let inicio = 0, id = 0, terminado = false;
    const frame = (now: number) => {
      if (!inicio) inicio = now;
      const t = now - inicio;
      const alfaGeneral = t > DURACION_MS - DESVANECER_MS ? Math.max(0, (DURACION_MS - t) / DESVANECER_MS) : 1;
      ctx.clearRect(0, 0, ancho, alto);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Cintas: la cabeza avanza con gravedad suave; el cuerpo la sigue ondeando y se va afinando y desvaneciendo.
      for (const c of cintas) {
        c.vy += 0.2;
        c.vx *= 0.982;
        c.vy *= 0.982;
        c.x += c.vx;
        c.y += c.vy;
        c.fase += c.velFase;
        c.rastro.unshift({ x: c.x, y: c.y });
        if (c.rastro.length > SEGMENTOS) c.rastro.length = SEGMENTOS;
        if (c.rastro.length < 2) continue;

        ctx.strokeStyle = c.color;
        for (let k = 1; k < c.rastro.length; k++) {
          const a = c.rastro[k - 1], b = c.rastro[k];
          const f = k / c.rastro.length;
          ctx.globalAlpha = alfaGeneral * (1 - f) * 0.85;
          ctx.lineWidth = Math.max(0.8, c.ancho * (1 - f * 0.6));
          const onda = Math.sin(c.fase + k * 0.45) * 4 * f;
          ctx.beginPath();
          ctx.moveTo(a.x + onda, a.y);
          ctx.lineTo(b.x + onda, b.y);
          ctx.stroke();
        }
      }

      // Confeti: cae frenado por el aire, girando y volteándose como papel.
      for (const p of confeti) {
        p.vy += 0.12;
        p.vx *= 0.965;
        p.vy *= 0.965;
        p.x += p.vx + Math.sin(p.volteo) * 0.5;
        p.y += p.vy;
        p.rot += p.velRot;
        p.volteo += p.velVolteo;
        ctx.globalAlpha = alfaGeneral * 0.9;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.volteo));
        ctx.fillStyle = p.color;
        if (p.circulo) {
          ctx.beginPath();
          ctx.arc(0, 0, p.tam / 2.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.tam / 2, -p.tam / 3, p.tam, p.tam / 1.5);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (t < DURACION_MS && !terminado) {
        id = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, ancho, alto);
        onFin();
      }
    };
    id = requestAnimationFrame(frame);
    window.addEventListener('resize', ajustar);
    return () => { terminado = true; cancelAnimationFrame(id); window.removeEventListener('resize', ajustar); };
  }, [onFin]);

  return <canvas ref={ref} className="serpentinas" aria-hidden="true" />;
}

// Las serpentinas salen solo la primera vez del día en este equipo; después aparece solo el aviso.
// Una marca por día y por división: al cambiar de división, las serpentinas de esa división también salen.
const claveSerpentinas = (division: Division) => `psinet-serpentinas-${division}-${hoyLocalISO()}`;
const yaSalieronHoy = (division: Division) => { try { return localStorage.getItem(claveSerpentinas(division)) === '1'; } catch { return false; } };
const marcarSalieron = (division: Division) => { try { localStorage.setItem(claveSerpentinas(division), '1'); } catch { /* sin almacenamiento: no pasa nada */ } };

export default function BannerCumpleanos({ division }: { division: Division }) {
  const [cumple, setCumple] = useState<Cumpleanero[]>([]);
  const [serpentinas, setSerpentinas] = useState(false);
  const terminarSerpentinas = useCallback(() => setSerpentinas(false), []);

  useEffect(() => {
    let vigente = true;
    cumpleanerosDelTurnoHoy(division)
      .then(lista => {
        if (!vigente) return;
        setCumple(lista);
        if (lista.length === 0) return;
        // Serpentinas: solo la primera vez del día y si el dispositivo no pidió menos animaciones.
        if (!leerAccesibilidad().reducirMovimiento && !yaSalieronHoy(division)) {
          marcarSalieron(division);
          setSerpentinas(true);
        }
      })
      .catch(error => { console.warn('No se pudieron leer los cumpleaños de hoy:', error); if (vigente) setCumple([]); });
    return () => { vigente = false; };
  }, [division]);

  if (cumple.length === 0) return null;
  const nombres = cumple.map(p => p.nombre).join(', ');
  const turnos = [...new Set(cumple.map(p => p.turno).filter(Boolean))];
  return (
    <>
      {serpentinas && <Serpentinas onFin={terminarSerpentinas} />}
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
