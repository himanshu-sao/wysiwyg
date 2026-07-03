import * as path from 'path';

/**
 * Resolve a client-supplied relative file path against a project root,
 * rejecting anything that escapes the project root (path traversal).
 *
 * Why: the popup sends `file` (e.g. "src/components/Card.tsx") to
 * /api/files/write and /api/files/validate. Without this guard the route
 * could write anywhere the process can (POSTMVP_TODO.md P4).
 *
 * @param projectRoot - absolute path to the user's project
 * @param file - relative path within the project (e.g. "src/Card.tsx").
 *               Absolute paths and any `../` traversal are rejected.
 * @returns absolute normalized path inside projectRoot
 * @throws Error if the path escapes projectRoot or is empty
 */
export function safeFilePath(projectRoot: string, file: string): string {
  if (!file || typeof file !== 'string' || !file.trim()) {
    throw new Error('PathSanitizer: file path is required');
  }

  let normalizedRel = file.trim();

  // Reject absolute paths unless they're already inside projectRoot.
  if (path.isAbsolute(normalizedRel)) {
    const resolved = path.resolve(normalizedRel);
    const root = path.resolve(projectRoot);
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return resolved;
    }
    throw new Error(`PathSanitizer: absolute path "${file}" is outside project root`);
  }

  // Normalize separators and reject null bytes.
  normalizedRel = normalizedRel.replace(/\\/g, '/');
  if (normalizedRel.includes('\0')) {
    throw new Error('PathSanitizer: null bytes are not allowed in paths');
  }

  const root = path.resolve(projectRoot);
  const resolved = path.resolve(root, normalizedRel);

  // Ensure the resolved path is still within the project root.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`PathSanitizer: "${file}" escapes project root`);
  }

  return resolved;
}

/**
 * Resolve a project root from an optional request value, defaulting safely.
 * Returns the resolved root or throws if it looks unsafe.
 */
export function resolveProjectRoot(projectRoot: string | undefined, fallback: string): string {
  const root = (projectRoot && String(projectRoot).trim()) || fallback;
  if (!path.isAbsolute(root)) {
    throw new Error(`PathSanitizer: projectRoot must be absolute, got "${root}"`);
  }
  if (root.includes('..')) {
    throw new Error('PathSanitizer: projectRoot must not contain ".."');
  }
  return path.resolve(root);
}
