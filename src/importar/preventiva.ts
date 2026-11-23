// Importa una Mantención preventiva de sitio desde su Word (el que arma la app): portada (sitio, sector,
// coordenadas, fecha y quién lo creó), personal en turno y ejecutantes, las fotos de cada sección con sus
// textos y las horas de la bitácora. Las actividades y la bitácora se rearman solas, como en el formulario.
import { uid } from '../lib/fotos';
import { configDivision, type Division } from '../datos/divisiones';
import { fechaDesdeTexto, normalizar, type Bloque, type DocumentoLeido, type Parrafo, type Tabla } from './leerDocx';
import { prepararFoto } from './comun';
import {
  CANTIDAD_DE, HORAS_DEFECTO, casillasDe, casillaNueva, seccionesPorDefecto, sinPunto,
  type ClaveSeccion, type FormatoFoto, type FotoPrev, type HorasBitacora, type PersonaPrev, type SeccionPrev,
} from '../informes/preventiva/modelo';
import { armarDatosPreventiva, personalDelTurno } from '../informes/preventiva/borrador';

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Una foto del Word con los textos de su leyenda. */
interface FotoLeida {
  photo: string | null;
  titulo: string;
  descripcion: string;
  valor?: string;
  /** La leyenda no trae "Descripción:" (capturas de consola: título y detalle). */
  sinPrefijo: boolean;
}

const esTitulo2 = (b: Bloque): b is Parrafo => b.tipo === 'p' && b.nivel === 2 && b.texto !== '';
const DESCRIPCION = /^descripci[oó]n:\s*/i;

/** Líneas de un párrafo con sus columnas (separadas por tabulación): "1.⇥Nombre⇥Cargo". */
function lineasConColumnas(p: Element): string[][] {
  let texto = '';
  const recorrer = (nodo: Element) => {
    for (const h of Array.from(nodo.children)) {
      if (h.namespaceURI === W) {
        if (h.localName === 'pPr') continue; // las tabulaciones definidas en el formato no son texto
        if (h.localName === 't') { texto += h.textContent ?? ''; continue; }
        if (h.localName === 'tab') { texto += '\t'; continue; }
        if (h.localName === 'br' || h.localName === 'cr') { texto += '\n'; continue; }
      }
      recorrer(h);
    }
  };
  recorrer(p);
  return texto.split('\n').map(l => l.split('\t').map(c => c.trim()).filter(Boolean)).filter(l => l.length > 0);
}

/** Personas del párrafo que sigue a un subtítulo ("Personal en Turno.", "Personal Ejecutante…"). */
function personasDespuesDe(xml: Document, subtitulo: RegExp): { nombre: string; cargo: string }[] {
  const parrafos = Array.from(xml.getElementsByTagNameNS(W, 'body')[0]?.children ?? []).filter(e => e.namespaceURI === W && e.localName === 'p');
  const i = parrafos.findIndex(p => subtitulo.test(normalizar(p.textContent ?? '')));
  if (i < 0) return [];
  const lista = parrafos.slice(i + 1).find(p => (p.textContent ?? '').trim() !== '');
  if (!lista) return [];
  return lineasConColumnas(lista).map(columnas => {
    const sinNumero = /^\d+\.?$/.test(columnas[0]) ? columnas.slice(1) : columnas;
    return { nombre: sinPunto(sinNumero[0] ?? ''), cargo: sinPunto(sinNumero.slice(1).join(' ')) };
  }).filter(p => p.nombre);
}

/** Fotos de una tabla del registro: filas de fotos y, debajo, sus leyendas. */
function fotosDeTabla(t: Tabla): FotoLeida[] {
  const fotos: FotoLeida[] = [];
  for (let r = 0; r + 1 < t.filas.length; r += 2) {
    t.filas[r].forEach((celda, i) => {
      const textos = t.filas[r + 1][i]?.textos ?? [];
      const iDesc = textos.findIndex(x => DESCRIPCION.test(x));
      const photo = celda.imagenes[0] ?? null;
      if (!photo && !textos.length) return;
      fotos.push(iDesc >= 0
        ? {
          photo, sinPrefijo: false,
          titulo: textos.slice(0, iDesc).join(' '),
          descripcion: textos[iDesc].replace(DESCRIPCION, ''),
          valor: textos.slice(iDesc + 1).join(' ') || undefined,
        }
        : { photo, sinPrefijo: true, titulo: textos[0] ?? '', descripcion: textos.slice(1).join(' ') });
    });
  }
  return fotos;
}

/** Mayor número que aparece en las descripciones ("banco de baterías 2", "dado de concreto N°3"). */
function cantidadDe(fotos: FotoLeida[], patron: RegExp): number | undefined {
  const numeros = fotos.map(f => Number(f.descripcion.match(patron)?.[1])).filter(n => Number.isFinite(n) && n > 0);
  return numeros.length ? Math.max(...numeros) : undefined;
}

