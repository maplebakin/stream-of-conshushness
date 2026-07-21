import { expect, test } from '@playwright/test';
import 'dotenv/config';
import mongoose from 'mongoose';
import Appointment from '../models/Appointment.js';
import Cluster from '../models/Cluster.js';
import Entry from '../models/Entry.js';
import Goal from '../models/Goal.js';
import ResearchSubject from '../models/ResearchSubject.js';
import Ripple from '../models/Ripple.js';
import Section from '../models/Section.js';
import SuggestedTask from '../models/SuggestedTask.js';
import Task from '../models/Task.js';

const runBrowserSmoke = process.env.RUN_BROWSER_SMOKE === '1';
const defaultApiBase = process.env.BROWSER_SMOKE_START_SERVER === '1'
  ? 'http://127.0.0.1:3100'
  : 'http://127.0.0.1:3000';
const apiBase = process.env.E2E_API_BASE || defaultApiBase;
const password = 'SmokePass123!';
const PNG = Buffer.from('89504e470d0a1a0a00000000', 'hex');

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

function nextWeekdayISO(weekdayIndex) {
  const anchor = new Date(`${torontoISODate()}T12:00:00Z`);
  const day = anchor.getUTCDay();
  const daysToNextMonday = day === 0 ? 1 : 8 - day;
  const monday = new Date(anchor);
  monday.setUTCDate(anchor.getUTCDate() + daysToNextMonday);
  const result = new Date(monday);
  const offset = weekdayIndex === 0 ? 6 : weekdayIndex - 1;
  result.setUTCDate(monday.getUTCDate() + offset);
  return result.toISOString().slice(0, 10);
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

async function registerApiUser(request, label) {
  await waitForMongo(request);
  const username = `browser_api_${label}_${Date.now()}`;
  const response = await request.post(`${apiBase}/api/register`, {
    data: {
      username,
      email: `${username}@example.com`,
      password,
    },
  });
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.token).toEqual(expect.any(String));
  expect(body.user?.id).toEqual(expect.any(String));
  return body;
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

test.afterAll(async () => {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

test('Stream entry can be reviewed into a task on the correct day', async ({ page, request }) => {
  const tomorrowISO = torontoISODate(1);

  await registerDisposableUser(page, request, 'task');

  await page
    .getByPlaceholder('Capture a thought, task, or reminder…')
    .fill('I need to call the dentist tomorrow.');
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByText('I need to call the dentist tomorrow.')).toBeVisible();

  await page.goto('/review');
  await expect(page.getByRole('heading', { name: 'Review Inbox' })).toBeVisible();

  const suggestion = page
    .locator('article')
    .filter({ hasText: /call the dentist/i });
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByLabel('Title')).toHaveValue(/call the dentist/i);
  await expect(suggestion.getByLabel('Due date')).toHaveValue(tomorrowISO);
  await suggestion.getByLabel('Title').fill('Call my dentist');
  await suggestion.getByRole('button', { name: /^Accept$/ }).click();
  const acceptedItems = page.getByLabel('Recently accepted review items');
  await expect(acceptedItems.getByText(/Accepted "Call my dentist"/i)).toBeVisible();
  await expect(acceptedItems.getByText(/Task created for/)).toBeVisible();
  await expect(acceptedItems.getByRole('link', { name: 'Open due day' })).toBeVisible();
  await expect(acceptedItems.getByRole('button', { name: 'Move to today' })).toBeVisible();

  await page.goto(`/day/${tomorrowISO}`);
  await expect(page.getByRole('heading', { name: /What matters next/i })).toBeVisible();
  await expect(page.getByText('Call my dentist').first()).toBeVisible();
});

test('Stream ordinal visit plan appears on the expected day agenda', async ({ page, request }) => {
  const expectedDate = expectedOrdinalDateFromToday(13);

  await registerDisposableUser(page, request, 'calendar');

  await page
    .getByPlaceholder('Capture a thought, task, or reminder…')
    .fill("I'm going to visit my mom on the 13th.");
  await page.getByRole('button', { name: 'Create entry' }).click();
  await expect(page.getByText("I'm going to visit my mom on the 13th.")).toBeVisible();

  await page.goto('/review');
  const calendarSuggestion = page
    .locator('article')
    .filter({ hasText: /Visit my mom/i });
  await expect(calendarSuggestion).toBeVisible();
  await calendarSuggestion.getByRole('button', { name: /^Keep$/ }).click();
  await expect(page.getByLabel('Recently accepted review items').getByText(/Kept "Visit my mom"/i)).toBeVisible();

  await page.goto(`/day/${expectedDate}`);
  await expect(page.getByRole('heading', { name: /What matters next/i })).toBeVisible();
  const visitItem = page.getByRole('listitem').filter({ hasText: /Visit my mom/i });
  await expect(visitItem).toBeVisible();
  await expect(visitItem.getByText('Automation')).toBeVisible();
  await expect(visitItem.getByText(/From entry on \d{4}-\d{2}-\d{2}/)).toBeVisible();
  await expect(visitItem.getByRole('link', { name: 'Open source entry' })).toBeVisible();
});

test('mobile authenticated hierarchy keeps primary actions in the first viewport', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await registerDisposableUser(page, request, 'mobile_ia');

  const header = page.getByRole('banner');
  const headerBox = await header.boundingBox();
  expect(headerBox?.height).toBeLessThanOrEqual(64);
  await expect(page.getByRole('link', { name: 'Stream', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await expect(page.getByPlaceholder('Capture a thought, task, or reminder…')).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Create entry' })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await page.getByRole('link', { name: 'Today', exact: true }).click();
  const nowSummary = page.locator('.compact-action-summary');
  await expect(page.getByRole('heading', { name: 'What matters next?' })).toBeVisible();
  await expect(page.getByText('Nothing needs your attention right now')).toBeVisible();
  await expect(page.getByText('Carry-forward is off')).not.toBeVisible();
  expect((await nowSummary.boundingBox())?.height).toBeLessThanOrEqual(210);
  await expect(page.getByRole('heading', { name: 'Due Today' })).toBeInViewport();

  const dayOptions = page.getByLabel('Day options');
  await expect(dayOptions).toBeVisible();
  await dayOptions.click();
  await expect(page.getByRole('button', { name: /Automatic carry-forward: Off/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Carry earlier tasks to today now/i })).not.toBeVisible();
  await dayOptions.click();

  await page.getByRole('link', { name: 'Calendar', exact: true }).click();
  const monthGrid = page.locator('.calendar-grid');
  const horizon = page.getByRole('heading', { name: 'On the Horizon' });
  await expect(monthGrid).toBeVisible();
  await expect(horizon).toBeVisible();
  expect((await monthGrid.boundingBox())?.y).toBeLessThan((await horizon.boundingBox())?.y);

  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByText('Verification code', { exact: true })).not.toBeVisible();
  await page.getByRole('link', { name: 'Stream', exact: true }).click();
  await page.getByRole('button', { name: 'Open account menu' }).click();
  await expect(page.getByRole('menuitem', { name: /Sign out/i })).toBeVisible();
});

test('a grouped work schedule can be accepted and safely reconciled', async ({ page, request }) => {
  const monday = nextWeekdayISO(1);
  const wednesday = nextWeekdayISO(3);
  const thursday = nextWeekdayISO(4);
  const friday = nextWeekdayISO(5);

  await registerDisposableUser(page, request, 'work_schedule');
  const composer = page.getByPlaceholder('Capture a thought, task, or reminder…');
  await composer.fill(
    'My schedule was released. Next week I work Monday 10–3, Wednesday 12–8, and Friday 7:50–1:50.'
  );
  await page.getByRole('button', { name: 'Create entry' }).click();

  await page.goto('/review');
  const initialSchedule = page.locator('article.schedule-review').filter({ hasText: /Work schedule/i });
  await expect(initialSchedule).toBeVisible();
  await expect(initialSchedule.locator('fieldset')).toHaveCount(3);
  await expect(initialSchedule.getByText(/Wednesday/i).first()).toBeVisible();
  await initialSchedule.getByRole('button', { name: 'Accept all' }).click();
  await expect(page.getByLabel('Recently accepted review items').getByText(/Schedule updated/i)).toBeVisible();

  for (const date of [monday, wednesday, friday]) {
    await page.goto(`/day/${date}`);
    await expect(page.locator('.agenda-item').filter({
      has: page.getByText('Work', { exact: true }),
    })).toBeVisible();
  }

  await page.goto('/');
  await composer.fill(
    'Schedule updated. Next week I don’t work Wednesday anymore. It’s Thursday 11–7:30 now.'
  );
  await page.getByRole('button', { name: 'Create entry' }).click();
  await page.goto('/review');

  const updateSchedule = page.locator('article.schedule-review').filter({ hasText: /Work schedule/i });
  await expect(updateSchedule).toBeVisible();
  await expect(updateSchedule.getByText('Remove this shift')).toBeVisible();
  await expect(updateSchedule.getByText('Add this shift')).toBeVisible();
  await updateSchedule.getByRole('button', { name: 'Accept all' }).click();

  await page.goto(`/day/${wednesday}`);
  await expect(page.locator('.agenda-item').filter({
    has: page.getByText('Work', { exact: true }),
  })).toHaveCount(0);
  await page.goto(`/day/${thursday}`);
  await expect(page.locator('.agenda-item').filter({
    has: page.getByText('Work', { exact: true }),
  })).toBeVisible();
});

test('owner-scoped records and private uploads stay isolated between two users', async ({ request }) => {
  const ownerA = await registerApiUser(request, 'owner_a');
  const ownerB = await registerApiUser(request, 'owner_b');
  const headersA = bearer(ownerA.token);
  const headersB = bearer(ownerB.token);
  const sentinel = `PRIVATE_OWNER_A_SENTINEL_${Date.now()}`;
  const date = torontoISODate(1);

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  }

  const entry = await Entry.create({ userId: ownerA.user.id, date, text: sentinel });
  const [task, goal, section, cluster, appointment] = await Promise.all([
    Task.create({ userId: ownerA.user.id, title: sentinel, dueDate: date }),
    Goal.create({ userId: ownerA.user.id, title: sentinel }),
    Section.collection.insertOne({
      ownerId: new mongoose.Types.ObjectId(ownerA.user.id),
      userId: new mongoose.Types.ObjectId(ownerA.user.id),
      key: `private-${Date.now()}`,
      title: sentinel,
      slug: `private-${Date.now()}`,
      type: 'research',
      public: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).then(({ insertedId }) => ({ _id: insertedId })),
    // Include the retired fields so this isolation smoke remains runnable
    // against local databases that have not yet dropped the legacy compound
    // userId/key index. Application reads still use the current ownerId/slug.
    Cluster.collection.insertOne({
      ownerId: new mongoose.Types.ObjectId(ownerA.user.id),
      userId: new mongoose.Types.ObjectId(ownerA.user.id),
      key: `private-${Date.now()}`,
      name: sentinel,
      slug: `private-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).then(({ insertedId }) => ({ _id: insertedId })),
    Appointment.create({ userId: ownerA.user.id, title: sentinel, date }),
  ]);
  const researchSubject = await ResearchSubject.create({
    userId: ownerA.user.id,
    sectionId: section._id,
    name: sentinel,
    slug: 'private-subject',
  });
  const ripple = await Ripple.create({
    userId: ownerA.user.id,
    entryId: entry._id,
    dateKey: date,
    text: sentinel,
    type: 'suggestedTask',
  });
  const suggestion = await SuggestedTask.create({
    userId: ownerA.user.id,
    sourceRippleId: ripple._id,
    sourceEntryId: entry._id,
    title: sentinel,
    status: 'pending',
  });

  const uploadResponse = await request.post(`${apiBase}/api/upload`, {
    headers: headersA,
    multipart: {
      profilePicture: {
        name: 'private-owner-a.png',
        mimeType: 'image/png',
        buffer: PNG,
      },
    },
  });
  expect(uploadResponse.status()).toBe(201);
  const uploaded = await uploadResponse.json();

  const forbiddenReads = await Promise.all([
    request.get(`${apiBase}/api/entries/${entry._id}`, { headers: headersB }),
    request.get(`${apiBase}/api/sections/${section._id}`, { headers: headersB }),
    request.get(`${apiBase}/api/clusters/${cluster._id}`, { headers: headersB }),
    request.get(`${apiBase}/api/research/${section._id}/subjects/${researchSubject._id}`, { headers: headersB }),
    request.get(`${apiBase}${uploaded.url}`, { headers: headersB }),
  ]);
  for (const response of forbiddenReads) expect(response.status()).toBe(404);

  const forbiddenMutations = await Promise.all([
    request.patch(`${apiBase}/api/entries/${entry._id}`, { headers: headersB, data: { text: 'stolen' } }),
    request.delete(`${apiBase}/api/entries/${entry._id}`, { headers: headersB }),
    request.patch(`${apiBase}/api/tasks/${task._id}`, { headers: headersB, data: { title: 'stolen' } }),
    request.delete(`${apiBase}/api/tasks/${task._id}`, { headers: headersB }),
    request.patch(`${apiBase}/api/goals/${goal._id}`, { headers: headersB, data: { title: 'stolen' } }),
    request.delete(`${apiBase}/api/goals/${goal._id}`, { headers: headersB }),
    request.patch(`${apiBase}/api/sections/${section._id}`, { headers: headersB, data: { title: 'stolen' } }),
    request.delete(`${apiBase}/api/sections/${section._id}`, { headers: headersB }),
    request.put(`${apiBase}/api/clusters/${cluster._id}`, { headers: headersB, data: { name: 'stolen' } }),
    request.delete(`${apiBase}/api/clusters/${cluster._id}`, { headers: headersB }),
    request.patch(`${apiBase}/api/research/${section._id}/subjects/${researchSubject._id}`, { headers: headersB, data: { name: 'stolen' } }),
    request.delete(`${apiBase}/api/research/${section._id}/subjects/${researchSubject._id}`, { headers: headersB }),
    request.put(`${apiBase}/api/suggested-tasks/${suggestion._id}/accept`, { headers: headersB, data: { title: 'stolen' } }),
    request.put(`${apiBase}/api/suggested-tasks/${suggestion._id}/reject`, { headers: headersB }),
    request.patch(`${apiBase}/api/appointments/${appointment._id}`, { headers: headersB, data: { title: 'stolen' } }),
    request.delete(`${apiBase}/api/appointments/${appointment._id}`, { headers: headersB }),
  ]);
  for (const response of forbiddenMutations) expect(response.status()).toBe(404);

  const ownerBLists = await Promise.all([
    request.get(`${apiBase}/api/entries?limit=500`, { headers: headersB }),
    request.get(`${apiBase}/api/tasks`, { headers: headersB }),
    request.get(`${apiBase}/api/goals`, { headers: headersB }),
    request.get(`${apiBase}/api/sections`, { headers: headersB }),
    request.get(`${apiBase}/api/clusters`, { headers: headersB }),
    request.get(`${apiBase}/api/suggested-tasks`, { headers: headersB }),
    request.get(`${apiBase}/api/appointments?from=${date}&to=${date}`, { headers: headersB }),
  ]);
  for (const response of ownerBLists) {
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain(sentinel);
  }
  const ownerBSearch = await request.get(
    `${apiBase}/api/search?q=${encodeURIComponent(sentinel)}`,
    { headers: headersB }
  );
  expect(ownerBSearch.ok()).toBe(true);
  expect((await ownerBSearch.json()).total).toBe(0);

  const ownerStillSeesEntry = await request.get(`${apiBase}/api/entries/${entry._id}`, { headers: headersA });
  expect(ownerStillSeesEntry.status()).toBe(200);
  expect(await ownerStillSeesEntry.text()).toContain(sentinel);
});
