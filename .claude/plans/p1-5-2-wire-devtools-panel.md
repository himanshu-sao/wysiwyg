# P1.5-2 — Wire the disconnected DevTools history panel (Option A)

## Context (verified this session)

The DevTools history panel (`ai-ui-editor/extension/devtools/DevToolsPanel.tsx`, ~150 lines,
built + wired into `manifest.json`) is a UI with no data source:
- It listens for `edit-applied` / `edit-undone` and sends `undo-specific` — but no other file
  broadcasts those strings, and they aren't in the `ExtensionMessage` type union
  (`extension/shared/types.ts:141-159`). Confirmed by grep: the panel is the only source.
- The apply flow (`App.tsx:459 doWrite` → `send-to-server` → `POST /api/files/write`) and the
  undo flow (`App.tsx:470 handleUndo` → `send-to-server` → `POST /api/git/undo`) both live in
  the POPUP, not `background.ts`. The background `send-to-server` handler
  (`background.ts:232-258`) is a generic `{endpoint, body}` relay — it has no idea which call
  is apply vs undo.
- The popup already has a stable per-edit id: `EditOption.id` (set in the AI response, rendered
  at `App.tsx:661`/`675`, the Apply button passes `option` into `handleApply(option)`). The panel
  already reads `message.data.id` (`DevToolsPanel.tsx:87`).

The TODO's Option A text says broadcast from `background.ts`. **Rationale for adjusting:** the
popup is the actor that knows which option was applied and whether it succeeded; the background
relay sees only an opaque `{endpoint, body}`. Routing apply/undo awareness through the popup
(which already has `option`, `instruction`, `file`, `diff`, `commitHash`) avoids
reverse-engineering call intent in the generic relay and co-locates the broadcast with the
success it announces. The broadcast uses `chrome.runtime.sendMessage` (the same channel the
background uses), so the panel (registered via `chrome.runtime.onMessage` in the devtools page)
receives it identically regardless of which context emits it. This is a faithful implementation
of Option A's intent (the panel gets live history) via a cleaner seam.

P1.5-1 + P1.5-4 are already done in the working tree (uncommitted) — this plan does NOT touch
them; it layers the wiring on as a separate concern.

## Approach

Broadcast `edit-applied` / `edit-undone` from the popup on apply/undo success, keyed by a stable
edit id. Handle the panel's `undo-specific` as "undo last" (TODO's simplest acceptable behavior)
by routing it to `/api/git/undo` from a new background handler. Add the three message types to the
`ExtensionMessage` union in BOTH `shared/types.ts` files (type-mirror convention). Extract the
payload-building into pure helpers in `extension/shared/` (mirrors `applyDiff`/`resolveApplyBase`)
so the broadcast contract is unit-testable without mounting React. Update TODO.md + the docSync
count guard.

## Changes

### 1. Type mirror — add three message types (both files, same commit)

**`ai-ui-editor/extension/shared/types.ts`** (in the `ExtensionMessage` union, ~line 158): add
`'edit-applied' | 'edit-undone' | 'undo-specific'`. Update the Incoming/Outgoing comment above
the union (~lines 133-140): add `undo-specific` to Incoming (popup→background), `edit-applied`/
`edit-undone` to Outgoing (popup→panel). Add a `(+ P1.5-2 …)` note line.

**`ai-ui-editor/middleware/src/shared/types.ts`** — identical union addition (the two
`ExtensionMessage` unions are currently identical; verified by reading both). Update the
comment block above each union identically.

**typesMirror coverage (verified by reading the test):** `typesMirror.test.ts` is name-set +
sample-value level only — it asserts the exported type *names* match and that sample values
cross-assign. Adding union members does NOT add type names, so the mirror's name-set test stays
green automatically. The test *also* has an audit-style `.toContain(...)` block asserting the
middleware source contains specific union literals (`'registry-add'`, `'send-to-server'`,
`'mode-changed'`, …) and NOT stale ones. For symmetry + documentation, **add three `.toContain`
assertions** there for `'edit-applied'`, `'edit-undone'`, `'undo-specific'` (in the "the
middleware ExtensionMessage is NOT the stale 5-type union" test). Field-level shape drift is
caught only by `tsc`/build, not vitest — that's an accepted limitation of the existing guard.

### 2. Pure payload helpers — `extension/shared/editHistoryBroadcast.ts`

Two tiny pure functions (mirrors how `applyDiff`/`resolveApplyBase` were extracted for testability):
- `editAppliedPayload(option: EditOption, instruction: string): ExtensionMessage` →
  `{ type: 'edit-applied', data: { id: option.id, element, instruction, file: option.file,
  diff: option.diff } }`.
- `editUndonePayload(id: string): ExtensionMessage` → `{ type: 'edit-undone', data: { id } }`.

`EditOption` already carries `id`, `file`, `diff`, and the panel's `HistoryEntry.element` shape is
`{ html, classNames, id? }` — `EditOption` has no element, so `editAppliedPayload` will pull the
element from the popup's captured `elementContext?.element` (pass it in as a third arg:
`editAppliedPayload(option, instruction, element)`). Adjust signature to
`(option, instruction, element: ElementContext | undefined)`.

### 3. Popup — emit broadcasts + track last-applied id (`App.tsx`)

- Add `lastAppliedIdRef = useRef<string | null>(null)` (near `pendingWriteRef`).
- Add `pendingApplyMetaRef = useRef<{ id: string; element, instruction, file, diff } | null>(null)`.
- In `handleApply(option)`: set `pendingApplyMetaRef` with the option + captured element + instruction
  (alongside the existing `pendingWriteRef` set at line 381).
