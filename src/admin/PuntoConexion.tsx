// Indicador de conexión (punto de color + texto: nunca solo color).
import type { EstadoConexion } from './presencia';

const ESTADO: Record<EstadoConexion, { etiqueta: string; clase: string }> = {
  en_linea: { etiqueta: 'En línea', clase: 'conexion--en-linea' },
  ausente: { etiqueta: 'Ausente', clase: 'conexion--ausente' },
  desconectado: { etiqueta: 'Desconectado', clase: 'conexion--desconectado' },
};

export default function PuntoConexion({ estado }: { estado: EstadoConexion }) {
  const { etiqueta, clase } = ESTADO[estado];
  return (
    <span className={`conexion ${clase}`}>
      <span className="conexion__punto" aria-hidden="true" /> {etiqueta}
    </span>
  );
}
