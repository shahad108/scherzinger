// Pricing Studio v3 / Phase 3 — OptionMarginMicroWaterfall tests.

import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { OptionMarginMicroWaterfall } from '../OptionMarginMicroWaterfall';
import { renderWithLineage } from './test-utils';
import { optionMargin } from './fixtures-phase3';

describe('OptionMarginMicroWaterfall', () => {
  it('renders 5 rows (list / quoted / booked / invoiced / db2) with widths proportional to list', () => {
    renderWithLineage(<OptionMarginMicroWaterfall optionMargin={optionMargin()} />);
    const root = screen.getByTestId('option-margin-waterfall');
    const rows = root.querySelectorAll('[data-row-key]');
    expect(rows).toHaveLength(5);
    expect(rows[0].getAttribute('data-row-key')).toBe('list');
    expect(rows[1].getAttribute('data-row-key')).toBe('quoted');
    expect(rows[2].getAttribute('data-row-key')).toBe('booked');
    expect(rows[3].getAttribute('data-row-key')).toBe('invoiced');
    expect(rows[4].getAttribute('data-row-key')).toBe('db2');

    // List should be 100%; db2 should be 18% (db2=18 / list=100).
    const listBar = rows[0].querySelector('.ws-pocket-bar') as HTMLElement;
    const db2Bar = rows[4].querySelector('.ws-pocket-bar') as HTMLElement;
    expect(listBar.style.width).toBe('100%');
    expect(db2Bar.style.width).toBe('18%');
    // Pocket row gets the emerald accent class.
    expect(db2Bar.className).toContain('ws-pocket-bar--pocket');
  });

  it('displays "pocket X% of list" formatted as the integer percent of list', () => {
    renderWithLineage(<OptionMarginMicroWaterfall optionMargin={optionMargin()} />);
    const root = screen.getByTestId('option-margin-waterfall');
    // 18/100 = 18% — rendered as the bolded value inside the label.
    expect(root).toHaveTextContent(/pocket\s*18\s*%\s*of\s*list/i);
  });

  it('renders DataMissingBadge when optionMargin is null', () => {
    renderWithLineage(<OptionMarginMicroWaterfall optionMargin={null} />);
    expect(screen.getByTestId('option-margin-missing')).toBeInTheDocument();
    expect(screen.getByTestId('data-missing-badge')).toHaveTextContent(/cost data unavailable/i);
  });

  it('renders DataMissingBadge when list price is invalid (zero)', () => {
    renderWithLineage(
      <OptionMarginMicroWaterfall optionMargin={optionMargin({ list: '0' })} />,
    );
    expect(screen.getByTestId('option-margin-missing')).toBeInTheDocument();
  });

  it('renders the lineage button when lineage_ref is present', () => {
    renderWithLineage(<OptionMarginMicroWaterfall optionMargin={optionMargin()} />);
    expect(screen.getByTestId('lineage-button')).toBeInTheDocument();
  });
});
