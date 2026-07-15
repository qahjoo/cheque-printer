// =============================================================================
// renderer/components/BankTemplateEditor.jsx — محرّر مواضع حقول الشيك (بنك واحد)
// Single-bank, RTL-origin editor. The check canvas is drawn to scale (default
// 165×82mm). Each field is draggable; dragging updates right_mm / top_mm
// (measured from the TOP-RIGHT corner). Live values show "يمين / أعلى" in mm.
// Used by both the standalone "قوالب الطباعة" screen and Settings → إعدادات الطباعة.
// =============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from './Common.jsx';

const MM_TO_PX = 3.78; // ~96dpi

// Canonical fields (right/top in mm from the top-right corner) + editor metadata.
const FIELD_DEFS = {
  payee_ar: {
    label: 'اسم مستحق الشيك', sample: 'شركة الفرات لتعبئة التمور',
    right_mm: 20, top_mm: 32, font_size: 12, font_family: 'Cairo', direction: 'rtl', text_align: 'right', enabled: true,
  },
  amount_ar_words: {
    label: 'المبلغ كتابة', sample: 'مائة وخمسون ديناراً وخمسمائة فلس',
    right_mm: 60, top_mm: 39, font_size: 11, font_family: 'Cairo', direction: 'rtl', text_align: 'right', enabled: true,
  },
  amount: {
    label: 'المبلغ رقم', sample: '150.500',
    right_mm: 50, top_mm: 45, font_size: 13, font_family: 'Arial', direction: 'ltr', text_align: 'left', enabled: true,
  },
};

const round1 = (n) => Math.round(n * 10) / 10;

export default function BankTemplateEditor({ onSaved }) {
  const toast = useToast();
  const [bank, setBank] = useState(null);
  const [dims, setDims] = useState({ w: 165, h: 82 });
  const [fields, setFields] = useState(FIELD_DEFS);
  const [selected, setSelected] = useState('payee_ar');
  const [dragging, setDragging] = useState(null);
  const canvasRef = useRef(null);

  const loadBank = useCallback(async () => {
    const banks = await window.api.banks.list();
    const b = (banks || [])[0];
    if (!b) return;
    setBank(b);
    setDims({ w: b.check_width_mm || 165, h: b.check_height_mm || 82 });
    let tmpl = {};
    try {
      tmpl = JSON.parse(b.print_template || '{}');
    } catch {
      tmpl = {};
    }
    const merged = {};
    for (const key of Object.keys(FIELD_DEFS)) {
      merged[key] = { ...FIELD_DEFS[key], ...(tmpl[key] || {}) };
    }
    setFields(merged);
  }, []);

  useEffect(() => { loadBank(); }, [loadBank]);

  const onMouseDown = (key) => (e) => {
    e.preventDefault();
    setSelected(key);
    setDragging(key);
  };

  const onMouseMove = useCallback(
    (e) => {
      if (!dragging || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      // RTL origin: right measured from the RIGHT edge, top from the top edge.
      const rightPx = rect.right - e.clientX;
      const topPx = e.clientY - rect.top;
      const right_mm = round1(Math.max(0, Math.min(dims.w, rightPx / MM_TO_PX)));
      const top_mm = round1(Math.max(0, Math.min(dims.h, topPx / MM_TO_PX)));
      setFields((f) => ({ ...f, [dragging]: { ...f[dragging], right_mm, top_mm } }));
    },
    [dragging, dims]
  );

  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const updateField = (key, patch) => setFields((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  const save = async () => {
    if (!bank) return;
    const clean = {};
    for (const [k, v] of Object.entries(fields)) {
      clean[k] = {
        right_mm: Number(v.right_mm), top_mm: Number(v.top_mm),
        font_size: Number(v.font_size), font_family: v.font_family,
        direction: v.direction, text_align: v.text_align, enabled: !!v.enabled,
      };
    }
    const res = await window.api.banks.saveTemplate({ id: bank.id, template: clean });
    if (res.ok) {
      toast('تم حفظ مواضع الحقول', 'success');
      onSaved && onSaved();
    } else {
      toast(res.error || 'تعذّر الحفظ', 'error');
    }
  };

  if (!bank) return <p className="text-slate-400">لا يوجد بنك مُعرَّف.</p>;

  const sel = fields[selected];

  return (
    <div className="flex flex-wrap gap-6">
      {/* Canvas — to scale, RTL origin (right edge = 0) */}
      <div>
        <p className="mb-2 text-sm text-slate-500">
          اسحب الحقول لضبط مواقعها (المقاس الفعلي {dims.w}×{dims.h} مم — الأصل من الزاوية العليا اليمنى)
        </p>
        <div
          ref={canvasRef}
          className="relative border-2 border-dashed border-slate-300 bg-slate-50"
          style={{ width: dims.w * MM_TO_PX, height: dims.h * MM_TO_PX }}
        >
          {Object.entries(fields).map(([key, f]) =>
            f.enabled ? (
              <div
                key={key}
                onMouseDown={onMouseDown(key)}
                className={`absolute cursor-move whitespace-nowrap rounded px-1 ${
                  selected === key ? 'bg-sky-200 ring-2 ring-sky-500' : 'bg-white/70 hover:bg-sky-100'
                }`}
                style={{
                  top: f.top_mm * MM_TO_PX,
                  right: f.right_mm * MM_TO_PX,
                  fontSize: f.font_size,
                  direction: f.direction,
                  textAlign: f.text_align,
                  fontFamily: `${f.font_family}, Tahoma, sans-serif`,
                }}
              >
                {f.sample}
              </div>
            ) : null
          )}
        </div>
        {/* Live mm readout for the selected field */}
        <div className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-emerald-300" dir="rtl">
          {sel.label} — يمين: {round1(sel.right_mm)} mm | أعلى: {round1(sel.top_mm)} mm
        </div>
      </div>

      {/* Controls */}
      <div className="w-72 space-y-4">
        <div>
          <label className="label">الحقل</label>
          <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {Object.entries(fields).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sel.enabled} onChange={(e) => updateField(selected, { enabled: e.target.checked })} />
          إظهار الحقل عند الطباعة
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">من اليمين (مم)</label>
            <input type="number" step="0.1" className="input" value={sel.right_mm} onChange={(e) => updateField(selected, { right_mm: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">من الأعلى (مم)</label>
            <input type="number" step="0.1" className="input" value={sel.top_mm} onChange={(e) => updateField(selected, { top_mm: Number(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className="label">حجم الخط</label>
          <input type="number" className="input" value={sel.font_size} onChange={(e) => updateField(selected, { font_size: Number(e.target.value) })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">الخط</label>
            <select className="input" value={sel.font_family} onChange={(e) => updateField(selected, { font_family: e.target.value })}>
              <option value="Cairo">Cairo</option>
              <option value="Arial">Arial</option>
            </select>
          </div>
          <div>
            <label className="label">الاتجاه</label>
            <select className="input" value={sel.direction} onChange={(e) => updateField(selected, { direction: e.target.value })}>
              <option value="rtl">من اليمين لليسار</option>
              <option value="ltr">من اليسار لليمين</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">المحاذاة</label>
          <select className="input" value={sel.text_align} onChange={(e) => updateField(selected, { text_align: e.target.value })}>
            <option value="right">يمين</option>
            <option value="left">يسار</option>
          </select>
        </div>
        <button className="btn-primary w-full" onClick={save}>💾 حفظ مواضع الحقول</button>
      </div>
    </div>
  );
}
