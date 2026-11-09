// Recordatorio (no obligatorio) para completar los datos de "Mi perfil". Se puede cerrar por hoy.
import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import './RecordatorioPerfil.css';

// Para no ser invasivo, el recordatorio aparece como máximo una vez por semana en cada equipo.
const DIAS_ENTRE_AVISOS = 7;
const DIA_MS = 24 * 60 * 60 * 1000;
const clave = (id: string) => `psinet-recordatorio-perfil-${id}`;

/** true = ya se mostró hace menos de una semana (no se muestra de nuevo). Si no, lo registra como mostrado ahora. */
function yaMostradoEstaSemana(id: string): boolean {
  try {
    const ultimo = Number(localStorage.getItem(clave(id)) ?? 0);
    if (ultimo && Date.now() - ultimo < DIAS_ENTRE_AVISOS * DIA_MS) return true;
    localStorage.setItem(clave(id), String(Date.now()));
    return false;
  } catch {
    return false;
  }
}

export default function RecordatorioPerfil({ onIr }: { onIr: () => void }) {
  const { perfil } = useSesion();
  // Se decide una vez al montar: si ya salió esta semana, no vuelve a aparecer hasta la próxima.
  const [cerrado, setCerrado] = useState(() => yaMostradoEstaSemana(perfil.id));

  const faltan: string[] = [];
  if (!perfil.rut?.trim()) faltan.push('RUT');
  if (!perfil.fecha_nacimiento) faltan.push('fecha de nacimiento');
  if (!perfil.firma) faltan.push('firma');
  if (faltan.length === 0 || cerrado) return null;

  const cerrar = () => setCerrado(true);
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;

  return (
    <div className="recordatorio-perfil" role="status">
      <Bell size={20} aria-hidden="true" />
      <span className="recordatorio-perfil__texto">
        Recuerda completar tu perfil: falta {lista}.
      </span>
      <button type="button" onClick={onIr} className="recordatorio-perfil__boton">Completar perfil</button>
      <button type="button" onClick={cerrar} className="recordatorio-perfil__cerrar" aria-label="Cerrar recordatorio">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
