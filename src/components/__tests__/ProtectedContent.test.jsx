// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    loading: false,
    user: { uid: 'pending-user' },
    canAccess: () => false,
    isAdmin: false,
    isPending: true,
    isDisabled: false
  })
}));

import ProtectedContent from '../ProtectedContent.jsx';

describe('ProtectedContent', () => {
  it('renders pending approval messaging', () => {
    render(
      <ProtectedContent pageId="dashboard">
        <div>Secret</div>
      </ProtectedContent>
    );

    expect(screen.getByText(/awaiting approval/i)).toBeTruthy();
  });
});
