import * as RadixDialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface DrawerProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  side?: 'right' | 'left';
  width?: number | string;
  children: React.ReactNode;
  className?: string;
  /** Accessibility title for screen readers; visually hidden. Defaults to "Dialog". */
  title?: string;
}

export function Drawer({
  open,
  onOpenChange,
  side = 'right',
  width = 480,
  children,
  className,
  title = 'Dialog',
}: DrawerProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--surface-overlay)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </RadixDialog.Overlay>
            <RadixDialog.Content asChild>
              <motion.aside
                className={cn(
                  'fixed top-0 z-50 h-full bg-white shadow-[var(--shadow-4)]',
                  side === 'right' ? 'right-0' : 'left-0',
                  className,
                )}
                style={{ width }}
                initial={{ x: side === 'right' ? '100%' : '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: side === 'right' ? '100%' : '-100%' }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
              >
                <RadixDialog.Close className="absolute right-4 top-4 rounded-md p-1.5 text-gray-500 hover:bg-gray-100">
                  <X size={16} />
                </RadixDialog.Close>
                <RadixDialog.Title className="sr-only">{title}</RadixDialog.Title>
                {children}
              </motion.aside>
            </RadixDialog.Content>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
