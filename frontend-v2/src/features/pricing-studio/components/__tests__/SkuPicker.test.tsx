// Pricing Studio v3 / Phase 6 — SkuPicker batch-mode tests.

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { SkuPicker, type SkuPickerMode } from '../SkuPicker';
import type {
  FilterDef,
  SkuListEntry,
  ToggleDef,
} from '@/types/studio';

const skus: SkuListEntry[] = [
  {
    aid: 'AID-1',
    margin: '12%',
    marginTone: 'lo',
    productLine: 'Frame',
    cluster: 'BKAGG',
    meta: 'spare',
    clusterChip: 'BKAGG · n=412',
    clusterTone: 'hi',
    flag: 'all',
    tag: 'STALE',
    tagTone: 'stale',
    locked: false,
    isNew: false,
  },
  {
    aid: 'AID-2',
    margin: '22%',
    marginTone: 'mid',
    productLine: 'Cap',
    cluster: 'BKAGG',
    meta: 'spare',
    clusterChip: 'BKAGG · n=212',
    clusterTone: 'hi',
    flag: 'all',
    tag: 'STALE',
    tagTone: 'stale',
    locked: false,
    isNew: false,
  },
  {
    aid: 'AID-3',
    margin: '34%',
    marginTone: 'hi',
    productLine: 'Frame',
    cluster: 'BKAES',
    meta: 'main',
    clusterChip: 'BKAES · n=128',
    clusterTone: 'mid',
    flag: 'all',
    tag: 'STALE',
    tagTone: 'stale',
    locked: false,
    isNew: false,
  },
];

const filters: FilterDef[] = [
  { id: 'all', label: 'All' },
];
const toggles: ToggleDef[] = [
  { id: 'hide-locked', label: 'Hide locked', defaultActive: false },
  { id: 'new-skus', label: 'New SKUs', defaultActive: false },
];

// Tiny controlled wrapper so mode + selectedAids round-trip the way the
// real Studio page wires them.
function Harness({
  onBuildBatch,
  initialMode = 'single',
}: {
  onBuildBatch?: (aids: string[]) => void;
  initialMode?: SkuPickerMode;
}) {
  const [mode, setMode] = useState<SkuPickerMode>(initialMode);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState('AID-1');
  return (
    <SkuPicker
      skus={skus}
      filters={filters}
      toggles={toggles}
      selectedAid={active}
      onSelect={setActive}
      mode={mode}
      onModeChange={setMode}
      selectedAids={selected}
      onToggleAid={(a) =>
        setSelected((prev) =>
          prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a],
        )
      }
      onBuildBatch={(a) => onBuildBatch?.(a)}
    />
  );
}

describe('SkuPicker — Phase 6 Batch mode', () => {
  it('renders the Single/Batch mode toggle', () => {
    render(<Harness />);
    expect(screen.getByTestId('sku-picker-mode-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('sku-picker-mode-single')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByTestId('sku-picker-mode-batch')).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });

  it('reveals checkboxes when Batch is selected', () => {
    render(<Harness />);
    // No checkbox in single mode.
    expect(
      screen.queryByTestId('sku-picker-checkbox-AID-1'),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('sku-picker-mode-batch'));

    expect(screen.getByTestId('sku-picker-checkbox-AID-1')).toBeInTheDocument();
    expect(screen.getByTestId('sku-picker-checkbox-AID-2')).toBeInTheDocument();
    expect(screen.getByTestId('sku-picker-checkbox-AID-3')).toBeInTheDocument();
  });

  it('disables "Build batch" until ≥ 2 SKUs selected', () => {
    const onBuild = vi.fn();
    render(<Harness onBuildBatch={onBuild} />);
    fireEvent.click(screen.getByTestId('sku-picker-mode-batch'));

    const btn = screen.getByTestId('sku-picker-build-batch');
    expect(btn).toBeDisabled();

    // 1 selected → still disabled.
    fireEvent.click(
      screen.getByTestId('sku-picker-checkbox-AID-1').querySelector('input')!,
    );
    expect(btn).toBeDisabled();

    // 2 selected → enabled.
    fireEvent.click(
      screen.getByTestId('sku-picker-checkbox-AID-2').querySelector('input')!,
    );
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(onBuild).toHaveBeenCalledWith(['AID-1', 'AID-2']);
  });

  it('shows the "Selected: N SKUs" pill that tracks the count', () => {
    render(<Harness />);
    fireEvent.click(screen.getByTestId('sku-picker-mode-batch'));

    const pill = screen.getByTestId('sku-picker-batch-summary');
    expect(pill.textContent ?? '').toMatch(/Selected:\s*0/);

    fireEvent.click(
      screen.getByTestId('sku-picker-checkbox-AID-1').querySelector('input')!,
    );
    expect(pill.textContent ?? '').toMatch(/Selected:\s*1/);
    fireEvent.click(
      screen.getByTestId('sku-picker-checkbox-AID-3').querySelector('input')!,
    );
    expect(pill.textContent ?? '').toMatch(/Selected:\s*2/);
  });
});
