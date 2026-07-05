import { describe, it, expect } from 'vitest';
import { applyDiff } from '../shared/diff';

describe('applyDiff', () => {
  const source = [
    'import React from "react";',
    '',
    'export const Card = () => (',
    '  <div className="bg-white">Hello</div>',
    ');',
  ].join('\n');

  it('applies a single line insertion', () => {
    const diff = [
      '@@ -3,1 +3,2 @@',
      ' export const Card = () => (',
      '+  // new comment',
      '   <div className="bg-white">Hello</div>',
    ].join('\n');

    const result = applyDiff(source, diff);
    expect(result).toContain('// new comment');
    expect(result.split('\n').length).toBe(source.split('\n').length + 1);
  });

  it('applies a removal when the line matches', () => {
    const diff = ['@@ -4,1 +4,0 @@', '-  <div className="bg-white">Hello</div>', ' );'].join('\n');

    const result = applyDiff(source, diff);
    expect(result).not.toContain('bg-white');
  });

  it('applies a line replacement (remove + add)', () => {
    const diff = [
      '@@ -4,1 +4,1 @@',
      '-  <div className="bg-white">Hello</div>',
      '+  <div className="bg-blue-100">Hello</div>',
    ].join('\n');

    const result = applyDiff(source, diff);
    expect(result).toContain('bg-blue-100');
    expect(result).not.toContain('bg-white');
  });

  it('returns source unchanged for an empty or whitespace-only diff', () => {
    expect(applyDiff(source, '')).toBe(source);
    expect(applyDiff(source, '   \n  ')).toBe(source);
  });

  it('handles multiple hunks', () => {
    const twoHunkSource = ['line1', 'line2', 'line3', 'line4', 'line5'].join('\n');
    const diff = [
      '@@ -1,1 +1,2 @@',
      ' line1',
      '+inserted-1',
      '@@ -5,1 +6,1 @@',
      '-line5',
      '+line5-edited',
    ].join('\n');

    const result = applyDiff(twoHunkSource, diff);
    expect(result).toBe('line1\ninserted-1\nline2\nline3\nline4\nline5-edited');
  });

  it('applies a diff against a realistic Tailwind component', () => {
    const component = [
      'export const Button = ({ children }) => (',
      '  <button className="px-4 py-2 bg-indigo-600 text-white rounded">',
      '    {children}',
      '  </button>',
      ');',
    ].join('\n');

    const diff = [
      '@@ -2,1 +2,1 @@',
      '-  <button className="px-4 py-2 bg-indigo-600 text-white rounded">',
      '+  <button className="px-6 py-3 bg-indigo-600 text-white rounded shadow-lg">',
      '     {children}',
    ].join('\n');

    const result = applyDiff(component, diff);
    expect(result).toContain('px-6 py-3');
    expect(result).toContain('shadow-lg');
    expect(result).not.toContain('px-4 py-2');
    // Context line preserved
    expect(result).toContain('{children}');
  });

  it('ignores the "no newline at end of file" marker', () => {
    const diff = ['@@ -1,1 +1,2 @@', ' line1', '+line2', '\\ No newline at end of file'].join('\n');
    const result = applyDiff('line1', diff);
    expect(result).toBe('line1\nline2');
  });
});
