# AI UI Editor — Post-MVP TODO

> Generated from a full code review on 2026-07-02.
> The repo's own plan uses `MVP-01`…`MVP-19` IDs and `MVP/Alpha/Beta` phases.
> There is **no** `P2-04`/`P3-01..06`/`P4-01..07` plan in this repo — the task IDs below (`P1`…`P10`) are new, review-derived, and tracked in the session task list.

## State snapshot

- MVP marked complete 2026-07-02 (`MVP_COMPLETE.md`), but a 1660-line uncommitted WIP batch replaces the mock AI with **real NVIDIA NIM** integration (Zod-validated, retry/backoff, mock fallback) + staged "streaming" + 24 new passing tests.
- Test baseline: **26/27 passing** — the 1 failure is a pre-existing integration test (`api.test.ts > should generate AI edit options`) that needs a running server, not caused by the WIP.
- The extension **does not load as built** (no `background.js`/`content-script.js` in `dist/`), and the apply flow **writes broken files** (`sourceCode` is never populated).

## Done & working

**Middleware**
- Fastify boots, CORS, WebSocket plugin, `/health`, `0.0.0.0:3000` (`server.ts`; port hardcoded, ignores config)
- Routes registered: `/api/ai`, `/api/files`, `/ws`, `/api/git`
- Real NVIDIA NIM via `openai` SDK, `response_format: json_object`, retry on 429/503/408, **Zod validation** (`OpencodeClient.ts`, `ResponseParser.ts`)
- Mock fallback when `NVIDIA_API_KEY` unset or parse fails (`OpencodeClient.mock.ts`)
- `/api/ai/edit` returns `EditResponse`; `/api/files/validate` + `/write` wired to services; `/api/git/undo` wired to `GitManager` (simple-git installed)
- 24 new unit tests passing

**Extension**
- Popup UI coded against real routes (generate / apply / undo)
- Background `tabState`, `get-current-element`, `send-to-server`, `ws-send`, tab cleanup
- Content-script element capture (outerHTML, computed styles, classNames, hierarchy, framework sniff)

## Pending (P1–P10), ordered by severity

### P1 — Extension build pipeline  🔴 (critical)
`vite.config.ts` only builds `popup/index.html`; `manifest.json` references `background.js` + `content-script.js` that **don't exist in `dist/`**. Add an esbuild/tsc target for the workers. Fix `App.tsx` import `../../shared/types` (`extension/shared/` doesn't exist — types live in `middleware/src/shared`). **Extension cannot load as built.**

### P2 — Move context-menu registration to background SW  🔴
`content-script.ts` calls `chrome.contextMenus`/`onInstalled` — those belong to the background service worker, not the content script. `executeScript(captureElementContext)` drops `detectFramework` (ReferenceError) and loses the clicked element (no `MouseEvent` → `elementFromPoint(NaN,NaN)`). Move menu creation+`onClicked` to `background.ts`; inject the helper self-contained; pass real click coords.

### P3 — Fix apply flow (sourceCode + validate-before-write)  🔴 (blocked by P1)
Content-script omits `context.sourceCode`, so popup `applyDiff('', diff)` writes just the added lines → broken files. Either have content-script/middleware provide current source for `option.file`, or move diff-application to the server (read→apply→validate→write). Call `/api/files/validate` before `/api/files/write` (MVP-13/17) — popup currently never does.

### P4 — `/api/files/write` path sanitization + `/api/git/undo` projectRoot  🔴
- **Security:** `routes/files.ts` passes `file` straight to `GitManager.writeFileWithGit` with no `sanitizeFilePath` — path traversal / arbitrary write. Apply recursive `../` strip + allowlist at the route layer.
- **Correctness:** `routes/git.ts` sets `projectRoot = process.cwd()` (the middleware dir, not the user project). Scope undo to the user's project via the request body.
- Add Zod body validation to `/write`, `/validate`, `/undo`.

### P5 — WebSocket path mismatch  🔴
Extension connects to `ws://localhost:3000/ws`; server mounts WS at `/ws/connect`. Reconnect loop dead-letters forever. Point extension at `/ws/connect` (or rename the server route to `/ws`).

### P6 — Fix DiffValidator (eslint missing, silent false-valid)  🔴
Shells out to `npx eslint` but **eslint isn't installed** (sample project uses oxlint); `catch{} + || true` swallows failures and reports "valid". Single-file `npx tsc --noEmit` (no tsconfig) is meaningless. Add `eslint` + use the Node `Linter` API (or `@oxlint/api`); replace single-file tsc with the TS programmatic API; temp files → `os.tmpdir()` with unique names; surface real diagnostics.

### P7 — Real sourcemap resolution (MVP-05/18)  🟠
`SourcemapResolver.ts` is broken placeholder: uses `window`/`HTMLElement`/`__reactFiber` in Node, general path returns `null`, zero callers, `source-map` package undeclared. Real flow: content-script extracts sourcemap URL → middleware fetches `.js.map` from dev server → `source-map` parses → generated `line:col` → original `file:line`. Add `source-map` to deps; implement MVP-18 fallback prompt; wire into the AI pipeline so `context.sourceFile` is resolved server-side. `FrameworkDetector` is also a heuristic with zero callers.

### P8 — Real token streaming (or drop the dead path)  🟠
`generateEditOptionsStream` never sets `stream:true`; it awaits one full completion then emits staged progress (`prompt`→…→`complete`) — a status ticker, not token streaming; latency = full NIM round-trip. `send-streaming-to-server`/`stream-progress` have **no caller** and the popup has **no progress UI** — dead. Either make it real (openai `stream:true`, forward deltas as SSE, render in popup) or remove the dead server route + client path.

### P9 — previewHtml sanitization + ExtensionMessage types sync  🟡
- `previewHtml` only Zod-checked as non-empty string → unsanitized AI HTML sent to iframe (XSS). Sanitize (strip `<script>`/handlers) or enforce strict sandbox/CSP.
- `ExtensionMessage` union declares 5 types but extension uses 8+; `hide-popup`/`apply-diff`/`undo` are dead. Sync types to reality.

### P10 — Sync docs to reality  🟡
(1) Requirements say Opencode SDK primary + Ollama fallback; code+README+.env use **NVIDIA NIM** — reconcile. (2) README default model = Claude Sonnet 4; `.env`+code = Llama 3.1 70B — pin one. (3) `MVP_COMPLETE`/README-limitations still say "Mock AI pending" — update. (4) Requirements define **19** IDs; status docs claim "All 20 tasks" — fix. (5) Decide whether to commit the NVIDIA-NIM WIP batch.

## Suggested execution order

1. **P1** (build pipeline) → unblocks loading  🔴
2. **P2** (context menu to SW) → right-click works  🔴
3. **P3** (apply flow) → make edits not garbage  🔴
4. **P4** (write safety + undo scope) → security + correctness  🔴
5. **P5** (WS path) → quick fix  🔴
6. **P6** (DiffValidator) → validation is real  🔴
7. **P7** (sourcemaps) → the genuine "Next Step #2"  🟠
8. **P8** (streaming: real or remove)  🟠
9. **P9**, **P10** (hygiene/docs)  🟡
