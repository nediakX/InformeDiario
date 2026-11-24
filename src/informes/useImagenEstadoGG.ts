// Vista previa en pantalla de las imágenes automáticas de GG que lleva el Word cuando su bloque no tiene foto:
// el estado de los generadores ("Reportabilidad de GG") y la tabla de mantenimiento ("Registro de mantenimiento de GG.").
import { useEffect, useState } from 'react';
import type { Division } from '../datos/divisiones';
import { imagenEstadoGeneradores, type ImagenEstadoGG } from './estadoGeneradores';
import { imagenTablaMantenimiento } from './tablaMantenimientoImagen';

export type TipoImagenGG = 'estado' | 'tabla';
const GENERAR: Record<TipoImagenGG, (division: Division, fecha: string) => Promise<ImagenEstadoGG | null>> = {
  estado: imagenEstadoGeneradores,
  tabla: imagenTablaMantenimiento,
};

/**
 * Imagen automática a la fecha. undefined mientras se arma; null si no hay nada que mostrar (o si no está activa).
 * Al generar el Word se vuelve a armar, con los datos de ese momento.
 */
export function useImagenGG(tipo: TipoImagenGG, division: Division, fecha: string | null, activo: boolean): ImagenEstadoGG | null | undefined {
  const clave = activo && fecha ? `${tipo}|${division}|${fecha}` : null;
  const [vista, setVista] = useState<{ clave: string; imagen: ImagenEstadoGG | null } | null>(null);
  useEffect(() => {
    if (!clave || !fecha) return;
    let vigente = true;
    GENERAR[tipo](division, fecha)
      .catch(() => null)
      .then(imagen => { if (vigente) setVista({ clave, imagen }); });
    return () => { vigente = false; };
  }, [clave, tipo, division, fecha]);
  if (!clave) return null;
  return vista?.clave === clave ? vista.imagen : undefined;
}

/** Imagen del estado de los generadores (reportabilidad de GG). */
export const useImagenEstadoGG = (division: Division, fecha: string | null, activo: boolean) => useImagenGG('estado', division, fecha, activo);
