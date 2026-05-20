import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
      width,
      height,
    }: {
      children?: ReactNode;
      width?: string | number;
      height?: string | number;
    }) =>
      createElement(
        'div',
        {
          style: {
            width: typeof width === 'number' ? `${width}px` : (width ?? '100%'),
            height: typeof height === 'number' ? `${height}px` : (height ?? '320px'),
            minWidth: '320px',
            minHeight: '240px',
          },
        },
        children,
      ),
  };
});

// jsdom doesn't implement scrollIntoView; stub it for components that call it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
