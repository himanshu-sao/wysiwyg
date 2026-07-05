// Minimal HTML sanitizer for previewHtml iframe content.
// Strips dangerous elements and attributes that could enable XSS.
// This is a lightweight, dependency-free sanitizer — for production use,
// consider a more robust solution like DOMPurify or sanitize-html.

const DANGEROUS_TAG_REGEX = /<(script|iframe|object|embed|form|input|button|textarea|select|style|link|meta|base|applet|frame|frameset)\b[^>]*>/gi;
const DANGEROUS_ATTR_REGEX = /\s+(on\w+|href|src|action|formaction)\s*=\s*["'][^"']*["']/gi;
const SCRIPT_URL_REGEX = /(javascript|data|vbscript):/gi;

/**
 * Sanitizes HTML string for safe rendering in an iframe.
 * Removes: <script>, <iframe>, <object>, <embed>, <form>, inputs, <style>,
 * event handlers (onclick, onload, etc.), and javascript:/data:/vbscript: URLs.
 *
 * Note: This is a best-effort regex-based sanitizer. For production, use
 * DOMPurify or a proper HTML parser.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') return '';

  let sanitized = html
    // Remove dangerous tags entirely
    .replace(DANGEROUS_TAG_REGEX, '<!-- stripped -->')
    // Remove event handlers and dangerous attributes
    .replace(DANGEROUS_ATTR_REGEX, '')
    // neuter javascript:/data:/vbscript: URLs in remaining href/src attributes
    .replace(SCRIPT_URL_REGEX, 'blocked:');

  return sanitized;
}

/**
 * Returns a safe iframe sandbox attribute value for preview content.
 * - No allow-same-origin (prevents accessing parent context)
 * - No allow-scripts (prevents executing any JS)
 * - allow-same-origin is intentionally omitted — AI-supplied HTML must not
 *   be trusted with same-origin access to the extension.
 */
export function getPreviewSandbox(): string {
  // Empty sandbox = most restrictive: no scripts, no forms, no navigation.
  // AI-supplied HTML must not be trusted with any capabilities.
  return '';
}