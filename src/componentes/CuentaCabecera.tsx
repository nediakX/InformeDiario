import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LogOut, UserRound } from 'lucide-react';
import { nombreVisible, useSesion } from '../auth/sesion';
import BuscadorInformes from './BuscadorInformes';

const CONSULTA_MOVIL = '(max-width: 720px)';

/** true en pantallas de celular: ahí la cuenta abre un menú (perfil y salir) para dejar espacio al título. */
function useEsMovil(): boolean {
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia(CONSULTA_MOVIL).matches);
  useEffect(() => {
    const consulta = window.matchMedia(CONSULTA_MOVIL);
    const alCambiar = () => setMovil(consulta.matches);
    consulta.addEventListener('change', alCambiar);
    return () => consulta.removeEventListener('change', alCambiar);
  }, []);
  return movil;
}

/** Cuenta en la barra superior (perfil y salir). Es la misma en todas las vistas. */
export default function CuentaCabecera() {
  const { perfil, esAdmin, cerrarSesion } = useSesion();
  const primerNombre = nombreVisible(perfil);
  const movil = useEsMovil();
  const botonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const abierto = movil && menu !== null;

  const irAPerfil = () => window.dispatchEvent(new CustomEvent('psinet:ir', { detail: 'perfil' }));
  const salir = () => { if (window.confirm('¿Cerrar sesión en este dispositivo?')) void cerrarSesion(); };

  const alTocarCuenta = () => {
    if (!movil) { irAPerfil(); return; }
    if (menu) { setMenu(null); return; }
    const r = botonRef.current?.getBoundingClientRect();
    if (r) setMenu({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  };

  // Menú abierto: se cierra al tocar fuera, con Escape, al girar el equipo o al desplazar la página.
  useEffect(() => {
    if (!abierto) return;
    const cerrar = () => setMenu(null);
    const alTocar = (e: PointerEvent) => {
      const destino = e.target as Node;
      if (menuRef.current?.contains(destino) || botonRef.current?.contains(destino)) return;
      cerrar();
    };
    const alTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { cerrar(); botonRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', alTocar);
    window.addEventListener('keydown', alTecla);
    window.addEventListener('resize', cerrar);
    window.addEventListener('scroll', cerrar, true);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', alTocar);
      window.removeEventListener('keydown', alTecla);
      window.removeEventListener('resize', cerrar);
      window.removeEventListener('scroll', cerrar, true);
    };
  }, [abierto]);

  return (
    <>
      <BuscadorInformes />
      <div className="site-header__cuenta">
        <button
          ref={botonRef}
          type="button"
          className="cuenta-boton"
          title={movil ? 'Mi cuenta' : `Mi perfil · ${perfil.email}`}
          aria-label={movil ? `Mi cuenta (${primerNombre})` : undefined}
          aria-haspopup={movil ? 'menu' : undefined}
          aria-expanded={movil ? abierto : undefined}
          onClick={alTocarCuenta}
        >
          <span className="cuenta-boton__avatar" aria-hidden="true">{(primerNombre[0] || '?').toUpperCase()}</span>
          <span className="cuenta-boton__nombre">{primerNombre}</span>
          {esAdmin && <span className="cuenta-boton__rol">Admin</span>}
        </button>
        <button
          type="button"
          onClick={salir}
          className="cuenta-salir" aria-label="Cerrar sesión" title="Cerrar sesión"
        >
          <LogOut size={16} aria-hidden="true" /><span className="cuenta-salir__txt">Salir</span>
        </button>
      </div>
      {abierto && menu && createPortal(
        <div ref={menuRef} className="cuenta-menu" role="menu" aria-label="Mi cuenta" style={{ top: menu.top, right: menu.right }}>
          <div className="cuenta-menu__cabecera">
            <span className="cuenta-menu__avatar" aria-hidden="true">{(primerNombre[0] || '?').toUpperCase()}</span>
            <span className="cuenta-menu__datos">
              <span className="cuenta-menu__nombre">{primerNombre}{esAdmin && <span className="cuenta-menu__rol">Admin</span>}</span>
              <span className="cuenta-menu__correo">{perfil.email}</span>
            </span>
          </div>
          <button type="button" role="menuitem" className="cuenta-menu__opcion" onClick={() => { setMenu(null); irAPerfil(); }}>
            <UserRound size={18} aria-hidden="true" /> Mi perfil
          </button>
          <button type="button" role="menuitem" className="cuenta-menu__opcion cuenta-menu__opcion--salir" onClick={() => { setMenu(null); salir(); }}>
            <LogOut size={18} aria-hidden="true" /> Cerrar sesión
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
