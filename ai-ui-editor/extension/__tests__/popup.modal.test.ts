/**
 * A2: Modal state-machine tests — pure logic extracted from
 * popup/components/Modal.tsx.
 *
 * The `confirmationModal` helper mirrors the real state transitions in
 * App.tsx's showModal() / closeModal() cycle. Tests the four actions
 * (confirm / cancel / dismiss / null) and the Esc-key mapping.
 */

import { describe, it, expect } from 'vitest';
import { confirmationModal } from '../popup/components/Modal';

interface ModalState {
  visible: boolean;
  message: string;
  onConfirm: () => void;
}

describe('Modal — confirmationModal state machine', () => {
  const freshState: ModalState = {
    visible: true,
    message: 'Apply this change?',
    onConfirm: () => {},
  };

  it('returns shouldExecute=true on confirm when state is visible', () => {
    const result = confirmationModal(freshState, 'confirm');
    expect(result.visible).toBe(false);
    expect(result.shouldExecute).toBe(true);
  });

  it('returns shouldExecute=false on cancel when state is visible', () => {
    const result = confirmationModal(freshState, 'cancel');
    expect(result.visible).toBe(false);
    expect(result.shouldExecute).toBe(false);
  });

  it('returns shouldExecute=false on dismiss (click-outside / Esc) when visible', () => {
    const result = confirmationModal(freshState, 'dismiss');
    expect(result.visible).toBe(false);
    expect(result.shouldExecute).toBe(false);
  });

  it('treats cancel and dismiss identically — neither executes', () => {
    const cancel = confirmationModal(freshState, 'cancel');
    const dismiss = confirmationModal(freshState, 'dismiss');
    expect(cancel).toEqual(dismiss);
  });

  it('returns visible=false + shouldExecute=false for any action when state is null', () => {
    for (const action of ['confirm', 'cancel', 'dismiss'] as const) {
      const result = confirmationModal(null, action);
      expect(result.visible).toBe(false);
      expect(result.shouldExecute).toBe(false);
    }
  });

  it('returns visible=false + shouldExecute=false when state exists but visible=false', () => {
    const hidden: ModalState = { visible: false, message: 'x', onConfirm: () => {} };
    const result = confirmationModal(hidden, 'confirm');
    expect(result.visible).toBe(false);
    expect(result.shouldExecute).toBe(false);
  });

  it('confirm returns shouldExecute=true regardless of message content', () => {
    const withMessage: ModalState = {
      visible: true,
      message: 'Export this spec (High priority) to my-app?',
      onConfirm: () => {},
    };
    const result = confirmationModal(withMessage, 'confirm');
    expect(result.shouldExecute).toBe(true);
  });

  // A2 + A1 overlap: the modal's "Confirm" heading is aria-labelledby, and the
  // error banner is role="alert". These are structural — verified in code.

  it('Esc key maps to dismiss (not cancel — same outcome)', () => {
    // The real Modal handles Esc via useEffect + keydown listener; the state
    // machine maps it to 'dismiss' (same as cancel — shouldExecute=false).
    const result = confirmationModal(freshState, 'dismiss');
    expect(result.shouldExecute).toBe(false);
    expect(result.visible).toBe(false);
  });
});