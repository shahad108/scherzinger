import * as RadixSeparator from '@radix-ui/react-separator';
import { cn } from '@/lib/cn';

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof RadixSeparator.Root>) {
  return (
    <RadixSeparator.Root
      orientation={orientation}
      className={cn(
        'bg-[var(--border-subtle)]',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}
