// Elegir los accesos rápidos del inicio: anclar y quitar (hasta 5), ordenarlos y volver a los del rol.
// Nada se guarda hasta "Guardar"; "Cancelar", Esc o tocar fuera cierran sin cambios.
import { useEffect, useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Pin, PinOff, RotateCcw, X } from 'lucide-react';
import { MAX_ACCESOS_RAPIDOS, type IdTarea } from '../datos/roles';
import { mismosAccesos } from '../datos/accesosRapidos';
import { INFO_TAREA } from './tareasInicio';

interface Props {
  /** Opciones que la persona puede anclar, en el orden de "Todas las opciones". */
  disponibles: IdTarea[];
  /** Los que se ven ahora en el inicio. */
  actuales: IdTarea[];
  /** Los de su rol (los que se ven mientras la cuenta no elija). */
  delRol: IdTarea[];
  /** La cuenta ya eligió los suyos (si no, se ven los del rol). */
  propios: boolean;
  /** Nombre del rol para los textos ("Supervisor"). */
  nombreRol: string;
  onCerrar: () => void;
  /** Lista elegida, o null para volver a los del rol. */
  onGuardar: (ids: IdTarea[] | null) => void;
}

function IconoTarea({ id }: { id: IdTarea }) {
  const { icono: Icono, color } = INFO_TAREA[id];
  return (
    <span className="dash-editor__icono-tarea" style={{ background: color }} aria-hidden="true">
      <Icono size={16} color="#fff" strokeWidth={2} />
    </span>
  );
}

