import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

// Doc-consistency guard test: pins the P1-7 doc-sync so the authoritative
// narrative docs can't silently re-drift to describe shipped P1-0/P1-6 as
// "future/active/planned/not yet built" — the exact drift that the gap audit
// identified and this P1-7 pass corrected.
//
// Mirrors the approach of typesMirror.test.ts (reads files for lockstep
// assertions) and OpencodeClient.models.test.ts (reads server.ts to assert the
// startup wiring). All three prevent the same failure mode: a code or config
// change that passes unit tests but breaks a cross-document/cross-file contract
// that no unit test catches.
//
// Why read docs as files instead of importing them: the docs are markdown
// prose, not TS modules. The assertions below are structural — they grep for
// banned stale markers in the prose — not semantic; they don't interpret
// sentences, only check that certain "stale tense" strings are absent and
// "shipped" markers are present.

// __dirname = <repo>/ai-ui-editor/middleware/__tests__/
// Going up 3 levels (.., .., ..) reaches the repo root.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

describe('P1-7 doc-consistency guard — authoritative docs describe shipped state', () => {
  // ------------------------------------------------------------------
  // Root README.md — the most authoritative framing index
  // ------------------------------------------------------------------
  it('root README.md does NOT contain 🔴 P1-0 or 🔴 P1-6 blocker framing', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/README.md`, 'utf-8');
    expect(text).not.toMatch(/🔴\s+\*\*P1-0\b/);
    expect(text).not.toMatch(/🔴\s+\*\*P1-6\b/);
  });

  it('root README.md does NOT say append-ideas is "planned" or "not yet built"', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/README.md`, 'utf-8');
    expect(text).not.toMatch(/append-ideas.*planned.*not yet built/i);
    expect(text).not.toMatch(/not yet built.*append-ideas/i);
  });

  it('root README.md lists probe-root and append-ideas in the confirmed endpoints', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/README.md`, 'utf-8');
    expect(text).toMatch(/\/api\/files\/probe-root/);
    expect(text).toMatch(/\/api\/files\/append-ideas/);
    // shipped, not planned
    expect(text).not.toMatch(/\/api\/files\/append-ideas\x60 is P1-6 — planned/);
  });

  it('root README.md calls P1-0 and P1-6 "shipped" with commit hashes', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/README.md`, 'utf-8');
    // The shipped P1-0/P1-6 lines must include the commit hashes.
    // (The hash may be on the same line or the next; dotAll (/s)
    // lets .* span newlines across multi-line list entries.)
    expect(text).toMatch(/P1-0.*shipped.*e9d2b91/s);
    expect(text).toMatch(/P1-6.*shipped.*acb45ab/s);
  });

  // ------------------------------------------------------------------
  // TODO.md — the active roadmap (Phase 1 must look done, not active)
  // ------------------------------------------------------------------
  it('TODO.md marks Phase 1 as shipped (not active)', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    // The Phase 1 header line should say "shipped", not unqualified "MVP"
    expect(text).toMatch(/Phase 1.*shipped/);
  });

  it('TODO.md has NO open checkboxes for P1-0 or P1-6', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    // P1-0/P1-6 sections must have [x] not [ ] at the checkbox lines
    const p10Section = text.slice(
      text.indexOf('### P1-0:'),
      text.indexOf('### P1-6:')
    );
    const p16Section = text.slice(
      text.indexOf('### P1-6:'),
      text.indexOf('### P1-7:')
    );
    // No remaining open [-] in the shipped sections
    expect(p10Section).not.toMatch(/^- \[ \]/m);
    expect(p16Section).not.toMatch(/^- \[ \]/m);
    // At least one checked item each confirms the section isn't empty
    expect(p10Section).toMatch(/^- \[x\]/m);
    expect(p16Section).toMatch(/^- \[x\]/m);
  });

  it('TODO.md contains the "What landed" section confirming P1-0/P1-6 shipped', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/TODO.md`, 'utf-8');
    expect(text).toMatch(/What landed/);
    expect(text).toMatch(/P1-0 Project Registry.*shipped `e9d2b91`/);
    expect(text).toMatch(/P1-6 File Export.*shipped `acb45ab`/);
  });

  // ------------------------------------------------------------------
  // PROJECT_BRIEF.md — the self-contained pitch
  // ------------------------------------------------------------------
  it('PROJECT_BRIEF.md does NOT say P1-0/P1-6 are "active" or "not yet built"', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).not.toMatch(/🔴.*Active work/i);
    expect(text).not.toMatch(/append-ideas.*planned.*not yet built/i);
    expect(text).not.toMatch(/not yet built.*do not treat as shipped/i);
  });

  it('PROJECT_BRIEF.md confirmed endpoints include probe-root and append-ideas', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).toMatch(/\/api\/files\/probe-root/);
    expect(text).toMatch(/\/api\/files\/append-ideas/);
  });

  it('PROJECT_BRIEF.md "In one breath" calls Phase 1 feature-complete', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/PROJECT_BRIEF.md`, 'utf-8');
    expect(text).toMatch(/Phase 1.*feature-complete/);
    expect(text).not.toMatch(/Immediate next step.*P1-0/);
  });

  // ------------------------------------------------------------------
  // ai-ui-editor/README.md — the API reference (already updated in WT)
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
    expect(text).not.toMatch(/projectRoot.*window\.location\.origin.*active work item/i);
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
    expect(text).not.toMatch(/will be what file.g.it operations target/i);
    expect(text).not.toMatch(/currently only built-in profiles selectable/i);
  });

  // ------------------------------------------------------------------
  // Negative check: no doc still points to any deleted POSTMVP_TODO.md,
  // MVP_COMPLETE.md, or PROJECT_STATUS.md as an active resource
  // ------------------------------------------------------------------
  it('no authoritative doc still sends readers to deleted snapshot docs as active docs', async () => {
    const authoritative = [
      `${REPO_ROOT}/README.md`,
      `${REPO_ROOT}/TODO.md`,
      `${REPO_ROOT}/PROJECT_BRIEF.md`,
      `${REPO_ROOT}/ai-ui-editor/README.md`,
      `${REPO_ROOT}/ai-ui-editor/PROJECT_PROFILE.md`,
      `${REPO_ROOT}/MVP_REQUIREMENTS.md`,
      `${REPO_ROOT}/memory/antikythera-integration-vision.md`,
    ];
    for (const path of authoritative) {
      const text = await fs.readFile(path, 'utf-8');
      // "Read the current roadmap in POSTMVP_TODO.md" style pointers = drift
      expect(text).not.toMatch(
        /(see|read)\s+(the\s+)?[`"]?ai-ui-editor\/POSTMVP_TODO\.md[`"]?/i
      );
      expect(text).not.toMatch(
        /(see|read)\s+(the\s+)?[`"]?ai-ui-editor\/MVP_COMPLETE\.md[`"]?/i
      );
      expect(text).not.toMatch(
        /(see|read)\s+(the\s+)?[`"]?ai-ui-editor\/PROJECT_STATUS\.md[`"]?/i
      );
    }
  });

  // ------------------------------------------------------------------
  // GAP_AUDIT.md itself: the Pending section now says P1-7 is done
  // ------------------------------------------------------------------
  it('GAP_AUDIT.md Pending section says doc-sync is done', async () => {
    const text = await fs.readFile(`${REPO_ROOT}/GAP_AUDIT.md`, 'utf-8');
    // Header: "### 📝 P1-7: Doc-sync ✅ done (2026-07-05)"
    expect(text).toMatch(/P1-7.*Doc-sync\b.*done\b/);
    // TL;DR item 1 must NOT say "the real pending item" anymore
    expect(text).not.toMatch(/doc-sync.*the real pending item/);
    expect(text).not.toMatch(
      /doc-sync — the docs still describe shipped work as future/
    );
  });
});