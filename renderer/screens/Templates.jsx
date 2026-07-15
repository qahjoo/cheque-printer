// =============================================================================
// renderer/screens/Templates.jsx — إدارة القوالب (Template Management)
// List / preview / rename / duplicate / delete / set default / edit / create.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, EmptyState, Modal, useToast } from '../components/Common.jsx';
import { FIELD_META, MM_TO_PX, fieldStyle } from '../lib/templateFields.js';

export default function Templates() {
  const navigate = useNavigate();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [previewId, setPreviewId] = useState(null);
  const [previewTpl, setPreviewTpl] = useState(null);
  const [renaming, setRenaming] = useState(null); // {id,name}
  const [creating, setCreating] = useState(false);
  const [newTpl, setNewTpl] = useState({ name: '', width_mm: 165, height_mm: 82 });

  const load = useCallback(() => window.api.templates.list().then(setList), []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (previewId) window.api.templates.get(previewId).then(setPreviewTpl);
    else setPreviewTpl(null);
  }, [previewId]);

  const setDefault = async (id) => {
    await window.api.templates.setDefault(id);
    toast('تم تعيين القالب الافتراضي', 'success');
    load();
  };
  const duplicate = async (id) => {
    const r = await window.api.templates.duplicate(id);
    if (r.ok) { toast('تم النسخ', 'success'); load(); } else toast(r.error, 'error');
  };
  const remove = async (id) => {
    if (!confirm('حذف هذا القالب؟')) return;
    const r = await window.api.templates.remove(id);
    if (r.ok) { toast('تم الحذف', 'success'); load(); } else toast(r.error, 'error');
  };
  const doRename = async () => {
    const r = await window.api.templates.rename({ id: renaming.id, name: renaming.name });
    if (r.ok) { toast('تم', 'success'); setRenaming(null); load(); } else toast(r.error, 'error');
  };
  const create = async () => {
    if (!newTpl.name.trim()) return toast('أدخل اسماً', 'error');
    const r = await window.api.templates.create(newTpl);
    if (r.ok) { toast('تم إنشاء القالب', 'success'); setCreating(false); setNewTpl({ name: '', width_mm: 165, height_mm: 82 }); load(); navigate(`/templates/designer/${r.id}`); }
    else toast(r.error, 'error');
  };

  if (!list) return <Spinner />;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">القوالب</h1>
        <button className="btn-primary" onClick={() => setCreating(true)}>➕ قالب جديد</button>
      </div>

      {list.length === 0 ? (
        <EmptyState icon="🧾" title="لا توجد قوالب" />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((t) => (
            <div key={t.id} className="card">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">{t.name}</div>
                {t.is_default && <span className="badge bg-amber-100 text-amber-700">افتراضي</span>}
              </div>
              <div className="mb-3 text-xs text-slate-500">{t.width_mm}×{t.height_mm} مم</div>
              <div className="flex flex-wrap gap-1 text-xs">
                <button className="btn-ghost !px-2 !py-1" onClick={() => setPreviewId(t.id)}>معاينة</button>
                <button className="btn-ghost !px-2 !py-1" onClick={() => navigate(`/templates/designer/${t.id}`)}>تعديل</button>
                <button className="btn-ghost !px-2 !py-1" onClick={() => setRenaming({ id: t.id, name: t.name })}>إعادة تسمية</button>
                <button className="btn-ghost !px-2 !py-1" onClick={() => duplicate(t.id)}>تكرار</button>
                {!t.is_default && <button className="btn-ghost !px-2 !py-1 text-sky-600" onClick={() => setDefault(t.id)}>تعيين افتراضي</button>}
                <button className="btn-ghost !px-2 !py-1 text-rose-600" onClick={() => remove(t.id)}>حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      <Modal open={!!previewId} title="معاينة القالب" onClose={() => setPreviewId(null)} size="lg">
        {!previewTpl ? <Spinner /> : (
          <div className="flex justify-center">
            <div
              style={{
                position: 'relative',
                width: previewTpl.width_mm * MM_TO_PX,
                height: previewTpl.height_mm * MM_TO_PX,
                background: '#fff',
                border: '1px dashed #94a3b8',
                overflow: 'hidden',
              }}
            >
              {previewTpl.background_image && (
                <img src={previewTpl.background_image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
              )}
              {previewTpl.fields.filter((f) => f.visible).map((f) => (
                <div key={f.field_name} style={fieldStyle(f, 'px')}>
                  {(FIELD_META[f.field_name] || {}).sample || f.field_name}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Rename modal */}
      <Modal open={!!renaming} title="إعادة تسمية القالب" onClose={() => setRenaming(null)} size="sm">
        {renaming && (
          <div className="space-y-3">
            <input className="input" value={renaming.name} onChange={(e) => setRenaming({ ...renaming, name: e.target.value })} />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setRenaming(null)}>إلغاء</button>
              <button className="btn-primary" onClick={doRename}>حفظ</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create modal */}
      <Modal open={creating} title="قالب جديد" onClose={() => setCreating(false)} size="sm">
        <div className="space-y-3">
          <div><label className="label">الاسم</label><input className="input" value={newTpl.name} onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">العرض (مم)</label><input type="number" className="input" value={newTpl.width_mm} onChange={(e) => setNewTpl({ ...newTpl, width_mm: e.target.value })} /></div>
            <div><label className="label">الارتفاع (مم)</label><input type="number" className="input" value={newTpl.height_mm} onChange={(e) => setNewTpl({ ...newTpl, height_mm: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setCreating(false)}>إلغاء</button>
            <button className="btn-primary" onClick={create}>إنشاء وفتح المصمم</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
