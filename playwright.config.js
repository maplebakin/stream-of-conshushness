import { defineConfig, devices } from '@playwright/test';

const startServer = process.env.BROWSER_SMOKE_START_SERVER === '1';
const defaultFrontendURL = startServer ? 'http://127.0.0.1:5174' : 'http://127.0.0.1:5173';
const baseURL = process.env.E2E_BASE_URL || defaultFrontendURL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: startServer
    ? {
        command: 'concurrently -k -s first "PORT=3100 CLIENT_ORIGIN=http://127.0.0.1:5174 node server.js" "VITE_API_PROXY_TARGET=http://127.0.0.1:3100 npm --prefix frontend run dev -- --host 127.0.0.1 --port 5174 --strictPort --force"',
        url: baseURL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
});
