// lib/fichaExport.js
// Genera la "Ficha técnica de espacio" (Excel) para una oficina/espacio puntual,
// con datos reales del catálogo + hallazgos ya capturados por el técnico — sin
// redactar contenido de ingeniería nuevo, solo presentando lo que ya está en la app.
//
// Reglas de negocio replicadas aquí (deben mantenerse consistentes con las
// REGLAS/CIELO_RASO_* de public/app.js — si cambian allá, cambiar aquí también):
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const ALTURA_PISO = 2.40; // confirmado por Alejandro para los pisos de este edificio

const TIPO_LABEL = {
  Muro: 'Muro', Ventana: 'Ventana', 'Antepecho+Ventana': 'Antepecho + ventana',
  MuroVentanaBaño: 'Muro con ventana (baño)', Rejilla: 'Rejilla de fachada',
  Buitron: 'Buitrón', Columna: 'Columna', Mesón: 'Mesón', Jardinera: 'Jardinera',
  Piso: 'Piso', CieloRaso: 'Cielo raso',
};

const INK = 'FF12202B', MUTED = 'FF55707D', BLUE = 'FF1F6F8B';
const HEAD_FILL = 'FFE7EEEF', BAND_FILL = 'FFF7EFC9', PENDING_FILL = 'FFECE4F6';
const BORDER_COLOR = 'FFAEB9BE';
const thinBorder = { style: 'thin', color: { argb: BORDER_COLOR } };
const ALL_BORDERS = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };

function cantidadCalculada(h, catalogoItem) {
  if (!h) return { valor: null, unidad: '—', pendiente: true, razon: 'elemento sin capturar todavía en esta oficina' };
  if (h.tipo_elemento === 'Muro' && (h.severidad_key === 'panete' || h.severidad_key === 'grieta_grave')) {
    const lon = catalogoItem && typeof catalogoItem.longitud_m === 'number' ? catalogoItem.longitud_m : (catalogoItem && catalogoItem.altura_fija);
    const longitud = catalogoItem && typeof catalogoItem.longitud_m === 'number' ? catalogoItem.longitud_m : null;
    if (longitud != null) {
      const altura = (catalogoItem && catalogoItem.altura_fija) || ALTURA_PISO;
      return { valor: Math.round(longitud * altura * 100) / 100, unidad: 'm²', pendiente: false };
    }
    return { valor: null, unidad: 'm²', pendiente: true, razon: 'longitud no registrada en el catálogo' };
  }
  if (h.capitulo && h.capitulo.includes('1.7')) return { valor: 1, unidad: 'und', pendiente: false };
  if (h.tipo_elemento === 'Piso') return { valor: null, unidad: 'm²', pendiente: true, razon: 'área base no medida en campo' };
  if (h.tipo_elemento === 'CieloRaso') return { valor: null, unidad: 'm²', pendiente: true, razon: 'pendiente de medir en campo (misma área que el piso)' };
  if (h.tipo_elemento === 'Mesón') return { valor: null, unidad: 'm', pendiente: true, razon: 'profundidad/longitud de mesón no capturada' };
  if (h.tipo_elemento === 'Columna') return { valor: null, unidad: '—', pendiente: true, razon: 'no existe regla de intervención definida para columnas' };
  if (h.cantidad != null) return { valor: h.cantidad, unidad: h.unidad || '—', pendiente: false };
  return { valor: null, unidad: h.unidad || '—', pendiente: true, razon: 'sin regla de cálculo aplicable' };
}

