// Create a context menu on right-click
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-ui-editor',
    title: 'Edit with AI',
    contexts: ['all'],
  });
});

// Listen for clicks on the context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ai-ui-editor' && tab?.id) {
    // Execute content script to capture element context
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: captureElementContext,
    }, (results) => {
      if (results?.[0]?.result) {
        chrome.runtime.sendMessage({
          type: 'element-selected',
          data: results[0].result,
        });
      }
    });
  }
});

// Function to capture element context (runs in page context)
function captureElementContext(event?: MouseEvent) {
  const target = event?.target as HTMLElement || document.elementFromPoint(
    (event as MouseEvent).clientX,
    (event as MouseEvent).clientY
  ) as HTMLElement;
  if (!target) return null;

  // Capture outerHTML
  const html = target.outerHTML;

  // Capture computed styles
  const computedStyles: Record<string, string> = {};
  const styles = window.getComputedStyle(target);
  for (let i = 0; i < styles.length; i++) {
    const prop = styles[i];
    computedStyles[prop] = styles.getPropertyValue(prop);
  }

  // Capture class names
  const classNames = Array.from(target.classList);

  // Capture ID
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
    // Add index if there are multiple siblings with the same selector
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

  // Capture event listeners (approximate)
  const eventListeners: string[] = [];
  const events = ['click', 'mouseenter', 'mouseleave', 'keydown', 'submit', 'focus', 'blur'];
  events.forEach((event) => {
    const handler = (target as any)?.[`on${event}`];
    if (handler) eventListeners.push(event);
    // Check for React event handlers
    if ((target as any)._reactEventHandlers) {
      const handlers = (target as any)._reactEventHandlers;
      if (handlers?.[event]) eventListeners.push(event);
    }
  });

  // Detect project framework
  const framework = detectFramework();

  // Get project root (current URL origin)
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

  // Check for React scripts
  const reactScripts = scripts.filter((s) =>
    s.src.includes('react') || s.innerHTML.includes('React.createElement')
  );
  if (reactScripts.length > 0) return 'react';

  // Check for Vue scripts
  const vueScripts = scripts.filter((s) =>
    s.src.includes('vue') || s.innerHTML.includes('Vue.createApp')
  );
  if (vueScripts.length > 0) return 'vue';

  // Check for Svelte
  const svelteScripts = scripts.filter((s) =>
    s.src.includes('svelte') || s.innerHTML.includes('Svelte')
  );
  if (svelteScripts.length > 0) return 'svelte';

  // Check for data attributes
  if (document.querySelector('[data-reactroot]') || document.querySelector('[data-reactid]')) return 'react';
  if (document.querySelector('[data-v-app]') || document.querySelector('[data-v-]')) return 'vue';
  if (document.querySelector('[data-svelte]')) return 'svelte';

  return 'unknown';
}
