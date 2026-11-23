// Piezas comunes de la tabla de mantenimiento GG: estados, barra de uso y campos que se guardan solos.
import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, CircleAlert, CloudOff, DatabaseZap, Loader2 } from 'lucide-react';
import type { Vencimiento } from '../../datos/indicadoresMantenimientoGG';
import { hoyLocalISO } from '../../datos/fechas';
import { ETIQUETA_ESTADO, fmtHoras, leerHoras, type EstadoGuardado } from './formato';

/** Combustible en 4 segmentos (1/4 · 1/2 · 3/4 · Lleno). */
export function Estanque({ nivel }: { nivel: string | null }) {
  const llenos = nivel === 'Lleno' ? 4 : nivel === '3/4' ? 3 : nivel === '1/2' ? 2 : nivel === '1/4' ? 1 : 0;
  return (
    <span className="mgg-estanque" aria-hidden="true">
      {[1, 2, 3, 4].map(i => <span key={i} className={i <= llenos ? (llenos === 1 ? 'bajo' : 'lleno') : ''} />)}
    </span>
  );
}

export function Estado({ estado, texto }: { estado: Vencimiento; texto?: string }) {
  return <span className={`mgg-estado mgg-estado--${estado}`}>{texto ?? ETIQUETA_ESTADO[estado]}</span>;
}

/** Nombre del equipo y su código (con el estado del guardado al lado). */
export function NombreEquipo({ nombre, sitio, guardado }: { nombre: string; sitio: string; guardado?: EstadoGuardado }) {
  return (
    <span className="mgg-equipo">
      <span className="mgg-equipo__nombre">{nombre || sitio}</span>
      <span className="mgg-equipo__codigo">{sitio}<IconoGuardado estado={guardado} /></span>
    </span>
  );
}

/** Un dato de la ficha del equipo (celular): etiqueta, valor y una línea chica opcional. */
export function Dato({ etiqueta, valor, sub, clase }: { etiqueta: string; valor: ReactNode; sub?: ReactNode; clase?: string }) {
  return (
    <div className="mgg-dato">
      <dt>{etiqueta}</dt>
      <dd><span className={clase}>{valor}</span>{sub ? <small>{sub}</small> : null}</dd>
    </div>
  );
}

/** Barra del intervalo usado (horas desde el último / horas del intervalo). */
export function BarraUso({ usadas, total, estado, etiqueta }: { usadas: number | null; total: number; estado: Vencimiento; etiqueta: string }) {
  if (usadas === null) return null;
  const pct = Math.max(0, Math.min(100, (usadas / total) * 100));
  return (
    <span className={`mgg-barra mgg-barra--${estado}`} role="img" aria-label={etiqueta} title={etiqueta}>
      <span style={{ width: `${pct}%` }} />
    </span>
  );
}

const GUARDADO: Record<EstadoGuardado, { icono: ReactNode; texto: string; clase: string }> = {
  guardando: { icono: <Loader2 size={13} className="animate-spin" aria-hidden="true" />, texto: 'Guardando…', clase: '' },
  guardado: { icono: <Check size={13} aria-hidden="true" />, texto: 'Guardado', clase: 'mgg-guardado--ok' },
  pendiente: { icono: <CloudOff size={13} aria-hidden="true" />, texto: 'Sin señal: queda en este equipo y se sube solo', clase: 'mgg-guardado--pendiente' },
  falta_bd: { icono: <DatabaseZap size={13} aria-hidden="true" />, texto: 'No se guardó: falta actualizar la base de datos', clase: 'mgg-guardado--error' },
  error: { icono: <CircleAlert size={13} aria-hidden="true" />, texto: 'No se guardó', clase: 'mgg-guardado--error' },
};

/** Ícono chico (o ícono y texto) con el estado del guardado de un equipo. */
export function IconoGuardado({ estado, conTexto }: { estado?: EstadoGuardado; conTexto?: boolean }) {
  if (!estado) return null;
  const d = GUARDADO[estado];
  return (
    <span className={`mgg-guardado ${d.clase}`} role="status" title={d.texto}>
      {d.icono}{conTexto ? <span>{d.texto}</span> : <span className="sr-only">{d.texto}</span>}
    </span>
  );
}

const alTeclear = (e: KeyboardEvent<HTMLInputElement>, cancelar: () => void) => {
  const campo = e.currentTarget;
  if (e.key === 'Enter') campo.blur();
  // Esc: primero se descarta lo escrito y, ya con el valor guardado de vuelta, se sale del campo.
  if (e.key === 'Escape') { cancelar(); requestAnimationFrame(() => campo.blur()); }
};

/** Campo de horas: se escribe libre y se guarda al salir del campo (o con Enter). Esc deshace lo escrito. */
export function CampoHoras({ valor, onGuardar, etiqueta, className = '', id }: {
  valor: number | null; onGuardar: (v: number | null) => void; etiqueta: string; className?: string; id?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const invalido = texto !== null && Number.isNaN(leerHoras(texto));
  const confirmar = () => {
    if (texto === null) return;
    const n = leerHoras(texto);
    setTexto(null);
    if (Number.isNaN(n) || n === valor) return; // no es un número: vuelve al valor guardado
    onGuardar(n);
  };
  return (
    <input id={id} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      aria-label={etiqueta} aria-invalid={invalido || undefined}
      className={`mgg-campo mgg-campo--num${invalido ? ' mgg-campo--error' : ''}${className ? ` ${className}` : ''}`}
      value={texto ?? (valor === null ? '' : fmtHoras(valor))}
      onChange={e => setTexto(e.target.value)}
      onBlur={confirmar}
      onKeyDown={e => alTeclear(e, () => setTexto(null))} />
  );
}

/** Fecha completa (mientras se escribe, el navegador pasa por años como 0002 o 0202). */
const fechaCompleta = (v: string) => /^(19|20)\d\d-\d\d-\d\d$/.test(v);

/** Campo de fecha: se guarda apenas la fecha está completa (no se aceptan fechas futuras). */
export function CampoFecha({ valor, onGuardar, etiqueta, className = '', id }: {
  valor: string | null; onGuardar: (v: string) => void; etiqueta: string; className?: string; id?: string;
}) {
  const hoy = hoyLocalISO();
  const [texto, setTexto] = useState<string | null>(null);
  const futura = texto !== null && fechaCompleta(texto) && texto > hoy;
  const alCambiar = (v: string) => {
    if (fechaCompleta(v) && v <= hoy) {
      setTexto(null);
      if (v !== valor) onGuardar(v);
    } else {
      setTexto(v);
    }
  };
  return (
    <input id={id} type="date" max={hoy} aria-label={etiqueta} aria-invalid={futura || undefined}
      title={futura ? 'La fecha no puede ser futura' : undefined}
      className={`mgg-campo${futura ? ' mgg-campo--error' : ''}${className ? ` ${className}` : ''}`}
      value={texto ?? valor ?? ''}
      onChange={e => alCambiar(e.target.value)}
      onBlur={() => setTexto(null)} />
  );
}
