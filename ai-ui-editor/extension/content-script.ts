// Content script — injected by the manifest into page context on localhost/https.
// It owns DOM access AND can talk to chrome.runtime, so it's the right place to
// run element capture. The background service worker (background.ts) owns the
// context menu and asks THIS script to capture at the click coordinates.
//
// Why here and not in executeScript(): chrome.scripting.executeScript(func)
// serializes only the one function — any referenced helper (detectFramework)
// would be a ReferenceError in page context. By injecting capture as a stable
// content script, all helpers are in scope.

import type { ElementContext } from './shared/types';

// Coordinate capture — invoked by background via the 'capture-element' message.
// Returns the captured element context (or null) to the caller via sendResponse.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'capture-element') {
    const { x, y } = message.data ?? {};
    const captured = captureElementContext(x, y);
    sendResponse(captured);
    return true; // keep the sendResponse contract alive
  }
  return false;
});

// Capture an element's context at the given viewport coordinates.
function captureElementContext(
  x?: number,
  y?: number
): { element: ElementContext; context: { url: string; framework: string; projectRoot: string } } | null {
  const target =
    (typeof x === 'number' && typeof y === 'number'
      ? (document.elementFromPoint(x, y) as HTMLElement | null)
      : null) ||
    (document.activeElement as HTMLElement | null) ||
    null;
  if (!target) return null;

  // Capture outerHTML (truncated to keep payloads reasonable for the AI prompt)
  const html = target.outerHTML.slice(0, 2000);

  // Capture computed styles
  const computedStyles: Record<string, string> = {};
  const styles = window.getComputedStyle(target);
  for (let i = 0; i < styles.length; i++) {
    const prop = styles[i];
    computedStyles[prop] = styles.getPropertyValue(prop);
  }

  // Capture class names + id
  const classNames = Array.from(target.classList);
  const id = target.id;

  // Capture hierarchy (CSS selectors up to body)
  const hierarchy: string[] = [];
  let current: HTMLElement | null = target;
  while (current && current !== document.body) {
    const tagName = current.tagName.toLowerCase();
    let selector = tagName;
    if (current.id) {
      selector += `#${current.id}`;
    } else if (current.className) {
      const classes = Array.from(current.classList);
      if (classes.length > 0) {
        selector += `.${classes.join('.')}`;
      }
    }
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (child) => (child as HTMLElement).tagName.toLowerCase() === tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-child(${index})`;
      }
    }
    hierarchy.push(selector);
    current = current.parentElement;
  }
  hierarchy.push('body');
  hierarchy.reverse();

  // Capture event listeners (approximate — on<event> props)
  const eventListeners: string[] = [];
  const events = ['click', 'mouseenter', 'mouseleave', 'keydown', 'submit', 'focus', 'blur'];
  events.forEach((evt) => {
    const handler = (target as any)?.[`on${evt}`];
    if (handler) eventListeners.push(evt);
  });

  const framework = detectFramework();
  const projectRoot = window.location.origin;

  return {
    element: {
      html,
      computedStyles,
      classNames,
      id: id || undefined,
      hierarchy,
      eventListeners,
    },
    context: {
      url: window.location.href,
      framework,
      projectRoot,
    },
  };
}

function detectFramework(): 'react' | 'vue' | 'svelte' | 'unknown' {
  const scripts = Array.from(document.scripts);

  // React: dev indicator (fiber container) or react scripts/jsx
  const rootEl = document.querySelector('#root') as any;
  const reactRoot = rootEl && (rootEl.__reactContainer || rootEl._reactRootContainer);
  const hasReactScripts = scripts.some(
    (s) =>
      s.src.includes('react') ||
      s.innerHTML.includes('React.createElement') ||
      s.innerHTML.includes('jsx')
  );
  if (reactRoot || hasReactScripts) return 'react';

  // Vue
  if (
    scripts.some(
      (s) =>
        s.src.includes('vue') ||
        s.innerHTML.includes('Vue.createApp') ||
        s.innerHTML.includes('createApp')
    )
  )
    return 'vue';
  if (document.querySelector('[data-v-app]')) return 'vue';

  // Svelte
  if (scripts.some((s) => s.src.includes('svelte') || s.innerHTML.includes('Svelte'))) return 'svelte';
  if (document.querySelector('[data-svelte]')) return 'svelte';

  return 'unknown';
}

// Exposed for direct/unit-test invocation.
export { captureElementContext, detectFramework };
