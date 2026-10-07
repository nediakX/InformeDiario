// Abre directamente el diálogo de impresión de un PDF generado en el navegador.
// En computador se usa un iframe oculto (un clic → diálogo de impresión). En celular/tablet los
// navegadores no imprimen PDF desde un iframe, así que se abre en una pestaña nueva.
import { tipoDispositivo } from './presencia';

export function urlDePdf(bytes: Uint8Array): string {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return URL.createObjectURL(new Blob([buffer], { type: 'application/pdf' }));
}

export function imprimirPdf(url: string): 'dialogo' | 'pestana' {
  if (tipoDispositivo() !== 'Computador') {
    window.open(url, '_blank', 'noopener');
    return 'pestana';
  }
  document.querySelectorAll('iframe[data-impresion]').forEach(f => f.remove());
  const iframe = document.createElement('iframe');
  iframe.dataset.impresion = '1';
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  iframe.src = url;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };
  document.body.appendChild(iframe);
  return 'dialogo';
}

export function descargarPdf(url: string, nombre: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
}
