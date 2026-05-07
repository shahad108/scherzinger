import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { MarginTabs } from '@/features/margin-cockpit/components/MarginTabs';
import type { MarginTabs as MarginTabsType } from '@/types';

const tabs: MarginTabsType = {
  cross: { description: 'Cross', infoPanel: [], rows: [], footerNote: 'note', tabFooterText: 'cross footer' },
  leak:  { description: 'Leak',  infoPanel: [], rows: [], tabFooterText: 'leak footer' },
  seg:   { description: 'Seg',   infoPanel: [], subPanes: [
    { id: 'family', label: 'By family', headers: ['x'], rows: [], storyHtml: '' },
    { id: 'tier',   label: 'By tier',   headers: ['x'], rows: [], storyHtml: '' },
    { id: 'size',   label: 'By size',   headers: ['x'], rows: [], storyHtml: '' },
    { id: 'region', label: 'By region', headers: ['x'], rows: [], storyHtml: '' },
  ], tabFooterText: 'seg footer' },
  erode: { description: 'Erode', infoPanel: [], rows: [], cycleNote: '', cycleButtonLabel: 'go', tabFooterText: 'erode footer' },
  cust:  { description: 'Cust',  infoPanel: [], rows: [], tabFooterText: 'cust footer' },
};

describe('MarginTabs', () => {
  it('renders the active pane on initial mount', () => {
    render(
      <MemoryRouter>
        <MarginTabs tabs={tabs} activeTab="cross" onTabChange={() => {}} activeSegTab="family" onSegTabChange={() => {}} />
      </MemoryRouter>
    );
    expect(screen.getByText('cross footer')).toBeInTheDocument();
  });

  it('emits onTabChange when a non-active tab is clicked', () => {
    let active = 'cross';
    const onTabChange = (t: string) => { active = t; };
    render(
      <MemoryRouter>
        <MarginTabs tabs={tabs} activeTab={active} onTabChange={onTabChange} activeSegTab="family" onSegTabChange={() => {}} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('tab', { name: /SKU Margin Leakage/i }));
    expect(active).toBe('leak');
  });
});
