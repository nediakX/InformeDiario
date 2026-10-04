// Pantalla para cuentas que todavía no tienen acceso (pendientes de aprobación o rechazadas).
import { useState } from 'react';
import AuthLayout from './AuthLayout';
import { etiquetaFaena, type Perfil } from './sesion';

export default function EstadoCuenta({ perfil, onRevisar, onCerrarSesion }: {
  perfil: Perfil | null;
  onRevisar: () => Promise<void>;
  onCerrarSesion: () => Promise<void>;
}) {
  const [revisando, setRevisando] = useState(false);
  const rechazado = perfil?.estado === 'rechazado';

  return (
    <AuthLayout ariaLabel="Estado de la cuenta">
      <div className="form-heading">
        <div className="eyebrow"><span /> ESTADO DE LA CUENTA</div>
        <div className="form-title">{rechazado ? 'SOLICITUD RECHAZADA' : 'CUENTA PENDIENTE DE APROBACIÓN'}</div>
        <p>
          {rechazado
            ? 'Un administrador rechazó esta solicitud de acceso. Si cree que es un error, contacte a su supervisor.'
            : 'Su registro fue recibido. Un administrador debe validar sus credenciales antes de que pueda usar el panel. Esta pantalla se actualiza sola cuando su cuenta sea aprobada.'}
        </p>
      </div>

      <div className="status-panel">
        <dl>
          <dt>ESTADO</dt>
          <dd><span className={`status-badge ${rechazado ? 'rechazado' : 'pendiente'}`}>{rechazado ? 'RECHAZADA' : 'PENDIENTE'}</span></dd>
          <dt>NOMBRE</dt>
          <dd>{perfil?.nombre || '—'}</dd>
          <dt>CORREO</dt>
          <dd>{perfil?.email || '—'}</dd>
          <dt>RUT</dt>
          <dd>{perfil?.rut || '—'}</dd>
          <dt>FAENA</dt>
          <dd>{etiquetaFaena(perfil?.faena)}</dd>
        </dl>
      </div>

      {!rechazado && (
        <button
          type="button"
          className="secondary-button"
          disabled={revisando}
          onClick={() => { setRevisando(true); void onRevisar().finally(() => setRevisando(false)); }}
        >
          {revisando ? 'REVISANDO…' : 'VOLVER A REVISAR'}
        </button>
      )}
      <button type="button" className="secondary-button" onClick={() => void onCerrarSesion()}>
        CERRAR SESIÓN
      </button>
    </AuthLayout>
  );
}
