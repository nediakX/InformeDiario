// Escáner de documentos: cámara o imagen → la hoja se detecta sola (en vivo en la cámara) →
// documento enderezado y con aspecto de escaneo (Color / Blanco y negro / Original) → se inserta.
// Con "Captura automática" la foto se toma sola cuando la hoja queda quieta y bien encuadrada.
// Si no se encuentra la hoja, se pasa a ajustar las 4 esquinas a mano.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Camera, ImageUp, Loader2, RotateCw, Crop, Check, X, ScanLine, Zap } from 'lucide-react';
import {
  aJpeg, aplicarFiltro, cargarImagen, detectarHoja, enderezar, esquinasPorDefecto,
  liberarLienzo, lienzoDesdeImagen, rotar90, type Esquinas, type FiltroEscaneo,
} from '../lib/escaner';
import './escaner.css';

type Etapa = 'camara' | 'ajustar' | 'resultado';

const FILTROS: { id: FiltroEscaneo; nombre: string }[] = [
  { id: 'color', nombre: 'Color' },
  { id: 'documento', nombre: 'Blanco y negro' },
  { id: 'original', nombre: 'Original' },
];

export default function EscanerDocumento({ onUsar, onCancelar }: {
  onUsar: (dataUrl: string) => void;
  onCancelar: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('camara');
  const MENSAJE_CAMARA = 'Encuadra la hoja sobre un fondo que contraste: se detecta sola.';
  const [mensaje, setMensaje] = useState(MENSAJE_CAMARA);
  const [ocupado, setOcupado] = useState(false);
  const [sinCamara, setSinCamara] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [videoTam, setVideoTam] = useState<{ w: number; h: number } | null>(null);

  // Detección en vivo: contorno de la hoja sobre la cámara y captura automática cuando está quieta.
  const [enVivo, setEnVivo] = useState<Esquinas | null>(null);
  const [auto, setAuto] = useState<boolean>(() => {
    try { return localStorage.getItem('psinet_escaner_auto') !== '0'; } catch { return true; }
  });
  const [estable, setEstable] = useState(0); // 0..1: cuánto falta para la captura automática
  const capturandoRef = useRef(false);
  const autoRef = useRef(auto);
  const capturarRef = useRef<(q: Esquinas) => void>(() => {});

  // Imagen capturada (lienzo de trabajo) y su vista.
  const capturaRef = useRef<HTMLCanvasElement | null>(null);
  const [capturaUrl, setCapturaUrl] = useState<string | null>(null);
  const [tamano, setTamano] = useState({ w: 1, h: 1 });
  const [esquinas, setEsquinas] = useState<Esquinas | null>(null);

  // Documento enderezado y resultado con filtro.
  const enderezadoRef = useRef<HTMLCanvasElement | null>(null);
  const [filtro, setFiltro] = useState<FiltroEscaneo>('color'); // a color por defecto (blanco y negro queda como opción)
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
    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, [etapa]);

  // Detección en vivo (≈ 4 veces por segundo, sobre una copia chica del cuadro de la cámara).
  useEffect(() => {
    if (etapa !== 'camara' || sinCamara) return;
    let vivo = true;
    let anterior: Esquinas | null = null;
    let quietos = 0;
    const NECESARIOS = 5; // ~1,2 s quieta antes de capturar sola
    let temporizador: ReturnType<typeof setTimeout>;
    const vuelta = async () => {
      if (!vivo) return;
      const video = videoRef.current;
      if (video && video.videoWidth && !capturandoRef.current) {
        try {
          const q = await detectarHoja(video, 360);
          if (!vivo) return;
          setEnVivo(q);
          if (q && anterior) {
            const diag = Math.hypot(video.videoWidth, video.videoHeight);
            const movimiento = q.reduce((n, p, i) => n + Math.hypot(p.x - anterior![i].x, p.y - anterior![i].y), 0) / 4 / diag;
            quietos = movimiento < 0.015 ? quietos + 1 : 0;
          } else quietos = 0;
          anterior = q;
          setEstable(q ? Math.min(1, quietos / NECESARIOS) : 0);
          if (q && quietos >= NECESARIOS && autoRef.current) {
            capturandoRef.current = true;
            capturarRef.current(q);
            return;
          }
        } catch { /* cuadro de video no disponible aún: se reintenta */ }
      }
      temporizador = setTimeout(() => { void vuelta(); }, 250);
    };
    temporizador = setTimeout(() => { void vuelta(); }, 400);
    return () => { vivo = false; clearTimeout(temporizador); };
  }, [etapa, sinCamara]);
  const alternarAuto = () => {
    const nuevo = !auto;
    autoRef.current = nuevo;
    setAuto(nuevo);
    try { localStorage.setItem('psinet_escaner_auto', nuevo ? '1' : '0'); } catch { /* sin almacenamiento */ }
  };

  // Al cerrar el escáner se libera la memoria de las imágenes (en iOS se acumula hasta fallar).
  useEffect(() => () => {
    liberarLienzo(capturaRef.current);
    liberarLienzo(enderezadoRef.current);
  }, []);

  const generar = async (lienzo: HTMLCanvasElement, f: FiltroEscaneo) => {
    setOcupado(true);
    try {
      const final = await aplicarFiltro(lienzo, f);
      setResultado(aJpeg(final));
      if (final !== lienzo) liberarLienzo(final);
    } catch (error) {
      console.error('No se pudo aplicar el filtro de escaneo:', error);
      setResultado(aJpeg(lienzo));
    } finally {
      setOcupado(false);
    }
  };

  const recortar = async (esq: Esquinas | null = esquinas, base: HTMLCanvasElement | null = capturaRef.current) => {
    if (!base || !esq) return;
    setOcupado(true);
    setMensaje('Enderezando y limpiando el documento…');
    try {
      // Se deja respirar a la interfaz para que se vea el mensaje antes del cálculo.
      await new Promise(r => setTimeout(r, 30));
      const recto = await enderezar(base, esq);
      liberarLienzo(enderezadoRef.current);
      enderezadoRef.current = recto;
      setEtapa('resultado');
      setMensaje('Elige cómo quieres el documento y úsalo.');
      await generar(recto, filtro);
    } catch (error) {
      console.error('No se pudo enderezar el documento:', error);
      setMensaje('No se pudo procesar la imagen. Cierra otras pestañas o elige la foto desde la galería e intenta de nuevo.');
      setOcupado(false);
    }
  };

  const prepararAjuste = async (lienzo: HTMLCanvasElement, conocidas?: Esquinas | null) => {
    liberarLienzo(capturaRef.current);
    liberarLienzo(enderezadoRef.current);
    enderezadoRef.current = null;
    capturaRef.current = lienzo;
    setCapturaUrl(lienzo.toDataURL('image/jpeg', 0.9));
    setTamano({ w: lienzo.width, h: lienzo.height });
    setEtapa('ajustar');
    setOcupado(true);
    setMensaje('Buscando los bordes de la hoja…');
    let detectadas: Esquinas | null = conocidas ?? null;
    try {
      if (!detectadas) detectadas = await detectarHoja(lienzo);
    } catch { detectadas = null; }
    if (detectadas) {
      // Hoja encontrada: se recorta de inmediato (las esquinas se pueden corregir después con "Ajustar bordes").
      setEsquinas(detectadas);
      setOcupado(false);
      await recortar(detectadas, lienzo);
      return;
    }
    setEsquinas(esquinasPorDefecto(lienzo.width, lienzo.height));
    setMensaje('No se detectó la hoja: arrastra los 4 puntos a las esquinas del documento.');
    setOcupado(false);
  };

  const capturar = (vivas?: Esquinas | null) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { capturandoRef.current = false; return; }
    const lienzo = document.createElement('canvas');
    const escala = Math.min(1, 2000 / Math.max(video.videoWidth, video.videoHeight));
    lienzo.width = Math.round(video.videoWidth * escala);
    lienzo.height = Math.round(video.videoHeight * escala);
    const ctx = lienzo.getContext('2d');
    if (!ctx) { setMensaje('El teléfono no tiene memoria libre para la foto. Cierra otras pestañas e intenta de nuevo.'); return; }
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    // Las esquinas vistas en vivo están en el tamaño del video: se llevan al de la foto.
    const k = lienzo.width / video.videoWidth;
    const conocidas = vivas ? (vivas.map(p => ({ x: p.x * k, y: p.y * k })) as Esquinas) : null;
    void prepararAjuste(lienzo, conocidas);
  };

  useEffect(() => { capturarRef.current = capturar; });

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


  const cambiarFiltro = (f: FiltroEscaneo) => {
    setFiltro(f);
    if (enderezadoRef.current) void generar(enderezadoRef.current, f);
  };

  const girar = () => {
    if (!enderezadoRef.current) return;
    const anterior = enderezadoRef.current;
    enderezadoRef.current = rotar90(anterior);
    liberarLienzo(anterior);
    void generar(enderezadoRef.current, filtro);
  };

  const volverACapturar = () => {
    capturandoRef.current = false;
    setEnVivo(null); setEstable(0);
    liberarLienzo(capturaRef.current); capturaRef.current = null;
    liberarLienzo(enderezadoRef.current); enderezadoRef.current = null;
    setEsquinas(null); setCapturaUrl(null); setResultado(null);
    setMensaje(MENSAJE_CAMARA);
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
              <div className="escaner__camara"
                style={videoTam ? { aspectRatio: `${videoTam.w} / ${videoTam.h}`, width: `min(100%, calc(60vh * ${(videoTam.w / videoTam.h).toFixed(4)}))` } : undefined}>
                <video ref={videoRef} autoPlay muted playsInline
                  onLoadedMetadata={e => { const v = e.currentTarget; if (v.videoWidth) setVideoTam({ w: v.videoWidth, h: v.videoHeight }); }} />
                {videoTam && (
                  <svg viewBox={`0 0 ${videoTam.w} ${videoTam.h}`} preserveAspectRatio="none" aria-hidden="true">
                    {enVivo
                      ? <polygon points={enVivo.map(p => `${p.x},${p.y}`).join(' ')} className={`escaner__vivo ${estable >= 1 ? 'escaner__vivo--listo' : ''}`} />
                      : <rect x={videoTam.w * 0.07} y={videoTam.h * 0.07} width={videoTam.w * 0.86} height={videoTam.h * 0.86} rx={12} className="escaner__guia-svg" />}
                  </svg>
                )}
                {enVivo && auto && (
                  <span className="escaner__progreso" aria-hidden="true"><span style={{ transform: `scaleX(${estable})` }} /></span>
                )}
              </div>
            )}
            <div className="escaner__acciones">
              <label className="escaner__btn escaner__btn--secundario">
                <ImageUp size={16} aria-hidden="true" /> Elegir imagen
                <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) void elegirImagen(f); e.target.value = ''; }} />
              </label>
              {!sinCamara && (
                <button type="button" onClick={() => { capturandoRef.current = true; capturar(enVivo); }} className="escaner__btn escaner__btn--principal">
                  <Camera size={16} aria-hidden="true" /> Capturar
                </button>
              )}
            </div>
            {!sinCamara && (
              <button type="button" role="switch" aria-checked={auto} onClick={alternarAuto} className={`escaner__auto ${auto ? 'escaner__auto--on' : ''}`}>
                <Zap size={14} aria-hidden="true" /> Captura automática {auto ? 'activada' : 'desactivada'}
              </button>
            )}
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
              <button type="button" onClick={() => void recortar(esquinas, capturaRef.current)} disabled={ocupado || !esquinas} className="escaner__btn escaner__btn--principal">
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
