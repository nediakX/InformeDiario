import { useState, useEffect, type ClipboardEvent } from 'react';
import * as docx from 'docx';
import { saveAs } from 'file-saver';



// Tipos de datos
interface PersonalItem {
  nombre: string;
  cargo: string;
}

interface EvidenceBlock {
  id: string;
  title: string;
  photoCount: number;
  photos: (string | null)[];
  isActivity: boolean;
  actIndex?: number;
}

const DEFAULT_PERSONAL: PersonalItem[] = [
  { nombre: "Max Diaz", cargo: "Supervisor" },
  { nombre: "Patricio Santana", cargo: "Supervisor" },
  { nombre: "Carlos Moll.", cargo: "Técnico Eléctrico." },
  { nombre: "Williams Barraza.", cargo: "Técnico Telecomunicaciones." },
  { nombre: "José Escobar", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Kevin Guerrero", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Vanesa Aguilar", cargo: "Técnico Telecomunicaciones." },
  { nombre: "Nicolas Bahamondes", cargo: "Lider Tecnico" },
  { nombre: "Juan Morata", cargo: "Ingeniero Especialista" },
  { nombre: "Ricardo Riquelme", cargo: "Electromecanico" },
  { nombre: "Claudia Droguett", cargo: "Experta HSE" }
];

const DEFAULT_ACTIVIDADES: string[] = [
  "Registro de reunión inicio de turno.",
  "Registro de Check List de vehículo liviano.",
  "Vehículo liviano L200 VCTF 84.",
  "Autoevaluación Diaria inicio y termino de turno.",
  "Registro fatiga y somnolencia.",
  "Registro de protección solar.",
  "Registro de Hidratación.",
  "Tareas Administrativas."
];

