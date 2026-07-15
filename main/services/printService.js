// =============================================================================
// main/services/printService.js — الطباعة عبر نافذة مخفية
// Builds check HTML positioned from the bank's print_template (mm coordinates),
// loads it into an offscreen BrowserWindow, and calls Electron's native print.
// Also prints arbitrary report HTML for the Reports screen.
// The renderer only triggers printing and receives { ok } / { ok:false, error }.
// =============================================================================

const { BrowserWindow, webContents } = require('electron');

// Default field layout (mm from top-right corner, RTL) used when the bank has
// no custom template. Coordinates are illustrative and adjustable in the editor.
// Single-bank Jordan check. Coordinates are right_mm/top_mm from the TOP-RIGHT
// corner (RTL origin). Fields: payee name, written amount, numeric amount.
const DEFAULT_TEMPLATE = {
  payee_ar: { right_mm: 20, top_mm: 32, font_size: 12, font_family: 'Cairo', direction: 'rtl', text_align: 'right', enabled: true },
  amount_ar_words: { right_mm: 60, top_mm: 39, font_size: 11, font_family: 'Cairo', direction: 'rtl', text_align: 'right', enabled: true },
  amount: { right_mm: 50, top_mm: 45, font_size: 13, font_family: 'Arial', direction: 'ltr', text_align: 'left', enabled: true },
};

const CHECK_W_MM = 165;
const CHECK_H_MM = 82;

function parseTemplate(raw) {
  try {
    const t = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
    const merged = {};
    for (const key of Object.keys(DEFAULT_TEMPLATE)) {
      merged[key] = { ...DEFAULT_TEMPLATE[key], ...(t[key] || {}) };
    }
    return merged;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

function fmtAmount(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function splitAmount(amount) {
  const v = Math.abs(Number(amount) || 0);
  const dinars = Math.floor(v);
  const fils = Math.round((v - dinars) * 1000);
  const filsStr = fils > 0 ? String(fils).padStart(3, '0') : '';
  return { dinars, filsStr };
}

// Absolute positioning from the top-right corner (right/top in mm).
function fieldStyle(f) {
  return (
    `position:absolute;top:${f.top_mm}mm;right:${f.right_mm}mm;` +
    `font-size:${f.font_size}pt;` +
    `direction:${f.direction};` +
    `text-align:${f.text_align};` +
    `font-family:'${f.font_family}','Tahoma',sans-serif;`
  );
}

function fieldStyleModule2(f) {
  return (
    `position:absolute;top:${f.y_mm}mm;right:${f.x_mm}mm;` +
    `font-size:${f.font_size}pt;` +
    `font-weight:${f.font_weight || '400'};` +
    `color:${f.color || '#000'};` +
    `direction:${f.direction || 'rtl'};` +
    `text-align:${f.align || 'right'};` +
    `font-family:'${f.font_family || 'Cairo'}','Tahoma',sans-serif;`
  );
}

function buildCheckHtml(check, offsets = { x: 0, y: 0 }) {
  if (check.template && check.template.fields) {
    const t = check.template;
    const width = t.width_mm || CHECK_W_MM;
    const height = t.height_mm || CHECK_H_MM;
    const { dinars, filsStr } = splitAmount(check.amount);
    
    const values = {
      payee: check.payee_ar || '',
      amount_words: check.amount_words_ar || '',
      amount_number: fmtAmount(dinars) || '',
      amount_fils: filsStr || '',
      date: check.due_date || '',
      purpose: check.notes || '',
      cheque_number: check.check_number || '',
      crossed: check.is_crossed ? '// &Co' : '',
    };
    
    const parts = [];
    for (const f of t.fields) {
      if (f.visible && values[f.field_name] != null && values[f.field_name] !== '') {
        parts.push(`<div class="check-field" style="${fieldStyleModule2(f)}">${escapeHtml(values[f.field_name])}</div>`);
      }
    }
    
    return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
      <style>
        @page { size: ${width}mm ${height}mm; margin: 0; }
        html { margin: 0; padding: 0; }
        body { 
          margin: 0; padding: 0; 
          width: ${width}mm; height: ${height}mm; 
          overflow: hidden; position: relative; 
          left: ${offsets.x}mm; top: ${offsets.y}mm;
        }
        .check-field { position: absolute; white-space: nowrap; }
      </style></head>
      <body>${parts.join('')}</body></html>`;
  }
  const t = parseTemplate(check.print_template);
  const width = check.check_width_mm || CHECK_W_MM;
  const height = check.check_height_mm || CHECK_H_MM;

  const values = {
    payee_ar: escapeHtml(check.payee_ar),
    amount_ar_words: escapeHtml(check.amount_words_ar),
    amount: fmtAmount(check.amount),
  };

  const parts = [];
  for (const key of Object.keys(DEFAULT_TEMPLATE)) {
    const f = t[key];
    if (f && f.enabled && values[key] != null && values[key] !== '') {
      parts.push(`<div class="check-field" style="${fieldStyle(f)}">${values[key]}</div>`);
    }
  }

  // Exact physical page: body sized to the check, no margins, no scaling.
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
    <style>
      @page { size: ${width}mm ${height}mm; margin: 0; }
      html { margin: 0; padding: 0; }
      body { 
        margin: 0; padding: 0; 
        width: ${width}mm; height: ${height}mm; 
        overflow: hidden; position: relative; 
        left: ${offsets.x}mm; top: ${offsets.y}mm;
      }
      .check-field { position: absolute; white-space: nowrap; }
    </style></head>
    <body>${parts.join('')}</body></html>`;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  );
}

// Load HTML into an offscreen window and print it, then destroy the window.
function printHtml(html, printOpts) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: false, sandbox: true },
    });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    win.webContents.once('did-finish-load', () => {
      win.webContents.print(
        { silent: false, printBackground: true, ...printOpts },
        (success, failureReason) => {
          try { win.destroy(); } catch { /* ignore */ }
          if (success) return resolve({ ok: true });
          if (/cancel/i.test(failureReason || '')) return resolve({ ok: false, canceled: true });
          return resolve({ ok: false, error: failureReason || 'تعذّرت الطباعة' });
        }
      );
    });
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      try { win.destroy(); } catch { /* ignore */ }
      resolve({ ok: false, error: desc || `load error ${code}` });
    });
  });
}

