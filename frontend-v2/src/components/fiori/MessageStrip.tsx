import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Severity } from '@/types';

interface MessageStripProps {
  severity: Severity;
  children: ReactNode;
  closable?: boolean;
  className?: string;
}

const map = {
  info: { Icon: Info, bg: 'bg-blue-50', text: 'text-blue-800', border: 'border-blue-200' },
  success: {
    Icon: CheckCircle2,
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
  },
  warning: {
    Icon: AlertTriangle,
    bg: 'bg-amber-50',
    text: 'text-amber-900',
    border: 'border-amber-200',
  },
  error: { Icon: XCircle, bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
} as const;

export function MessageStrip({ severity, children, closable, className }: MessageStripProps) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const { Icon, bg, text, border } = map[severity];
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border px-4 py-2.5 text-sm',
        bg,
        text,
        border,
        className,
      )}
      role="status"
    >
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {closable && (
        <button onClick={() => setOpen(false)} className="shrink-0 opacity-70 hover:opacity-100">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
