// Pricing Studio v3 / Phase 11 — Keyboard shortcuts cheat sheet modal.
//
// Triggered by the `?` shortcut. Renders inside the existing Radix Dialog
// primitive so it inherits focus-trap + escape-to-close behaviour for free.

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/Dialog';
import {
  STUDIO_SHORTCUTS,
  type KeyboardShortcutEntry,
} from '../hooks/useStudioKeyboardShortcuts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shortcuts?: KeyboardShortcutEntry[];
}

export function KeyboardCheatSheet({
  open,
  onOpenChange,
  shortcuts = STUDIO_SHORTCUTS,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="keyboard-cheat-sheet">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Speed up your workflow. Shortcuts pause while typing in inputs.
        </DialogDescription>
        <table className="mt-4 w-full text-sm">
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.description} className="border-t border-stone-200">
                <td className="py-2 pr-4 text-stone-700">{s.description}</td>
                <td className="py-2 text-right">
                  {s.keys.map((k, i) => (
                    <span key={`${s.description}-${i}`} className="inline-flex">
                      {i > 0 && <span className="mx-1 text-stone-400">+</span>}
                      <kbd className="rounded border border-stone-300 bg-stone-50 px-1.5 py-0.5 font-mono text-xs text-stone-800">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
