import { useLayoutEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (valor: string) => void;
  className?: string;
  'aria-label'?: string;
}

/**
 * Campo de una sola línea lógica que se alarga hacia abajo cuando el texto no cabe
 * (en el celular se lee completo en vez de quedar cortado). Enter no agrega saltos de línea.
 */
export default function TextoQueCrece({ value, onChange, className = '', ...resto }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ajustar = () => {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    ajustar();
    // Al cambiar el ancho (girar el celular, abrir paneles) el texto se reacomoda.
    let ancho = el.clientWidth;
    const obs = new ResizeObserver(() => {
      if (el.clientWidth === ancho) return;
      ancho = el.clientWidth;
      ajustar();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={e => onChange(e.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }}
      className={`resize-none overflow-hidden leading-snug ${className}`}
      {...resto}
    />
  );
}
