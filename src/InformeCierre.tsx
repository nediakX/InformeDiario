import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from 'react';
import * as docx from 'docx';
import { saveAs } from 'file-saver';
import {
  ArrowLeft, Loader2, FileStack, CalendarRange, ImagePlus, Trash2, CircleCheckBig, Circle,
  Plus, ListTodo, Car, Wrench, MessageSquareText,
} from 'lucide-react';
import logoPsinet from "./assets/logo_psinet.jpg";
import logoEdificio from "./assets/LogoEdificio.png";
import {
  type BorradorEntry,
  fetchBorradores,
  subscribeBorradores,
  dataUrlToUint8Array,
  resolveImageBytes,
  urlToBase64,
  formatFechaLarga,
  formatFechaPunto,
  BLUE,
  ORANGE,
  VERTIV_TITLE,
  VERTIV_CARROS,
  VERTIV_ITEMS,
} from './types';

interface InformeCierreProps {
  onBack: () => void;
}

interface SeccionImagenes {
  id: string;
  title: string;
  photos: (string | null)[];
}

interface CamionetaEntry {
  id: string;
  placa: string;
  antes: string | null;
  despues: string | null;
}

interface ReportabilidadRow {
  id: string;
  sitio: string;
  equipo: string;
  ultimoMtto: string;
  fechaUltimoMtto: string;
  proximoMtto: string;
  fechaProximoMtto: string;
  horasRegistradas: string;
  horasRestantes: string;
  horasDesdeUltimo: string;
}

const DEFAULT_SECCIONES_IMAGENES: SeccionImagenes[] = [
  { id: 'sec-radios', title: 'Radios de comunicación y Juego de Llaves correspondiente a sitios.', photos: [null, null, null] },
  { id: 'sec-bodega', title: 'Bodega', photos: [null, null, null, null] },
];

const DEFAULT_COMENTARIOS: string[] = [
  'ESTIMADOS QUE TENGAN UN BUEN TURNO ¡ÉXITO!',
  'EXTREMAR LAS MEDIDAS DE SEGURIDAD.',
];

