import React, { useState, useEffect, useRef } from 'react';
import { EditRequest, EditOption } from '../shared/types';
import { applyDiff } from '../shared/diff';
import { resolveApplyBase } from '../shared/apply';
import { sanitizeHtml, getPreviewSandbox } from '../shared/sanitize';

const App: React.FC = () => {
  const [elementContext, setElementContext] = useState<EditRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EditOption[]>([]);
  const [instruction, setInstruction] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [progress, setProgress] = useState('');
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

  useEffect(() => {
    const listener = (message: any) => {
      switch (message.type) {
        case 'show-popup':
          setElementContext(message.data);
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
      }
    });

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
    setProgress('Sending request to AI...');

    const request: EditRequest = {
      element: elementContext.element,
      instruction,
      context: elementContext.context,
    };

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

  async function handleApply(option: EditOption) {
    if (!confirm(`Apply this change: ${option.description}?`)) return;

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
        data: { endpoint: '/api/files/validate', body: { file, content } },
      }
    );

    pendingWriteRef.current = { file, content, commitMessage: `AI: ${instruction}` };
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
        `http://localhost:3000/api/files/read?file=${encodeURIComponent(pickedFile)}&projectRoot=${encodeURIComponent(elementContext?.context.projectRoot || '')}`
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
        body: { file, content, commitMessage, projectRoot: elementContext?.context.projectRoot },
      },
    });
    pendingWriteRef.current = null;
  }

  function handleUndo() {
    chrome.runtime.sendMessage({
      type: 'send-to-server',
      data: {
        endpoint: '/api/git/undo',
        body: { projectRoot: elementContext?.context.projectRoot },
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

  return (
    <div className="p-6 w-96">
      <h1 className="text-lg font-bold mb-4">AI UI Editor</h1>
      <p className="text-sm text-gray-500 mb-4">{contextHint}</p>

      <form onSubmit={handleSubmit} className="mb-4">
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Describe the visual change you want..."
          className="w-full p-2 border rounded mb-2 text-sm"
          rows={3}
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-indigo-600 text-white py-2 rounded font-medium disabled:bg-gray-400"
        >
          {loading ? 'Generating options...' : 'Generate Options'}
        </button>
      </form>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-xs text-red-700 whitespace-pre-wrap">
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
              className="bg-amber-600 text-white px-2 py-1 rounded text-xs"
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
                  className="mt-2 bg-green-600 text-white px-4 py-1 rounded text-sm"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <button
          onClick={handleUndo}
          className="text-sm text-red-600 hover:text-red-800"
        >
          Undo Last Change
        </button>
      </div>
    </div>
  );
};

export default App;
