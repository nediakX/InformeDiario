// Vista previa en pantalla de la imagen del estado de los generadores (la que lleva el Word en el "Registro de
// mantenimiento de GG." del Informe Diario y en la "Reportabilidad GG" del Informe de Cierre).
import { useEffect, useState } from 'react';
import type { Division } from '../datos/divisiones';
import { imagenEstadoGeneradores, type ImagenEstadoGG } from './estadoGeneradores';

/**
 * Imagen del estado de los generadores a la fecha. undefined mientras se arma; null si no hay nada que mostrar
 * (o si no está activa). Al generar el Word se vuelve a armar, con los reportes de ese momento.
 */
export function useImagenEstadoGG(division: Division, fecha: string | null, activo: boolean): ImagenEstadoGG | null | undefined {
  const clave = activo && fecha ? `${division}|${fecha}` : null;
  const [vista, setVista] = useState<{ clave: string; imagen: ImagenEstadoGG | null } | null>(null);
  useEffect(() => {
    if (!clave || !fecha) return;
    let vigente = true;
    imagenEstadoGeneradores(division, fecha)
      .catch(() => null)
      .then(imagen => { if (vigente) setVista({ clave, imagen }); });
    return () => { vigente = false; };
  }, [clave, division, fecha]);
  if (!clave) return null;
  return vista?.clave === clave ? vista.imagen : undefined;
}
