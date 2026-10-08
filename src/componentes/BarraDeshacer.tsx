// Barra flotante "Deshacer": aparece cuando se borra algo (foto, actividad, persona, borrador…).
// Al principio muestra qué se borró; después de unos segundos queda como un botón pequeño
// mientras haya algo que se pueda restaurar. También funciona con Ctrl+Z (o ⌘+Z).
import { useEffect, useState } from 'react';
import { Undo2, X } from 'lucide-react';
import { deshacerUltimo, useDeshacer } from '../lib/deshacer';

const SEGUNDOS_EXPANDIDA = 8_000;

const esCampoDeTexto = (el: Element | null) =>
  !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

export default function BarraDeshacer() {
  const { ultima, cantidad, aviso } = useDeshacer();
  const [expandidaId, setExpandidaId] = useState<number | null>(null);
  const [avisoVisible, setAvisoVisible] = useState<number | null>(null);

  // Cada borrado nuevo se muestra expandido unos segundos.
  const [vistaId, setVistaId] = useState<number | null>(null);
  if (ultima && ultima.id !== vistaId) {
    setVistaId(ultima.id);
    setExpandidaId(ultima.id);
  }
  const [avisoVisto, setAvisoVisto] = useState<number | null>(null);
  if (aviso && aviso.en !== avisoVisto) {
    setAvisoVisto(aviso.en);
    setAvisoVisible(aviso.en);
  }

  useEffect(() => {
    if (expandidaId === null) return;
    const t = setTimeout(() => setExpandidaId(null), SEGUNDOS_EXPANDIDA);
    return () => clearTimeout(t);
  }, [expandidaId]);

  useEffect(() => {
    if (avisoVisible === null) return;
    const t = setTimeout(() => setAvisoVisible(null), 2500);
    return () => clearTimeout(t);
  }, [avisoVisible]);

  // Ctrl+Z / ⌘+Z fuera de los campos de texto (dentro de un campo, Ctrl+Z deshace lo escrito, como siempre).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      if (esCampoDeTexto(document.activeElement)) return;
      if (deshacerUltimo()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!ultima) {
    if (avisoVisible === null || !aviso) return null;
    return (
      <div className="barra-deshacer barra-deshacer--aviso" role="status">
        <Undo2 size={16} aria-hidden="true" /> {aviso.texto}
      </div>
    );
  }

  const expandida = expandidaId === ultima.id;
  if (!expandida) {
    return (
      <button type="button" className="barra-deshacer barra-deshacer--mini" onClick={() => deshacerUltimo()} title={`Deshacer: ${ultima.mensaje}`} aria-label={`Deshacer: ${ultima.mensaje}`}>
        <Undo2 size={16} aria-hidden="true" /> Deshacer{cantidad > 1 ? ` (${cantidad})` : ''}
      </button>
    );
  }

  return (
    <div className="barra-deshacer" role="status">
      <span className="barra-deshacer__texto">{ultima.mensaje}</span>
      <button type="button" className="barra-deshacer__accion" onClick={() => deshacerUltimo()}>
        <Undo2 size={16} aria-hidden="true" /> Deshacer
      </button>
      <button type="button" className="barra-deshacer__cerrar" onClick={() => setExpandidaId(null)} aria-label="Ocultar">
        <X size={16} />
      </button>
    </div>
  );
}
