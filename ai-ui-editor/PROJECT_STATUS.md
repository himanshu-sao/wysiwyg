# Project Status: AI UI Editor

> ⚠️ **STALE SNAPSHOT (predates P4/P6/P7/P10 and the Requirements Bridge).** This status
> doc describes the system at "MVP + P3/P8/P9" — i.e. before Git/Undo/Zod hardening (P4),
> the DiffValidator rewrite (P6), real sourcemaps (P7), XSS sanitization + docs-sync (P9/P10),
> and the Export mode / Project Profile System / Requirements Bridge (P1-1…P1-5; P1-0/P1-6
> active). Treat it as a point-in-time snapshot, not current status. For current status see
> [`README.md`](README.md) + [`TODO.md`](TODO.md); for the full picture see
> [`PROJECT_BRIEF.md`](PROJECT_BRIEF.md). The "Servers Running" section below is phrased as
> if servers are live — they are **not** running by default; it's a *how to run* guide.

## MVP Development Complete ✅

All 19 MVP tasks (MVP-01…MVP-19) have been implemented, plus P3 (apply flow), P8 (token streaming), and P9 (XSS sanitization) from the post-MVP backlog.

### Summary
- **Chrome Extension**: Fully functional with right-click context menu, element capture, and popup UI
- **Middleware Server**: Fastify-based server with NVIDIA NIM AI integration, file operations, and Git integration
- **Sample Project**: React + Vite + Tailwind test app with multiple components
- **Documentation**: README.md with setup instructions and API reference
- **Tests**: 37 middleware tests + 30 extension tests passing

### How to run
- Middleware: `localhost:3000` (health check at `/health` — run `cd middleware && npm run dev`)
- Sample Project: `localhost:5174` (HMR; run `cd sample-project && npm run dev`)

### To Use
1. Build extension: `cd extension && npm run build`
2. Load in Chrome: `chrome://extensions/` → Developer mode → Load unpacked → select `dist/`
3. Navigate to sample project and right-click any element

### Files to Reference
- `README.md` - Full documentation
- `MVP_COMPLETE.md` - Detailed completion status
- `POSTMVP_TODO.md` - Remaining backlog
- `shared/types.ts` - TypeScript interfaces
- `middleware/src/server.ts` - Server entry point
- `extension/popup/App.tsx` - Popup UI component
