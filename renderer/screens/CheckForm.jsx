// =============================================================================
// renderer/screens/CheckForm.jsx — نموذج شيك جديد / تعديل (Module 1)
// Live Arabic tafgeet as the amount is typed, bank selection, validation,
// and (on edit) status change + soft delete + print shortcut.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast, Modal } from '../components/Common.jsx';
import { tafgeet } from '../utils/tafgeet.js';
import { validateCheckForm } from '../utils/validators.js';
import { todayISO } from '../utils/dateHelpers.js';
import { STATUS_OPTIONS } from '../lib/format.js';

import { splitAmount } from '../lib/templateFields.js';

const EMPTY = {
  check_number: '',
  bank_id: '',
  payee_ar: '',
  amountDinars: '',
  amountFils: '',
  issue_date: todayISO(),
  due_date: todayISO(),
  notes: '',
  status: 'open',
};

export default function CheckForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const toast = useToast();

  const [form, setForm] = useState(EMPTY);
  const [banks, setBanks] = useState([]);
  const [settings, setSettings] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [statusModal, setStatusModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [collectedBy, setCollectedBy] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  useEffect(() => {
    (async () => {
      const [b, s] = await Promise.all([window.api.banks.list(), window.api.settings.getAll()]);
      setBanks(b);
      setSettings(s);
      if (isEdit) {
        const c = await window.api.checks.get(id);
        if (c) {
          const { dinars, filsStr } = splitAmount(c.amount);
          setForm({
            check_number: c.check_number,
            bank_id: c.bank_id,
            payee_ar: c.payee_ar,
            amountDinars: String(dinars),
            amountFils: filsStr,
            issue_date: c.issue_date,
            due_date: c.due_date,
            notes: c.notes || '',
            status: c.status,
          });
        }
      } else if (b.length) {
        setForm((f) => ({ ...f, bank_id: b[0].id }));
      }
    })();
  }, [id, isEdit]);

  // Grammatical currency words for tafgeet (Jordanian dinar/fils). These are the
  // accusative/counting forms used inside the written amount — distinct from the
  // display currency name ("دينار أردني") shown next to the numeric amount.
  const TAFGEET_OPTS = {
    currency_singular: 'ديناراً',
    currency_plural: 'دنانير',
    cents_singular: 'فلس',
    cents_plural: 'فلوس',
  };

  // Combined decimal amount from the two split inputs
  const combinedAmount = useMemo(() => {
    const d = parseInt(form.amountDinars || '0', 10) || 0;
    const f = Math.min(parseInt(form.amountFils || '0', 10) || 0, 999);
    return d + f / 1000;
  }, [form.amountDinars, form.amountFils]);

  const amountWords = useMemo(() => {
    if (!form.amountDinars && !form.amountFils) return '';
    return tafgeet(combinedAmount, TAFGEET_OPTS);
  }, [combinedAmount]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const formForValidation = { ...form, amount: combinedAmount };
    const v = validateCheckForm(formForValidation);
    setErrors(v.errors);
    if (!v.valid) return toast('يرجى تصحيح الأخطاء في النموذج', 'error');

    setSaving(true);
    try {
      const payload = {
        ...form,
        bank_id: Number(form.bank_id),
        amount: combinedAmount,
        amount_words_ar: amountWords,
        currency: settings.currency_singular || 'دينار أردني',
      };
      const res = isEdit
        ? await window.api.checks.update({ id, ...payload })
        : await window.api.checks.create(payload);
      if (!res.ok) throw new Error(res.error || 'تعذّر الحفظ');
      const savedId = isEdit ? id : res.id;
      toast('تم حفظ الشيك ✓', 'success', { duration: 2000 });
      navigate(`/checks/${savedId}/print`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async (status) => {
    if (status === 'collected') {
      setStatusModal(true);
      return;
    }
    const res = await window.api.checks.changeStatus({ id, status });
    if (res.ok) {
      toast('تم تغيير الحالة', 'success');
      setForm((f) => ({ ...f, status }));
    } else toast(res.error, 'error');
  };

  const confirmCollected = async () => {
    const res = await window.api.checks.changeStatus({ id, status: 'collected', collected_by: collectedBy });
    setStatusModal(false);
    if (res.ok) {
      toast('تم تسجيل التحصيل', 'success');
      setForm((f) => ({ ...f, status: 'collected' }));
    } else toast(res.error, 'error');
  };

  const confirmDelete = async () => {
    const res = await window.api.checks.softDelete({ id, reason: deleteReason });
    setDeleteModal(false);
    if (res.ok) {
      toast('تم حذف الشيك', 'success');
      navigate('/checks');
    } else toast(res.error, 'error');
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? 'تعديل شيك' : 'شيك جديد'}</h1>
        {isEdit && (
          <button className="btn-secondary" onClick={() => navigate(`/checks/${id}/print`)}>🖨️ طباعة</button>
        )}
      </div>

      <div className="card space-y-4">
        <div>
          <label className="label">رقم الشيك</label>
          <input className="input" value={form.check_number} onChange={set('check_number')} />
          {errors.check_number && <p className="field-error">{errors.check_number}</p>}
        </div>

        <div>
          <label className="label">اسم المستفيد</label>
          <input className="input" value={form.payee_ar} onChange={set('payee_ar')} />
          {errors.payee_ar && <p className="field-error">{errors.payee_ar}</p>}
        </div>

        {/* ---- المبلغ (دينار + فلوس) ---- */}
        <div>
          <label className="label">المبلغ ({settings.currency_singular || 'دينار'})</label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <input
                className="input text-center"
                type="number" step="1" min="0" dir="ltr"
                placeholder="475"
                value={form.amountDinars}
                onChange={(e) => { setForm((f) => ({ ...f, amountDinars: e.target.value })); }}
              />
              <p className="mt-0.5 text-center text-xs text-slate-400">دينار</p>
            </div>
            <span className="text-xl font-bold text-slate-400 pb-4">/</span>
            <div className="w-24">
              <input
                className="input text-center"
                type="number" step="1" min="0" max="999" dir="ltr"
                placeholder="000"
                value={form.amountFils}
                onChange={(e) => { setForm((f) => ({ ...f, amountFils: e.target.value })); }}
              />
              <p className="mt-0.5 text-center text-xs text-slate-400">فلس</p>
            </div>
          </div>
          {errors.amount && <p className="field-error">{errors.amount}</p>}
          {amountWords && (
            <div className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
              <span className="font-medium">التفقيط: </span>{amountWords}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">تاريخ الإصدار</label>
            <input className="input" type="date" value={form.issue_date} onChange={set('issue_date')} dir="ltr" />
            {errors.issue_date && <p className="field-error">{errors.issue_date}</p>}
          </div>
          <div>
            <label className="label">تاريخ الاستحقاق</label>
            <input className="input" type="date" value={form.due_date} onChange={set('due_date')} dir="ltr" />
            {errors.due_date && <p className="field-error">{errors.due_date}</p>}
          </div>
        </div>

        <div>
          <label className="label">ملاحظات</label>
          <textarea className="input" rows={2} value={form.notes} onChange={set('notes')} />
        </div>

        {isEdit && (
          <div>
            <label className="label">الحالة</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => applyStatus(o.value)}
                  className={`btn ${form.status === o.value ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? 'جارٍ الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة الشيك'}
            </button>
            <button className="btn-secondary" onClick={() => navigate('/checks')}>إلغاء</button>
          </div>
          {isEdit && (
            <button className="btn-danger" onClick={() => setDeleteModal(true)}>حذف الشيك</button>
          )}
        </div>
      </div>

      <Modal open={statusModal} title="تسجيل التحصيل" onClose={() => setStatusModal(false)} size="sm">
        <label className="label">اسم من قام بالتحصيل (اختياري)</label>
        <input className="input" value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setStatusModal(false)}>إلغاء</button>
          <button className="btn-primary" onClick={confirmCollected}>تأكيد التحصيل</button>
        </div>
      </Modal>

      <Modal open={deleteModal} title="حذف الشيك" onClose={() => setDeleteModal(false)} size="sm">
        <p className="mb-3 text-sm text-slate-600">سيتم إخفاء الشيك (حذف ناعم) مع الاحتفاظ به في سجل المراجعة.</p>
        <label className="label">سبب الحذف</label>
        <input className="input" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} />
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDeleteModal(false)}>إلغاء</button>
          <button className="btn-danger" onClick={confirmDelete}>تأكيد الحذف</button>
        </div>
      </Modal>
    </div>
  );
}
