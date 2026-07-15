// =============================================================================
// renderer/screens/Reports.jsx — التقارير (Module 5)
// R1 due-this-week (grouped), R2 statement by payee, R3 by period, R4 status
// summary with a CSS bar chart. Every report exports to PDF/Excel/print.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { Spinner, EmptyState, StatusBadge, useToast } from '../components/Common.jsx';
import { formatAmount } from '../lib/format.js';
import { formatDate, todayISO, addDaysISO } from '../utils/dateHelpers.js';

const TABS = [
  { key: 'week', label: 'مستحقة هذا الأسبوع' },
  { key: 'payee', label: 'كشف حساب بالمستفيد' },
  { key: 'period', label: 'فترة زمنية' },
  { key: 'summary', label: 'ملخص الوضع الحالي' },
];

const BAR_COLORS = {
  open: 'bg-sky-500',
  collected: 'bg-emerald-500',
  returned: 'bg-amber-500',
  cancelled: 'bg-slate-400',
};

export default function Reports() {
  const toast = useToast();
  const [tab, setTab] = useState('week');
  const [settings, setSettings] = useState({});

  useEffect(() => {
    window.api.settings.getAll().then(setSettings);
  }, []);

  const cur = settings.currency_singular || 'دينار';
  const df = settings.date_format || 'dd/mm/yyyy';
  const fmt = (n) => formatAmount(n, cur);

  // Build the export payload for whatever rows are currently shown.
  const doExport = async (kind, payload) => {
    const fn = kind === 'pdf' ? window.api.reports.exportPdf
      : kind === 'excel' ? window.api.reports.exportExcel
      : window.api.reports.print;
    const res = await fn(payload);
    if (res.ok) toast(kind === 'print' ? 'تم الإرسال للطباعة' : `تم الحفظ: ${res.filePath}`, 'success');
    else if (!res.canceled) toast(res.error || 'تعذّر التصدير', 'error');
  };

  const ExportBar = ({ payload }) => (
    <div className="mb-4 flex gap-2">
      <button className="btn-secondary text-sm" onClick={() => doExport('pdf', payload)}>📄 PDF</button>
      <button className="btn-secondary text-sm" onClick={() => doExport('excel', payload)}>📊 Excel</button>
      <button className="btn-secondary text-sm" onClick={() => doExport('print', payload)}>🖨️ طباعة</button>
    </div>
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">التقارير</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'week' && <WeekReport fmt={fmt} df={df} ExportBar={ExportBar} />}
      {tab === 'payee' && <PayeeReport fmt={fmt} df={df} ExportBar={ExportBar} />}
      {tab === 'period' && <PeriodReport fmt={fmt} df={df} ExportBar={ExportBar} />}
      {tab === 'summary' && <SummaryReport fmt={fmt} />}
    </div>
  );
}

