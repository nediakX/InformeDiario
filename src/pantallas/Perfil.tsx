// Mi perfil: cada usuario corrige sus datos (nombre, RUT), cambia su contraseña y sube su firma.
// La firma se pone sola en el Checklist de Camioneta, en el cuadro "Firma y Nombre Conductor" de
// los días en que figura como conductor.
import { useState } from 'react';
import { ArrowLeft, Check, KeyRound, Loader2, PenLine, Trash2, Upload, UserRound } from 'lucide-react';
import logoPsinet from '../assets/logo_psinet.jpg';
import logoEdificio from '../assets/LogoEdificio.png';
import { etiquetaFaena, formatearRut, rutValido, useSesion } from '../auth/sesion';
import { actualizarMiPerfil, cambiarContrasena } from '../datos/perfil';
import { procesarFirma } from '../lib/firma';
import { esErrorDeRed } from '../lib/conexion';

type Aviso = { texto: string; error?: boolean } | null;

const campo = 'w-full p-2.5 border border-[#DCE1E6] rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0E4660]/25';
const etiqueta = 'block text-xs font-bold text-[#55636B] mb-1';

function AvisoTexto({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <p role={aviso.error ? 'alert' : 'status'} className={`text-sm rounded-md px-3 py-2 ${aviso.error ? 'bg-[#fbe9e9] text-[#a32626]' : 'bg-[#e6f6e6] text-[#006300]'}`}>
      {aviso.texto}
    </p>
  );
}

