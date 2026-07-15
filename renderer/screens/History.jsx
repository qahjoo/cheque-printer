// =============================================================================
// renderer/screens/History.jsx — سجل الشيكات المطبوعة (Print History)
// Search + date filter + reprint (prefills Print Cheque via ?reprint=id).
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, EmptyState } from '../components/Common.jsx';
import { formatAmount } from '../lib/format.js';
import { formatDateTime, formatDate } from '../utils/dateHelpers.js';

export default function History() {
  const navigate = useNavigate();
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ search: '', from: '', to: '' });

  const load = useCallback(async () => {
    const clean = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    setRows(await window.api.history.list(clean));
  }, [filters]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">سجل الطباعة</h1>

      <div className="card mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="label">بحث (مستفيد / رقم / بيان)</label>
          <input className="input" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} />
        </div>
        <div><label className="label">من</label><input type="date" dir="ltr" className="input" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} /></div>
        <div><label className="label">إلى</label><input type="date" dir="ltr" className="input" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} /></div>
      </div>

      <div className="card">
        {!rows ? <Spinner /> : rows.length === 0 ? (
          <EmptyState icon="📜" title="لا توجد شيكات مطبوعة" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">تاريخ الطباعة</th>
                <th className="th">المستفيد</th>
                <th className="th">المبلغ</th>
                <th className="th">رقم الشيك</th>
                <th className="th">البيان</th>
                <th className="th">القالب</th>
                <th className="th">الحالة</th>
                <th className="th">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="td">{formatDateTime(r.print_date)}</td>
                  <td className="td font-medium">{r.payee}</td>
                  <td className="td">{formatAmount(r.amount, r.currency)}</td>
                  <td className="td">{r.cheque_number || '—'}</td>
                  <td className="td text-slate-500">{r.purpose || '—'}</td>
                  <td className="td text-slate-500">{r.template_name || '—'}</td>
                  <td className="td">{r.status}</td>
                  <td className="td">
                    <button className="btn-ghost !px-2 !py-1 text-sm text-sky-600" onClick={() => navigate(`/print?reprint=${r.id}`)}>♻️ إعادة طباعة</button>
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
