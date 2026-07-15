// =============================================================================
// renderer/screens/TemplateDesigner.jsx — محرّر إحداثيات القالب (/templates/designer/:id)
// Same drag mechanics as the original coordinate editor, but bound to the
// templates/template_fields model. RTL origin: x_mm from the right edge.
// Edits name, dimensions, background image, and every field's position/style.
// =============================================================================

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Spinner, useToast } from '../components/Common.jsx';
import { MM_TO_PX, FIELD_META, FIELD_ORDER, fieldStyle } from '../lib/templateFields.js';

const round1 = (n) => Math.round(n * 10) / 10;

// Ensure all canonical fields exist (fill missing as hidden defaults).
function normalizeFields(fields) {
  const byName = Object.fromEntries((fields || []).map((f) => [f.field_name, f]));
  return FIELD_ORDER.map((name) => byName[name] || {
    field_name: name, x_mm: 20, y_mm: 20, font_family: 'Cairo', font_size: 12,
    font_weight: '400', color: '#000000', align: 'right', direction: 'rtl', visible: false,
  });
}

export default function TemplateDesigner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [meta, setMeta] = useState(null); // {name,width_mm,height_mm,background_image}
  const [fields, setFields] = useState(null);
  const [selected, setSelected] = useState('payee');
  const [dragging, setDragging] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const canvasRef = useRef(null);

  const load = useCallback(async () => {
    const t = await window.api.templates.get(Number(id));
    if (!t) return;
    setMeta({ name: t.name, width_mm: t.width_mm, height_mm: t.height_mm, background_image: t.background_image || null });
    setFields(normalizeFields(t.fields));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const onMouseMove = useCallback((e) => {
    if (!dragging || !canvasRef.current || !meta) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const rightPx = rect.right - e.clientX - dragOffset.x;
    const topPx = e.clientY - rect.top - dragOffset.y;
    const x_mm = round1(Math.max(0, Math.min(meta.width_mm, rightPx / MM_TO_PX)));
    const y_mm = round1(Math.max(0, Math.min(meta.height_mm, topPx / MM_TO_PX)));
    setFields((fs) => fs.map((f) => (f.field_name === dragging ? { ...f, x_mm, y_mm } : f)));
  }, [dragging, meta, dragOffset]);
  const onMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
  }, [onMouseMove, onMouseUp]);

  if (!meta || !fields) return <Spinner />;

  const sel = fields.find((f) => f.field_name === selected);
  const updateSel = (patch) => setFields((fs) => fs.map((f) => (f.field_name === selected ? { ...f, ...patch } : f)));

  const uploadBg = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => setMeta((m) => ({ ...m, background_image: r.result }));
    r.readAsDataURL(file);
  };

  const save = async () => {
    await window.api.templates.update({
      id: Number(id), name: meta.name, width_mm: Number(meta.width_mm),
      height_mm: Number(meta.height_mm), background_image: meta.background_image,
    });
    const r = await window.api.templates.saveFields({
      templateId: Number(id),
      fields: fields.map((f) => ({
        field_name: f.field_name, x_mm: Number(f.x_mm), y_mm: Number(f.y_mm),
        font_family: f.font_family, font_size: Number(f.font_size), font_weight: String(f.font_weight),
        color: f.color, align: f.align, direction: f.direction, visible: !!f.visible,
      })),
    });
    if (r.ok) toast('تم حفظ القالب', 'success');
    else toast(r.error || 'تعذّر الحفظ', 'error');
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">مصمم القالب</h1>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => navigate('/templates')}>رجوع</button>
          <button className="btn-primary" onClick={save}>💾 حفظ القالب</button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Canvas */}
        <div className="flex-shrink-0 overflow-auto max-w-full pb-4">
          <p className="mb-2 text-sm text-slate-500">اسحب الحقول (المقاس {meta.width_mm}×{meta.height_mm} مم — الأصل من الزاوية العليا اليمنى)</p>
          <div
            ref={canvasRef}
            className="relative border-2 border-dashed border-slate-300 bg-slate-50"
            style={{ width: meta.width_mm * MM_TO_PX, height: meta.height_mm * MM_TO_PX }}
          >
            {meta.background_image && (
              <img src={meta.background_image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
            )}
            {fields.filter((f) => f.visible).map((f) => (
              <div
                key={f.field_name}
                onMouseDown={(e) => { 
                  e.preventDefault(); 
                  setSelected(f.field_name); 
                  setDragging(f.field_name); 
                  const rect = e.currentTarget.getBoundingClientRect();
                  setDragOffset({ x: rect.right - e.clientX, y: e.clientY - rect.top });
                }}
                style={{ ...fieldStyle(f, 'px'), cursor: 'move', outline: selected === f.field_name ? '2px solid #0ea5e9' : 'none', background: 'rgba(255,255,255,.6)' }}
              >
                {(FIELD_META[f.field_name] || {}).sample || f.field_name}
              </div>
            ))}
          </div>
          <div className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-emerald-300" dir="rtl">
            {(FIELD_META[selected] || {}).label} — يمين: {round1(sel.x_mm)} mm | أعلى: {round1(sel.y_mm)} mm
          </div>
        </div>

        {/* Controls */}
        <div className="w-72 flex-shrink-0 space-y-3">
          <div className="card space-y-3">
            <div><label className="label">اسم القالب</label><input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">عرض مم</label><input type="number" className="input" value={meta.width_mm} onChange={(e) => setMeta({ ...meta, width_mm: e.target.value })} /></div>
              <div><label className="label">ارتفاع مم</label><input type="number" className="input" value={meta.height_mm} onChange={(e) => setMeta({ ...meta, height_mm: e.target.value })} /></div>
            </div>
            <div>
              <label className="label">صورة خلفية الشيك</label>
              <input type="file" accept="image/*" onChange={uploadBg} />
              {meta.background_image && <button className="btn-ghost mt-1 text-xs" onClick={() => setMeta({ ...meta, background_image: null })}>إزالة الصورة</button>}
            </div>
          </div>

          <div className="card space-y-3">
            <div>
              <label className="label">الحقل</label>
              <select className="input" value={selected} onChange={(e) => setSelected(e.target.value)}>
                {FIELD_ORDER.map((n) => <option key={n} value={n}>{(FIELD_META[n] || {}).label || n}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={sel.visible} onChange={(e) => updateSel({ visible: e.target.checked })} /> مرئي
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">من اليمين مم</label><input type="number" step="0.1" className="input" value={sel.x_mm} onChange={(e) => updateSel({ x_mm: Number(e.target.value) })} /></div>
              <div><label className="label">من الأعلى مم</label><input type="number" step="0.1" className="input" value={sel.y_mm} onChange={(e) => updateSel({ y_mm: Number(e.target.value) })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">حجم الخط</label><input type="number" className="input" value={sel.font_size} onChange={(e) => updateSel({ font_size: Number(e.target.value) })} /></div>
              <div><label className="label">الوزن</label>
                <select className="input" value={sel.font_weight} onChange={(e) => updateSel({ font_weight: e.target.value })}>
                  <option value="400">عادي</option><option value="700">عريض</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">الخط</label>
                <select className="input" value={sel.font_family} onChange={(e) => updateSel({ font_family: e.target.value })}>
                  <option value="Cairo">Cairo</option><option value="Arial">Arial</option>
                </select>
              </div>
              <div><label className="label">اللون</label><input type="color" className="input h-9 p-1" value={sel.color} onChange={(e) => updateSel({ color: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="label">المحاذاة</label>
                <select className="input" value={sel.align} onChange={(e) => updateSel({ align: e.target.value })}>
                  <option value="right">يمين</option><option value="left">يسار</option><option value="center">وسط</option>
                </select>
              </div>
              <div><label className="label">الاتجاه</label>
                <select className="input" value={sel.direction} onChange={(e) => updateSel({ direction: e.target.value })}>
                  <option value="rtl">RTL</option><option value="ltr">LTR</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
