import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-gray-100 text-gray-700',
        positive: 'bg-emerald-50 text-emerald-700',
        negative: 'bg-red-50 text-red-700',
        warning: 'bg-amber-50 text-amber-800',
        info: 'bg-blue-50 text-blue-700',
        rose: 'bg-rose-50 text-rose-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
