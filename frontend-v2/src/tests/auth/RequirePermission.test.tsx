import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RequirePermission } from '@/features/auth/RequirePermission';
import { useAuthStore, type MeUser } from '@/stores/authStore';

const FRANK: MeUser = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'frank@scherzinger.de',
  name: 'Frank Keller',
  ui_persona: 'frank',
  roles: ['analyst'],
  permissions: ['view.action_center', 'act.start_ab_test'],
  features: ['ab_test'],
};

describe('RequirePermission', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null, isLoading: false });
  });

  it('renders children when permission granted', () => {
    useAuthStore.setState({ user: FRANK, isLoading: false });
    render(
      <RequirePermission name="act.start_ab_test">
        <button>Start A/B</button>
      </RequirePermission>,
    );
    expect(screen.getByRole('button', { name: 'Start A/B' })).toBeInTheDocument();
  });

  it('renders fallback when permission missing', () => {
    useAuthStore.setState({ user: FRANK, isLoading: false });
    render(
      <RequirePermission name="admin.users" fallback={<span>denied</span>}>
        <button>Manage users</button>
      </RequirePermission>,
    );
    expect(screen.queryByRole('button', { name: 'Manage users' })).toBeNull();
    expect(screen.getByText('denied')).toBeInTheDocument();
  });

  it('renders fallback when no user', () => {
    useAuthStore.setState({ user: null, isLoading: false });
    render(
      <RequirePermission name="view.action_center" fallback={<span>anon</span>}>
        <button>Should not render</button>
      </RequirePermission>,
    );
    expect(screen.queryByRole('button', { name: 'Should not render' })).toBeNull();
    expect(screen.getByText('anon')).toBeInTheDocument();
  });
});
