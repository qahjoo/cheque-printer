// =============================================================================
// main/services/reportExcel.js — توليد تقرير Excel باستخدام ExcelJS
// Formatted RTL sheet: merged company header row, styled column headers, data
// rows, and a totals footer. Writes directly to the chosen file path.
// =============================================================================

const ExcelJS = require('exceljs');

const STATUS_AR = { open: 'مفتوح', collected: 'محصّل', returned: 'مرتجع', cancelled: 'ملغي' };

async function buildReportExcel(payload, settings, filePath) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'نظام الشيكات';
  wb.created = new Date();

  const ws = wb.addWorksheet('التقرير', {
    views: [{ rightToLeft: true }],
    pageSetup: { paperSize: 9, orientation: 'portrait' },
  });

  const columns = payload.columns || ['رقم الشيك', 'المستفيد', 'المبلغ', 'تاريخ الإصدار', 'الاستحقاق', 'الحالة'];
  const colCount = columns.length;

  // Row 1: merged company header
  ws.mergeCells(1, 1, 1, colCount);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${settings.company_name || 'شهد وهبة للتمور'} — ${settings.company_name_line2 || 'ميلانو للتمور'}`;
  titleCell.font = { size: 16, bold: true, color: { argb: 'FF0284C7' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Row 2: report title + generated date
  ws.mergeCells(2, 1, 2, colCount);
  const subCell = ws.getCell(2, 1);
  subCell.value = `${payload.title || 'تقرير'} — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  subCell.font = { size: 11, italic: true, color: { argb: 'FF64748B' } };
  subCell.alignment = { horizontal: 'center' };

  // Row 3: column headers
  const headerRow = ws.getRow(3);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF0284C7' } } };
  });
  headerRow.height = 20;

  // Data rows
  const rows = payload.rows || [];
  let rowIdx = 4;
  for (const r of rows) {
    const row = ws.getRow(rowIdx);
    const values = [
      r.check_number,
      r.payee_ar,
      Number(r.amount) || 0,
      r.issue_date,
      r.due_date,
      STATUS_AR[r.status] || r.status,
    ];
    values.slice(0, colCount).forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.alignment = { horizontal: 'right' };
      if (rowIdx % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
    // amount column formatting (index 3 -> column 3)
    row.getCell(3).numFmt = '#,##0.000';
    rowIdx += 1;
  }

  // Footer totals
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const footRow = ws.getRow(rowIdx + 1);
  footRow.getCell(1).value = 'الإجمالي';
  footRow.getCell(1).font = { bold: true };
  footRow.getCell(2).value = `العدد: ${rows.length}`;
  footRow.getCell(3).value = total;
  footRow.getCell(3).numFmt = '#,##0.000';
  footRow.getCell(3).font = { bold: true };

  // Column widths
  ws.columns = columns.map(() => ({ width: 20 }));

  await wb.xlsx.writeFile(filePath);
  return { ok: true };
}

module.exports = { buildReportExcel };