export default function Perfil({ onBack }: { onBack: () => void }) {
  const { perfil, recargarPerfil, esAdmin } = useSesion();

  const [nombre, setNombre] = useState(perfil.nombre);
  const [rut, setRut] = useState(perfil.rut ?? '');
  // undefined = sin cambios; null = quitar; texto = firma nueva.
  const [firmaNueva, setFirmaNueva] = useState<string | null | undefined>(undefined);
  const [procesandoFirma, setProcesandoFirma] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState<Aviso>(null);

  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [avisoClave, setAvisoClave] = useState<Aviso>(null);

  const firmaVista = firmaNueva === undefined ? perfil.firma ?? null : firmaNueva;
  const hayCambios = nombre.trim() !== perfil.nombre || (rut.trim() || null) !== (perfil.rut ?? null) || firmaNueva !== undefined;

  const elegirFirma = async (archivo: File) => {
    setProcesandoFirma(true);
    setAvisoDatos(null);
    try {
      setFirmaNueva(await procesarFirma(archivo));
    } catch (error) {
      setAvisoDatos({ texto: error instanceof Error ? error.message : 'No se pudo leer la firma.', error: true });
    } finally {
      setProcesandoFirma(false);
    }
  };

  const guardar = async () => {
    if (!nombre.trim()) { setAvisoDatos({ texto: 'Escribe tu nombre completo.', error: true }); return; }
    if (rut.trim() && !rutValido(rut)) { setAvisoDatos({ texto: 'El RUT no es válido. Revisa el dígito verificador.', error: true }); return; }
    setGuardando(true);
    setAvisoDatos(null);
    try {
      await actualizarMiPerfil({ nombre: nombre.trim(), rut: rut.trim() ? formatearRut(rut) : null, firma: firmaNueva });
      await recargarPerfil();
      setFirmaNueva(undefined);
      setAvisoDatos({ texto: 'Datos guardados.' });
    } catch (error) {
      setAvisoDatos({
        texto: esErrorDeRed(error) ? 'Sin conexión: no se pudieron guardar los datos. Inténtalo de nuevo cuando tengas señal.'
          : error instanceof Error ? error.message : 'No se pudieron guardar los datos.',
        error: true,
      });
    } finally {
      setGuardando(false);
    }
  };

  const guardarClave = async () => {
    if (clave.length < 8) { setAvisoClave({ texto: 'La contraseña debe tener al menos 8 caracteres.', error: true }); return; }
    if (clave !== clave2) { setAvisoClave({ texto: 'Las contraseñas no coinciden.', error: true }); return; }
    setGuardandoClave(true);
    setAvisoClave(null);
    try {
      await cambiarContrasena(clave);
      setClave(''); setClave2('');
      setAvisoClave({ texto: 'Contraseña actualizada.' });
    } catch (error) {
      setAvisoClave({ texto: error instanceof Error ? error.message : 'No se pudo cambiar la contraseña.', error: true });
    } finally {
      setGuardandoClave(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate"><img src={logoPsinet} alt="PSINet" /></div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">Mi perfil</div>
              <div className="site-header__meta text-xs truncate">Tus datos, contraseña y firma</div>
            </div>
          </div>
          <div className="site-header__photo"><img src={logoEdificio} alt="" aria-hidden="true" /></div>
        </div>
        <div className="site-header__rule" />
      </header>

      <main className="max-w-[720px] mx-auto p-5 space-y-5">
        <button type="button" onClick={onBack} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
          <ArrowLeft size={14} /> Volver al menú
        </button>

        {/* Datos personales */}
        <section className="panel p-5 space-y-4">
          <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><UserRound size={18} /> Datos personales</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className="sm:col-span-2">
              <span className={etiqueta}>Nombre completo</span>
              <input className={campo} value={nombre} onChange={e => setNombre(e.target.value)} autoComplete="name" />
              <span className="text-[11px] text-gray-500">Así aparece en los informes y en el checklist (para ponerte tu firma).</span>
            </label>
            <label>
              <span className={etiqueta}>RUT</span>
              <input className={campo} value={rut} onChange={e => setRut(formatearRut(e.target.value))} inputMode="text" placeholder="12.345.678-9" />
            </label>
            <div>
              <span className={etiqueta}>Correo</span>
              <p className="p-2.5 text-sm text-gray-600 bg-[#F6F8FA] rounded-md border border-[#EEF1F3] truncate">{perfil.email}</p>
            </div>
            <div>
              <span className={etiqueta}>División</span>
              <p className="p-2.5 text-sm text-gray-600 bg-[#F6F8FA] rounded-md border border-[#EEF1F3]">{etiquetaFaena(perfil.faena)}</p>
            </div>
            <div>
              <span className={etiqueta}>Rol</span>
              <p className="p-2.5 text-sm text-gray-600 bg-[#F6F8FA] rounded-md border border-[#EEF1F3]">{esAdmin ? 'Administrador' : 'Usuario'}</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-500">La división y el rol los cambia un administrador.</p>

          {/* Firma */}
          <div className="border-t border-[#EEF1F3] pt-4 space-y-3">
            <h3 className="font-display font-bold text-base text-[#0E4660] flex items-center gap-2"><PenLine size={17} /> Firma</h3>
            <p className="text-xs text-gray-500">
              Sube una foto o escaneo de tu firma sobre papel blanco. Se limpia sola (fondo transparente) y se pone en el
              <strong> Checklist de Camioneta</strong>, en el cuadro «Firma y Nombre Conductor» de cada día en que figuras como conductor.
            </p>
            <div className="rounded-lg border border-dashed border-[#C9D3DA] bg-[repeating-linear-gradient(0deg,#fff,#fff_23px,#f1f4f6_24px)] h-36 flex items-center justify-center p-3">
              {procesandoFirma ? (
                <Loader2 size={22} className="animate-spin text-[#0E4660]" />
              ) : firmaVista ? (
                <img src={firmaVista} alt="Tu firma" className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-sm text-gray-400">Aún no tienes firma cargada</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <label className="btn-outline text-[#0E4660] px-3 py-2 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5 cursor-pointer">
                <Upload size={14} /> {firmaVista ? 'Cambiar firma' : 'Subir firma'}
                <input type="file" accept="image/*" className="sr-only" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void elegirFirma(f); }} />
              </label>
              {firmaVista && (
                <button type="button" onClick={() => setFirmaNueva(null)} className="text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-md text-xs font-bold flex items-center gap-1.5">
                  <Trash2 size={14} /> Quitar firma
                </button>
              )}
            </div>
          </div>

          <AvisoTexto aviso={avisoDatos} />
          <div className="flex justify-end">
            <button type="button" onClick={() => void guardar()} disabled={guardando || procesandoFirma || !hayCambios}
              className="bg-[#0E4660] text-white px-4 py-2.5 rounded-md text-sm font-bold hover:bg-[#0a3549] disabled:opacity-50 flex items-center gap-2">
              {guardando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Guardar cambios
            </button>
          </div>
        </section>

        {/* Contraseña */}
        <section className="panel p-5 space-y-4">
          <h2 className="font-display font-bold text-lg text-[#0E4660] flex items-center gap-2"><KeyRound size={18} /> Cambiar contraseña</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <label>
              <span className={etiqueta}>Contraseña nueva</span>
              <input type="password" className={campo} value={clave} onChange={e => setClave(e.target.value)} autoComplete="new-password" minLength={8} />
            </label>
            <label>
              <span className={etiqueta}>Repetir contraseña</span>
              <input type="password" className={campo} value={clave2} onChange={e => setClave2(e.target.value)} autoComplete="new-password" minLength={8} />
            </label>
          </div>
          <AvisoTexto aviso={avisoClave} />
          <div className="flex justify-end">
            <button type="button" onClick={() => void guardarClave()} disabled={guardandoClave || !clave}
              className="bg-[#0E4660] text-white px-4 py-2.5 rounded-md text-sm font-bold hover:bg-[#0a3549] disabled:opacity-50 flex items-center gap-2">
              {guardandoClave ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />} Cambiar contraseña
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
