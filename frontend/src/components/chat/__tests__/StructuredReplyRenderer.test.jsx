import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import StructuredReplyRenderer from '../StructuredReplyRenderer';

describe('StructuredReplyRenderer (compact)', () => {
  it('renders narrative in full mode', () => {
    const { container } = render(
      <StructuredReplyRenderer
        blocks={[{ type: 'narrative', text: 'hello world' }]}
        finalized
      />
    );
    expect(container.textContent).toContain('hello world');
  });

  it('renders narrative in compact mode', () => {
    const { container } = render(
      <StructuredReplyRenderer
        blocks={[{ type: 'narrative', text: 'hello world' }]}
        finalized
        compact
      />
    );
    expect(container.textContent).toContain('hello world');
  });

  it('hides action_plan in compact mode', () => {
    const blocks = [
      { type: 'narrative', text: 'before' },
      { type: 'action_plan', actions: [{ title: 'Do a thing', priority: 'high' }] },
      { type: 'narrative', text: 'after' },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized compact />
    );
    expect(container.textContent).toContain('before');
    expect(container.textContent).toContain('after');
    expect(container.textContent).not.toContain('Do a thing');
    expect(container.textContent).not.toContain('HIGH');
  });

  it('renders action_plan in full mode', () => {
    const blocks = [
      { type: 'action_plan', actions: [{ title: 'Do a thing', priority: 'high' }] },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized />
    );
    expect(container.textContent).toContain('Do a thing');
  });

  it('hides report_download in compact mode', () => {
    const blocks = [
      { type: 'narrative', text: 'lead' },
      { type: 'report_download', title: 'Weekly Report', scope: 'reply', defaultFormat: 'pdf' },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized compact />
    );
    expect(container.textContent).toContain('lead');
    expect(container.textContent).not.toContain('Weekly Report');
  });

  it('renders report_download in full mode', () => {
    const blocks = [
      { type: 'report_download', title: 'Weekly Report', scope: 'reply', defaultFormat: 'pdf' },
    ];
    const { container } = render(
      <StructuredReplyRenderer blocks={blocks} finalized />
    );
    expect(container.textContent).toContain('Weekly Report');
  });
});
