import type { ExtensionMessage } from '../shared/types';

// Map to store tab-specific state
const tabState = new Map<number, any>();

// WebSocket connection to middleware server
let ws: WebSocket | null = null;
const MIDDLEWARE_URL = 'ws://localhost:3000/ws';

// Connect to middleware WebSocket
function connectWebSocket() {
  try {
    ws = new WebSocket(MIDDLEWARE_URL);

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

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  switch (message.type) {
    case 'element-selected':
      // Store element context for this tab
      tabState.set(sender.tab?.id || 0, message.data);
      // Notify popup to show
      chrome.runtime.sendMessage({
        type: 'show-popup',
        data: message.data,
      });
      break;

    case 'get-current-element':
      // Return current element context for the sender's tab
      const tabId = sender.tab?.id || 0;
      const data = tabState.get(tabId);
      sendResponse({ data });
      break;

    case 'send-to-server':
      // Forward request to middleware server via HTTP
      const { endpoint, body } = message.data;
      fetch(`http://localhost:3000${endpoint}`, {
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

// Handle popup opening via toolbar icon
chrome.action.onClicked.addListener((tab) => {
  const data = tabState.get(tab.id || 0);
  if (data) {
    chrome.runtime.sendMessage({
      type: 'show-popup',
      data,
    });
  }
});

// Clean up on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  tabState.delete(tabId);
});
