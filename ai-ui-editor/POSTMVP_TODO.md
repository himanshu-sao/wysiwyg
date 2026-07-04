# AI UI Editor — Post-MVP TODO

> Updated 2026-07-04 after completing P3/P8/P9/P10 in commit dd97dee.

## What's Done (P1–P10)

- **P1 ✅** Extension build pipeline fixed: `extension/scripts/build-workers.mjs` builds `background.js` + `content-script.js`; both present in `dist/`.
- **P2 ✅** Context-menu registration moved to the background service worker.
- **P3 ✅** Apply flow fixed: `resolveApplyBase()` helper extracts base-resolution logic, dedicated `resolvedFilePath`/`resolvedSourceCode` state (separate from manual pick), 10 tests, manual-pick survives regenerate.
- **P4 ✅** `sanitizeFilePath` + Zod validation on `/write`, `/validate`, `/undo`; `git/undo` projectRoot fix (commits `ab07b00`, `dcdf47b`).
- **P5 ✅** WebSocket path fixed: extension connects to `ws://localhost:3000/ws/connect`.
- **P6 ✅** DiffValidator rewritten to use TypeScript programmatic API + oxlint (commit `dcdf47b`).
- **P7 ✅** Real sourcemap resolution landed (commit `8dbb195`): `SourcemapResolver` wired into AI pipeline.
- **P8 ✅** Real token streaming implemented: `stream:true` in NIM call, per-token `onProgress('token', delta, {sofar})`, popup renders live token buffer, 3 tests (commit dd97dee).
- **P9 ✅** previewHtml sanitized (`sanitizeHtml()` strips `<script>`, event handlers, dangerous URLs), iframe sandbox set to empty string (most restrictive), `ExtensionMessage` type synced to actual usage, 13 tests (commit dd97dee).
- **P10 ✅** Docs synced to reality: NVIDIA NIM is the real AI (not Opencode/Ollama), default model is `meta/llama-3.1-70b-instruct`, sourcemaps are real, task count corrected to "19 MVP + 3 post-MVP" (commit dd97dee).

## Still Pending (Future Work)

### Multi-file coordinated changes  🟡
Each edit currently modifies one file. Supporting coordinated changes across multiple files (e.g., component + CSS file, or refactoring that touches multiple components) would require:
- AI response schema change: `options[]` → `changes: {file: diff}[]` per option
- Apply flow to batch-write multiple files atomically
- Git commit to include all changes together
- Rollback strategy if any file fails validation

### Functional (non-visual) edits  🟡
Currently limited to CSS/styling changes only. Supporting functional edits (event handlers, props, logic modifications) would require:
- Expanded AI prompt template to allow functional changes
- More sophisticated validation (beyond lint/type check — e.g., test execution)
- Safety guardrails to prevent breaking changes

### DevTools panel + edit history/timeline  🟡
Currently the UI lives in the popup. A dedicated DevTools panel would enable:
- Larger workspace for diff review
- Persistent edit history across sessions
- Search/filter of past edits
- Session export/import

### Team sharing of edit sessions  🟡
Sharing edit sessions with teammates would require:
- Session serialization (context + options + applied changes)
- Storage/export mechanism
- Privacy/security review for shared AI-generated code

## Test Summary

| Project | Tests | Status |
|---------|-------|--------|
| Middleware | 37 | ✅ All pass |
| Extension | 30 | ✅ All pass |
| **Total** | **67** | ✅ |