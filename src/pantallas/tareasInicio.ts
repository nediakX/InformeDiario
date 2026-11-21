// Nombre, ícono y color de cada acceso del inicio (los usan el panel y el editor de accesos rápidos).
import {
  AlertTriangle, CalendarDays, ClipboardCheck, FileStack, FileUp, FolderOpen, Fuel, Map as MapIcon, Presentation,
  Printer, RadioTower, ShieldCheck, Table2, Wrench, type LucideIcon,
} from 'lucide-react';
import type { IdTarea } from '../datos/roles';

export interface InfoTarea { titulo: string; icono: LucideIcon; color: string }

export const INFO_TAREA: Record<IdTarea, InfoTarea> = {
  checklist: { titulo: 'Checklist de camioneta', icono: ClipboardCheck, color: '#1E8E3E' },
  gg: { titulo: 'Reportabilidad de GG', icono: Fuel, color: '#9a5b00' },
  tablaMantenimiento: { titulo: 'Tabla de mantenimiento GG', icono: Table2, color: '#0E4660' },
  impresion: { titulo: 'Impresión rápida', icono: Printer, color: '#0E4660' },
  mapa: { titulo: 'Mapa de sitios', icono: MapIcon, color: '#2E7D32' },
  cierre: { titulo: 'Informe de cierre', icono: FileStack, color: '#ED7D31' },
  presentacion: { titulo: 'Presentación del turno', icono: Presentation, color: '#7B3FA0' },
  presentacionFds: { titulo: 'Presentación fin de semana', icono: CalendarDays, color: '#7B3FA0' },
  preventiva: { titulo: 'Mantención preventiva de sitio', icono: RadioTower, color: '#0E7C86' },
  falla: { titulo: 'Informe de falla de carro', icono: AlertTriangle, color: '#B3261E' },
  mantenimiento: { titulo: 'Mantenimiento de generador', icono: Wrench, color: '#55636B' },
  borradores: { titulo: 'Borradores', icono: FolderOpen, color: '#55636B' },
  recuperar: { titulo: 'Recuperar informe desde Word', icono: FileUp, color: '#0E7C86' },
  admin: { titulo: 'Panel de administración', icono: ShieldCheck, color: '#14181C' },
};
