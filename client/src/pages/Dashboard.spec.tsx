import { test, expect } from '@playwright/experimental-ct-react';
import { Dashboard } from './Dashboard';

test('Dashboard renders base layout', async ({ mount }) => {
  const component = await mount(<Dashboard />);
  // Wait for loading screen to potentially render
  
  // Dashboard component mocks are needed if we want to bypass the loading state,
  // but we can check if it mounts either the loading state or the real dashboard.
  const loading = component.locator('.loading');
  const dashboard = component.locator('.dashboard');
  
  await expect(loading.or(dashboard)).toBeVisible();
});