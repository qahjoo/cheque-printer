// =============================================================================
// renderer/lib/templateFields.js — بيانات حقول القالب المشتركة + تحويل mm↔px
// =============================================================================

// 1mm at 96dpi = 96/25.4 px. Used for on-screen rendering; print uses real mm.
export const MM_TO_PX = 96 / 25.4;

// Canonical field order + Arabic labels + sample text for the designer preview.
export const FIELD_META = {
  payee:         { label: 'المستفيد',           sample: 'شركة الفرات لتعبئة التمور' },
  amount_words:  { label: 'المبلغ كتابةً',       sample: 'مائة وخمسون ديناراً وخمسمائة فلس' },
  amount_number: { label: 'المبلغ رقماً (دينار)', sample: '150' },
  amount_fils:   { label: 'الفلسات / القروش',    sample: '500' },
  date:          { label: 'التاريخ',             sample: '14/07/2026' },
  purpose:       { label: 'البيان / الغرض',      sample: 'دفعة مقابل فاتورة' },
  cheque_number: { label: 'رقم الشيك',           sample: '100245' },
  crossed:       { label: 'مسطّر (//)',           sample: '// &Co' },
};

export const FIELD_ORDER = [
  'payee', 'amount_words', 'amount_number', 'amount_fils',
  'date', 'purpose', 'cheque_number', 'crossed',
];

// Map real cheque data → field value strings (used by preview + print).
// amount_number = integer dinar part only  (e.g. "150")
// amount_fils   = fils/cents part as 3-digit string (e.g. "500")
export function fieldValues(data) {
  return {
    payee:         data.payee         || '',
    amount_words:  data.amount_words  || '',
    amount_number: data.amount_number || '',
    amount_fils:   data.amount_fils   || '',
    date:          data.date          || '',
    purpose:       data.purpose       || '',
    cheque_number: data.cheque_number || '',
    crossed:       data.crossed ? '// &Co' : '',
  };
}

// Split a decimal amount into { dinars, filsStr }.
// e.g. 475.140 → { dinars: 475, filsStr: '140' }
// e.g. 475.14  → { dinars: 475, filsStr: '140' }  (14 cents = 140 fils)
export function splitAmount(amount) {
  const v = Math.abs(Number(amount) || 0);
  const dinars = Math.floor(v);
  const fils = Math.round((v - dinars) * 1000);
  const filsStr = fils > 0 ? String(fils).padStart(3, '0') : '';
  return { dinars, filsStr };
}

// Inline style for a field positioned in mm (px on screen). RTL origin: x from right.
export function fieldStyle(f, unit = 'px') {
  const k = unit === 'mm' ? 1 : MM_TO_PX;
  const suffix = unit === 'mm' ? 'mm' : 'px';
  return {
    position: 'absolute',
    top:      `${f.y_mm * k}${suffix}`,
    right:    `${f.x_mm * k}${suffix}`,
    fontSize: unit === 'mm' ? `${f.font_size}pt` : `${f.font_size * (96 / 72)}px`,
    fontWeight:  f.font_weight || '400',
    color:       f.color       || '#000000',
    direction:   f.direction   || 'rtl',
    textAlign:   f.align       || 'right',
    fontFamily:  `${f.font_family || 'Cairo'}, Tahoma, sans-serif`,
    whiteSpace:  'nowrap',
  };
}
