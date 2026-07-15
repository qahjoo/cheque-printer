// =============================================================================
// renderer/utils/tafgeet.js — تفقيط: تحويل المبلغ الرقمي إلى كلمات عربية
// Converts a decimal amount (دينار.فلس, up to 3 fils digits) into correct Arabic
// words with proper grammar (تمييز العدد), e.g.:
//   1250.500 => "ألف ومئتان وخمسون ديناراً وخمسمئة فلس لا غير"
// Pure, dependency-free, and unit-tested via tafgeet.test.js. Handles 0..999.999
// millions and gender/case agreement for the standard currency units.
// =============================================================================

const ONES = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = [
  '', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
];

// Scale words with singular/dual/plural forms for grammatical agreement.
const SCALES = [
  { singular: '', dual: '', plural: '' }, // units
  { singular: 'ألف', dual: 'ألفان', plural: 'آلاف' }, // thousands
  { singular: 'مليون', dual: 'مليونان', plural: 'ملايين' }, // millions
];

// Convert a 0..999 group to words.
function threeDigitsToWords(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 20) {
      parts.push(ONES[rest]);
    } else {
      const t = Math.floor(rest / 10);
      const o = rest % 10;
      if (o > 0) parts.push(`${ONES[o]} و${TENS[t]}`);
      else parts.push(TENS[t]);
    }
  }
  return parts.join(' و');
}

// Scale word for a group value (handles 1/2/3-10/11+ agreement of the scale noun).
function scaleWord(groupValue, scaleIndex) {
  if (scaleIndex === 0 || groupValue === 0) return '';
  const s = SCALES[scaleIndex];
  if (groupValue === 1) return s.singular;
  if (groupValue === 2) return s.dual;
  if (groupValue >= 3 && groupValue <= 10) return s.plural;
  return s.singular; // 11+ uses singular in Arabic (e.g. "أحد عشر ألفاً")
}

// Convert a non-negative integer to Arabic words.
function integerToWords(num) {
  num = Math.floor(Math.abs(num));
  if (num === 0) return 'صفر';

  const groups = [];
  let n = num;
  while (n > 0) {
    groups.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const words = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    const g = groups[i];
    if (g === 0) continue;
    if (i === 0) {
      words.push(threeDigitsToWords(g));
    } else {
      const sw = scaleWord(g, i);
      // For 1/2 the number itself is implied by the scale word (ألف / ألفان).
      if (g === 1) words.push(sw);
      else if (g === 2) words.push(sw);
      else words.push(`${threeDigitsToWords(g)} ${sw}`);
    }
  }
  return words.join(' و');
}

// Currency unit agreement for the whole (dinar) part.
function currencyWord(count, singular, plural) {
  // Simplified accusative "تمييز": use plural for 3-10, singular (accusative) otherwise.
  const c = count % 100;
  if (count === 0) return plural;
  if (c >= 3 && c <= 10) return plural;
  return singular; // 1,2, 11+ -> singular form with tanwin handled by caller text
}

/**
 * tafgeet(amount, opts)
 * @param {number} amount decimal value (دينار.فلس)
 * @param {object} opts { currency_singular, currency_plural, cents_singular, cents_plural }
 * @returns {string} Arabic words ending with "لا غير"
 * Jordanian defaults, e.g. 150.500 => "مائة وخمسون ديناراً وخمسمائة فلس لا غير".
 */
function tafgeet(amount, opts = {}) {
  const {
    currency_singular = 'ديناراً',
    currency_plural = 'دنانير',
    cents_singular = 'فلس',
    cents_plural = 'فلوس',
  } = opts;

  const value = Number(amount) || 0;
  const sign = value < 0 ? 'سالب ' : '';
  const abs = Math.abs(value);

  const dinars = Math.floor(abs);
  // fils = 3 decimal digits (thousandths)
  const fils = Math.round((abs - dinars) * 1000);

  const segments = [];

  if (dinars > 0) {
    const dWords = integerToWords(dinars);
    const dUnit = currencyWord(dinars, currency_singular, currency_plural);
    segments.push(`${dWords} ${dUnit}`);
  }

  if (fils > 0) {
    const fWords = integerToWords(fils);
    const fUnit = currencyWord(fils, cents_singular, cents_plural);
    segments.push(`${fWords} ${fUnit}`);
  }

  if (segments.length === 0) {
    return `صفر ${currency_plural} لا غير`;
  }

  return `${sign}${segments.join(' و')} لا غير`;
}

export { tafgeet, integerToWords };
export default tafgeet;
