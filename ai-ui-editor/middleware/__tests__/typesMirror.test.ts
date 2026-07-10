// P1-0/P1-6 follow-up (GAP_AUDIT "Type-Mirror Drift"): guard the
// hand-mirrored shared/types.ts pair from drifting again.
//
// The extension (`extension/shared/types.ts`) and the middleware
// (`middleware/src/shared/types.ts`) deliberately mirror each other by hand —
// the extension can't import across the package boundary, and no shared
// workspace package exists. The audit found they had drifted (middleware was
// missing WriteRequest.projectRoot, ExtensionMode, real ExtensionMessage; the
// extension was missing WriteResponse/Read*/ProbeRootResponse, etc.).
// They were reconciled to full lockstep. These tests pin that invariant.
//
// What they guard (and what they deliberately cannot):
//  - Name-set parity: both files export the SAME set of interface/type names.
//    Catches "added a type to one side, forgot the other" drift. (Runtime:
//    we parse the source text, since these are type-only modules with no
//    runtime exports — `import * as` yields an empty namespace at runtime.)
//  - Cross-import resolution: the middleware file can actually import the
//    extension file via the relative path, and the mirrored "contract" types
//    (the ones that genuinely cross the boundary) accept the same sample
//    values constructed from either side's definitions.
//
// What they CANNOT guard without `tsc` in the test loop: structural drift in a
// type's fields when both sides keep the same name but rename a field. That
// requires typecheck-level equality assertions (vitest run doesn't typecheck).
// The name-set + sample-construction tests below still give the audit's
// invariant a runtime guardrail; for field-level drift we rely on the fact
// that a value constructed against the middleware type is also typed as the
// extension type (the SAMPLE tests), which fails to compile in the editor /
// `npm run build` — surfacing field drift at build time even if vitest passes.

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

// Middleware types (canonical for this package).
import type {
  AppendIdeasRequest as MwAppendIdeasRequest,
  AppendIdeasResponse as MwAppendIdeasResponse,
  RequirementsExportResponse as MwRequirementsExportResponse,
  RequirementPriority as MwRequirementPriority,
  ProbeRootResponse as MwProbeRootResponse,
  RegisteredProject as MwRegisteredProject,
  ProjectRegistryState as MwProjectRegistryState,
} from '../src/shared/types';

// Extension types — imported across the package boundary by relative path,
// exactly as a future shared package would surface them. This import itself
// is a test (it would fail to resolve if the file moves/renames).
import type {
  AppendIdeasRequest as ExtAppendIdeasRequest,
  AppendIdeasResponse as ExtAppendIdeasResponse,
  RequirementsExportResponse as ExtRequirementsExportResponse,
  RequirementPriority as ExtRequirementPriority,
  ProbeRootResponse as ExtProbeRootResponse,
  RegisteredProject as ExtRegisteredProject,
  ProjectRegistryState as ExtProjectRegistryState,
} from '../../extension/shared/types';

const MIDDLEWARE_TYPES = path.resolve(__dirname, '..', 'src', 'shared', 'types.ts');
const EXTENSION_TYPES = path.resolve(__dirname, '..', '..', 'extension', 'shared', 'types.ts');

