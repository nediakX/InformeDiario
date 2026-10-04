import { useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { ArrowLeft, Printer, Loader2, FileText, Minus, Plus, Copy, RotateCw } from 'lucide-react';
import logoPsinet from "../assets/logo_psinet.jpg";
import logoEdificio from "../assets/LogoEdificio.png";

interface ImpresionRapidaProps {
  onBack: () => void;
}

/**
 * TS tipa Uint8Array.buffer como ArrayBufferLike (incluye SharedArrayBuffer),
 * pero Blob exige específicamente ArrayBuffer. pdf-lib siempre devuelve un
 * Uint8Array respaldado por un ArrayBuffer real; esta función solo ajusta
 * el tipo para el compilador, recortando al rango exacto de bytes.
 */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

interface DocumentoImprimible {
  id: string;
  nombre: string;
  descripcion: string;
  /** Ruta pública del PDF (carpeta /public/documentos/ del proyecto). */
  archivo: string;
  /**
   * true = el documento se arma para imprimirse a doble cara (dúplex): cada copia queda alineada
   * a un número par de páginas para que la hoja física 1 tenga el frente en la cara A y el reverso
   * en la cara B. false = documento normal, a una cara.
   */
  dobleCara?: boolean;
}

// Documentos de faena que se imprimen en blanco antes de cada turno.
// Los PDF deben copiarse a /public/documentos/ del proyecto (mismo nombre de archivo).
const DOCUMENTOS: DocumentoImprimible[] = [
  {
    id: 'alta-visibilidad',
    nombre: 'Checklist Alta Visibilidad',
    descripcion: 'Verificación de ropa de alta visibilidad.',
    archivo: '/documentos/CHECKLIST_ALTA_VISIBILIDAD.pdf',
  },
  {
    id: 'fatiga',
    nombre: 'Encuesta de Fatiga y Somnolencia',
    descripcion: 'Control de fatiga y somnolencia del personal.',
    archivo: '/documentos/Formato_Encuesta_Fatiga_y_somnolencia.pdf',
  },
  {
    id: 'autoevaluacion',
    nombre: 'Autoevaluación Diaria Inicio y Término de Turno',
    descripcion: 'GSSO-LTE-R-ADIYTT-DSAL-01',
    archivo: '/documentos/GSSO-LTE-R-ADIYTT-DSAL-01_Autoevaluación_Diaria_de_Inicio_y_Termino_de_Turno.pdf',
  },
  {
    id: 'protector-solar',
    nombre: 'Registro de Aplicación de Protector Solar',
    descripcion: 'GSSO-LTE-R-EQPSPRU-DSAL-06',
    archivo: '/documentos/GSSO-LTE-R-EQPSPRU-DSAL-06_REGISTRO_DE_APLICACIÓN_DE_PROTECTOR_SOLAR.pdf',
  },
  {
    id: 'hidratacion',
    nombre: 'Retiro de Agua e Hidratación en Terreno',
    descripcion: 'GSSO-LTE-R-RACPHT-DSAL-19',
    archivo: '/documentos/GSSO-LTE-R-RACPHT-DSAL-19_REGISTRO_RETIRO_DE_AGUA_PARA_CONSUMO_PERSONAL_E_HIDRATACIÓN_EN_TERRENO.pdf',
  },
  {
    id: 'radios',
    nombre: 'Inspección de Radios',
    descripcion: 'Checklist de inspección de radios portátiles (frente y reverso).',
    archivo: '/documentos/INSPECCION_RADIOS.pdf',
    dobleCara: true,
  },
];

const MAX_COPIAS = 50;

interface Resultado {
  simpleUrl: string | null;
  simpleHojas: number;
  dobleUrl: string | null;
  dobleHojas: number;
}

export default function ImpresionRapida({ onBack }: ImpresionRapidaProps) {
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(DOCUMENTOS.map(d => [d.id, 0]))
  );
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const totalCopias = DOCUMENTOS.reduce((sum, d) => sum + (cantidades[d.id] || 0), 0);

  const cambiarCantidad = (id: string, valor: number) => {
    const limpio = Math.max(0, Math.min(MAX_COPIAS, Math.round(Number.isFinite(valor) ? valor : 0)));
    setCantidades(prev => ({ ...prev, [id]: limpio }));
    setResultado(null);
  };

  const seleccionarTodos = (cantidad: number) => {
    setCantidades(Object.fromEntries(DOCUMENTOS.map(d => [d.id, cantidad])));
    setResultado(null);
  };

  // Agrega las páginas de un documento (con N copias) a un PDF en construcción, dejando cada
  // documento alineado a un número PAR de páginas acumuladas cuando corresponde imprimir a doble
  // cara: así el frente y el reverso de cada ficha quedan siempre en la misma hoja física, sin
  // mezclarse con la hoja del documento anterior o siguiente.
  const agregarDocumento = async (pdfDestino: PDFDocument, doc: DocumentoImprimible, copias: number, paginasAcumuladas: number) => {
    const respuesta = await fetch(doc.archivo);
    if (!respuesta.ok) throw new Error(`No se pudo cargar: ${doc.nombre}`);
    const bytes = await respuesta.arrayBuffer();
    const fuente = await PDFDocument.load(bytes);

    if (doc.dobleCara && paginasAcumuladas % 2 !== 0) {
      pdfDestino.addPage(); // hoja en blanco de alineación, para que este documento arranque en el frente de una hoja nueva
      paginasAcumuladas += 1;
    }

    for (let i = 0; i < copias; i++) {
      const paginas = await pdfDestino.copyPages(fuente, fuente.getPageIndices());
      paginas.forEach(pagina => pdfDestino.addPage(pagina));
      paginasAcumuladas += paginas.length;

      // Si el documento es a doble cara pero (por algún motivo) tiene una cantidad impar de
      // páginas, se agrega una hoja en blanco para que la copia siguiente también arranque alineada.
      if (doc.dobleCara && paginas.length % 2 !== 0) {
        pdfDestino.addPage();
        paginasAcumuladas += 1;
      }
    }

    return paginasAcumuladas;
  };

  // Arma dos PDF separados: uno con los documentos a una cara y otro con los de doble cara
  // (dúplex), para que en el diálogo de impresión de cada uno actives la opción correcta sin
  // tener que cambiarla a mitad de un mismo trabajo de impresión.
  const generarImpresionConjunta = async () => {
    const seleccionados = DOCUMENTOS.filter(d => (cantidades[d.id] || 0) > 0);
    if (!seleccionados.length) {
      setError("Elige al menos un documento y su cantidad de copias.");
      setResultado(null);
      return;
    }
    setError(null);
    setGenerando(true);
    setResultado(null);
    try {
      const pdfSimple = await PDFDocument.create();
      const pdfDoble = await PDFDocument.create();
      let paginasSimple = 0;
      let paginasDoble = 0;

      for (const doc of seleccionados) {
        const copias = cantidades[doc.id] || 0;
        if (doc.dobleCara) {
          paginasDoble = await agregarDocumento(pdfDoble, doc, copias, paginasDoble);
        } else {
          paginasSimple = await agregarDocumento(pdfSimple, doc, copias, paginasSimple);
        }
      }

      const simpleUrl = paginasSimple > 0
        ? URL.createObjectURL(new Blob([toArrayBuffer(await pdfSimple.save())], { type: 'application/pdf' }))
        : null;
      const dobleUrl = paginasDoble > 0
        ? URL.createObjectURL(new Blob([toArrayBuffer(await pdfDoble.save())], { type: 'application/pdf' }))
        : null;

      setResultado({
        simpleUrl,
        simpleHojas: paginasSimple,
        dobleUrl,
        dobleHojas: Math.ceil(paginasDoble / 2),
      });
    } catch (err) {
      console.error("No se pudo generar la impresión conjunta:", err);
      setError("No se pudo generar el archivo de impresión. Verifica que los documentos estén en /documentos del proyecto.");
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Impresión Rápida
              </div>
              <div className="site-header__meta text-xs truncate">
                Documentos de faena en blanco, listos para imprimir en conjunto
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver al menú
        </button>

        <div className="panel p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 className="font-display font-bold text-lg text-[#0E4660]">Elige qué imprimir</h2>
              <p className="text-sm text-gray-500 mt-1">
                Marca la cantidad de copias de cada documento. Se combinan en PDF, sin tener que abrir cada archivo por separado.
                Lo que va a doble cara (como Inspección de Radios) se arma aparte para que no tengas que cambiar la configuración de impresión a mitad del trabajo.
              </p>
            </div>
            <button type="button" onClick={() => seleccionarTodos(1)} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex-shrink-0">
              1 copia de todos
            </button>
          </div>

          <div className="space-y-2.5">
            {DOCUMENTOS.map(doc => {
              const cantidad = cantidades[doc.id] || 0;
              return (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between gap-3 border rounded-md p-3 transition-colors ${cantidad > 0 ? 'border-[#0E4660] bg-[#f0f6fb]' : 'border-[#DCE1E6] bg-white'}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={20} className="text-[#0E4660] flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-bold text-sm text-[#0E4660] truncate flex items-center gap-1.5">
                        {doc.nombre}
                        {doc.dobleCara && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#FFF3CD] text-[#856404]">
                            <Copy size={10} /> Doble cara
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">{doc.descripcion}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(doc.id, cantidad - 1)}
                      aria-label={`Restar copia de ${doc.nombre}`}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-[#DCE1E6] text-[#0E4660] hover:bg-[#d5e7f8] disabled:opacity-40"
                      disabled={cantidad <= 0}
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={MAX_COPIAS}
                      value={cantidad}
                      onChange={e => cambiarCantidad(doc.id, Number(e.target.value))}
                      className="w-12 text-center border border-[#DCE1E6] rounded-md p-1 text-sm"
                      aria-label={`Cantidad de copias de ${doc.nombre}`}
                    />
                    <button
                      type="button"
                      onClick={() => cambiarCantidad(doc.id, cantidad + 1)}
                      aria-label={`Sumar copia de ${doc.nombre}`}
                      className="w-7 h-7 flex items-center justify-center rounded-md border border-[#DCE1E6] text-[#0E4660] hover:bg-[#d5e7f8]"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">{error}</p>
        )}

        <div className="action-zone">
          <button
            onClick={() => void generarImpresionConjunta()}
            disabled={generando || totalCopias === 0}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {generando ? (
              <><Loader2 size={18} className="animate-spin" /> Preparando archivo...</>
            ) : (
              <><Printer size={18} /> Generar{totalCopias > 0 ? ` (${totalCopias} copia${totalCopias === 1 ? '' : 's'})` : ''}</>
            )}
          </button>
        </div>

        {resultado && (resultado.simpleUrl || resultado.dobleUrl) && (
          <div className="panel p-5 space-y-3">
            <h3 className="font-display font-bold text-base text-[#0E4660]">Listo, ábrelos para imprimir</h3>

            {resultado.simpleUrl && (
              <div className="flex items-center justify-between gap-3 border border-[#DCE1E6] rounded-md p-3 bg-white">
                <div className="min-w-0">
                  <div className="font-bold text-sm text-[#0E4660]">Documentos a una cara</div>
                  <div className="text-xs text-gray-500">{resultado.simpleHojas} hoja{resultado.simpleHojas === 1 ? '' : 's'} · impresión normal</div>
                </div>
                <a
                  href={resultado.simpleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary-field text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 flex-shrink-0"
                >
                  <Printer size={15} /> Abrir e imprimir
                </a>
              </div>
            )}

            {resultado.dobleUrl && (
              <div className="border border-[#F5B300] rounded-md p-3 bg-[#FFF9E8] space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-[#0E4660] flex items-center gap-1.5">
                      <RotateCw size={14} /> Inspección de Radios (doble cara)
                    </div>
                    <div className="text-xs text-gray-600">{resultado.dobleHojas} hoja{resultado.dobleHojas === 1 ? '' : 's'} física{resultado.dobleHojas === 1 ? '' : 's'} · frente y reverso ya vienen en orden</div>
                  </div>
                  <a
                    href={resultado.dobleUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-[#0E4660] text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 flex-shrink-0 hover:bg-[#0a3549]"
                  >
                    <Printer size={15} /> Abrir e imprimir
                  </a>
                </div>
                <p className="text-xs text-[#856404]">
                  En el diálogo de impresión, activa <strong>"Imprimir a doble cara"</strong> (borde largo / "Flip on long edge"). Las páginas ya están ordenadas para que cada hoja quede con el frente y el reverso correctos: el navegador no puede activar esa opción automáticamente, es una preferencia del driver de la impresora.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}