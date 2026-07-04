// Pure apply-flow base resolution, extracted from popup/App.tsx so the P3
// contract ("applyDiff must run against the real source, not ''") is unit-
// testable without React/chrome.
//
// Precedence for the diff base and target file:
//   1. Manually-picked file (user chose it after a sourcemap miss) — highest
//      trust, overrides everything.
//   2. Middleware-resolved source (resolvedSourceCode + resolvedFilePath),
//      carried in the EditResponse when sourcemap resolution succeeded.
//   3. context.sourceCode + option.file — present when the caller already had
//      the file in hand (e.g. older capture path).
// If none yields a non-empty base, `needsManualPick` is true so the caller can
// refuse to write a half-applied diff.

export interface ApplyBaseInput {
  pickedFile: string;
  pickedFileContent: string | null;
  resolvedFilePath?: string;
  resolvedSourceCode?: string;
  contextSourceCode?: string;
  optionFile: string;
}

export interface ApplyBase {
  file: string;
  baseSource: string;
  needsManualPick: boolean;
}

export function resolveApplyBase(input: ApplyBaseInput): ApplyBase {
  const hasPick = input.pickedFile.trim().length > 0 && input.pickedFileContent !== null;
  if (hasPick) {
    const baseSource = (input.pickedFileContent ?? '').trim()
      ? input.pickedFileContent ?? ''
      : input.resolvedSourceCode ?? input.contextSourceCode ?? '';
    return {
      file: input.pickedFile,
      baseSource,
      needsManualPick: !baseSource.trim(),
    };
  }

  const resolvedBase = (input.resolvedSourceCode ?? '').trim() ? input.resolvedSourceCode! : '';
  if (resolvedBase) {
    return {
      file: input.resolvedFilePath || input.optionFile,
      baseSource: resolvedBase,
      needsManualPick: false,
    };
  }

  const ctxBase = (input.contextSourceCode ?? '').trim() ? input.contextSourceCode! : '';
  return {
    file: input.optionFile,
    baseSource: ctxBase,
    needsManualPick: !ctxBase.trim(),
  };
}
