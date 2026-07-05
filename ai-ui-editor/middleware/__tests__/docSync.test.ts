import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

// Doc-consistency guard test: pins the 2026-07-05 doc consolidation so the
// authoritative narrative docs can't silently re-drift to describe shipped
// P1-0/P1-6 as "future/active/planned/not yet built" — the exact drift the
// original P1-7 pass corrected, now re-pointed at the consolidated file set.
//
// The consolidation folded:
//   - PROJECT_DETAILS.md  → into PROJECT_BRIEF.md (its 3 north-star use cases
//     already lived there; the rest was wrong-on-load-bearing-points history)
//   - GAP_AUDIT.md         → live-status matter into PROJECT_BRIEF.md; the
//     per-test audit table + history into a TODO.md "Audit" appendix
//   - MVP_REQUIREMENTS.md  → MVP-01…19 acceptance table + API contracts +
//     sample-test-project list into a TODO.md "MVP spec of record" appendix
//   - VISION_REQUIREMENTS.md → renamed to VISION.md (body unchanged)
//
// Mirrors typesMirror.test.ts (reads files for lockstep assertions) and
// OpencodeClient.models.test.ts (reads server.ts to assert startup wiring):
// all three prevent a change that passes unit tests but breaks a cross-file
// contract no unit test catches. The assertions below are structural — they
// grep for shipped markers in the prose and assert the folded files are gone.
//
// Why read docs as files instead of importing them: the docs are markdown
// prose, not TS modules. The assertions are structural (grep for banned stale
// markers; assert "shipped" markers present; assert deleted files absent),
// not semantic.

// __dirname = <repo>/ai-ui-editor/middleware/__tests__/
// Going up 3 levels (.., .., ..) reaches the repo root.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

