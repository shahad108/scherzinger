import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from '@/components/ui/Button';
import { fmt } from '@/lib/format';

describe('Phase 0 smoke', () => {
  it('Button renders children', () => {
    render(<Button>Hello</Button>);
    expect(screen.getByRole('button', { name: 'Hello' })).toBeInTheDocument();
  });

  it('format.eur formats euros in German locale', () => {
    expect(fmt.eur(184000)).toMatch(/184\.000/);
  });
});
