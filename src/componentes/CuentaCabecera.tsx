import { LogOut } from 'lucide-react';
import { nombreVisible, useSesion } from '../auth/sesion';
import BuscadorInformes from './BuscadorInformes';

/** Cuenta en la barra superior (perfil y salir). Es la misma en todas las vistas. */
export default function CuentaCabecera() {
  const { perfil, esAdmin, cerrarSesion } = useSesion();
  const primerNombre = nombreVisible(perfil);
  return (
    <>
      <BuscadorInformes />
    <div className="site-header__cuenta">
      <button
        type="button"
        className="cuenta-boton"
        title={`Mi perfil · ${perfil.email}`}
        onClick={() => window.dispatchEvent(new CustomEvent('psinet:ir', { detail: 'perfil' }))}
      >
        <span className="cuenta-boton__avatar" aria-hidden="true">{(primerNombre[0] || '?').toUpperCase()}</span>
        <span className="cuenta-boton__nombre">{primerNombre}</span>
        {esAdmin && <span className="cuenta-boton__rol">Admin</span>}
      </button>
      <button
        type="button"
        onClick={() => { if (window.confirm('¿Cerrar sesión en este dispositivo?')) void cerrarSesion(); }}
        className="cuenta-salir" aria-label="Cerrar sesión" title="Cerrar sesión"
      >
        <LogOut size={16} aria-hidden="true" /><span className="cuenta-salir__txt">Salir</span>
      </button>
    </div>
    </>
  );
}
