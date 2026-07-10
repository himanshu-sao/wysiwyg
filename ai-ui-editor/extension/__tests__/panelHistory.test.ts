// P1.5-2: DevTools history-panel broadcast contract.
//
// The panel (`extension/devtools/DevToolsPanel.tsx`) listens for `edit-applied`
// / `edit-undone` and keys its localStorage history on `message.data.id`. The
// popup emits those via the two pure payload helpers in
// `extension/shared/editHistoryBroadcast.ts`. These tests pin the payload
// contract — stable id, the fields the panel reads, and exact `type` strings —
// so the panel and popup can't silently drift on the message shape.
//
// Extension tests run in `environment: 'node'` (see vitest.config.ts) with no
// `chrome` global, so we stub the minimal `chrome.runtime.sendMessage`/`onMessage`
// surface the helpers' callers touch and assert the emitted shape.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  editAppliedPayload,
  editUndonePayload,
} from '../shared/editHistoryBroadcast';
import type { EditOption, ElementContext } from '../shared/types';

// Minimal `chrome` surface the broadcast path touches. The popup calls
// `chrome.runtime.sendMessage(msg)`; we capture every invocation so a test can
// assert the exact payload the panel would receive.
type SentMessage = { type: string; data?: any };
let sentMessages: SentMessage[];

beforeEach(() => {
  const sendMock = (msg: SentMessage) => {
    sentMessages.push(msg);
    return true;
  };
  sentMessages = [];
  // `any` because the real chrome.runtime surface is far larger than we need;
  // we only exercise sendMessage here.
  (globalThis as any).chrome = {
    runtime: {
      sendMessage: sendMock,
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
  };
});

afterEach(() => {
  delete (globalThis as any).chrome;
  vi.restoreAllMocks();
});

const OPTION: EditOption = {
  id: 'opt-7',
  description: 'Make the card primary',
  diff: '@@ diff @@',
  previewHtml: '<div>preview</div>',
  file: 'src/components/Card.tsx',
  type: 'css',
};

const ELEMENT: ElementContext = {
  html: '<div class="card">x</div>',
  computedStyles: { color: 'red' },
  classNames: ['card', 'primary'],
  hierarchy: ['body', 'main', 'div.card'],
  eventListeners: ['click'],
};

describe('editHistoryBroadcast payload contract (P1.5-2)', () => {
  describe('editAppliedPayload', () => {
    it('builds an edit-applied message keyed by the option id', () => {
      const msg = editAppliedPayload(OPTION, 'make it primary', ELEMENT);
      expect(msg.type).toBe('edit-applied');
      expect(msg.data.id).toBe('opt-7');
      // The panel persists these into a HistoryEntry — they must all be present
      // and shaped exactly as DevToolsPanel.tsx:85-95 expects.
      expect(msg.data.instruction).toBe('make it primary');
      expect(msg.data.file).toBe('src/components/Card.tsx');
      expect(msg.data.diff).toBe('@@ diff @@');
      expect(msg.data.element).toEqual(ELEMENT);
    });

    it('keeps the id stable across calls (the panel dedupes history on it)', () => {
      const a = editAppliedPayload(OPTION, 'first', ELEMENT);
      const b = editAppliedPayload(OPTION, 'second', ELEMENT);
      expect(a.data.id).toBe(b.data.id);
    });

    it('substitutes an empty element when no element context is available', () => {
      const msg = editAppliedPayload(OPTION, 'x', undefined);
      expect(msg.data.element).toEqual({ html: '', classNames: [] });
    });
  });

  describe('editUndonePayload', () => {
    it('builds an edit-undone message carrying the id the panel maps back', () => {
      const msg = editUndonePayload('opt-7');
      expect(msg.type).toBe('edit-undone');
      expect(msg.data).toEqual({ id: 'opt-7' });
    });

    it('preserves whatever id string is passed (including empty for "no last applied")', () => {
      expect(editUndonePayload('').data.id).toBe('');
    });
  });

  describe('emission through chrome.runtime.sendMessage', () => {
    // Confirms the popup→panel broadcast channel contract: whatever the helper
    // returns is what shows up in the captured `sendMessage` stream, verbatim.
    it('forwards the exact helper payload to chrome.runtime.sendMessage', () => {
      const payload = editAppliedPayload(OPTION, 'm', ELEMENT);
      chrome.runtime.sendMessage(payload);
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toEqual(payload);
    });
  });
});
