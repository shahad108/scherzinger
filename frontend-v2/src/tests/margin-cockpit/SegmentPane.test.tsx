import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SegmentPane } from '@/features/margin-cockpit/components/panes/SegmentPane';
import type { MarginTabs } from '@/types';

const seg: MarginTabs['seg'] = {
  description: 'Slice',
  infoPanel: [],
  subPanes: [
    { id: 'family', label: 'By family', headers: ['Fam','Rev'], rows: [{ label: 'Shafts', cells: ['€3.4M'] }], storyHtml: '<b>Shafts dominate</b>' },
    { id: 'tier',   label: 'By tier',   headers: ['Tier','Rev'], rows: [{ label: 'Strategic', tier: 'A', cells: ['€799K'] }], storyHtml: '' },
    { id: 'size',   label: 'By size',   headers: ['x'], rows: [], storyHtml: '' },
    { id: 'region', label: 'By region', headers: ['x'], rows: [], storyHtml: '', caveatHtml: '<b>Note:</b> regional vs commodity' },
  ],
  tabFooterText: 'seg footer',
};

describe('SegmentPane', () => {
  it('renders the active sub-pane and switches on click', () => {
    const onSegTabChange = vi.fn();
    render(<SegmentPane pane={seg} activeSegTab="family" onSegTabChange={onSegTabChange} />);
    expect(screen.getByText('Shafts')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'By tier' }));
    expect(onSegTabChange).toHaveBeenCalledWith('tier');
  });
});
