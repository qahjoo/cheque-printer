// =============================================================================
// renderer/screens/Dashboard.jsx — لوحة التحكم (Module 3)
// KPI cards per status, amount totals, due-soon list, and overdue alerts.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, EmptyState, StatusBadge } from '../components/Common.jsx';
import { formatAmount } from '../lib/format.js';
import { formatDate, dueLabel } from '../utils/dateHelpers.js';

const CARD_META = {
  open: { label: 'مفتوح', color: 'text-sky-600', bg: 'bg-sky-50' },
  collected: { label: 'محصّل', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  returned: { label: 'مرتجع', color: 'text-amber-600', bg: 'bg-amber-50' },
  cancelled: { label: 'ملغي', color: 'text-slate-500', bg: 'bg-slate-100' },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    (async () => {
      const [d, s, incomingData] = await Promise.all([
        window.api.checks.dashboard(),
        window.api.settings.getAll(),
        window.api.incomingChecks.list('all'),
      ]);
      setData({ ...d, incoming: incomingData || [] });
      setSettings(s);
    })();
  }, []);

  if (!data) return <Spinner />;

  const fmt = (n) => formatAmount(n, settings.currency_singular || 'دينار');
  const df = settings.date_format || 'dd/mm/yyyy';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="text-sm text-slate-500">{settings.company_name} — {settings.company_name_line2}</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/checks/new')}>➕ شيك جديد</button>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        {['open', 'collected', 'returned', 'cancelled'].map((st) => {
          const m = CARD_META[st];
          return (
            <div key={st} className={`card ${m.bg} border-0`}>
              <div className="text-sm text-slate-500">{m.label}</div>
              <div className={`mt-1 text-3xl font-bold ${m.color}`}>{data.totals[st] || 0}</div>
              <div className="mt-1 text-xs text-slate-500">{fmt(data.amounts[st] || 0)}</div>
            </div>
          );
        })}
      </div>

      {/* Overdue alert */}
      {data.overdue.length > 0 && (
        <div className="card mb-6 border-rose-200 bg-rose-50">
          <div className="mb-3 flex items-center gap-2 font-semibold text-rose-700">
            ⚠️ شيكات متأخرة ({data.overdue.length})
          </div>
          <div className="space-y-2">
            {data.overdue.slice(0, 5).map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/checks/${c.id}/edit`)}
                className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-right text-sm hover:bg-rose-100/40"
              >
                <span className="font-medium">{c.payee_ar}</span>
                <span className="text-rose-600">{fmt(c.amount)} — {dueLabel(c.due_date)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Due soon */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">مستحقة خلال {data.reminderDays} أيام</h2>
          <button className="btn-ghost text-sm" onClick={() => navigate('/reports')}>عرض التقارير</button>
        </div>
        {data.dueSoon.length === 0 ? (
          <EmptyState icon="✅" title="لا توجد شيكات مستحقة قريباً" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">المستفيد</th>
                <th className="th">البنك</th>
                <th className="th">المبلغ</th>
                <th className="th">الاستحقاق</th>
                <th className="th">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.dueSoon.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/checks/${c.id}/edit`)}>
                  <td className="td font-medium">{c.payee_ar}</td>
                  <td className="td text-slate-500">{c.bank_name_ar || '—'}</td>
                  <td className="td">{fmt(c.amount)}</td>
                  <td className="td">{formatDate(c.due_date, df)} <span className="text-xs text-slate-400">({dueLabel(c.due_date)})</span></td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Incoming Checks Summary */}
      <div className="card mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-indigo-700">الشيكات الواردة (تحت التحصيل قريباً)</h2>
          <button className="btn-ghost text-sm" onClick={() => navigate('/incoming-checks')}>عرض السجل</button>
        </div>
        {data.incoming.length === 0 ? (
          <EmptyState icon="📥" title="لا توجد شيكات واردة" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">رقم الشيك</th>
                <th className="th">الساحب</th>
                <th className="th">البنك</th>
                <th className="th">المبلغ</th>
                <th className="th">الاستحقاق</th>
                <th className="th">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {data.incoming.filter(c => c.status === 'received' || c.status === 'under_collection').slice(0, 5).map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/incoming-checks/${c.id}/edit`)}>
                  <td className="td font-mono text-sm">{c.check_number}</td>
                  <td className="td font-medium">{c.drawer_name}</td>
                  <td className="td text-slate-500">{c.bank_name || '—'}</td>
                  <td className="td font-bold text-emerald-600">{fmt(c.amount)}</td>
                  <td className="td">{formatDate(c.due_date, df)}</td>
                  <td className="td">
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-600">
                      {c.status === 'received' ? 'مستلم' : 'قيد التحصيل'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
