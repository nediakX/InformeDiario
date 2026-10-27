// Criterios de la presentación del turno: qué es una difusión, cómo se reconoce un sitio en un texto y cómo se
// consolidan las actividades repetidas. Sin dependencias, para usarlos en el modelo y al armar el .pptx.

/** Minúsculas y sin tildes: "Mantención" -> "mantencion". */
export const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Flash, charlas, reuniones y capacitaciones: son difusiones, no actividades de trabajo.
const ES_DIFUSION = /flash|difusion|charla|reunion|capacitacion|induccion|sensibilizacion|entrenamiento/;

/**
 * Lado de cada foto en las láminas de difusiones: las difusiones van a la izquierda y las actividades de trabajo
 * (ART, inspecciones, instalaciones, mantenciones...) a la derecha. Un título que empieza con "ART:" es siempre
 * actividad de trabajo.
 */
export const esDifusion = (titulo: string): boolean =>
  !/^art:/i.test(titulo.trim()) && ES_DIFUSION.test(sinAcentos(titulo));

/** Actividad de mantención (preventiva o mantenimiento): sirve para marcar REALIZADO en la lámina de mantenciones. */
export const esMantencion = (texto: string): boolean => /manten|preventiv/.test(sinAcentos(texto));

/**
 * Forma comparable de un sitio, equipo o número: "LTE_CMM_10", "LTE-CMM-10" y "LTE CMM 10" quedan iguales. La letra O
 * delante de un número cuenta como cero ("CM_MM_OO_O1" es "CM_MM_OO_01") y los ceros de adelante no importan ("01" es "1").
 */
const claveSitio = (s: string) =>
  sinAcentos(s).replace(/[^a-z0-9]+/g, ' ').replace(/\bo(?=\d)/g, '0').replace(/\b0+(?=\d)/g, '').trim();

/** Nombres con que un informe puede mencionar un sitio. Los generadores "CM_MM_OO_01" aparecen también como "MMOO 01". */
const nombresDeSitio = (sitio: string): string[] => {
  const clave = claveSitio(sitio);
  const generador = /^cm mm oo (\d+)$/.exec(clave);
  return generador ? [clave, `mmoo ${generador[1]}`, `mm oo ${generador[1]}`] : [clave];
};

/** ¿El texto menciona el sitio como palabra completa? "LTE CMM 1" no aparece dentro de "LTE CMM 10". */
export const mencionaSitio = (texto: string, sitio: string): boolean => {
  if (!claveSitio(sitio)) return false;
  const t = ` ${claveSitio(texto)} `;
  return nombresDeSitio(sitio).some(n => t.includes(` ${n} `));
};

// Palabras que no distinguen una actividad de otra: "N°52" es "52", y la "y" une los sitios de una lista.
const RUIDO = new Set(['n', 'no', 'y', 'con', 'de', 'del', 'en', 'el', 'la', 'los', 'las', 'a']);

interface PartesActividad { palabras: Set<string>; numeros: Set<string> }

const partesDe = (texto: string): PartesActividad => {
  const palabras = new Set<string>();
  const numeros = new Set<string>();
  for (const token of claveSitio(texto).split(' ').filter(Boolean)) {
    if (/^\d+$/.test(token)) numeros.add(String(Number(token)));
    else if (!RUIDO.has(token)) palabras.add(token);
  }
  return { palabras, numeros };
};

const incluido = (a: Set<string>, b: Set<string>) => [...a].every(x => b.has(x));

/** Misma actividad: los mismos números (flash 52, sitios 01 a 11) y una redacción que contiene a la otra. */
const sonLaMisma = (a: PartesActividad, b: PartesActividad) =>
  a.palabras.size + a.numeros.size > 0 &&
  a.numeros.size === b.numeros.size && incluido(a.numeros, b.numeros) &&
  (incluido(a.palabras, b.palabras) || incluido(b.palabras, a.palabras));

/**
 * Une las actividades que son la misma escrita de otra forma: "DIFUSIÓN FLASH 52." con "DIFUSIÓN FLASH N°52 DSAL.",
 * o el mismo registro con otra lista de sitios. Se queda con la redacción más completa, en el orden en que aparece.
 * Las que tienen otros números (flash 52 y flash 136) no se unen.
 */
export const consolidarActividades = (actividades: string[]): string[] => {
  const grupos: { texto: string; partes: PartesActividad }[] = [];
  for (const texto of actividades) {
    const partes = partesDe(texto);
    const grupo = grupos.find(g => sonLaMisma(g.partes, partes));
    if (!grupo) {
      grupos.push({ texto, partes });
      continue;
    }
    if (partes.palabras.size > grupo.partes.palabras.size) {
      grupo.texto = texto;
      grupo.partes = partes;
    }
  }
  return grupos.map(g => g.texto);
};
