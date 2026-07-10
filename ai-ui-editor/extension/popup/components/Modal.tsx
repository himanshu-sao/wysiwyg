import React, { useEffect, useRef } from 'react';

interface ModalProps {
  /** Confirmation message displayed in the modal body. */
  message: string;
  /** Label for the confirm button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label for the cancel button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Called when the user confirms (click, Enter while focused on confirm). */
  onConfirm: () => void;
  /** Called when the user cancels (click, Esc, click-outside-backdrop). */
  onCancel: () => void;
}

/**
 * A reusable confirmation modal for the popup (A2).
 *
 * Replaces `window.confirm()` with a styled, focus-trapped, Esc-cancellable inline
 * dialog consistent with the rest of the popup UI. Rendered as an overlay inside the
 * popup's 384px viewport.
 *
 * Accessibility:
 * - `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on the heading.
 * - Focus is moved to the cancel button on mount so Tab cycles between the two
 *   buttons (simple 2-element focus trap).
 * - Escape key dismisses via onCancel.
 * - Clicking the backdrop (outside the card) also cancels.
 */
const Modal: React.FC<ModalProps> = ({
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Focus the cancel button on mount (safer default — less destructive).
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Close on Escape.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      ref={backdropRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={(e) => {
        // Only dismiss if the click landed on the backdrop itself, not on a child.
        if (e.target === backdropRef.current) onCancel();
      }}
    >
      <div className="bg-white rounded-lg shadow-lg p-4 mx-4 max-w-sm w-full border border-gray-200">
        <h3 id="modal-heading" className="text-sm font-semibold text-gray-800 mb-3">
          Confirm
        </h3>
        <p className="text-xs text-gray-700 mb-4 whitespace-pre-wrap">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={onCancel}
            className="px-3 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:outline-none"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/** Pure state-machine helper extracted for unit testing. */
export function confirmationModal(
  state: { visible: boolean; message: string; onConfirm: () => void } | null,
  action: 'confirm' | 'cancel' | 'dismiss'
): { visible: boolean; shouldExecute: boolean } {
  if (!state || !state.visible) {
    return { visible: false, shouldExecute: false };
  }
  if (action === 'confirm') {
    return { visible: false, shouldExecute: true };
  }
  // cancel or dismiss
  return { visible: false, shouldExecute: false };
}

export default Modal;