// Indicador de conexión (esquina inferior): avisa cuando se trabaja sin señal, cuántos cambios
// esperan para subir a la nube y cuándo quedó todo sincronizado.
import { useEffect, useRef, useState } from 'react';
import { CloudOff, RefreshCw, CloudCheck, AlertTriangle } from 'lucide-react';
import { useConexion } from '../lib/conexion';
import { sincronizar, useEstadoSincronizacion } from '../lib/sincronizacion';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function IndicadorConexion() {
  const enLinea = useConexion();
  const { pendientes, sincronizando, conError } = useEstadoSincronizacion();
  const [recienSincronizado, setRecienSincronizado] = useState(false);
  const habiaPendientes = useRef(false);

  // "Todo sincronizado" se muestra unos segundos cuando la cola se vacía.
  useEffect(() => {
    if (pendientes > 0) { habiaPendientes.current = true; return; }
    if (!habiaPendientes.current || !enLinea) return;
    habiaPendientes.current = false;
    const mostrar = setTimeout(() => setRecienSincronizado(true), 0);
    const ocultar = setTimeout(() => setRecienSincronizado(false), 3500);
    return () => { clearTimeout(mostrar); clearTimeout(ocultar); };
  }, [pendientes, enLinea]);

  let contenido: React.ReactNode = null;
  let tono = '';
  if (!enLinea) {
    tono = 'indicador-conexion--offline';
    contenido = (
      <>
        <CloudOff size={15} aria-hidden="true" />
        <span>
          <strong>Sin conexión</strong>
          {' · '}
          {pendientes > 0 ? `${plural(pendientes, 'cambio guardado', 'cambios guardados')} en este equipo` : 'lo que guardes queda en este equipo'}
        </span>
      </>
    );
  } else if (sincronizando) {
    tono = 'indicador-conexion--sync';
    contenido = (
      <>
        <RefreshCw size={15} className="indicador-conexion__girar" aria-hidden="true" />
        <span>Subiendo {plural(pendientes, 'cambio', 'cambios')} a la nube…</span>
      </>
    );
  } else if (pendientes > 0) {
    tono = conError ? 'indicador-conexion--error' : 'indicador-conexion--sync';
    contenido = (
      <>
        <AlertTriangle size={15} aria-hidden="true" />
        <span>{plural(pendientes, 'cambio por subir', 'cambios por subir')}</span>
        <button type="button" onClick={() => void sincronizar()}>Reintentar</button>
      </>
    );
  } else if (recienSincronizado) {
    tono = 'indicador-conexion--ok';
    contenido = (
      <>
        <CloudCheck size={15} aria-hidden="true" />
        <span>Todo sincronizado</span>
      </>
    );
  }

  if (!contenido) return null;
  return (
    <div className={`indicador-conexion ${tono}`} role="status" aria-live="polite">
      {contenido}
    </div>
  );
}
