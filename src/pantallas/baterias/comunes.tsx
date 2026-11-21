// Piezas que comparten la lista de carros, el detalle y el formulario de la Medición de baterías.
import { CircleCheck, CircleMinus, OctagonAlert, TriangleAlert } from 'lucide-react';
import { ETIQUETA_ESTADO_BATERIA, ORDEN_ESTADO, estadoBateria, type Banco, type ConteoBaterias, type EstadoBateria } from '../../datos/indicadoresBaterias';
import { CONTEO_ESTADO, fmtValor } from './formato';

const ICONO: Record<EstadoBateria, typeof CircleCheck> = {
  buen_estado: CircleCheck, advertencia: TriangleAlert, falla: OctagonAlert, sin_medir: CircleMinus,
};

/** Estado de una batería o de un carro: ícono + texto (nunca solo el color). */
export function Estado({ estado, texto, compacto = false }: { estado: EstadoBateria; texto?: string; compacto?: boolean }) {
  const Icono = ICONO[estado];
  return (
    <span className={`bat-estado bat-estado--${estado}${compacto ? ' bat-estado--compacto' : ''}`}>
      <Icono size={compacto ? 12 : 13} aria-hidden="true" />
      <span>{texto ?? ETIQUETA_ESTADO_BATERIA[estado]}</span>
    </span>
  );
}

/** Conteo por estado ("18 en buen estado · 1 en falla"), solo los que tienen baterías.
 *  `soloProblemas`: solo falla y advertencia (nada si todo está bien). */
export function Conteos({ conteo, incluirSinMedir = true, soloProblemas = false }: { conteo: ConteoBaterias; incluirSinMedir?: boolean; soloProblemas?: boolean }) {
  const estados = ORDEN_ESTADO.filter(e => conteo[e] > 0 && (soloProblemas ? e === 'falla' || e === 'advertencia' : incluirSinMedir || e !== 'sin_medir'));
  if (!estados.length) return soloProblemas ? null : <span className="bat-conteos bat-conteos--vacio">Sin baterías medidas</span>;
  return (
    <span className="bat-conteos">
      {estados.map(e => (
        <span key={e} className={`bat-conteo bat-conteo--${e}`}>
          <b>{conteo[e]}</b> {CONTEO_ESTADO[e][conteo[e] === 1 ? 0 : 1]}
        </span>
      ))}
    </span>
  );
}

/** Mapa del carro: una fila por banco y un cuadro por batería, del color de su estado.
 *  Sin `etiqueta` es solo visual (cuando lo que lo rodea ya dice lo mismo). */
export function MapaBaterias({ bancos, etiqueta }: { bancos: Banco[]; etiqueta?: string }) {
  return (
    <span className="bat-mapa" {...(etiqueta ? { role: 'img', 'aria-label': etiqueta } : { 'aria-hidden': true })}>
      {bancos.map((banco, i) => (
        <span key={i} className="bat-mapa__banco">
          {banco.baterias.map((b, j) => (
            <span key={j} className={`bat-mapa__bateria bat-mapa__bateria--${estadoBateria(b.resistencia)}`}
              title={`Banco ${i + 1} · Batería ${j + 1}: ${b.resistencia === null ? 'sin medir' : `${fmtValor(b.resistencia)} mΩ`}`} />
          ))}
        </span>
      ))}
    </span>
  );
}
