// =============================================================================
// renderer/screens/PrintTemplateEditor.jsx — قوالب الطباعة (Module 2)
// Single-bank check-field positioning. The actual editor lives in the shared
// BankTemplateEditor component (also reused in Settings → إعدادات الطباعة).
// =============================================================================

import React from 'react';
import BankTemplateEditor from '../components/BankTemplateEditor.jsx';

export default function PrintTemplateEditor() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">قوالب الطباعة</h1>
      <div className="card">
        <BankTemplateEditor />
      </div>
    </div>
  );
}
