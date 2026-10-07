// Si una pantalla falla al abrirse (un error de programación o una versión nueva de la app que
// no terminó de descargarse), en vez de quedar la página en blanco se muestra qué pasó y cómo seguir.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Estado { error: Error | null }

export default class ErrorPantalla extends Component<{ children: ReactNode }, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error al mostrar la pantalla:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const esDescarga = /dynamically imported module|Loading chunk|Importing a module script failed|fetch/i.test(error.message);
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-[#DCE1E6] rounded-xl p-6 space-y-3 shadow-sm">
          <h1 className="font-display font-bold text-xl text-[#0E4660]">No se pudo abrir esta pantalla</h1>
          <p className="text-sm text-gray-600">
            {esDescarga
              ? 'Hay una versión nueva de la app o se cortó la conexión mientras se descargaba. Recarga la página para continuar.'
              : 'Ocurrió un error inesperado. Recarga la página; si se repite, envía este mensaje a quien administra la app.'}
          </p>
          <pre className="text-xs bg-gray-50 border border-[#EEF1F4] rounded-md p-2 whitespace-pre-wrap break-words text-gray-700">{error.message}</pre>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => window.location.reload()} className="bg-[#0E4660] text-white px-4 py-2 rounded-md text-sm font-bold">
              Recargar
            </button>
            <button type="button" onClick={() => { window.location.href = '/'; }} className="btn-outline text-[#0E4660] px-4 py-2 rounded-md text-sm font-bold">
              Ir al menú principal
            </button>
          </div>
        </div>
      </div>
    );
  }
}
