import React, { useState, useEffect, useCallback } from 'react';

// Edit history entry stored in localStorage
export interface HistoryEntry {
  id: string;
  timestamp: number;
  element: {
    html: string;
    classNames: string[];
    id?: string;
  };
  instruction: string;
  file: string;
  diff: string;
  applied: boolean;
  undone: boolean;
}

// Storage key for localStorage
const STORAGE_KEY = 'ai-ui-editor-history';

// Load history from localStorage
function loadHistory(): HistoryEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

// Save history to localStorage
function saveHistory(entries: HistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Export history as JSON file
function exportHistory(entries: HistoryEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-ui-editor-history-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import history from JSON file
function importHistory(file: File): Promise<HistoryEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          saveHistory(data);
          resolve(data);
        } else {
          reject(new Error('Invalid history format'));
        }
      } catch {
        reject(new Error('Failed to parse history file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

const DevToolsPanel: React.FC = () => {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<HistoryEntry | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Listen for edit events from popup/background
  useEffect(() => {
    const listener = (message: any) => {
      if (message.type === 'edit-applied') {
        const newEntry: HistoryEntry = {
          id: message.data.id || `edit-${Date.now()}`,
          timestamp: Date.now(),
          element: message.data.element,
          instruction: message.data.instruction,
          file: message.data.file,
          diff: message.data.diff,
          applied: true,
          undone: false,
        };
        setHistory((prev) => {
          const updated = [newEntry, ...prev];
          saveHistory(updated);
          return updated;
        });
      } else if (message.type === 'edit-undone') {
        setHistory((prev) => {
          const updated = prev.map((entry) =>
            entry.id === message.data.id ? { ...entry, undone: true } : entry
          );
          saveHistory(updated);
          return updated;
        });
      }
      return true;
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // Filter history by search term
  const filteredHistory = history.filter((entry) => {
    const search = filter.toLowerCase();
    return (
      entry.instruction.toLowerCase().includes(search) ||
      entry.file.toLowerCase().includes(search) ||
      entry.element.classNames.some((c) => c.toLowerCase().includes(search))
    );
  });

  // Handle undo
  const handleUndo = useCallback((entry: HistoryEntry) => {
    chrome.runtime.sendMessage({
      type: 'undo-specific',
      data: { entryId: entry.id },
    });
  }, []);

  // Handle export
  const handleExport = useCallback(() => {
    exportHistory(history);
  }, [history]);

  // Handle import
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importHistory(file)
      .then((data) => {
        setHistory(data);
        setShowImport(false);
      })
      .catch((err) => alert(`Import failed: ${err.message}`));
  }, []);

  // Clear all history
  const handleClearHistory = useCallback(() => {
    if (confirm('Clear all edit history? This cannot be undone.')) {
      setHistory([]);
      saveHistory([]);
      setSelectedEntry(null);
    }
  }, []);

  // Format timestamp
  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString();
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <h1 className="text-lg font-semibold text-gray-800">AI UI Editor History</h1>
        <div className="flex gap-2">
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Export
          </button>
          <label className="px-3 py-1.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300 cursor-pointer">
            Import
            <input
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </label>
          <button
            onClick={handleClearHistory}
            className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
          >
            Clear
          </button>
        </div>
      </header>

      {/* Search/Filter */}
      <div className="px-4 py-2 border-b">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by instruction, file, or class..."
          className="w-full px-3 py-1.5 text-sm border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* History list */}
        <div className="w-80 border-r overflow-y-auto">
          {filteredHistory.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">
              {history.length === 0
                ? 'No edits yet. Start editing to see history here.'
                : 'No matches for your filter.'}
            </div>
          ) : (
            <ul className="divide-y">
              {filteredHistory.map((entry) => (
                <li
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`p-3 cursor-pointer hover:bg-gray-50 ${
                    selectedEntry?.id === entry.id ? 'bg-indigo-50' : ''
                  } ${entry.undone ? 'opacity-50' : ''}`}
                >
                  <div className="text-xs text-gray-500 mb-1">
                    {formatTime(entry.timestamp)}
                  </div>
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {entry.instruction}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {entry.file}
                  </div>
                  {entry.undone && (
                    <span className="text-xs text-red-600 mt-1 block">Undone</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Detail view */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedEntry ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Instruction</h2>
                <p className="text-sm text-gray-900">{selectedEntry.instruction}</p>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">File</h2>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                  {selectedEntry.file}
                </code>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Timestamp</h2>
                <p className="text-sm text-gray-900">{formatTime(selectedEntry.timestamp)}</p>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Element</h2>
                <code className="text-xs bg-gray-100 px-2 py-1 rounded block max-h-20 overflow-auto">
                  {selectedEntry.element.html.substring(0, 200)}
                  {selectedEntry.element.html.length > 200 ? '...' : ''}
                </code>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Diff</h2>
                <pre className="text-xs bg-gray-900 text-green-400 p-3 rounded overflow-x-auto max-h-60">
                  {selectedEntry.diff}
                </pre>
              </div>

              {!selectedEntry.undone && (
                <button
                  onClick={() => handleUndo(selectedEntry)}
                  className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Undo This Change
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              Select an edit from the list to view details
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <footer className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
        {history.length} edit{history.length !== 1 ? 's' : ''} •{' '}
        {history.filter((e) => !e.undone).length} active
      </footer>
    </div>
  );
};

export default DevToolsPanel;