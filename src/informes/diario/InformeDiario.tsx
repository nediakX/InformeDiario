

import { ChevronDown, Trash2, ClipboardList, Users, ListChecks, BatteryCharging, MessageSquare, Camera, Loader2, ArrowLeft, Plus, GripVertical, Copy } from 'lucide-react';
import logoPsinet from "../../assets/logo_psinet.jpg";
import logoEdificio from "../../assets/LogoEdificio.png";

import VisorFoto from '../../componentes/VisorFoto';
import { GRUPOS_TAREAS } from '../../datos/catalogos';

import { VERTIV_CARROS_FLAT, VERTIV_ITEMS } from '../../datos/plantillaWord';

import { ACTIVIDAD_SUGERIDA_MANTENCION, CARROS_MANTENCION, getDefaultPersonal } from './constantes';
import { creadoPorDiario } from '../../datos/divisiones';
import type { InformeDiarioEstado } from './useInformeDiario';

interface InformeDiarioProps {
  d: InformeDiarioEstado;
  volverABorradores: () => void;
  goToNewInforme: (turnoElegido?: 'dia' | 'noche') => void;
}

/** Pantalla del Informe Diario: formulario, evidencias fotográficas y botón para generar el Word. */
export default function InformeDiario({ d, volverABorradores, goToNewInforme }: InformeDiarioProps) {
  const {
    division,
    config,
    actividades,
    actividadesDrag,
    assignFileToSlot,
    assignVertivCarroPhoto,
    assignVertivItemPhoto,
    captureDocument,
    carroMantencion,
    cerrarModalMantencion,
    clearVertivCarroPhoto,
    clearVertivItemPhoto,
    closeDocumentScanner,
    confirmRemovePhotoSlot,
    confirmScannedDocument,
    confirmarMantencionCarro,
    continueDraft,
    creadoCargo,
    creadoNombre,
    decoracionMensual,
    draftPromptOpen,
    evidenceBlocks,
    fecha,
    fotoAmpliada,
    generarDocumento,
    handleAddActividad,
    handleAddGenericBlock,
    handleAddPersonal,
    handleAddPhotoSlot,
    handleCopiarFoto,
    handleLetraTurnoChange,
    handleRemoveActividad,
    handleRemovePersonal,
    handleSelectEvidenceSlot,
    handleSelectVertivSlot,
    handleUpdateActividad,
    handleUpdatePersonal,
    isGenerating,
    letraTurno,
    mantencionModalOpen,
    observaciones,
    openDocumentScanner,
    personal,
    personalDrag,
    photoRemovalRequest,
    requestRemovePhotoSlot,
    resetActividades,
    resetPersonal,
    scannerCanvasRef,
    scannerMessage,
    scannerPreview,
    scannerTarget,
    scannerVideoRef,
    selectedActividadSugerida,
    selectedEvidenceSlot,
    selectedPersonalSugerido,
    selectedVertivSlot,
    setCarroMantencion,
    setCreadoCargo,
    setCreadoNombre,
    setEvidenceBlocks,
    setFecha,
    setFotoAmpliada,
    setMantencionModalOpen,
    setObservaciones,
    setPhotoRemovalRequest,
    setScannerPreview,
    setSelectedActividadSugerida,
    setSelectedPersonalSugerido,
    startNewReport,
    toastMessage,
    turno,
    vertivCarroPhotos,
    vertivItemPhotos,
  } = d;

  return (
    <div className="min-h-screen text-[#222] font-sans pb-20">
      {/* Header */}
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Reporte diario de actividades
              </div>
              <div className="site-header__meta text-xs truncate">
                {config.sigla} / Turno {letraTurno} · 2026
              </div>
            </div>
          </div>
          <div className="site-header__photo">
            <img src={logoEdificio} alt="" aria-hidden="true" />
          </div>
        </div>
        <div className="site-header__rule" />
      </header>

      {decoracionMensual && (
        <div className="seasonal-decoration" aria-label={decoracionMensual.message}>
          <img src={decoracionMensual.source} alt={decoracionMensual.label} />
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" onClick={volverABorradores} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] flex items-center gap-1.5">
            <ArrowLeft size={14} /> Volver a borradores
          </button>
          <button type="button" onClick={() => goToNewInforme()} className="bg-[#0E4660] text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#0a3549] flex items-center gap-1.5">
            <Plus size={14} /> Nuevo informe
          </button>
        </div>

        {/* Section 1: Datos Generales */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ClipboardList size={18} className="panel__summary-icon" strokeWidth={2.2} />
            1. Datos generales
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Tipo de turno</label>
                {/* El turno (Día o Noche) se elige al crear o abrir el informe desde el Panel o Borradores; aquí solo se muestra. */}
                <p className="inline-block text-sm font-bold text-[#0E4660] bg-[#F4F6F8] border border-[#DCE1E6] rounded-md px-3 py-1.5 mt-1">
                  {turno === 'noche' ? 'Turno Noche' : 'Turno Día'}
                </p>
                {turno === 'noche' && (
                  <p className="text-[11px] text-[#0E4660] bg-[#E8F1FB] border border-[#cfe1f5] rounded-md px-2 py-1 mt-2">
                    Turno Noche: la plantilla de "Actividades Diarias" cambia a la lista fija de noche, y se agregará automáticamente {config.vertiv ? 'el bloque "Verificación de la Gestión en Planta Rectificadora Vertiv" junto con ' : ''}la hoja final de Indicadores Técnicos / Observaciones.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Fecha del turno</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por (Supervisor a cargo)</label>
                <select
                  value={creadoNombre}
                  onChange={e => {
                    const selected = creadoPorDiario(division).find(option => option.nombre === e.target.value);
                    if (selected) {
                      setCreadoNombre(selected.nombre);
                      setCreadoCargo(selected.cargo);
                    }
                  }}
                  className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
                >
                  {creadoPorDiario(division).map(option => (
                    <option key={option.nombre} value={option.nombre}>{option.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cargo</label>
                <input type="text" value={creadoCargo} readOnly className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm bg-gray-50" />
              </div>
            </div>
          </div>
        </details>

        {/* Section 2: Personal en Turno */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Users size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Personal en Turno
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 p-2 rounded-md bg-[#E8F1FB] border border-[#cfe1f5]">
            <span className="text-xs text-[#0E4660] font-bold">Personal predeterminado:</span>
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="letraTurno" checked={letraTurno === 'A'} onChange={() => handleLetraTurnoChange('A')} /> Turno A
            </label>
            <label className="text-sm flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name="letraTurno" checked={letraTurno === 'B'} onChange={() => handleLetraTurnoChange('B')} /> Turno B
            </label>
            <span className="text-[11px] text-gray-500">Mostrando {personal.length} personas del Turno {letraTurno}</span>
          </div>

          <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1"><GripVertical size={12} /> Arrastra <GripVertical size={12} className="inline -ml-1" /> para reordenar el personal.</p>
          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {personal.map((p, i) => (
                <tr key={i} ref={personalDrag.setRowRef(i)} className={`border-b border-gray-100 ${personalDrag.dragIndex === i ? 'bg-[#E8F1FB]' : ''}`}>
                  <td className="w-8 p-1 text-center">
                    <button
                      type="button"
                      {...personalDrag.bind(i)}
                      className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-[#0E4660] p-1 touch-none select-none"
                      aria-label="Arrastrar para reordenar esta persona"
                      title="Arrastrar para reordenar"
                    >
                      <GripVertical size={16} />
                    </button>
                  </td>
                  <td className="w-[41%] p-1">
                    <input type="text" value={p.nombre} onChange={e => handleUpdatePersonal(i, 'nombre', e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[39%] p-1">
                    <input type="text" value={p.cargo} onChange={e => handleUpdatePersonal(i, 'cargo', e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[12%] p-1 text-right">
                    <button onClick={() => handleRemovePersonal(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            <select value={selectedPersonalSugerido} onChange={e => setSelectedPersonalSugerido(e.target.value)} className="flex-1 min-w-[220px] p-2 border border-[#DCE1E6] rounded-md text-sm">
              <option value="">-- Seleccionar integrante del equipo --</option>
              <optgroup label={`Turno ${letraTurno}`}>
                {getDefaultPersonal(letraTurno, division).map(p => (
                  <option key={p.nombre} value={`${p.nombre}|${p.cargo}`}>{p.nombre} - {p.cargo}</option>
                ))}
              </optgroup>
              <optgroup label="Otros">
                {config.personalSugerido.map(p => (
                  <option key={p.nombre} value={`${p.nombre}|${p.cargo}`}>{p.nombre} - {p.cargo}</option>
                ))}
              </optgroup>
            </select>
            <button onClick={() => {
              if (selectedPersonalSugerido) {
                const [n, c] = selectedPersonalSugerido.split('|');
                handleAddPersonal(n, c);
                setSelectedPersonalSugerido('');
              }
            }} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar persona
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddPersonal()} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar persona en blanco
            </button>
            <button onClick={resetPersonal} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a lista por defecto
            </button>
          </div>
        </details>

        {/* Section 3: Actividades Diarias */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ListChecks size={18} className="panel__summary-icon" strokeWidth={2.2} />
            3. Actividades Diarias
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>

          <p className="text-xs text-gray-400 mb-1.5 flex items-center gap-1"><GripVertical size={12} /> Arrastra <GripVertical size={12} className="inline -ml-1" /> para reordenar las actividades.</p>
          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {actividades.map((act, i) => (
                <tr key={i} ref={actividadesDrag.setRowRef(i)} className={`border-b border-gray-100 ${actividadesDrag.dragIndex === i ? 'bg-[#E8F1FB]' : ''}`}>
                  <td className="w-8 p-1 text-center">
                    <button
                      type="button"
                      {...actividadesDrag.bind(i)}
                      className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-[#0E4660] p-1 touch-none select-none"
                      aria-label="Arrastrar para reordenar esta actividad"
                      title="Arrastrar para reordenar"
                    >
                      <GripVertical size={16} />
                    </button>
                  </td>
                  <td className="w-[74%] p-1">
                    <input type="text" value={act} onChange={e => handleUpdateActividad(i, e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[18%] p-1 text-right whitespace-nowrap">
                    <button type="button" onClick={() => handleRemoveActividad(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            <select value={selectedActividadSugerida} onChange={e => setSelectedActividadSugerida(e.target.value)} className="flex-1 min-w-[220px] p-2 border border-[#DCE1E6] rounded-md text-sm">
              <option value="">-- Seleccionar actividad extra sugerida --</option>
              <optgroup label="Actividades frecuentes">
                <option value="Reunión de tronadura">Reunión de tronadura</option>
                <option value="Test de alcohol y drogas">Test de alcohol y drogas</option>
                <option value="Reunión de inicio de TDFS">Reunión de inicio de TDFS</option>
                <option value="Movimiento de carro">Movimiento de carro</option>
                <option value={ACTIVIDAD_SUGERIDA_MANTENCION}>Mantenimiento preventivo</option>
                <option value="Reunion de cierre TDFS">Reunion de cierre TDFS</option>
                <option value="Checklist de de carros LTE">Checklist de de carros LTE</option>
                <option value="Orden y Limpieza de Bodega">Orden y Limpieza de Bodega</option>
              </optgroup>
              {/* Tareas de la actividad (listado del cliente, en src/catalogos.ts). Se inserta solo el nombre de la tarea. */}
              {GRUPOS_TAREAS.map(grupo => (
                <optgroup key={grupo.titulo} label={grupo.titulo}>
                  {grupo.tareas.map(t => (
                    <option key={`${grupo.titulo}-${t.codigo}`} value={t.tarea}>{t.codigo} · {t.tarea}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button onClick={() => {
              if (!selectedActividadSugerida) return;
              if (selectedActividadSugerida === ACTIVIDAD_SUGERIDA_MANTENCION) {
                setMantencionModalOpen(true); // pide el carro antes de insertar
                return;
              }
              handleAddActividad(selectedActividadSugerida);
              setSelectedActividadSugerida('');
            }} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar sugerida
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddActividad('')} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar actividad en blanco
            </button>
            <button onClick={resetActividades} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a actividades por defecto
            </button>
          </div>
        </details>

        {/* Section 3b: Bloque fijo Vertiv (solo Turno Noche, en divisiones con planta Vertiv) */}
        {turno === 'noche' && config.vertiv && (
          <details open className="panel p-5">
            <summary className="panel__summary font-display font-bold text-lg">
              <BatteryCharging size={18} className="panel__summary-icon" strokeWidth={2.2} />
              Verificación Gestión Vertiv (fijo — solo Turno Noche)
              <ChevronDown size={16} className="panel__summary-chevron" />
            </summary>
            <p className="text-xs text-gray-500 mb-3">
              Los títulos de este bloque son fijos y no editables. Solo debes cargar la captura/foto de evidencia de cada Carro y de cada ítem de monitoreo; se incluirán automáticamente en el documento con el mismo formato de la plantilla (imagen + leyenda). Solo aparece en <strong>Turno Noche</strong>.
            </p>

            <p className="text-xs text-[#6B6B6B] font-bold mb-2 mt-4">Evidencia por Carro (van de a pares, imagen y leyenda debajo)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {VERTIV_CARROS_FLAT.map((title, i) => (
                <div key={i} className="border border-dashed border-[#DCE1E6] rounded-lg p-2 bg-[#fafbfc] flex items-center gap-2.5">
                  <div
                    onClick={() => handleSelectVertivSlot('carro', i)}
                    className={`photo-slot w-[100px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white flex-shrink-0 cursor-pointer ${selectedVertivSlot?.type === 'carro' && selectedVertivSlot.index === i ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                  >
                    {vertivCarroPhotos[i] && (
                      <>
                        <button onClick={() => clearVertivCarroPhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3 z-10">
                          ×
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleCopiarFoto(vertivCarroPhotos[i]); }}
                          className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center z-10"
                          aria-label="Copiar imagen al portapapeles"
                          title="Copiar imagen al portapapeles"
                        >
                          <Copy size={10} />
                        </button>
                      </>
                    )}
                    <img
                      src={vertivCarroPhotos[i] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"}
                      alt={title}
                      onClick={e => { if (vertivCarroPhotos[i]) { e.stopPropagation(); setFotoAmpliada(vertivCarroPhotos[i]); } }}
                      className={`w-[92px] h-[70px] object-cover rounded mx-auto mb-1 bg-gray-100 ${vertivCarroPhotos[i] ? 'cursor-zoom-in' : ''}`}
                    />
                    <button type="button" onClick={() => openDocumentScanner({ type: 'vertivCarro', index: i })} className="w-full bg-[#0E4660] text-white rounded px-1 py-1 mb-1 text-[9px] font-bold">Escanear documento</button>
                    <span className="block text-[9px] text-gray-500">Imagen, cámara o app de escaneo:</span>
                    <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignVertivCarroPhoto(e.target.files[0], i)} className="text-[9px] w-full" />
                  </div>
                  <span className="text-sm font-bold text-[#0E4660]">{title}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#6B6B6B] font-bold mb-2">Evidencia por ítem de monitoreo (cada uno va en su propia hoja del documento)</p>
            <div className="space-y-2.5">
              {VERTIV_ITEMS.map((item, i) => (
                <div key={i} className="border border-dashed border-[#DCE1E6] rounded-lg p-2 bg-[#fafbfc] flex items-center gap-2.5">
                  <div
                    onClick={() => handleSelectVertivSlot('item', i)}
                    className={`photo-slot w-[100px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white flex-shrink-0 cursor-pointer ${selectedVertivSlot?.type === 'item' && selectedVertivSlot.index === i ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                  >
                    {vertivItemPhotos[i] && (
                      <>
                        <button onClick={() => clearVertivItemPhoto(i)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3 z-10">
                          ×
                        </button>
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleCopiarFoto(vertivItemPhotos[i]); }}
                          className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-4 h-4 flex items-center justify-center z-10"
                          aria-label="Copiar imagen al portapapeles"
                          title="Copiar imagen al portapapeles"
                        >
                          <Copy size={10} />
                        </button>
                      </>
                    )}
                    <img
                      src={vertivItemPhotos[i] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"}
                      alt={item}
                      onClick={e => { if (vertivItemPhotos[i]) { e.stopPropagation(); setFotoAmpliada(vertivItemPhotos[i]); } }}
                      className={`w-[92px] h-[70px] object-cover rounded mx-auto mb-1 bg-gray-100 ${vertivItemPhotos[i] ? 'cursor-zoom-in' : ''}`}
                    />
                    <button type="button" onClick={() => openDocumentScanner({ type: 'vertivItem', index: i })} className="w-full bg-[#0E4660] text-white rounded px-1 py-1 mb-1 text-[9px] font-bold">Escanear documento</button>
                    <span className="block text-[9px] text-gray-500">Imagen, cámara o app de escaneo:</span>
                    <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignVertivItemPhoto(e.target.files[0], i)} className="text-[9px] w-full" />
                  </div>
                  <span className="text-sm text-[#333]">{item}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Además, se agregará automáticamente una hoja final con <strong>Indicadores Técnicos Relevantes</strong> y <strong>Observaciones</strong> de cierre.
            </p>
          </details>
        )}

        {/* Section 4: Observaciones */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <MessageSquare size={18} className="panel__summary-icon" strokeWidth={2.2} />
            4. Observaciones
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>
          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {observaciones.map((obs, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[90%] p-1">
                    <input type="text" value={obs} onChange={e => {
                      const updated = [...observaciones];
                      updated[i] = e.target.value;
                      setObservaciones(updated);
                    }} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[10%] p-1 text-right">
                    <button onClick={() => setObservaciones(observaciones.filter((_, idx) => idx !== i))} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setObservaciones([...observaciones, ''])} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar observación
          </button>
          <p className="text-xs text-gray-500 mt-2">Si no hay observaciones, deja la lista vacía.</p>
        </details>

        {/* Section 5: Evidencia Fotográfica */}
        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Camera size={18} className="panel__summary-icon" strokeWidth={2.2} />
            5. Evidencia fotográfica
            <ChevronDown size={16} className="panel__summary-chevron" />
          </summary>
          <p className="text-xs text-gray-500 mb-3">
            {turno === 'noche'
              ? <><strong>Bloques fijos de Turno Noche.</strong> Esta plantilla incluye siempre las evidencias nocturnas, incluida REPORTABILIDAD GG.<br /></>
              : <><strong>Bloques de Turno Día.</strong> Se sincronizan dinámicamente con la sección de Actividades y no incluyen los bloques exclusivos de Noche.<br /></>}
            En Android y iPhone puedes usar la cámara del dispositivo para fotografiar o escanear el documento, o seleccionar una imagen de la galería. También soporta <strong>Ctrl + V</strong> en computador. Si un bloque no tiene fotos, se omitirá en el documento generado.
          </p>

          <div className="space-y-3">
            {evidenceBlocks.map((block, bi) => (
              <div key={block.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={block.title}
                    onChange={e => {
                      const val = e.target.value;
                      setEvidenceBlocks(prev => prev.map((b, i) => i === bi ? { ...b, title: val } : b));
                    }}
                    className="flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]"
                  />
                  {block.isActivity ? (
                    <span className="text-[11px] text-gray-400">
                      ({turno === 'dia' ? 'fijo turno día' : `Vinc. a Actividad ${(block.actIndex ?? 0) + 1}`})
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">(fijo turno {turno === 'noche' ? 'noche' : 'día'})</span>
                  )}
                </div>

                <div className="overflow-x-auto pb-2">
                  <div className="flex flex-nowrap gap-2.5 items-center min-w-max">
                    {block.photos.map((src, pi) => (
                    <div
                      key={pi}
                      onClick={() => handleSelectEvidenceSlot(bi, pi)}
                      className={`photo-slot w-[180px] min-w-[180px] text-center text-[11px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedEvidenceSlot?.blockIndex === bi && selectedEvidenceSlot.photoIndex === pi ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                      title="Haz clic aquí y luego pega una imagen con Ctrl+V"
                    >
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          requestRemovePhotoSlot(bi, pi);
                        }}
                        title="Eliminar esta casilla de foto"
                        aria-label="Eliminar esta casilla de foto"
                        className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700"
                      >
                        <Trash2 size={12} />
                      </button>
                      {src && (
                        <button
                          type="button"
                          onClick={e => { e.stopPropagation(); handleCopiarFoto(src); }}
                          className="absolute top-0.5 left-0.5 bg-black/55 hover:bg-black/70 text-white rounded-full w-5 h-5 flex items-center justify-center z-10"
                          aria-label="Copiar imagen al portapapeles"
                          title="Copiar imagen al portapapeles"
                        >
                          <Copy size={12} />
                        </button>
                      )}
                      <img
                        src={src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='98'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='10'%3EArrastra o pega%3C/text%3E%3C/svg%3E"}
                        alt="Evidencia"
                        onClick={e => { if (src) { e.stopPropagation(); setFotoAmpliada(src); } }}
                        className={`w-[120px] h-[90px] object-cover rounded mx-auto mb-1 bg-gray-100 ${src ? 'cursor-zoom-in' : ''}`}
                      />
                      <button type="button" onClick={() => openDocumentScanner({ type: 'evidence', blockIndex: bi, photoIndex: pi })} className="w-full bg-[#0E4660] text-white rounded px-1.5 py-1 mb-1 text-[10px] font-bold">Escanear documento</button>
                      <span className="block text-[10px] text-gray-500">Imagen, cámara o app de escaneo:</span>
                      <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignFileToSlot(e.target.files[0], bi, pi)} className="text-[10px] w-full min-w-[168px]" />
                    </div>
                    ))}
                    <button type="button" onClick={() => handleAddPhotoSlot(bi)} className="btn-outline text-[#0E4660] px-2.5 py-1.5 rounded text-xs font-bold hover:bg-[#d5e7f8]">
                      + Foto
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleAddGenericBlock} className="mt-3 btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar bloque extra de evidencia
          </button>
        </details>

        {/* Action Button */}
        <div className="action-zone">
          <button
            onClick={() => void generarDocumento()}
            disabled={isGenerating}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Generando Word Exacto...
              </>
            ) : "Generar documento Word"}
          </button>
        </div>

        <p className="text-center text-gray-500 text-xs mt-4">
          El archivo .docx mantendrá fielmente el formato, proporciones, imágenes y portada original de PSINet.
        </p>
      </main>

      <div className="fixed bottom-1 left-1/2 -translate-x-1/2 text-[#F4F6F8] text-[10px] italic cursor-text whitespace-nowrap z-10 select-text">
        creado con amor &lt;3
      </div>

      {draftPromptOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center">
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
            <h2 className="text-lg font-bold text-[#0E4660]">Borrador encontrado</h2>
            <p className="text-sm text-gray-600">
              Encontramos contenido guardado de una sesión anterior. ¿Quieres continuar con ese borrador o comenzar un informe nuevo?
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={continueDraft} className="flex-1 bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold hover:bg-[#0a3549]">
                Continuar borrador
              </button>
              <button type="button" onClick={() => startNewReport()} className="flex-1 border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Empezar de nuevo
              </button>
            </div>
          </div>
        </div>
      )}

      {photoRemovalRequest && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="photo-removal-title">
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
            <h2 id="photo-removal-title" className="text-lg font-bold text-[#0E4660]">Eliminar bloque completo</h2>
            <p className="text-sm text-gray-600">
              Este bloque solo tiene una casilla. Si la eliminas, también se borrará el bloque completo y no solo la imagen.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPhotoRemovalRequest(null)} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Cancelar
              </button>
              <button type="button" onClick={confirmRemovePhotoSlot} className="bg-red-700 text-white rounded-md px-3 py-2 text-sm font-bold hover:bg-red-800">
                Eliminar bloque
              </button>
            </div>
          </div>
        </div>
      )}

      {scannerTarget && (
        <div className="fixed inset-0 z-50 bg-black/90 p-4 flex items-center justify-center">
          <div className="modal-anim w-full max-w-lg bg-white rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-[#0E4660]">Escanear documento</h2>
              <button type="button" onClick={closeDocumentScanner} className="text-gray-500 text-xl leading-none" aria-label="Cerrar escáner">×</button>
            </div>
            <p className="text-xs text-gray-600">{scannerMessage}</p>
            {scannerPreview ? (
              <img src={scannerPreview} alt="Vista previa del documento escaneado" className="w-full max-h-[55vh] object-contain rounded border border-gray-200 bg-gray-100" />
            ) : (
              <video ref={scannerVideoRef} autoPlay muted playsInline className="w-full max-h-[55vh] object-contain rounded bg-black" />
            )}
            <canvas ref={scannerCanvasRef} className="hidden" />
            <div className="flex gap-2">
              {scannerPreview ? (
                <>
                  <button type="button" onClick={() => setScannerPreview(null)} className="flex-1 border border-[#DCE1E6] rounded-md px-3 py-2 text-sm">Tomar otra</button>
                  <button type="button" onClick={confirmScannedDocument} className="flex-1 bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold">Usar documento</button>
                </>
              ) : (
                <button type="button" onClick={() => void captureDocument()} className="w-full bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold">Capturar y escanear</button>
              )}
            </div>
          </div>
        </div>
      )}

      {mantencionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="mantencion-title">
          <div className="modal-anim w-full max-w-md bg-white rounded-xl p-6 shadow-xl space-y-4">
            <h2 id="mantencion-title" className="text-lg font-bold text-[#0E4660]">Mantenimiento preventivo</h2>
            <p className="text-sm text-gray-600">Selecciona el carro al que se le realizará la mantención.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {CARROS_MANTENCION.map(carro => (
                <button
                  key={carro}
                  type="button"
                  onClick={() => setCarroMantencion(carro)}
                  className={`rounded-md border px-2 py-2 text-xs font-bold ${
                    carroMantencion === carro
                      ? 'bg-[#0E4660] text-white border-[#0E4660]'
                      : 'border-[#DCE1E6] text-[#0E4660] hover:bg-[#E8F1FB]'
                  }`}
                >
                  {carro}
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={cerrarModalMantencion} className="border border-[#DCE1E6] text-[#333] rounded-md px-3 py-2 text-sm font-bold hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarMantencionCarro}
                disabled={!carroMantencion}
                className="bg-[#0E4660] text-white rounded-md px-3 py-2 text-sm font-bold hover:bg-[#0a3549] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Insertar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}

      {fotoAmpliada && <VisorFoto src={fotoAmpliada} onClose={() => setFotoAmpliada(null)} />}
    </div>
  );
}
