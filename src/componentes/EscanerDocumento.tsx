// Escáner de documentos (Informe Diario): cámara o imagen → ajustar las 4 esquinas de la hoja →
// documento enderezado y con aspecto de escaneo (Documento / Color / Original) → se inserta.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Camera, ImageUp, Loader2, RotateCw, Crop, Check, X, ScanLine } from 'lucide-react';
import {
  aJpeg, aplicarFiltro, cargarImagen, cargarOpenCv, detectarHoja, enderezar, esquinasPorDefecto,
  lienzoDesdeImagen, rotar90, type Esquinas, type FiltroEscaneo,
} from '../lib/escaner';
import './escaner.css';

type Etapa = 'camara' | 'ajustar' | 'resultado';

const FILTROS: { id: FiltroEscaneo; nombre: string }[] = [
  { id: 'documento', nombre: 'Documento' },
  { id: 'color', nombre: 'Color' },
  { id: 'original', nombre: 'Original' },
];

export default function EscanerDocumento({ onUsar, onCancelar }: {
  onUsar: (dataUrl: string) => void;
  onCancelar: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('camara');
  const [mensaje, setMensaje] = useState('Encuadra la hoja completa sobre un fondo que contraste y captura.');
  const [ocupado, setOcupado] = useState(false);
  const [sinCamara, setSinCamara] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Imagen capturada (lienzo de trabajo) y su vista.
  const capturaRef = useRef<HTMLCanvasElement | null>(null);
  const [capturaUrl, setCapturaUrl] = useState<string | null>(null);
  const [tamano, setTamano] = useState({ w: 1, h: 1 });
  const [esquinas, setEsquinas] = useState<Esquinas | null>(null);

  // Documento enderezado y resultado con filtro.
  const enderezadoRef = useRef<HTMLCanvasElement | null>(null);
  const [filtro, setFiltro] = useState<FiltroEscaneo>('documento');
  const [resultado, setResultado] = useState<string | null>(null);

  // Cámara: se abre en la etapa de captura y se apaga al salir de ella.
  useEffect(() => {
    if (etapa !== 'camara') return;
    let cancelado = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setSinCamara(true));
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    })
      .then(stream => {
        if (cancelado) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; void videoRef.current.play(); }
      })
      .catch(() => setSinCamara(true));
    // Mientras tanto se precarga OpenCV, así el escaneo es inmediato al capturar.
    void cargarOpenCv().catch(() => undefined);
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [etapa]);

  const prepararAjuste = async (lienzo: HTMLCanvasElement) => {
    capturaRef.current = lienzo;
    setCapturaUrl(lienzo.toDataURL('image/jpeg', 0.9));
    setTamano({ w: lienzo.width, h: lienzo.height });
    setEtapa('ajustar');
    setOcupado(true);
    setMensaje('Buscando los bordes de la hoja…');
    try {
      const detectadas = await detectarHoja(lienzo);
      setEsquinas(detectadas ?? esquinasPorDefecto(lienzo.width, lienzo.height));
      setMensaje(detectadas
        ? 'Revisa las esquinas: arrastra los puntos si no calzan con la hoja.'
        : 'No se detectó la hoja: arrastra los 4 puntos a las esquinas del documento.');
    } catch {
      setEsquinas(esquinasPorDefecto(lienzo.width, lienzo.height));
      setMensaje('Arrastra los 4 puntos a las esquinas del documento.');
    } finally {
      setOcupado(false);
    }
  };

  const capturar = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const lienzo = document.createElement('canvas');
    const escala = Math.min(1, 2000 / Math.max(video.videoWidth, video.videoHeight));
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    lienzo.getContext('2d')?.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    void prepararAjuste(lienzo);
  };

  const elegirImagen = async (archivo: File) => {
    const url = URL.createObjectURL(archivo);
    try {
      const img = await cargarImagen(url);
      void prepararAjuste(lienzoDesdeImagen(img));
    } catch {
      setMensaje('No se pudo leer esa imagen. Prueba con otra.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const generar = async (lienzo: HTMLCanvasElement, f: FiltroEscaneo) => {
    setOcupado(true);
    try {
      const final = await aplicarFiltro(lienzo, f);
      setResultado(aJpeg(final));
    } catch (error) {
      console.error('No se pudo aplicar el filtro de escaneo:', error);
      setResultado(aJpeg(lienzo));
    } finally {
      setOcupado(false);
    }
  };

  const recortar = async () => {
    if (!capturaRef.current || !esquinas) return;
    setOcupado(true);
    setMensaje('Enderezando y limpiando el documento…');
    try {
      const recto = await enderezar(capturaRef.current, esquinas);
      enderezadoRef.current = recto;
      setEtapa('resultado');
      setMensaje('Elige cómo quieres el documento y úsalo.');
      await generar(recto, filtro);
    } catch (error) {
      console.error('No se pudo enderezar el documento:', error);
      setMensaje('No se pudo procesar la imagen. Intenta capturarla de nuevo.');
      setOcupado(false);
    }
  };

  const cambiarFiltro = (f: FiltroEscaneo) => {
    setFiltro(f);
    if (enderezadoRef.current) void generar(enderezadoRef.current, f);
  };

  const girar = () => {
    if (!enderezadoRef.current) return;
    enderezadoRef.current = rotar90(enderezadoRef.current);
    void generar(enderezadoRef.current, filtro);
  };

  const volverACapturar = () => {
    setEsquinas(null); setCapturaUrl(null); setResultado(null);
    setMensaje('Encuadra la hoja completa sobre un fondo que contraste y captura.');
    setEtapa('camara');
  };

  // --- Arrastre de esquinas -------------------------------------------------------------------
  const marcoRef = useRef<HTMLDivElement>(null);
  const [arrastrando, setArrastrando] = useState<number | null>(null);
  const moverEsquina = (e: ReactPointerEvent) => {
    if (arrastrando === null || !esquinas || !marcoRef.current) return;
    const r = marcoRef.current.getBoundingClientRect();
    const x = Math.min(Math.max(0, ((e.clientX - r.left) / r.width) * tamano.w), tamano.w);
    const y = Math.min(Math.max(0, ((e.clientY - r.top) / r.height) * tamano.h), tamano.h);
    const nuevas = [...esquinas] as Esquinas;
    nuevas[arrastrando] = { x, y };
    setEsquinas(nuevas);
  };

  const radio = Math.max(tamano.w, tamano.h) * 0.022;

  return (
    <div className="fixed inset-0 z-50 bg-black/90 p-3 sm:p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="escaner-titulo">
      <div className="modal-anim escaner">
        <div className="escaner__cabecera">
          <h2 id="escaner-titulo"><ScanLine size={18} aria-hidden="true" /> Escanear documento</h2>
          <button type="button" onClick={onCancelar} className="escaner__cerrar" aria-label="Cerrar escáner"><X size={20} /></button>
        </div>
        <p className="escaner__mensaje" role="status">
          {ocupado && <Loader2 size={14} className="animate-spin" aria-hidden="true" />} {mensaje}
        </p>

        {etapa === 'camara' && (
          <>
            {sinCamara ? (
              <div className="escaner__vacio">
                <Camera size={28} aria-hidden="true" />
                <p>No se pudo abrir la cámara en este navegador. Elige una foto del documento desde la galería o la cámara del teléfono.</p>
              </div>
            ) : (
              <div className="escaner__visor">
                <video ref={videoRef} autoPlay muted playsInline />
                <div className="escaner__guia" aria-hidden="true" />
              </div>
            )}
            <div className="escaner__acciones">
              <label className="escaner__btn escaner__btn--secundario">
                <ImageUp size={16} aria-hidden="true" /> Elegir imagen
                <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void elegirImagen(f); e.target.value = ''; }} />
              </label>
              {!sinCamara && (
                <button type="button" onClick={capturar} className="escaner__btn escaner__btn--principal">
                  <Camera size={16} aria-hidden="true" /> Capturar
                </button>
              )}
            </div>
          </>
        )}

        {etapa === 'ajustar' && capturaUrl && (
          <>
            <div className="escaner__visor escaner__visor--ajuste">
              <div
                ref={marcoRef}
                className="escaner__marco"
                style={{ aspectRatio: `${tamano.w} / ${tamano.h}`, width: `min(100%, calc(58vh * ${(tamano.w / tamano.h).toFixed(4)}))` }}
                onPointerMove={moverEsquina}
                onPointerUp={() => setArrastrando(null)}
                onPointerCancel={() => setArrastrando(null)}
              >
                <img src={capturaUrl} alt="Captura del documento" draggable={false} />
                {esquinas && (
                  <svg viewBox={`0 0 ${tamano.w} ${tamano.h}`} preserveAspectRatio="none">
                    <polygon points={esquinas.map(p => `${p.x},${p.y}`).join(' ')} className="escaner__poligono" />
                    {esquinas.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={radio}
                        className={`escaner__punto ${arrastrando === i ? 'escaner__punto--activo' : ''}`}
                        onPointerDown={e => { (e.target as Element).setPointerCapture?.(e.pointerId); setArrastrando(i); }}
                      />
                    ))}
                  </svg>
                )}
              </div>
            </div>
            <div className="escaner__acciones">
              <button type="button" onClick={volverACapturar} className="escaner__btn escaner__btn--secundario">Tomar otra</button>
              <button type="button" onClick={() => void recortar()} disabled={ocupado || !esquinas} className="escaner__btn escaner__btn--principal">
                <Crop size={16} aria-hidden="true" /> Recortar documento
              </button>
            </div>
          </>
        )}

        {etapa === 'resultado' && (
          <>
            <div className="escaner__visor escaner__visor--resultado">
              {resultado ? <img src={resultado} alt="Documento escaneado" /> : <Loader2 size={28} className="animate-spin" aria-hidden="true" />}
            </div>
            <div className="escaner__filtros" role="radiogroup" aria-label="Aspecto del documento">
              {FILTROS.map(f => (
                <button key={f.id} type="button" role="radio" aria-checked={filtro === f.id} disabled={ocupado} onClick={() => cambiarFiltro(f.id)}>
                  {f.nombre}
                </button>
              ))}
              <button type="button" onClick={girar} disabled={ocupado} className="escaner__girar" aria-label="Girar 90 grados"><RotateCw size={16} /></button>
            </div>
            <div className="escaner__acciones">
              <button type="button" onClick={() => { setEtapa('ajustar'); setMensaje('Ajusta las esquinas y vuelve a recortar.'); }} className="escaner__btn escaner__btn--secundario">Ajustar bordes</button>
              <button type="button" onClick={() => resultado && onUsar(resultado)} disabled={ocupado || !resultado} className="escaner__btn escaner__btn--principal">
                <Check size={16} aria-hidden="true" /> Usar documento
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
