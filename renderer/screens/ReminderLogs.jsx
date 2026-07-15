// =============================================================================
// renderer/screens/ReminderLogs.jsx — شاشة التذكيرات + سجلّها
// Sidebar "🔔 التذكيرات" screen: run reminders now, view last 100 log rows, and
// listen for the manual-trigger result pushed from the tray/main process.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Spinner, EmptyState, useToast } from '../components/Common.jsx';
import { formatDateTime } from '../utils/dateHelpers.js';

export default function ReminderLogs() {
  const toast = useToast();
  const [logs, setLogs] = useState(null);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const load = useCallback(async () => {
    setLogs(await window.api.reminders.log(100));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Result pushed from tray "تذكيرات الآن".
  useEffect(() => {
    if (!window.api) return undefined;
    const off = window.api.reminders.onResult((result) => {
      setLastResult(result);
      load();
    });
    return () => off && off();
  }, [load]);

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await window.api.reminders.test();
      setLastResult(res);
      const ok = (res.notifications_sent || []).filter((n) => n.ok).length;
      toast(`تم فحص التذكيرات: ${res.checks_found} شيك مستحق — ${ok} إشعار ناجح`, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRunning(false);
    }
  };

  const channelAr = { desktop: 'سطح المكتب', telegram: 'تيليغرام', email: 'بريد إلكتروني' };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">التذكيرات</h1>
        <button className="btn-primary" disabled={running} onClick={runNow}>
          {running ? 'جارٍ الفحص...' : '🔔 تشغيل التذكيرات الآن'}
        </button>
      </div>

      {lastResult && (
        <div className="card mb-4 border-sky-200 bg-sky-50">
          <div className="font-semibold text-sky-800">نتيجة آخر تشغيل</div>
          <p className="text-sm text-slate-600">عدد الشيكات المستحقة: {lastResult.checks_found}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(lastResult.notifications_sent || []).map((n, i) => (
              <span key={i} className={`badge ${n.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {channelAr[n.channel] || n.channel}: {n.ok ? 'نجح' : `فشل — ${n.error || ''}`}
              </span>
            ))}
            {(!lastResult.notifications_sent || lastResult.notifications_sent.length === 0) && (
              <span className="text-sm text-slate-500">لا إشعارات (لا شيكات مستحقة أو القنوات معطّلة)</span>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <h2 className="mb-3 font-semibold">سجل التذكيرات (آخر 100)</h2>
        {!logs ? (
          <Spinner />
        ) : logs.length === 0 ? (
          <EmptyState icon="🔔" title="لا توجد تذكيرات مُرسلة بعد" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="th">التوقيت</th>
                <th className="th">القناة</th>
                <th className="th">المستفيد</th>
                <th className="th">النتيجة</th>
                <th className="th">التفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="td">{formatDateTime(l.created_at)}</td>
                  <td className="td">{channelAr[l.channel] || l.channel}</td>
                  <td className="td">{l.payee_ar || '—'}</td>
                  <td className="td">{l.success ? '✅ نجح' : '❌ فشل'}</td>
                  <td className="td text-slate-500">{l.error || l.message || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
