// Pestaña "Sistema": uso de almacenamiento frente al límite del plan de Supabase y limpieza de
// fotos huérfanas (fotos que ningún informe usa: copias duplicadas antiguas, borradores eliminados…).
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { supabase, EVIDENCIAS_BUCKET } from '../lib/supabase';
import { registrarActividad } from '../lib/actividad';
import { Indicador, TarjetaGrafico } from './graficos';

type Plan = 'gratis' | 'pro';
const LIMITES: Record<Plan, { etiqueta: string; db: number; fotos: number }> = {
  gratis: { etiqueta: 'Gratis', db: 500 * 1024 ** 2, fotos: 1024 ** 3 },
  pro: { etiqueta: 'Pro', db: 8 * 1024 ** 3, fotos: 100 * 1024 ** 3 },
};
const CLAVE_PLAN = 'psinet_admin_plan_supabase';

interface Uso { db_bytes: number; fotos_bytes: number; fotos_cantidad: number }
interface Huerfana { nombre: string; bytes: number; creado_at: string }

const formatoBytes = (n: number) => {
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace('.', ',')} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace('.', ',')} GB`;
};

function Medidor({ titulo, usado, limite }: { titulo: string; usado: number; limite: number }) {
  const pct = Math.min(100, Math.round((usado / limite) * 100));
  const nivel = pct >= 90 ? 'critico' : pct >= 70 ? 'atencion' : 'bueno';
  const Icono = nivel === 'bueno' ? CheckCircle2 : AlertTriangle;
  const texto = { bueno: 'Dentro del límite', atencion: 'Acercándose al límite', critico: 'En el límite o excedido' }[nivel];
  return (
    <div className="hero">
      <div className="hero__label">{titulo}</div>
      <div className="hero__value hero__value--md">{formatoBytes(usado)}</div>
      <div className={`meter meter--${nivel}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={titulo}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="hero__detail">
        <span className={`estado-chip estado-chip--${nivel}`}><Icono size={13} aria-hidden="true" /> {texto}</span>
        {pct}% de {formatoBytes(limite)}
      </div>
    </div>
  );
}