const CREADO_POR_OPTIONS: { nombre: string; cargo: string }[] = [
  { nombre: "Max Diaz Cornejo.", cargo: "Supervisor" },
  { nombre: "Patricio Santana.", cargo: "Supervisor de Operaciones" },
  { nombre: "Nicolas Bahamondes.", cargo: "Tecnico Lider" },
];

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result as string);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const uid = () => `id-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export default function InformeCierre({ onBack }: InformeCierreProps) {
  const [borradores, setBorradores] = useState<BorradorEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const preseleccionadoRef = useRef(false);
  const [faena, setFaena] = useState('Minera Rajo Inca');
  const [letraTurno, setLetraTurno] = useState('A');
  const [contrato, setContrato] = useState('4600027858');
  const [version, setVersion] = useState('1');
  const [creadoNombre, setCreadoNombre] = useState(CREADO_POR_OPTIONS[0].nombre);
  const [creadoCargo, setCreadoCargo] = useState(CREADO_POR_OPTIONS[0].cargo);
  const [revisadoText, setRevisadoText] = useState('Juan Saavedra\nJuan Morata');
  const [autorizadoNombre, setAutorizadoNombre] = useState('Cesar Orellana');
  const [autorizadoCargo, setAutorizadoCargo] = useState('ADC');
  const [actividadesPendientes, setActividadesPendientes] = useState<string[]>([]);
  const [seccionesImagenes, setSeccionesImagenes] = useState<SeccionImagenes[]>(DEFAULT_SECCIONES_IMAGENES);
  const [camionetas, setCamionetas] = useState<CamionetaEntry[]>([{ id: uid(), placa: '', antes: null, despues: null }]);
  const [reportabilidad, setReportabilidad] = useState<ReportabilidadRow[]>([]);
  const [comentariosFinales, setComentariosFinales] = useState<string[]>(DEFAULT_COMENTARIOS);
  const [selectedPhotoSlot, setSelectedPhotoSlot] = useState<{ type: 'seccion' | 'camionetaAntes' | 'camionetaDespues'; id: string; photoIndex?: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  const META_DIAS = 7;

  // Carga los borradores compartidos desde la nube y se suscribe a cambios de otros dispositivos.
  useEffect(() => {
    void fetchBorradores().then(setBorradores);
    return subscribeBorradores(setBorradores);
  }, []);

  // Preselecciona automáticamente los últimos 7 días de Turno Día disponibles, solo la primera vez que llegan datos.
  // El Informe de Cierre es exclusivo de Turno Día; los informes de Turno Noche tienen su propio cierre.
  useEffect(() => {
    if (preseleccionadoRef.current || borradores.length === 0) return;
    preseleccionadoRef.current = true;
    const ordenados = borradores.filter(b => b.turno === 'dia').sort((a, b) => a.fecha.localeCompare(b.fecha));
    setSelectedIds(ordenados.slice(-META_DIAS).map(b => b.id));
  }, [borradores]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3500);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const showToast = (text: string, isError?: boolean) => setToastMessage({ text, isError });

  // El Informe de Cierre solo consolida Turno Día; Turno Noche queda fuera de esta selección.
  const ordenadosPorFecha = useMemo(
    () => borradores.filter(b => b.turno === 'dia').sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [borradores]
  );

  const diasSeleccionados = useMemo(
    () => ordenadosPorFecha.filter(b => selectedIds.includes(b.id)),
    [ordenadosPorFecha, selectedIds]
  );

  const toggleDia = (id: string) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= META_DIAS) {
        showToast(`Solo puedes incluir hasta ${META_DIAS} días en el informe de cierre.`, true);
        return prev;
      }
      return [...prev, id];
    });
  };

  const rangoFechas = useMemo(() => {
    if (!diasSeleccionados.length) return null;
    const inicio = diasSeleccionados[0].fecha;
    const fin = diasSeleccionados[diasSeleccionados.length - 1].fecha;
    return { inicio, fin };
  }, [diasSeleccionados]);

  const turnoLabel = useMemo(() => {
    const noches = diasSeleccionados.filter(d => d.turno === 'noche').length;
    return noches > diasSeleccionados.length / 2 ? 'Noche' : 'Dia';
  }, [diasSeleccionados]);

  const personalSemana = useMemo(() => {
    const vistos = new Set<string>();
    const lista: { nombre: string; cargo: string }[] = [];
    diasSeleccionados.forEach(dia => {
      dia.personal.forEach(p => {
        const nombre = p.nombre.trim();
        if (!nombre || vistos.has(nombre)) return;
        vistos.add(nombre);
        lista.push({ nombre, cargo: p.cargo });
      });
    });
    return lista;
  }, [diasSeleccionados]);

  const addPendiente = () => setActividadesPendientes(prev => [...prev, '']);
  const updatePendiente = (i: number, value: string) => setActividadesPendientes(prev => prev.map((v, idx) => idx === i ? value : v));
  const removePendiente = (i: number) => setActividadesPendientes(prev => prev.filter((_, idx) => idx !== i));

  const addComentario = () => setComentariosFinales(prev => [...prev, '']);
  const updateComentario = (i: number, value: string) => setComentariosFinales(prev => prev.map((v, idx) => idx === i ? value : v));
  const removeComentario = (i: number) => setComentariosFinales(prev => prev.filter((_, idx) => idx !== i));

  const addSeccionImagenes = () => setSeccionesImagenes(prev => [...prev, { id: uid(), title: '', photos: [null] }]);
  const removeSeccionImagenes = (id: string) => setSeccionesImagenes(prev => prev.filter(s => s.id !== id));
  const updateSeccionTitle = (id: string, title: string) => setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, title } : s));
  const addFotoASeccion = (id: string) => setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: [...s.photos, null] } : s));
  const removeFotoDeSeccion = (id: string, photoIndex: number) => setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: s.photos.filter((_, i) => i !== photoIndex) } : s));
  const assignFotoSeccion = async (file: File, id: string, photoIndex: number) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setSeccionesImagenes(prev => prev.map(s => s.id === id ? { ...s, photos: s.photos.map((p, i) => i === photoIndex ? dataUrl : p) } : s));
    } catch (error) {
      console.error(error);
      showToast("No se pudo cargar la imagen.", true);
    }
  };

  const addCamioneta = () => setCamionetas(prev => [...prev, { id: uid(), placa: '', antes: null, despues: null }]);
  const removeCamioneta = (id: string) => setCamionetas(prev => prev.filter(c => c.id !== id));
  const updateCamionetaPlaca = (id: string, placa: string) => setCamionetas(prev => prev.map(c => c.id === id ? { ...c, placa } : c));
  const assignCamionetaFoto = async (file: File, id: string, cual: 'antes' | 'despues') => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setCamionetas(prev => prev.map(c => c.id === id ? { ...c, [cual]: dataUrl } : c));
    } catch (error) {
      console.error(error);
      showToast("No se pudo cargar la imagen.", true);
    }
  };

  const addReportabilidadRow = () => setReportabilidad(prev => [...prev, {
    id: uid(), sitio: '', equipo: '', ultimoMtto: '', fechaUltimoMtto: '', proximoMtto: '', fechaProximoMtto: '', horasRegistradas: '', horasRestantes: '', horasDesdeUltimo: '',
  }]);
  const removeReportabilidadRow = (id: string) => setReportabilidad(prev => prev.filter(r => r.id !== id));
  const updateReportabilidadCell = (id: string, field: keyof ReportabilidadRow, value: string) =>
    setReportabilidad(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

  useEffect(() => {
    const handleDocumentPaste = (event: Event) => {
      if (!selectedPhotoSlot) return;
      const clipboardEvent = event as unknown as ClipboardEvent<Document>;
      const items = clipboardEvent.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            if (selectedPhotoSlot.type === 'seccion' && selectedPhotoSlot.photoIndex !== undefined) {
              void assignFotoSeccion(file, selectedPhotoSlot.id, selectedPhotoSlot.photoIndex);
            } else if (selectedPhotoSlot.type === 'camionetaAntes') {
              void assignCamionetaFoto(file, selectedPhotoSlot.id, 'antes');
            } else if (selectedPhotoSlot.type === 'camionetaDespues') {
              void assignCamionetaFoto(file, selectedPhotoSlot.id, 'despues');
            }
          }
          break;
        }
      }
    };
    document.addEventListener('paste', handleDocumentPaste as unknown as EventListener);
    return () => document.removeEventListener('paste', handleDocumentPaste as unknown as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhotoSlot]);

  const generarInformeCierre = async () => {
    if (diasSeleccionados.length === 0) {
      showToast("Selecciona al menos un día para generar el informe de cierre.", true);
      return;
    }

    setIsGenerating(true);
    try {
      const {
        Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
        Header, ImageRun, WidthType, BorderStyle, AlignmentType,
        HeadingLevel, VerticalAlign, TableLayoutType,
      } = docx;

      const cellBorders = (color?: string) => {
        const b = { style: BorderStyle.SINGLE, size: 4, color: color || "D9D9D9" };
        return { top: b, bottom: b, left: b, right: b };
      };

      const noBorders = () => {
        const n = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        return { top: n, bottom: n, left: n, right: n, insideHorizontal: n, insideVertical: n };
      };

      const logoDataUrl = await urlToBase64(logoPsinet);
      const coverDataUrl = await urlToBase64(logoEdificio);
      const logoBytes = dataUrlToUint8Array(logoDataUrl);
      const logoType = logoDataUrl.startsWith("data:image/png") ? "png" : "jpg";
      const coverBytes = dataUrlToUint8Array(coverDataUrl);
      const coverType = coverDataUrl.startsWith("data:image/png") ? "png" : "jpg";
      const revisadoPor = revisadoText.split("\n").map(s => s.trim()).filter(Boolean);

      const buildEvidenceImgParagraph = (photo: string | null, width: number, height: number) => {
        if (!photo) {
          return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin evidencia cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] });
        }
        const bytes = dataUrlToUint8Array(photo);
        const type = photo.startsWith("data:image/png") ? "png" : "jpg";
        return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width, height }, type })] });
      };

      // Igual que buildEvidenceImgParagraph, pero resuelve tanto dataURL locales como
      // fotos ya subidas a Supabase Storage (fetch funciona para ambos esquemas).
      const buildRemoteEvidenceImgParagraph = async (photo: string | null, width: number, height: number) => {
        if (!photo) {
          return new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "(Sin evidencia cargada)", italics: true, color: "999999", size: 18, font: "Arial" })] });
        }
        const { bytes, type } = await resolveImageBytes(photo);
        return new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width, height }, type })] });
      };

      const fechaEncabezado = rangoFechas ? formatFechaLarga(rangoFechas.fin) : formatFechaLarga(new Date().toISOString().split("T")[0]);

      // Encabezado repetido en todas las páginas, incluida la portada.
      const header = new Header({
        children: [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [2059, 4493, 2808],
            borders: cellBorders("000000"),
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 22, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: logoBytes, transformation: { width: 110, height: 36 }, type: logoType })] })],
                  }),
                  new TableCell({
                    width: { size: 48, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Reporte", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Reporte de entrega de turno", size: 20, font: "Arial", bold: true })] }),
                    ],
                  }),
                  new TableCell({
                    width: { size: 30, type: WidthType.PERCENTAGE },
                    borders: cellBorders("000000"),
                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                    verticalAlign: VerticalAlign.CENTER,
                    children: [
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "N° Contrato:", size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: contrato, size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Versión: " + version, size: 15, font: "Arial" })] }),
                      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fechaEncabezado, size: 15, font: "Arial" })] }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const rangoSubtitulo = rangoFechas
        ? `SEMANA ${formatFechaPunto(rangoFechas.inicio)} AL ${formatFechaPunto(rangoFechas.fin)}`
        : "";

      const coverChildren: docx.Paragraph[] = [
        new Paragraph({ children: [new ImageRun({ data: coverBytes, transformation: { width: 496, height: 372 }, type: coverType })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `INFORME DE CIERRE DE TURNO ${letraTurno}`, size: 44, font: "Arial", bold: true, color: "1F5C85" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rangoSubtitulo, size: 34, font: "Arial", bold: true, color: "1F5C85" })] }),
      ];

      const coverTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [7000, 2360],
        borders: noBorders(),
        rows: [
          new TableRow({
            children: [
              new TableCell({ width: { size: 7000, type: WidthType.DXA }, borders: noBorders(), children: coverChildren }),
              new TableCell({
                width: { size: 2360, type: WidthType.DXA },
                borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, left: { style: BorderStyle.SINGLE, size: 18, color: ORANGE } },
                margins: { left: 300, top: 100, bottom: 100 },
                children: [
                  new Paragraph({ children: [new TextRun({ text: fechaEncabezado, size: 24, font: "Arial", color: "000000" })] }),
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
              }),
            ],
          }),
        ],
      });

      const descripcionParrafo = rangoFechas
        ? `Este documento detalla las actividades realizadas durante las jornadas entre el ${formatFechaLarga(rangoFechas.inicio)} al ${formatFechaLarga(rangoFechas.fin)}, correspondientes al Turno ${letraTurno} en ${faena}.`
        : `Este documento detalla las actividades realizadas durante el Turno ${letraTurno} en ${faena}.`;

      const personalTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        layout: TableLayoutType.FIXED,
        columnWidths: [3900, 5460],
        borders: noBorders(),
        rows: personalSemana.map(p => new TableRow({
          children: [
            new TableCell({ width: { size: 3900, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ text: p.nombre, bullet: { level: 0 } })] }),
            new TableCell({ width: { size: 5460, type: WidthType.DXA }, borders: noBorders(), children: [new Paragraph({ text: p.cargo })] }),
          ],
        })),
      });

      let seccionNum = 1;

      const seccion1: (docx.Paragraph | docx.Table)[] = [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Descripción de actividades realizas en el turno`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
        new Paragraph({ children: [new TextRun({ text: descripcionParrafo, font: "Arial" })] }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: `Personal de turno ${letraTurno} - ${turnoLabel}.`, color: BLUE, size: 24, font: "Arial", bold: true })] }),
        new Paragraph({ text: "" }),
        personalTable,
      ];

      const seccion2: (docx.Paragraph | docx.Table)[] = [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Actividades realizadas en el turno.`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
      ];

      for (const [idx, dia] of diasSeleccionados.entries()) {
        seccion2.push(
          new Paragraph({ text: "", pageBreakBefore: idx > 0 }),
          new Paragraph({ children: [new TextRun({ text: `Fecha:  ${formatFechaLarga(dia.fecha)} (Turno ${dia.turno === 'noche' ? 'Noche' : 'Día'})`, underline: {}, bold: true, size: 26, font: "Arial" })] }),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Actividades Diarias.", color: BLUE, size: 22, font: "Arial", bold: true })] }),
          ...dia.actividades.filter(a => a.trim()).map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Observaciones.", color: BLUE, size: 22, font: "Arial", bold: true })] }),
          ...dia.observaciones.filter(o => o.trim()).map(o => new Paragraph({ text: o, bullet: { level: 0 } })),
        );

        // Evidencia fotográfica cargada en el informe diario de este día (incluye noche).
        for (const block of dia.evidenceBlocks) {
          const usablePhotos = block.photos.filter((p): p is string => Boolean(p));
          if (usablePhotos.length === 0) continue;
          const colWidth = Math.floor(9360 / usablePhotos.length);
          const cells = await Promise.all(usablePhotos.map(async photo => {
            const { bytes, type } = await resolveImageBytes(photo);
            return new TableCell({
              width: { size: colWidth, type: WidthType.DXA },
              borders: cellBorders(),
              margins: { top: 100, bottom: 100, left: 100, right: 100 },
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: 260, height: 195 }, type })] })],
            });
          }));
          const captionRow = new TableRow({
            children: [new TableCell({
              columnSpan: usablePhotos.length,
              borders: cellBorders(),
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: block.title, bold: true, size: 20, font: "Arial" })] })],
            })],
          });
          seccion2.push(
            new Paragraph({ text: "" }),
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              layout: TableLayoutType.FIXED,
              columnWidths: usablePhotos.map(() => colWidth),
              rows: [new TableRow({ children: cells }), captionRow],
            }),
          );
        }

        // Bloque fijo Vertiv: solo se agrega en los días de Turno Noche.
        if (dia.turno === 'noche') {
          const carroRows: docx.TableRow[] = [];
          for (const [pairIdx, [leftTitle, rightTitle]] of VERTIV_CARROS.entries()) {
            const leftPhoto = dia.vertivCarroPhotos[pairIdx * 2] ?? null;
            const rightPhoto = dia.vertivCarroPhotos[pairIdx * 2 + 1] ?? null;
            carroRows.push(new TableRow({
              cantSplit: false,
              children: [
                new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [await buildRemoteEvidenceImgParagraph(leftPhoto, 280, 190)] }),
                new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [await buildRemoteEvidenceImgParagraph(rightPhoto, 280, 190)] }),
              ],
            }));
            carroRows.push(new TableRow({
              cantSplit: false,
              children: [
                new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: leftTitle, bold: true, size: 22, font: "Arial" })] })] }),
                new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: cellBorders(), margins: { top: 60, bottom: 60, left: 80, right: 80 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rightTitle, bold: true, size: 22, font: "Arial" })] })] }),
              ],
            }));
          }

          seccion2.push(
            new Paragraph({ text: "", pageBreakBefore: true }),
            new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: `${VERTIV_TITLE} — ${formatFechaLarga(dia.fecha)}`, color: BLUE, size: 24, font: "Arial", bold: true })] }),
            new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [4680, 4680], rows: carroRows }),
          );

          for (const [itemIdx, item] of VERTIV_ITEMS.entries()) {
            const photo = dia.vertivItemPhotos[itemIdx] ?? null;
            seccion2.push(
              new Paragraph({ text: "", pageBreakBefore: true }),
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                layout: TableLayoutType.FIXED,
                columnWidths: [9360],
                rows: [
                  new TableRow({ cantSplit: false, children: [new TableCell({ borders: cellBorders(), margins: { top: 120, bottom: 120, left: 120, right: 120 }, children: [await buildRemoteEvidenceImgParagraph(photo, 560, 330)] })] }),
                  new TableRow({ cantSplit: false, children: [new TableCell({ borders: cellBorders(), margins: { top: 100, bottom: 100, left: 120, right: 120 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: item, bold: true, size: 26, color: BLUE, font: "Arial" })] })] })] }),
                ],
              }),
            );
          }
        }
      }


      const pendientesFiltradas = actividadesPendientes.filter(a => a.trim());
      const seccion3: docx.Paragraph[] = pendientesFiltradas.length ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Actividades pendientes.`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
        ...pendientesFiltradas.map(a => new Paragraph({ text: a, bullet: { level: 0 } })),
      ] : [];

      const seccionesImg: (docx.Paragraph | docx.Table)[] = seccionesImagenes.flatMap(seccion => {
        const usablePhotos = seccion.photos.filter((p): p is string => Boolean(p));
        if (!seccion.title.trim() && usablePhotos.length === 0) return [];
        const rows: docx.TableRow[] = [];
        for (let i = 0; i < usablePhotos.length; i += 2) {
          const pair = usablePhotos.slice(i, i + 2);
          const colWidth = Math.floor(100 / pair.length);
          rows.push(new TableRow({
            children: pair.map(photo => {
              const bytes = dataUrlToUint8Array(photo);
              const type = photo.startsWith("data:image/png") ? "png" : "jpg";
              return new TableCell({
                width: { size: colWidth, type: WidthType.PERCENTAGE },
                borders: cellBorders(),
                margins: { top: 100, bottom: 100, left: 100, right: 100 },
                children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: bytes, transformation: { width: pair.length === 1 ? 500 : 280, height: pair.length === 1 ? 375 : 210 }, type })] })],
              });
            }),
          }));
        }
        return [
          new Paragraph({ text: "", pageBreakBefore: true }),
          new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) ${seccion.title || "Imágenes"}`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
          ...(usablePhotos.length ? [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, layout: TableLayoutType.FIXED, columnWidths: [4680, 4680], rows })] : [new Paragraph({ children: [new TextRun({ text: "(Sin imágenes cargadas)", italics: true, color: "999999", font: "Arial" })] })]),
        ];
      });

      const camionetasValidas = camionetas.filter(c => c.placa.trim() || c.antes || c.despues);
      const seccionCamionetas: (docx.Paragraph | docx.Table)[] = camionetasValidas.length ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${seccionNum++}) Camionetas`, color: BLUE, size: 26, font: "Arial", bold: true })] }),
        ...camionetasValidas.flatMap(c => [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            columnWidths: [4680, 4680],
            rows: [
              new TableRow({
                children: [
                  new TableCell({ borders: cellBorders(), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "ANTES", bold: true, font: "Arial" })] })] }),
                  new TableCell({ borders: cellBorders(), children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "DESPUES", bold: true, font: "Arial" })] })] }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [buildEvidenceImgParagraph(c.antes, 280, 210)] }),
                  new TableCell({ borders: cellBorders(), margins: { top: 100, bottom: 100, left: 100, right: 100 }, children: [buildEvidenceImgParagraph(c.despues, 280, 210)] }),
                ],
              }),
              new TableRow({
                children: [new TableCell({
                  columnSpan: 2,
                  borders: cellBorders(),
                  children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.placa || "—", bold: true, font: "Arial" })] })],
                })],
              }),
            ],
          }),
          new Paragraph({ text: "" }),
        ]),
      ] : [];

      const filasReportabilidad = reportabilidad.filter(r => r.sitio.trim() || r.equipo.trim());
      const seccionReportabilidad: (docx.Paragraph | docx.Table)[] = filasReportabilidad.length ? [
        new Paragraph({ text: "", pageBreakBefore: true }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          layout: TableLayoutType.FIXED,
          rows: [
            new TableRow({
              children: ["Sitio", "Nombre del Equipo", "Último Mtto. (hrs)", "Fecha Último Mtto.", "Próximo Mtto. (hrs)", "Fecha Estimada Próx. Mtto.", "Horas Registradas", "Horas Restantes", "Horas desde Último Mtto."]
                .map(text => new TableCell({ borders: cellBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, bold: true, size: 15, font: "Arial" })] })] })),
            }),
            ...filasReportabilidad.map(r => new TableRow({
              children: [r.sitio, r.equipo, r.ultimoMtto, r.fechaUltimoMtto, r.proximoMtto, r.fechaProximoMtto, r.horasRegistradas, r.horasRestantes, r.horasDesdeUltimo]
                .map(text => new TableCell({ borders: cellBorders(), margins: { top: 60, bottom: 60, left: 60, right: 60 }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text, size: 15, font: "Arial" })] })] })),
            })),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `Reportabilidad de GG fecha ${fechaEncabezado}.`, bold: true, font: "Arial" })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "REPORTABILIDAD GG", bold: true, color: BLUE, size: 26, font: "Arial" })] }),
      ] : [];

      const comentariosFiltrados = comentariosFinales.filter(c => c.trim());
      const seccionComentarios: docx.Paragraph[] = comentariosFiltrados.length ? [
        new Paragraph({ text: "" }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Comentarios Adicionales.", color: BLUE, size: 24, font: "Arial", bold: true })] }),
        ...comentariosFiltrados.map(c => new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c, bold: true, color: BLUE, font: "Arial" })] })),
      ] : [];

      const doc = new Document({
        styles: { default: { document: { run: { font: "Arial", size: 21 } } } },
        sections: [
          {
            properties: { page: { size: { width: 12240, height: 15840 } } },
            headers: { default: header },
            children: [
              coverTable,
              ...seccion1,
              ...seccion2,
              ...seccion3,
              ...seccionesImg,
              ...seccionCamionetas,
              ...seccionReportabilidad,
              ...seccionComentarios,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const nombreArchivo = rangoFechas
        ? `Reporte de cierre semana al ${formatFechaPunto(rangoFechas.inicio)} al ${formatFechaPunto(rangoFechas.fin)} -Turno ${letraTurno}.docx`
        : `Reporte de cierre -Turno ${letraTurno}.docx`;
      saveAs(blob, nombreArchivo);
      showToast(`Documento generado exitosamente: ${nombreArchivo}`);
    } catch (err) {
      console.error(err);
      showToast("Error al generar el archivo de cierre.", true);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen text-[#222] font-sans pb-24">
      <header className="site-header">
        <div className="site-header__inner">
          <div className="flex items-center gap-4 py-3 px-5 flex-1 min-w-0">
            <div className="site-header__plate">
              <img src={logoPsinet} alt="PSINet" />
            </div>
            <div className="min-w-0">
              <div className="site-header__title font-display font-bold text-xl leading-tight truncate">
                Informe de Cierre Semanal
              </div>
              <div className="site-header__meta text-xs truncate">
                Une los 7 días del turno en un solo documento
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

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <FileStack size={18} className="panel__summary-icon" strokeWidth={2.2} />
            1. Datos generales del cierre
          </summary>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Faena</label>
              <input type="text" value={faena} onChange={e => setFaena(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Letra de turno</label>
              <input type="text" value={letraTurno} onChange={e => setLetraTurno(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">N° Contrato</label>
              <input type="text" value={contrato} onChange={e => setContrato(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Versión</label>
              <input type="text" value={version} onChange={e => setVersion(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Creado por</label>
              <select
                value={creadoNombre}
                onChange={e => {
                  const selected = CREADO_POR_OPTIONS.find(option => option.nombre === e.target.value);
                  if (selected) { setCreadoNombre(selected.nombre); setCreadoCargo(selected.cargo); }
                }}
                className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm"
              >
                {CREADO_POR_OPTIONS.map(option => (
                  <option key={option.nombre} value={option.nombre}>{option.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Revisado por (uno por línea)</label>
              <textarea value={revisadoText} onChange={e => setRevisadoText(e.target.value)} rows={2} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Autorizado por</label>
                <input type="text" value={autorizadoNombre} onChange={e => setAutorizadoNombre(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-xs text-[#6B6B6B] font-bold mb-1">Cargo</label>
                <input type="text" value={autorizadoCargo} onChange={e => setAutorizadoCargo(e.target.value)} className="w-full p-2 border border-[#DCE1E6] rounded-md text-sm" />
              </div>
            </div>
          </div>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <CalendarRange size={18} className="panel__summary-icon" strokeWidth={2.2} />
            2. Días incluidos — Turno Día ({selectedIds.length}/{META_DIAS})
          </summary>
          <p className="text-xs text-gray-500 mb-3">El Informe de Cierre solo consolida los informes de Turno Día; los de Turno Noche no se muestran aquí.</p>
          {ordenadosPorFecha.length === 0 ? (
            <p className="text-sm text-gray-500">No hay borradores de Turno Día guardados todavía. Genera algunos Informes Diarios primero.</p>
          ) : (
            <div className="space-y-2">
              {ordenadosPorFecha.map(dia => {
                const checked = selectedIds.includes(dia.id);
                return (
                  <button
                    type="button"
                    key={dia.id}
                    onClick={() => toggleDia(dia.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-md border text-left transition-colors ${checked ? 'border-[#0E4660] bg-[#E8F1FB]' : 'border-[#DCE1E6] bg-white hover:bg-gray-50'}`}
                  >
                    {checked ? <CircleCheckBig size={18} className="text-[#0E4660] flex-shrink-0" /> : <Circle size={18} className="text-gray-300 flex-shrink-0" />}
                    <span className="text-sm font-bold text-[#0E4660]">{formatFechaLarga(dia.fecha)}</span>
                    <span className="text-xs text-gray-500">Turno {dia.letraTurno} · Día</span>
                  </button>
                );
              })}
            </div>
          )}
          {ordenadosPorFecha.length < META_DIAS && (
            <p className="text-[11px] text-[#856404] bg-[#FFF3CD] border border-[#FFEEBA] rounded-md px-2 py-1 mt-3">
              Aún no tienes los {META_DIAS} días de Turno Día de la semana guardados como borrador. Puedes generar el cierre igualmente con los días disponibles.
            </p>
          )}
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ListTodo size={18} className="panel__summary-icon" strokeWidth={2.2} />
            3. Actividades pendientes
          </summary>
          <p className="text-xs text-gray-500 mb-3">Tareas que quedan pendientes para el siguiente turno.</p>
          <div className="space-y-2">
            {actividadesPendientes.map((a, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={a} onChange={e => updatePendiente(i, e.target.value)} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" placeholder="Ej: Verificar movimiento de carro LTE_11" />
                <button type="button" onClick={() => removePendiente(i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addPendiente} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-2 flex items-center gap-1"><Plus size={13} /> Agregar pendiente</button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <ImagePlus size={18} className="panel__summary-icon" strokeWidth={2.2} />
            4. Secciones de imágenes (Radios, Bodega, etc.)
          </summary>
          <p className="text-xs text-gray-500 mb-3">Agrega las secciones de imágenes que solicita el informe de cierre. Puedes renombrarlas, agregar más fotos o crear nuevas secciones. Soporta pegar con Ctrl+V al hacer clic en una casilla.</p>
          <div className="space-y-4">
            {seccionesImagenes.map(seccion => (
              <div key={seccion.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={seccion.title}
                    onChange={e => updateSeccionTitle(seccion.id, e.target.value)}
                    placeholder="Título de la sección"
                    className="flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]"
                  />
                  <button type="button" onClick={() => removeSeccionImagenes(seccion.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
                </div>
                <div className="overflow-x-auto pb-2">
                  <div className="flex flex-nowrap gap-2.5 items-center min-w-max">
                    {seccion.photos.map((src, pi) => (
                      <div
                        key={pi}
                        onClick={() => setSelectedPhotoSlot({ type: 'seccion', id: seccion.id, photoIndex: pi })}
                        className={`photo-slot w-[130px] min-w-[130px] text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedPhotoSlot?.type === 'seccion' && selectedPhotoSlot.id === seccion.id && selectedPhotoSlot.photoIndex === pi ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                      >
                        <button type="button" onClick={e => { e.stopPropagation(); removeFotoDeSeccion(seccion.id, pi); }} className="absolute top-0.5 right-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700">
                          <Trash2 size={12} />
                        </button>
                        <img src={src || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='75'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"} alt="" className="w-[110px] h-[82px] object-cover rounded mx-auto mb-1 bg-gray-100" />
                        <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignFotoSeccion(e.target.files[0], seccion.id, pi)} className="text-[9px] w-full" />
                      </div>
                    ))}
                    <button type="button" onClick={() => addFotoASeccion(seccion.id)} className="btn-outline text-[#0E4660] px-2.5 py-1.5 rounded text-xs font-bold hover:bg-[#d5e7f8]">+ Foto</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addSeccionImagenes} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar sección de imágenes</button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Car size={18} className="panel__summary-icon" strokeWidth={2.2} />
            5. Camionetas (antes / después)
          </summary>
          <div className="space-y-3">
            {camionetas.map(c => (
              <div key={c.id} className="border border-dashed border-[#DCE1E6] rounded-lg p-3 bg-[#fafbfc]">
                <div className="flex items-center gap-2 mb-2">
                  <input type="text" value={c.placa} onChange={e => updateCamionetaPlaca(c.id, e.target.value)} placeholder="Patente (ej: VCTF84)" className="flex-1 font-bold text-sm p-1.5 border border-[#DCE1E6] rounded text-[#0E4660]" />
                  <button type="button" onClick={() => removeCamioneta(c.id)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  {(['antes', 'despues'] as const).map(cual => (
                    <div
                      key={cual}
                      onClick={() => setSelectedPhotoSlot({ type: cual === 'antes' ? 'camionetaAntes' : 'camionetaDespues', id: c.id })}
                      className={`photo-slot text-center text-[10px] text-gray-500 relative border-2 border-dashed rounded-md p-1 bg-white cursor-pointer ${selectedPhotoSlot?.id === c.id && selectedPhotoSlot.type === (cual === 'antes' ? 'camionetaAntes' : 'camionetaDespues') ? 'border-[#0E4660] ring-2 ring-[#0E4660]/20' : 'border-gray-300'}`}
                    >
                      <span className="block text-[10px] font-bold uppercase text-gray-500 mb-1">{cual}</span>
                      <img src={c[cual] || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='90'%3E%3Crect width='100%25' height='100%25' fill='%23eee'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23aaa' font-size='9'%3ESin foto%3C/text%3E%3C/svg%3E"} alt={cual} className="w-full h-[90px] object-cover rounded mb-1 bg-gray-100" />
                      <input type="file" accept="image/*" onChange={e => e.target.files?.[0] && assignCamionetaFoto(e.target.files[0], c.id, cual)} className="text-[9px] w-full" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button type="button" onClick={addCamioneta} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar camioneta</button>
        </details>

        <details className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <Wrench size={18} className="panel__summary-icon" strokeWidth={2.2} />
            6. Reportabilidad GG (opcional)
          </summary>
          <p className="text-xs text-gray-500 mb-3">Tabla de mantenimiento de generadores por sitio. Déjala vacía si no aplica esta semana.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs min-w-[900px]">
              <thead>
                <tr className="bg-gray-50">
                  {["Sitio", "Equipo", "Últ. Mtto (hrs)", "Fecha Últ. Mtto", "Próx. Mtto (hrs)", "Fecha Próx. Mtto", "Hrs. Registradas", "Hrs. Restantes", "Hrs. desde Últ.", ""].map(h => (
                    <th key={h} className="p-1 text-left font-bold text-[#6B6B6B]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reportabilidad.map(r => (
                  <tr key={r.id} className="border-b border-gray-100">
                    {(['sitio', 'equipo', 'ultimoMtto', 'fechaUltimoMtto', 'proximoMtto', 'fechaProximoMtto', 'horasRegistradas', 'horasRestantes', 'horasDesdeUltimo'] as const).map(field => (
                      <td key={field} className="p-1">
                        <input type="text" value={r[field]} onChange={e => updateReportabilidadCell(r.id, field, e.target.value)} className="w-full p-1 border border-[#DCE1E6] rounded text-xs" />
                      </td>
                    ))}
                    <td className="p-1">
                      <button type="button" onClick={() => removeReportabilidadRow(r.id)} className="bg-red-50 text-red-700 p-1.5 rounded hover:bg-red-100"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addReportabilidadRow} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-3 flex items-center gap-1"><Plus size={13} /> Agregar fila</button>
        </details>

        <details open className="panel p-5">
          <summary className="panel__summary font-display font-bold text-lg">
            <MessageSquareText size={18} className="panel__summary-icon" strokeWidth={2.2} />
            7. Comentarios adicionales
          </summary>
          <div className="space-y-2">
            {comentariosFinales.map((c, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={c} onChange={e => updateComentario(i, e.target.value)} className="flex-1 p-2 border border-[#DCE1E6] rounded-md text-sm" />
                <button type="button" onClick={() => removeComentario(i)} className="bg-red-50 text-red-700 p-2 rounded-md hover:bg-red-100"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addComentario} className="btn-outline text-[#0E4660] px-3 py-1.5 rounded-md text-xs font-bold hover:bg-[#d5e7f8] mt-2 flex items-center gap-1"><Plus size={13} /> Agregar comentario</button>
        </details>

        <div className="action-zone">
          <button
            onClick={generarInformeCierre}
            disabled={isGenerating}
            className="btn-primary-field w-full text-white py-3.5 px-6 font-bold text-base rounded-md disabled:!bg-[#9fb3bd] disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (<><Loader2 size={18} className="animate-spin" /> Generando informe de cierre...</>) : "Generar Informe de Cierre"}
          </button>
        </div>
      </main>

      {toastMessage && (
        <div className={`toast-anim fixed bottom-5 left-1/2 -translate-x-1/2 ${toastMessage.isError ? 'bg-red-800' : 'bg-[#0E4660]'} text-white py-3 px-5 rounded-lg text-sm shadow-lg z-50`}>
          {toastMessage.text}
        </div>
      )}
    </div>
  );
}
