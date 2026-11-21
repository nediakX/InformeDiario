// Registrar (o corregir) la medición de un carro: resistencia interna y voltaje de cada batería, banco por
// banco. Pensado para el celular en terreno:
//  - lo escrito se guarda en este equipo mientras se llena (si se cierra o se corta la app, se sigue después);
//  - cada casilla muestra el valor de la medición anterior y avisa si falta la coma (338 → ¿3,38?);
//  - "Siguiente" en el teclado pasa a la casilla que sigue.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { BatteryCharging, Minus, Plus, X } from 'lucide-react';
import type { Division } from '../../datos/divisiones';
import { hoyLocalISO } from '../../datos/fechas';
import {
  MAX_BANCOS, MAX_BATERIAS, estadoBateria, estructuraDe, estructuraPorDefecto, leerValor, medicionesDelCarro,
  revisarResistencia, revisarVoltaje, turnoDeFecha, type MedicionBaterias, type RevisionValor,
} from '../../datos/indicadoresBaterias';
import { guardarBorradorBaterias, leerBorradorBaterias, type CasillasBateria } from '../../datos/medicionBaterias';
import { Estado } from './comunes';
import { fmtFecha, fmtValor, valorACasilla } from './formato';

interface Props {
  division: Division;
  carros: { codigo: string; sitio: string }[];
  /** Todas las mediciones de la división (valores anteriores y mediciones repetidas). */
  mediciones: MedicionBaterias[];
  /** Medición que se corrige (null = nueva). */
  editando: MedicionBaterias | null;
  carroInicial: string | null;
  usuario: { id: string | null; nombre: string };
  onCerrar: () => void;
  onGuardar: (m: MedicionBaterias, anterior: MedicionBaterias | null) => void;
  /** Abre para corregir otra medición (la del mismo carro y día que ya existe). */
  onCorregir: (m: MedicionBaterias) => void;
}

const vacias = (estructura: number[]): CasillasBateria[][] => estructura.map(n => Array.from({ length: n }, () => ({ r: '', v: '' })));
const tieneValores = (casillas: CasillasBateria[][]) => casillas.some(b => b.some(c => c.r.trim() || c.v.trim()));

