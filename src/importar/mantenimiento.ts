// Importa un Informe de Mantenimiento de Generador desde su Word.
import { uid } from '../lib/fotos';
import { fechaDesdeTexto, normalizar, sinGuion, type Bloque, type DocumentoLeido, type Tabla } from './leerDocx';
import { paresDeTabla, prepararFoto } from './comun';

const esH = (b: Bloque, nivel: 1 | 2) => b.tipo === 'p' && b.nivel === nivel;

export async function importarMantenimiento(doc: DocumentoLeido): Promise<{ titulo: string; fecha: string; datos: Record<string, unknown> }> {
  const { bloques } = doc;
  const tablas = bloques.filter((b): b is Tabla => b.tipo === 'tabla');
  const portada = tablas[0];
  const izq = portada?.filas[0]?.[0]?.textos ?? [];
  const der = (portada?.filas[0]?.[1]?.textos ?? []).filter(t => !/^_+$/.test(t));
  const iCreado = der.findIndex(t => /^creado por/i.test(t));
  const iRevisado = der.findIndex(t => /^revisado por/i.test(t));
  const creado = iCreado >= 0 ? der.slice(iCreado + 1, iRevisado >= 0 ? iRevisado : undefined) : [];
  const cargo = creado.find(t => /^cargo:/i.test(t));
  const fecha = fechaDesdeTexto(der.slice(0, Math.max(1, iCreado)).join(' ')) || fechaDesdeTexto(doc.textoCompleto);
  // Portada izquierda: "INFORME DE MANTENIMIENTO", "DE GENERADOR", sitio.
  const sitioPortada = izq.filter(t => !/informe de mantenimiento|de generador/i.test(t)).pop() ?? '';

  // Tabla REGISTRO.
  const registro = tablas.find(t => normalizar(t.filas[0]?.[0]?.textos.join(' ') ?? '') === 'registro');
  const reg = registro ? paresDeTabla(registro) : new Map<string, string>();

  // Descripción y listas.
  const iDesc = bloques.findIndex(b => esH(b, 1) && b.tipo === 'p' && /^Descripci/i.test(b.texto));
  const despues = iDesc >= 0 ? bloques.slice(iDesc + 1) : [];
  const parrafos = despues.filter(b => b.tipo === 'p') as Extract<Bloque, { tipo: 'p' }>[];
  const iComp = parrafos.findIndex(p => /siguientes componentes/i.test(p.texto));
  const iTrab = parrafos.findIndex(p => /^Trabajos realizados/i.test(p.texto));
  const vinetas = (desde: number) => {
    const out: string[] = [];
    for (const p of parrafos.slice(desde + 1)) { if (!p.vineta) break; out.push(p.texto); }
    return out;
  };
  const descripcionTexto = parrafos.slice(0, iComp >= 0 ? iComp : 1).filter(p => !p.vineta && p.texto).map(p => p.texto).join('\n');

  // Registro fotográfico: celdas [foto | leyenda | descripción], agrupadas bajo títulos de nivel 2.
  const iFotos = bloques.findIndex(b => b.tipo === 'p' && /^Registro fotogr[aá]fico del mantenimiento/i.test(b.texto));
  const modeloGenerador = iFotos >= 0 ? (bloques[iFotos] as { texto: string }).texto.replace(/^Registro fotogr[aá]fico del mantenimiento del generador\s*/i, '').trim() : '';
  const iPrograma = bloques.findIndex(b => b.tipo === 'p' && /Programa de mantenimiento/i.test(b.texto) && esH(b, 1));
  const fotos: { id: string; section: string; caption: string; description: string; photo: string | null }[] = [];
  let seccion = '';
  for (const b of bloques.slice(iFotos + 1, iPrograma >= 0 ? iPrograma : undefined)) {
    if (b.tipo === 'p') { if (esH(b, 2) && b.texto) seccion = b.texto; continue; }
    for (const fila of b.filas) {
      for (const celda of fila) {
        const textos = celda.textos.filter(t => !/^\(sin foto/i.test(t));
        fotos.push({
          id: uid(),
          section: seccion,
          caption: sinGuion(textos[0]),
          description: textos.slice(1).join('\n'),
          photo: celda.imagenes[0] ? await prepararFoto(celda.imagenes[0]) : null,
        });
      }
    }
  }

  // Programa / inspección / conclusión.
  const pPrograma = bloques.find(b => b.tipo === 'p' && /^Programa de mantenimiento seg[uú]n pauta/i.test(b.texto));
  const horasPlan = sinGuion((pPrograma?.tipo === 'p' ? pPrograma.texto : '').match(/pauta de\s+(.+?)\s+horas/i)?.[1]);
  const tablaCon = (encabezado: RegExp) => tablas.find(t => encabezado.test(t.filas[0]?.map(c => c.textos.join(' ')).join(' | ') ?? ''));
  const filasDatos = (t: Tabla | undefined, saltar = 1) => (t?.filas.slice(saltar) ?? []).map(f => f.map(c => sinGuion(c.textos.join(' '))));

  const repuestos = filasDatos(tablaCon(/^N° parte \| Cantidad \| Detalle/i)).map(([parte, cantidad, detalle]) => ({ id: uid(), parte: parte ?? '', cantidad: cantidad ?? '', detalle: detalle ?? '' }));
  const filtros = filasDatos(tablaCon(/^Filtro \| Estado/i)).map(([nombre, estado, tipo, observaciones]) => ({ id: uid(), nombre: nombre ?? '', estado: estado ?? '', tipo: tipo ?? '', observaciones: observaciones ?? '' }));
  const verificaciones = filasDatos(tablaCon(/^Verificaci[oó]n general \| Estado/i)).map(([label, estado, observaciones]) => ({ id: uid(), label: label ?? '', estado: estado ?? '', observaciones: observaciones ?? '' }));
  const plan = tablaCon(/^PLAN PREVENTIVO/i);
  const planPreventivo = filasDatos(plan, 2).map(([detalle, cantidad, parte]) => ({ id: uid(), detalle: detalle ?? '', cantidad: cantidad ?? '', parte: parte ?? '' }));

  const todas = new Map<string, string>();
  tablas.forEach(t => paresDeTabla(t).forEach((v, k) => { if (!todas.has(k)) todas.set(k, v); }));
  const val = (etiqueta: string) => sinGuion(todas.get(normalizar(etiqueta)));
  const conclusion = bloques.find(b => b.tipo === 'p' && /^Se desarroll[oó] el plan de mantenimiento/i.test(b.texto));
  const textoConclusion = conclusion?.tipo === 'p' ? conclusion.texto : '';
  const proxima = textoConclusion.match(/pr[oó]xima mantenci[oó]n se realizar[aá] a las\s+(.+?)\s+horas/i)?.[1] ?? '';
  const fechaProx = fechaDesdeTexto(val('Fecha próximo mantenimiento'));

  const sitio = sinGuion(reg.get(normalizar('Nombre Emplazamiento'))) || sitioPortada;
  const datos: Record<string, unknown> = {
    fecha,
    creadoNombre: creado.filter(t => !/^cargo:/i.test(t)).join(' ').trim(),
    creadoCargo: cargo ? cargo.replace(/^cargo:\s*/i, '').trim() : '',
    revisadoText: iRevisado >= 0 ? der.slice(iRevisado + 1).filter(t => !/^(autorizado por|cargo:)/i.test(t)).join('\n') : '',
    sitio,
    modeloGenerador,
    cliente: sinGuion(reg.get('cliente')),
    area: sinGuion(reg.get('area')),
    minera: sinGuion(reg.get('minera')),
    tipoServicio: sinGuion(reg.get(normalizar('Tipo de servicio'))),
    ejecutante: sinGuion(reg.get('ejecutante')),
    descripcionTexto,
    componentes: iComp >= 0 ? vinetas(iComp) : [],
    trabajos: iTrab >= 0 ? vinetas(iTrab) : [],
    fotos,
    horasPlan,
    repuestos,
    filtros,
    horometro: val('Horómetro'),
    cantidadPartidas: val('Cantidad de partidas'),
    nivelRefrigerante: val('Nivel de refrigerante'),
    nivelCombustible: val('Nivel de combustible'),
    nivelAceite: val('Nivel de aceite'),
    cantidadBaterias: val('Cantidad de baterías'),
    capacidadBateria: val('Capacidad batería A/HR'),
    voltajeArranque: val('Voltaje batería (arranque)'),
    voltajeMotorEncendido: val('Voltaje batería (motor encendido)'),
    verificaciones,
    horasProximaMantencion: proxima || val('Horómetro estimado'),
    planPreventivo,
    fechaProximoMantenimiento: fechaProx,
  };
  // Lo que no venga en el Word se deja como en un informe nuevo (el formulario ignora lo vacío).
  for (const [k, v] of Object.entries(datos)) if (v === '' || (Array.isArray(v) && v.length === 0)) delete datos[k];
  if (!fecha) throw new Error('No se pudo leer la fecha del informe.');
  datos.fecha = fecha;

  const titulo = sitio ? `${sitio}${modeloGenerador ? ` — ${modeloGenerador}` : ''}` : 'Mantenimiento sin sitio';
  return { titulo, fecha, datos };
}
