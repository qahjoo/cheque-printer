// =============================================================================
// renderer/utils/validators.js — التحقق من صحة المدخلات (رسائل عربية)
// Returns { valid, errors } objects; screens map errors to field messages.
// =============================================================================

export function isBlank(v) {
  return v === undefined || v === null || String(v).trim() === '';
}

// Amount: positive number, up to 3 decimals (fils).
export function validateAmount(value) {
  if (isBlank(value)) return { valid: false, error: 'المبلغ مطلوب' };
  const n = Number(value);
  if (Number.isNaN(n)) return { valid: false, error: 'المبلغ يجب أن يكون رقماً' };
  if (n < 0) return { valid: false, error: 'المبلغ لا يمكن أن يكون سالباً' };
  if (n > 999999999) return { valid: false, error: 'المبلغ كبير جداً' };
  const decimals = String(value).split('.')[1];
  if (decimals && decimals.length > 3) {
    return { valid: false, error: 'الفلوس لا تتجاوز 3 خانات' };
  }
  return { valid: true };
}

// ISO date yyyy-mm-dd.
export function validateDate(value, label = 'التاريخ') {
  if (isBlank(value)) return { valid: false, error: `${label} مطلوب` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return { valid: false, error: `${label} غير صالح` };
  const d = new Date(value + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return { valid: false, error: `${label} غير صالح` };
  return { valid: true };
}

export function validateRequired(value, label) {
  if (isBlank(value)) return { valid: false, error: `${label} مطلوب` };
  return { valid: true };
}

export function validatePin(pin) {
  if (isBlank(pin)) return { valid: false, error: 'الرقم السري مطلوب' };
  if (!/^\d{4,8}$/.test(String(pin))) return { valid: false, error: 'الرقم السري يجب أن يكون من 4 إلى 8 أرقام' };
  return { valid: true };
}

// Validate a whole check form. Returns { valid, errors: {field: msg} }.
export function validateCheckForm(form) {
  const errors = {};
  const num = validateRequired(form.check_number, 'رقم الشيك');
  if (!num.valid) errors.check_number = num.error;

  const payee = validateRequired(form.payee_ar, 'اسم المستفيد');
  if (!payee.valid) errors.payee_ar = payee.error;

  if (isBlank(form.bank_id)) errors.bank_id = 'البنك مطلوب';

  const amt = validateAmount(form.amount);
  if (!amt.valid) errors.amount = amt.error;

  const issue = validateDate(form.issue_date, 'تاريخ الإصدار');
  if (!issue.valid) errors.issue_date = issue.error;

  const due = validateDate(form.due_date, 'تاريخ الاستحقاق');
  if (!due.valid) errors.due_date = due.error;

  // due_date should not be before issue_date
  if (issue.valid && due.valid && form.due_date < form.issue_date) {
    errors.due_date = 'تاريخ الاستحقاق قبل تاريخ الإصدار';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateBankForm(form) {
  const errors = {};
  if (isBlank(form.name_ar)) errors.name_ar = 'اسم البنك (عربي) مطلوب';
  const w = Number(form.check_width_mm);
  const h = Number(form.check_height_mm);
  if (!w || w <= 0) errors.check_width_mm = 'العرض غير صالح';
  if (!h || h <= 0) errors.check_height_mm = 'الارتفاع غير صالح';
  return { valid: Object.keys(errors).length === 0, errors };
}
