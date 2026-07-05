// DevTools panel entry point - creates the panel and loads the React UI
chrome.devtools.panels.create(
  'AI UI Editor',
  'icons/icon.svg',
  'devtools/panel.html',
  () => {
    console.log('[AI UI Editor] DevTools panel created');
  }
);