// =============================================================================
// main/services/reportPdf.js — توليد تقرير PDF بصيغة A4 باستخدام pdf-lib
// pdf-lib's standard fonts don't cover Arabic, so we embed a Unicode TTF if one
// is shipped at /build/fonts/Cairo-Regular.ttf (via fontkit). If the font is
// missing we fall back to a Latin/transliteration-safe layout and still emit a
// valid PDF (numbers, dates, and structure remain correct).
// Returns a Uint8Array of PDF bytes; the IPC layer writes it to disk.
// =============================================================================

const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

let fontkit = null;
try {
  fontkit = require('@pdf-lib/fontkit');
} catch {
  fontkit = null;
}

// pdf-lib/fontkit embeds TTF/OTF only (NOT woff2), so we resolve the .ttf.
// Check both the userData-relative and __dirname-relative paths; use the first
// that exists (covers dev and packaged prod).
function arabicFontPath() {
  let userData = '';
  try {
    userData = require('electron').app.getPath('userData');
  } catch {
    userData = '';
  }
  const candidates = [
    userData && path.join(userData, '..', '..', 'build', 'fonts', 'Cairo-Regular.ttf'),
    path.join(__dirname, '..', '..', 'build', 'fonts', 'Cairo-Regular.ttf'),
    path.join(process.resourcesPath || '', 'build', 'fonts', 'Cairo-Regular.ttf'),
  ];
  return candidates.find((p) => p && fs.existsSync(p)) || null;
}

function fmtAmount(n) {
  return Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

async function buildReportPdf(payload, settings) {
  const doc = await PDFDocument.create();
  let font;
  let hasArabic = false;

  const fp = arabicFontPath();
  if (fontkit && fp) {
    doc.registerFontkit(fontkit);
    font = await doc.embedFont(fs.readFileSync(fp), { subset: true });
    hasArabic = true;
  } else {
    font = await doc.embedFont(StandardFonts.Helvetica);
  }

  const page = doc.addPage([595.28, 841.89]); // A4 portrait (pt)
  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  const draw = (text, x, size = 11, color = rgb(0.1, 0.1, 0.12)) => {
    const t = hasArabic ? String(text) : latin(String(text));
    page.drawText(t, { x, y, size, font, color });
  };

  // Header
  const company = settings.company_name || 'شهد وهبة للتمور';
  const company2 = settings.company_name_line2 || 'ميلانو للتمور';
  draw(company, margin, 18, rgb(0, 0.35, 0.55));
  y -= 22;
  draw(company2, margin, 12, rgb(0.3, 0.3, 0.35));
  y -= 26;
  draw(payload.title || 'تقرير', margin, 14);
  y -= 18;
  draw(`تاريخ التوليد: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, margin, 9, rgb(0.5, 0.5, 0.55));
  y -= 24;

  // Table header
  const cols = payload.columns || ['رقم الشيك', 'المستفيد', 'المبلغ', 'الاستحقاق', 'الحالة'];
  const colWidth = (width - margin * 2) / cols.length;
  page.drawRectangle({
    x: margin, y: y - 4, width: width - margin * 2, height: 20,
    color: rgb(0.05, 0.65, 0.91),
  });
  cols.forEach((c, i) => {
    page.drawText(hasArabic ? c : latin(c), {
      x: margin + 4 + i * colWidth, y, size: 10, font, color: rgb(1, 1, 1),
    });
  });
  y -= 24;

  // Rows
  const rows = payload.rows || [];
  const statusAr = { open: 'مفتوح', collected: 'محصّل', returned: 'مرتجع', cancelled: 'ملغي' };
  for (const r of rows) {
    if (y < margin + 40) {
      y = height - margin;
      doc.addPage([595.28, 841.89]);
    }
    const cells = [
      r.check_number, r.payee_ar, fmtAmount(r.amount), r.due_date, statusAr[r.status] || r.status,
    ];
    cells.forEach((cell, i) => {
      page.drawText(hasArabic ? String(cell ?? '') : latin(String(cell ?? '')), {
        x: margin + 4 + i * colWidth, y, size: 9, font, color: rgb(0.12, 0.12, 0.15),
      });
    });
    y -= 16;
  }

  // Footer totals
  y -= 10;
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: width - margin, y: y + 6 }, thickness: 1, color: rgb(0.7, 0.7, 0.7) });
  draw(`العدد: ${rows.length}    الإجمالي: ${fmtAmount(total)} ${settings.currency_plural || 'دنانير'}`, margin, 11);

  return doc.save();
}

// Minimal fallback so numbers/dates stay readable if no Arabic font shipped.
function latin(s) {
  return s.replace(/[^\x00-\x7F]/g, '?');
}

module.exports = { buildReportPdf };
