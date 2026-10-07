import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('.', import.meta.url))

/**
 * Modo sin conexión: genera /sw.js (a partir de pwa/sw.js) con la lista de todos los archivos de la
 * app, para que el service worker los guarde en el dispositivo. Los archivos muy grandes (el lector
 * de documentos con OpenCV, ~15 MB) no se descargan por adelantado: se guardan la primera vez que se usan.
 */
function serviceWorker(): Plugin {
  const LIMITE_BYTES = 3 * 1024 * 1024
  return {
    name: 'psinet-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_opciones, bundle) {
      const hash = createHash('sha256')
      const archivos = new Set<string>(['/index.html'])
      for (const [nombre, salida] of Object.entries(bundle)) {
        if (nombre.endsWith('.map') || nombre === 'sw.js') continue
        const contenido = salida.type === 'chunk' ? salida.code : salida.source
        const tamano = typeof contenido === 'string' ? Buffer.byteLength(contenido) : contenido.byteLength
        hash.update(nombre).update(contenido)
        if (tamano <= LIMITE_BYTES) archivos.add('/' + nombre)
      }
      const publico = join(raiz, 'public')
      const recorrer = (dir: string) => {
        for (const nombre of readdirSync(dir)) {
          const ruta = join(dir, nombre)
          if (statSync(ruta).isDirectory()) { recorrer(ruta); continue }
          const url = '/' + relative(publico, ruta).split(sep).join('/')
          if (url === '/sw.js' || statSync(ruta).size > LIMITE_BYTES) continue
          hash.update(url).update(readFileSync(ruta))
          archivos.add(encodeURI(url))
        }
      }
      recorrer(publico)
      const plantilla = readFileSync(join(raiz, 'pwa', 'sw.js'), 'utf8')
      hash.update(plantilla)
      const source = plantilla
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__ARCHIVOS__', JSON.stringify([...archivos].sort(), null, 2))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] }),
    serviceWorker(),
  ],
})
