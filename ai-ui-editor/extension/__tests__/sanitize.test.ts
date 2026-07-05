import { describe, it, expect } from 'vitest';
import { sanitizeHtml, getPreviewSandbox } from '../shared/sanitize';

describe('sanitizeHtml (P9 XSS prevention)', () => {
  it('passes through safe HTML unchanged', () => {
    const input = '<div class="card"><p>Hello World</p></div>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('removes <script> tags', () => {
    const input = '<div><script>alert("xss")</script><p>Safe</p></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('<!-- stripped -->');
    expect(result).toContain('<p>Safe</p>');
  });

  it('removes event handlers (onclick, onload, etc.)', () => {
    const input = '<div onclick="alert(1)" onload="bad()"><p>Test</p></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('onload');
  });

  it('neuters javascript: URLs', () => {
    const input = '<a href="javascript:alert(1)">Click</a>';
    const result = sanitizeHtml(input);
    // The href attribute is stripped entirely (which neutralizes the XSS)
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<a>');
  });

  it('neuters data: URLs', () => {
    const input = '<img src="data:text/html,<script>alert(1)</script>">';
    const result = sanitizeHtml(input);
    // The src attribute is stripped entirely
    expect(result).not.toContain('data:');
    expect(result).toContain('<img>');
  });

  it('neuters vbscript: URLs', () => {
    const input = '<a href="vbscript:msgbox(1)">XSS</a>';
    const result = sanitizeHtml(input);
    // The href attribute is stripped entirely
    expect(result).not.toContain('vbscript:');
    expect(result).toContain('<a>');
  });

  it('removes <iframe> tags', () => {
    const input = '<div><iframe src="evil.com"></iframe><p>Safe</p></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<iframe>');
    expect(result).toContain('<!-- stripped -->');
  });

  it('removes <object>, <embed>, <form> tags', () => {
    const input = '<div><object data="x"></object><embed src="y"><form action="/evil"></form></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<object>');
    expect(result).not.toContain('<embed>');
    expect(result).not.toContain('<form>');
  });

  it('removes <style> tags', () => {
    const input = '<style>body { display: none; }</style><div>Content</div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<style>');
  });

  it('removes <input>, <button>, <textarea>, <select> tags', () => {
    const input = '<form><input value="x"><button>Go</button><textarea></textarea><select></select></form>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<input>');
    expect(result).not.toContain('<button>');
    expect(result).not.toContain('<textarea>');
    expect(result).not.toContain('<select>');
  });

  it('handles empty/invalid input gracefully', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
  });

  it('strips multiple dangerous elements in one pass', () => {
    const input = `
      <script>alert(1)</script>
      <div onclick="bad()">Click</div>
      <a href="javascript:void(0)">Link</a>
      <p>Safe paragraph</p>
    `;
    const result = sanitizeHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<p>Safe paragraph</p>');
  });
});

describe('getPreviewSandbox', () => {
  it('returns empty string (most restrictive sandbox)', () => {
    // Empty sandbox = no scripts, no forms, no popups, no same-origin
    expect(getPreviewSandbox()).toBe('');
  });
});