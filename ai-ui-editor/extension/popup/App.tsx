import React, { useState, useEffect } from 'react';
import { EditRequest, EditOption } from '../../shared/types';

const App: React.FC = () => {
  const [elementContext, setElementContext] = useState<EditRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<EditOption[]>([]);
  const [instruction, setInstruction] = useState('');
  const [contextHint, setContextHint] = useState('');

  // Listen for messages from background script
  useEffect(() => {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.type) {
        case 'show-popup':
          setElementContext(message.data);
          updateContextHint(message.data);
          break;
        case 'server-response':
          setOptions(message.data.options || []);
          setLoading(false);
          break;
        case 'server-error':
          alert(`Error: ${message.error}`);
          setLoading(false);
          break;
      }
      return true;
    });

    // Request current element context on popup open
    chrome.runtime.sendMessage({ type: 'get-current-element' }, (response) => {
      if (response?.data) {
        setElementContext(response.data);
        updateContextHint(response.data);
      }
    });

    return () => {
      chrome.runtime.onMessage.removeListener(() => {});
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

    const request: EditRequest = {
      element: elementContext.element,
      instruction,
      context: elementContext.context,
    };

    // Send to middleware server
    chrome.runtime.sendMessage({
      type: 'send-to-server',
      data: {
        endpoint: '/api/ai/edit',
        body: request,
      },
    });
  }

  async function handleApply(option: EditOption) {
    if (confirm(`Apply this change: ${option.description}?`)) {
      chrome.runtime.sendMessage({
        type: 'send-to-server',
        data: {
          endpoint: '/api/files/write',
          body: {
            file: option.file,
            content: applyDiff(elementContext?.context.sourceCode || '', option.diff),
            commitMessage: `AI: ${instruction}`,
          },
        },
      });
    }
  }

  function applyDiff(source: string, diff: string): string {
    // Simple diff parser (for MVP)
    const lines = source.split('\n');
    const diffLines = diff.split('\n');

    let result = [...lines];
    let lineIndex = 0;

    for (const diffLine of diffLines) {
      if (diffLine.startsWith('@@')) {
        // Parse range: @@ -start,count +newStart,newCount @@
        const match = diffLine.match(/@@\s+-(\d+),(\d+)\s+\+(\d+),(\d+)\s+@@/);
        if (match) {
          const [, start, count, newStart] = match.map(Number);
          lineIndex = start - 1;
        }
      } else if (diffLine.startsWith('-')) {
        const actualLine = diffLine.slice(1);
        const currentLine = result[lineIndex];
        if (currentLine === actualLine) {
          result.splice(lineIndex, 1);
        } else {
          lineIndex++;
        }
      } else if (diffLine.startsWith('+')) {
        const newLine = diffLine.slice(1);
        result.splice(lineIndex, 0, newLine);
        lineIndex++;
      } else if (diffLine.startsWith(' ')) {
        lineIndex++;
      }
    }

    return result.join('\n');
  }

  function handleUndo() {
    chrome.runtime.sendMessage({
      type: 'send-to-server',
      data: {
        endpoint: '/api/git/undo',
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

      {loading && (
        <div className="flex items-center justify-center p-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          <span className="ml-2 text-sm">Generating...</span>
        </div>
      )}

      {options.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Options</h2>
          <div className="max-h-60 overflow-y-auto">
            {options.map((option) => (
              <div key={option.id} className="border rounded p-3">
                <p className="text-sm font-medium mb-2">{option.description}</p>
                <div className="bg-gray-50 rounded p-2 text-xs monospace overflow-x-auto">
                  <pre>{option.diff}</pre>
                </div>
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
