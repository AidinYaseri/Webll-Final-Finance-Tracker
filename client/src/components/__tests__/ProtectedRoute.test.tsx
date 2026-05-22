import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ProtectedRoute } from '../ProtectedRoute';
import { AuthContext } from '../../context/AuthContext';

describe('ProtectedRoute', () => {
  it('shows loading when auth is loading', () => {
    render(
      <AuthContext.Provider value={{ user: null, isLoading: true, login: async () => {}, register: async () => {}, logout: async () => {} }}>
        <ProtectedRoute>
          <div>Secret</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Loading...')).toBeTruthy();
  });

  it('renders children when user exists', () => {
    render(
      <AuthContext.Provider value={{ user: { user_id: 1, username: 'a', email: 'a' }, isLoading: false, login: async () => {}, register: async () => {}, logout: async () => {} }}>
        <ProtectedRoute>
          <div>Secret</div>
        </ProtectedRoute>
      </AuthContext.Provider>
    );

    expect(screen.getByText('Secret')).toBeTruthy();
  });
});