async function printCheck(check, opts = {}) {
  const html = buildCheckHtml(check, { x: opts.offsetX || 0, y: opts.offsetY || 0 });
  const width = check.check_width_mm || CHECK_W_MM;
  const height = check.check_height_mm || CHECK_H_MM;
  return printHtml(html, {
    silent: opts.silent !== undefined ? opts.silent : false,
    printBackground: true,
    landscape: false,
    scaleFactor: 100,
    margins: { marginType: 'none' },
    pageSize: { width: Math.round(width * 1000), height: Math.round(height * 1000) },
    // Use the configured cheque printer if set; otherwise let Windows show the dialog.
    ...(opts.deviceName ? { deviceName: opts.deviceName, silent: true } : {}),
  });
}

async function printReportHtml(payload, settings, opts = {}) {
  const html = payload && payload.html ? payload.html : buildReportFallback(payload, settings);
  return printHtml(html, {
    landscape: false,
    ...(opts.deviceName ? { deviceName: opts.deviceName, silent: true } : {}),
  });
}

// If the renderer didn't pass ready HTML, render a simple table from rows.
function buildReportFallback(payload, settings) {
  const rows = (payload.rows || [])
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.check_number)}</td><td>${escapeHtml(r.payee_ar)}</td>` +
        `<td>${fmtAmount(r.amount)}</td><td>${escapeHtml(r.due_date)}</td></tr>`
    )
    .join('');
  return `<!doctype html><html dir="rtl"><head><meta charset="utf-8">
    <style>body{font-family:'Cairo',Tahoma,sans-serif;padding:20px}
    h1{text-align:center}table{width:100%;border-collapse:collapse}
    td,th{border:1px solid #ccc;padding:6px;text-align:right}</style></head>
    <body><h1>${escapeHtml(settings.company_name || 'شهد وهبة للتمور')}</h1>
    <h3>${escapeHtml(payload.title || 'تقرير')}</h3>
    <table><thead><tr><th>رقم الشيك</th><th>المستفيد</th><th>المبلغ</th><th>الاستحقاق</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
}

// Return available system printers (name + isDefault).
function getPrinters() {
  try {
    // webContents.getAllWebContents() may be empty at call time — use a temp window.
    const all = BrowserWindow.getAllWindows();
    if (all.length > 0) return all[0].webContents.getPrintersAsync();
    // Fallback: spawn a hidden window, get printers, destroy it.
    return new Promise((resolve) => {
      const tmp = new BrowserWindow({ show: false, webPreferences: { sandbox: false } });
      tmp.loadURL('about:blank');
      tmp.webContents.once('did-finish-load', async () => {
        const printers = await tmp.webContents.getPrintersAsync();
        tmp.destroy();
        resolve(printers);
      });
    });
  } catch (err) {
    console.error('[printService] getPrinters error:', err.message);
    return Promise.resolve([]);
  }
}

module.exports = { printCheck, printReportHtml, buildCheckHtml, getPrinters };
