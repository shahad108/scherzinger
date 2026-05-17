// Pricing Studio v3 / Phase 11 — keyboard shortcut tests.

import { fireEvent, render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useStudioKeyboardShortcuts } from '../useStudioKeyboardShortcuts';

function Harness(props: Parameters<typeof useStudioKeyboardShortcuts>[0]) {
  useStudioKeyboardShortcuts(props);
  return <input data-testid="text-input" />;
}

describe('useStudioKeyboardShortcuts', () => {
  it('fires j → onNextSku', () => {
    const onNextSku = vi.fn();
    render(<Harness onNextSku={onNextSku} />);
    fireEvent.keyDown(window, { key: 'j' });
    expect(onNextSku).toHaveBeenCalledTimes(1);
  });

  it('fires k → onPrevSku', () => {
    const onPrevSku = vi.fn();
    render(<Harness onPrevSku={onPrevSku} />);
    fireEvent.keyDown(window, { key: 'k' });
    expect(onPrevSku).toHaveBeenCalledTimes(1);
  });

  it('fires cmd+s → onSave', () => {
    const onSave = vi.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('fires ctrl+enter only when publish drawer is open', () => {
    const onConfirmPublish = vi.fn();
    const { rerender } = render(
      <Harness onConfirmPublish={onConfirmPublish} isPublishOpen={false} />,
    );
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onConfirmPublish).not.toHaveBeenCalled();

    rerender(<Harness onConfirmPublish={onConfirmPublish} isPublishOpen={true} />);
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onConfirmPublish).toHaveBeenCalledTimes(1);
  });

  it('fires a → onOpenActionCenter', () => {
    const onOpenActionCenter = vi.fn();
    render(<Harness onOpenActionCenter={onOpenActionCenter} />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(onOpenActionCenter).toHaveBeenCalledTimes(1);
  });

  it('fires ? → onOpenCheatSheet', () => {
    const onOpenCheatSheet = vi.fn();
    render(<Harness onOpenCheatSheet={onOpenCheatSheet} />);
    fireEvent.keyDown(window, { key: '?' });
    expect(onOpenCheatSheet).toHaveBeenCalledTimes(1);
  });

  it('skips single-key shortcuts when typing in an input', () => {
    const onNextSku = vi.fn();
    const { getByTestId } = render(<Harness onNextSku={onNextSku} />);
    const input = getByTestId('text-input') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'j' });
    expect(onNextSku).not.toHaveBeenCalled();
  });
});