/** Id nuevo para la medición (también sin conexión). */
function nuevoId(): string {
  // randomUUID no existe en algunos celulares antiguos: ahí se arma con getRandomValues.
  const c: { randomUUID?: () => string; getRandomValues: Crypto['getRandomValues'] } = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export default function FormularioMedicion({ division, carros, mediciones, editando, carroInicial, usuario, onCerrar, onGuardar, onCorregir }: Props) {
  const idTitulo = useId();
  const hoy = hoyLocalISO();
  const idEditando = editando?.id ?? null;
  const estructuraPara = (carro: string) => {
    const ultima = medicionesDelCarro(mediciones, carro).find(m => m.id !== idEditando);
    return ultima ? estructuraDe(ultima.bancos) : estructuraPorDefecto();
  };

  // Lo que había sin guardar en este equipo, la medición que se corrige o una nueva.
  const [inicial] = useState(() => {
    const borrador = leerBorradorBaterias(division, idEditando);
    if (borrador) return { carro: borrador.carro || (editando?.carro ?? carroInicial ?? ''), fecha: borrador.fecha, casillas: borrador.bancos, observaciones: borrador.observaciones, recuperado: borrador.guardadoEn };
    if (editando) {
      const casillas = editando.bancos.map(b => b.baterias.map(x => ({ r: valorACasilla(x.resistencia), v: valorACasilla(x.voltaje) })));
      return { carro: editando.carro, fecha: editando.fecha, casillas, observaciones: editando.observaciones, recuperado: null };
    }
    const carro = carroInicial ?? '';
    return { carro, fecha: hoy, casillas: vacias(carro ? estructuraPara(carro) : estructuraPorDefecto()), observaciones: '', recuperado: null };
  });
  const [carro, setCarro] = useState(inicial.carro);
  const [fecha, setFecha] = useState(inicial.fecha);
  const [casillas, setCasillas] = useState<CasillasBateria[][]>(inicial.casillas);
  const [observaciones, setObservaciones] = useState(inicial.observaciones);
  const [recuperado, setRecuperado] = useState<string | null>(inicial.recuperado);
  const [tocado, setTocado] = useState(!!inicial.recuperado);
  const [intento, setIntento] = useState(false);

  // Lo escrito queda en este equipo mientras se llena.
  useEffect(() => {
    if (!tocado) return;
    const t = window.setTimeout(() => guardarBorradorBaterias(division, idEditando, {
      editando: idEditando, carro, fecha, bancos: casillas, observaciones, guardadoEn: new Date().toISOString(),
    }), 300);
    return () => window.clearTimeout(t);
  }, [division, idEditando, carro, fecha, casillas, observaciones, tocado]);

  // Cerrar (X, Cancelar, Esc o tocar fuera) deja lo escrito guardado en el equipo, hasta la última tecla.
  const cerrar = () => {
    guardarBorradorBaterias(division, idEditando, tocado
      ? { editando: idEditando, carro, fecha, bancos: casillas, observaciones, guardadoEn: new Date().toISOString() }
      : null);
    onCerrar();
  };
  const cerrarRef = useRef(cerrar);
  useEffect(() => { cerrarRef.current = cerrar; });
  const formulario = useRef<HTMLFormElement>(null);
  useEffect(() => {
    // Nueva: directo a la primera casilla (o al carro, si falta elegirlo). Al corregir no se abre el teclado:
    // el foco queda en el formulario y se toca la casilla que hay que arreglar.
    const destino = editando ? formulario.current : formulario.current?.querySelector<HTMLElement>(inicial.carro ? 'input[data-orden="0"]' : 'select');
    destino?.focus({ preventScroll: !!editando });
    const alTeclear = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [inicial.carro, editando]);

  // Medición anterior del carro a la fecha elegida (para mostrar sus valores) y una del mismo día que ya exista.
  const anterior = useMemo(
    () => medicionesDelCarro(mediciones, carro).find(m => m.id !== idEditando && m.fecha <= fecha) ?? null,
    [mediciones, carro, idEditando, fecha],
  );
  const repetida = mediciones.find(m => m.carro === carro && m.fecha === fecha && m.id !== idEditando) ?? null;

  const valores = casillas.map(b => b.map(c => ({ resistencia: leerValor(c.r), voltaje: leerValor(c.v) })));
  const revisiones = valores.map(b => b.map(x => ({ r: revisarResistencia(x.resistencia), v: revisarVoltaje(x.voltaje) })));
  const errores = revisiones.flat().reduce((n, x) => n + (x.r.error ? 1 : 0) + (x.v.error ? 1 : 0), 0);
  const total = casillas.reduce((n, b) => n + b.length, 0);
  const medidas = valores.flat().filter(x => x.resistencia !== null && !Number.isNaN(x.resistencia)).length;
  const fechaOk = /^(19|20)\d\d-\d\d-\d\d$/.test(fecha) && fecha <= hoy;

  const tocar = () => setTocado(true);
  const cambiarCasilla = (b: number, j: number, campo: keyof CasillasBateria, texto: string) => {
    setCasillas(cs => cs.map((banco, i) => (i !== b ? banco : banco.map((c, k) => (k !== j ? c : { ...c, [campo]: texto })))));
    tocar();
  };
  const cambiarCarro = (nuevo: string) => {
    setCarro(nuevo);
    // Sin nada escrito, los bancos se arman como en la última medición de ese carro.
    if (!tieneValores(casillas)) setCasillas(vacias(estructuraPara(nuevo)));
    tocar();
  };
  const confirmarSiHayDatos = (lista: CasillasBateria[], que: string) =>
    !lista.some(c => c.r.trim() || c.v.trim()) || window.confirm(`${que} tiene valores escritos. ¿Quitarla igual?`);
  const agregarBateria = (b: number) => { setCasillas(cs => cs.map((banco, i) => (i === b ? [...banco, { r: '', v: '' }] : banco))); tocar(); };
  const quitarBateria = (b: number) => {
    const ultima = casillas[b][casillas[b].length - 1];
    if (!confirmarSiHayDatos([ultima], `La batería ${casillas[b].length} del banco ${b + 1}`)) return;
    setCasillas(cs => cs.map((banco, i) => (i === b ? banco.slice(0, -1) : banco)));
    tocar();
  };
  const agregarBanco = () => {
    setCasillas(cs => [...cs, Array.from({ length: cs[cs.length - 1]?.length ?? 4 }, () => ({ r: '', v: '' }))]);
    tocar();
  };
  const quitarBanco = () => {
    if (!confirmarSiHayDatos(casillas[casillas.length - 1], `El banco ${casillas.length}`)) return;
    setCasillas(cs => cs.slice(0, -1));
    tocar();
  };
  const empezarDeNuevo = () => {
    guardarBorradorBaterias(division, idEditando, null);
    setRecuperado(null);
    setTocado(false);
    setIntento(false);
    if (editando) {
      setCarro(editando.carro);
      setFecha(editando.fecha);
      setCasillas(editando.bancos.map(b => b.baterias.map(x => ({ r: valorACasilla(x.resistencia), v: valorACasilla(x.voltaje) }))));
      setObservaciones(editando.observaciones);
    } else {
      // Vuelve al carro desde el que se abrió (lo que quedó sin guardar podía ser de otro).
      const c = carroInicial ?? carro;
      setCarro(c);
      setFecha(hoy);
      setCasillas(vacias(c ? estructuraPara(c) : estructuraPorDefecto()));
      setObservaciones('');
    }
  };

  // "Siguiente" del teclado (o Enter) pasa a la casilla que sigue.
  const alTeclearCasilla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const orden = Number(e.currentTarget.dataset.orden);
    const siguiente = formulario.current?.querySelector<HTMLInputElement>(`input[data-orden="${orden + 1}"]`);
    if (siguiente) siguiente.focus();
    else formulario.current?.querySelector<HTMLTextAreaElement>('textarea')?.focus();
  };

  const guardar = (e: FormEvent) => {
    e.preventDefault();
    setIntento(true);
    if (!carro || !fechaOk || errores || !medidas) {
      // Lleva a lo primero que hay que arreglar.
      window.setTimeout(() => formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
      return;
    }
    const ahora = new Date().toISOString();
    const m: MedicionBaterias = {
      id: editando?.id ?? nuevoId(),
      division,
      carro,
      fecha,
      turno: turnoDeFecha(fecha),
      bancos: valores.map(b => ({ baterias: b.map(x => ({ resistencia: x.resistencia, voltaje: x.voltaje })) })),
      observaciones: observaciones.trim(),
      registradoPor: editando ? editando.registradoPor : usuario.id,
      registradoNombre: editando ? editando.registradoNombre : usuario.nombre,
      actualizadoNombre: editando ? usuario.nombre : '',
      creadoEn: editando?.creadoEn ?? ahora,
      actualizadoEn: ahora,
    };
    guardarBorradorBaterias(division, idEditando, null);
    onGuardar(m, editando);
  };

  const sitio = carros.find(c => c.codigo === carro)?.sitio;
  let orden = 0;

  const aviso = (rev: RevisionValor, b: number, j: number, campo: keyof CasillasBateria, unidad: string) => rev.error && (
    <span className="bat-fila-form__aviso" role="alert">
      {rev.error}
      {rev.sugerencia !== undefined && (
        <> ¿Quisiste decir <b>{fmtValor(rev.sugerencia)} {unidad}</b>?{' '}
          <button type="button" className="bat-enlace" onClick={() => cambiarCasilla(b, j, campo, valorACasilla(rev.sugerencia ?? null))}>Usar {fmtValor(rev.sugerencia)}</button>
        </>
      )}
    </span>
  );

  return (
    <div className="bat-form-fondo" onClick={cerrar}>
      <form ref={formulario} role="dialog" aria-modal="true" aria-labelledby={idTitulo} onSubmit={guardar} noValidate tabIndex={-1}
        className="modal-anim bat-form" onClick={e => e.stopPropagation()}>
        <div className="bat-form__cabecera">
          <span className="bat-form__icono" aria-hidden="true"><BatteryCharging size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="bat-form__titulo">{editando ? 'Corregir medición' : 'Nueva medición'}</h2>
            <p className="bat-form__subtitulo">{carro ? `${carro}${sitio ? ` · ${sitio}` : ''}` : 'Elige el carro'}</p>
          </div>
          <button type="button" className="bat-icono-boton" onClick={cerrar} aria-label="Cerrar (lo escrito queda guardado en este equipo)"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="bat-form__cuerpo">
          {recuperado && (
            <p className="bat-nota" role="status">
              Sigues con lo que quedó sin guardar en este equipo{!editando && inicial.carro ? ` (${inicial.carro}, ${fmtFecha(inicial.fecha)})` : ''}.{' '}
              <button type="button" className="bat-enlace" onClick={empezarDeNuevo}>{editando ? 'Volver a lo guardado' : 'Empezar de nuevo'}</button>
            </p>
          )}

          <div className="bat-form__datos">
            <label className="bat-campo">
              <span>Carro</span>
              <select className="bat-control" value={carro} onChange={e => cambiarCarro(e.target.value)} disabled={!!editando}
                aria-invalid={intento && !carro ? true : undefined}>
                <option value="" disabled>Elige el carro…</option>
                {carros.map(c => <option key={c.codigo} value={c.codigo}>{c.codigo}{c.sitio ? ` · ${c.sitio}` : ''}</option>)}
              </select>
              {intento && !carro && <small className="bat-error">Elige el carro que mediste.</small>}
            </label>
            <label className="bat-campo">
              <span>Fecha</span>
              <input type="date" className="bat-control" value={fecha} max={hoy} onChange={e => { setFecha(e.target.value); tocar(); }}
                aria-invalid={intento && !fechaOk ? true : undefined} />
              {intento && !fechaOk ? <small className="bat-error">Elige una fecha de hoy o anterior.</small>
                : <small>{fechaOk ? `Turno ${turnoDeFecha(fecha).slice(-1)}` : ''}</small>}
            </label>
          </div>

          {repetida && (
            <p className="bat-nota bat-nota--aviso">
              Ya hay una medición de {carro} del {fmtFecha(fecha)}.{' '}
              <button type="button" className="bat-enlace" onClick={() => onCorregir(repetida)}>Abrir esa para corregirla</button>
            </p>
          )}

          <p className="bat-form__ayuda">
            Resistencia interna en <b>mΩ</b> y voltaje en <b>V</b>, con coma decimal (3,38). Si una batería no se midió, déjala vacía.
            {anterior && <> En gris (“ant.”), lo de la medición del {fmtFecha(anterior.fecha)}.</>}
          </p>

          {casillas.map((banco, b) => {
            const medidasBanco = valores[b].filter(x => x.resistencia !== null && !Number.isNaN(x.resistencia)).length;
            return (
              <fieldset key={b} className="bat-banco-form">
                <legend>Banco {b + 1} <span className="bat-banco-form__avance">{medidasBanco} de {banco.length}</span></legend>
                <div className="bat-fila-form bat-fila-form--titulos" aria-hidden="true">
                  <span /> <span>mΩ</span> <span>V</span> <span className="bat-fila-form__titulo-estado">Estado</span>
                </div>
                {banco.map((c, j) => {
                  const rev = revisiones[b][j];
                  const r = valores[b][j].resistencia;
                  const ant = anterior?.bancos[b]?.baterias[j];
                  const ordenR = orden++;
                  const ordenV = orden++;
                  return (
                    <div key={j} className="bat-fila-form">
                      <span className="bat-fila-form__nombre">B{j + 1}</span>
                      <input className="bat-control bat-control--num" type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off"
                        data-orden={ordenR} value={c.r} onChange={e => cambiarCasilla(b, j, 'r', e.target.value)} onKeyDown={alTeclearCasilla}
                        placeholder={ant?.resistencia != null ? `ant. ${valorACasilla(ant.resistencia)}` : 'mΩ'}
                        aria-label={`Banco ${b + 1}, batería ${j + 1}: resistencia interna en mΩ`} aria-invalid={rev.r.error ? true : undefined} />
                      <input className="bat-control bat-control--num" type="text" inputMode="decimal" enterKeyHint="next" autoComplete="off"
                        data-orden={ordenV} value={c.v} onChange={e => cambiarCasilla(b, j, 'v', e.target.value)} onKeyDown={alTeclearCasilla}
                        placeholder={ant?.voltaje != null ? `ant. ${valorACasilla(ant.voltaje)}` : 'V'}
                        aria-label={`Banco ${b + 1}, batería ${j + 1}: voltaje en V`} aria-invalid={rev.v.error ? true : undefined} />
                      <span className="bat-fila-form__estado">
                        <Estado compacto estado={rev.r.error ? 'sin_medir' : estadoBateria(r)} />
                      </span>
                      {aviso(rev.r, b, j, 'r', 'mΩ')}
                      {aviso(rev.v, b, j, 'v', 'V')}
                    </div>
                  );
                })}
                <div className="bat-banco-form__acciones">
                  {banco.length < MAX_BATERIAS && <button type="button" className="bat-enlace" onClick={() => agregarBateria(b)}><Plus size={13} aria-hidden="true" /> Batería</button>}
                  {banco.length > 1 && <button type="button" className="bat-enlace bat-enlace--suave" onClick={() => quitarBateria(b)}><Minus size={13} aria-hidden="true" /> Quitar la última</button>}
                </div>
              </fieldset>
            );
          })}

          <div className="bat-form__bancos">
            {casillas.length < MAX_BANCOS && <button type="button" className="bat-boton" onClick={agregarBanco}><Plus size={14} aria-hidden="true" /> Agregar banco</button>}
            {casillas.length > 1 && <button type="button" className="bat-enlace bat-enlace--suave" onClick={quitarBanco}><Minus size={13} aria-hidden="true" /> Quitar el banco {casillas.length}</button>}
          </div>

          <label className="bat-campo">
            <span>Observaciones (opcional)</span>
            <textarea className="bat-control" rows={2} value={observaciones} onChange={e => { setObservaciones(e.target.value); tocar(); }}
              placeholder="Ej.: banco 3 con bornes sulfatados, se limpiaron." />
          </label>
        </div>

        <div className="bat-form__pie">
          <span className={`bat-form__progreso${intento && (errores || !medidas) ? ' bat-error' : ''}`} aria-live="polite">
            {errores ? `${errores} valor${errores === 1 ? '' : 'es'} por revisar · ` : ''}
            {intento && !medidas ? 'Escribe al menos una resistencia.' : `${medidas} de ${total} baterías medidas`}
          </span>
          <div className="bat-form__botones">
            <button type="button" className="bat-boton" onClick={cerrar}>Cancelar</button>
            <button type="submit" className="bat-boton bat-boton--principal">Guardar medición</button>
          </div>
        </div>
      </form>
    </div>
  );
}
