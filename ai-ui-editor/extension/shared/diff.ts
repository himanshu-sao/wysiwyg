// Pure unified-diff application logic, extracted from popup/App.tsx so it can
// be unit-tested without React/chrome. Applies a unified diff to source text
// and returns the resulting text.
//
// Algorithm: a single forward pass that mirrors the original source via an
// `oldLine` pointer (a 1-based index into the source lines as the model saw
// them). Each `@@` hunk header resets the pointer to the hunk's old start;
// within a hunk, `-`/space lines advance the pointer through the original
// source while `+` lines are emitted alongside. This avoids the index-drift
// bug that a mutating-array approach hits once an insertion shifts later
// indices.

export function applyDiff(source: string, diff: string): string {
  if (!diff || !diff.trim()) return source;

  const srcLines = source.split('\n');
  const diffLines = diff.split('\n');

  let oldLine = 0; // 0-based index into srcLines (current source position)
  let pendingOldLine = -1; // hunk's expected old start (1-based, unset until first @@)
  const out: string[] = [];

  let i = 0;
  while (i < diffLines.length) {
    const dl = diffLines[i];

    if (dl.startsWith('@@')) {
      const m = dl.match(/@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s*@@/);
      if (!m) {
        i++;
        continue;
      }
      const oldStart = parseInt(m[1], 10);
      pendingOldLine = oldStart - 1; // convert to 0-based
      i++;
      continue;
    }

    if (dl.startsWith('\\')) {
      // "\ No newline at end of file" — ignore marker
      i++;
      continue;
    }

    if (dl.startsWith('-') || dl.startsWith('+') || dl.startsWith(' ')) {
      // First content line in/after a hunk: fast-forward the source pointer to
      // the hunk's expected old start, copying untouched source lines through.
      if (pendingOldLine >= 0) {
        while (oldLine < pendingOldLine && oldLine < srcLines.length) {
          out.push(srcLines[oldLine]);
          oldLine++;
        }
        oldLine = pendingOldLine;
        pendingOldLine = -1;
      }

      if (dl.startsWith('-')) {
        // Removal: consume a source line (only if it matches; otherwise still
        // advance the pointer so we don't desync on an imperfect diff).
        const removed = dl.slice(1);
        if (oldLine < srcLines.length && srcLines[oldLine] === removed) {
          oldLine++; // drop it
        } else {
          oldLine++; // mismatch — still advance to limit damage
        }
      } else if (dl.startsWith('+')) {
        out.push(dl.slice(1));
      } else {
        // context line: must match source; emit and advance
        if (oldLine < srcLines.length) {
          out.push(srcLines[oldLine]);
          oldLine++;
        } else {
          out.push(dl.slice(1));
        }
      }
      i++;
      continue;
    }

    // Line noise: "---", "+++", "diff --git", "index ...", blank lines outside hunks
    i++;
  }

  // Append any remaining source lines after the last hunk.
  while (oldLine < srcLines.length) {
    out.push(srcLines[oldLine]);
    oldLine++;
  }

  return out.join('\n');
}