const PATRON_CANTIDAD: Partial<Record<ClaveSeccion, RegExp>> = {
  baterias: /bater[ií]as\s+(\d+)/i,
  medicion: /bater[ií]as\s+(\d+)/i,
  dados: /N°\s*(\d+)/i,
  vientos: /N°\s*(\d+)/i,
};

const mismaLeyenda = (c: Pick<FotoPrev, 'titulo' | 'descripcion'>, f: FotoLeida) =>
  normalizar(c.descripcion) === normalizar(f.descripcion) && normalizar(c.titulo) === normalizar(f.titulo);

/**
 * Arma una sección con las fotos leídas: cada foto vuelve a su casilla (la que tiene la misma leyenda) y las
 * que no calzan con ninguna quedan como fotos agregadas a mano, con sus textos.
 */
function seccionDesdeWord(base: SeccionPrev, leidas: FotoLeida[]): SeccionPrev {
  const clave = base.clave;
  const patron = PATRON_CANTIDAD[clave];
  const cantidad = CANTIDAD_DE[clave] ? (patron && cantidadDe(leidas, patron)) || base.cantidad : base.cantidad;
  const enlaces = clave === 'consolas'
    ? leidas.filter(f => /^enlace a\s+/i.test(f.descripcion)).map(f => f.descripcion.replace(/^enlace a\s+/i, '').replace(/\.+$/, '').trim())
    : base.enlaces;
  const casillas: FotoPrev[] = clave === 'extra' ? [] : casillasDe(clave, cantidad ?? 0, enlaces ?? []).map(c => ({ ...c, id: uid(), photo: null }));
  const usadas = new Set<number>();
  const sueltas: FotoPrev[] = [];
  for (const f of leidas) {
    const i = casillas.findIndex((c, j) => !usadas.has(j) && mismaLeyenda(c, f));
    if (i >= 0) {
      usadas.add(i);
      casillas[i] = { ...casillas[i], photo: f.photo, ...(casillas[i].valor !== undefined ? { valor: f.valor ?? '' } : {}) };
    } else {
      const formato: FormatoFoto = clave === 'documentacion' ? 'doc' : f.sinPrefijo && f.titulo ? 'consola' : 'par';
      sueltas.push({
        ...casillaNueva(formato), titulo: f.titulo, descripcion: f.descripcion, photo: f.photo,
        ...(f.valor ? { valor: f.valor } : {}),
      });
    }
  }
  return {
    ...base, activa: true, fotos: [...casillas, ...sueltas],
    ...(cantidad !== undefined ? { cantidad } : {}),
    ...(clave === 'consolas' ? { enlaces: enlaces ?? [] } : {}),
  };
}

/** Comprime las fotos de a pocas (son muchas y grandes). */
async function comprimirFotos(secciones: SeccionPrev[]): Promise<SeccionPrev[]> {
  const fotos = secciones.flatMap(s => s.fotos.filter(f => f.photo));
  for (let i = 0; i < fotos.length; i += 4) {
    await Promise.all(fotos.slice(i, i + 4).map(async f => { f.photo = await prepararFoto(f.photo as string); }));
  }
  return secciones;
}

