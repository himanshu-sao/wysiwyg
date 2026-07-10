import React, { useState, useEffect, useRef } from 'react';
import { EditRequest, EditOption, ExtensionMode, ProjectRegistryState, RegisteredProject } from '../shared/types';
import { applyDiff } from '../shared/diff';
import { resolveApplyBase } from '../shared/apply';
import { sanitizeHtml, getPreviewSandbox } from '../shared/sanitize';
import Modal from './components/Modal';

const MIDDLEWARE_HTTP_URL = 'http://localhost:3000';

// A3: Inline SVG icons replacing emoji structural headers. Feather/Lucide MIT-licensed
// paths simplified to ~120 bytes each.
const Icons = {
  filePen: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block align-[-2px]">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/>
      <path d="M14 2v6h6"/>
      <path d="M12 18v-5"/>
      <path d="M9 15h6"/>
    </svg>
  ),
  checkCircle: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block align-[-2px]">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <path d="m9 11 3 3L22 4"/>
    </svg>
  ),
  triangleAlert: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block align-[-2px]">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
};

const App: React.FC = () => {
  const [elementContext, setElementContext] = useState<EditRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EditOption[]>([]);
  const [instruction, setInstruction] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [progress, setProgress] = useState('');
  // P1-2: Track current mode (css-edit vs requirements-export)
  const [mode, setMode] = useState<ExtensionMode>('css-edit');
  // P1-5: Requirements export state
  const [generatedSpec, setGeneratedSpec] = useState<string>('');
  const [specEditable, setSpecEditable] = useState<string>('');
  const [architectureHints, setArchitectureHints] = useState<string[]>([]);
  const [testScenarios, setTestScenarios] = useState<string[]>([]);
  const [edgeCases, setEdgeCases] = useState<string[]>([]);
  // P1-6: AI-suggested title + priority, pre-filled in the popup and editable
  // before the spec is written via /api/files/append-ideas.
  const [exportTitle, setExportTitle] = useState('');
  const [exportPriority, setExportPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  // P8: live token buffer. As the middleware streams real NIM deltas, we
  // accumulate them here so the user sees the JSON building up rather than a
  // single staged status line. Reset whenever a non-token stage arrives.
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [error, setError] = useState('');
  // P7 / MVP-18: when sourcemap resolution fails the middleware asks us to let
  // the user pick a file manually. The picked path + content override the diff
  // base (highest precedence) — distinct from the auto-resolved source so a
  // manual pick survives a regenerate and the two paths don't conflate.
  const [needsFileSelection, setNeedsFileSelection] = useState(false);
  const [pickedFile, setPickedFile] = useState('');
  const [pickedFileContent, setPickedFileContent] = useState<string | null>(null);
  const [pickingFile, setPickingFile] = useState(false);
  // P3: source that the middleware resolved via sourcemap. Lower precedence
  // than a manual pick; cleared on every new generation so it can't leak into
  // the next element's apply.
  const [resolvedFilePath, setResolvedFilePath] = useState<string | undefined>(undefined);
  const [resolvedSourceCode, setResolvedSourceCode] = useState<string | undefined>(undefined);

  // Keep a stable listener reference so the cleanup actually removes it
  // (the old code passed `removeListener(() => {})` — a new arrow each time,
  //  which never removed the real listener).
  const messageListenerRef = useRef<((msg: any) => boolean | undefined) | null>(null);

  // Pending write waiting on a validation result before being committed.
  const pendingWriteRef = useRef<{ file: string; content: string; commitMessage: string } | null>(null);

  // A2: Modal state replacing window.confirm(). The modal is rendered as an inline
  // overlay at the bottom of the popup; showModal() stores the continuation action
  // so the confirm button picks it up (no ref stashing of payloads needed — the
  // payloads are already in the closures).
  const [modal, setModal] = useState<{
    visible: boolean;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);

  function showModal(message: string, confirmLabel: string, onConfirm: () => void) {
    setModal({ visible: true, message, confirmLabel, onConfirm });
  }

  function closeModal() {
    setModal(null);
  }

  // P1-0: Project Registry state. The active project's on-disk `path` becomes
  // `projectRoot` for every outbound request (replacing window.location.origin).
  // The background owns persistence; the popup just mirrors state via messages.
  const [registryState, setRegistryState] = useState<ProjectRegistryState | null>(null);
  const [newProjectPath, setNewProjectPath] = useState('');
  const [registryStatus, setRegistryStatus] = useState('');
  const [currentOrigin, setCurrentOrigin] = useState('');
  // P2-3: profile selection. `availableProfiles` is the union of built-in +
  // JSON-loaded profile names fetched from GET /api/profiles on popup open.
  // `selectedProfile` is the user's choice for this request (defaults to the
  // active project's profileName, then URL-detected, then 'generic'). Persisted
  // per origin (`lastProfileByOrigin`) in chrome.storage.local alongside the
  // P1-0 registry.
  const [availableProfiles, setAvailableProfiles] = useState<string[]>(['generic', 'example']);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  // Track whether we've loaded the persisted profile choice for this origin.
  const [profileLoaded, setProfileLoaded] = useState(false);
  // P2-3: guard so the profilePrefs restore runs exactly once per popup open,
  // when currentOrigin first resolves to a non-empty value. Without this,
  // the original mount-time read raced against the async get-current-element
  // response and would miss the persisted profile because currentOrigin was ''.
  const profilePrefsLoadedRef = useRef(false);
  // The active project for the current tab's origin (global override wins).
  // Recomputed whenever registryState or currentOrigin changes (see useMemo below).

  useEffect(() => {
    const listener = (message: any) => {
      switch (message.type) {
        case 'show-popup':
          setElementContext(message.data);
          setMode(message.mode || 'css-edit'); // P1-2: Set mode from message
          updateContextHint(message.data);
          break;
        case 'server-response': {
          const data = message.data || {};
          // Validate-before-write gate: if this response is a validation result
          // and we have a pending apply, write only if valid; else surface errors.
          if (typeof data.valid === 'boolean' && pendingWriteRef.current) {
            const pending = pendingWriteRef.current;
            if (data.valid) {
              doWrite(pending.file, pending.content, pending.commitMessage);
              setError('');
            } else {
              const msgs = (data.errors || [])
                .map((e: any) => `${e.file}:${e.line}:${e.column} ${e.message}`)
                .join('\n');
              setError(`Validation failed — not written:\n${msgs}`);
            }
            break;
          }
          // P1-5: Check if this is a requirements export response
          if (data.spec !== undefined) {
            // Requirements export response
            setGeneratedSpec(data.spec || '');
            setSpecEditable(data.spec || '');
            setArchitectureHints(data.architectureHints || []);
            setTestScenarios(data.testScenarios || []);
            setEdgeCases(data.edgeCases || []);
            // P1-6: pre-fill AI-suggested title + priority; user can edit both.
            setExportTitle(data.title || '');
            setExportPriority(
              data.priority === 'High' || data.priority === 'Low' ? data.priority : 'Medium'
            );
            setLoading(false);
            setProgress('');
            setTokenBuffer('');
            break;
          }
          // P1-6: Check for append-ideas export success response.
          if (typeof data.success === 'boolean') {
            // Could be either a validation result (already handled above with
            // pendingWriteRef) or an append-ideas result. Append-ideas has `id`
            // and `specPath`; validation has `valid` and `errors`.
            if (typeof data.id === 'string') {
              // append-ideas success (201) or idempotency conflict (409).
              if (data.success) {
                setError(`Exported as ${data.id} → ${data.specPath || data.id}`);
              } else {
                setError(`Export conflict: ${data.error || data.id}`);
              }
            }
            setLoading(false);
            setProgress('');
            break;
          }
          // Otherwise it's an AI edit-options response.
          setOptions(data.options || []);
          setNeedsFileSelection(!!data.needsFileSelection);
          // P3: keep the resolved source separate from the manual pick so the
          // two never conflate — a manual pick (above) must survive a regenerate.
          setResolvedFilePath(data.resolvedFilePath);
          setResolvedSourceCode(data.resolvedSourceCode);
          setLoading(false);
          setProgress('');
          setTokenBuffer('');
          break;
        }
        case 'server-error':
          setError(message.error || 'Unknown error');
          setLoading(false);
          setProgress('');
          setTokenBuffer('');
          break;
        case 'stream-progress': {
          const ev = message.data || {};
          // P8: real streaming. 'token' stages carry the raw NIM delta in
          // ev.message and the accumulated string in ev.data.sofar; append so
          // the user sees the JSON stream in. Any other stage is a status
          // transition — show it and clear the token buffer.
          if (ev.stage === 'token') {
            setProgress('Streaming AI response…');
            // Prefer the server-side accumulated `sofar` when present (robust
            // to coalesced/dropped events), else append the delta locally.
            if (typeof ev.data?.sofar === 'string') {
              setTokenBuffer(ev.data.sofar);
            } else {
              setTokenBuffer((prev) => prev + (ev.message || ''));
            }
          } else {
            setProgress(ev.message || '');
            setTokenBuffer('');
          }
          break;
        }
        case 'registry-state':
          // P1-0: background replies with the full registry state after any
          // registry mutation (add/list/select/clear). Mirror it locally so
          // the project dropdown + active labels render from a single source.
          setRegistryState(message.data?.state ?? null);
          setRegistryStatus('');
          break;
        case 'registry-error':
          setRegistryStatus(message.error || 'Registry error');
          break;
      }
      return true;
    };
    messageListenerRef.current = listener;
    chrome.runtime.onMessage.addListener(listener);

    // Request current element context on popup open
    chrome.runtime.sendMessage({ type: 'get-current-element' }, (response) => {
      if (response?.data) {
        setElementContext(response.data);
        updateContextHint(response.data);
        // P1-0: capture the page origin from the captured context so we can
        // resolve the active registered project for THIS tab.
        const url = response.data?.context?.url;
        if (url) {
          try {
            setCurrentOrigin(new URL(url).origin);
          } catch {
            // ignore malformed URLs
          }
        }
      }
    });

    // P1-0: ask the background for the current registry state on popup open so
    // the project dropdown renders immediately (not only after a user mutation).
    chrome.runtime.sendMessage({ type: 'registry-list' });

    // P2-3: fetch available profile names from the middleware on popup open so
    // the profile dropdown is populated (built-in + JSON-loaded profiles).
    // Falls back to ['generic', 'example'] silently when the middleware is down.
    fetch(`${MIDDLEWARE_HTTP_URL}/api/files/profiles`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { profiles?: string[] } | null) => {
        if (data?.profiles && data.profiles.length > 0) {
          setAvailableProfiles(data.profiles);
        }
      })
      .catch(() => {}); // middleware may not be running yet — fine

    return () => {
      if (messageListenerRef.current) {
        chrome.runtime.onMessage.removeListener(messageListenerRef.current);
        messageListenerRef.current = null;
      }
    };
  }, []);

  function updateContextHint(data: EditRequest) {
    const { element, context } = data;
    const selector = element.id ? `#${element.id}` : `.${element.classNames.join('.')}`;
    const hint = `Editing: ${selector} (${context.framework})`;
    setContextHint(hint);
  }

  // P2-3: restore persisted profile choice once currentOrigin resolves.
  // Runs as a separate effect keyed on currentOrigin so it fires AFTER the
  // async get-current-element callback sets the real origin — no more race
  // between mount-time storage read and the origin arriving later.
  // The profilePrefsLoadedRef ensures it runs only once per popup open.
  useEffect(() => {
    if (!currentOrigin || profilePrefsLoadedRef.current) return;
    chrome.storage.local.get('profilePrefs').then((r) => {
      const prefs = (r.profilePrefs as Record<string, string>) ?? {};
      const persisted = prefs[currentOrigin];
      if (persisted) {
        setSelectedProfile(persisted);
      }
      setProfileLoaded(true);
      profilePrefsLoadedRef.current = true;
    });
  }, [currentOrigin]);

  // P1-0: active project for the current origin (global override wins).
  // Computed as a regular function call so it re-runs on every render with the
  // freshest registryState/origin — cheap enough, and avoids stale-closure
  // bugs around the override toggle.
  function activeProject(): RegisteredProject | undefined {
    if (!registryState) return undefined;
    if (registryState.globalActiveId) {
      const g = registryState.projects.find((p) => p.id === registryState.globalActiveId);
      if (g) return g;
    }
    if (!currentOrigin) return undefined;
    const idForOrigin = registryState.activeByOrigin[currentOrigin];
    if (!idForOrigin) return undefined;
    return registryState.projects.find((p) => p.id === idForOrigin);
  }

  // P1-0: the projectRoot to send with every request. Prefer the active
  // registered project's on-disk path; otherwise fall back to whatever the
  // captured context carries (the page origin). Always returns a string so
  // the request shape stays stable.
  function effectiveProjectRoot(): string {
    const active = activeProject();
    if (active?.path) return active.path;
    return elementContext?.context.projectRoot || '';
  }

  // P2-3: the profile name to send with every request. Precedence:
  // user selection > persisted per-origin > active project's profileName >
  // generic. When profileLoaded is false (still restoring from storage), we
  // don't want to accidentally overwrite with 'generic', so use the active
  // project's profileName as a fallback until the persisted value arrives.
  function resolvedProfile(): string {
    if (selectedProfile) return selectedProfile;
    if (!profileLoaded) {
      // Still loading — use the active project's hint, or empty so the
      // middleware falls back to URL detection.
      return activeProject()?.profileName ?? '';
    }
    return 'generic';
  }

  // P1-0: handlers for the project registry UI (Add project / select active
  // per-origin / set global override / clear override). All mutations go through
  // the background so chrome.storage stays the single source of truth.
  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    const path = newProjectPath.trim();
    if (!path) return;
    setRegistryStatus('Validating project root…');
    chrome.runtime.sendMessage(
      {
        type: 'registry-add',
        path,
      },
      (resp) => {
        if (resp?.type === 'registry-error') {
          setRegistryStatus(resp.error || 'Could not register project');
        } else if (resp?.type === 'registry-state') {
          setRegistryStatus('Project registered');
          setNewProjectPath('');
          // Auto-select the just-added project for this origin so the user
          // doesn't have to do a second click to start using it.
          const added = resp.data?.added as RegisteredProject | undefined;
          if (added && currentOrigin) {
            chrome.runtime.sendMessage({
              type: 'registry-select-active',
              data: { projectId: added.id },
              origin: currentOrigin,
            });
          }
        }
      }
    );
  }

  function handleSelectProject(projectId: string) {
    if (!currentOrigin) return;
    chrome.runtime.sendMessage({
      type: 'registry-select-active',
      data: { projectId },
      origin: currentOrigin,
    });
  }

  function handleSetOverride(projectId: string | '') {
    // Empty string = clear the global override so per-origin selection resumes.
    // Non-empty = set this project as the global active across all origins.
    if (!projectId) {
      chrome.runtime.sendMessage({ type: 'registry-clear-override' });
      return;
    }
    chrome.runtime.sendMessage({
      type: 'registry-select-active',
      data: { projectId },
      // origin omitted → the background sets the global override (not per-origin).
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!elementContext || !instruction.trim()) return;

    setLoading(true);
    setError('');
    setOptions([]);
    setNeedsFileSelection(false);
    // A manual pick belongs to the previous element/instruction; clear it so a
    // fresh generation can't silently reuse an outdated file as the apply base.
    setPickedFile('');
    setPickedFileContent(null);
    setResolvedFilePath(undefined);
    setResolvedSourceCode(undefined);
    setTokenBuffer('');

    // P1-5: Different endpoints for different modes
    const isExportMode = mode === 'requirements-export';
    setProgress(isExportMode ? 'Generating specification...' : 'Sending request to AI...');

    const request: EditRequest = {
      element: elementContext.element,
      instruction,
      // P1-0: override the captured context's projectRoot with the active
      // registered project's on-disk path so the middleware writes to the
      // right repo (falls back to the origin when nothing's registered).
      context: { ...elementContext.context, projectRoot: effectiveProjectRoot() || elementContext.context.projectRoot },
    };

    if (isExportMode) {
      // P1-5/P2-3: Use requirements export endpoint with registry-aware profile
      // resolution. Send the active registered project + the user's selected
      // profile name so the middleware's ProfileManager can layer rootPath and
      // pick the right template (including JSON-loaded profiles).
      const activeProj = activeProject();
      chrome.runtime.sendMessage({
        type: 'send-to-server',
        data: {
          endpoint: '/api/ai/export-requirements',
          body: {
            ...request,
            projectProfile: resolvedProfile(),
            registeredProject: activeProj
              ? { path: activeProj.path, profileName: activeProj.profileName }
              : undefined,
          },
        },
      });
    } else {
      // Use the streaming SSE endpoint so the popup can show progress (and, once
      // the middleware streams real tokens, the first option renders faster).
      chrome.runtime.sendMessage({
        type: 'send-streaming-to-server',
        data: {
          endpoint: '/api/ai/edit/stream',
          body: request,
        },
      });
    }
  }

  async function handleApply(option: EditOption) {
    // A2: Show confirmation modal instead of window.confirm(). The continuation
    // (resolve base → apply diff → validate → set pending write) is captured in
    // the onConfirm closure.
    showModal(
      `Apply this change: ${option.description}?`,
      'Apply',
      () => {
        closeModal();
        // P7 / P3: resolve the diff base once, in one place, via the shared helper
        // (mirrors the applyDiff extraction — keep apply-flow policy testable).
        // Precedence: manual pick > resolved source > context.sourceCode. If none
        // yields a non-empty base, refuse to write a half-applied diff.
        const { file, baseSource, needsManualPick } = resolveApplyBase({
          pickedFile,
          pickedFileContent,
          resolvedFilePath: resolvedFilePath ?? undefined,
          resolvedSourceCode: resolvedSourceCode ?? undefined,
          contextSourceCode: elementContext?.context.sourceCode,
          optionFile: option.file,
        });
        const content = applyDiff(baseSource, option.diff);

        if (needsManualPick) {
          setError('No source content to apply the diff against. Pick a file manually below.');
          return;
        }

        // Validate before write (MVP-13/17). If validation fails, surface errors
        // and refuse to write. The popup *also* receives server-error via the
        // background relay; this is a synchronous gate before we even send /write.
        chrome.runtime.sendMessage(
          {
            type: 'send-to-server',
            data: { endpoint: '/api/files/validate', body: { file, content, projectRoot: effectiveProjectRoot() } },
          }
        );

        pendingWriteRef.current = { file, content, commitMessage: `AI: ${instruction}` };
      }
    );
  }

  // P1-5/P1-6: Export the edited spec to the active project's backlog via
  // POST /api/files/append-ideas. The registered projectRoot must be set (P1-0).
  // On success the endpoint returns the generated ID + specPath for confirmation.
  async function handleExport() {
    const projectName = activeProject()?.displayName || 'this project';
    const exportIntakeLabel = activeProject()?.profileName === 'example'
      ? '.wysiwyg/ideas.md'
      : 'ideas.md';

    // A2: Show confirmation modal instead of window.confirm(). The continuation
    // (validate root → set loading → send) is captured in the onConfirm closure.
    showModal(
      `Export this specification (${exportPriority} priority) to ${projectName}'s ${exportIntakeLabel}?`,
      'Export',
      () => {
        closeModal();

        const root = effectiveProjectRoot();
        if (!root || root.startsWith('http')) {
          setError('No registered project path — register a project first (Project dropdown above).');
          return;
        }

        setLoading(true);
        setError('');

        chrome.runtime.sendMessage({
          type: 'send-to-server',
          data: {
            endpoint: '/api/files/append-ideas',
            body: {
              spec: specEditable,
              title: exportTitle.trim() || undefined,
              priority: exportPriority,
              architectureHints,
              testScenarios,
              edgeCases,
              element: elementContext?.element,
              instruction,
              projectRoot: root,
              // P2-3: send the resolved profile name (from the dropdown) + the
              // active registered project so ProfileManager can layer rootPath and
              // pick the right template. The old 'antikythera' hardcoded cast is gone.
              projectProfile: resolvedProfile(),
              registeredProject: activeProject()
                ? { path: activeProject()!.path, profileName: activeProject()!.profileName }
                : undefined,
            },
          },
        });

        // P1-6: handle the server response (the background relay sends back
        // server-response or server-error). The loading spinner will show until the
        // response arrives; on success we'll show the generated ID.
        // We don't immediately clear loading here — the response handler will.
      }
    );
  }

  // P7 / MVP-18: user manually picks a source file when sourcemap resolution
  // failed. We fetch its content via GET /api/files/read so handleApply can
  // use it as the diff base.
  async function handlePickFile(e: React.FormEvent) {
    e.preventDefault();
    if (!pickedFile.trim()) return;
    setPickingFile(true);
    setError('');
    // The background 'send-to-server' relay only POSTs JSON bodies; /read is a
    // GET, so we fetch directly from the popup (CORS allows chrome-extension
    // origin; the sample project root comes from the captured element context).
    try {
      const res = await fetch(
        `${MIDDLEWARE_HTTP_URL}/api/files/read?file=${encodeURIComponent(pickedFile)}&projectRoot=${encodeURIComponent(effectiveProjectRoot())}`
      );
      if (!res.ok) {
        const txt = await res.text();
        setError(`Could not read "${pickedFile}": ${txt}`);
        setPickingFile(false);
        return;
      }
      const data = await res.json();
      setPickedFileContent(data.content || '');
      setNeedsFileSelection(false);
      setError('');
    } catch (err: any) {
      setError(`Failed to read file: ${err.message}`);
    }
    setPickingFile(false);
  }

  async function doWrite(file: string, content: string, commitMessage: string) {
    chrome.runtime.sendMessage({
      type: 'send-to-server',
      data: {
        endpoint: '/api/files/write',
        body: { file, content, commitMessage, projectRoot: effectiveProjectRoot() },
      },
    });
    pendingWriteRef.current = null;
  }

  function handleUndo() {
    chrome.runtime.sendMessage({
      type: 'send-to-server',
      data: {
        endpoint: '/api/git/undo',
        body: { projectRoot: effectiveProjectRoot() },
      },
    });
  }

  if (!elementContext) {
    return (
      <div className="p-6 w-80">
        <h1 className="text-lg font-bold mb-4">AI UI Editor</h1>
        <p className="text-gray-600">Right-click any element to edit it with AI.</p>
      </div>
    );
  }

  // P1-2: Mode-specific title and description
  const isExportMode = mode === 'requirements-export';
  // P1-0: dynamic labels driven by the active registered project (defaults to
  // a generic name when nothing is registered).
  const activeProj = activeProject();
  const projectLabel = activeProj?.displayName || 'project';
  // P2-3: intake label from the user's selected profile. When the active
  // project has a profileName that matches 'example', use the known intake
  // path; otherwise use a generic label.
  const resolvedProfileName = resolvedProfile();
  const intakeLabel = resolvedProfileName === 'example'
    ? '.wysiwyg/ideas.md'
    : resolvedProfileName
      ? `${resolvedProfileName} backlog`
      : 'ideas.md';

  return (
    <div className="p-6 w-96">
      <h1 className="text-lg font-bold mb-4">
        {isExportMode
          ? `Export to ${projectLabel} (${resolvedProfileName})`
          : 'AI UI Editor'}
      </h1>
      {/* P1-2: Mode indicator + P2-3: profile selector */}
      <div className="mb-3 flex items-center gap-2">
        <span className={`text-xs px-2 py-1 rounded ${
          isExportMode
            ? 'bg-purple-100 text-purple-700'
            : 'bg-indigo-100 text-indigo-700'
        }`}>
          {isExportMode ? 'Requirements Export' : 'CSS Edit'}
        </span>
        {/* P2-3: Profile dropdown — first-class UI, not buried in <details>.
            Shows available built-in + JSON-loaded profile names fetched from
            GET /api/files/profiles; the user's choice is sent as `projectProfile`
            and persisted per origin in chrome.storage under `profilePrefs`. */}
        <label className="text-xs text-gray-600 ml-auto flex items-center gap-1">
          Profile
          <select
            className="border rounded px-1 py-0.5 text-xs focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            value={resolvedProfile()}
            onChange={(e) => {
              const v = e.target.value;
              setSelectedProfile(v);
              if (currentOrigin) {
                chrome.storage.local.get('profilePrefs').then((r) => {
                  const prefs = (r.profilePrefs as Record<string, string>) ?? {};
                  prefs[currentOrigin] = v;
                  chrome.storage.local.set({ profilePrefs: prefs });
                });
              }
            }}
          >
            {availableProfiles.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
      </div>

      {/* P1-0: Project Registry. Lets the user register on-disk project paths and
          pick the active one for this tab's origin (or set a global override). */}
      <details className="mb-3 border rounded text-xs">
        <summary className="cursor-pointer px-2 py-1 font-medium text-gray-700">
          Project{activeProj ? `: ${activeProj.displayName}` : ' (none)'}
        </summary>
        <div className="p-2 space-y-2">

                    {registryState && registryState.projects.length > 0 ? (
            <>
              <label className="block text-gray-600">
                Active project for this tab
                <select
                  className="ml-2 border rounded px-1 py-0.5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                  value={activeProj?.id ?? ''}
                  onChange={(e) => handleSelectProject(e.target.value)}
                >
                  <option value="">(none — use page origin)</option>
                  {registryState.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName} ({p.profileName})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-gray-600">
                Global override
                <select
                  className="ml-2 border rounded px-1 py-0.5 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                  value={registryState.globalActiveId ?? ''}
                  onChange={(e) => handleSetOverride(e.target.value)}
                >
                  <option value="">(none — per-origin)</option>
                  {registryState.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <p className="text-gray-500">
              No projects registered. Add one below (its path becomes the
              projectRoot wysiwyg writes to).
            </p>
          )}

          <form onSubmit={handleAddProject} className="flex gap-1">
            <input
              value={newProjectPath}
              onChange={(e) => setNewProjectPath(e.target.value)}
              placeholder="/absolute/path/to/project"
              className="flex-1 p-1 border rounded text-xs"
              title="Absolute on-disk path to the project root"
            />
            <button
              type="submit"
              className="bg-gray-700 text-white px-2 py-1 rounded text-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              Add
            </button>
          </form>
          {registryStatus && (
            <p className="text-[10px] text-gray-600">{registryStatus}</p>
          )}
        </div>
      </details>

      <p className="text-sm text-gray-500 mb-4">{contextHint}</p>

      <form onSubmit={handleSubmit} className="mb-4">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={isExportMode
            ? "What should this do? Describe the functionality..."
            : "Describe the visual change you want..."
          }
          className="w-full p-2 border rounded mb-2 text-sm"
          rows={3}
        />
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 rounded font-medium cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-400 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none ${
            isExportMode
              ? 'bg-purple-600 text-white hover:bg-purple-700'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {loading ? 'Generating...' : (isExportMode ? 'Generate Spec' : 'Generate Options')}
        </button>
      </form>

      {error && (
        <div role="alert" className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      {loading && (
        <div className="p-4">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
            <span className="ml-2 text-sm">{progress || 'Generating...'}</span>
          </div>
          {tokenBuffer && (
            <pre className="mt-2 max-h-40 overflow-auto text-[10px] leading-tight text-gray-500 bg-gray-50 rounded p-2 whitespace-pre-wrap break-all">
              {tokenBuffer}
            </pre>
          )}
        </div>
      )}

      {needsFileSelection && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
          Couldn't locate the source via sourcemap. Pick the file manually:
          <form onSubmit={handlePickFile} className="mt-2 flex gap-2">
            <input
              value={pickedFile}
              onChange={(e) => setPickedFile(e.target.value)}
              placeholder="src/components/Card.tsx"
              className="flex-1 p-1 border rounded text-xs"
            />
            <button
              type="submit"
              disabled={pickingFile}
              className="bg-amber-600 text-white px-2 py-1 rounded text-xs cursor-pointer disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
            >
              {pickingFile ? 'Reading...' : 'Use'}
            </button>
          </form>
        </div>
      )}

      {pickedFileContent !== null && (
        <div className="mb-3 text-xs text-green-700">
          Using picked file: <code>{pickedFile}</code>
        </div>
      )}

      {options.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Options</h2>
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => (
              <div key={option.id} className="border rounded p-3">
                <p className="text-sm font-medium mb-2">{option.description}</p>
                <div className="bg-gray-50 rounded p-2 text-xs overflow-x-auto">
                  <pre>{option.diff}</pre>
                </div>
                {option.previewHtml && (
                  <iframe
                    title={`preview-${option.id}`}
                    sandbox={getPreviewSandbox()}
                    srcDoc={sanitizeHtml(option.previewHtml)}
                    className="mt-2 w-full h-24 border rounded bg-white"
                  />
                )}
                <button
                  onClick={() => handleApply(option)}
                  className="mt-2 bg-green-600 text-white px-4 py-1 rounded text-sm cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* P1-5: Requirements Export UI */}
      {isExportMode && generatedSpec && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Generated Specification</h2>

          {/* P1-6: Title + Priority — AI-suggested, user-editable before export. */}
          <div className="space-y-2 border rounded p-3 bg-gray-50">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Title</span>
              <input
                value={exportTitle}
                onChange={(e) => setExportTitle(e.target.value)}
                placeholder="Short, imperative title for the backlog"
                className="w-full p-1.5 border rounded text-xs mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Priority</span>
              <select
                value={exportPriority}
                onChange={(e) => setExportPriority(e.target.value as 'High' | 'Medium' | 'Low')}
                className="ml-2 p-1 border rounded text-xs mt-1 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
              >
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </label>
          </div>

          {/* Editable spec textarea */}
          <div className="border rounded p-3">
            <label className="text-xs font-medium text-gray-600 mb-1 block">
              Specification (editable)
            </label>
            <textarea
              value={specEditable}
              onChange={(e) => setSpecEditable(e.target.value)}
              className="w-full p-2 border rounded text-xs font-mono bg-gray-50"
              rows={12}
            />
          </div>

          {/* Architecture hints */}
          {architectureHints.length > 0 && (
            <div className="border rounded p-3 bg-blue-50">
              <h3 className="text-xs font-semibold text-blue-800 mb-2">
                {Icons.filePen} Files to Modify
              </h3>
              <ul className="text-xs text-blue-700 space-y-1">
                {architectureHints.map((hint) => (
                  <li key={hint} className="font-mono">{hint}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Test scenarios */}
          {testScenarios.length > 0 && (
            <div className="border rounded p-3 bg-green-50">
              <h3 className="text-xs font-semibold text-green-800 mb-2">
                {Icons.checkCircle} Test Scenarios
              </h3>
              <ul className="text-xs text-green-700 space-y-1">
                {testScenarios.map((scenario) => (
                  <li key={scenario}>• {scenario}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Edge cases */}
          {edgeCases.length > 0 && (
            <div className="border rounded p-3 bg-amber-50">
              <h3 className="text-xs font-semibold text-amber-800 mb-2">
                {Icons.triangleAlert} Edge Cases
              </h3>
              <ul className="text-xs text-amber-700 space-y-1">
                {edgeCases.map((edgeCase) => (
                  <li key={edgeCase}>• {edgeCase}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={loading}
            className="w-full bg-purple-600 text-white py-2 rounded font-medium cursor-pointer disabled:cursor-not-allowed hover:bg-purple-700 disabled:bg-gray-400 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            {loading ? 'Exporting...' : `Export to ${intakeLabel}`}
          </button>
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <button
          onClick={handleUndo}
          className="text-sm text-red-600 hover:text-red-800 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
        >
          Undo Last Change
        </button>
      </div>

      {/* A2: Confirmation modal overlay. Replaces window.confirm() with a styled,
          focus-trapped, Esc-cancellable inline dialog. Rendered at top level so
          it overlays the entire popup viewport. */}
      {modal && (
        <Modal
          message={modal.message}
          confirmLabel={modal.confirmLabel}
          onConfirm={modal.onConfirm}
          onCancel={closeModal}
        />
      )}
    </div>
  );
};

export default App;
