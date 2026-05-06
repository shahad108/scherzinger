import * as RadixTooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/cn';

export const TooltipProvider = RadixTooltip.Provider;
export const Tooltip = RadixTooltip.Root;
export const TooltipTrigger = RadixTooltip.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof RadixTooltip.Content>) {
  return (
    <RadixTooltip.Portal>
      <RadixTooltip.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-gray-50 shadow-[var(--shadow-3)]',
          className,
        )}
        {...props}
      />
    </RadixTooltip.Portal>
  );
}