export default function EditorAccesosRapidos({ disponibles, actuales, delRol, propios, nombreRol, onCerrar, onGuardar }: Props) {
  const base = useId();
  const idTitulo = `${base}-titulo`;
  const [lista, setLista] = useState<IdTarea[]>(actuales);
  const lleno = lista.length >= MAX_ACCESOS_RAPIDOS;
  const otras = disponibles.filter(id => !lista.includes(id));
  const comoElRol = mismosAccesos(lista, delRol);
  // Hay algo que guardar: la lista cambió, o la cuenta tenía los suyos y ahora quedan como los del rol.
  const hayCambios = !mismosAccesos(lista, actuales) || (propios && comoElRol);

  // Al abrir, el foco va al diálogo; Esc cierra (con la versión más nueva de onCerrar).
  const dialogo = useRef<HTMLDivElement>(null);
  const cerrarRef = useRef(onCerrar);
  useEffect(() => { cerrarRef.current = onCerrar; });
  useEffect(() => {
    dialogo.current?.focus();
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrarRef.current(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, []);

  // Al mover, anclar o quitar, el foco del teclado sigue a la opción (o pasa a la vecina).
  const focoPendiente = useRef<string | null>(null);
  useEffect(() => {
    if (!focoPendiente.current) return;
    document.getElementById(focoPendiente.current)?.focus();
    focoPendiente.current = null;
  });
  const idBoton = (accion: 'subir' | 'bajar' | 'quitar' | 'anclar', id: IdTarea) => `${base}-${accion}-${id}`;

  const mover = (i: number, paso: -1 | 1) => {
    const j = i + paso;
    if (j < 0 || j >= lista.length) return;
    const nueva = [...lista];
    [nueva[i], nueva[j]] = [nueva[j], nueva[i]];
    setLista(nueva);
    const llegoAlBorde = j === 0 || j === nueva.length - 1;
    focoPendiente.current = idBoton(llegoAlBorde ? (paso === -1 ? 'bajar' : 'subir') : (paso === -1 ? 'subir' : 'bajar'), lista[i]);
  };

  const quitar = (i: number) => {
    const id = lista[i];
    const nueva = lista.filter((_, k) => k !== i);
    setLista(nueva);
    const vecina = nueva[i] ?? nueva[i - 1];
    focoPendiente.current = vecina ? idBoton('quitar', vecina) : idBoton('anclar', id);
  };

  const anclar = (id: IdTarea) => {
    if (lleno) return;
    const nueva = [...lista, id];
    setLista(nueva);
    const k = otras.indexOf(id);
    const siguiente = otras[k + 1] ?? otras[k - 1];
    focoPendiente.current = nueva.length < MAX_ACCESOS_RAPIDOS && siguiente ? idBoton('anclar', siguiente) : idBoton('quitar', id);
  };

  return (
    <div className="dash-editor-fondo" onClick={onCerrar}>
      <div ref={dialogo} role="dialog" aria-modal="true" aria-labelledby={idTitulo} tabIndex={-1}
        className="modal-anim dash-editor" onClick={e => e.stopPropagation()}>
        <div className="dash-editor__cabecera">
          <span className="dash-editor__simbolo" aria-hidden="true"><Pin size={18} /></span>
          <div className="min-w-0 flex-1">
            <h2 id={idTitulo} className="dash-editor__titulo">Accesos rápidos</h2>
            <p className="dash-editor__ayuda">Ancla hasta {MAX_ACCESOS_RAPIDOS} opciones y ordénalas. Se guardan en tu cuenta, así las ves en cualquier equipo.</p>
          </div>
          <button type="button" className="dash-editor__boton-icono" onClick={onCerrar} aria-label="Cerrar"><X size={18} aria-hidden="true" /></button>
        </div>

        <div className="dash-editor__cuerpo">
          <section aria-labelledby={`${base}-anclados`}>
            <h3 id={`${base}-anclados`} className="dash-editor__seccion">
              En tu inicio
              <span className={`dash-editor__cuenta${lleno ? ' dash-editor__cuenta--lleno' : ''}`}>{lista.length} de {MAX_ACCESOS_RAPIDOS}</span>
            </h3>
            {lista.length === 0 ? (
              <p className="dash-editor__vacio">Sin accesos rápidos. Ancla alguna de las opciones de abajo.</p>
            ) : (
              <ol className="dash-editor__lista">
                {lista.map((id, i) => {
                  const titulo = INFO_TAREA[id].titulo;
                  return (
                    <li key={id} className="dash-editor__fila dash-editor__fila--anclada">
                      <IconoTarea id={id} />
                      <span className="dash-editor__nombre">{titulo}</span>
                      <span className="dash-editor__acciones">
                        <button type="button" id={idBoton('subir', id)} className="dash-editor__boton-icono" disabled={i === 0}
                          onClick={() => mover(i, -1)} aria-label={`Subir ${titulo}`} title="Subir"><ArrowUp size={16} aria-hidden="true" /></button>
                        <button type="button" id={idBoton('bajar', id)} className="dash-editor__boton-icono" disabled={i === lista.length - 1}
                          onClick={() => mover(i, 1)} aria-label={`Bajar ${titulo}`} title="Bajar"><ArrowDown size={16} aria-hidden="true" /></button>
                        <button type="button" id={idBoton('quitar', id)} className="dash-editor__boton-icono dash-editor__boton-icono--quitar"
                          onClick={() => quitar(i)} aria-label={`Quitar ${titulo} de los accesos rápidos`} title="Quitar"><PinOff size={16} aria-hidden="true" /></button>
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {comoElRol ? (
              <p className="dash-editor__nota">Son los de tu rol ({nombreRol}).</p>
            ) : delRol.length > 0 && (
              <button type="button" className="dash-editor__rol" onClick={() => setLista(delRol)}>
                <RotateCcw size={14} aria-hidden="true" /> Volver a los de tu rol ({nombreRol})
              </button>
            )}
          </section>

          {otras.length > 0 && (
            <section aria-labelledby={`${base}-otras`}>
              <h3 id={`${base}-otras`} className="dash-editor__seccion">Otras opciones</h3>
              {lleno && <p className="dash-editor__aviso" role="status">Ya tienes {MAX_ACCESOS_RAPIDOS}, el máximo. Quita uno para anclar otro.</p>}
              <ul className="dash-editor__lista">
                {otras.map(id => (
                  <li key={id}>
                    <button type="button" id={idBoton('anclar', id)} className="dash-editor__fila dash-editor__fila--boton" disabled={lleno}
                      onClick={() => anclar(id)} aria-label={`Anclar ${INFO_TAREA[id].titulo}`}>
                      <IconoTarea id={id} />
                      <span className="dash-editor__nombre">{INFO_TAREA[id].titulo}</span>
                      <span className="dash-editor__anclar" aria-hidden="true"><Pin size={13} /> Anclar</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="dash-editor__pie">
          <button type="button" className="dash-editor__boton" onClick={onCerrar}>Cancelar</button>
          <button type="button" className="dash-editor__boton dash-editor__boton--principal" disabled={!hayCambios}
            onClick={() => onGuardar(comoElRol ? null : lista)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}
