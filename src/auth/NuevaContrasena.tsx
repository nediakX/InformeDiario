// Se muestra al abrir el enlace de "recuperar contraseña" que llega por correo.
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import AuthLayout, { Field, Icon } from './AuthLayout';
import { mensajeErrorAuth } from './errores';

export default function NuevaContrasena({ onListo }: { onListo: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (password !== confirmacion) { setError('Las contraseñas no coinciden.'); return; }
    setEnviando(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password });
    setEnviando(false);
    if (err) { setError(mensajeErrorAuth(err)); return; }
    onListo();
  }

  return (
    <AuthLayout ariaLabel="Crear nueva contraseña">
      <div className="form-heading">
        <div className="eyebrow"><span /> RECUPERACIÓN DE ACCESO</div>
        <div className="form-title">CREAR NUEVA CONTRASEÑA</div>
        <p>Ingrese una contraseña nueva para su cuenta.</p>
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <Field id="new-password" label="NUEVA CONTRASEÑA" icon="lock">
          <input id="new-password" type="password" className="field-input" placeholder="Mínimo 8 caracteres" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
        </Field>
        <Field id="new-password-2" label="REPETIR CONTRASEÑA" icon="lock">
          <input id="new-password-2" type="password" className="field-input" placeholder="Repita su contraseña" autoComplete="new-password" value={confirmacion} onChange={e => setConfirmacion(e.target.value)} />
        </Field>
        <button className="primary-button" type="submit" disabled={enviando}>
          <span>{enviando ? 'GUARDANDO…' : 'GUARDAR CONTRASEÑA'}</span>
          <Icon name="arrow" />
        </button>
        {error && <div className="error-message" role="alert">{error}</div>}
      </form>
    </AuthLayout>
  );
}