/** "dd/mm/aa" de la descripción ("con fecha 08/11/26") → ISO. */
const fechaCorta = (texto: string) => {
  const m = texto.match(/con fecha\s+(\d{1,2})\/(\d{1,2})\/(\d{2})\b/i);
  return m ? `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

const HORA = /^\d{1,2}:\d{2}$/;

export async function importarPreventiva(doc: DocumentoLeido, division: Division): Promise<{ titulo: string; fecha: string; datos: Record<string, unknown> }> {
  const { bloques } = doc;
  const tablas = bloques.filter((b): b is Tabla => b.tipo === 'tabla');

  // Portada: "Mantención Preventiva O&M", …, sitio, SECTOR, sector, Coordenadas, coordenadas, FECHA dd/mm/aaaa, Creado por…
  const portada = tablas.find(t => t.filas.some(f => f.some(c => c.textos.some(x => /^sector$/i.test(x)))));
  const textos = portada ? portada.filas.flat().flatMap(c => c.textos) : [];
  const despuesDe = (patron: RegExp) => { const i = textos.findIndex(x => patron.test(x)); return i >= 0 ? textos[i + 1] ?? '' : ''; };
  const iSector = textos.findIndex(x => /^sector$/i.test(x));
  const sitio = (iSector > 0 ? textos[iSector - 1] : '').trim();
  const sector = despuesDe(/^sector$/i).replace(/^coordenadas$/i, '').trim();
  const coordenadas = despuesDe(/^coordenadas$/i).replace(/^fecha\b.*$/i, '').trim();
  const lineaFecha = textos.find(x => /^fecha\b/i.test(x)) ?? '';
  const descripcion = bloques.find(b => b.tipo === 'p' && /certifica la realizaci[oó]n de mantenimiento preventivo/i.test(b.texto));
  const fecha = fechaDesdeTexto(lineaFecha) || fechaCorta(descripcion?.tipo === 'p' ? descripcion.texto : '');
  if (!fecha) throw new Error('No se pudo leer la fecha del informe.');
  const iCreado = textos.findIndex(x => /^creado por/i.test(x));
  const creadoNombre = iCreado >= 0 ? sinPunto(textos[iCreado + 1] ?? '') : '';
  const lineaCargo = iCreado >= 0 ? textos[iCreado + 2] ?? '' : '';
  const creadoCargo = /^cargo:/i.test(lineaCargo) ? sinPunto(lineaCargo.replace(/^cargo:\s*/i, '')) : '';
  const sitioFinal = sitio || (descripcion?.tipo === 'p' ? descripcion.texto.match(/en el sitio\s+(\S+?),/i)?.[1] ?? '' : '');
  if (!sitioFinal) throw new Error('No se pudo leer el sitio del informe.');

  // Personal en turno y quiénes ejecutaron el mantenimiento.
  const enTurno = personasDespuesDe(doc.xml, /^personal en turno/);
  const ejecutantes = personasDespuesDe(doc.xml, /^personal ejecutante/);
  const clavePersona = (n: string) => normalizar(n);
  const personal: PersonaPrev[] = enTurno.map(p => ({ id: uid(), ...p, ejecutante: ejecutantes.some(e => clavePersona(e.nombre) === clavePersona(p.nombre)) }));
  for (const e of ejecutantes) {
    if (!personal.some(p => clavePersona(p.nombre) === clavePersona(e.nombre))) personal.push({ id: uid(), ...e, ejecutante: true });
  }

  // Secciones de fotos: desde después del personal ejecutante hasta la bitácora. Las fotos antes del primer
  // título son la vista general del sitio (no lleva título).
  const iEjecutantes = bloques.findIndex(b => esTitulo2(b) && /^personal ejecutante/.test(normalizar(b.texto)));
  const iBitacora = bloques.findIndex(b => esTitulo2(b) && /^bitacora de las actividades/.test(normalizar(b.texto)));
  const cuerpo = bloques.slice(iEjecutantes >= 0 ? iEjecutantes + 2 : 0, iBitacora >= 0 ? iBitacora : undefined);
  const grupos: { titulo: string | null; fotos: FotoLeida[] }[] = [{ titulo: null, fotos: [] }];
  for (const b of cuerpo) {
    if (esTitulo2(b)) grupos.push({ titulo: b.texto, fotos: [] });
    else if (b.tipo === 'tabla') grupos[grupos.length - 1].fotos.push(...fotosDeTabla(b));
  }

  const cfg = configDivision(division);
  const porDefecto = seccionesPorDefecto(cfg.vertiv);
  const claveDeTitulo = new Map(porDefecto.map(s => [normalizar(s.titulo), s.clave]));
  const leidasPorClave = new Map<ClaveSeccion, FotoLeida[]>();
  const extras: SeccionPrev[] = [];
  for (const g of grupos) {
    if (!g.fotos.length) continue;
    const clave = g.titulo === null ? 'vista' : claveDeTitulo.get(normalizar(g.titulo));
    if (clave) leidasPorClave.set(clave, [...(leidasPorClave.get(clave) ?? []), ...g.fotos]);
    else extras.push(seccionDesdeWord({ id: uid(), clave: 'extra', titulo: g.titulo ?? 'Otras fotos', mostrarTitulo: true, activa: true, fotos: [] }, g.fotos));
  }
  const secciones = await comprimirFotos([
    ...porDefecto.map(s => (leidasPorClave.has(s.clave) ? seccionDesdeWord(s, leidasPorClave.get(s.clave)!) : s)),
    ...extras,
  ]);

  // Horas de la bitácora (planificación y mantenimiento).
  const bitacora = tablas.find(t => normalizar(t.filas[0]?.map(c => c.textos.join(' ')).join(' | ') ?? '').startsWith('hora inicio'));
  const hora = (fila: number, columna: number, defecto: string) => {
    const t = bitacora?.filas[fila]?.[columna]?.textos.join(' ').trim() ?? '';
    return HORA.test(t) ? t.padStart(5, '0') : defecto;
  };
  const horas: HorasBitacora = {
    planInicio: hora(1, 0, HORAS_DEFECTO.planInicio), planTermino: hora(1, 2, HORAS_DEFECTO.planTermino),
    mantInicio: hora(2, 0, HORAS_DEFECTO.mantInicio), mantTermino: hora(2, 2, HORAS_DEFECTO.mantTermino),
  };

  const datos = armarDatosPreventiva({
    fecha, sitio: sitioFinal, sector, coordenadas, creadoNombre, creadoCargo,
    personal: personal.length ? personal : personalDelTurno(fecha, division), secciones, horas,
  }, division);
  return { titulo: `Mantención preventiva · ${sitioFinal}`, fecha, datos: datos as unknown as Record<string, unknown> };
}
