// =============================================================================
// tafgeet.test.js — اختبارات التفقيط (Vitest)
// Run: npm run test
// =============================================================================

import { describe, it, expect } from 'vitest';
import { tafgeet, integerToWords } from './tafgeet.js';

describe('integerToWords', () => {
  it('handles zero', () => expect(integerToWords(0)).toBe('صفر'));
  it('handles ones', () => expect(integerToWords(7)).toBe('سبعة'));
  it('handles teens', () => expect(integerToWords(15)).toBe('خمسة عشر'));
  it('handles tens', () => expect(integerToWords(50)).toBe('خمسون'));
  it('handles compound tens', () => expect(integerToWords(45)).toBe('خمسة وأربعون'));
  it('handles hundreds', () => expect(integerToWords(500)).toBe('خمسمائة'));
  it('handles 150', () => expect(integerToWords(150)).toBe('مائة وخمسون'));
  it('handles 1250', () => expect(integerToWords(1250)).toBe('ألف ومائتان وخمسون'));
  it('handles 12500', () => expect(integerToWords(12500)).toBe('اثنا عشر ألف وخمسمائة'));
  it('handles millions', () => expect(integerToWords(2000000)).toBe('مليونان'));
});

describe('tafgeet', () => {
  const opts = {
    currency_singular: 'ديناراً',
    currency_plural: 'دنانير',
    cents_singular: 'فلس',
    cents_plural: 'فلوس',
  };

  it('whole dinars', () => {
    expect(tafgeet(500, opts)).toContain('خمسمائة');
    expect(tafgeet(500, opts)).toContain('لا غير');
  });

  it('matches Jordanian spec example 150.500', () => {
    // 150.500 => "مائة وخمسون ديناراً وخمسمائة فلس لا غير"
    expect(tafgeet(150.5, opts)).toBe('مائة وخمسون ديناراً وخمسمائة فلس لا غير');
  });

  it('dinars + fils', () => {
    const out = tafgeet(1250.5, opts);
    expect(out).toContain('ألف ومائتان وخمسون');
    expect(out).toContain('خمسمائة');
    expect(out).toContain('لا غير');
  });

  it('zero amount', () => {
    expect(tafgeet(0, opts)).toContain('صفر');
  });

  it('fils only', () => {
    const out = tafgeet(0.25, opts);
    expect(out).toContain('مائتان وخمسون');
  });
});
