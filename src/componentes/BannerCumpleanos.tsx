// Aviso de cumpleaños en el panel del turno que corresponde, con serpentinas y confeti al entrar.
import { useEffect, useRef, useState } from 'react';
import { Cake } from 'lucide-react';
import { cumpleanerosDelTurnoHoy, type Cumpleanero } from '../datos/cumpleanos';
import type { Division } from '../datos/divisiones';
import { leerAccesibilidad } from '../lib/accesibilidad';
import './BannerCumpleanos.css';

const COLORES = ['#0E4660', '#F2A900', '#E0457B', '#2BB673', '#7B5CD6', '#FF7A45', '#2D9CDB', '#FFD400'];
const DURACION_MS = 7000;
const aleatorio = (min: number, max: number) => min + Math.random() * (max - min);
const elegir = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];

interface Serpentina {
  x: number; y: number; vy: number; vx: number;
  largo: number; ancho: number; color: string;
  fase: number; velFase: number; oscilacion: number;
  ondas: number;
}
interface Confeti {
  x: number; y: number; vy: number; vx: number;
  ancho: number; alto: number; color: string;
  rot: number; velRot: number; volteo: number; velVolteo: number;
}

/** Serpentinas (cintas largas que se mecen al caer) y confeti, dibujados en un canvas que se borra solo. */
function Serpentinas({ onFin }: { onFin: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Guardado en una referencia: que el padre se vuelva a dibujar no reinicia la animación.
  const finRef = useRef(onFin);
  finRef.current = onFin;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) { finRef.current(); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let ancho = 0, alto = 0;
    const ajustar = () => {
      ancho = window.innerWidth; alto = window.innerHeight;
      canvas.width = ancho * dpr; canvas.height = alto * dpr;
      canvas.style.width = `${ancho}px`; canvas.style.height = `${alto}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    ajustar();

    // Dos lanzamientos desde las esquinas superiores, más una lluvia de confeti desde arriba.
    const cintas: Serpentina[] = [];
    for (let i = 0; i < 46; i++) {
      const desdeIzquierda = i % 2 === 0;
      cintas.push({
        x: desdeIzquierda ? aleatorio(0, ancho * 0.25) : aleatorio(ancho * 0.75, ancho),
        y: aleatorio(-alto * 0.1, 0),
        vx: (desdeIzquierda ? 1 : -1) * aleatorio(1.5, 5),
        vy: aleatorio(2, 5),
        largo: aleatorio(90, 170),
        ancho: aleatorio(6, 10),
        color: elegir(COLORES),
        fase: aleatorio(0, Math.PI * 2),
        velFase: aleatorio(0.004, 0.009),
        oscilacion: aleatorio(14, 30),
        ondas: aleatorio(1.2, 2.2),
      });
    }
    const confeti: Confeti[] = Array.from({ length: 120 }, () => ({
      x: aleatorio(0, ancho), y: aleatorio(-alto * 0.2, 0),
      vx: aleatorio(-1.2, 1.2), vy: aleatorio(1.5, 4),
      ancho: aleatorio(6, 11), alto: aleatorio(4, 7),
      color: elegir(COLORES), rot: aleatorio(0, Math.PI * 2), velRot: aleatorio(-0.12, 0.12),
      volteo: aleatorio(0, Math.PI * 2), velVolteo: aleatorio(0.05, 0.16),
    }));

    let inicio = 0, ultimo = 0, id = 0, terminado = false;
    const dibujarCinta = (c: Serpentina, t: number, alfa: number) => {
      // La cinta es una curva que ondula: cada punto se desplaza según la fase y su distancia a la cabeza.
      const pasos = 22;
      ctx.beginPath();
      for (let k = 0; k <= pasos; k++) {
        const f = k / pasos;
        const px = c.x + Math.sin(c.fase + t * c.velFase * 1000 + f * c.ondas * Math.PI * 2) * c.oscilacion * f;
        const py = c.y - f * c.largo;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.globalAlpha = alfa;
      ctx.strokeStyle = c.color;
      ctx.lineWidth = c.ancho;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      // Brillo fino encima de la cinta.
      ctx.globalAlpha = alfa * 0.35;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, c.ancho * 0.22);
      ctx.stroke();
    };

    const frame = (now: number) => {
      if (!inicio) { inicio = now; ultimo = now; }
      const transcurrido = now - inicio;
      const paso = Math.min(3, (now - ultimo) / 16.67); // normaliza a ~60 fps
      ultimo = now;
      const alfa = transcurrido > DURACION_MS - 1200 ? Math.max(0, (DURACION_MS - transcurrido) / 1200) : 1;
      ctx.clearRect(0, 0, ancho, alto);

      for (const c of cintas) {
        c.vy += 0.035 * paso;
        c.vy *= Math.pow(0.99, paso);
        c.vx *= Math.pow(0.97, paso);
        c.x += c.vx * paso;
        c.y += c.vy * paso;
        c.fase += c.velFase * paso * 16;
        dibujarCinta(c, transcurrido, alfa);
      }

      ctx.globalAlpha = alfa;
      for (const p of confeti) {
        p.vy += 0.06 * paso;
        p.vy *= Math.pow(0.985, paso);
        p.x += (p.vx + Math.sin(p.volteo) * 0.6) * paso;
        p.y += p.vy * paso;
        p.rot += p.velRot * paso;
        p.volteo += p.velVolteo * paso;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.volteo)); // simula el giro del papel
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.ancho / 2, -p.alto / 2, p.ancho, p.alto);
        ctx.restore();
      }
      ctx.globalAlpha = 1;

      if (transcurrido < DURACION_MS && !terminado) {
        id = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, ancho, alto);
        finRef.current();
      }
    };
    id = requestAnimationFrame(frame);
    window.addEventListener('resize', ajustar);
    return () => { terminado = true; cancelAnimationFrame(id); window.removeEventListener('resize', ajustar); };
  }, []);

  return <canvas ref={ref} className="serpentinas" aria-hidden="true" />;
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
        if (!leerAccesibilidad().reducirMovimiento) setSerpentinas(true);
      })
      .catch(error => console.warn('No se pudieron leer los cumpleaños de hoy:', error));
    return () => { vigente = false; };
  }, [division]);

  if (cumple.length === 0) return null;
  const nombres = cumple.map(p => p.nombre).join(', ');
  const turnos = [...new Set(cumple.map(p => p.turno).filter(Boolean))];
  return (
    <>
      {serpentinas && <Serpentinas onFin={() => setSerpentinas(false)} />}
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
