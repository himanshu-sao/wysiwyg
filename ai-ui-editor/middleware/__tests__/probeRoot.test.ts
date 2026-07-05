import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { probeProjectRoot } from '../src/routes/files';

// P1-0: tests for the on-disk project-marker probe. The extension calls
// /api/files/probe-root during "Add project" to insist that a registered path
// looks like a project root before accepting it (the extension can't read disk
// itself; the middleware can). This test exercises the pure helper the route
// delegates to, against a real temp filesystem.

async function mkdtemp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wysiwyg-probe-'));
  return dir;
}

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

async function tmpWithMarker(marker: string): Promise<string> {
  const dir = await mkdtemp();
  dirs.push(dir);
  await fs.writeFile(path.join(dir, marker), '{}');
  return dir;
}

describe('probeProjectRoot (P1-0 marker validation)', () => {
  describe('rejections', () => {
    it('rejects a relative path', async () => {
      const res = await probeProjectRoot('relative/path');
      expect(res.valid).toBe(false);
      expect(res.isAbsolute).toBe(false);
      expect(res.exists).toBe(false);
      expect(res.marker).toBeNull();
    });

    it('rejects a path containing ".."', async () => {
      const res = await probeProjectRoot('/home/u/../other');
      expect(res.valid).toBe(false);
      expect(res.isAbsolute).toBe(true);
      expect(res.marker).toBeNull();
    });

    it('rejects a non-existent absolute path', async () => {
      const res = await probeProjectRoot('/this/path/does/not/exist/synthetic');
      expect(res.valid).toBe(false);
      expect(res.exists).toBe(false);
      expect(res.marker).toBeNull();
    });

    it('rejects an existing dir that has NO marker', async () => {
      const dir = await mkdtemp();
      dirs.push(dir);
      const res = await probeProjectRoot(dir);
      expect(res.valid).toBe(false);
      // exists is true (the dir itself exists) but no marker → not valid
      expect(res.exists).toBe(true);
      expect(res.marker).toBeNull();
    });

    it('rejects a file (not a directory) at the root path', async () => {
      const dir = await mkdtemp();
      dirs.push(dir);
      const filePath = path.join(dir, 'afile.txt');
      await fs.writeFile(filePath, 'hi');
      const res = await probeProjectRoot(filePath);
      expect(res.valid).toBe(false);
    });
  });

  describe('acceptance — each recognized marker', () => {
    it('accepts a dir with package.json', async () => {
      const dir = await tmpWithMarker('package.json');
      const res = await probeProjectRoot(dir);
      expect(res.valid).toBe(true);
      expect(res.marker).toBe('package.json');
      expect(res.isAbsolute).toBe(true);
      expect(res.exists).toBe(true);
    });

    it('accepts a dir with pyproject.toml', async () => {
      const dir = await tmpWithMarker('pyproject.toml');
      const res = await probeProjectRoot(dir);
      expect(res.valid).toBe(true);
      expect(res.marker).toBe('pyproject.toml');
    });

    it('accepts a dir with Cargo.toml', async () => {
      const dir = await tmpWithMarker('Cargo.toml');
      const res = await probeProjectRoot(dir);
      expect(res.valid).toBe(true);
      expect(res.marker).toBe('Cargo.toml');
    });

    it('accepts a dir with go.mod', async () => {
      const dir = await tmpWithMarker('go.mod');
      const res = await probeProjectRoot(dir);
      expect(res.valid).toBe(true);
      expect(res.marker).toBe('go.mod');
    });

    it('accepts a dir with a .git dir', async () => {
      const dir = await mkdtemp();
      dirs.push(dir);
      await fs.mkdir(path.join(dir, '.git'));
      const res = await probeProjectRoot(dir);
      expect(res.valid).toBe(true);
      expect(res.marker).toBe('.git');
    });
  });

  describe('path normalization', () => {
    it('accepts a path with a trailing slash', async () => {
      const dir = await tmpWithMarker('package.json');
      const res = await probeProjectRoot(dir + '/');
      expect(res.valid).toBe(true);
      expect(res.marker).toBe('package.json');
    });

    it('accepts a path with a redundant "." segment', async () => {
      const dir = await tmpWithMarker('package.json');
      const res = await probeProjectRoot(path.join(dir, '.'));
      expect(res.valid).toBe(true);
    });
  });

  describe('does NOT match a marker nested under a subdirectory', () => {
    it('rejects when package.json is in a subdirectory, not the root', async () => {
      const dir = await mkdtemp();
      dirs.push(dir);
      await fs.mkdir(path.join(dir, 'inner'));
      await fs.writeFile(path.join(dir, 'inner', 'package.json'), '{}');
      const res = await probeProjectRoot(dir);
      // The probe checks markers AT the root only — a nested package.json must
      // not fool it, otherwise arbitrary dirs would register as projects.
      expect(res.valid).toBe(false);
      expect(res.marker).toBeNull();
    });
  });
});
