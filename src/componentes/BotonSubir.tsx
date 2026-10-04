import { useState, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';

// Botón flotante para volver arriba: aparece al bajar en cualquier pantalla del panel.
export default function BotonSubir() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-5 right-4 z-40 w-11 h-11 rounded-full bg-[#0E4660] text-white shadow-lg flex items-center justify-center hover:bg-[#0a3549] active:scale-95"
      aria-label="Subir al inicio de la página"
      title="Subir"
    >
      <ArrowUp size={20} />
    </button>
  );
}
