# Psinet · Informe Diario

Plataforma web del equipo LTE-DSAL (Minera Rajo Inca) para generar los informes en Word:

- **Informe Diario** (Turno Día / Noche, con el bloque Vertiv en Noche)
- **Informe de Cierre** semanal (arma el resumen a partir de los informes diarios)
- **Mantenimiento de Generador**
- **Informe de Falla — Carro**
- **Impresión rápida**: kit semanal de formularios de faena (`public/documentos`), prellenado por trabajador

Los borradores se comparten entre todos los dispositivos en tiempo real (Supabase) y el informe en
curso se respalda también en el propio dispositivo (IndexedDB), por si se corta la señal.

## Tecnología

React 19 + TypeScript + Vite, Tailwind, Supabase (base de datos, Realtime y Storage), `docx` para
generar los Word, `pdf-lib` para la impresión rápida y OpenCV (carga diferida) para enderezar
documentos fotografiados. Publicado en Vercel.

## Puesta en marcha

1. Instalar dependencias: `npm install`
2. Copiar `.env.example` a `.env.local` y completar:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. En Supabase → SQL Editor, ejecutar **`supabase/schema.sql`** (se puede volver a ejecutar sin problema; vuelve a ejecutarlo después de cada actualización de la app).
   Crea los perfiles de usuario, las tablas `borradores` y `borradores_otros`, el bucket `evidencias` y sus políticas.
4. Registrarse en la app y convertir esa cuenta en el primer administrador (SQL Editor):
   `update public.perfiles set estado = 'aprobado', es_admin = true where email = 'tu-correo@ejemplo.cl';`
5. `npm run dev` para desarrollo, `npm run build` para compilar.

## Usuarios y acceso

- Registro con nombre, RUT (con dígito verificador), correo, faena (Rajo Inca / Andina) y contraseña.
- Toda cuenta nueva queda **pendiente**: un administrador la aprueba en **Panel de administración → Usuarios**.
  La base de datos aplica la misma regla (solo cuentas aprobadas leen o modifican informes).
- Recuperación de contraseña por correo. En Supabase → Authentication → URL Configuration, agrega la URL
  de la app (la de Vercel y `http://localhost:5173`) en *Site URL* / *Redirect URLs*.

## Divisiones (El Salvador / Andina)

- Cada cuenta trabaja en la división de su faena: **Rajo Inca → División El Salvador**, **Andina → División Andina**.
  Borradores, cierres, mantenimientos, fallas, indicadores e impresión quedan separados por división.
- La base de datos lo exige: las tablas `borradores` y `borradores_otros` tienen la columna `division` y las
  políticas solo dejan ver/modificar la propia división (los administradores ven ambas).
- Los administradores cambian de división con el selector **El Salvador / Andina** del panel principal o del
  Panel de administración (se recuerda en el dispositivo).
- Todo lo que cambia entre divisiones (faena, firmas Creado/Revisado/Autorizado, personal sugerido, bloque
  Vertiv, listas de carros/sitios) está en `src/datos/divisiones.ts`.
- El Salvador conserva exactamente sus datos y documentos Word de siempre; los informes existentes quedan en El Salvador.

## Panel de administración (`/admin`)

| Pestaña | Qué muestra |
|---|---|
| Resumen | KPIs: cumplimiento de informes, atrasados, fallas, mantenimientos, fotos, usuarios en línea y gráficos |
| En línea | Quién tiene la app abierta, en qué pantalla y desde qué dispositivo (latido cada minuto; en línea = < 2 min) |
| Usuarios | Aprobar / rechazar cuentas, rol de administrador, búsqueda y estado de conexión |
| Actividad | Bitácora: sesiones, informes creados/eliminados, Word generados y cambios de cuentas; filtros y exportar CSV |
| Sistema | Uso de fotos y base de datos frente al plan de Supabase; buscar y eliminar fotos huérfanas |

## Impresión Rápida (`/impresion`)

Arma en un clic el kit de formularios de la semana de turno (miércoles a martes):
uno por persona del turno —con **nombre, RUT, cargo, fechas, turno y supervisor ya escritos**— más las
copias por turno (Inspección de Radios, a doble cara en un PDF aparte) y las copias en blanco que se pidan.
El botón **Imprimir** abre directamente el diálogo de impresión (en celular abre el PDF en otra pestaña).

