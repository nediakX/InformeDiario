// Tendencia de un banco: una línea por batería a lo largo de las mediciones del carro (como la hoja
// TENDENCIAS de la planilla), en resistencia interna o en voltaje. Con las franjas del criterio (6 y 8 mΩ),
// cruz al pasar el dedo o el mouse (también con las flechas del teclado) y la tabla con los valores.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { RESISTENCIA_ADVERTENCIA, RESISTENCIA_BUEN_ESTADO, type MedicionBaterias } from '../../datos/indicadoresBaterias';
import { fmtFecha, fmtValor } from './formato';
import { formatDiaMes } from '../../datos/fechas';

type Metrica = 'resistencia' | 'voltaje';
const METRICAS: { id: Metrica; titulo: string; unidad: string }[] = [
  { id: 'resistencia', titulo: 'Resistencia', unidad: 'mΩ' },
  { id: 'voltaje', titulo: 'Voltaje', unidad: 'V' },
];

const ALTO = 232;
const M = { izq: 38, der: 34, arriba: 12, abajo: 26 };

/** Marcas del eje con un paso "redondo". */
function marcas(min: number, max: number, cuantas = 5): number[] {
  const bruto = (max - min) / cuantas;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 2.5, 5, 10].map(f => f * pot).find(p => p >= bruto) ?? bruto;
  const salida: number[] = [];
  for (let v = Math.ceil(min / paso) * paso; v <= max + 1e-9; v += paso) salida.push(Math.round(v * 1000) / 1000);
  return salida;
}

