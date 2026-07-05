import { describe, it, expect } from 'vitest';
import { resolveApplyBase } from '../shared/apply';
import { applyDiff } from '../shared/diff';

// resolveApplyBase encodes the P3 contract: applyDiff must run against real
// source, not ''. These tests pin the precedence chain and the "refuse to
// write a half-applied diff" behavior.

const FILE_A = 'src/components/Card.tsx';
const FILE_B = 'src/components/Button.tsx';
const SRC_A = 'export const Card = () => <div>A</div>;\n';
const SRC_B = 'export const Button = () => <button>B</button>;\n';
const OPTIONS_FILE = 'src/Generated.tsx';

describe('resolveApplyBase', () => {
  it('prefers a manual pick over resolved source and over context.sourceCode', () => {
    const r = resolveApplyBase({
      pickedFile: FILE_A,
      pickedFileContent: SRC_A,
      resolvedFilePath: FILE_B,
      resolvedSourceCode: SRC_B,
      contextSourceCode: 'stale context code',
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).toBe(FILE_A);
    expect(r.baseSource).toBe(SRC_A);
    expect(r.needsManualPick).toBe(false);
  });

  it('uses resolved source (and resolved path) when no manual pick is present', () => {
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: FILE_B,
      resolvedSourceCode: SRC_B,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).toBe(FILE_B);
    expect(r.baseSource).toBe(SRC_B);
    expect(r.needsManualPick).toBe(false);
  });

  it('falls back to option.file when resolved source is present but resolved path is missing', () => {
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: undefined,
      resolvedSourceCode: SRC_B,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).toBe(OPTIONS_FILE);
    expect(r.baseSource).toBe(SRC_B);
  });

  it('falls back to context.sourceCode + option.file when neither pick nor resolved source exists', () => {
    const ctxSrc = 'export const X = 1;\n';
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: undefined,
      resolvedSourceCode: undefined,
      contextSourceCode: ctxSrc,
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).toBe(OPTIONS_FILE);
    expect(r.baseSource).toBe(ctxSrc);
    expect(r.needsManualPick).toBe(false);
  });

  it('signals needsManualPick when no base is available (the original P3 bug: empty base)', () => {
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: undefined,
      resolvedSourceCode: undefined,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).toBe(OPTIONS_FILE);
    expect(r.baseSource).toBe('');
    expect(r.needsManualPick).toBe(true);
  });

  it('signals needsManualPick when a pick is declared but its content is empty', () => {
    const r = resolveApplyBase({
      pickedFile: FILE_A,
      pickedFileContent: '   \n   ',
      resolvedFilePath: undefined,
      resolvedSourceCode: undefined,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    // Declared pick but no real content → still ask for a manual pick rather
    // than apply the diff against an empty base.
    expect(r.file).toBe(FILE_A);
    expect(r.baseSource).toBe('');
    expect(r.needsManualPick).toBe(true);
  });

  it('treats a picked file path with null content as "no pick" (resolves to resolved/context source)', () => {
    // pickedFile set but pickedFileContent null — e.g. user typed a path but
    // hasn't fetched it yet. Don't claim the pick; fall through to resolved.
    const r = resolveApplyBase({
      pickedFile: FILE_A,
      pickedFileContent: null,
      resolvedFilePath: FILE_B,
      resolvedSourceCode: SRC_B,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).toBe(FILE_B);
    expect(r.baseSource).toBe(SRC_B);
    expect(r.needsManualPick).toBe(false);
  });

  it('trims whitespace when deciding whether the resolved source is non-empty', () => {
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: FILE_B,
      resolvedSourceCode: '  \n  ',
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    expect(r.baseSource).toBe('');
    expect(r.needsManualPick).toBe(true);
  });

  it('does not let a blank stale pick leak into the file field when resolved source is used', () => {
    // Regression: an earlier version conflated resolved source into pickedFile,
    // so file resolved to '' or the stale pick. Verify the resolved path wins.
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: FILE_B,
      resolvedSourceCode: SRC_B,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    expect(r.file).not.toBe('');
    expect(r.baseSource).toBe(SRC_B);
  });

  it('integration: produces a full correct file when resolved source is the base', () => {
    // Mirrors handleApply: base from resolved source, then applyDiff.
    const base = [
      'export const Card = () => (',
      '  <div className="bg-white">Hello</div>',
      ');',
    ].join('\n');
    const r = resolveApplyBase({
      pickedFile: '',
      pickedFileContent: null,
      resolvedFilePath: FILE_A,
      resolvedSourceCode: base,
      contextSourceCode: '',
      optionFile: OPTIONS_FILE,
    });
    const diff = [
      '@@ -2,1 +2,1 @@',
      '-  <div className="bg-white">Hello</div>',
      '+  <div className="bg-blue-100">Hello</div>',
    ].join('\n');
    const result = applyDiff(r.baseSource, diff);
    // Critical P3 assertion: result is the FULL file, not just the diff
    // addition. Lines 1 and 3 are retained from the base.
    expect(result).toBe(
      ['export const Card = () => (', '  <div className="bg-blue-100">Hello</div>', ');'].join('\n')
    );
    expect(r.needsManualPick).toBe(false);
  });
});
