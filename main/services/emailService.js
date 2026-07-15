// =============================================================================
// main/services/emailService.js — قناة البريد الإلكتروني (اختيارية) عبر nodemailer
// SMTP settings come from .env only. Sends an HTML table of the due checks with
// the company name header. Returns { ok, error } for the reminder log.
// =============================================================================

const nodemailer = require('nodemailer');

function isConfigured() {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_TO
  );
}

function makeTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: (parseInt(process.env.SMTP_PORT, 10) || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function fmtAmount(n) {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 3 });
}

function buildHtml(checks, days, settings) {
  const company = settings.company_name || 'شهد وهبة للتمور';
  const company2 = settings.company_name_line2 || '';
  const logo = settings.company_logo
    ? `<img src="${settings.company_logo}" alt="logo" style="height:56px"/>`
    : '';
  const rows = checks
    .map(
      (c, i) => `
      <tr style="background:${i % 2 ? '#f8fafc' : '#ffffff'}">
        <td style="padding:8px;border:1px solid #e2e8f0">${c.check_number}</td>
        <td style="padding:8px;border:1px solid #e2e8f0">${c.payee_ar}</td>
        <td style="padding:8px;border:1px solid #e2e8f0">${fmtAmount(c.amount)} ${c.currency}</td>
        <td style="padding:8px;border:1px solid #e2e8f0">${c.due_date}</td>
        <td style="padding:8px;border:1px solid #e2e8f0">${c.bank_name_ar || ''}</td>
      </tr>`
    )
    .join('');
  const total = checks.reduce((s, c) => s + c.amount, 0);

  return `
  <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;color:#0f172a;max-width:720px;margin:auto">
    <div style="text-align:center;margin-bottom:16px">
      ${logo}
      <h2 style="margin:6px 0">${company}</h2>
      ${company2 ? `<div style="color:#475569">${company2}</div>` : ''}
    </div>
    <p>لديك <strong>${checks.length}</strong> شيك مستحق خلال <strong>${days}</strong> أيام:</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead>
        <tr style="background:#0ea5e9;color:#fff">
          <th style="padding:8px;border:1px solid #0284c7">رقم الشيك</th>
          <th style="padding:8px;border:1px solid #0284c7">المستفيد</th>
          <th style="padding:8px;border:1px solid #0284c7">المبلغ</th>
          <th style="padding:8px;border:1px solid #0284c7">الاستحقاق</th>
          <th style="padding:8px;border:1px solid #0284c7">البنك</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="font-weight:bold;background:#f1f5f9">
          <td colspan="2" style="padding:8px;border:1px solid #e2e8f0">الإجمالي</td>
          <td colspan="3" style="padding:8px;border:1px solid #e2e8f0">${fmtAmount(total)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px">نظام الشيكات — رسالة تلقائية</p>
  </div>`;
}

async function sendReminder(checks, days, settings) {
  if (!isConfigured()) return { ok: false, error: 'SMTP غير مهيأ' };
  try {
    const transport = makeTransport();
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_TO,
      subject: `تذكير: ${checks.length} شيكات مستحقة خلال ${days} أيام`,
      html: buildHtml(checks, days, settings),
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { isConfigured, sendReminder };
