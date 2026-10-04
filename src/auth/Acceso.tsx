// Pantalla de Iniciar sesión / Registrarse (diseño de Figma conectado a Supabase Auth).
import { useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { supabase } from '../lib/supabase';
import AuthLayout, { Field, Icon } from './AuthLayout';
import { FAENAS, formatearRut, rutValido, type Faena } from './sesion';
import { mensajeErrorAuth } from './errores';

type Pestana = 'login' | 'register';
type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

const correoValido = (correo: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

export default function Acceso() {
  // /registro abre la pestaña de registro; cualquier otra URL, la de inicio de sesión (y tras entrar,
  // la app sigue en esa URL: así un enlace directo a un informe funciona aunque haya que iniciar sesión).
  const location = useLocation();
  const navigate = useNavigate();
  const pestana: Pestana = location.pathname === '/registro' ? 'register' : 'login';
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [email, setEmail] = useState('');
  const [faena, setFaena] = useState<Faena | ''>('');
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});

  const isRegister = pestana === 'register';

  const passwordStrength = useMemo(() => {
    if (!password) return 'empty';
    const score = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /\d/.test(password),
      /[^A-Za-z0-9]/.test(password),
    ].filter(Boolean).length;
    return score >= 4 ? 'strong' : score >= 2 ? 'medium' : 'weak';
  }, [password]);

  const cambiarPestana = (nueva: Pestana) => {
    if (nueva !== pestana) navigate(nueva === 'register' ? '/registro' : '/login', { replace: true });
    setAviso(null);
    setErrores({});
    setConfirmacion('');
  };

  const validarRegistro = () => {
    const e: Record<string, string> = {};
    if (nombre.trim().length < 3) e.nombre = 'Ingrese su nombre completo.';
    if (!rutValido(rut)) e.rut = 'RUT inválido. Revise el número y el dígito verificador.';
    if (!correoValido(email)) e.email = 'Ingrese un correo válido.';
    if (!faena) e.faena = 'Seleccione una faena.';
    if (password.length < 8) e.password = 'La contraseña debe tener al menos 8 caracteres.';
    if (confirmacion !== password) e.confirmacion = 'Las contraseñas no coinciden.';
    return e;
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAviso(null);

    if (isRegister) {
      const e = validarRegistro();
      setErrores(e);
      if (Object.keys(e).length) return;
    } else {
      const e: Record<string, string> = {};
      if (!correoValido(email)) e.email = 'Ingrese un correo válido.';
      if (!password) e.password = 'Ingrese su contraseña.';
      setErrores(e);
      if (Object.keys(e).length) return;
    }

    setEnviando(true);
    try {
      if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            // Estos datos los copia la base de datos al perfil (que queda "pendiente" de aprobación).
            data: { nombre: nombre.trim(), rut: formatearRut(rut), faena },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // Con confirmación de correo activada, Supabase no inicia sesión hasta que se confirme.
        // (Si el correo ya existía, devuelve un usuario sin identidades y no envía nada.)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          setAviso({ tipo: 'error', texto: 'Ese correo ya tiene una cuenta. Inicie sesión o recupere su contraseña.' });
        } else if (!data.session) {
          setAviso({ tipo: 'ok', texto: 'Solicitud recibida. Le enviamos un correo para confirmar su dirección; después, un administrador validará sus credenciales y habilitará su acceso.' });
          setPassword('');
          setConfirmacion('');
        }
        // Si hay sesión, la app pasa sola a la pantalla de "cuenta pendiente de aprobación".
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      }
    } catch (error) {
      setAviso({ tipo: 'error', texto: mensajeErrorAuth(error) });
    } finally {
      setEnviando(false);
    }
  }

  async function recuperarContrasena() {
    setAviso(null);
    if (!correoValido(email)) {
      setErrores({ email: 'Escriba su correo para enviarle el enlace de recuperación.' });
      return;
    }
    setEnviando(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
      if (error) throw error;
      setAviso({ tipo: 'ok', texto: 'Si el correo está registrado, recibirá un enlace para crear una nueva contraseña.' });
    } catch (error) {
      setAviso({ tipo: 'error', texto: mensajeErrorAuth(error) });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <AuthLayout ariaLabel={isRegister ? 'Registro de usuarios' : 'Inicio de sesión'}>
      <nav className="tabs" aria-label="Acceso">
        <button type="button" className={`tab ${!isRegister ? 'active' : ''}`} onClick={() => cambiarPestana('login')}>
          INICIAR SESIÓN
        </button>
        <button type="button" className={`tab ${isRegister ? 'active' : ''}`} onClick={() => cambiarPestana('register')}>
          REGISTRARSE
        </button>
      </nav>

      <div className="form-heading">
        <div className="eyebrow"><span /> CREDENCIALES CORPORATIVAS</div>
        <div className="form-title">{isRegister ? 'NUEVO REGISTRO DE USUARIO' : 'BIENVENIDO A TERRENO'}</div>
        <p>
          {isRegister
            ? 'Complete sus datos corporativos para solicitar acceso al panel.'
            : 'Ingrese sus credenciales corporativas para continuar.'}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {isRegister && (
          <>
            <Field id="nombre" label="NOMBRE COMPLETO" icon="user" error={errores.nombre}>
              <input
                id="nombre"
                className="field-input"
                placeholder="Ej: Juan Pérez Soto"
                autoComplete="name"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                aria-invalid={Boolean(errores.nombre)}
              />
            </Field>
            <Field id="rut" label="RUT DEL TRABAJADOR" icon="badge" error={errores.rut}>
              <input
                id="rut"
                className="field-input"
                placeholder="Ej: 12.345.678-K"
                autoComplete="off"
                inputMode="text"
                value={rut}
                onChange={e => setRut(formatearRut(e.target.value))}
                aria-invalid={Boolean(errores.rut)}
              />
            </Field>
          </>
        )}

        <Field id="email" label="CORREO ELECTRÓNICO" icon="mail" error={errores.email}>
          <input
            id="email"
            type="email"
            className="field-input"
            placeholder="ejemplo@psinet.cl"
            autoComplete="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            aria-invalid={Boolean(errores.email)}
          />
        </Field>

        {isRegister && (
          <Field id="site" label="FAENA ASIGNADA" icon="pin" error={errores.faena}>
            <select
              id="site"
              className="field-input field-select"
              value={faena}
              onChange={e => setFaena(e.target.value as Faena)}
              aria-invalid={Boolean(errores.faena)}
            >
              <option value="" disabled>Seleccione una faena</option>
              {FAENAS.map(f => <option key={f.valor} value={f.valor}>{f.etiqueta}</option>)}
            </select>
          </Field>
        )}

        <Field id="password" label={isRegister ? 'CREAR CONTRASEÑA' : 'CONTRASEÑA'} icon="lock" error={errores.password}>
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            className="field-input"
            placeholder={isRegister ? 'Mínimo 8 caracteres' : 'Ingrese su contraseña'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            aria-invalid={Boolean(errores.password)}
          />
          <button
            type="button"
            className="visibility-button"
            onClick={() => setShowPassword(visible => !visible)}
            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Icon name={showPassword ? 'eyeOff' : 'eye'} />
          </button>
        </Field>

        {isRegister ? (
          <>
            <div className="strength-row">
              <div className={`strength-track ${passwordStrength}`}>
                <span />
                <span />
                <span />
              </div>
              <span className="strength-label">
                {passwordStrength === 'empty' ? 'SEGURIDAD' : passwordStrength === 'weak' ? 'DÉBIL' : passwordStrength === 'medium' ? 'MEDIA' : 'FUERTE'}
              </span>
            </div>
            <Field id="confirm-password" label="REPETIR CONTRASEÑA" icon="lock" error={errores.confirmacion}>
              <input
                id="confirm-password"
                type="password"
                className="field-input"
                placeholder="Repita su contraseña"
                autoComplete="new-password"
                value={confirmacion}
                onChange={e => setConfirmacion(e.target.value)}
                aria-invalid={Boolean(errores.confirmacion)}
              />
            </Field>
          </>
        ) : (
          <button type="button" className="link-button" onClick={() => void recuperarContrasena()} disabled={enviando}>
            ¿Olvidó su contraseña?
          </button>
        )}

        <button className="primary-button" type="submit" disabled={enviando}>
          <span>{enviando ? 'PROCESANDO…' : isRegister ? 'CREAR CUENTA EN TERRENO' : 'INGRESAR AL PANEL'}</span>
          <Icon name="arrow" />
        </button>

        {aviso && (
          <div className={aviso.tipo === 'ok' ? 'success-message' : 'error-message'} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>
            {aviso.texto}
          </div>
        )}

        <p className="terms">
          {isRegister
            ? 'Al registrarse declara pertenecer al personal autorizado de las faenas Rajo Inca o Andina. Su cuenta quedará pendiente hasta que un administrador la apruebe.'
            : 'El acceso está reservado exclusivamente a personal autorizado.'}
        </p>
      </form>
    </AuthLayout>
  );
}
