// P1.5-2: DevTools history panel broadcast payloads.
//
// The DevTools history panel (`extension/devtools/DevToolsPanel.tsx`) listens
// for `edit-applied` / `edit-undone` messages and persists an edit history to
// localStorage. These two pure helpers build the broadcast payloads the popup
// emits on apply/undo success. They live in `shared/` (like `applyDiff` and
// `resolveApplyBase`) so the broadcast contract is unit-testable without
// mounting the React popup — the test (`__tests__/panelHistory.test.ts`) pins
// the payload shape and the stable edit id the panel dedupes on.
//
// Why the popup emits (not background.ts): the popup is the actor that knows
// WHICH option was applied and whether it succeeded. Background's `send-to-server`
// handler is a generic {endpoint, body} relay with no notion of apply-vs-undo;
// co-locating the broadcast with the success it announces keeps that knowledge
// where it already lives. The broadcast uses `chrome.runtime.sendMessage` (the
// same channel background uses), so the panel — registered via
// `chrome.runtime.onMessage` in the devtools page — receives it identically
// regardless of which context emits it.

import type { EditOption, ElementContext, ExtensionMessage } from './types';

// Build the `edit-applied` broadcast the panel records as a new HistoryEntry.
// `option.id` is the stable per-edit id (set by the AI in the edit response);
// the panel reads `message.data.id` and dedupes/keys on it.
export function editAppliedPayload(
  option: EditOption,
  instruction: string,
  element: ElementContext | undefined
): ExtensionMessage {
  return {
    type: 'edit-applied',
    data: {
      id: option.id,
      element: element ?? {
        html: '',
        classNames: [],
      },
      instruction,
      file: option.file,
      diff: option.diff,
    },
  };
}

// Build the `edit-undone` broadcast the panel uses to mark an entry undone.
// `id` is the edit id last broadcast by `editAppliedPayload`; the panel maps
// it back to the stored HistoryEntry (see DevToolsPanel.tsx edit-undone branch).
export function editUndonePayload(id: string): ExtensionMessage {
  return {
    type: 'edit-undone',
    data: { id },
  };
}
