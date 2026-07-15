import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatAmount } from '../lib/format.js';

const STATUS_LABELS = {
  received: { ar: 'مستلم', color: 'bg-slate-700 text-slate-300' },
  under_collection: { ar: 'قيد التحصيل', color: 'bg-amber-900/60 text-amber-400' },
  collected: { ar: 'مُحصّل', color: 'bg-emerald-900/60 text-emerald-400' },
  returned: { ar: 'مرتجع', color: 'bg-rose-900/60 text-rose-400' },
  endorsed: { ar: 'مُجيّر', color: 'bg-indigo-900/60 text-indigo-400' },
};

export default function IncomingChecksList() {
  const [checks, setChecks] = useState([]);
  const [filter, setFilter] = useState('all');
  const navigate = useNavigate();

  useEffect(() => {
    loadChecks();
    const interval = setInterval(loadChecks, 15000); // auto refresh for sync
    return () => clearInterval(interval);
  }, [filter]);

  const loadChecks = async () => {
    const data = await window.api.incomingChecks.list(filter);
    setChecks(data);
  };

  const handleStatusChange = async (id, newStatus) => {
    await window.api.incomingChecks.update({ id, status: newStatus });
    loadChecks();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذا الشيك الوارد؟')) return;
    await window.api.incomingChecks.remove({ id, reason: 'حذف من الواجهة' });
    loadChecks();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الشيكات الواردة</h1>
          <p className="text-sm text-slate-500">إدارة ومتابعة الشيكات المستلمة من العملاء</p>
        </div>
        <button className="btn-primary" onClick={() => navigate('/incoming-checks/new')}>
          ➕ إضافة شيك وارد
        </button>
      </div>

      <div className="flex gap-2">
        <button className={`btn-secondary ${filter === 'all' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setFilter('all')}>الكل</button>
        <button className={`btn-secondary ${filter === 'received' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setFilter('received')}>مستلم</button>
        <button className={`btn-secondary ${filter === 'under_collection' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setFilter('under_collection')}>قيد التحصيل</button>
        <button className={`btn-secondary ${filter === 'collected' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setFilter('collected')}>مُحصّل</button>
        <button className={`btn-secondary ${filter === 'returned' ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setFilter('returned')}>مرتجع</button>
      </div>

      <div className="card">
        {checks.length === 0 ? (
          <div className="py-12 text-center text-slate-400">لا توجد شيكات واردة.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="bg-slate-800 text-slate-300">
                <tr>
                  <th className="p-3 font-semibold">رقم الشيك</th>
                  <th className="p-3 font-semibold">الساحب (العميل)</th>
                  <th className="p-3 font-semibold">البنك</th>
                  <th className="p-3 font-semibold">تاريخ الاستحقاق</th>
                  <th className="p-3 font-semibold">المبلغ</th>
                  <th className="p-3 font-semibold">الحالة</th>
                  <th className="p-3 font-semibold text-left">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {checks.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-800/50 transition">
                    <td className="p-3 font-mono">{c.check_number}</td>
                    <td className="p-3 font-bold text-amber-50">{c.drawer_name}</td>
                    <td className="p-3 text-slate-300">{c.bank_name}</td>
                    <td className="p-3 text-slate-300">{c.due_date}</td>
                    <td className="p-3 font-mono text-emerald-400 font-bold">{formatAmount(c.amount, c.currency)}</td>
                    <td className="p-3">
                      <select
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value)}
                        className={`input-field !py-1 !text-xs font-bold ${STATUS_LABELS[c.status]?.color}`}
                      >
                        {Object.entries(STATUS_LABELS).map(([k, v]) => (
                          <option key={k} value={k} className="bg-slate-800 text-white">{v.ar}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-3 text-left">
                      <div className="flex justify-end gap-2">
                        <button className="btn-secondary !py-1 !text-xs" onClick={() => navigate(`/incoming-checks/${c.id}/edit`)}>تعديل</button>
                        <button className="btn-danger !py-1 !text-xs" onClick={() => handleDelete(c.id)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