function WeekReport({ fmt, df, ExportBar }) {
  const [data, setData] = useState(null);
  useEffect(() => { window.api.reports.dueThisWeek().then(setData); }, []);
  if (!data) return <Spinner />;
  if (data.count === 0) return <EmptyState icon="✅" title="لا شيكات مستحقة هذا الأسبوع" />;

  const rows = data.groups.flatMap((g) => g.checks);
  const payload = { slug: 'week', title: 'شيكات مستحقة هذا الأسبوع', columns: ['رقم الشيك', 'المستفيد', 'المبلغ', 'الاستحقاق', 'الحالة'], rows };

  return (
    <div className="card">
      <ExportBar payload={payload} />
      {data.groups.map((g) => (
        <div key={g.day} className="mb-4">
          <div className="mb-1 flex items-center justify-between rounded bg-slate-100 px-3 py-1 text-sm font-semibold">
            <span>{formatDate(g.day, df)}</span>
            <span className="text-slate-600">{fmt(g.total)}</span>
          </div>
          <table className="w-full">
            <tbody>
              {g.checks.map((c) => (
                <tr key={c.id}>
                  <td className="td">{c.check_number}</td>
                  <td className="td font-medium">{c.payee_ar}</td>
                  <td className="td">{c.bank_name_ar}</td>
                  <td className="td">{fmt(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="mt-4 border-t pt-3 text-right font-bold">الإجمالي: {fmt(data.total)} ({data.count} شيك)</div>
    </div>
  );
}

function PayeeReport({ fmt, df, ExportBar }) {
  const [payees, setPayees] = useState([]);
  const [payee, setPayee] = useState('');
  const [data, setData] = useState(null);
  useEffect(() => { window.api.reports.payees().then(setPayees); }, []);
  useEffect(() => {
    if (payee) window.api.reports.byPayee(payee).then(setData);
    else setData(null);
  }, [payee]);

  const payload = data && {
    slug: 'payee', title: `كشف حساب: ${payee}`,
    columns: ['رقم الشيك', 'المبلغ', 'الاستحقاق', 'الحالة'], rows: data.rows,
  };

  return (
    <div className="card">
      <div className="mb-4 max-w-sm">
        <label className="label">اختر المستفيد</label>
        <select className="input" value={payee} onChange={(e) => setPayee(e.target.value)}>
          <option value="">—</option>
          {payees.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
      {!data ? (
        <EmptyState icon="👤" title="اختر مستفيداً لعرض كشف الحساب" />
      ) : (
        <>
          <ExportBar payload={payload} />
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><th className="th">رقم الشيك</th><th className="th">المبلغ</th><th className="th">الاستحقاق</th><th className="th">الحالة</th></tr></thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id}>
                  <td className="td">{c.check_number}</td>
                  <td className="td">{fmt(c.amount)}</td>
                  <td className="td">{formatDate(c.due_date, df)}</td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 border-t pt-3">
            <div className="text-right font-bold">الإجمالي: {fmt(data.total)} ({data.count} شيك)</div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-500">
              {Object.entries(data.byStatus).map(([st, v]) => (
                <span key={st}>{v.label}: {v.count} ({fmt(v.total)})</span>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PeriodReport({ fmt, df, ExportBar }) {
  const [from, setFrom] = useState(addDaysISO(todayISO(), -30));
  const [to, setTo] = useState(todayISO());
  const [field, setField] = useState('due_date');
  const [data, setData] = useState(null);

  const run = async () => setData(await window.api.reports.byPeriod({ from, to, field }));

  const payload = data && {
    slug: 'period', title: `تقرير الفترة ${from} إلى ${to}`,
    columns: ['رقم الشيك', 'المستفيد', 'المبلغ', 'الاستحقاق', 'الحالة'], rows: data.rows,
  };

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label">من</label><input type="date" dir="ltr" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label">إلى</label><input type="date" dir="ltr" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="label">حسب</label>
          <div className="flex gap-3 pt-2 text-sm">
            <label className="flex items-center gap-1"><input type="radio" checked={field === 'due_date'} onChange={() => setField('due_date')} /> الاستحقاق</label>
            <label className="flex items-center gap-1"><input type="radio" checked={field === 'issue_date'} onChange={() => setField('issue_date')} /> الإصدار</label>
          </div>
        </div>
        <button className="btn-primary" onClick={run}>عرض</button>
      </div>
      {!data ? (
        <EmptyState icon="📅" title="اختر الفترة ثم اضغط عرض" />
      ) : data.rows.length === 0 ? (
        <EmptyState icon="📅" title="لا نتائج ضمن هذه الفترة" />
      ) : (
        <>
          <ExportBar payload={payload} />
          <table className="w-full">
            <thead><tr className="border-b border-slate-100"><th className="th">رقم الشيك</th><th className="th">المستفيد</th><th className="th">المبلغ</th><th className="th">الاستحقاق</th><th className="th">الحالة</th></tr></thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id}>
                  <td className="td">{c.check_number}</td>
                  <td className="td font-medium">{c.payee_ar}</td>
                  <td className="td">{fmt(c.amount)}</td>
                  <td className="td">{formatDate(c.due_date, df)}</td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 flex flex-wrap justify-between gap-3 border-t pt-3 text-sm">
            <span className="font-bold">الإجمالي: {fmt(data.total)} ({data.count})</span>
            <span className="text-slate-500">
              {Object.entries(data.byStatus).map(([st, v]) => `${v.label}: ${v.count}`).join(' | ')}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryReport({ fmt }) {
  const [data, setData] = useState(null);
  useEffect(() => { window.api.reports.statusSummary().then(setData); }, []);
  if (!data) return <Spinner />;

  return (
    <div className="card">
      <table className="mb-6 w-full">
        <thead><tr className="border-b border-slate-100"><th className="th">الحالة</th><th className="th">العدد</th><th className="th">إجمالي المبلغ</th><th className="th">النسبة</th></tr></thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.status}>
              <td className="td"><StatusBadge status={r.status} /></td>
              <td className="td">{r.count}</td>
              <td className="td">{fmt(r.total)}</td>
              <td className="td">{r.percent}%</td>
            </tr>
          ))}
          <tr className="font-bold">
            <td className="td">الإجمالي</td>
            <td className="td">{data.totalCount}</td>
            <td className="td">{fmt(data.totalAmount)}</td>
            <td className="td">100%</td>
          </tr>
        </tbody>
      </table>

      {/* CSS bar chart */}
      <div className="space-y-3">
        {data.rows.map((r) => (
          <div key={r.status}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{r.label}</span>
              <span className="text-slate-500">{r.count} ({r.percent}%)</span>
            </div>
            <div className="h-5 w-full rounded bg-slate-100">
              <div className={`h-5 rounded ${BAR_COLORS[r.status]}`} style={{ width: `${r.percent}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