- In the `server-response` handler (lines 71-122): before the existing write/append-fallthrough
  logic, add a write-success branch that detects a `/api/files/write` result
  (`data.success === true && typeof data.commitHash === 'string'`) and, if
  `pendingApplyMetaRef.current` is set, broadcasts `chrome.runtime.sendMessage(editAppliedPayload(…))`,
  sets `lastAppliedIdRef.current = meta.id`, clears `pendingApplyMetaRef`, clears loading, and breaks.
  *(Side effect / latent bug fix: the write response currently falls through to the edit-options
  branch at line 124 and noisily calls setOptions(undefined); this branch intercepts it cleanly.
  Verify the Apply-button spinner still clears.)*
- In `handleUndo()` (line 470): keep the relay to `/api/git/undo`; set a `pendingUndoMetaRef`
  flag so the response handler, on undo success, broadcasts `chrome.runtime.sendMessage(editUndonePayload
  (lastAppliedIdRef.current ?? ''))`. **`/api/git/undo` response shape (verified in
  `middleware/src/routes/git.ts`):** `{ success: true, message, commitHash }` or
  `{ success: false, error }`. Response shapes of write/undo/append-ideas ALL share `success`, so
  **disambiguate by the pending meta ref, not by response fields**: the `server-response` branch
  checks `if (pendingWriteMetaRef.current?.kind === 'write')` … `else if (pendingUndoMetaRef.current)`
  … to route each result. Key undo-success off `data.success === true` guarded by the pending-undo
  ref.

### 4. Background — handle the panel's `undo-specific` (`background.ts`)

Add `case 'undo-specific'`: fetch `POST /api/git/undo` with `body.projectRoot = message.data?.projectRoot`
(reuse the same fetch shape as `send-to-server`, lines 232-258 — factor a small `httpPost` helper
or inline). On success, broadcast `chrome.runtime.sendMessage({ type: 'edit-undone',
data: { id: message.data?.entryId } })` (echo the panel-supplied `entryId`). Reply `sendResponse`
with the raw result. Per the TODO, "undo last" semantics are acceptable initially (`/api/git/undo`
undoes the most recent commit), so `entryId` is echoed as-is for the panel's dedupe — honest in
the docs that per-edit undo is not yet supported.

### 5. Test — `extension/__tests__/panelHistory.test.ts`

Mock a minimal `chrome` global (`runtime.sendMessage` → pushed into an array; `runtime.onMessage`
→ stub) since extension tests run in `environment: 'node'` with no chrome (verified in
`vitest.config.ts`). Load-bearing assertions test the PURE helpers:
- `editAppliedPayload(option, instruction, element)` returns `{ type:'edit-applied', data:{id,
  element, instruction, file, diff} }` with stable id and present fields.
- `editUndonePayload(id)` returns `{ type:'edit-undone', data:{id} }`.
- Optionally a plain mock-spied assertion that `chrome.runtime.sendMessage` is invoked with the
  expected broadcast shape (mirrors the repo's placeholder-acceptance pattern where full React
  mount isn't feasible — see `popup.requirements.test.ts`). ~4-6 assertions total.

### 6. Docs + count guard

- **TODO.md** P1.5-2 (lines 307-347): tick Option A boxes, keep Option B as not-chosen, tick
  `Done when`. Remove the Appendix A "P1-7 follow-ups explicitly deferred" DevTools panel bullet
  (lines 641-643) → mark resolved.
- **docSync count guard**: adding `panelHistory.test.ts` raises the extension total. Run the
  suite, read the actual new counts, then update `LIVE_EXT`/`LIVE_GRAND` in
  `middleware/__tests__/docSync.test.ts` AND the Appendix A test table + PROJECT_BRIEF.md §7/§12
  to the new numbers, in the same commit. (P1.5-4's guard WILL FAIL if tests are added without a
  doc bump — intended behavior.)

## Verification (Done when)

- [ ] `ExtensionMessage` union has the three new members in BOTH `shared/types.ts`; mirror green.
- [ ] Popup broadcasts `edit-applied` after successful `/api/files/write`; `edit-undone` after successful undo.
- [ ] Background handles `undo-specific` → `/api/git/undo` and broadcasts `edit-undone` on success.
- [ ] No `edit-applied`/`edit-undone`/`undo-specific` strings remain untyped/unwired (grep check).
- [ ] `panelHistory.test.ts` green; `editHistoryBroadcast.ts` pure helpers tested.
- [ ] `npm test` green in BOTH extension + middleware; count guard bumped + docs updated to match.
- [ ] `npx tsc --noEmit` clean in both packages; extension `npm run build` clean.
- [ ] TODO.md P1.5-2 + deferred-follower bullet updated.

## Scope guardrails

- Do NOT touch the uncommitted P1.5-1/P1.5-4 changes.
- Do NOT change `/api/git/undo` semantics (per-edit undo is out of scope; "undo last" acceptable).
- Do NOT introduce a shared workspace package; keep the manual type mirror.
- Export flow (`/api/files/append-ideas`) intentionally does NOT emit `edit-applied` — the panel is
  an EDIT history (element/diff/file shaped); export already has its own confirmation.

## Risk / what could go wrong

- The popup's `server-response` handler currently mis-routes the write response (falls through to
  the edit-options branch, calls `setOptions(undefined)`). Adding a write-success branch fixes this
  latent bug as a side effect — but the popup's loading state after apply may shift (it may stay
  "loading" until the write response instead of the AI response). Verify the Apply-button spinner
  clears correctly; adjust if needed. This is the one behavior touch beyond the broadcast.
- `typesMirror.test.ts` may assert only the exported type-NAME set (union members don't add names).
  Re-read it before claiming coverage; if name-level, add a member-presence assertion or accept
  name-level coverage and note it.
