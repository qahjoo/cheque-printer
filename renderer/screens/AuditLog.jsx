// =============================================================================
// renderer/screens/AuditLog.jsx — سجل المراجعة (Module 7)
// Paginated (50/page), expandable JSON details, entity filter, CSV export.
// No delete/clear — the log is immutable (enforced by DB triggers).
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Spinner, EmptyState, useToast } from '../components/Common.jsx';
import { formatDateTime } from '../utils/dateHelpers.js';

const ENTITY_AR = {
  check:         'شيك',
  bank:          'بنك',
  template:      'قالب',
  print_history: 'سجل طباعة',
  settings:      'إعدادات',
  reminder:      'تذكير',
  sync:          'مزامنة',
  backup:        'نسخة احتياطية',
};
const ACTION_AR = {
  created:        'إنشاء',
  updated:        'تعديل',
  renamed:        'تغيير اسم',
  duplicated:     'نسخ',
  fields_saved:   'حفظ حقول',
  set_default:    'تعيين افتراضي',
  status_changed: 'تغيير حالة',
  printed:        'طباعة',
  soft_deleted:   'حذف ناعم',
  deleted:        'حذف',
  changed:        'تغيير',
  sent:           'إرسال',
  completed:      'اكتمال',
  retry_failed:   'إعادة محاولة',
  exported:       'تصدير',
  imported:       'استيراد',
};

export default function AuditLog() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    setData(await window.api.audit.list({ page, pageSize: 50, entity: entity || undefined }));
  }, [page, entity]);

  useEffect(() => { load(); }, [load]);

  const exportCsv = async () => {
    const res = await window.api.audit.exportCsv();
    if (res.ok) toast(`تم تصدير ${res.count} سجل`, 'success');
    else if (!res.canceled) toast(res.error, 'error');
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">سجل المراجعة</h1>
        <div className="flex items-center gap-2">
          <select className="input !w-40" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }}>
            <option value="">كل الكيانات</option>
            {Object.entries(ENTITY_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn-secondary" onClick={exportCsv}>تصدير CSV</button>
        </div>
      </div>

      <div className="card">
        {!data ? (
          <Spinner />
        ) : data.rows.length === 0 ? (
          <EmptyState icon="📜" title="لا توجد سجلات" />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="th">التوقيت</th>
                  <th className="th">الكيان</th>
                  <th className="th">الإجراء</th>
                  <th className="th">التفاصيل</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                      <td className="td">{formatDateTime(r.created_at)}</td>
                      <td className="td">{ENTITY_AR[r.entity] || r.entity}</td>
                      <td className="td">{ACTION_AR[r.action] || r.action}</td>
                      <td className="td text-sky-600">{expanded === r.id ? '▲ إخفاء' : '▼ عرض'} {r.entity_id ? `(${r.entity_id})` : ''}</td>
                    </tr>
                    {expanded === r.id && (
                      <tr>
                        <td className="td bg-slate-50" colSpan={4}>
                          <pre dir="ltr" className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-900 p-3 text-xs text-emerald-200">
                            {JSON.stringify(r.details, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>

            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">صفحة {data.page} من {data.totalPages} — إجمالي {data.total}</span>
              <div className="flex gap-2">
                <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</button>
                <button className="btn-secondary" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>التالي</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
