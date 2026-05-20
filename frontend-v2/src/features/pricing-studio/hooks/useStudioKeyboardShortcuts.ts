// Pricing Studio v3 / Phase 11 — global keyboard shortcuts for the studio.
//
// The hook installs a single window-level keydown listener so it composes
// cleanly with React StrictMode's double-effect runs. All shortcuts skip when
// the user is typing in an input/textarea/contenteditable region so we never
// hijack normal text editing.

import { useEffect } from 'react';

export interface StudioKeyboardHandlers {
  /** Move to the next SKU in the picker (j). */
  onNextSku?: () => void;
  /** Move to the previous SKU in the picker (k). */
  onPrevSku?: () => void;
  /** Save the current proposal (cmd/ctrl+s). */
  onSave?: () => void;
  /**
   * Confirm publish (cmd/ctrl+enter). Only fires when `isPublishOpen` is true,
   * so the shortcut is scoped to the open PublishConfirmationDrawer.
   */
  onConfirmPublish?: () => void;
  /** Whether the publish drawer is currently open. */
  isPublishOpen?: boolean;
  /** Open the Action Center (a). */
  onOpenActionCenter?: () => void;
  /** Open the cheat sheet (?). */
  onOpenCheatSheet?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}

export function useStudioKeyboardShortcuts(handlers: StudioKeyboardHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Always allow cmd/ctrl combos even inside inputs (save/publish).
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key.toLowerCase() === 's') {
        if (handlers.onSave) {
          e.preventDefault();
          handlers.onSave();
          return;
        }
      }

      if (isMod && e.key === 'Enter') {
        if (handlers.isPublishOpen && handlers.onConfirmPublish) {
          e.preventDefault();
          handlers.onConfirmPublish();
          return;
        }
      }

      // Single-key shortcuts: skip when typing.
      if (isTypingTarget(e.target)) return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;

      switch (e.key) {
        case 'j':
          if (handlers.onNextSku) {
            e.preventDefault();
            handlers.onNextSku();
          }
          break;
        case 'k':
          if (handlers.onPrevSku) {
            e.preventDefault();
            handlers.onPrevSku();
          }
          break;
        case 'a':
          if (handlers.onOpenActionCenter) {
            e.preventDefault();
            handlers.onOpenActionCenter();
          }
          break;
        case '?':
          if (handlers.onOpenCheatSheet) {
            e.preventDefault();
            handlers.onOpenCheatSheet();
          }
          break;
        default:
          break;
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handlers]);
}

export interface KeyboardShortcutEntry {
  keys: string[];
  description: string;
}

export const STUDIO_SHORTCUTS: KeyboardShortcutEntry[] = [
  { keys: ['j'], description: 'Next SKU' },
  { keys: ['k'], description: 'Previous SKU' },
  { keys: ['⌘', 'S'], description: 'Save proposal' },
  { keys: ['⌘', '⏎'], description: 'Confirm publish (when drawer open)' },
  { keys: ['a'], description: 'Open Action Center' },
  { keys: ['?'], description: 'Show keyboard shortcuts' },
];
