// =============================================================================
// renderer/screens/PrintCheque.jsx — طباعة شيك (Print Cheque workflow)
// Choose template -> fill data -> auto tafgeet -> generate preview (draws every
// field from the SAVED template coordinates) -> print (browser print, only the
// cheque via #print-sheet + print stylesheet) -> log to print history.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Spinner, EmptyState, useToast } from '../components/Common.jsx';
import { tafgeet } from '../utils/tafgeet.js';
import { formatAmount } from '../lib/format.js';
import { formatDate, todayISO } from '../utils/dateHelpers.js';
import { FIELD_META, fieldValues, fieldStyle, splitAmount } from '../lib/templateFields.js';

const TAFGEET_OPTS = { currency_singular: 'ديناراً', currency_plural: 'دنانير', cents_singular: 'فلس', cents_plural: 'فلوس' };

export default function PrintCheque() {
  const toast = useToast();
  const [params] = useSearchParams();
  const [templates, setTemplates] = useState(null);
  const [tpl, setTpl] = useState(null); // full template with fields
  const [payees, setPayees] = useState([]);
  const [settings, setSettings] = useState({});
  const [preview, setPreview] = useState(null); // frozen data for the sheet

  const [form, setForm] = useState({
    templateId: '',
    payee: '',
    amountDinars: '',
    amountFils: '',
    purpose: '',
    date: todayISO(),
    crossed: false,
    cheque_number: '',
    currency: 'دينار أردني',
  });

  // Init: templates + default + payees + settings. Preselect from ?reprint or default.
  useEffect(() => {
    (async () => {
      const [list, def, pys, s] = await Promise.all([
        window.api.templates.list(),
        window.api.templates.getDefault(),
        window.api.reports.payees(),
        window.api.settings.getAll(),
      ]);
      setTemplates(list);
      setPayees(pys);
      setSettings(s);
      setForm((f) => ({ ...f, templateId: def ? String(def.id) : (list[0] ? String(list[0].id) : ''), currency: s.currency_singular || 'دينار أردني' }));

      // Reprint: prefill from a history row.
      const reprintId = params.get('reprint');
      if (reprintId) {
        const h = await window.api.history.get(Number(reprintId));
        if (h) {
          const { dinars, filsStr } = splitAmount(h.amount);
          setForm((f) => ({
            ...f,
            templateId: h.template_id ? String(h.template_id) : f.templateId,
            payee: h.payee, amountDinars: String(dinars), amountFils: filsStr,
            purpose: h.purpose || '', date: h.cheque_date || todayISO(),
            crossed: !!h.crossed, cheque_number: h.cheque_number || '',
            currency: h.currency || f.currency,
          }));
        }
      }
    })();
  }, [params]);

  // Load the selected template's fields whenever the choice changes.
  useEffect(() => {
    if (!form.templateId) return;
    window.api.templates.get(Number(form.templateId)).then(setTpl);
    setPreview(null); // invalidate preview on template change
  }, [form.templateId]);

  const set = (k) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
    setPreview(null);
  };

  // Combined decimal amount
  const combinedAmount = useMemo(() => {
    const d = parseInt(form.amountDinars || '0', 10) || 0;
    const f = Math.min(parseInt(form.amountFils || '0', 10) || 0, 999);
    return d + f / 1000;
  }, [form.amountDinars, form.amountFils]);

  const amountWords = useMemo(() => {
    if (!form.amountDinars && !form.amountFils) return '';
    return tafgeet(combinedAmount, TAFGEET_OPTS);
  }, [combinedAmount]);

  const df = settings.date_format || 'dd/mm/yyyy';

  const buildData = () => {
    const { dinars, filsStr } = splitAmount(combinedAmount);
    return {
      payee: form.payee,
      amount_words: amountWords,
      amount_number: String(dinars),      // integer dinar part only
      amount_fils: filsStr,              // 3-digit fils (e.g. "500" or "140")
      date: formatDate(form.date, df),
      purpose: form.purpose,
      cheque_number: form.cheque_number,
      crossed: form.crossed,
    };
  };

  const generate = () => {
    if (!tpl) return toast('اختر قالباً', 'error');
    if (!form.payee.trim()) return toast('أدخل اسم المستفيد', 'error');
    if (!form.amountDinars && !form.amountFils) return toast('أدخل مبلغاً صحيحاً', 'error');
    if (combinedAmount <= 0) return toast('يجب أن يكون المبلغ أكبر من صفر', 'error');
    setPreview(buildData());
  };

  const doPrint = () => {
    if (!preview || !tpl) return;
    // Inject exact @page size for this template (Step 7: exact mm, no scaling).
    let st = document.getElementById('print-page-style');
    if (!st) {
      st = document.createElement('style');
      st.id = 'print-page-style';
      document.head.appendChild(st);
    }
    st.textContent = `@page { size: ${tpl.width_mm}mm ${tpl.height_mm}mm; margin: 0; }`;

    window.print();

    // Log to history after the print dialog returns.
    window.api.history.add({
      cheque_date: form.date,
      payee: form.payee,
      amount: combinedAmount,
      amount_words: amountWords,
      purpose: form.purpose,
      cheque_number: form.cheque_number,
      currency: form.currency,
      crossed: form.crossed,
      template_id: tpl.id,
      template_name: tpl.name,
      status: 'printed',
    }).then(() => toast('تمت الطباعة وسُجّلت', 'success'));
  };

  if (!templates) return <Spinner />;
  if (templates.length === 0) return <EmptyState icon="🧾" title="لا توجد قوالب" hint="أنشئ قالباً من صفحة القوالب" />;

  const values = preview ? fieldValues(preview) : {};

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">طباعة شيك</h1>

      <div className="flex flex-wrap gap-6">
        {/* ---- Form ---- */}
        <div className="card w-96 space-y-3">
          <div>
            <label className="label">القالب</label>
            <select className="input" value={form.templateId} onChange={set('templateId')}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (افتراضي)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">المستفيد</label>
            <input className="input" list="payees" value={form.payee} onChange={set('payee')} />
            <datalist id="payees">{payees.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          {/* ---- المبلغ (دينار + فلوس) ---- */}
          <div>
            <label className="label">المبلغ</label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <input type="number" step="1" min="0" dir="ltr" className="input text-center"
                  placeholder="475" value={form.amountDinars}
                  onChange={(e) => { setForm((f) => ({ ...f, amountDinars: e.target.value })); setPreview(null); }}
                />
                <p className="mt-0.5 text-center text-xs text-slate-400">دينار</p>
              </div>
              <span className="pb-4 text-xl font-bold text-slate-400">/</span>
              <div className="w-24">
                <input type="number" step="1" min="0" max="999" dir="ltr" className="input text-center"
                  placeholder="000" value={form.amountFils}
                  onChange={(e) => { setForm((f) => ({ ...f, amountFils: e.target.value })); setPreview(null); }}
                />
                <p className="mt-0.5 text-center text-xs text-slate-400">فلس</p>
              </div>
            </div>
            {amountWords && <div className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-800">{amountWords}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">رقم الشيك</label>
              <input className="input" dir="ltr" value={form.cheque_number} onChange={set('cheque_number')} />
            </div>
            <div>
              <label className="label">التاريخ</label>
              <input type="date" dir="ltr" className="input" value={form.date} onChange={set('date')} />
            </div>
          </div>
          <div>
            <label className="label">البيان / الغرض</label>
            <input className="input" value={form.purpose} onChange={set('purpose')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">العملة</label>
              <input className="input" value={form.currency} onChange={set('currency')} />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.crossed} onChange={set('crossed')} /> شيك مسطّر
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button className="btn-primary" onClick={generate}>توليد المعاينة</button>
            <button className="btn-secondary" disabled={!preview} onClick={doPrint}>🖨️ طباعة</button>
          </div>
        </div>

        {/* ---- Preview (also the print target) ---- */}
        <div>
          <p className="mb-2 text-sm text-slate-500">
            {tpl ? `${tpl.name} — ${tpl.width_mm}×${tpl.height_mm} مم` : ''}
          </p>
          {!preview ? (
            <div className="card"><EmptyState icon="👁️" title="اضغط «توليد المعاينة»" /></div>
          ) : (
            <div
              id="print-sheet"
              style={{
                position: 'relative',
                width: `${tpl.width_mm}mm`,
                height: `${tpl.height_mm}mm`,
                background: '#fff',
                boxShadow: '0 0 0 1px #cbd5e1',
                overflow: 'hidden',
              }}
            >
              {/* dashed guide + optional background image (guide hidden on print) */}
              {tpl.background_image && (
                <img
                  src={tpl.background_image}
                  alt=""
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }}
                />
              )}
              <div className="no-print" style={{ position: 'absolute', inset: 0, border: '1px dashed #94a3b8', pointerEvents: 'none' }} />
              {tpl.fields.filter((f) => f.visible).map((f) => (
                <div key={f.field_name} style={fieldStyle(f, 'mm')}>
                  {values[f.field_name]}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
