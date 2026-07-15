// =============================================================================
// renderer/screens/PrintPreview.jsx — معاينة وطباعة الشيك (Module 2, Flow B)
// Route: /checks/:id/print
// Loads the check + the default template from 002_templates.sql schema.
// Fields use: field_name (not field_key), x_mm from RIGHT (RTL), y_mm from TOP.
// Printing: native Electron dialog via print:check IPC.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, Modal, useToast } from '../components/Common.jsx';
import { formatAmount } from '../lib/format.js';
import { MM_TO_PX, fieldStyle } from '../lib/templateFields.js';

export default function PrintPreview() {
  const { id } = useParams();   // route: /checks/:id/print
  const navigate = useNavigate();
  const toast = useToast();

  const [check, setCheck] = useState(null);
  const [tmpl, setTmpl] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const [c, t] = await Promise.all([
        window.api.checks.get(id),
        window.api.templates.getDefault(),
      ]);
      setCheck(c);
      // t has: { id, name, width_mm, height_mm, background_image, is_default, fields: [...] }
      // each field: { id, template_id, field_name, x_mm, y_mm, font_family, font_size,
      //               font_weight, color, align, direction, visible }
      if (t) {
        setTmpl(t);
      } else {
        // No template in DB yet — use bare canvas
        setTmpl({ width_mm: 165, height_mm: 82, name: 'لا يوجد قالب', fields: [] });
      }
    })();
  }, [id]);

  if (!check || !tmpl) return <Spinner />;

  const { width_mm, height_mm } = tmpl;
  const fields = (tmpl.fields || []).filter((f) => f.visible);

  // Map check data to the canonical field_name values in template_fields table
  const fieldData = {
    payee: check.payee_ar || '',
    amount_words: check.amount_words_ar || '',
    amount_number: formatAmount(check.amount),
    date: check.due_date || '',
    purpose: check.notes || '',
    cheque_number: check.check_number || '',
    crossed: '',
  };

  const doPrint = async () => {
    setPrinting(true);
    try {
      const res = await window.api.print.check(id);
      if (res.ok || res.canceled) {
        setConfirmOpen(true);
      } else {
        toast(res.error || 'تعذّرت الطباعة', 'error');
      }
    } finally {
      setPrinting(false);
    }
  };

  const confirmYes = async () => {
    setConfirmOpen(false);
    await window.api.checks.markPrinted(id);
    toast('تم تسجيل الطباعة', 'success');
    navigate('/checks');
  };

  const confirmNo = () => {
    setConfirmOpen(false);
    toast('يمكنك إعادة المحاولة', 'info');
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">معاينة الطباعة</h1>
        <button className="btn-secondary" onClick={() => navigate(-1)}>← رجوع</button>
      </div>

      {/* To-scale on-screen preview */}
      <div className="card inline-block overflow-auto">
        <div
          className="relative bg-white"
          style={{
            width: width_mm * MM_TO_PX,
            height: height_mm * MM_TO_PX,
            border: '1px dashed #94a3b8',
            overflow: 'hidden',
          }}
        >
          {tmpl.background_image && (
            <img
              src={tmpl.background_image}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
            />
          )}

          {/* Render each visible field at its saved mm coordinates (x_mm from RIGHT, y_mm from TOP) */}
          {fields.map((f) => (
            <div key={f.id || f.field_name} style={fieldStyle(f, 'px')}>
              {fieldData[f.field_name] ?? ''}
            </div>
          ))}

          {/* Empty state when no template is configured */}
          {fields.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-400 text-sm">
              <span className="text-2xl">🧾</span>
              <span>لا يوجد قالب طباعة مضبوط</span>
              <button
                className="mt-2 text-sky-500 underline text-xs"
                onClick={() => navigate('/templates')}
              >
                اذهب إلى القوالب لإنشاء قالب
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-3 text-sm text-slate-500">
        القالب: {tmpl.name || '—'} — المقاس: {width_mm}×{height_mm} مم — رقم الشيك: {check.check_number}
      </p>

      {/* Print action */}
      <div className="card mt-4 max-w-md">
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          🖨️ تغذية يدوية: ضع ورقة الشيك في الطابعة ثم اضغط طباعة
        </p>
        <button className="btn-primary w-full" disabled={printing} onClick={doPrint}>
          {printing ? 'جارٍ فتح نافذة الطباعة...' : '🖨️ طباعة'}
        </button>
      </div>

      <Modal open={confirmOpen} title="تأكيد الطباعة" onClose={confirmNo} size="sm">
        <p className="mb-4 text-slate-700">هل تمت الطباعة بنجاح؟</p>
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={confirmNo}>لا</button>
          <button className="btn-primary" onClick={confirmYes}>نعم</button>
        </div>
      </Modal>
    </div>
  );
}