export default function Sistema() {
  const [plan, setPlan] = useState<Plan>(() => {
    try { return localStorage.getItem(CLAVE_PLAN) === 'pro' ? 'pro' : 'gratis'; } catch { return 'gratis'; }
  });
  const [uso, setUso] = useState<Uso | null>(null);
  const [error, setError] = useState('');
  const [huerfanas, setHuerfanas] = useState<Huerfana[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [borrando, setBorrando] = useState<{ hechas: number; total: number } | null>(null);
  const [resultado, setResultado] = useState('');

  const cargarUso = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('uso_almacenamiento');
    if (err) { console.error(err); setError('No se pudo leer el uso de almacenamiento. ¿Ejecutaste la última versión de schema.sql?'); return; }
    setError('');
    setUso(data as Uso);
  }, []);

  // Carga inicial (consulta a la base de datos, un sistema externo).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void cargarUso(); }, [cargarUso]);

  const elegirPlan = (p: Plan) => {
    setPlan(p);
    try { localStorage.setItem(CLAVE_PLAN, p); } catch { /* sin almacenamiento local: solo dura esta visita */ }
  };

  const buscarHuerfanas = async () => {
    setBuscando(true);
    setResultado('');
    const { data, error: err } = await supabase.rpc('fotos_huerfanas');
    setBuscando(false);
    if (err) { console.error(err); setError('No se pudieron revisar las fotos.'); return; }
    setHuerfanas(data as Huerfana[]);
  };

  const totalHuerfanas = huerfanas?.reduce((n, h) => n + h.bytes, 0) ?? 0;

  const eliminarHuerfanas = async () => {
    if (!huerfanas?.length) return;
    const confirmado = window.confirm(
      `Se eliminarán ${huerfanas.length} fotos (${formatoBytes(totalHuerfanas)}) que ningún informe usa.\n\n` +
      'Esta acción no se puede deshacer. ¿Continuar?',
    );
    if (!confirmado) return;
    const nombres = huerfanas.map(h => h.nombre);
    let hechas = 0;
    let fallidas = 0;
    setBorrando({ hechas, total: nombres.length });
    for (let i = 0; i < nombres.length; i += 100) {
      const lote = nombres.slice(i, i + 100);
      const { error: err } = await supabase.storage.from(EVIDENCIAS_BUCKET).remove(lote);
      if (err) { console.error(err); fallidas += lote.length; } else { hechas += lote.length; }
      setBorrando({ hechas: hechas + fallidas, total: nombres.length });
    }
    setBorrando(null);
    setHuerfanas(null);
    const liberado = formatoBytes(Math.round(totalHuerfanas * (hechas / nombres.length)));
    setResultado(fallidas
      ? `Se eliminaron ${hechas} fotos; ${fallidas} no se pudieron eliminar (inténtalo de nuevo).`
      : `Listo: se eliminaron ${hechas} fotos y se liberaron cerca de ${liberado}.`);
    if (hechas) void registrarActividad('fotos_limpiadas', `${hechas} fotos · ${liberado}`);
    void cargarUso();
  };

  const limites = LIMITES[plan];

  return (
    <div className="space-y-5">
      <div className="admin-filters justify-between">
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          Plan de Supabase:
          <div className="segmented" role="group" aria-label="Plan de Supabase">
            {(Object.keys(LIMITES) as Plan[]).map(p => (
              <button key={p} type="button" aria-pressed={plan === p} onClick={() => elegirPlan(p)}>{LIMITES[p].etiqueta}</button>
            ))}
          </div>
        </div>
        <button type="button" className="btn-mini" onClick={() => void cargarUso()}><RefreshCw size={13} /> Actualizar</button>
      </div>

      {error && <div className="rounded-md border border-[#f1c0c0] bg-[#fbe9e9] text-[#a32626] text-sm px-4 py-3">{error}</div>}

      {uso && (
        <>
          <div className="admin-grid-2">
            <Medidor titulo="Fotos de evidencia (Storage)" usado={uso.fotos_bytes} limite={limites.fotos} />
            <Medidor titulo="Base de datos" usado={uso.db_bytes} limite={limites.db} />
          </div>
          <div className="kpi-grid">
            <Indicador etiqueta="Fotos guardadas" valor={uso.fotos_cantidad} />
            <Indicador etiqueta="Tamaño promedio por foto" valor={uso.fotos_cantidad ? formatoBytes(uso.fotos_bytes / uso.fotos_cantidad) : '—'} detalle="Las fotos nuevas se comprimen (~250 KB)" />
          </div>
          <p className="text-xs text-gray-500">
            La transferencia de datos (egress) y la cuota de la organización solo se ven en Supabase → Usage.
          </p>
        </>
      )}

      <TarjetaGrafico
        titulo="Fotos huérfanas"
        subtitulo="Fotos guardadas en la nube que ningún informe usa. No se consideran las subidas en las últimas 24 horas."
        acciones={
          <button type="button" className="btn-mini" onClick={() => void buscarHuerfanas()} disabled={buscando || Boolean(borrando)}>
            {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Buscar
          </button>
        }
      >
        {resultado && <p className="text-sm text-[#006300] mb-2">{resultado}</p>}
        {huerfanas === null ? (
          <p className="viz-empty">Presiona "Buscar" para revisar el almacenamiento.</p>
        ) : huerfanas.length === 0 ? (
          <p className="viz-empty">No hay fotos huérfanas. 👍</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <strong>{huerfanas.length}</strong> fotos sin usar · <strong>{formatoBytes(totalHuerfanas)}</strong>
              <span className="text-gray-500"> (la más antigua del {new Date(huerfanas[0].creado_at).toLocaleDateString('es-CL')})</span>
            </p>
            <button type="button" className="btn-mini btn-mini--danger" onClick={() => void eliminarHuerfanas()} disabled={Boolean(borrando)}>
              {borrando ? <><Loader2 size={13} className="animate-spin" /> Eliminando {borrando.hechas}/{borrando.total}…</> : <><Trash2 size={13} /> Eliminar {huerfanas.length} fotos</>}
            </button>
          </div>
        )}
      </TarjetaGrafico>
    </div>
  );
}
