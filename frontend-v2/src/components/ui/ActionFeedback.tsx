import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Drawer } from '@/components/ui/Drawer';
import { MessageStrip } from '@/components/fiori/MessageStrip';
import { useActionFeedbackStore } from '@/stores/actionFeedbackStore';

export function ActionFeedback() {
  const toasts = useActionFeedbackStore((s) => s.toasts);
  const dismissToast = useActionFeedbackStore((s) => s.dismissToast);
  const drawer = useActionFeedbackStore((s) => s.drawer);
  const closeDrawer = useActionFeedbackStore((s) => s.closeDrawer);

  return (
    <>
      <div className="fixed right-5 top-20 z-[80] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <MessageStrip
            key={t.id}
            severity={t.severity}
            className="bg-white shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-start gap-2">
              <span className="flex-1">{t.message}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                className="rounded p-0.5 opacity-70 hover:bg-black/5 hover:opacity-100"
                onClick={() => dismissToast(t.id)}
              >
                <X size={13} />
              </button>
            </div>
          </MessageStrip>
        ))}
      </div>

      <Drawer open={!!drawer} onOpenChange={(open) => !open && closeDrawer()} width={460}>
        {drawer && (
          <div className="flex h-full flex-col p-6 pt-14">
            <RadixDialog.Title className="font-display text-xl font-bold tracking-tight text-[var(--ink)]">
              {drawer.title}
            </RadixDialog.Title>
            {drawer.description && (
              <RadixDialog.Description className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                {drawer.description}
              </RadixDialog.Description>
            )}
            {drawer.items && (
              <div className="mt-6 divide-y divide-[var(--hairline)] rounded-xl border border-[var(--hairline)]">
                {drawer.items.map((item) => (
                  <div key={item.label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 p-3 text-sm">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {item.label}
                    </div>
                    <div className="font-medium text-[var(--ink-2)]">{item.value}</div>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="mt-auto rounded-lg bg-[var(--ink)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-black"
              onClick={closeDrawer}
            >
              {drawer.primaryLabel ?? 'Done'}
            </button>
          </div>
        )}
      </Drawer>
    </>
  );
}
