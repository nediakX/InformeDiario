// Tabla "Promedio por carro": horas y partidas por día de cada generador en el periodo elegido.
// La usan la pantalla de Reportabilidad de GG (supervisor) y el panel de administración.
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import type { Division } from '../datos/divisiones';
import { promediosPorCarro } from '../datos/promediosGG';
import { suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { esErrorDeRed } from '../lib/conexion';

const PERIODOS = [{ dias: 7, etiqueta: '7 días' }, { dias: 30, etiqueta: '30 días' }, { dias: 90, etiqueta: '90 días' }];
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });

const celda = 'px-3 py-2.5 border-b border-[#e6ebef] text-sm';
const encabezado = 'px-3 py-2.5 border-b-2 border-[#c9d3da] text-xs font-bold text-[#0E4660] text-left whitespace-nowrap';

export default function PromedioCarrosGG({ division, sitios }: { division: Division; sitios: string[] }) {
  const [dias, setDias] = useState(30);
  const [reportes, setReportes] = useState<ReporteGG[] | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const hoy = hoyLocalISO();
  const desde = sumarDias(hoy, -(dias - 1));

  useEffect(() => {
    let vivo = true;
    todosLosReportesGG({ division, desde, hasta: hoy })
      .then(r => { if (vivo) { setReportes(r); setError(''); } })
      .catch(e => { if (vivo) setError(esErrorDeRed(e) ? 'Sin conexión: no se pudo calcular el promedio.' : 'No se pudo calcular el promedio por carro.'); });
    return () => { vivo = false; };
  }, [division, desde, hoy, version]);
  useEffect(() => suscribirReportesGG(division, () => setVersion(v => v + 1)), [division]);

  const promedios = useMemo(() => promediosPorCarro(reportes ?? [], sitios), [reportes, sitios]);

  return (
    <section className="panel p-5 space-y-4" aria-labelledby="promedio-carros">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="promedio-carros" className="font-display font-bold text-lg text-[#0E4660]">Promedio por carro</h2>
          <p className="text-xs text-gray-500">Horas y partidas por día calendario, según los reportes del periodo</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Periodo del promedio">
          {PERIODOS.map(p => (
            <button key={p.dias} type="button" aria-pressed={dias === p.dias} onClick={() => setDias(p.dias)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${dias === p.dias ? 'bg-[#0E4660] text-white border-[#0E4660]' : 'bg-white text-[#0E4660] border-[#c9d3da] hover:bg-[#d5e7f8]'}`}>
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-[#a32626]">{error}</p>
      ) : !reportes ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center"><Loader2 size={16} className="animate-spin" /> Calculando…</div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[#dce1e6]">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f4f6f8]">
                  <th className={encabezado}>Sitio</th>
                  <th className={`${encabezado} text-right`}>Reportes</th>
                  <th className={`${encabezado} text-right`}>Horas por día</th>
                  <th className={`${encabezado} text-right`}>Partidas por día</th>
                </tr>
              </thead>
              <tbody>
                {promedios.filas.map(f => (
                  <tr key={f.sitio} className="hover:bg-[#f8fbfd]">
                    <td className={celda}><strong className="text-[#14181c]">{f.sitio}</strong></td>
                    <td className={`${celda} text-right tabular-nums`}>{f.reportes}</td>
                    <td className={`${celda} text-right tabular-nums`}>{f.horasDia != null ? fmt(f.horasDia) : '—'}</td>
                    <td className={`${celda} text-right tabular-nums`}>{f.partidasDia != null ? fmt(f.partidasDia) : '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#eef5fb]">
                  <td className={`${celda} font-bold text-[#0E4660]`}>Promedio general</td>
                  <td className={`${celda} text-right tabular-nums font-bold text-[#0E4660]`}>{promedios.totalReportes}</td>
                  <td className={`${celda} text-right tabular-nums font-bold text-[#0E4660]`}>{promedios.horasDia != null ? fmt(promedios.horasDia) : '—'}</td>
                  <td className={`${celda} text-right tabular-nums font-bold text-[#0E4660]`}>{promedios.partidasDia != null ? fmt(promedios.partidasDia) : '—'}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-gray-500">Promedio de los carros con al menos dos lecturas en el periodo. Un carro sin lecturas suficientes aparece con —.</p>
        </>
      )}
    </section>
  );
}
