import { useState, useRef, type PointerEvent as ReactPointerEvent } from 'react';

// Reordenar una lista arrastrando (mouse o dedo, con Pointer Events: sirve igual en el teléfono que en el
// computador). Se usa en "Personal en Turno" y "Actividades Diarias". El elemento que llama a bind(i) —
// normalmente el ícono ⠿ de la fila — captura el puntero, así los eventos de mover/soltar le siguen llegando
// aunque el dedo se mueva sobre otras filas.
export function useDragReorder<T>(items: T[], setItems: (items: T[]) => void, onDrop?: (items: T[]) => void) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const rowRefs = useRef<(HTMLElement | null)[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const setRowRef = (index: number) => (el: HTMLElement | null) => { rowRefs.current[index] = el; };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (dragIndex === null) return;
    const y = event.clientY;
    let targetIndex = itemsRef.current.length - 1;
    for (let i = 0; i < rowRefs.current.length; i++) {
      const el = rowRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (y < rect.top + rect.height / 2) { targetIndex = i; break; }
    }
    if (targetIndex !== dragIndex) {
      const updated = [...itemsRef.current];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(targetIndex, 0, moved);
      setItems(updated);
      setDragIndex(targetIndex);
    }
  };

  const finishDrag = () => {
    if (dragIndex !== null) onDrop?.(itemsRef.current);
    setDragIndex(null);
  };

  const bind = (index: number) => ({
    onPointerDown: (event: ReactPointerEvent) => {
      event.preventDefault();
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
      setDragIndex(index);
    },
    onPointerMove,
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  });

  return { dragIndex, setRowRef, bind };
}
