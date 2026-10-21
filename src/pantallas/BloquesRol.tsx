// Bloques del panel principal que dependen del rol (solo muestran información; no cambian datos):
//  - PorRevisar: informes de la semana sin finalizar y checklist del día (supervisor / jefe de turno).
//  - ResumenContrato: cumplimiento de los últimos 30 días (administración de contrato).
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronRight, ClipboardCheck, FileWarning, Moon, Sun } from 'lucide-react';
import { type BorradorEntry, contarFotos, esSemillaSinEditar, estadoBorrador } from '../datos/borradoresDiario';
import { supabase, BORRADORES_TABLE, BORRADORES_OTROS_TABLE } from '../lib/supabase';
import { rowToEntry, type BorradorRow } from '../datos/borradoresDiario';
import { rowToOtroEntry, type BorradorOtroRow } from '../datos/borradoresOtros';
import { calcularEstadisticas, rangoDePeriodo, type Kpis } from '../admin/datos';
import type { Division } from '../datos/divisiones';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** "Mié 21/10" */
const fechaCorta = (iso: string) => `${DIAS[new Date(`${iso}T12:00:00`).getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

interface Fila { clave: string; texto: string; detalle: string; tono: 'critico' | 'atencion'; Icono: typeof Sun; onClick: () => void }

export function PorRevisar({ titulo, dias, hoy, semana, checklist, onAbrirInforme, onVerBorradores, onChecklist }: {
  titulo: string;
  /** Días de la semana de turno (ISO). */
  dias: string[];
  hoy: string;
  semana: BorradorEntry[];
  checklist: { texto: string; completo: boolean };
  onAbrirInforme: (b: BorradorEntry) => void;
  onVerBorradores: () => void;
  onChecklist: () => void;
}) {
  const filas: Fila[] = [];
  for (const fecha of dias.filter(f => f <= hoy).reverse()) {
    for (const turno of ['dia', 'noche'] as const) {
      const b = semana.find(x => x.fecha === fecha && x.turno === turno);
      const Icono = turno === 'dia' ? Sun : Moon;
      const nombre = `${fecha === hoy ? 'Hoy' : fechaCorta(fecha)} · Turno ${turno === 'dia' ? 'Día' : 'Noche'}`;
      const pasado = fecha < hoy;
      if (!b || esSemillaSinEditar(b)) {
        if (pasado) filas.push({ clave: `${fecha}${turno}`, texto: nombre, detalle: 'Sin informe', tono: 'critico', Icono, onClick: onVerBorradores });
        continue;
      }
      const estado = estadoBorrador(b);
      if (estado === 'finalizado') continue;
      const f = contarFotos(b);
      filas.push({ clave: b.id, texto: nombre, detalle: `${pasado ? 'Sin finalizar' : 'En curso'} · ${f.llenas} de ${f.total} fotos`, tono: pasado ? 'critico' : 'atencion', Icono, onClick: () => onAbrirInforme(b) });
    }
  }
  if (!checklist.completo) filas.push({ clave: 'checklist', texto: 'Checklist de camioneta', detalle: checklist.texto, tono: 'atencion', Icono: ClipboardCheck, onClick: onChecklist });
  filas.sort((a, b) => (a.tono === b.tono ? 0 : a.tono === 'critico' ? -1 : 1));
  const visibles = filas.slice(0, 4);

  return (
    <section className="dash-revisar" aria-labelledby="dash-revisar-titulo">
      <div className="dash-gg__cabecera">
        <h2 id="dash-revisar-titulo" className="font-display">{titulo}</h2>
        {filas.length > 0 && <span className="dash-gg-cuenta dash-gg-cuenta--atencion"><strong>{filas.length}</strong> pendiente{filas.length === 1 ? '' : 's'}</span>}
      </div>
      {filas.length === 0 ? (
        <p className="dash-revisar__ok"><CheckCircle2 size={16} aria-hidden="true" /> Todo al día: informes de la semana finalizados y checklist completo.</p>
      ) : (
        <ul className="dash-revisar__lista">
          {visibles.map(f => (
            <li key={f.clave}>
              <button type="button" onClick={f.onClick} className={`dash-revisar__fila dash-revisar__fila--${f.tono}`}>
                <f.Icono size={16} aria-hidden="true" />
                <span className="dash-revisar__texto"><strong>{f.texto}</strong><span>{f.detalle}</span></span>
                <ChevronRight size={16} aria-hidden="true" className="dash-revisar__flecha" />
              </button>
            </li>
          ))}
          {filas.length > visibles.length && (
            <li><button type="button" className="dash-enlace" onClick={onVerBorradores}>+{filas.length - visibles.length} más en Borradores</button></li>
          )}
        </ul>
      )}
    </section>
  );
}

/** Indicadores del contrato (últimos 30 días): los mismos cálculos del panel de administración. */
export function ResumenContrato({ division, onVerMas }: { division: Division; onVerMas?: () => void }) {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    const rango = rangoDePeriodo('30');
    Promise.all([
      supabase.from(BORRADORES_TABLE).select('*').eq('division', division).gte('fecha', rango.desde).lte('fecha', rango.hasta),
      supabase.from(BORRADORES_OTROS_TABLE).select('*').eq('division', division).gte('fecha', rango.desde).lte('fecha', rango.hasta),
    ]).then(([d, o]) => {
      if (!vivo) return;
      if (d.error || o.error) { setError(true); return; }
      const stats = calcularEstadisticas({
        diarios: (d.data as BorradorRow[]).map(r => ({ ...rowToEntry(r), actualizadoPor: null })),
        otros: (o.data as BorradorOtroRow[]).map(r => ({ ...rowToOtroEntry(r), actualizadoPor: null })),
        perfiles: [],
      }, rango);
      setKpis(stats.kpis);
    }).catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [division]);

  if (error) return null;
  const pct = kpis ? Math.round(kpis.cumplimiento * 100) : null;
  const tono = pct === null ? '' : pct >= 95 ? 'ok' : pct >= 80 ? 'atencion' : 'critico';

  return (
    <section className="dash-contrato" aria-labelledby="dash-contrato-titulo">
      <div className="dash-gg__cabecera">
        <h2 id="dash-contrato-titulo" className="font-display">Contrato · últimos 30 días</h2>
        {onVerMas && <button type="button" onClick={onVerMas} className="dash-enlace dash-gg__abrir">Indicadores <ChevronRight size={14} aria-hidden="true" /></button>}
      </div>
      {!kpis ? (
        <div className="dash-gg__caja dash-gg__cargando">Calculando indicadores…</div>
      ) : (
        <div className="dash-contrato__grilla">
          <div className={`dash-contrato__kpi dash-contrato__kpi--${tono}`}>
            <span className="dash-contrato__valor">{pct}%</span>
            <span className="dash-contrato__etiqueta">Informes diarios finalizados</span>
            <span className="dash-contrato__detalle">{kpis.finalizados} de {kpis.esperados} turnos</span>
          </div>
          <div className={`dash-contrato__kpi ${kpis.atrasados ? 'dash-contrato__kpi--critico' : 'dash-contrato__kpi--ok'}`}>
            <span className="dash-contrato__valor">{kpis.atrasados}</span>
            <span className="dash-contrato__etiqueta">{kpis.atrasados ? <><FileWarning size={13} aria-hidden="true" /> Turnos sin finalizar</> : 'Turnos sin finalizar'}</span>
            <span className="dash-contrato__detalle">ya terminados</span>
          </div>
          <div className="dash-contrato__kpi">
            <span className="dash-contrato__valor">{kpis.fallas}</span>
            <span className="dash-contrato__etiqueta">{kpis.fallas ? <><AlertTriangle size={13} aria-hidden="true" /> Fallas reportadas</> : 'Fallas reportadas'}</span>
            <span className="dash-contrato__detalle">informes de falla</span>
          </div>
          <div className="dash-contrato__kpi">
            <span className="dash-contrato__valor">{kpis.mantenimientos}</span>
            <span className="dash-contrato__etiqueta">Mantenimientos</span>
            <span className="dash-contrato__detalle">de generador</span>
          </div>
        </div>
      )}
    </section>
  );
}
