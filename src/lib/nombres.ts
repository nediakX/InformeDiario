// Nombre corto para los informes: nombre y primer apellido (sin segundo nombre ni inicial del segundo apellido).
// Con dos palabras (p. ej. «Williams Barraza») se deja tal cual. Con cuatro (p. ej. «Omar Jesús Gutiérrez Tapia»)
// se toma el primer nombre y el primer apellido, que es la penúltima palabra.
export const nombreCorto = (nombre: string): string => {
  const todas = nombre.trim().split(/\s+/).filter(Boolean);
  // Las iniciales con punto («G.») no cuentan como palabra si hay más nombre que eso.
  const palabras = todas.filter(p => !/^\p{L}\.$/u.test(p));
  const usar = palabras.length >= 2 ? palabras : todas;
  if (usar.length <= 2) return usar.join(' ');
  return `${usar[0]} ${usar[usar.length - 2]}`;
};
