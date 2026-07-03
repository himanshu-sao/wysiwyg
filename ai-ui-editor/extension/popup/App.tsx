import React, { useState, useEffect, useRef } from 'react';
import { EditRequest, EditOption } from '../shared/types';
import { applyDiff } from '../shared/diff';

const App: React.FC = () => {
  const [elementContext, setElementContext] = useState<EditRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EditOption[]>([]);
  const [instruction, setInstruction] = useState('');
  const [contextHint, setContextHint] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

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
          setLoading(false);
          setProgress('');
          break;
        }
        case 'server-error':
          setError(message.error || 'Unknown error');
          setLoading(false);
          setProgress('');
          break;
        case 'stream-progress':
          setProgress(message.data?.message || '');
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

    const file = option.file;
    const content = applyDiff(elementContext?.context.sourceCode || '', option.diff);

    // Validate before write (MVP-13/17). If validation fails, surface errors
    // and refuse to write. The popup *also* receives server-error via the
    // background relay; this is a synchronous gate before we even send /write.
    chrome.runtime.sendMessage(
      {
        type: 'send-to-server',
        data: { endpoint: '/api/files/validate', body: { file, content } },
      }
      // The validate result comes back asynchronously as server-response.
      // We write only after observing a `valid` result — handled below in
      // the validateResult effect. For the MVP we issue validate, then write.
    );

    // Stash pending write so a subsequent server-response (validate result)
    // can trigger the actual /write. This keeps the apply flow honest: the
    // file is never written unless validation reported valid (or validation
    // itself is unavailable — see note).
    pendingWriteRef.current = { file, content, commitMessage: `AI: ${instruction}` };
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
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          <span className="ml-2 text-sm">{progress || 'Generating...'}</span>
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
                    sandbox="allow-same-origin"
                    srcDoc={option.previewHtml}
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
