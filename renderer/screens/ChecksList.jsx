// =============================================================================
// renderer/screens/ChecksList.jsx — سجل الشيكات (البحث والتصفية والطباعة)
// The sidebar "سجل الشيكات" screen: filter by status/text + print action per row.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, EmptyState, StatusBadge } from '../components/Common.jsx';
import { formatAmount, STATUS_OPTIONS } from '../lib/format.js';
import { formatDate, dueLabel, isOverdue } from '../utils/dateHelpers.js';

export default function ChecksList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [settings, setSettings] = useState({});
  const [filters, setFilters] = useState({ status: '', search: '' });

  const load = useCallback(async () => {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [list, s] = await Promise.all([window.api.checks.list(clean), window.api.settings.getAll()]);
    setRows(list);
    setSettings(s);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Open the print preview for this check (Flow B, step 3).
  const openPrint = (e, id) => {
    e.stopPropagation();
    navigate(`/print/${id}`);
  };

  const df = settings.date_format || 'dd/mm/yyyy';
  const cur = settings.currency_singular || 'دينار أردني';

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">سجل الشيكات</h1>
        <button className="btn-primary" onClick={() => navigate('/checks/new')}>➕ شيك جديد</button>
      </div>

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">بحث (المستفيد / رقم الشيك)</label>
          <input className="input" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <div>
          <label className="label">الحالة</label>
          <select className="input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
            <option value="">الكل</option>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      <div className="card">
        {!rows ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon="📋" title="لا توجد شيكات مطابقة" hint="جرّب تغيير معايير البحث" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">رقم الشيك</th>
                <th className="th">المستفيد</th>
                <th className="th">البنك</th>
                <th className="th">المبلغ</th>
                <th className="th">الاستحقاق</th>
                <th className="th">الحالة</th>
                <th className="th">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/checks/${c.id}/edit`)}>
                  <td className="td">{c.check_number}</td>
                  <td className="td font-medium">{c.payee_ar}</td>
                  <td className="td text-slate-500">{c.bank_name_ar || '—'}</td>
                  <td className="td">{formatAmount(c.amount, cur)}</td>
                  <td className={`td ${isOverdue(c.due_date) && c.status === 'open' ? 'text-rose-600' : ''}`}>
                    {formatDate(c.due_date, df)}
                    {c.status === 'open' && <span className="mr-1 text-xs text-slate-400">({dueLabel(c.due_date)})</span>}
                  </td>
                  <td className="td"><StatusBadge status={c.status} /></td>
                  <td className="td">
                    <button className="btn-ghost !px-2 !py-1 text-sm" title="طباعة" onClick={(e) => openPrint(e, c.id)}>🖨️ طباعة</button>
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
