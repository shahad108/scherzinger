// Playwright config — Phase 7 (forecast redesign v2).
//
// Note: the v2 dev server listens on 5174 (see vite.config.ts), not 5173 as
// the plan template suggested. We use the real dev-server port so the
// `webServer` block can reuse an already-running `npm run dev`.
//
// `reuseExistingServer: !process.env.CI` means: locally, if you have
// `npm run dev` already up, Playwright just connects; in CI it boots its
// own.

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
