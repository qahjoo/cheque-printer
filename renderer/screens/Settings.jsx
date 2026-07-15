// =============================================================================
// renderer/screens/Settings.jsx — الإعدادات (Module 6)
// Tabs: عام | التذكيرات | إعدادات الطباعة | المزامنة | النسخ الاحتياطي | الأمان
// Non-secret values persist to SQLite via settings IPC. Secrets stay in .env.
// Single bank only — no bank CRUD; the one bank's name/size/template is edited
// under "إعدادات الطباعة".
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useToast, Modal } from '../components/Common.jsx';
import { validateBankForm, validatePin } from '../utils/validators.js';
import { formatDateTime } from '../utils/dateHelpers.js';
import BankTemplateEditor from '../components/BankTemplateEditor.jsx';

const TABS = [
  { key: 'general', label: 'عام' },
  { key: 'reminders', label: 'التذكيرات' },
  { key: 'print', label: 'إعدادات الطباعة' },
  { key: 'sync', label: 'المزامنة' },
  { key: 'backup', label: 'النسخ الاحتياطي' },
  { key: 'security', label: 'الأمان' },
];

export default function Settings({ onCompanyChange }) {
  const [tab, setTab] = useState('general');
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">الإعدادات</h1>
      <div className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`btn ${tab === t.key ? 'bg-sky-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralTab onCompanyChange={onCompanyChange} />}
      {tab === 'reminders' && <RemindersTab />}
      {tab === 'print' && <PrintSettingsTab />}
      {tab === 'sync' && <SyncTab />}
      {tab === 'backup' && <BackupTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}

function useSettings() {
  const [settings, setSettings] = useState(null);
  const reload = useCallback(() => window.api.settings.getAll().then(setSettings), []);
  useEffect(() => { reload(); }, [reload]);
  return [settings, setSettings, reload];
}

function GeneralTab({ onCompanyChange }) {
  const toast = useToast();
  const [s, setS] = useSettings();
  const [form, setForm] = useState({});
  useEffect(() => { if (s) setForm(s); }, [s]);
  if (!s) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const uploadLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, company_logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const save = async () => {
    const keys = ['company_name', 'company_name_line2', 'company_logo', 'currency_singular', 'currency_plural', 'currency_cents_sing', 'currency_cents_plur', 'date_format', 'app_language'];
    const obj = Object.fromEntries(keys.map((k) => [k, form[k] ?? '']));
    const res = await window.api.settings.setMany(obj);
    if (res.ok) {
      toast('تم حفظ الإعدادات', 'success');
      onCompanyChange && onCompanyChange({ line1: form.company_name, line2: form.company_name_line2 });
    } else toast('تعذّر حفظ بعض القيم', 'error');
  };

  return (
    <div className="card max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">اسم الشركة</label><input className="input" value={form.company_name || ''} onChange={set('company_name')} /></div>
        <div><label className="label">اسم الشركة (سطر ثانٍ)</label><input className="input" value={form.company_name_line2 || ''} onChange={set('company_name_line2')} /></div>
      </div>
      <div>
        <label className="label">شعار الشركة</label>
        <div className="flex items-center gap-3">
          {form.company_logo && <img src={form.company_logo} alt="logo" className="h-14 w-14 rounded object-cover" />}
          <input type="file" accept="image/*" onChange={uploadLogo} />
          {form.company_logo && <button className="btn-ghost text-sm" onClick={() => setForm((f) => ({ ...f, company_logo: '' }))}>إزالة</button>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">العملة (مفرد)</label><input className="input" value={form.currency_singular || ''} onChange={set('currency_singular')} /></div>
        <div><label className="label">العملة (جمع)</label><input className="input" value={form.currency_plural || ''} onChange={set('currency_plural')} /></div>
        <div><label className="label">الفلس (مفرد)</label><input className="input" value={form.currency_cents_sing || ''} onChange={set('currency_cents_sing')} /></div>
        <div><label className="label">الفلس (جمع)</label><input className="input" value={form.currency_cents_plur || ''} onChange={set('currency_cents_plur')} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">تنسيق التاريخ</label>
          <select className="input" value={form.date_format || 'dd/mm/yyyy'} onChange={set('date_format')}>
            <option value="dd/mm/yyyy">dd/mm/yyyy</option>
            <option value="yyyy-mm-dd">yyyy-mm-dd</option>
          </select>
        </div>
        <div>
          <label className="label">لغة التطبيق</label>
          <select className="input" value={form.app_language || 'ar'} onChange={set('app_language')} disabled>
            <option value="ar">العربية</option>
          </select>
        </div>
      </div>
      <button className="btn-primary" onClick={save}>حفظ</button>
    </div>
  );
}

function RemindersTab() {
  const toast = useToast();
  const [s] = useSettings();
  const [form, setForm] = useState({});
  const [logOpen, setLogOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [testing, setTesting] = useState('');   // '' | 'desktop' | 'telegram' | 'all'
  useEffect(() => { if (s) setForm(s); }, [s]);
  if (!s) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked ? '1' : '0' }));

  const save = async () => {
    const keys = ['reminder_days_ahead', 'reminders_per_day', 'reminder_start_hour', 'reminder_end_hour', 'channel_desktop', 'channel_telegram', 'channel_email'];
    const obj = Object.fromEntries(keys.map((k) => [k, form[k] ?? '']));
    const res = await window.api.settings.setMany(obj);
    toast(res.ok ? 'تم الحفظ' : 'تعذّر الحفظ', res.ok ? 'success' : 'error');
  };

  const testDesktop = async () => {
    setTesting('desktop');
    const res = await window.api.reminders.testDesktop();
    setTesting('');
    if (res.ok) toast('✅ إشعار سطح المكتب يعمل — تحقق من شريط الإشعارات', 'success');
    else toast(`❌ فشل سطح المكتب: ${res.error}`, 'error');
  };

  const testTelegram = async () => {
    setTesting('telegram');
    const res = await window.api.reminders.testTelegram();
    setTesting('');
    if (res.ok) toast('✅ تيليغرام يعمل — تحقق من المحادثة', 'success');
    else toast(`❌ فشل تيليغرام: ${res.error}`, 'error');
  };

  const testAll = async () => {
    setTesting('all');
    const res = await window.api.reminders.test();
    setTesting('');
    const ok = (res.notifications_sent || []).filter((n) => n.ok).length;
    toast(`اكتمل الاختبار: ${res.checks_found} شيك مُستحق — ${ok} إشعار ناجح`, ok > 0 ? 'success' : 'info');
  };

  const openLog = async () => {
    setLogs(await window.api.reminders.log(100));
    setLogOpen(true);
  };

  return (
    <div className="card max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><label className="label">عدد أيام التنبيه المسبق (1–30)</label><input type="number" min="1" max="30" className="input" value={form.reminder_days_ahead || ''} onChange={set('reminder_days_ahead')} /></div>
        <div><label className="label">عدد التذكيرات يومياً (1–12)</label><input type="number" min="1" max="12" className="input" value={form.reminders_per_day || ''} onChange={set('reminders_per_day')} /></div>
        <div><label className="label">بداية ساعات التذكير</label><input type="time" className="input" value={form.reminder_start_hour || '08:00'} onChange={set('reminder_start_hour')} /></div>
        <div><label className="label">نهاية ساعات التذكير</label><input type="time" className="input" value={form.reminder_end_hour || '20:00'} onChange={set('reminder_end_hour')} /></div>
      </div>

      {/* Channel toggles + individual test buttons */}
      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.channel_desktop === '1'} onChange={toggle('channel_desktop')} />
            <span>🖥️ إشعارات سطح المكتب</span>
          </label>
          <button
            className="btn-secondary !px-3 !py-1 text-xs"
            disabled={testing === 'desktop'}
            onClick={testDesktop}
          >
            {testing === 'desktop' ? '...' : 'اختبار'}
          </button>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.channel_telegram === '1'} onChange={toggle('channel_telegram')} />
            <span>✈️ تيليغرام</span>
          </label>
          <button
            className="btn-secondary !px-3 !py-1 text-xs"
            disabled={testing === 'telegram'}
            onClick={testTelegram}
          >
            {testing === 'telegram' ? '...' : 'اختبار'}
          </button>
        </div>
        {form.channel_telegram === '1' && (
          <p className="mr-6 text-xs text-slate-500">يُضبط TELEGRAM_BOT_TOKEN و TELEGRAM_CHAT_ID في ملف .env</p>
        )}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.channel_email === '1'} onChange={toggle('channel_email')} />
            <span>📧 بريد إلكتروني</span>
          </label>
        </div>
        {form.channel_email === '1' && (
          <p className="mr-6 text-xs text-slate-500">تُضبط قيم SMTP في ملف .env</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={save}>حفظ</button>
        <button className="btn-secondary" disabled={testing === 'all'} onClick={testAll}>
          {testing === 'all' ? 'جارٍ الاختبار...' : '🔔 اختبار الكل'}
        </button>
        <button className="btn-ghost" onClick={openLog}>سجل التذكيرات</button>
      </div>

      <Modal open={logOpen} title="سجل التذكيرات (آخر 100)" onClose={() => setLogOpen(false)} size="lg">
        <table className="w-full text-sm">
          <thead><tr className="border-b"><th className="th">التوقيت</th><th className="th">القناة</th><th className="th">النتيجة</th><th className="th">التفاصيل</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="td">{formatDateTime(l.created_at)}</td>
                <td className="td">{l.channel}</td>
                <td className="td">{l.success ? '✅' : '❌'}</td>
                <td className="td text-slate-500">{l.error || l.message || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Modal>
    </div>
  );
}

// ---- Reusable printer selector ------------------------------------------
function PrinterSelector({ label, hint, settingKey, value, onChange }) {
  const [printers, setPrinters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.print.getPrinters().then((res) => {
      setPrinters((res.printers || []).filter((p) => p.name));
      setLoading(false);
    });
  }, []);

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        {loading ? (
          <p className="text-sm text-slate-400 animate-pulse">جارٍ تحميل الطابعات...</p>
        ) : (
          <select
            className="input flex-1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— اختر الطابعة —</option>
            {printers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.displayName || p.name}{p.isDefault ? ' ★ (الافتراضية)' : ''}
              </option>
            ))}
          </select>
        )}
        {value && (
          <button
            className="btn-ghost text-xs"
            onClick={() => onChange('')}
          >
            مسح
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

// Single-bank print settings: edit the one bank's name + check dimensions,
// choose printers for cheques and reports, and set field positions.
function PrintSettingsTab() {
  const toast = useToast();
  const [bank, setBank] = useState(null);
  const [form, setForm] = useState({ name_ar: '', check_width_mm: 165, check_height_mm: 82 });
  const [errors, setErrors] = useState({});
  const [editorKey, setEditorKey] = useState(0);
  const [s, , reloadSettings] = useSettings();
  const [chequePrinter, setChequePrinter] = useState('');
  const [reportPrinter, setReportPrinter] = useState('');
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const load = useCallback(async () => {
    const banks = await window.api.banks.list();
    const b = (banks || [])[0];
    if (b) {
      setBank(b);
      setForm({ name_ar: b.name_ar, check_width_mm: b.check_width_mm, check_height_mm: b.check_height_mm });
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (s) {
      setChequePrinter(s.cheque_printer_name || '');
      setReportPrinter(s.report_printer_name || '');
      setOffsetX(Number(s.print_offset_x) || 0);
      setOffsetY(Number(s.print_offset_y) || 0);
    }
  }, [s]);

  const saveBank = async () => {
    const v = validateBankForm(form);
    setErrors(v.errors);
    if (!v.valid) return;
    const res = await window.api.banks.update({
      id: bank.id,
      name_ar: form.name_ar,
      name_en: bank.name_en,
      check_width_mm: Number(form.check_width_mm),
      check_height_mm: Number(form.check_height_mm),
    });
    if (res.ok) {
      toast('تم حفظ إعدادات البنك', 'success');
      await load();
      setEditorKey((k) => k + 1);
    } else {
      toast(res.error, 'error');
    }
  };

  const savePrinters = async () => {
    const res = await window.api.settings.setMany({
      cheque_printer_name: chequePrinter,
      report_printer_name: reportPrinter,
      print_offset_x: offsetX.toString(),
      print_offset_y: offsetY.toString(),
    });
    if (res.ok) {
      toast('تم حفظ إعدادات الطابعة', 'success');
      reloadSettings();
    } else {
      toast('تعذّر الحفظ', 'error');
    }
  };

  if (!bank) return <div className="card">لا يوجد بنك مُعرَّف.</div>;

  return (
    <div className="space-y-6">

      {/* ---- Printer Selection ---- */}
      <div className="card max-w-2xl space-y-4">
        <h2 className="font-semibold">🖨️ إعدادات الطابعة</h2>

        {/* Info box */}
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
          <p className="mb-1 font-medium">💡 كيفية ضبط الـ Tray تلقائياً</p>
          <ol className="mr-4 list-decimal space-y-1 text-xs">
            <li>افتح <strong>الإعدادات ← الطابعات والماسحات الضوئية</strong> في Windows</li>
            <li>أضف طابعة Samsung مرتين وسمّها مثلاً:
              <br /><code className="rounded bg-sky-100 px-1">Samsung - شيكات (Tray 2)</code> و <code className="rounded bg-sky-100 px-1">Samsung - A4 (Tray 1)</code></li>
            <li>لكل نسخة: اضغط <strong>Printer Properties ← Device Settings</strong> واضبط الـ Default Paper Source</li>
            <li>اختر كل طابعة في الحقول أدناه — عند الطباعة لن يظهر أي dialog</li>
          </ol>
        </div>

        <PrinterSelector
          label="طابعة الشيكات (Tray 2)"
          hint="الطابعة التي تغذّي الشيكات من الدرج الثاني. عند اختيارها ستطبع الشيكات بصمت بدون نافذة."
          settingKey="cheque_printer_name"
          value={chequePrinter}
          onChange={setChequePrinter}
        />

        <PrinterSelector
          label="طابعة التقارير / A4 (Tray 1)"
          hint="الطابعة التي تغذّي ورق A4 العادي للتقارير والنسخ الاحتياطية."
          settingKey="report_printer_name"
          value={reportPrinter}
          onChange={setReportPrinter}
        />

        {/* Status indicators */}
        <div className="flex gap-4 text-sm">
          <span className={`flex items-center gap-1 ${chequePrinter ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`h-2 w-2 rounded-full ${chequePrinter ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            {chequePrinter ? `شيكات → ${chequePrinter}` : 'شيكات → dialog عند الطباعة'}
          </span>
        </div>
        <div className="flex gap-4 text-sm">
          <span className={`flex items-center gap-1 ${reportPrinter ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`h-2 w-2 rounded-full ${reportPrinter ? 'bg-emerald-400' : 'bg-slate-300'}`} />
            {reportPrinter ? `تقارير → ${reportPrinter}` : 'تقارير → dialog عند الطباعة'}
          </span>
        </div>

        {/* Global Printer Offsets */}
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <h3 className="font-medium text-amber-900 mb-2">📐 إزاحة الطباعة الدقيقة (لحل مشكلة الهوامش الإجبارية للطابعة)</h3>
          <p className="text-xs text-amber-800 mb-3">إذا كانت الطباعة تظهر مزاحة رغم صحة التصميم في القالب، أدخل الإزاحة هنا بالمليمتر (يمكن استخدام قيم سالبة وموجبة).</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">الإزاحة الأفقية (X) مم</label>
              <input type="number" step="0.5" className="input" value={offsetX} onChange={(e) => setOffsetX(e.target.value)} />
            </div>
            <div>
              <label className="label">الإزاحة العمودية (Y) مم</label>
              <input type="number" step="0.5" className="input" value={offsetY} onChange={(e) => setOffsetY(e.target.value)} />
            </div>
          </div>
        </div>

        <button className="btn-primary" onClick={savePrinters}>💾 حفظ إعدادات الطابعة والإزاحة</button>
      </div>

      {/* ---- Bank dimensions ---- */}
      <div className="card max-w-2xl space-y-4">
        <h2 className="font-semibold">📄 أبعاد الشيك والبنك</h2>
        <div>
          <label className="label">اسم البنك</label>
          <input className="input" value={form.name_ar} onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))} />
          {errors.name_ar && <p className="field-error">{errors.name_ar}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">عرض الشيك (مم)</label>
            <input type="number" className="input" value={form.check_width_mm} onChange={(e) => setForm((f) => ({ ...f, check_width_mm: e.target.value }))} />
            {errors.check_width_mm && <p className="field-error">{errors.check_width_mm}</p>}
          </div>
          <div>
            <label className="label">ارتفاع الشيك (مم)</label>
            <input type="number" className="input" value={form.check_height_mm} onChange={(e) => setForm((f) => ({ ...f, check_height_mm: e.target.value }))} />
            {errors.check_height_mm && <p className="field-error">{errors.check_height_mm}</p>}
          </div>
        </div>
        <button className="btn-primary" onClick={saveBank}>حفظ بيانات البنك</button>
      </div>

      {/* ---- Field positions ---- */}
      <div className="card">
        <h2 className="mb-4 font-semibold">🎯 مواضع الحقول على الشيك</h2>
        <BankTemplateEditor key={editorKey} liveWidth={form.check_width_mm} liveHeight={form.check_height_mm} />
      </div>
    </div>
  );
}


