// Tabla "Promedio por carro": horas y partidas por día de cada generador en el periodo elegido.
// La usan la pantalla de Reportabilidad de GG (supervisor) y el panel de administración.
import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TarjetaGrafico } from '../admin/graficos';
import { hoyLocalISO, sumarDias } from '../datos/fechas';
import type { Division } from '../datos/divisiones';
import { promediosPorCarro } from '../datos/promediosGG';
import { suscribirReportesGG, todosLosReportesGG, type ReporteGG } from '../datos/reportesGG';
import { esErrorDeRed } from '../lib/conexion';

const PERIODOS = [{ dias: 7, etiqueta: '7 días' }, { dias: 30, etiqueta: '30 días' }, { dias: 90, etiqueta: '90 días' }];
const fmt = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 1 });

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
    <TarjetaGrafico titulo="Promedio por carro" subtitulo="Horas y partidas por día calendario, según los reportes del periodo"
      acciones={
        <div className="segmented" role="group" aria-label="Periodo del promedio">
          {PERIODOS.map(p => <button key={p.dias} type="button" aria-pressed={dias === p.dias} onClick={() => setDias(p.dias)}>{p.etiqueta}</button>)}
        </div>
      }>
      {error ? (
        <p className="viz-empty">{error}</p>
      ) : !reportes ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-4 justify-center"><Loader2 size={16} className="animate-spin" /> Calculando…</div>
      ) : (
        <>
          <div className="viz-table-wrap">
            <table className="viz-table viz-table--tarjetas">
              <thead>
                <tr><th>Sitio</th><th className="num">Reportes</th><th className="num">Horas por día</th><th className="num">Partidas por día</th></tr>
              </thead>
              <tbody>
                {promedios.filas.map(f => (
                  <tr key={f.sitio}>
                    <td><strong>{f.sitio}</strong></td>
                    <td className="num">{f.reportes}</td>
                    <td className="num">{f.horasDia != null ? fmt(f.horasDia) : '—'}</td>
                    <td className="num">{f.partidasDia != null ? fmt(f.partidasDia) : '—'}</td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Promedio general</strong></td>
                  <td className="num">{promedios.totalReportes}</td>
                  <td className="num"><strong>{promedios.horasDia != null ? fmt(promedios.horasDia) : '—'}</strong></td>
                  <td className="num"><strong>{promedios.partidasDia != null ? fmt(promedios.partidasDia) : '—'}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 mt-2">Promedio de los carros con al menos dos lecturas en el periodo. Un carro sin lecturas suficientes aparece con —.</p>
        </>
      )}
    </TarjetaGrafico>
  );
}
