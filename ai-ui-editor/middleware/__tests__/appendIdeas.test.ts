import { describe, it, expect, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { generateNextId, appendRequirements } from '../src/routes/files';

// P1-6: hermetic tests for ID generation (profile-driven scan) + atomic
// append-requirements (intake line + spec.md in one git commit). All tests
// work against a temp dir with a real git init so writeFilesWithGit runs
// without touching the working tree.

async function mkdtemp(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wysiwyg-ideas-'));
  return dir;
}

async function setupProject(
  opts?: { intakeContent?: string; existingReqs?: { id: string; spec?: string }[] }
): Promise<string> {
  const dir = await mkdtemp();
  dirs.push(dir);
  await fs.mkdir(dir, { recursive: true });

  // Init a git repo so writeFilesWithGit can commit.
  await simpleGit({ baseDir: dir }).init();

  // Write intake file if content given.
  if (opts?.intakeContent !== undefined) {
    await fs.writeFile(path.join(dir, 'TODO.md'), opts.intakeContent);
  }

  // Create existing requirement dirs.
  if (opts?.existingReqs) {
    const reqDir = path.join(dir, 'automation-ideas', 'requirements');
    await fs.mkdir(reqDir, { recursive: true });
    for (const r of opts.existingReqs) {
      const d = path.join(reqDir, r.id);
      await fs.mkdir(d, { recursive: true });
      if (r.spec) {
        await fs.writeFile(path.join(d, 'spec.md'), r.spec);
      }
    }
  }

  return dir;
}

const dirs: string[] = [];
afterEach(async () => {
  while (dirs.length) {
    const d = dirs.pop()!;
    await fs.rm(d, { recursive: true, force: true }).catch(() => {});
  }
});

describe('generateNextId (P1-6)', () => {
  it('returns ID-001 when nothing exists (first export)', async () => {
    const dir = await setupProject();
    const id = await generateNextId(dir, 'TODO.md', 'automation-ideas/requirements');
    expect(id).toBe('ID-001');
  });

  it('returns ID-002 when ID-001 exists in the intake file + requirements dir', async () => {
    const dir = await setupProject({
      intakeContent: '- [ID-001] Some feature | Priority: Medium\n',
      existingReqs: [{ id: 'ID-001' }],
    });
    const id = await generateNextId(dir, 'TODO.md', 'automation-ideas/requirements');
    expect(id).toBe('ID-002');
  });

  it('returns the next numeric ID after the max found', async () => {
    const dir = await setupProject({
      intakeContent: [
        '- [ID-001] First | Priority: High',
        '- [ID-005] Fifth | Priority: Low',
      ].join('\n'),
      existingReqs: [
        { id: 'ID-001' },
        { id: 'ID-003', spec: '# test\n' },
        { id: 'ID-005' },
      ],
    });
    const id = await generateNextId(dir, 'TODO.md', 'automation-ideas/requirements');
    expect(id).toBe('ID-006');
  });

  it('skips intake-file IDs that have no corresponding requirements dir (stale/orphan)', async () => {
    // ID-007 appears in the intake file but has no dir — stale. Don't count it.
    const dir = await setupProject({
      intakeContent: '- [ID-007] Orphan | Priority: Medium\n',
      existingReqs: [{ id: 'ID-001' }],
    });
    const id = await generateNextId(dir, 'TODO.md', 'automation-ideas/requirements');
    expect(id).toBe('ID-002'); // max known = 1 (from dir), not 7
  });

  it('respects 3-digit zero-padding below ID-1000', async () => {
    const dir = await setupProject({
      intakeContent: '- [ID-999] Last of the era | Priority: High\n',
      existingReqs: [{ id: 'ID-999' }],
    });
    const id = await generateNextId(dir, 'TODO.md', 'automation-ideas/requirements');
    expect(id).toBe('ID-1000');
  });

  it('drops padding after ID-999', async () => {
    const dir = await setupProject({
      intakeContent: '- [ID-1000] First unpadded | Priority: Medium\n',
      existingReqs: [{ id: 'ID-1000' }],
    });
    const id = await generateNextId(dir, 'TODO.md', 'automation-ideas/requirements');
    expect(id).toBe('ID-1001');
  });

  it('handles missing requirements dir gracefully (only intake IDs that lack dirs are skipped)', async () => {
    const dir = await mkdtemp();
    dirs.push(dir);
    await fs.writeFile(path.join(dir, 'TODO.md'), '- [ID-003] Title\n');
    const id = await generateNextId(dir, 'TODO.md', 'nonexistent/requirements');
    expect(id).toBe('ID-001');
  });
});

describe('appendRequirements (P1-6 atomic export)', () => {
  it('writes the intake line + spec.md with correct ID and returns success', async () => {
    const dir = await setupProject();

    const result = await appendRequirements({
      spec: '# My Feature\n\n## Overview\nFoo bar\n',
      title: 'Add the Foo feature',
      priority: 'High',
      architectureHints: [],
      testScenarios: [],
      edgeCases: [],
      instruction: 'Add foo',
      projectRoot: dir,
      projectProfile: 'antikythera', // use the antikythera profile (automation-ideas/)
    });

    expect(result.success).toBe(true);
    expect(result.id).toBe('ID-001');
    expect(result.specPath).toBe(path.resolve(dir, 'automation-ideas/requirements/ID-001/spec.md'));

    // Verify the intake file was appended correctly (antikythera profile →
    // intakeFile = automation-ideas/ideas.md).
    const ideas = await fs.readFile(path.join(dir, 'automation-ideas', 'ideas.md'), 'utf-8');
    expect(ideas).toContain('ID-001');
    expect(ideas).toContain('Add the Foo feature');
    expect(ideas).toContain('Priority: High');

    // Verify spec.md exists with content.
    const spec = await fs.readFile(result.specPath!, 'utf-8');
    expect(spec).toContain('# Add the Foo feature (ID-001)');
    expect(spec).toContain('Priority: High');
    expect(spec).toContain('Exported by wysiwyg');
  });

  it('uses .wysiwyg/requirements/ for the generic profile (generic default)', async () => {
    const dir = await setupProject();

    const result = await appendRequirements({
      spec: '# Generic test\n', title: 'Generic', priority: 'Medium',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'Generic', projectRoot: dir,
      // no projectProfile → falls back to generic
    });

    expect(result.success).toBe(true);
    expect(result.specPath).toBe(path.resolve(dir, '.wysiwyg/requirements/ID-001/spec.md'));
    expect(await fs.stat(result.specPath!)).toBeDefined();
  });

  it('generates successive IDs on repeated exports (each run gets next ID)', async () => {
    const dir = await setupProject();

    // All exports use antikythera profile so the requirements dir is
    // automation-ideas/requirements/ (stable dir-retrieval guarantees consistent
    // ID scanning across runs).

    const r1 = await appendRequirements({
      spec: '# A\n', title: 'First', priority: 'Medium',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'First', projectRoot: dir,
      projectProfile: 'antikythera',
    });
    expect(r1.success).toBe(true);
    expect(r1.id).toBe('ID-001');

    const r2 = await appendRequirements({
      spec: '# B\n', title: 'Second', priority: 'Low',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'Second', projectRoot: dir,
      projectProfile: 'antikythera',
    });
    expect(r2.success).toBe(true);
    expect(r2.id).toBe('ID-002');

    const r3 = await appendRequirements({
      spec: '# C\n', title: 'Third', priority: 'High',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'Third', projectRoot: dir,
      projectProfile: 'antikythera',
    });
    expect(r3.success).toBe(true);
    expect(r3.id).toBe('ID-003');
  });

  it('catches an ID collision when generateNextId re-uses an orphaned intake ID', async () => {
    // Seed an intake line referencing ID-001 but with the requirements dir at
    // a DIFFERENT location than what the profile expects (automation-ideas/ vs
    // wysiwyg's .wysiwyg/ for the generic profile). generateNextId sees ID-001
    // in the intake file but NOT in the scanned requirements dir → treats it as
    // an orphan → not counted → returns ID-001 again. Then the idempotency
    // guard (includes("[ID-001]")) in the intake file catches it and refuses
    // to duplicate.
    const dir = await setupProject({
      intakeContent: '- [ID-001] Pre-existing | Priority: High\n',
      // existingReqs at automation-ideas/requirements/ID-001/ — BUT the export
      // uses the generic profile which scans .wysiwyg/requirements/. So the dir
      // won't match → orphan → ID-001 returned by generateNextId → caught.
      existingReqs: [{ id: 'ID-001', spec: '# Old spec\n' }],
    });

    const res = await appendRequirements({
      spec: '# New spec\n', title: 'Re-export attempt', priority: 'Low',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'Re-export', projectRoot: dir,
      // no projectProfile → defaults to generic → .wysiwyg/requirements/ scan
    });
    expect(res.success).toBe(false);
    expect(res.id).toBe('ID-001');
    expect(res.error).toMatch(/already exists/i);
  });

  it('falls back to instruction for title when title is empty', async () => {
    const dir = await setupProject();

    const result = await appendRequirements({
      spec: '# Stuff\n',
      title: undefined,
      priority: 'Low',
      architectureHints: [],
      testScenarios: [],
      edgeCases: [],
      instruction: 'Implement the gizmo subsystem for antikythera',
      projectRoot: dir,
      projectProfile: 'antikythera',
    });
    expect(result.success).toBe(true);
    // antikythera profile: intakeFile = automation-ideas/ideas.md
    const ideas = await fs.readFile(path.join(dir, 'automation-ideas', 'ideas.md'), 'utf-8');
    expect(ideas).toContain('Implement the gizmo subsystem for antikythera');
  });

  it('creates the intake file when it does not exist', async () => {
    const dir = await mkdtemp();
    dirs.push(dir);
    await simpleGit({ baseDir: dir }).init();

    const result = await appendRequirements({
      spec: '# First\n', title: 'First requirement', priority: 'Medium',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'First', projectRoot: dir,
      projectProfile: 'generic', // generic → TODO.md (the "creates new file" scenario)
    });
    expect(result.success).toBe(true);
    // generic profile: intakeFile = TODO.md
    const ideas = await fs.readFile(path.join(dir, 'TODO.md'), 'utf-8');
    expect(ideas).toContain('WYSIWYG Requirements');
    expect(ideas).toContain('ID-001');
  });

  it('returns success=false for a non-absolute projectRoot (URL)', async () => {
    // The origin placeholder is a URL. path.isAbsolute('http://...') is false;
    // safeFilePath handles it as a relative path and resolves against CWD,
    // producing a bogus root → writeFilesWithGit fails. The function should
    // NOT throw — it returns success:false with an error.
    const res = await appendRequirements({
      spec: '# X\n', title: 'X', priority: 'Medium',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'X', projectRoot: 'http://localhost:5174',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('returns success=false (not crash) when the projectRoot does not exist on disk', async () => {
    // path.resolve turns /nonexistent into an absolute path → PathSanitizer accepts
    // it (no ".."). But writeFilesWithGit fails because the dir doesn't exist.
    // The endpoint returns success: false with the error; it does not throw.
    const res = await appendRequirements({
      spec: '# X\n', title: 'X', priority: 'Medium',
      architectureHints: [], testScenarios: [], edgeCases: [],
      instruction: 'X',
      projectRoot: '/nonexistent/deadbeef/synthetic',
    });
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });
});