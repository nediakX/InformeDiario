// Recordatorio (no obligatorio) para completar los datos de "Mi perfil". Se puede cerrar por hoy.
import { useState } from 'react';
import { Bell, X } from 'lucide-react';
import { useSesion } from '../auth/sesion';
import { hoyLocalISO } from '../datos/fechas';
import './RecordatorioPerfil.css';

const clave = (id: string) => `psinet-recordatorio-perfil-${id}-${hoyLocalISO()}`;

function leerCerrado(id: string): boolean {
  try { return localStorage.getItem(clave(id)) === '1'; } catch { return false; }
}

export default function RecordatorioPerfil({ onIr }: { onIr: () => void }) {
  const { perfil } = useSesion();
  const [cerrado, setCerrado] = useState(() => leerCerrado(perfil.id));

  const faltan: string[] = [];
  if (!perfil.rut?.trim()) faltan.push('RUT');
  if (!perfil.fecha_nacimiento) faltan.push('fecha de nacimiento');
  if (!perfil.firma) faltan.push('firma');
  if (faltan.length === 0 || cerrado) return null;

  const cerrar = () => {
    try { localStorage.setItem(clave(perfil.id), '1'); } catch { /* sin almacenamiento: solo se oculta en esta vista */ }
    setCerrado(true);
  };
  const lista = faltan.length === 1 ? faltan[0] : `${faltan.slice(0, -1).join(', ')} y ${faltan[faltan.length - 1]}`;

  return (
    <div className="recordatorio-perfil" role="status">
      <Bell size={20} aria-hidden="true" />
      <span className="recordatorio-perfil__texto">
        Recuerda completar tu perfil: falta {lista}.
      </span>
      <button type="button" onClick={onIr} className="recordatorio-perfil__boton">Completar perfil</button>
      <button type="button" onClick={cerrar} className="recordatorio-perfil__cerrar" aria-label="Cerrar recordatorio por hoy">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
