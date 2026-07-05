import type { ExtensionMessage } from './shared/types';

// Map to store tab-specific state
const tabState = new Map<number, any>();

// WebSocket connection to middleware server.
// The middleware mounts WS at /ws/connect (server.ts register wsRoutes under
// '/ws', ws.ts app.get('/connect')). Connecting to /ws alone 404s forever.
let ws: WebSocket | null = null;
const MIDDLEWARE_WS_URL = 'ws://localhost:3000/ws/connect';
const MIDDLEWARE_HTTP_URL = 'http://localhost:3000';

// Create the "Edit with AI" context menu on right-click.
// (contextMenus belongs to the service worker, NOT the content script —
//  see POSTMVP_TODO.md P2. Previously this lived in content-script.ts and failed.)
// P1-2: Added second menu item for "Export to Antikythera TODO" (requirements mode)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-ui-editor',
    title: 'Edit with AI',
    contexts: ['all'],
  });
  chrome.contextMenus.create({
    id: 'ai-ui-editor-export',
    title: 'Export to Antikythera TODO',
    contexts: ['all'],
  });
});

// On menu click, ask the content script (in the clicked tab) to capture the
// element at the click coordinates — then store + show the popup.
// P1-2: Distinguish mode based on which menu was clicked:
// - 'ai-ui-editor' → css-edit mode (existing behavior)
// - 'ai-ui-editor-export' → requirements-export mode (new)
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;

  const isExportMode = info.menuItemId === 'ai-ui-editor-export';
  const isCssEditMode = info.menuItemId === 'ai-ui-editor';
  if (!isExportMode && !isCssEditMode) return;

  try {
    // info.x/info.y are page coordinates of the click (present for non-link/
    // non-editable contexts); OnClickData types them optional, so cast.
    const { x, y } = info as chrome.contextMenus.OnClickData & { x?: number; y?: number };
    const results = await chrome.tabs.sendMessage(tab.id, {
      type: 'capture-element',
      data: { x, y },
    });
    if (results) {
      // Store mode in tab state for the popup to read
      tabState.set(tab.id, {
        ...results,
        mode: isExportMode ? 'requirements-export' : 'css-edit',
      });
      chrome.runtime.sendMessage({
        type: 'show-popup',
        data: results,
        mode: isExportMode ? 'requirements-export' : 'css-edit',
      });
    }
  } catch (error) {
    console.error('Capture failed (is the content script loaded on this tab?):', error);
    chrome.runtime.sendMessage({
      type: 'server-error',
      error: 'Could not capture element. Reload the page and try again.',
    });
  }
});

// Connect to middleware WebSocket
function connectWebSocket() {
  try {
    ws = new WebSocket(MIDDLEWARE_WS_URL);

    ws.onopen = () => {
      console.log('Connected to middleware WebSocket');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      // Forward messages to the popup
      chrome.runtime.sendMessage({
        type: 'ws-message',
        data: message,
      });
    };

    ws.onclose = () => {
      console.log('Disconnected from middleware WebSocket');
      setTimeout(connectWebSocket, 1000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
    setTimeout(connectWebSocket, 1000);
  }
}

// Connect on extension startup
connectWebSocket();

// Handle streaming SSE responses
async function sendStreamingRequest(endpoint: string, body: any, onProgress: (data: any) => void, onComplete: (data: any) => void, onError: (error: string) => void) {
  try {
    const response = await fetch(`${MIDDLEWARE_HTTP_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('ReadableStream not supported');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      // Process SSE messages (format: data: {...}\n\n)
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            continue;
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'result') {
              onComplete(data);
            } else if (data.type === 'error') {
              onError(data.error);
            } else {
              onProgress(data);
            }
          } catch (e) {
            // Ignore parse errors for non-JSON messages
          }
        }
      }
    }
  } catch (error: any) {
    console.error('Streaming request error:', error);
    onError(error.message);
  }
}

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'get-current-element':
      // Return current element context for the sender's tab
      const tabId = sender.tab?.id || 0;
      const data = tabState.get(tabId);
      sendResponse({ data });
      break;

    case 'send-to-server':
      // Forward request to middleware server via HTTP (non-streaming)
      const { endpoint, body } = message.data;
      fetch(`${MIDDLEWARE_HTTP_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          return response.json();
        })
        .then((data) => {
          chrome.runtime.sendMessage({
            type: 'server-response',
            data,
          });
        })
        .catch((error) => {
          chrome.runtime.sendMessage({
            type: 'server-error',
            error: error.message,
          });
        });
      break;

    case 'send-streaming-to-server':
      // Send streaming request with progress callbacks
      const { endpoint: streamEndpoint, body: streamBody } = message.data;
      sendStreamingRequest(
        streamEndpoint,
        streamBody,
        // onProgress
        (progressData) => {
          chrome.runtime.sendMessage({
            type: 'stream-progress',
            data: progressData,
          });
        },
        // onComplete
        (resultData) => {
          chrome.runtime.sendMessage({
            type: 'server-response',
            data: resultData,
          });
        },
        // onError
        (error) => {
          chrome.runtime.sendMessage({
            type: 'server-error',
            error,
          });
        }
      );
      break;

    case 'ws-send':
      // Send message via WebSocket
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message.data));
      }
      break;

    default:
      break;
  }
  return true; // Keep message port open for sendResponse
});

// Note: chrome.action.onClicked does NOT fire when a default_popup is set
// (manifest.json declares default_popup), so we don't register it.
// The popup reads current context via the 'get-current-element' case above.

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});