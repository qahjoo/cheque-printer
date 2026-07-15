// =============================================================================
// renderer/App.jsx — الموجّه + الشريط الجانبي + التخطيط + بوابة القفل
// Boot flow: read ?boot=setup|ready -> if setup, force Setup Wizard.
// Otherwise show PIN lock (if a PIN is set) before revealing the app shell.
// Sidebar is on the right (RTL). Listens for main-process 'navigate' events.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, useNavigate, Navigate } from 'react-router-dom';
import { ToastProvider } from './components/Common.jsx';
import PinLock from './screens/PinLock.jsx';
import SetupWizard from './screens/SetupWizard.jsx';
import Dashboard from './screens/Dashboard.jsx';
import CheckForm from './screens/CheckForm.jsx';
import ChecksList from './screens/ChecksList.jsx';
import PrintTemplateEditor from './screens/PrintTemplateEditor.jsx';
import PrintPreview from './screens/PrintPreview.jsx';
import Templates from './screens/Templates.jsx';
import TemplateDesigner from './screens/TemplateDesigner.jsx';
import PrintCheque from './screens/PrintCheque.jsx';
import History from './screens/History.jsx';
import Reports from './screens/Reports.jsx';
import Settings from './screens/Settings.jsx';
import AuditLog from './screens/AuditLog.jsx';
import ReminderLogs from './screens/ReminderLogs.jsx';
import IncomingChecksList from './screens/IncomingChecksList.jsx';
import CheckFormIncoming from './screens/CheckFormIncoming.jsx';

function UpdaterToast() {
  const [msg, setMsg] = useState('');
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (window.api && window.api.updater) {
      window.api.updater.onMessage((data) => {
        setMsg(data.text);
        if (data.progressObj) {
          setProgress(data.progressObj.percent);
        }
        
        // Auto-hide after 5 seconds if it's a final state message
        if (data.text.includes('أحدث نسخة') || data.text.includes('خطأ')) {
          setTimeout(() => {
            setMsg('');
            setProgress(null);
          }, 5000);
        }
      });
    }
  }, []);

  if (!msg) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 rounded-lg bg-sky-900/90 px-4 py-3 text-white shadow-xl backdrop-blur-md border border-sky-700">
      <div className="flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          {progress !== null ? <span className="animate-spin text-sky-400">🔄</span> : <span className="text-sky-400">ℹ️</span>}
          <span className="text-sm font-medium">{msg}</span>
        </div>
        <button onClick={() => setMsg('')} className="text-slate-400 hover:text-white transition-colors">
          ✕
        </button>
      </div>
      {progress !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
          <div 
            className="h-full bg-sky-400 transition-all duration-300" 
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

const NAV = [
  { to: '/dashboard', icon: '📊', label: 'لوحة التحكم' },
  { to: '/print', icon: '🖨️', label: 'طباعة شيك' },
  { to: '/templates', icon: '🗂️', label: 'القوالب' },
  { to: '/history', icon: '📜', label: 'سجل الطباعة' },
  { to: '/checks/new', icon: '➕', label: 'شيك جديد' },
  { to: '/checks', icon: '📋', label: 'الشيكات الصادرة' },
  { to: '/incoming-checks', icon: '📥', label: 'الشيكات الواردة' },
  { to: '/reports', icon: '📈', label: 'التقارير' },
  { to: '/reminders', icon: '🔔', label: 'التذكيرات' },
  { to: '/audit', icon: '🧾', label: 'سجل المراجعة' },
  { to: '/settings', icon: '⚙️', label: 'الإعدادات' },
];

// Three-state sync indicator (CHANGE 6):
//   🟢 متصل — يتزامن       online + queue empty
//   🟡 متصل — في الانتظار   online + queue has items
//   🔴 غير متصل — وضع محلي  offline
function SyncIndicator({ status }) {
  let dot = 'bg-rose-400';
  let label = 'غير متصل — وضع محلي';
  if (status.online && status.pending > 0) {
    dot = 'bg-amber-400';
    label = 'متصل — في الانتظار';
  } else if (status.online) {
    dot = 'bg-emerald-400';
    label = 'متصل — يتزامن';
  }
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
      <span className="text-slate-400">{label}</span>
      {status.online && status.pending > 0 && (
        <span className="text-slate-500">({status.pending})</span>
      )}
    </div>
  );
}

