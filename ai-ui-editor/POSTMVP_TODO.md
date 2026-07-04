# AI UI Editor — Post-MVP TODO

> Re-reviewed 2026-07-04 against the actual code (`git` + grep), not just prior docs.
> The original POSTMVP plan used `P1`…`P10` IDs. Status updated below with evidence.

## What this re-review found done since the original 2026-07-02 plan

- **P1 ✅** Extension build pipeline fixed: `extension/scripts/build-workers.mjs` builds `background.js` + `content-script.js`; both present in `dist/`. `npm run build` = `vite build && node scripts/build-workers.mjs`.
- **P2 ✅** Context-menu registration moved to the background service worker: `background.ts` does `onInstalled` → `contextMenus.create` + `contextMenus.onClicked` → `chrome.scripting.executeScript`. Content-script no longer touches `chrome.contextMenus`; click coords are passed through (`info.x/info.y`).
- **P4 ✅** `sanitizeFilePath` + Zod validation on `/write`, `/validate`, `/undo`; `git/undo` projectRoot fix landed (commits `ab07b00`, `dcdf47b`).
- **P5 ✅** WebSocket path fixed: extension connects to `ws://localhost:3000/ws/connect`, matching `server.ts` → `wsRoutes` at prefix `/ws` + `ws.ts` `GET /connect`.
- **P6 ✅** DiffValidator rewritten to use the TypeScript programmatic API + oxlint, surfacing real diagnostics (commit `dcdf47b`).
- **P7 ✅ (mostly)** Real sourcemap resolution landed (commit `8dbb195`): `SourcemapResolver` wired into the AI pipeline via `resolveContextSource`; `source-map` dep added; `needsFileSelection` MVP-18 fallback prompt in popup.
- **P3 🟡 (this session)** Plumb resolved source to the popup so `applyDiff` has a real base. The 4-file diff that prompted this review does exactly that — and this session fixed a bug where the **non-streaming** `/edit` route referenced `resolvedFilePath`/`resolvedSourceCode` without destructuring them (now fixed; `tsc --noEmit` passes).

## Still pending (verified 2026-07-04)

### P3-tail — Confirm the apply flow end-to-end on a real element  🟠
The plumbing now sends `resolvedSourceCode`/`resolvedFilePath` to the popup on both `/edit` and `/edit/stream`, and the popup stores them into the same `pickedFileContent`/`pickedFile` state `handleApply` already reads. **Verify, don't assume:**
1. Run the sample project + middleware + a real right-click and confirm `option.file` and the resolved path agree and the written file is the full correct file (not just the diff additions).
2. Confirm the no-sourcemap branch still prompts manual file pick (`needsFileSelection`) and that the manual-pick path still overrides the resolved source.
3. Edge case: regenerating after a manual pick currently overwrites `pickedFile`/`pickedFileContent` with the new resolution result. Decide if that's intended or if resolved-source should only populate when no manual pick exists.

### P8 — Real token streaming (or remove the dead path)  🟠
Still NOT implemented. `OpencodeClient.generateEditOptionsStream` greps show **no `stream:true`, no `for await ... of chunk.choices`/delta iteration** — it awaits one full completion, then emits staged progress events (`prompt`→…→`complete`). It's a status ticker, not token streaming; latency = full NIM round-trip. The SSE plumbing (`/edit/stream`, `send-streaming-to-server`, `stream-progress`, popup progress UI) is real but currently only carries staged status.
- **Decision needed:** make it real (openai `stream:true`, forward deltas as SSE per-token, render incrementally in popup) OR downgrade the route to a status-only SSE and stop calling it "streaming".

### P9 — previewHtml sanitization + ExtensionMessage types sync  🟡
- **XSS:** `ResponseParser.ts` validates `previewHtml` only as `z.string().min(1)`. AI-supplied HTML is rendered into an iframe with `sandbox="allow-same-origin"` (App.tsx). `allow-same-origin` + unsanitized AI HTML is an XSS/SOP-bypass surface. **Fix:** strip `<script>`/event-handler attributes (`on*=`) before rendering, OR drop `allow-same-origin` and use a strict sandbox + CSP. The mock templates are safe-by-hand but model output is not.
- **Types drift:** `ExtensionMessage` still doesn't match runtime usage (`hide-popup`/`apply-diff`/`undo` paths, extra message types). Sync the union to what the code actually sends/receives so the background↔popup contract is type-checked.

### P10 — Sync docs to reality  🟡
Verified mismatches (still present):
1. `MVP_REQUIREMENTS.md` "AI Client | Opencode SDK (primary)" and "AI Fallback | Ollama → Llama 3.1 8B". **Code + `ai-ui-editor/README.md` actually use NVIDIA NIM** (OpenAI-compatible, `https://integrate.api.nvidia.com/v1`). Reconcile requirements ↔ implementation.
2. `ai-ui-editor/README.md` says default model = **Claude Sonnet 4** (`anthropic/claude-sonnet-4-20250514`) via `NVIDIA_MODEL`, while older `.env`/code referenced `meta/llama-3.1-...`. Pin exactly one default in README + `.env.example` + code and make them agree.
3. `MVP_COMPLETE.md` / `PROJECT_STATUS.md` still claim "All 20 tasks" and the "Mock AI pending" limitation, and say sourcemap is a "placeholder" — but P6/P7 are now real. Update both files to reflect real sourcemaps, real DiffValidator, NVIDIA NIM (not mock/Opencode).
4. Decide & record whether the NVIDIA-NIM WIP batch (originally 1660 lines uncommitted) is now considered committed/closed — recent commits suggest yes; update the "uncommitted WIP" note.

## Suggested execution order (remaining)

1. **P3-tail** — one real end-to-end apply test to confirm the diff you just shipped actually produces correct files.  🟠
2. **P8** — stream real tokens or relabel.  🟠
3. **P9** — previewHtml sanitization (security) + `ExtensionMessage` types sync.  🟡
4. **P10** — doc/reality sync (requirements ↔ NVIDIA NIM, model default, completion status).  🟡

## Not started (future / out of MVP-19 scope)

- Multi-file coordinated changes (MVP_COMPLETE "Next Steps" #3).
- Functional (non-visual) edits — event handlers, props, logic.
- DevTools panel + edit history/timeline.
- Team sharing of edit sessions.