const BLUE = "156082";
const ORANGE = "ED7D31";
const LS_KEY = "psinet_reporte_state_v5";
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Helper para convertir rutas o URLs a DataURL Base64
const urlToBase64 = async (url: string): Promise<string> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export default function App() {
  // Estados de datos generales
  const [turno, setTurno] = useState<'dia' | 'noche'>('dia');
  const [fecha, setFecha] = useState<string>(new Date().toISOString().split('T')[0]);
  const [faena, setFaena] = useState<string>('Minera Rajo Inca');
  const [letraTurno, setLetraTurno] = useState<string>('A');
  const [contrato, setContrato] = useState<string>('4600027858');
  const [version, setVersion] = useState<string>('1.1');
  const [servicio, setServicio] = useState<string>('SERVICIO DE IMPLEMENTACIÓN Y CONTINUIDAD OPERACIONAL DE RED INALAMBRICA LTE-DSAL');
  const [creadoNombre, setCreadoNombre] = useState<string>('Max Diaz Cornejo');
  const [creadoCargo, setCreadoCargo] = useState<string>('Supervisor Operaciones');
  const [revisadoText, setRevisadoText] = useState<string>('Juan Morata\nJuan Saavedra');
  const [autorizadoNombre, setAutorizadoNombre] = useState<string>('Cesar Orellana');
  const [autorizadoCargo, setAutorizadoCargo] = useState<string>('ADC');

  // Imagen / Logos
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);

  // Listados principales
  const [personal, setPersonal] = useState<PersonalItem[]>([]);
  const [actividades, setActividades] = useState<string[]>([]);
  const [observaciones, setObservaciones] = useState<string[]>([]);
  const [evidenceBlocks, setEvidenceBlocks] = useState<EvidenceBlock[]>([]);
  
  // UI States
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [selectedPersonalSugerido, setSelectedPersonalSugerido] = useState<string>('');
  const [selectedActividadSugerida, setSelectedActividadSugerida] = useState<string>('');
  const [genericCounter, setGenericCounter] = useState<number>(0);

  // Carga inicial y conversión de imágenes por defecto
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPersonal(parsed.personal || DEFAULT_PERSONAL);
        setActividades(parsed.actividades || DEFAULT_ACTIVIDADES);
      } else {
        setPersonal(DEFAULT_PERSONAL);
        setActividades(DEFAULT_ACTIVIDADES);
      }
    } catch {
      setPersonal(DEFAULT_PERSONAL);
      setActividades(DEFAULT_ACTIVIDADES);
    }

    // Cargar o inicializar Logo y Portada predeterminados
    const initImages = async () => {
      try {
        const storedLogo = localStorage.getItem("psinet_logo_v2");
        if (storedLogo) {
          setLogoDataUrl(storedLogo);
        } else {
          const logoBase64 = await urlToBase64(logoPsinet);
          setLogoDataUrl(logoBase64);
        }

        const storedCover = localStorage.getItem("psinet_cover_v2");
        if (storedCover) {
          setCoverDataUrl(storedCover);
        } else {
          const coverBase64 = await urlToBase64(logoEdificio);
          setCoverDataUrl(coverBase64);
        }
      } catch (err) {
        console.error("Error al cargar las imágenes de marca:", err);
      }
    };

    initImages();
  }, []);

  // Sincronizar bloques de evidencia cuando cambian las actividades
  useEffect(() => {
    setEvidenceBlocks(prevBlocks => {
      const newBlocks: EvidenceBlock[] = [];
      actividades.forEach((actText, idx) => {
        const existing = prevBlocks.find(b => b.actIndex === idx || (b.isActivity && b.title === actText));
        if (existing) {
          newBlocks.push({ ...existing, title: actText, actIndex: idx });
        } else {
          newBlocks.push({
            id: `act_${Date.now()}__${idx}`,
            title: actText,
            photoCount: 1,
            photos: [null],
            isActivity: true,
            actIndex: idx
          });
        }
      });

      prevBlocks.filter(b => !b.isActivity).forEach(b => newBlocks.push(b));
      return newBlocks;
    });
  }, [actividades]);

  const showToast = (text: string, isError = false) => {
    setToastMessage({ text, isError });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const persistData = (newPersonal: PersonalItem[], newActividades: string[]) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ personal: newPersonal, actividades: newActividades }));
    } catch (e) { console.error(e); }
  };

  // Handlers para Personal
  const handleAddPersonal = (nombre = '', cargo = '') => {
    const updated = [...personal, { nombre, cargo }];
    setPersonal(updated);
    persistData(updated, actividades);
  };

  const handleRemovePersonal = (index: number) => {
    const updated = personal.filter((_, i) => i !== index);
    setPersonal(updated);
    persistData(updated, actividades);
  };

  const handleUpdatePersonal = (index: number, field: 'nombre' | 'cargo', value: string) => {
    const updated = personal.map((item, i) => i === index ? { ...item, [field]: value } : item);
    setPersonal(updated);
    persistData(updated, actividades);
  };

  const resetPersonal = () => {
    if (window.confirm("¿Deseas restaurar la lista de personal por defecto?")) {
      setPersonal(DEFAULT_PERSONAL);
      persistData(DEFAULT_PERSONAL, actividades);
      showToast("Lista de personal restaurada.");
    }
  };

  // Handlers para Actividades
  const handleAddActividad = (text: string) => {
    const updated = [...actividades, text];
    setActividades(updated);
    persistData(personal, updated);
  };

  const handleUpdateActividad = (index: number, value: string) => {
    const updated = actividades.map((act, i) => i === index ? value : act);
    setActividades(updated);
    persistData(personal, updated);
  };

  const handleRemoveActividad = (index: number) => {
    const updated = actividades.filter((_, i) => i !== index);
    setActividades(updated);
    persistData(personal, updated);
  };

  const resetActividades = () => {
    if (window.confirm("¿Deseas restaurar la lista de actividades obligatorias por defecto?")) {
      setActividades(DEFAULT_ACTIVIDADES);
      persistData(personal, DEFAULT_ACTIVIDADES);
      showToast("Lista de actividades restaurada.");
    }
  };

  // Handlers Evidencias
  const assignFileToSlot = (file: File, blockIndex: number, photoIndex: number) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      setEvidenceBlocks(prev => prev.map((b, bi) => {
        if (bi !== blockIndex) return b;
        const newPhotos = [...b.photos];
        newPhotos[photoIndex] = reader.result as string;
        return { ...b, photos: newPhotos };
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleAddPhotoSlot = (blockIndex: number) => {
    setEvidenceBlocks(prev => prev.map((b, i) => i === blockIndex ? {
      ...b,
      photoCount: b.photoCount + 1,
      photos: [...b.photos, null]
    } : b));
  };

  const handleClearPhoto = (blockIndex: number, photoIndex: number) => {
    setEvidenceBlocks(prev => prev.map((b, bi) => {
      if (bi !== blockIndex) return b;
      const newPhotos = [...b.photos];
      newPhotos[photoIndex] = null;
      return { ...b, photos: newPhotos };
    }));
  };

  const handleAddGenericBlock = () => {
    const count = genericCounter + 1;
    setGenericCounter(count);
    setEvidenceBlocks(prev => [
      ...prev,
      {
        id: `extra_${Date.now()}_${count}`,
        title: `Evidencia adicional ${count}`,
        photoCount: 1,
        photos: [null],
        isActivity: false
      }
    ]);
  };

  // Pegado Global
  const handlePaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
    if (activeTag === 'input' || activeTag === 'textarea') return;

    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;

    let imgIdx = 0;
    const updatedBlocks = [...evidenceBlocks];

    for (let bi = 0; bi < updatedBlocks.length && imgIdx < imageFiles.length; bi++) {
      for (let pi = 0; pi < updatedBlocks[bi].photoCount && imgIdx < imageFiles.length; pi++) {
        if (!updatedBlocks[bi].photos[pi]) {
          assignFileToSlot(imageFiles[imgIdx], bi, pi);
          imgIdx++;
        }
      }
    }

    if (imgIdx < imageFiles.length) {
      showToast("Imagen pegada desde el portapapeles.");
    }
  };

  // Funciones de formato
  const formatFechaLarga = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${String(d).padStart(2, "0")} de ${MESES[m - 1]} del ${y}`;
  };

  const formatFechaPortada = (iso: string) => {
    if (!iso) return "—";
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} de ${MESES[m - 1]} ${y}`;
  };

  const dataUrlToUint8Array = (dataUrl: string) => {
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  };

  // Generador Word en React
  const generarDocumento = async () => {
    if (!fecha) {
      alert("Selecciona la fecha del turno.");
      return;
    }

    setIsGenerating(true);

    try {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, ImageRun, WidthType, BorderStyle, AlignmentType,
        HeadingLevel, VerticalAlign,
      } = docx;

      const cellBorders = (color?: string) => {
        const b = { style: BorderStyle.SINGLE, size: 4, color: color || "D9D9D9" };
        return { top: b, bottom: b, left: b, right: b };
      };
      
      const noBorders = () => {
        const n = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
      };

      const logoBytes = logoDataUrl ? dataUrlToUint8Array(logoDataUrl) : null;
      const logoType = logoDataUrl?.startsWith("data:image/png") ? "png" : "jpg";
      const coverBytes = coverDataUrl ? dataUrlToUint8Array(coverDataUrl) : null;
      const coverType = coverDataUrl?.startsWith("data:image/png") ? "png" : "jpg";
      const revisadoPor = revisadoText.split("\n").map(s => s.trim()).filter(Boolean);

      const headerCellMargins = { top: 160, bottom: 160, left: 220, right: 220 };

      const header = new Header({
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: cellBorders("000000"),
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 22, type: WidthType.PERCENTAGE },
                    rowSpan: 3,
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: logoBytes
                        ? [new ImageRun({ data: logoBytes, transformation: { width: 120, height: 40 }, type: logoType })]
                        : [new TextRun({ text: "PSINet", bold: true, size: 24, font: "Arial" })],
                    })],
                  }),
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Reporte Diario", size: 20, font: "Arial", bold: true })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [new TextRun({ text: "N° Contrato:", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contrato, size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    rowSpan: 2,
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { line: 280 }, children: [new TextRun({ text: servicio, size: 15, bold: true, font: "Arial" })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versión:  " + version, size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: headerCellMargins,
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Fecha: " + formatFechaPortada(fecha), size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const coverLeftChildren: docx.Paragraph[] = [
        new Paragraph({
          children: logoBytes
            ? [new ImageRun({ data: logoBytes, transformation: { width: 200, height: 66 }, type: logoType })]
            : [new TextRun({ text: "PSINet", bold: true, size: 42, font: "Arial" })],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
      ];

      if (coverBytes) {
        coverLeftChildren.push(new Paragraph({
          children: [new ImageRun({ data: coverBytes, transformation: { width: 496, height: 372 }, type: coverType })],
        }));
      }

      coverLeftChildren.push(
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "REPORTE DIARIO", size: 66, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: turno === "dia" ? "TURNO DIA" : "TURNO NOCHE", size: 66, font: "Arial", bold: true, color: "000000" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "De Actividades", bold: true, size: 40, font: "Arial" })] })
      );

      const coverTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorders(), children: coverLeftChildren }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
                margins: { left: 300, top: 100, bottom: 100 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: formatFechaPortada(fecha), size: 24, font: "Arial", color: "000000" })] }),
                  new Paragraph({ children: [new TextRun({ text: "_______________________", size: 12, color: "CCCCCC" })] }),
                  new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: "Creado por:", size: 24, font: "Arial", color: "333333" })] }),
                  new Paragraph({ children: [new TextRun({ text: creadoNombre, size: 24, font: "Arial", bold: true })] }),
                  new Paragraph({ children: [new TextRun({ text: "Cargo: " + creadoCargo, size: 24, font: "Arial" })] }),
                  new Paragraph({ children: [new TextRun({ text: "_______________________", size: 12, color: "CCCCCC" })] }),
                  new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: "Revisado por:", size: 24, font: "Arial", color: "333333" })] }),
                  ...(revisadoPor.length ? revisadoPor.map(n => new Paragraph({ children: [new TextRun({ text: n, size: 24, font: "Arial", bold: true })] })) : [new Paragraph({ children: [new TextRun({ text: "—", size: 24, font: "Arial" })] })]),
                  new Paragraph({ children: [new TextRun({ text: "_______________________", size: 12, color: "CCCCCC" })] }),
                  new Paragraph({ text: "" }),
                  new Paragraph({ children: [new TextRun({ text: "Autorizado por:", size: 24, font: "Arial", color: "333333" })] }),
                  new Paragraph({ children: [new TextRun({ text: autorizadoNombre, size: 24, font: "Arial", bold: true })] }),
                  new Paragraph({ children: [new TextRun({ text: "Cargo: " + autorizadoCargo, size: 24, font: "Arial" })] }),
                ],
              })
            ]
          })
        ],
      });

      const descripcionParrafo = `Este documento detalla las actividades realizadas durante la jornada del ${formatFechaLarga(fecha)}, correspondientes al Turno ${letraTurno} en ${faena}.`;

      const evidenceContent = evidenceBlocks.flatMap(block => {
        const usablePhotos = block.photos.filter((p): p is string => Boolean(p));
        if (usablePhotos.length === 0) return [];

        const colWidth = Math.floor(100 / usablePhotos.length);
        const cells = usablePhotos.map(dataUrl => {
          const bytes = dataUrlToUint8Array(dataUrl);
          const type = dataUrl.startsWith("data:image/png") ? "png" : "jpg";
          return new TableCell({
            width: { size: colWidth, type: WidthType.PERCENTAGE },
            borders: cellBorders(),
            margins: { top: 100, bottom: 100, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new ImageRun({ data: bytes, transformation: { width: 307, height: 456 }, type })],
            })],
          });
        });

        const captionRow = new TableRow({
          children: [new TableCell({
            columnSpan: usablePhotos.length,
            borders: cellBorders(),
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: block.title, bold: true, size: 20, font: "Arial" })] })],
          })],
        });

        return [
          new Paragraph({ text: "", pageBreakBefore: true }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: cells }), captionRow] }),
        ];
      });

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
        sections: [
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            children: [coverTable],
          },
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            headers: { default: header },
            children: [
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Descripción", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              new Paragraph({ children: [new TextRun({ text: descripcionParrafo, font: "Arial" })] }),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `Personal en Turno ${letraTurno}`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...personal.filter(p => p.nombre.trim()).map(p => new Paragraph({ text: `${p.nombre}\t${p.cargo}`, bullet: { level: 0 } })),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Actividades Diarias.", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...actividades.filter(a => a.trim()).map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
              new Paragraph({ text: "" }),
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Observaciones.", color: BLUE, size: 26, font: "Arial", bold: true })] }),
              ...observaciones.filter(o => o.trim()).map(o => new Paragraph({ text: o, bullet: { level: 0 } })),
              ...evidenceContent,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const filename = `Reporte_Actividades_Turno${turno === "dia" ? "Dia" : "Noche"}_${fecha}.docx`;
      saveAs(blob, filename);

      showToast(`Documento generado exitosamente: ${filename}`);
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo.", true);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] text-[#222] font-sans pb-20" onPaste={handlePaste}>
      {/* Header */}
      <header className="bg-[#111] text-white py-3.5 px-5 flex items-center gap-3.5">
        <div className="font-extrabold text-2xl tracking-wide">
          PSI<span className="text-[#FFC72C]">Net</span>
        </div>
        <div className="text-xs text-gray-400">Generador de Reporte Diario de Actividades Dinámico</div>
      </header>

      {/* Main Container */}
      <main className="max-w-[900px] mx-auto p-5 space-y-4">
        {/* Section 1: Datos Generales */}
        <div className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5">
            1. Datos generales
          </h2>
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Tipo de turno</label>
                <div className="flex gap-4 items-center mt-2">
                  <label className="text-sm flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="turno" checked={turno === 'dia'} onChange={() => setTurno('dia')} /> Turno Día
                  </label>
                  <label className="text-sm flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="turno" checked={turno === 'noche'} onChange={() => setTurno('noche')} /> Turno Noche
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Fecha del turno</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Faena / Proyecto</label>
                <input type="text" value={faena} onChange={e => setFaena(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Letra de turno</label>
                <input type="text" value={letraTurno} onChange={e => setLetraTurno(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">N° Contrato</label>
                <input type="text" value={contrato} onChange={e => setContrato(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Versión</label>
                <input type="text" value={version} onChange={e => setVersion(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Nombre del servicio (encabezado)</label>
              <input type="text" value={servicio} onChange={e => setServicio(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por (Supervisor a cargo)</label>
                <input type="text" value={creadoNombre} onChange={e => setCreadoNombre(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cargo</label>
                <input type="text" value={creadoCargo} onChange={e => setCreadoCargo(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Revisado por (uno por línea)</label>
                <textarea rows={2} value={revisadoText} onChange={e => setRevisadoText(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Autorizado por</label>
                <input type="text" value={autorizadoNombre} onChange={e => setAutorizadoNombre(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cargo autorizado</label>
                <input type="text" value={autorizadoCargo} onChange={e => setAutorizadoCargo(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Personal en Turno */}
        <div className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5">
            2. Personal en Turno
          </h2>
          
          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {personal.map((p, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[45%] p-1">
                    <input type="text" value={p.nombre} onChange={e => handleUpdatePersonal(i, 'nombre', e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[45%] p-1">
                    <input type="text" value={p.cargo} onChange={e => handleUpdatePersonal(i, 'cargo', e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[10%] p-1 text-right">
                    <button onClick={() => handleRemovePersonal(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            <select value={selectedPersonalSugerido} onChange={e => setSelectedPersonalSugerido(e.target.value)} className="flex-1 min-w-[220px] p-2 border border-[#DCE1E6] rounded-md text-sm">
              <option value="">-- Seleccionar integrante del equipo --</option>
              <option value="Max Diaz|Supervisor">Max Diaz - Supervisor</option>
              <option value="Patricio Santana|Supervisor">Patricio Santana - Supervisor</option>
              <option value="Carlos Moll.|Técnico Eléctrico.">Carlos Moll. - Técnico Eléctrico.</option>
              <option value="Williams Barraza.|Técnico Telecomunicaciones.">Williams Barraza. - Técnico Telecomunicaciones.</option>
              <option value="José Escobar|Técnico Telecomunicaciones.">José Escobar - Técnico Telecomunicaciones.</option>
              <option value="Kevin Guerrero|Técnico Telecomunicaciones.">Kevin Guerrero - Técnico Telecomunicaciones.</option>
              <option value="Vanesa Aguilar|Técnico Telecomunicaciones.">Vanesa Aguilar - Técnico Telecomunicaciones.</option>
            </select>
            <button onClick={() => {
              if (selectedPersonalSugerido) {
                const [n, c] = selectedPersonalSugerido.split('|');
                handleAddPersonal(n, c);
                setSelectedPersonalSugerido('');
              }
            }} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar persona
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddPersonal()} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar persona en blanco
            </button>
            <button onClick={resetPersonal} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a lista por defecto
            </button>
          </div>
        </div>

        {/* Section 3: Actividades Diarias */}
        <div className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5">
            3. Actividades Diarias
          </h2>

          <table className="w-full border-collapse mb-3 text-sm">
            <tbody>
              {actividades.map((act, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="w-[90%] p-1">
                    <input type="text" value={act} onChange={e => handleUpdateActividad(i, e.target.value)} className="w-full p-1.5 border border-[#DCE1E6] rounded" />
                  </td>
                  <td className="w-[10%] p-1 text-right">
                    <button onClick={() => handleRemoveActividad(i)} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">Quitar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2.5 mt-2.5">
            <select value={selectedActividadSugerida} onChange={e => setSelectedActividadSugerida(e.target.value)} className="flex-1 min-w-[220px] p-2 border border-[#DCE1E6] rounded-md text-sm">
              <option value="">-- Seleccionar actividad extra sugerida --</option>
              <option value="Reunión de tronadura">Reunión de tronadura</option>
              <option value="Test de alcohol y drogas">Test de alcohol y drogas</option>
              <option value="Reunión de inicio de tfds">Reunión de inicio de tfds</option>
              <option value="Movimiento de carro">Movimiento de carro</option>
              <option value="Mantenimiento">Mantenimiento</option>
            </select>
            <button onClick={() => {
              if (selectedActividadSugerida) {
                handleAddActividad(selectedActividadSugerida);
                setSelectedActividadSugerida('');
              }
            }} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Insertar sugerida
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            <button onClick={() => handleAddActividad('')} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
              + Agregar actividad en blanco
            </button>
            <button onClick={resetActividades} className="bg-[#FFF3CD] text-[#856404] px-3 py-1.5 rounded-md text-xs font-bold border border-[#FFEEBA] hover:bg-[#ffe8a1]">
              ↺ Reiniciar a actividades por defecto
            </button>
          </div>
        </div>

        {/* Section 4: Observaciones */}
        <div className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5">
            4. Observaciones
          </h2>
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
          <button onClick={() => setObservaciones([...observaciones, ''])} className="bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar observación
          </button>
          <p className="text-xs text-gray-500 mt-2">Si no hay observaciones, deja la lista vacía.</p>
        </div>

        {/* Section 5: Evidencia Fotográfica */}
        <div className="bg-white border border-[#DCE1E6] rounded-xl p-5 shadow-sm">
          <h2 className="text-base font-bold text-[#0E4660] border-b-2 border-[#FFC72C] pb-1.5 mb-3.5">
            5. Evidencia fotográfica
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            <strong>Sincronizado dinámicamente con la sección de Actividades.</strong><br />
            Soporta <strong>Ctrl + V</strong> para pegar imágenes. Si un bloque no tiene fotos, se omitirá en el documento generado.
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
                  {!block.isActivity ? (
                    <button onClick={() => setEvidenceBlocks(evidenceBlocks.filter((_, i) => i !== bi))} className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs hover:bg-red-100">
                      Quitar bloque
                    </button>
                  ) : (
                    <span className="text-[11px] text-gray-400">(Vinc. a Actividad {(block.actIndex ?? 0) + 1})</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2.5 items-center">
                  {block.photos.map((src, pi) => (
                    <div key={pi} className="w-[130px] text-center text-[11px] text-gray-500 relative border-2 border-dashed border-gray-300 rounded-md p-1 bg-white">
                      {src && (
                        <button onClick={() => handleClearPhoto(bi, pi)} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-4 h-4 text-[10px] leading-3">
                          ×
                        </button>
                      )}
                      <img src={src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='98'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='10'%3EArrastra o pega%3C/text%3E%3C/svg%3E"} alt="Evidencia" className="w-[120px] h-[90px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                      <input type="file" accept="image/png,image/jpeg" onChange={e => e.target.files?.[0] && assignFileToSlot(e.target.files[0], bi, pi)} className="text-[10px] w-full" />
                    </div>
                  ))}
                  <button onClick={() => handleAddPhotoSlot(bi)} className="bg-[#E8F1FB] text-[#0E4660] px-2.5 py-1.5 rounded text-xs font-bold hover:bg-[#d5e7f8]">
                    + Foto
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button onClick={handleAddGenericBlock} className="mt-3 bg-[#E8F1FB] text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8]">
            + Agregar bloque extra de evidencia
          </button>
        </div>

        {/* Action Button */}
        <button
          onClick={generarDocumento}
          disabled={isGenerating}
          className="w-full bg-[#0E4660] text-white py-3.5 px-6 font-bold text-base rounded-lg shadow-sm hover:bg-[#0a3549] disabled:bg-[#9fb3bd] disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? "Generando Word Exacto..." : "Generar documento Word Exacto"}
        </button>

        <p className="text-center text-gray-500 text-xs mt-4">
          El archivo .docx mantendrá fielmente el formato, proporciones, imágenes y portada original de PSINet.
        </p>
      </main>

      {/* Toast Notification */}
      {toastMessage && (
        <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}