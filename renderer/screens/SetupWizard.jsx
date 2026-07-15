// =============================================================================
// renderer/screens/SetupWizard.jsx — معالج الإعداد الأولي
// Shown when required .env keys are missing. Collects Supabase (required) and
// optional Telegram/Google/SMTP secrets, writes them to .env via IPC, then lets
// the user set an initial PIN. Secrets go ONLY to .env (never SQLite).
// =============================================================================

import React, { useState } from 'react';
import { useToast } from '../components/Common.jsx';
import { validatePin } from '../utils/validators.js';

const STEPS = ['السحابة (إلزامي)', 'القنوات (اختياري)', 'الرقم السري'];

export default function SetupWizard({ onDone }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [env, setEnv] = useState({
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    SMTP_HOST: '',
    SMTP_PORT: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    SMTP_TO: '',
  });
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');

  const set = (k) => (e) => setEnv((s) => ({ ...s, [k]: e.target.value }));

  const canNext = () => {
    if (step === 0) return env.SUPABASE_URL.trim() && env.SUPABASE_ANON_KEY.trim();
    return true;
  };

  const finish = async () => {
    // PIN is optional but if provided must be valid + matching.
    if (pin || pin2) {
      const v = validatePin(pin);
      if (!v.valid) return toast(v.error, 'error');
      if (pin !== pin2) return toast('الرقم السري غير متطابق', 'error');
    }
    setSaving(true);
    try {
      const nonEmpty = Object.fromEntries(Object.entries(env).filter(([, v]) => String(v).trim()));
      const res = await window.api.app.saveEnv(nonEmpty);
      if (!res.ok) throw new Error(res.error || 'تعذّر الحفظ');
      if (pin) {
        const p = await window.api.auth.setPin(pin);
        if (!p.ok) throw new Error(p.error);
      }
      toast('تم الإعداد بنجاح', 'success');
      onDone();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <div className="text-4xl">🧾</div>
          <h1 className="mt-2 text-2xl font-bold">نظام الشيكات — الإعداد الأولي</h1>
          <p className="text-sm text-slate-500">شهد وهبة للتمور — ميلانو للتمور</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                  i <= step ? 'bg-sky-500 text-white' : 'bg-slate-200 text-slate-500'
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-xs ${i === step ? 'font-semibold' : 'text-slate-400'}`}>{s}</span>
              {i < STEPS.length - 1 && <span className="text-slate-300">—</span>}
            </div>
          ))}
        </div>

        {step === 0 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              أدخل بيانات مشروع Supabase الخاص بك. هذه القيم تُحفظ في ملف <code>.env</code> فقط.
            </p>
            <div>
              <label className="label">SUPABASE_URL</label>
              <input className="input" dir="ltr" value={env.SUPABASE_URL} onChange={set('SUPABASE_URL')} placeholder="https://xxxx.supabase.co" />
            </div>
            <div>
              <label className="label">SUPABASE_ANON_KEY</label>
              <input className="input" dir="ltr" type="password" value={env.SUPABASE_ANON_KEY} onChange={set('SUPABASE_ANON_KEY')} />
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">قنوات التذكير (يمكن تخطيها وإضافتها لاحقاً من الإعدادات).</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">TELEGRAM_BOT_TOKEN</label><input dir="ltr" className="input" type="password" value={env.TELEGRAM_BOT_TOKEN} onChange={set('TELEGRAM_BOT_TOKEN')} /></div>
              <div><label className="label">TELEGRAM_CHAT_ID</label><input dir="ltr" className="input" value={env.TELEGRAM_CHAT_ID} onChange={set('TELEGRAM_CHAT_ID')} /></div>
            </div>
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-medium">إعدادات البريد الإلكتروني SMTP</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><label className="label">SMTP_HOST</label><input dir="ltr" className="input" value={env.SMTP_HOST} onChange={set('SMTP_HOST')} /></div>
                <div><label className="label">SMTP_PORT</label><input dir="ltr" className="input" value={env.SMTP_PORT} onChange={set('SMTP_PORT')} /></div>
                <div><label className="label">SMTP_USER</label><input dir="ltr" className="input" value={env.SMTP_USER} onChange={set('SMTP_USER')} /></div>
                <div><label className="label">SMTP_PASS</label><input dir="ltr" className="input" type="password" value={env.SMTP_PASS} onChange={set('SMTP_PASS')} /></div>
                <div className="col-span-2"><label className="label">SMTP_TO (المستلم)</label><input dir="ltr" className="input" value={env.SMTP_TO} onChange={set('SMTP_TO')} /></div>
              </div>
            </details>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">عيّن رقماً سرياً لحماية التطبيق (اختياري — يمكن تعيينه لاحقاً).</p>
            <div><label className="label">الرقم السري (4–8 أرقام)</label><input className="input" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></div>
            <div><label className="label">تأكيد الرقم السري</label><input className="input" type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value)} /></div>
          </div>
        )}

        <div className="mt-8 flex justify-between">
          <button className="btn-secondary" disabled={step === 0 || saving} onClick={() => setStep((s) => s - 1)}>
            السابق
          </button>
          {step < STEPS.length - 1 ? (
            <button className="btn-primary" disabled={!canNext()} onClick={() => setStep((s) => s + 1)}>
              التالي
            </button>
          ) : (
            <button className="btn-primary" disabled={saving} onClick={finish}>
              {saving ? 'جارٍ الحفظ...' : 'إنهاء الإعداد'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