export default function GraficoTendencia({ mediciones }: { mediciones: MedicionBaterias[] }) {
  const id = useId();
  const serie = useMemo(() => [...mediciones].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.creadoEn.localeCompare(b.creadoEn)), [mediciones]);
  const totalBancos = Math.max(0, ...serie.map(m => m.bancos.length));
  const [bancoElegido, setBanco] = useState(0);
  const banco = Math.min(bancoElegido, Math.max(0, totalBancos - 1));
  const [metrica, setMetrica] = useState<Metrica>('resistencia');
  const unidad = metrica === 'resistencia' ? 'mΩ' : 'V';

  // Ancho real del contenedor (el texto del gráfico no se deforma en el celular).
  const hayTendencia = serie.length >= 2;
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(640);
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setAncho(Math.max(240, Math.round(el.getBoundingClientRect().width)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [hayTendencia]);

  const baterias = Math.max(0, ...serie.map(m => m.bancos[banco]?.baterias.length ?? 0));
  const valores = serie.map(m => Array.from({ length: baterias }, (_, j) => m.bancos[banco]?.baterias[j]?.[metrica] ?? null));
  const todos = valores.flat().filter((v): v is number => v !== null);
  const [hover, setHover] = useState<number | null>(null);

  if (!hayTendencia) {
    return <p className="bat-grafico__vacio">La tendencia aparece desde la segunda medición de este carro.</p>;
  }

  // Escalas
  const ancho_ = ancho - M.izq - M.der;
  const alto_ = ALTO - M.arriba - M.abajo;
  const tiempos = serie.map(m => Date.parse(`${m.fecha}T12:00:00Z`));
  const t0 = tiempos[0];
  const t1 = tiempos[tiempos.length - 1];
  const x = (i: number) => M.izq + (t1 === t0 ? (i / (serie.length - 1)) * ancho_ : ((tiempos[i] - t0) / (t1 - t0)) * ancho_);
  let yMin: number;
  let yMax: number;
  if (metrica === 'resistencia') {
    yMin = 0;
    yMax = Math.max(10, Math.ceil((todos.length ? Math.max(...todos) : 0) + 1));
  } else {
    const lo = todos.length ? Math.min(...todos) : 12;
    const hi = todos.length ? Math.max(...todos) : 14;
    yMin = Math.floor((lo - 0.5) * 2) / 2;
    yMax = Math.ceil((hi + 0.5) * 2) / 2;
  }
  const y = (v: number) => M.arriba + alto_ - ((v - yMin) / (yMax - yMin)) * alto_;
  const ticksY = marcas(yMin, yMax);

  // Fechas del eje ("12 sep", con el año en la primera y donde cambia): todas si caben, si no, las que no se
  // pisan (siempre la primera y la última).
  const ultimaI = serie.length - 1;
  const anio = (i: number) => serie[i].fecha.slice(0, 4);
  const fechaEje = (i: number, conAnio: boolean) => (conAnio ? `${formatDiaMes(serie[i].fecha)} ${anio(i)}` : formatDiaMes(serie[i].fecha));
  const bordes = (i: number, texto: string): [number, number] => {
    const w = texto.length * 6.2; // ancho aproximado a 10,5 px
    return i === 0 ? [x(i), x(i) + w] : i === ultimaI ? [x(i) - w, x(i)] : [x(i) - w / 2, x(i) + w / 2];
  };
  const caben = (a: number, ta: string, b: number, tb: string) => bordes(a, ta)[1] + 10 <= bordes(b, tb)[0];
  const texto1 = serie.map((_, i) => fechaEje(i, i === 0 || anio(i) !== anio(i - 1)));
  let etiquetasX = [0];
  for (let i = 1; i < ultimaI; i++) {
    const previa = etiquetasX[etiquetasX.length - 1];
    if (caben(previa, texto1[previa], i, texto1[i]) && caben(i, texto1[i], ultimaI, texto1[ultimaI])) etiquetasX.push(i);
  }
  if (ultimaI > 0) etiquetasX.push(ultimaI);
  // El año va en cada fecha visible cuyo año cambia respecto de la anterior visible; si así la última se pisa
  // con la anterior, sale la anterior (nunca la primera).
  const textosDe = (lista: number[]) => new Map(lista.map((i, k) => [i, fechaEje(i, k === 0 || anio(i) !== anio(lista[k - 1]))]));
  let textosX = textosDe(etiquetasX);
  while (etiquetasX.length > 2) {
    const [a, b] = etiquetasX.slice(-2);
    if (caben(a, textosX.get(a) ?? '', b, textosX.get(b) ?? '')) break;
    etiquetasX = [...etiquetasX.slice(0, -2), b];
    textosX = textosDe(etiquetasX);
  }

  // Líneas (con cortes donde una batería no se midió) y el último punto de cada una.
  const lineas = Array.from({ length: baterias }, (_, j) => {
    const partes: string[] = [];
    let enTramo = false;
    let ultimo = -1;
    for (let i = 0; i < valores.length; i++) {
      const v = valores[i][j];
      if (v === null) { enTramo = false; continue; }
      partes.push(`${enTramo ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`);
      enTramo = true;
      ultimo = i;
    }
    return { d: partes.join(' '), ultimo };
  });
  // Etiquetas al final de cada línea solo si no se pisan (si no, basta la leyenda).
  const finales = lineas.flatMap((l, j) => (l.ultimo < 0 ? [] : [{ j, y: y(valores[l.ultimo][j] as number) }])).sort((a, b) => a.y - b.y);
  const etiquetasFinales = baterias <= 4 && finales.every((f, k) => k === 0 || f.y - finales[k - 1].y >= 12);

  const alMover = (e: PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left + M.izq;
    let mejor = 0;
    for (let i = 1; i < serie.length; i++) if (Math.abs(x(i) - px) < Math.abs(x(mejor) - px)) mejor = i;
    setHover(mejor);
  };
  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      setHover(h => Math.min(serie.length - 1, Math.max(0, (h ?? serie.length - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
    } else if (e.key === 'Escape') setHover(null);
  };

  const ancla = hover === null ? 0 : x(hover);
  const tooltipIzq = Math.max(4, Math.min(ancla - 90, ancho - 184));

  return (
    <div className="bat-grafico">
      <div className="bat-grafico__controles">
        {totalBancos > 1 && (
          <div className="bat-grafico__grupo">
            <span id={`${id}-banco`} className="bat-grafico__etiqueta">Banco</span>
            <div className="bat-segmentado" role="group" aria-labelledby={`${id}-banco`}>
              {Array.from({ length: totalBancos }, (_, i) => (
                <button key={i} type="button" aria-pressed={banco === i} onClick={() => { setBanco(i); setHover(null); }}>{i + 1}</button>
              ))}
            </div>
          </div>
        )}
        <div className="bat-segmentado" role="group" aria-label="Dato">
          {METRICAS.map(m => (
            <button key={m.id} type="button" aria-pressed={metrica === m.id} onClick={() => { setMetrica(m.id); setHover(null); }}>
              {m.titulo} <span className="bat-unidad">({m.unidad})</span>
            </button>
          ))}
        </div>
      </div>

      {baterias > 1 && (
        <ul className="bat-leyenda" aria-label="Baterías">
          {Array.from({ length: baterias }, (_, j) => (
            <li key={j}><span className={`bat-leyenda__linea bat-serie-${j + 1}`} aria-hidden="true" />Batería {j + 1}</li>
          ))}
        </ul>
      )}

      <div ref={caja} className="bat-grafico__lienzo" tabIndex={0} onKeyDown={alTeclear} onBlur={() => setHover(null)}
        aria-describedby={`${id}-ayuda`}>
        <svg width={ancho} height={ALTO} role="img"
          aria-label={`${metrica === 'resistencia' ? 'Resistencia interna' : 'Voltaje'} del banco ${banco + 1} en ${serie.length} mediciones, del ${fmtFecha(serie[0].fecha)} al ${fmtFecha(serie[serie.length - 1].fecha)}`}>
          {metrica === 'resistencia' && (
            <g aria-hidden="true">
              <rect className="bat-franja bat-franja--advertencia" x={M.izq} width={ancho_} y={y(RESISTENCIA_ADVERTENCIA)} height={y(RESISTENCIA_BUEN_ESTADO) - y(RESISTENCIA_ADVERTENCIA)} />
              <rect className="bat-franja bat-franja--falla" x={M.izq} width={ancho_} y={M.arriba} height={y(RESISTENCIA_ADVERTENCIA) - M.arriba} />
              <text className="bat-franja__texto" x={M.izq + ancho_ - 4} y={y(RESISTENCIA_ADVERTENCIA) - 5} textAnchor="end">Falla (más de 8)</text>
              <text className="bat-franja__texto" x={M.izq + ancho_ - 4} y={y(RESISTENCIA_BUEN_ESTADO) - 5} textAnchor="end">Advertencia (6 a 8)</text>
            </g>
          )}
          <g className="bat-eje" aria-hidden="true">
            {ticksY.map(t => (
              <g key={t}>
                <line x1={M.izq} x2={M.izq + ancho_} y1={y(t)} y2={y(t)} />
                <text x={M.izq - 6} y={y(t) + 4} textAnchor="end">{fmtValor(t).replace(/,00$/, '').replace(/(,\d)0$/, '$1')}</text>
              </g>
            ))}
            {etiquetasX.map(i => (
              <text key={i} x={x(i)} y={ALTO - 8} textAnchor={i === 0 ? 'start' : i === ultimaI ? 'end' : 'middle'}>{textosX.get(i)}</text>
            ))}
          </g>
          {hover !== null && <line className="bat-cruz" x1={x(hover)} x2={x(hover)} y1={M.arriba} y2={M.arriba + alto_} aria-hidden="true" />}
          {lineas.map((l, j) => <path key={j} className={`bat-linea bat-serie-${j + 1}`} d={l.d} />)}
          {valores.map((fila, i) => fila.map((v, j) => v === null ? null : (
            <circle key={`${i}-${j}`} className={`bat-punto bat-serie-${j + 1}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} />
          )))}
          {etiquetasFinales && finales.map(f => (
            <text key={f.j} className="bat-etiqueta-final" x={x(lineas[f.j].ultimo) + 8} y={f.y + 4}>B{f.j + 1}</text>
          ))}
          <rect className="bat-grafico__captura" x={M.izq} y={M.arriba} width={ancho_} height={alto_}
            onPointerMove={alMover} onPointerDown={alMover} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover !== null && (
          <div className="bat-tooltip" style={{ left: tooltipIzq }} role="status">
            <div className="bat-tooltip__fecha">{fmtFecha(serie[hover].fecha)}</div>
            {valores[hover].map((v, j) => (
              <div key={j} className="bat-tooltip__fila">
                <span className={`bat-leyenda__linea bat-serie-${j + 1}`} aria-hidden="true" />
                <b>{v === null ? '—' : `${fmtValor(v)} ${unidad}`}</b>
                <span>Batería {j + 1}</span>
              </div>
            ))}
          </div>
        )}
        <span id={`${id}-ayuda`} className="sr-only">Usa las flechas izquierda y derecha para recorrer las mediciones.</span>
      </div>

      <details className="bat-grafico__tabla">
        <summary>Ver los valores</summary>
        <div className="bat-tabla-envoltura">
          <table>
            <caption className="sr-only">{metrica === 'resistencia' ? 'Resistencia interna (mΩ)' : 'Voltaje (V)'} del banco {banco + 1}</caption>
            <thead>
              <tr><th scope="col">Fecha</th>{Array.from({ length: baterias }, (_, j) => <th key={j} scope="col">B{j + 1}</th>)}</tr>
            </thead>
            <tbody>
              {[...serie.keys()].reverse().map(i => (
                <tr key={serie[i].id}>
                  <th scope="row">{fmtFecha(serie[i].fecha)}</th>
                  {valores[i].map((v, j) => <td key={j}>{fmtValor(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