// Extract the set of `export interface X` / `export type X` names from a TS
// type-declaration file. Used because these modules are type-only — at runtime
// they export nothing, so we cannot introspect with `Object.keys(import('*'))`.
function exportedTypeNames(source: string): Set<string> {
  const names = new Set<string>();
  const re = /^export (?:interface|type) ([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    names.add(m[1]!);
  }
  return names;
}

describe('shared/types.ts type-mirror lockstep (P1-0/P1-6 GAP_AUDIT follow-up)', () => {
  it('both files exist and are readable', async () => {
    const [mw, ext] = await Promise.all([
      fs.readFile(MIDDLEWARE_TYPES, 'utf-8'),
      fs.readFile(EXTENSION_TYPES, 'utf-8'),
    ]);
    expect(mw.length).toBeGreaterThan(0);
    expect(ext.length).toBeGreaterThan(0);
  });

  it('both files export the SAME set of interface/type names (no drift)', async () => {
    const [mw, ext] = await Promise.all([
      fs.readFile(MIDDLEWARE_TYPES, 'utf-8'),
      fs.readFile(EXTENSION_TYPES, 'utf-8'),
    ]);
    const mwNames = exportedTypeNames(mw);
    const extNames = exportedTypeNames(ext);

    const missingFromExtension = [...mwNames].filter((n) => !extNames.has(n));
    const missingFromMiddleware = [...extNames].filter((n) => !mwNames.has(n));

    expect(missingFromExtension).toEqual([]);
    expect(missingFromMiddleware).toEqual([]);

    // Sanity: the audit's specific drift entries are now present on BOTH sides.
    // (If any of these names disappears from one file, the name-set test above
    //  catches it; this block documents the audit's checklist explicitly.)
    for (const required of [
      // middleware-originally-missing (now on both):
      'ExtensionMode',
      'RegisteredProject',
      'ProjectRegistryState',
      'RegistryStorage',
      // extension-originally-missing (now on both):
      'WriteResponse',
      'ReadRequest',
      'ReadResponse',
      'RequirementsExportRequest',
      'ProbeRootResponse',
      // the genuinely-shared P1-0/P1-6 contract:
      'AppendIdeasRequest',
      'AppendIdeasResponse',
      'RequirementsExportResponse',
      'RequirementPriority',
      'WriteRequest',
      'ValidateResponse',
      'ExtensionMessage',
    ]) {
      expect(mwNames.has(required)).toBe(true);
      expect(extNames.has(required)).toBe(true);
    }
  });

  it('the middleware ExtensionMessage is NOT the stale 5-type union', async () => {
    // GAP_AUDIT: middleware had a stale
    //   'element-selected' | 'show-popup' | 'hide-popup' | 'apply-diff' | 'undo'
    // — none of which the real extension ever sends. After reconciliation it
    // must contain the real registry + server-relay message types and must NOT
    // contain the stale 'hide-popup' / 'apply-diff' / 'element-selected' names.
    const mw = await fs.readFile(MIDDLEWARE_TYPES, 'utf-8');

    // Real types the extension actually sends (must be present):
    expect(mw).toContain('registry-add');
    expect(mw).toContain('registry-list');
    expect(mw).toContain('registry-select-active');
    expect(mw).toContain('registry-clear-override');
    expect(mw).toContain('registry-state');
    expect(mw).toContain('registry-error');
    expect(mw).toContain('send-to-server');
    expect(mw).toContain('mode-changed');

    // P1.5-2: the DevTools history panel's message types were wired in this
    // pass (documented both here and in the comment block above the union).
    // Documenting their presence mirrors the registry-* checklist above — if
    // any is dropped from the union, this surfaces it.
    expect(mw).toContain('edit-applied');
    expect(mw).toContain('edit-undone');
    expect(mw).toContain('undo-specific');

    // Stale types from the old middleware enum (must NOT be present — they'd
    // imply the dead 5-type union was re-added):
    expect(mw).not.toContain("'element-selected'");
    expect(mw).not.toContain("'hide-popup'");
    expect(mw).not.toContain("'apply-diff'");
  });

  it('mirrored contract types accept identical sample values from either side', () => {
    // Cross-package boundary-contract types must be shape-compatible. We build
    // a representative value typed as the EXTENSION type, then assign it to a
    // middleware-typed binding (and vice versa). This is a compile-time guard
    // that surfaces field-level shape drift at build time (and documents the
    // shared contract at runtime). If a field was renamed on one side only,
    // `npm run build` / editor typecheck fails here.
    const extAppend: ExtAppendIdeasRequest = {
      spec: 'Sample spec body',
      title: 'Add export button',
      priority: 'Medium',
      architectureHints: ['src/App.tsx'],
      testScenarios: ['renders button'],
      edgeCases: ['empty state'],
      instruction: 'Add a button here',
      projectRoot: '/tmp/sample',
      projectProfile: 'generic',
    };
    // The middleware AppendIdeasRequest is the canonical type the route
    // schema validates against; a value built from the extension's mirrored
    // type must satisfy it.
    const mwAppend: MwAppendIdeasRequest = extAppend;
    expect(mwAppend.spec).toBe('Sample spec body');
    expect(mwAppend.priority).toBe('Medium');

    const mwResp: MwAppendIdeasResponse = { success: true, id: 'ID-001', ideasLine: 'x', specPath: '/p' };
    const extResp: ExtAppendIdeasResponse = mwResp;
    expect(extResp.success).toBe(true);

    const mwExport: MwRequirementsExportResponse = {
      spec: 's',
      architectureHints: [],
      testScenarios: [],
      edgeCases: [],
      title: 'T',
      priority: 'Low',
    };
    const extExport: ExtRequirementsExportResponse = mwExport;
    expect(extExport.priority).toBe('Low');

    // RequirementPriority must accept the same literals on both sides.
    const p: MwRequirementPriority = 'High';
    const ep: ExtRequirementPriority = p;
    expect(ep).toBe('High');

    // ProbeRootResponse crosses via /probe-root.
    const mwProbe: MwProbeRootResponse = { valid: true, exists: true, marker: 'package.json', isAbsolute: true };
    const extProbe: ExtProbeRootResponse = mwProbe;
    expect(extProbe.marker).toBe('package.json');

    // Registry types are extension-owned but mirrored.
    const mwProj: MwRegisteredProject = {
      id: 'proj:/x',
      path: '/x',
      profileName: 'generic',
      displayName: 'x',
      registeredAt: 1,
    };
    const extProj: ExtRegisteredProject = mwProj;
    expect(extProj.id).toBe('proj:/x');

    const mwState: MwProjectRegistryState = {
      projects: [mwProj],
      activeByOrigin: { 'http://localhost:5174': mwProj.id },
      globalActiveId: undefined,
    };
    const extState: ExtProjectRegistryState = mwState;
    expect(extState.projects).toHaveLength(1);
  });
});
