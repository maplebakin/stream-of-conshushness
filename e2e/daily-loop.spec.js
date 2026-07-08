import { expect, test } from '@playwright/test';

const runBrowserSmoke = process.env.RUN_BROWSER_SMOKE === '1';
const apiBase = process.env.E2E_API_BASE || 'http://127.0.0.1:3000';
const password = 'SmokePass123!';

test.skip(
  !runBrowserSmoke,
  'Set RUN_BROWSER_SMOKE=1 with a Mongo-backed local app to run the browser smoke test.'
);

function torontoISODate(offsetDays = 0) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

test('Stream entry can be reviewed into a task on the correct day', async ({ page, request }) => {
  const health = await request.get(`${apiBase}/health`);
  expect(health.ok(), `Expected API health at ${apiBase}/health`).toBeTruthy();
  const healthJson = await health.json();
  expect(healthJson.mongoReady, 'Browser smoke requires a connected MongoDB test database.').toBeTruthy();

  const stamp = Date.now();
  const username = `browser_smoke_${stamp}`;
  const email = `${username}@example.com`;
  const tomorrowISO = torontoISODate(1);

  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Confirm').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: 'Stream' })).toBeVisible();

  await page
    .getByPlaceholder('Capture a thought, task, idea, appointment, or thing to remember...')
    .fill('I need to call the dentist tomorrow.');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByText('I need to call the dentist tomorrow.')).toBeVisible();

  await page.getByRole('link', { name: /Review Inbox/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Review Inbox' })).toBeVisible();

  const suggestion = page
    .locator('article')
    .filter({ has: page.getByDisplayValue(/call the dentist/i) });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByText(`suggested due ${tomorrowISO}`)).toBeVisible();
  await suggestion.getByRole('button', { name: /^Accept$/ }).click();
  await expect(page.getByText(/Accepted "Call the dentist"/i)).toBeVisible();

  await page.goto(`/day/${tomorrowISO}`);
  await expect(page.getByRole('heading', { name: /What needs attention now/i })).toBeVisible();
  await expect(page.getByText('Call the dentist').first()).toBeVisible();
});