function SyncTab() {
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    setStatus(await window.api.sync.status());
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  const syncNow = async () => {
    setSyncing(true);
    const res = await window.api.sync.now();
    setSyncing(false);
    if (res.ok) toast(`تمت المزامنة: ${res.drained} عنصر${res.offline ? ' (غير متصل)' : ''}`, res.offline ? 'warn' : 'success');
    else toast(res.error, 'error');
    load();
  };

  const retryFailed = async () => {
    setRetrying(true);
    const res = await window.api.sync.retryFailed();
    setRetrying(false);
    if (res.ok) toast(`أعادة المحاولة: ${res.reset} عنصر — نجح: ${res.drained}`, 'success');
    else toast(res.error || 'فشل', 'error');
    load();
  };

  return (
    <div className="max-w-2xl space-y-4">
      <div className="card space-y-3">
        <h2 className="font-semibold">حالة المزامنة السحابية (Supabase)</h2>
        {!status ? <p className="text-slate-400 animate-pulse">جارٍ التحميل...</p> : (
          <>
            {/* Online indicator */}
            <div className="flex items-center gap-2 text-sm">
              <span className={`h-3 w-3 rounded-full transition-colors ${
                !status.configured ? 'bg-slate-400' :
                status.online ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-rose-400'
              }`} />
              <span className="font-medium">
                {!status.configured ? '⚙️ غير مُهيأ — راجع ملف .env' :
                 status.online ? '✅ متصل بـ Supabase' : '🔴 غير متصل (الوضع الإيقاعي)'}
              </span>
            </div>

            <p className="text-xs text-slate-500">آخر مزامنة: {status.lastSyncAt ? formatDateTime(status.lastSyncAt) : 'لم تتم بعد'}</p>

            {/* Queue stats */}
            <div className="flex gap-4 text-sm">
              <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-800">
                🕐 انتظار: <strong>{status.pending}</strong>
              </span>
              {status.failed > 0 && (
                <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-800">
                  ❌ فشل: <strong>{status.failed}</strong>
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" onClick={syncNow}
                disabled={!status.configured || syncing}>
                {syncing ? '⏳ جارٍ...' : '🔄 مزامنة الآن'}
              </button>
              {status.failed > 0 && (
                <button className="btn-secondary" onClick={retryFailed} disabled={retrying}>
                  {retrying ? '⏳...' : `↩️ إعادة المحاولة (${status.failed})`}
                </button>
              )}
              <button className="btn-ghost" onClick={load}>تحديث</button>
            </div>

            {!status.configured && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                💡 يعمل النظام بالكامل بدون إنترنت. أضف SUPABASE_URL و SUPABASE_ANON_KEY إلى ملف .env لتفعيل المزامنة.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BackupTab() {
  const toast = useToast();
  const [s, , reload] = useSettings();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  if (!s) return null;

  const exp = async () => {
    setExporting(true);
    const res = await window.api.backup.export();
    setExporting(false);
    if (res.ok) {
      toast(`✅ تم التصدير — ${res.count} سجل`, 'success');
      reload();
    } else if (!res.canceled) toast(res.error, 'error');
  };

  const imp = async () => {
    if (!confirm('سيتم دمج البيانات المستوردة مع الحالية (بدون تكرار). متابعة؟')) return;
    setImporting(true);
    const res = await window.api.backup.import();
    setImporting(false);
    if (res.ok) {
      const d = res.merged || {};
      const detail = [
        d.banks      ? `${d.banks} بنك`        : '',
        d.checks     ? `${d.checks} شيك`       : '',
        d.templates  ? `${d.templates} قالب`   : '',
        d.print_history ? `${d.print_history} طباعة` : '',
      ].filter(Boolean).join(' + ');
      toast(`✅ تم الاستيراد: ${detail}`, 'success');
      reload();
    } else if (!res.canceled) toast(res.error, 'error');
  };

  return (
    <div className="card max-w-2xl space-y-4">
      <h2 className="font-semibold">💾 النسخ الاحتياطي</h2>
      <p className="text-sm text-slate-500">
        آخر نسخة: {s.last_backup_at ? formatDateTime(s.last_backup_at) : '—'}
      </p>
      <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
        📦 يشمل التصدير: الشيكات + البنوك + القوالب + سجل الطباعة + الإعدادات + سجل المراجعة (آخر 5000).
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={exp} disabled={exporting}>
          {exporting ? '⏳ جارٍ التصدير...' : '⬇️ تصدير نسخة احتياطية'}
        </button>
        <button className="btn-secondary" onClick={imp} disabled={importing}>
          {importing ? '⏳ جارٍ الاستيراد...' : '⬆️ استيراد نسخة احتياطية'}
        </button>
      </div>
    </div>
  );
}

function SecurityTab() {
  const toast = useToast();
  const [f, setF] = useState({ currentPin: '', newPin: '', confirmPin: '' });
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const change = async () => {
    const v = validatePin(f.newPin);
    if (!v.valid) return toast(v.error, 'error');
    if (f.newPin !== f.confirmPin) return toast('الرقم السري الجديد غير متطابق', 'error');
    const res = await window.api.auth.changePin({ currentPin: f.currentPin, newPin: f.newPin });
    if (res.ok) { toast('تم تغيير الرقم السري', 'success'); setF({ currentPin: '', newPin: '', confirmPin: '' }); }
    else toast(res.error, 'error');
  };

  // Return to the PIN lock screen by re-running the app shell (re-locks if a PIN is set).
  const lock = () => window.location.reload();

  return (
    <div className="card max-w-md space-y-3">
      <h2 className="font-semibold">تغيير الرقم السري</h2>
      <div><label className="label">الرقم الحالي</label><input type="password" className="input" value={f.currentPin} onChange={set('currentPin')} /></div>
      <div><label className="label">الرقم الجديد</label><input type="password" className="input" value={f.newPin} onChange={set('newPin')} /></div>
      <div><label className="label">تأكيد الرقم الجديد</label><input type="password" className="input" value={f.confirmPin} onChange={set('confirmPin')} /></div>
      <div className="flex gap-2 pt-2">
        <button className="btn-primary" onClick={change}>تغيير</button>
        <button className="btn-danger" onClick={lock}>تسجيل الخروج / قفل التطبيق</button>
      </div>
    </div>
  );
}
