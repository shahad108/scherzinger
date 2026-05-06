import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { ObjectStatusKind } from '@/types';

interface ObjectStatusProps {
  kind: ObjectStatusKind;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const toneMap: Record<ObjectStatusKind, string> = {
  positive: 'text-emerald-700',
  negative: 'text-red-700',
  warning: 'text-amber-800',
  neutral: 'text-gray-600',
};

export function ObjectStatus({ kind, icon, children, className }: ObjectStatusProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 text-xs font-medium', toneMap[kind], className)}
    >
      {icon}
      {children}
    </span>
  );
}
