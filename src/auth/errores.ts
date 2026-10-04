// Traduce los errores de Supabase Auth a mensajes claros en español.
export function mensajeErrorAuth(error: unknown): string {
  const e = error as { message?: string; status?: number; code?: string } | null;
  const msg = (e?.message ?? '').toLowerCase();
  const code = e?.code ?? '';

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) return 'Debe confirmar su correo antes de ingresar. Revise su bandeja de entrada (y la carpeta de spam).';
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Ese correo ya tiene una cuenta. Inicie sesión o recupere su contraseña.';
  if (msg.includes('database error saving new user')) return 'No se pudo crear la cuenta. Es probable que ese RUT ya esté registrado.';
  if (code === 'weak_password' || msg.includes('password should be')) return 'La contraseña es demasiado débil. Use al menos 8 caracteres.';
  if (code === 'same_password' || msg.includes('should be different')) return 'La nueva contraseña debe ser distinta de la anterior.';
  if (e?.status === 429 || code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || msg.includes('for security purposes'))
    return 'Demasiados intentos seguidos. Espere un momento e inténtelo de nuevo.';
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'No hay conexión con el servidor. Revise su conexión a internet.';
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) return 'El registro de nuevas cuentas está deshabilitado.';
  return 'Ocurrió un error inesperado. Inténtelo nuevamente.';
}
