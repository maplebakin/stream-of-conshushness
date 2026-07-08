import { expect, test } from '@playwright/test';

const runBrowserSmoke = process.env.RUN_BROWSER_SMOKE === '1';
const defaultApiBase = process.env.BROWSER_SMOKE_START_SERVER === '1'
  ? 'http://127.0.0.1:3100'
  : 'http://127.0.0.1:3000';
const apiBase = process.env.E2E_API_BASE || defaultApiBase;
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

function daysInUTCMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0, 12)).getUTCDate();
}

function expectedOrdinalDateFromToday(day) {
  const base = new Date(`${torontoISODate()}T12:00:00Z`);
  let year = base.getUTCFullYear();
  let month = base.getUTCMonth();
  const baseDay = base.getUTCDate();

  if (day < baseDay || day > daysInUTCMonth(year, month)) {
    for (let offset = 1; offset <= 12; offset += 1) {
      const candidateMonth = month + offset;
      const candidateYear = year + Math.floor(candidateMonth / 12);
      const normalizedMonth = candidateMonth % 12;
      if (day <= daysInUTCMonth(candidateYear, normalizedMonth)) {
        year = candidateYear;
        month = normalizedMonth;
        break;
      }
    }
  }

  return [
    year,
    String(month + 1).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-');
}

async function waitForMongo(request) {
  await expect.poll(async () => {
    const health = await request.get(`${apiBase}/health`);
    if (!health.ok()) return false;
    const healthJson = await health.json();
    return healthJson.mongoReady === true;
  }, {
    message: `Browser smoke requires a connected MongoDB test database at ${apiBase}.`,
    timeout: 30_000,
  }).toBe(true);
}

async function registerDisposableUser(page, request, label) {
  await waitForMongo(request);
  const stamp = Date.now();
  const username = `browser_smoke_${label}_${stamp}`;
  const email = `${username}@example.com`;

  await page.goto('/register');
  await page.getByLabel('Username').fill(username);
  await page.getByLabel(/Email/).fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByLabel('Confirm').fill(password);
  await page.getByRole('button', { name: /create account/i }).click();

  await expect(page.getByRole('heading', { name: 'Stream', exact: true })).toBeVisible();
}

test('Stream entry can be reviewed into a task on the correct day', async ({ page, request }) => {
  const tomorrowISO = torontoISODate(1);

  await registerDisposableUser(page, request, 'task');

  await page
    .getByPlaceholder('Capture a thought, task, idea, appointment, or thing to remember...')
    .fill('I need to call the dentist tomorrow.');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByText('I need to call the dentist tomorrow.')).toBeVisible();

  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Review Inbox' })).toBeVisible();

  const suggestion = page
    .locator('article')
    .filter({ hasText: `suggested due ${tomorrowISO}` });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByLabel('Title')).toHaveValue(/call the dentist/i);
  await expect(suggestion.getByText(`suggested due ${tomorrowISO}`)).toBeVisible();
  await suggestion.getByRole('button', { name: /^Accept$/ }).click();
  await expect(
    page.getByLabel('Recently accepted review items').getByText(/Accepted "Call the dentist"/i)
  ).toBeVisible();

  await page.goto(`/day/${tomorrowISO}`);
  await expect(page.getByRole('heading', { name: /What needs attention now/i })).toBeVisible();
  await expect(page.getByText('Call the dentist').first()).toBeVisible();
});

test('Stream ordinal visit plan appears on the expected day agenda', async ({ page, request }) => {
  const expectedDate = expectedOrdinalDateFromToday(13);

  await registerDisposableUser(page, request, 'calendar');

  await page
    .getByPlaceholder('Capture a thought, task, idea, appointment, or thing to remember...')
    .fill("I'm going to visit my mom on the 13th.");
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByText("I'm going to visit my mom on the 13th.")).toBeVisible();

  await page.goto(`/day/${expectedDate}`);
  await expect(page.getByRole('heading', { name: /What needs attention now/i })).toBeVisible();
  await expect(page.getByText(/Visit my mom/i).first()).toBeVisible();
});