function Sidebar({ company, syncStatus, onLock }) {
  return (
    <aside className="flex w-52 shrink-0 flex-col bg-gray-900 text-gray-200">
      <div className="border-b border-gray-700 px-4 py-4 text-right">
        <div className="text-sm font-bold text-amber-400">{company?.line1 || 'شهد وهبة للتمور'}</div>
        <div className="text-xs text-gray-400">{company?.line2 || 'ميلانو للتمور'}</div>
      </div>
      <nav className="flex-1 py-2">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 text-right text-sm transition ${
                isActive ? 'bg-amber-600 text-white' : 'hover:bg-gray-700'
              }`
            }
          >
            <span className="text-lg">{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-gray-700 p-3 text-xs">
        <SyncIndicator status={syncStatus} />
        <button className="btn-ghost w-full !justify-start !text-gray-300" onClick={onLock}>
          🔒 تسجيل الخروج
        </button>
      </div>
    </aside>
  );
}

function Shell({ children, company, syncStatus, onLock }) {
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar company={company} syncStatus={syncStatus} onLock={onLock} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
      <UpdaterToast />
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [bootMode, setBootMode] = useState(null); // 'setup' | 'ready'
  const [unlocked, setUnlocked] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [company, setCompany] = useState({ line1: '', line2: '' });
  const [syncStatus, setSyncStatus] = useState({ online: false, pending: 0 });

  // Determine boot mode from the query string set by main.js.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qBoot = params.get('boot');
    (async () => {
      let mode = qBoot;
      if (!mode && window.api) mode = await window.api.app.getBootMode();
      setBootMode(mode || 'ready');
      if (window.api) {
        const pin = await window.api.auth.hasPin();
        setHasPin(!!pin.hasPin);
        if (!pin.hasPin) setUnlocked(true); // no PIN yet -> allow through
        const s = await window.api.settings.getAll();
        setCompany({ line1: s.company_name || 'نظام الشيكات', line2: s.company_name_line2 || '' });
      }
    })();
  }, []);

  // Listen for tray/notification navigation + connectivity/queue polling.
  // Offline-first: being offline is a status, never an error popup. When the
  // connection is restored (offline -> online) we drain the queue immediately.
  useEffect(() => {
    if (!window.api) return undefined;
    const off = window.api.app.onNavigate((route) => navigate(route));
    let wasOnline = false;
    const poll = async () => {
      try {
        const [conn, sync] = await Promise.all([
          window.api.app.onlineStatus(),
          window.api.sync.status(),
        ]);
        const online = !!conn.online;
        setSyncStatus({ online, pending: sync.pending || 0 });
        if (online && !wasOnline) {
          // Connection restored — drain the sync queue automatically (silent).
          window.api.sync.now().catch(() => {});
        }
        wasOnline = online;
      } catch {
        setSyncStatus((s) => ({ ...s, online: false }));
        wasOnline = false;
      }
    };
    poll();
    const id = setInterval(poll, 30000);
    return () => {
      off && off();
      clearInterval(id);
    };
  }, [navigate]);

  const handleLock = useCallback(() => {
    if (hasPin) {
      setUnlocked(false);
      navigate('/dashboard');
    }
  }, [hasPin, navigate]);

  const handleSetupDone = useCallback(() => {
    setBootMode('ready');
    navigate('/dashboard');
  }, [navigate]);

  if (bootMode === null) {
    return <div className="flex h-screen items-center justify-center text-slate-400">جارٍ التحميل...</div>;
  }

  if (bootMode === 'setup') {
    return (
      <ToastProvider>
        <SetupWizard onDone={handleSetupDone} />
      </ToastProvider>
    );
  }

  if (hasPin && !unlocked) {
    return (
      <ToastProvider>
        <PinLock company={company} onUnlock={() => setUnlocked(true)} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <Shell company={company} syncStatus={syncStatus} onLock={handleLock}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/checks" element={<ChecksList />} />
          <Route path="/checks/new" element={<CheckForm />} />
          <Route path="/checks/:id/edit" element={<CheckForm />} />
          <Route path="/print" element={<PrintCheque />} />
          <Route path="/templates" element={<Templates />} />
          <Route path="/templates/designer/:id" element={<TemplateDesigner />} />
          <Route path="/history" element={<History />} />
          <Route path="/checks/:id/print" element={<PrintPreview />} />
          <Route path="/print-templates" element={<PrintTemplateEditor />} />
          <Route path="/incoming-checks" element={<IncomingChecksList />} />
          <Route path="/incoming-checks/new" element={<CheckFormIncoming />} />
          <Route path="/incoming-checks/:id/edit" element={<CheckFormIncoming />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/reminders" element={<ReminderLogs />} />
          <Route path="/audit" element={<AuditLog />} />
          <Route path="/settings" element={<Settings onCompanyChange={setCompany} />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Shell>
    </ToastProvider>
  );
}