- La dotación sale del personal guardado del Informe Diario (Turno A / B); los RUT se recuerdan en el dispositivo
  y, para administradores, se completan desde las cuentas registradas.
- Las posiciones de cada campo en los PDF están en `src/impresion/plantillas.ts`: si un formulario cambia, se ajustan ahí.
- El panel principal recuerda imprimir el kit el primer día y los dos últimos días de cada semana de turno.

## Rutas

`/` panel · `/informe-diario/:id` · `/borradores/:tipo` · `/cierre` · `/mantenimiento/:id?` · `/falla/:id?` ·
`/impresion` · `/admin`, `/admin/en-linea`, `/admin/usuarios`, `/admin/actividad`, `/admin/sistema` (solo administradores) · `/login`, `/registro`.
`vercel.json` redirige cualquier ruta a `index.html` para que los enlaces directos funcionen.

## Estructura

```
src/
├── main.tsx              Punto de entrada: router + control de acceso + App
├── index.css
├── app/                  Armado de la app
│   ├── App.tsx           Elige la pantalla según la ruta y mantiene las listas de borradores
│   ├── App.css           Estilos generales (encabezado, tarjetas, paneles)
│   └── rutas.ts          URL de cada pantalla
├── pantallas/            Pantallas de navegación
│   ├── Dashboard.tsx     Panel principal
│   ├── Borradores.tsx    Lista de borradores (Diario, Mantenimiento, Falla)
│   └── ImpresionRapida.tsx
├── informes/             Generadores de Word (cada uno con su formulario)
│   ├── diario/
│   │   ├── InformeDiario.tsx     Pantalla del Informe Diario (formulario y evidencias)
│   │   ├── useInformeDiario.tsx  Estado, autoguardado, sincronización y generación del Word
│   │   ├── constantes.ts         Personal, actividades y evidencias por defecto
│   │   └── useDragReorder.ts     Reordenar filas arrastrando
│   ├── InformeCierre.tsx
│   ├── InformeMantenimiento.tsx
│   └── InformeFallaCarro.tsx
├── componentes/          Piezas reutilizables de interfaz
│   ├── VisorFoto.tsx
│   ├── BotonSubir.tsx
│   └── SelectorDivision.tsx  Selector El Salvador / Andina (admin) o etiqueta de división
├── impresion/            Kit de impresión: plantillas (posición de cada campo), personal y generador de PDF
├── auth/                 Login, registro, recuperación de contraseña y control de acceso
├── admin/                Panel de administración: KPIs, gráficos y gestión de usuarios
├── datos/                Modelo de datos y reglas del negocio
│   ├── borradoresDiario.ts   Informe Diario: tipos, guardado en la nube, estados
│   ├── borradoresOtros.ts    Mantenimiento / Falla / Cierre: guardado en la nube
│   ├── divisiones.ts         División El Salvador / Andina: faena, firmas y personal de cada una
│   ├── turnos.ts             Calendario de turnos 7x7 (A/B)
│   ├── fechas.ts             Formatos de fecha
│   ├── plantillaWord.ts      Colores y bloque Vertiv de las plantillas Word
│   └── catalogos.ts          Contrato, carros, ubicaciones y tareas sugeridas (editar aquí)
├── lib/                  Utilidades técnicas
│   ├── supabase.ts           Cliente de Supabase
│   ├── presencia.ts          Latido de presencia (usuarios en línea)
│   ├── actividad.ts          Registro de eventos en la bitácora
│   ├── imprimir.ts           Abrir el diálogo de impresión de un PDF
│   ├── storage.ts            Subida/borrado de fotos en la nube
│   ├── imagenes.ts           Conversión de imágenes para el Word
│   ├── fotos.ts              Compresión de fotos (1600 px, JPEG 0,8)
│   ├── almacenLocal.ts       Respaldo local del informe en curso (IndexedDB)
│   └── docxRecursos.ts       Precarga/caché para generar los Word más rápido
└── assets/               Logos e imágenes
public/documentos/        PDF de Impresión Rápida
supabase/schema.sql       Tablas, permisos y usuarios de Supabase
```

## Notas

- **Calendario de turnos:** `TURNO_ANCLA_A` en `src/types.ts` es el primer día de una semana del Turno A.
- **Tareas sugeridas:** el listado de tareas de la actividad está en `src/catalogos.ts` (`GRUPOS_TAREAS`).