function findPlanImage(planosDir, oficina) {
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const p = path.join(planosDir, `${oficina}.${ext}`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function imageSize(buf) {
  // PNG: ancho/alto en bytes 16-24; JPEG requiere parseo de segmentos SOF.
  if (buf[0] === 0x89 && buf[1] === 0x50) { // PNG
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xC0 && marker <= 0xC3) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    const len = buf.readUInt16BE(i + 2);
    i += 2 + len;
  }
  return { width: 800, height: 600 }; // fallback razonable
}

function band(ws, row, text, lastCol, fill = BAND_FILL, ink = INK) {
  ws.mergeCells(row, 1, row, lastCol);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = { bold: true, size: 12, color: { argb: ink } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  c.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(row).height = 22;
}

async function buildFichaWorkbook({ oficina, piso, catalogo, hallazgos, fotosDir, planosDir }) {
  const LAST_COL = 9; // A..I

  const elementos = catalogo.filter(e => e.oficina === oficina || e.secundaria === oficina);
  if (elementos.length === 0) {
    throw Object.assign(new Error(`No hay elementos de catálogo para "${oficina}"`), { status: 404 });
  }
  const codigos = new Set(elementos.map(e => e.id));
  const hallazgosOficina = hallazgos.filter(h => codigos.has(h.codigo_elemento) && String(h.piso_real) === String(piso));
  const hallazgoPorCodigo = {};
  hallazgosOficina.forEach(h => { hallazgoPorCodigo[h.codigo_elemento] = h; });

  const merged = elementos.map(el => ({ catalogo: el, hallazgo: hallazgoPorCodigo[el.id] || null }));
  const conHallazgo = merged.filter(m => m.hallazgo);
  const sinCapturar = merged.filter(m => !m.hallazgo);
  const afectados = conHallazgo.filter(m => m.hallazgo.estado !== 'Bien');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Ficha_${oficina}`.slice(0, 31));
  ws.views = [{ showGridLines: false }];
  ws.columns = [
    { width: 16 }, { width: 32 }, { width: 11 }, { width: 11 }, { width: 11 },
    { width: 11 }, { width: 11 }, { width: 9 }, { width: 11 },
  ];

  // --- Encabezado -----------------------------------------------------
  ws.getCell('A1').value = 'FICHA TÉCNICA DE ESPACIO';
  ws.getCell('A1').font = { bold: true, size: 16, color: { argb: INK } };
  ws.getCell('A2').value = 'Cámara de Comercio de Pereira — diagnóstico de acabados y elementos no estructurales (datos reales de campo)';
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: MUTED } };

  const fechas = hallazgosOficina.map(h => h.fecha).filter(Boolean).sort();
  const fechaVisita = fechas.length ? fechas[0].slice(0, 10) : 'No registrada';
  const meta = [['CÓDIGO', oficina], ['PISO', `Piso ${piso}`], ['FECHA DE VISITA', fechaVisita]];
  meta.forEach(([label, value], i) => {
    const col = 1 + i * 2;
    const lc = ws.getCell(4, col); lc.value = label; lc.font = { bold: true, size: 9, color: { argb: MUTED } };
    const vc = ws.getCell(4, col + 1); vc.value = value; vc.font = { bold: true, size: 11, color: { argb: i === 0 ? BLUE : INK } };
  });

  let row = 6;
  band(ws, row, 'PLANO DEL ESPACIO', LAST_COL);
  row += 1;
  const planPath = findPlanImage(planosDir, oficina);
  if (planPath) {
    const buf = fs.readFileSync(planPath);
    const ext = planPath.endsWith('.png') ? 'png' : 'jpeg';
    const { width: pw, height: ph } = imageSize(buf);
    const targetW = 560;
    const targetH = Math.round(ph * (targetW / pw));
    const imgId = wb.addImage({ buffer: buf, extension: ext });
    ws.addImage(imgId, { tl: { col: 0, row: row - 1 }, ext: { width: targetW, height: targetH } });
    row += Math.ceil(targetH / 20) + 1;
  } else {
    ws.getCell(row, 1).value = 'Plano no disponible todavía para esta oficina.';
    ws.getCell(row, 1).font = { italic: true, size: 10, color: { argb: MUTED } };
    row += 2;
  }

  // --- Registro ---------------------------------------------------------
  band(ws, row, 'REGISTRO  ·  patología e intervención por elemento afectado (con fotografía real de campo)', LAST_COL);
  row += 2;

  for (const el of afectados) {
    const h = el.hallazgo, c = el.catalogo;
    const nombre = TIPO_LABEL[h.tipo_elemento] || h.tipo_elemento;
    const cant = cantidadCalculada(h, c);
    const capitulo = h.capitulo || '(sin capítulo asignado — pendiente de definición técnica)';

    const blockStart = row;
    const fotos = h.fotos || [];
    if (fotos.length) {
      const fotoPath = path.join(fotosDir, path.basename(fotos[0]));
      if (fs.existsSync(fotoPath)) {
        const buf = fs.readFileSync(fotoPath);
        const imgId = wb.addImage({ buffer: buf, extension: 'jpeg' });
        ws.addImage(imgId, { tl: { col: 0, row: blockStart - 1 }, ext: { width: 112, height: 84 } });
      }
    }
    const blockH = 6;

    ws.mergeCells(blockStart, 2, blockStart, LAST_COL);
    const head = ws.getCell(blockStart, 2);
    head.value = `${h.codigo_elemento}  —  ${nombre}`;
    head.font = { bold: true, size: 12, color: { argb: INK } };

    const partes = [];
    const sev = h.severidad_label || h.estado;
    if (sev) partes.push(`Hallazgo: ${sev}.`);
    if (h.patologia) partes.push(`Patología: ${h.patologia}.`);
    if (h.material) partes.push(`Material: ${h.material}.`);
    if (h.intervencion) partes.push(`Intervención: ${h.intervencion}.`);
    else if (!h.capitulo) partes.push('Intervención: sin regla definida en el sistema — pendiente de definición técnica.');
    const cantTxt = cant.pendiente ? `Pendiente (${cant.razon})` : `${cant.valor} ${cant.unidad}`;
    partes.push(`Cantidad / capítulo: ${capitulo}  ·  ${cantTxt}.`);

    ws.mergeCells(blockStart + 1, 2, blockStart + blockH - 1, LAST_COL);
    const body = ws.getCell(blockStart + 1, 2);
    body.value = partes.join(' ');
    body.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' };
    body.font = { size: 10.5, color: { argb: INK } };

    for (let rr = blockStart; rr < blockStart + blockH; rr++) {
      for (let cc = 1; cc <= LAST_COL; cc++) {
        ws.getCell(rr, cc).border = ALL_BORDERS;
        if (cant.pendiente) ws.getCell(rr, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PENDING_FILL } };
      }
    }
    row += blockH + 1;
  }

  if (sinCapturar.length) {
    ws.getCell(row, 1).value = 'Elementos de esta oficina aún sin capturar en la app: ' +
      sinCapturar.map(m => m.catalogo.id).join(', ') + '.';
    ws.getCell(row, 1).font = { italic: true, size: 9.5, color: { argb: MUTED } };
    row += 2;
  }

  // --- Actividades y cantidades ------------------------------------------
  band(ws, row, 'ACTIVIDADES Y CANTIDADES A EJECUTAR  ·  alimenta la memoria y el presupuesto', LAST_COL, 'FFDCEFE1', 'FF1E6B41');
  row += 1;
  ws.getCell(row, 1).value = 'CÓDIGO'; ws.getCell(row, 2).value = 'ELEMENTO';
  ws.mergeCells(row, 3, row, 7);
  ws.getCell(row, 3).value = 'CAPÍTULO / ACTIVIDAD';
  ws.getCell(row, 8).value = 'UND.'; ws.getCell(row, 9).value = 'CANTIDAD';
  for (let cc = 1; cc <= LAST_COL; cc++) {
    const cell = ws.getCell(row, cc);
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_FILL } };
    cell.border = ALL_BORDERS;
  }
  row += 1;

  for (const el of afectados) {
    const h = el.hallazgo, c = el.catalogo;
    const nombre = TIPO_LABEL[h.tipo_elemento] || h.tipo_elemento;
    const cant = cantidadCalculada(h, c);
    ws.getCell(row, 1).value = h.codigo_elemento; ws.getCell(row, 1).font = { bold: true, color: { argb: BLUE }, size: 10 };
    ws.getCell(row, 2).value = nombre; ws.getCell(row, 2).font = { size: 10 };
    ws.mergeCells(row, 3, row, 7);
    ws.getCell(row, 3).value = h.capitulo || '(sin capítulo asignado)';
    ws.getCell(row, 3).font = { size: 9.5 };
    ws.getCell(row, 8).value = cant.unidad; ws.getCell(row, 8).font = { size: 10 };
    const cantCell = ws.getCell(row, 9);
    if (cant.pendiente) {
      cantCell.value = 'Pendiente';
      cantCell.font = { italic: true, size: 9, color: { argb: MUTED } };
      cantCell.alignment = { horizontal: 'right' };
      cantCell.note = cant.razon;
      for (let cc = 1; cc <= LAST_COL; cc++) ws.getCell(row, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PENDING_FILL } };
    } else {
      cantCell.value = cant.valor;
      cantCell.font = { bold: true, size: 10 };
      cantCell.numFmt = '0.00';
    }
    for (let cc = 1; cc <= LAST_COL; cc++) ws.getCell(row, cc).border = ALL_BORDERS;
    row += 1;
  }

  // --- Configuración de impresión ----------------------------------------
  ws.pageSetup = {
    orientation: 'landscape', paperSize: 1, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printArea: `A1:${String.fromCharCode(64 + LAST_COL)}${row}`,
  };

  return wb;
}

module.exports = { buildFichaWorkbook };
