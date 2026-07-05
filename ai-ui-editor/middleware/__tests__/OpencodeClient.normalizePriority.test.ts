import { describe, it, expect } from 'vitest';
import { normalizePriority } from '../src/ai/OpencodeClient';

// P1-6: normalizePriority converts AI-returned priority strings to one of the
// three allowed values, defaulting to 'Medium' for unexpected input. The
// popup pre-fills with the normalized value; users can override.

describe('normalizePriority (P1-6)', () => {
  it('accepts "High" in any casing', () => {
    expect(normalizePriority('High')).toBe('High');
    expect(normalizePriority('HIGH')).toBe('High');
    expect(normalizePriority('high')).toBe('High');
  });

  it('accepts "Medium" in any casing', () => {
    expect(normalizePriority('Medium')).toBe('Medium');
    expect(normalizePriority('medium')).toBe('Medium');
    expect(normalizePriority('MEDIUM')).toBe('Medium');
  });

  it('accepts "Low" in any casing', () => {
    expect(normalizePriority('Low')).toBe('Low');
    expect(normalizePriority('low')).toBe('Low');
    expect(normalizePriority('lOw')).toBe('Low');
  });

  it('defaults to Medium for non-string input', () => {
    expect(normalizePriority(null)).toBe('Medium');
    expect(normalizePriority(undefined)).toBe('Medium');
    expect(normalizePriority(42)).toBe('Medium');
  });

  it('defaults to Medium for unrecognized strings', () => {
    expect(normalizePriority('Critical')).toBe('Medium');
    expect(normalizePriority('')).toBe('Medium');
    expect(normalizePriority('   ')).toBe('Medium');
  });

  it('trims whitespace before matching', () => {
    expect(normalizePriority('  High  ')).toBe('High');
    expect(normalizePriority('\tlow\n')).toBe('Low');
  });
});