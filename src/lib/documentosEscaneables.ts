// Fotos que normalmente son documentación en papel (ART, bloqueo/LOTO, permisos, charlas, checklist,
// registros, actas, procedimientos, órdenes de trabajo…): en esas casillas el botón "Escanear" se
// destaca para usar el escáner (recorta y endereza la hoja). En las demás sigue disponible, más discreto.
const PALABRAS = new RegExp('\\b(' + [
  'art', 'ast', 'pts', 'loto', 'bloqueo', 'permiso', 'charla', 'check ?list', 'registro', 'formulario', 'firma', 'acta',
  'autorizaci[oó]n', 'hoja', 'planilla', 'documento', 'documentaci[oó]n', 'inspecci[oó]n', 'procedimiento', 'protocolo',
  'informe', 'orden de trabajo', 'ot', 'certificado', 'licencia', 'evaluaci[oó]n', 'autoevaluaci[oó]n', 'encuesta',
  'bit[aá]cora', 'libro', 'gu[ií]a', 'declaraci[oó]n', 'pauta', 'instructivo', 'reporte',
].join('|') + ')\\b', 'i');

export const pareceDocumento = (...textos: (string | null | undefined)[]) =>
  textos.some(t => !!t && PALABRAS.test(t.normalize('NFC')));