describe('doc-consistency guard — consolidated set describes shipped state', () => {
  // ------------------------------------------------------------------
  // The four folded files must be GONE (proves the merge happened, not
  // half-done). Their content now lives in PROJECT_BRIEF / TODO appendices.
  // ------------------------------------------------------------------
  it('the four folded docs are deleted', async () => {
    expect(await exists(`${REPO_ROOT}/PROJECT_DETAILS.md`)).toBe(false);
    expect(await exists(`${REPO_ROOT}/GAP_AUDIT.md`)).toBe(false);
    expect(await exists(`${REPO_ROOT}/MVP_REQUIREMENTS.md`)).toBe(false);
    expect(await exists(`${REPO_ROOT}/VISION_REQUIREMENTS.md`)).toBe(false);
  });

  it('VISION.md exists (RENAMED from VISION_REQUIREMENTS.md)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/VISION.md`, 'utf-8');
    // Sanity: it's the vision doc, not an empty/stub file.
    expect(text).toMatch(/north star|aspirational|Vision/i);
    expect(text.length).toBeGreaterThan(1000);
  });

  // ------------------------------------------------------------------
  // README.md — slim front-door index (the heavy narrative moved out)
  // ------------------------------------------------------------------
  it('README.md is a slim index that links to the authoritative docs', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/README.md`, 'utf-8');
    // Must point readers at the consolidated authoritative set.
    expect(text).toMatch(/\[`?PROJECT_BRIEF\.md`?\]/);
    expect(text).toMatch(/\[`?TODO\.md`?\]/);
    expect(text).toMatch(/\[`?VISION\.md`?\]/);
    expect(text).toMatch(/ai-ui-editor\/README\.md/);
  });

  it('README.md no longer carries the heavy narrative blocks (they moved to PROJECT_BRIEF)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/README.md`, 'utf-8');
    // These sections were relocated to PROJECT_BRIEF during the consolidation.
    expect(text).not.toMatch(/Known contradictions an AI must not propagate/);
    expect(text).not.toMatch(/Doc status map/);
    expect(text).not.toMatch(/Shared understanding/);
  });

  // ------------------------------------------------------------------
  // PROJECT_BRIEF.md — the single authoritative narrative + state.
  // It now carries the shipped-marker assertions formerly pinned on README.
  // ------------------------------------------------------------------
  it('PROJECT_BRIEF.md says P1-0 and P1-6 shipped with commit hashes', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).toMatch(/P1-0.*shipped.*e9d2b91/s);
    expect(text).toMatch(/P1-6.*shipped.*acb45ab/s);
  });

  it('PROJECT_BRIEF.md confirmed endpoints include probe-root and append-ideas', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).toMatch(/\/api\/files\/probe-root/);
    expect(text).toMatch(/\/api\/files\/append-ideas/);
  });

  it('PROJECT_BRIEF.md calls Phase 1 feature-complete and does NOT call P1-0/P1-6 active', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).toMatch(/Phase 1.*feature-complete/);
    expect(text).not.toMatch(/🔴.*Active work/i);
    expect(text).not.toMatch(/append-ideas.*planned.*not yet built/i);
    expect(text).not.toMatch(/not yet built.*do not treat as shipped/i);
  });

  it('PROJECT_BRIEF.md carries the "Known contradictions" section (relocated from README)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).toMatch(/Known contradictions an AI must not propagate/);
  });

  // ------------------------------------------------------------------
  // TODO.md — the roadmap, plus the folded audit + MVP appendices.
  // ------------------------------------------------------------------
  it('TODO.md marks Phase 1 as shipped (not active)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    expect(text).toMatch(/Phase 1.*shipped/);
  });

  it('TODO.md has NO open checkboxes for P1-0 or P1-6', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    const p10Section = text.slice(
      text.indexOf('### P1-0:'),
      text.indexOf('### P1-6:')
    );
    const p16Section = text.slice(
      text.indexOf('### P1-6:'),
      text.indexOf('### P1-7:')
    );
    expect(p10Section).not.toMatch(/^- \[ \]/m);
    expect(p16Section).not.toMatch(/^- \[ \]/m);
    expect(p10Section).toMatch(/^- \[x\]/m);
    expect(p16Section).toMatch(/^- \[x\]/m);
  });

  it('TODO.md contains the "What landed" section with the shipped capstones', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    expect(text).toMatch(/What landed/);
    expect(text).toMatch(/P1-0 Project Registry.*shipped `e9d2b91`/);
    expect(text).toMatch(/P1-6 File Export.*shipped `acb45ab`/);
  });

  it('TODO.md absorbed the GAP_AUDIT audit matter and MVP_REQUIREMENTS spec as appendices', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    // Audit appendix (folded from GAP_AUDIT.md): the "What landed" section records the
    // P1-7 doc-sync, and the appendix carries the append-ideas endpoint detail.
    expect(text).toMatch(/P1-7.*doc-sync/i);
    expect(text).toMatch(/append-ideas/);
    // MVP spec-of-record appendix (folded from MVP_REQUIREMENTS.md).
    expect(text).toMatch(/MVP-01/);
  });

  // ------------------------------------------------------------------
  // ai-ui-editor/README.md — the API reference (unchanged by consolidation)
  // ------------------------------------------------------------------
  it('ai-ui-editor/README.md documents append-ideas as shipped (not planned)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/ai-ui-editor/README.md`, 'utf-8');
    expect(text).not.toMatch(/P1-6 will add/i);
    expect(text).not.toMatch(/blocked on P1-0.*Not yet built/i);
    expect(text).toMatch(/POST \/api\/files\/append-ideas/);
    expect(text).toMatch(/shipped/);
  });

  it('ai-ui-editor/README.md documents probe-root as a live endpoint', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/ai-ui-editor/README.md`, 'utf-8');
    expect(text).toMatch(/GET \/api\/files\/probe-root/);
  });

  it('ai-ui-editor/README.md links to the renamed VISION.md (not VISION_REQUIREMENTS.md)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/ai-ui-editor/README.md`, 'utf-8');
    expect(text).not.toMatch(/VISION_REQUIREMENTS\.md/);
    expect(text).toMatch(/VISION\.md/);
  });

  // ------------------------------------------------------------------
  // PROJECT_PROFILE.md — the profile system doc
  // ------------------------------------------------------------------
  it('PROJECT_PROFILE.md does NOT say P1-0 is an active prerequisite in future tense', async () => {
    const text = await fs.readFile(
      `${REPO_ROOT}/ai-ui-editor/PROJECT_PROFILE.md`,
      'utf-8'
    );
    expect(text).not.toMatch(/active prerequisite/);
    expect(text).not.toMatch(/currently only built-in profiles selectable/i);
  });

  // ------------------------------------------------------------------
  // No authoritative doc still links to any folded/deleted file as a live
  // resource. (Widened from the original deleted-snapshot-doc check to
  // cover the four files removed by this consolidation.)
  // ------------------------------------------------------------------
  it('no authoritative doc links to the folded/deleted files as live resources', async () => {
    const authoritative = [
      `${REPO_ROOT}/README.md`,
      `${REPO_ROOT}/TODO.md`,
      `${REPO_ROOT}/PROJECT_BRIEF.md`,
      `${REPO_ROOT}/VISION.md`,
      `${REPO_ROOT}/ai-ui-editor/README.md`,
      `${REPO_ROOT}/ai-ui-editor/PROJECT_PROFILE.md`,
      `${REPO_ROOT}/memory/antikythera-integration-vision.md`,
    ];
    // A *live* link to a folded file is a markdown link — `](GAP_AUDIT.md)` (the
    // parenthetical link-target form). A bare code-span mention (`` `GAP_AUDIT.md` ``)
    // or plain prose ("the former GAP_AUDIT.md") inside the TODO.md appendices is
    // intentional history and must NOT trip this check. Match the link target only.
    const liveLink = (name: string) => new RegExp('\\]\\(' + name + '\\)');

    for (const p of authoritative) {
      const text = await fs.readFile(p, 'utf-8');
      for (const folded of [
        'GAP_AUDIT.md',
        'PROJECT_DETAILS.md',
        'MVP_REQUIREMENTS.md',
        'VISION_REQUIREMENTS.md',
      ]) {
        expect(text).not.toMatch(liveLink(folded));
      }
    }
  });

  // ------------------------------------------------------------------
  // memory/antikythera-integration-vision.md — its cross-refs repointed
  // to the TODO appendices (not to markdown links to the deleted files).
  // ------------------------------------------------------------------
  it('memory file does not markdown-link to the folded GAP_AUDIT/MVP_REQUIREMENTS files', async () => {
    const text = await fs.readFile(
      `${REPO_ROOT}/memory/antikythera-integration-vision.md`,
      'utf-8'
    );
    // Forbid link-target form `](GAP_AUDIT.md)`; bare prose/code-span
    // mentions ("the former `GAP_AUDIT.md`") are intentional history.
    expect(text).not.toMatch(/\]\(GAP_AUDIT\.md\)/);
    expect(text).not.toMatch(/\]\(MVP_REQUIREMENTS\.md\)/);
  });
});
