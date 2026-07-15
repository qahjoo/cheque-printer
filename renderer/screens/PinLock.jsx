// =============================================================================
// renderer/screens/PinLock.jsx — شاشة قفل الرقم السري
// iPhone-style masked circles. 5 wrong attempts -> main process locks 5 min.
// "نسيت الرقم السري" -> message to contact the administrator.
// =============================================================================

import React, { useState, useEffect, useCallback } from 'react';

export default function PinLock({ company, onUnlock }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [lockMs, setLockMs] = useState(0);
  const [shake, setShake] = useState(false);

  // Poll remaining lock time.
  useEffect(() => {
    let id;
    const check = async () => {
      const s = await window.api.auth.lockState();
      setLockMs(s.remainingMs || 0);
    };
    check();
    id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);

  const submit = useCallback(
    async (value) => {
      const res = await window.api.auth.verifyPin(value);
      if (res.ok) {
        setError('');
        onUnlock();
      } else {
        setPin('');
        setShake(true);
        setTimeout(() => setShake(false), 400);
        setError(res.error || 'الرقم السري غير صحيح');
        if (res.locked) setLockMs(res.remainingMs || 0);
      }
    },
    [onUnlock]
  );

  const press = (digit) => {
    if (lockMs > 0) return;
    const next = (pin + digit).slice(0, 8);
    setPin(next);
  };

  const backspace = () => setPin((p) => p.slice(0, -1));

  // Keyboard support.
  useEffect(() => {
    const onKey = (e) => {
      if (lockMs > 0) return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') backspace();
      else if (e.key === 'Enter' && pin.length >= 4) submit(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin, lockMs, submit]);

  const locked = lockMs > 0;
  const lockText = locked ? `مقفل لمدة ${Math.ceil(lockMs / 1000)} ثانية` : '';

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-slate-900 text-white">
      {company?.logo ? (
        <img src={company.logo} alt="logo" className="mb-4 h-20 w-20 rounded-full object-cover" />
      ) : (
        <div className="mb-4 text-5xl">🧾</div>
      )}
      <h1 className="text-2xl font-bold">{company?.line1 || 'نظام الشيكات'}</h1>
      {company?.line2 && <p className="mt-1 text-slate-400">{company.line2}</p>}

      <div className={`mt-8 flex gap-3 ${shake ? 'animate-pulse' : ''}`}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 ${
              i < pin.length ? 'border-sky-400 bg-sky-400' : 'border-slate-500'
            }`}
          />
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
      {locked && <p className="mt-2 text-sm text-amber-400">{lockText}</p>}

      <div className="mt-8 grid grid-cols-3 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
          <button
            key={d}
            disabled={locked}
            onClick={() => press(String(d))}
            className="h-16 w-16 rounded-full bg-slate-800 text-2xl font-semibold hover:bg-slate-700 disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button className="h-16 w-16 rounded-full text-sm text-slate-400 hover:bg-slate-800" onClick={backspace}>
          مسح
        </button>
        <button
          disabled={locked}
          onClick={() => press('0')}
          className="h-16 w-16 rounded-full bg-slate-800 text-2xl font-semibold hover:bg-slate-700 disabled:opacity-40"
        >
          0
        </button>
        <button
          disabled={locked || pin.length < 4}
          onClick={() => submit(pin)}
          className="h-16 w-16 rounded-full bg-sky-500 text-sm font-semibold hover:bg-sky-600 disabled:opacity-40"
        >
          دخول
        </button>
      </div>

      <button
        className="mt-6 text-xs text-slate-500 hover:text-slate-300"
        onClick={() => setError('نسيت الرقم السري؟ تواصل مع المسؤول.')}
      >
        نسيت الرقم السري؟
      </button>
    </div>
  );
}
